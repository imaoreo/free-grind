/**
 * albumStore.ts — eager fetch-and-store of received albums into chatDb.
 *
 * As soon as an Album/ExpiringAlbum/ExpiringAlbumV2 message is seen, the
 * full album + every content item's bytes are downloaded and stored, so the
 * content survives the share expiring or its view-once limit being
 * exhausted server-side. Per-share viewability (remainingViews/isViewable)
 * is read from the sharing chat message's body by the caller — the album
 * API response itself doesn't carry that field, and a given album can be
 * re-shared multiple times with different expiry.
 */

import * as chatDb from "./chatDb";
import { fetchAndEncode, toDataUri } from "./mediaStore";
import { getMessageAlbumCoverUrl, getMessageAlbumId } from "../pages/app/chat/chatUtils";
import { ApiFunctionError } from "./apiHelpers";
import type { UiMessage } from "../types/chat-page";
import type { AlbumContentItem } from "../types/chat-page";
import type { AlbumDetailsResponse } from "../types/chat-service";
import type { StoredAlbumMedia } from "../types/chat-db";
import { appLog } from "../utils/logger";
import { isAutoDownloadMediaEnabled } from "../utils/mediaSettings";
import { limitChatDbBlobRead } from "../utils/chatDbBlobLimiter";

/**
 * Mirrors newly-downloaded album content into the device's Downloads
 * folder, if the user has opted in. Dynamically imported to avoid a
 * circular dependency — saveMedia.ts imports toDataUri from mediaStore.ts,
 * which this module also depends on.
 */
async function maybeAutoDownloadToDevice(
	base64: string,
	mimeType: string | null,
	contentType: string | null,
	conversationId: string | null,
): Promise<void> {
	if (!isAutoDownloadMediaEnabled()) {
		return;
	}
	const isVideo = (contentType ?? mimeType ?? "").toLowerCase().startsWith("video/");
	try {
		const { saveMediaBytesToDeviceSilent } = await import("./saveMedia");
		await saveMediaBytesToDeviceSilent(base64, mimeType ?? contentType, isVideo ? "video" : "image", conversationId);
	} catch (error) {
		appLog.warn("[album-store] auto-download to device failed", error);
	}
}

// Once a background refresh attempt confirms the server doesn't have this
// album/share anymore (404 once truly gone, 403 once the share is stopped —
// observed in practice as the actual response for a revoked share), stop
// re-requesting it for that *same* share message on every subsequent
// message pass this session — just keep serving whatever's cached. If the
// album gets shared again later, that arrives as a new chat message (new
// messageId, same albumId) — attemptedMessageIds below lets that one
// through for a fresh retry instead of being stuck skipped forever.
const knownGoneAlbumIds = new Set<number>();
const attemptedMessageIds = new Set<string>();
const GONE_STATUS_CODES = new Set([403, 404]);

// De-dupes concurrent refresh attempts for the same album — multiple
// message-arrival passes can land for the same share back to back, and
// without this each one fires its own request before the first one's
// catch block has a chance to populate knownGoneAlbumIds above.
const captureInFlight = new Map<number, Promise<void>>();

// Synchronous in-memory record of which albums are fully captured locally,
// so render code (which can't await a DB read) can show a cached album as
// open-able regardless of what the live message body currently says about
// its viewability/expiry. Populated as captures resolve (this session) and
// via an explicit hydration check the first time a given album is rendered.
const capturedAlbumIds = new Set<number>();
const albumCacheListeners = new Set<() => void>();
const albumCheckInFlight = new Map<number, Promise<void>>();
// Owner-profile → locally-known album ids, so "does this profile have an
// album in our local DB" (used to keep the profile carousel's album
// indicator sticky even after a share is revoked/expired) is a synchronous
// lookup instead of a DB round trip. Hydrated lazily per profile the same
// way capturedAlbumIds is hydrated lazily per album (see
// ensureProfileAlbumCacheChecked below).
const profileIdToAlbumIds = new Map<string, Set<number>>();
const profileAlbumCheckInFlight = new Map<string, Promise<void>>();

function addProfileAlbumMapping(profileId: string | null, albumId: number): void {
	if (!profileId) {
		return;
	}
	let ids = profileIdToAlbumIds.get(profileId);
	if (!ids) {
		ids = new Set();
		profileIdToAlbumIds.set(profileId, ids);
	}
	ids.add(albumId);
}
// The message bubble's cover image also comes straight from the live body
// (coverUrl/previewUrl) — once a share is stopped/exhausted/expired the
// server can drop that field entirely, which would otherwise make the
// cover disappear even though we have the actual image cached. Same
// in-memory pattern as mediaStore.ts's per-key cache.
const albumCoverCache = new Map<number, string>();

// Per-content-item thumbnail cache, keyed the same way as album_media's PK
// (`${albumId}:${contentId}`) — backs reply-quote thumbnails and "tapped
// photo" reaction bubbles for a *specific* item inside an album, as opposed
// to albumCoverCache above which only ever tracks item 0. Populated both by
// a full album capture (updateAlbumCacheState) and, when that never
// happened, by captureAlbumContentThumbFromMessage below.
const albumContentThumbCache = new Map<string, string>();
// De-dupes concurrent captureAlbumContentThumbFromMessage calls for the same item.
const contentThumbCaptureInFlight = new Set<string>();

function albumContentKey(albumId: number, contentId: number): string {
	return `${albumId}:${contentId}`;
}

/** Synchronous read of a single album content item's cached thumbnail, or null if not cached (yet). */
export function getCachedAlbumContentThumbUri(albumId: number, contentId: number): string | null {
	return albumContentThumbCache.get(albumContentKey(albumId, contentId)) ?? null;
}

function deriveCoverUri(media: StoredAlbumMedia[]): string | null {
	const first = media[0];
	if (!first) {
		return null;
	}
	const base64 = first.thumbDataBase64 ?? first.dataBase64;
	return base64 ? toDataUri(first.contentType, base64) : null;
}

/**
 * Updates the in-memory cache from whatever media rows we currently have
 * for this album. Cover caching is intentionally decoupled from "fully
 * captured" — if even one content item failed to download (network blip,
 * unusual content type, etc.) the album as a whole isn't "fully captured",
 * but the cover (content item 0) may well still have its bytes, and
 * there's no reason to let that be held hostage by an unrelated item.
 *
 * The album's own (clear) content thumbnail here is only a *fallback*
 * cover — captureAlbumPreviewFromMessage's blurred chat-bubble teaser is
 * the preferred source and must never be overwritten by this clear one.
 */
function updateAlbumCacheState(albumId: number, media: StoredAlbumMedia[]): void {
	if (!albumCoverCache.has(albumId)) {
		const cover = deriveCoverUri(media);
		if (cover) {
			albumCoverCache.set(albumId, cover);
		}
	}

	for (const item of media) {
		const base64 = item.thumbDataBase64 ?? item.dataBase64;
		if (base64) {
			albumContentThumbCache.set(item.contentId, toDataUri(item.contentType, base64));
		}
	}

	const fullyCaptured = media.length > 0 && media.every((m) => m.dataBase64);
	if (fullyCaptured) {
		capturedAlbumIds.add(albumId);
	}

	// Always notify, even if the computed state happens to be identical to
	// what's already cached (e.g. a re-share whose cover content is byte-
	// for-byte the same as before) — an extra render is cheap, whereas a
	// missed notification means the bubble is stuck showing stale state
	// until something else (e.g. reopening the thread) forces a re-render.
	if (media.length > 0) {
		for (const listener of albumCacheListeners) {
			listener();
		}
	}
}

/** Synchronous read: is this album fully captured locally right now? */
export function isAlbumCachedLocally(albumId: number): boolean {
	return capturedAlbumIds.has(albumId);
}

/**
 * Synchronous read: did a live API refresh for this album return 403/404
 * this session, meaning the share is revoked/gone server-side?
 * Used to immediately show a "no longer shared" badge in chat without
 * waiting for the next thread-messages poll to update isViewable.
 */
export function isAlbumKnownRevoked(albumId: number): boolean {
	return knownGoneAlbumIds.has(albumId);
}

/** Synchronous read of the cached cover image, or null if not cached (yet). */
export function getCachedAlbumCoverUri(albumId: number): string | null {
	return albumCoverCache.get(albumId) ?? null;
}

/** Subscribe to in-memory album-cache updates; returns an unsubscribe function. */
export function subscribeToAlbumCache(listener: () => void): () => void {
	albumCacheListeners.add(listener);
	return () => {
		albumCacheListeners.delete(listener);
	};
}

/** Synchronous read: has any album ever been captured locally for this owner profile? */
export function isAlbumCachedForProfile(profileId: string): boolean {
	const ids = profileIdToAlbumIds.get(profileId);
	return !!ids && ids.size > 0;
}

/** Synchronous read of the most recently updated locally-known album id for this profile, or null. */
export function getCachedAlbumIdForProfile(profileId: string): number | null {
	const ids = profileIdToAlbumIds.get(profileId);
	if (!ids || ids.size === 0) {
		return null;
	}
	// getAlbumsForOwnerProfile orders by updated_at DESC, and insertion order
	// below follows that, so the first id added is the most recently updated one.
	return ids.values().next().value ?? null;
}

/**
 * Checks chatDb for albums previously captured/cached for this owner profile,
 * once per session — mirrors ensureAlbumCacheChecked's per-album hydration,
 * just indexed by profile instead of by album id.
 */
export function ensureProfileAlbumCacheChecked(profileId: string): void {
	if (profileIdToAlbumIds.has(profileId) || profileAlbumCheckInFlight.has(profileId)) {
		return;
	}
	const run = (async () => {
		try {
			const albums = await chatDb.getAlbumsForOwnerProfile(profileId);
			if (albums.length > 0) {
				for (const album of albums) {
					addProfileAlbumMapping(profileId, Number(album.albumId));
				}
				for (const listener of albumCacheListeners) {
					listener();
				}
			}
		} catch (error) {
			appLog.warn(`[album-store] failed to check local album cache for profile ${profileId}`, error);
		} finally {
			profileAlbumCheckInFlight.delete(profileId);
		}
	})();
	profileAlbumCheckInFlight.set(profileId, run);
}

/**
 * Clears every local trace of an album — chatDb rows plus every in-memory
 * cache keyed by albumId — used when the user explicitly deletes a received
 * album from the shared-albums page. Safe to call regardless of whether the
 * share is still live server-side; the caller is responsible for revoking
 * that separately (removeAlbumShare) before/alongside calling this.
 */
export async function deleteLocalAlbum(albumId: number): Promise<void> {
	await chatDb.deleteAlbum(String(albumId)).catch((error) => {
		appLog.warn(`[album-store] failed to delete local album ${albumId}`, error);
	});
	capturedAlbumIds.delete(albumId);
	albumCoverCache.delete(albumId);
	knownGoneAlbumIds.delete(albumId);
	for (const ids of profileIdToAlbumIds.values()) {
		ids.delete(albumId);
	}
	for (const listener of albumCacheListeners) {
		listener();
	}
}

/**
 * Removes a locally-cached album if (and only if) it turns out to be one the
 * signed-in user owns — a one-time cleanup for rows written before
 * captureAlbumsForMessages started skipping own-sender albums, so already-
 * mis-captured own albums stop lingering in a conversation's received-albums
 * list after the fix ships.
 */
async function purgeIfOwnAlbum(albumId: number, userId: number): Promise<void> {
	try {
		const stored = await chatDb.getAlbum(String(albumId));
		if (stored?.ownerProfileId === String(userId)) {
			await deleteLocalAlbum(albumId);
		}
	} catch (error) {
		appLog.warn(`[album-store] failed to check/purge own album ${albumId}`, error);
	}
}

/**
 * Checks chatDb for a previously-captured album once per session (e.g. on
 * first render after an app restart, when the in-memory set above starts
 * empty, or simply re-opening an already-loaded thread before the next
 * capture pass has re-run). Safe to call repeatedly/concurrently — only
 * de-duped while a check is actually in flight, not "once ever", so a check
 * that ran too early (before a capture elsewhere finished) doesn't
 * permanently block re-checking later.
 */
export function ensureAlbumCacheChecked(albumId: number): void {
	if (capturedAlbumIds.has(albumId) || albumCheckInFlight.has(albumId)) {
		return;
	}
	const run = (async () => {
		try {
			// The blurred chat-bubble preview (preferred cover source) first.
			const album = await limitChatDbBlobRead(() => chatDb.getAlbum(String(albumId)));
			if (album?.previewCoverBase64 && !albumCoverCache.has(albumId)) {
				albumCoverCache.set(
					albumId,
					toDataUri(album.previewCoverMimeType, album.previewCoverBase64),
				);
				for (const listener of albumCacheListeners) {
					listener();
				}
			}

			const media = await limitChatDbBlobRead(() => chatDb.getAlbumMedia(String(albumId)));
			if (media.length > 0) {
				updateAlbumCacheState(albumId, media);
			}
		} catch (error) {
			appLog.warn(`[album-store] failed to check local cache for album ${albumId}`, error);
		} finally {
			albumCheckInFlight.delete(albumId);
		}
	})();
	albumCheckInFlight.set(albumId, run);
}

/**
 * Captures the chat bubble's blurred teaser preview from the sharing
 * message's own body (coverUrl/previewUrl) — distinct from, and preferred
 * over, the album's actual (clear) content thumbnails. Runs independently
 * of the full album refresh, since this source doesn't need the album API
 * at all and may still be capturable even when that's gated/gone.
 */
async function captureAlbumPreviewFromMessage(
	message: UiMessage,
	albumId: number,
): Promise<void> {
	const coverUrl = getMessageAlbumCoverUrl(message);
	if (!coverUrl) {
		return;
	}
	try {
		const fetched = await fetchAndEncode(coverUrl);
		if (!fetched) {
			return;
		}
		await chatDb.upsertAlbumPreviewCover(String(albumId), fetched.base64, fetched.mimeType);
		albumCoverCache.set(albumId, toDataUri(fetched.mimeType, fetched.base64));
		for (const listener of albumCacheListeners) {
			listener();
		}
	} catch (error) {
		appLog.warn(`[album-store] failed to capture preview cover for album ${albumId}`, error);
	}
}

/**
 * Seeds a single album content item's thumbnail from a reply/reaction
 * message's own `previewUrl` — for AlbumContentReply/AlbumContentReaction
 * messages, which reference one specific item inside an album that may
 * never have been captured as a whole (e.g. the sharing message isn't in
 * the loaded history). Without this, that thumbnail is only ever resolved
 * from the live signed preview URL, which the item can outlive.
 *
 * If the item was already captured via a full album share (album_media
 * already has bytes for it), this reuses those instead of re-downloading.
 * Fire-and-forget; safe to call repeatedly for the same item.
 */
export function captureAlbumContentThumbFromMessage(
	albumId: number,
	contentId: number,
	contentType: string | null,
	previewUrl: string | null,
): void {
	const key = albumContentKey(albumId, contentId);
	if (albumContentThumbCache.has(key) || contentThumbCaptureInFlight.has(key)) {
		return;
	}
	contentThumbCaptureInFlight.add(key);
	void (async () => {
		try {
			const existing = await limitChatDbBlobRead(() => chatDb.getAlbumMedia(String(albumId)));
			const row = existing.find((m) => m.contentId === key);
			const existingBase64 = row?.thumbDataBase64 ?? row?.dataBase64;
			if (existingBase64) {
				albumContentThumbCache.set(key, toDataUri(row?.contentType ?? contentType, existingBase64));
				for (const listener of albumCacheListeners) listener();
				return;
			}

			if (!previewUrl) {
				return;
			}
			const fetched = await fetchAndEncode(previewUrl);
			if (!fetched) {
				return;
			}
			await chatDb.upsertAlbumMedia({
				contentId: key,
				albumId: String(albumId),
				contentType: row?.contentType ?? contentType ?? fetched.mimeType,
				dataBase64: row?.dataBase64 ?? null,
				thumbDataBase64: fetched.base64,
				remainingViews: row?.remainingViews ?? null,
				isViewable: row?.isViewable ?? null,
			});
			albumContentThumbCache.set(key, toDataUri(fetched.mimeType, fetched.base64));
			for (const listener of albumCacheListeners) listener();
		} catch (error) {
			appLog.warn(`[album-store] failed to capture content thumb ${key}`, error);
		} finally {
			contentThumbCaptureInFlight.delete(key);
		}
	})();
}

export type CaptureAlbumParams = {
	albumId: number;
	albumName: string | null;
	content: AlbumContentItem[];
	ownerProfileId: string | null;
	conversationId: string | null;
	sharedViaMessageId: string | null;
	remainingViews: number | null;
	isViewable: boolean | null;
};

async function captureAlbumContent(
	albumId: number,
	item: AlbumContentItem,
	existing: StoredAlbumMedia | undefined,
	remainingViews: number | null,
	isViewable: boolean | null,
	folderKey: string | null,
): Promise<void> {
	const compositeId = `${albumId}:${item.contentId}`;
	try {
		if (existing?.dataBase64) {
			// Bytes already captured — just refresh the viewability metadata.
			await chatDb.upsertAlbumMedia({
				contentId: compositeId,
				albumId: String(albumId),
				contentType: existing.contentType ?? item.contentType,
				dataBase64: existing.dataBase64,
				thumbDataBase64: existing.thumbDataBase64,
				remainingViews,
				isViewable,
			});
			return;
		}

		const mainUrl = item.url || item.coverUrl;
		const thumbUrl = item.thumbUrl ?? null;

		const [main, thumb] = await Promise.all([
			mainUrl ? fetchAndEncode(mainUrl) : Promise.resolve(null),
			thumbUrl && thumbUrl !== mainUrl ? fetchAndEncode(thumbUrl) : Promise.resolve(null),
		]);

		await chatDb.upsertAlbumMedia({
			contentId: compositeId,
			albumId: String(albumId),
			contentType: item.contentType ?? main?.mimeType ?? null,
			dataBase64: main?.base64 ?? null,
			thumbDataBase64: thumb?.base64 ?? main?.base64 ?? null,
			remainingViews,
			isViewable,
		});

		if (main?.base64) {
			void maybeAutoDownloadToDevice(main.base64, main.mimeType, item.contentType, folderKey);
		}
	} catch (error) {
		appLog.warn(`[album-store] failed to capture album content ${compositeId}`, error);
	}
}

/** Eagerly downloads and stores every content item's bytes for an album. */
export async function captureAlbum(params: CaptureAlbumParams): Promise<void> {
	const {
		albumId,
		albumName,
		content,
		ownerProfileId,
		conversationId,
		sharedViaMessageId,
		remainingViews,
		isViewable,
	} = params;

	await chatDb.upsertAlbum({
		albumId: String(albumId),
		ownerProfileId,
		albumName,
		conversationId,
		sharedViaMessageId,
	});
	addProfileAlbumMapping(ownerProfileId, albumId);

	const existing = await chatDb.getAlbumMedia(String(albumId));
	const existingById = new Map(existing.map((m) => [m.contentId, m] as const));

	// conversationId is only resolved by matching against a locally-cached
	// conversation list (see SharedAlbumsPage.tsx/SharedAlbumsPanel.tsx),
	// which can miss older/archived chats — fall back to ownerProfileId
	// (always known) so auto-downloaded album content still lands in a
	// per-profile folder instead of a flat, unsplit one.
	const folderKey = conversationId ?? (ownerProfileId ? `profile-${ownerProfileId}` : null);

	await Promise.all(
		content.map((item) =>
			captureAlbumContent(
				albumId,
				item,
				existingById.get(`${albumId}:${item.contentId}`),
				remainingViews,
				isViewable,
				folderKey,
			),
		),
	);

	const captured = await chatDb.getAlbumMedia(String(albumId));
	if (captured.length > 0) {
		updateAlbumCacheState(albumId, captured);
	}
}

export type AlbumMessageInfo = {
	albumId: number;
	remainingViews: number | null;
	isViewable: boolean | null;
};

function getAlbumMessageInfo(message: UiMessage): AlbumMessageInfo | null {
	const isAlbumMessage =
		message.type === "Album" ||
		message.type === "ExpiringAlbum" ||
		message.type === "ExpiringAlbumV2";
	if (!isAlbumMessage) {
		if (typeof message.type === "string" && message.type.toLowerCase().includes("album")) {
			appLog.debug(
				`[album-store] message ${message.messageId} has an album-ish type "${message.type}" not in the recognized set — skipping`,
			);
		}
		return null;
	}

	const albumId = getMessageAlbumId(message);
	if (albumId == null) {
		appLog.debug(
			`[album-store] message ${message.messageId} is type "${message.type}" but has no extractable albumId — body=${JSON.stringify(message.body)}`,
		);
		return null;
	}

	const body = message.body as Record<string, unknown> | null | undefined;
	const isViewable = typeof body?.isViewable === "boolean" ? body.isViewable : null;
	const remainingViews =
		typeof body?.remainingViews === "number" ? body.remainingViews : null;

	return { albumId, remainingViews, isViewable };
}

async function captureAlbumFromMessageIfNeeded(
	info: AlbumMessageInfo,
	message: UiMessage,
	conversationId: string,
	getAlbum: (albumId: number) => Promise<AlbumDetailsResponse>,
): Promise<void> {
	if (knownGoneAlbumIds.has(info.albumId) && attemptedMessageIds.has(message.messageId)) {
		// Already confirmed gone for this exact share message — don't keep
		// re-requesting it on every reload/poll, just keep serving whatever's
		// cached. A *new* share message for the same album (different
		// messageId — i.e. shared with us again later) still falls through
		// below for a fresh retry.
		const cached = await chatDb.getAlbumMedia(String(info.albumId)).catch(() => []);
		if (cached.length > 0) {
			updateAlbumCacheState(info.albumId, cached);
		}
		return;
	}

	const existingRun = captureInFlight.get(info.albumId);
	if (existingRun) {
		return existingRun;
	}

	const run = (async () => {
		attemptedMessageIds.add(message.messageId);

		// The blurred teaser preview comes straight from this message's own
		// body, not the album API — capture it independently of (and before)
		// the full album refresh below, so it's available even if that
		// refresh fails (share gated/gone) and always reflects this latest
		// share's preview rather than a stale one from an older share.
		await captureAlbumPreviewFromMessage(message, info.albumId);

		try {
			// Always refresh from the live API first, even if we already have a
			// fully-captured copy — the owner can add more content to an album
			// after it was first shared, and we want to pick that up rather than
			// keep re-using a stale snapshot forever. captureAlbum reuses
			// already-downloaded bytes per content item and only fetches
			// genuinely new ones, so this doesn't re-download anything we
			// already have.
			const details = await getAlbum(info.albumId);
			knownGoneAlbumIds.delete(info.albumId);
			await captureAlbum({
				albumId: details.albumId,
				albumName: details.albumName,
				content: details.content,
				ownerProfileId: String(message.senderId),
				conversationId,
				sharedViaMessageId: message.messageId,
				remainingViews: info.remainingViews,
				isViewable: info.isViewable,
			});
		} catch (error) {
			if (error instanceof ApiFunctionError && GONE_STATUS_CODES.has(error.status)) {
				knownGoneAlbumIds.add(info.albumId);
			}
			// Live refresh failed (offline, share stopped/gone, conversation
			// archived/blocked) — fine as long as we already have a cached copy;
			// only worth logging if we don't have anything at all.
			const existing = await chatDb.getAlbumMedia(String(info.albumId)).catch(() => []);
			if (existing.length > 0) {
				updateAlbumCacheState(info.albumId, existing);
				return;
			}
			appLog.warn(
				`[album-store] failed to capture album from message ${message.messageId}`,
				error,
			);
		} finally {
			captureInFlight.delete(info.albumId);
		}
	})();

	captureInFlight.set(info.albumId, run);
	return run;
}

/**
 * Scans messages for Album/ExpiringAlbum/ExpiringAlbumV2 shares and eagerly
 * captures each one (fire-and-forget). Safe to call repeatedly for the same
 * messages — reuses already-downloaded bytes instead of re-fetching them.
 *
 * Skips albums the signed-in user shared themselves — that's the user's own
 * pre-existing album (managed permanently via My Albums), not something
 * "received" that needs a local offline copy, and attributing it to this
 * conversation would surface it in the chat's own received-albums list as if
 * it were the other participant's content.
 */
export function captureAlbumsForMessages(
	messages: UiMessage[],
	conversationId: string,
	getAlbum: (albumId: number) => Promise<AlbumDetailsResponse>,
	userId: number | null,
): void {
	const entries: { info: AlbumMessageInfo; message: UiMessage }[] = [];
	for (const message of messages) {
		if (userId != null && Number(message.senderId) === Number(userId)) {
			// Retroactive cleanup for albums a prior version of this function
			// already captured under the user's own senderId, before this
			// skip existed — purge them so they stop showing as "received".
			const info = getAlbumMessageInfo(message);
			if (info) {
				void purgeIfOwnAlbum(info.albumId, userId);
			}
			continue;
		}
		const info = getAlbumMessageInfo(message);
		if (info) {
			entries.push({ info, message });
		}
	}

	// Hydrate from chatDb immediately (fast, local-only) for every distinct
	// album referenced in this batch, so every message bubble sharing the
	// same album id shows consistent, already-cached state right away —
	// independent of (and well ahead of) the slower live-refresh capture
	// below, which still runs to pick up newly-added content/confirm gone.
	for (const albumId of new Set(entries.map((e) => e.info.albumId))) {
		ensureAlbumCacheChecked(albumId);
	}

	for (const { info, message } of entries) {
		void captureAlbumFromMessageIfNeeded(info, message, conversationId, getAlbum);
	}
}

/**
 * Caches an album's cover from the shared-albums page into chatDb, so the tile
 * remains visible even after the share expires. Intentionally fire-and-forget —
 * the caller doesn't need to await it.
 */
export async function cacheAlbumFromSharedPage(params: {
	albumId: number;
	albumName: string | null;
	ownerProfileId: number;
	conversationId: string | null;
	coverUrl: string | null;
}): Promise<void> {
	const { albumId, albumName, ownerProfileId, conversationId, coverUrl } = params;
	try {
		await chatDb.upsertAlbum({
			albumId: String(albumId),
			ownerProfileId: String(ownerProfileId),
			albumName,
			conversationId,
			sharedViaMessageId: null,
		});
		addProfileAlbumMapping(String(ownerProfileId), albumId);
		if (coverUrl && !albumCoverCache.has(albumId)) {
			const fetched = await fetchAndEncode(coverUrl);
			if (fetched) {
				await chatDb.upsertAlbumPreviewCover(String(albumId), fetched.base64, fetched.mimeType);
				albumCoverCache.set(albumId, toDataUri(fetched.mimeType, fetched.base64));
			}
		}
		// Notify regardless of whether the cover fetch above ran — the sticky
		// "this profile has an album" mapping just changed either way, and the
		// profile carousel's indicator needs to react to that on its own.
		for (const listener of albumCacheListeners) {
			listener();
		}
	} catch (error) {
		appLog.warn(`[album-store] failed to cache album ${albumId} from shared page`, error);
	}
}

export type LocalAlbumContent = {
	albumId: number;
	albumName: string | null;
	content: AlbumContentItem[];
};

/** Reads a previously-captured album back out as ready-to-render content items, or null if not cached. */
export async function getLocalAlbum(albumId: number): Promise<LocalAlbumContent | null> {
	const media = await chatDb.getAlbumMedia(String(albumId));
	if (media.length === 0) {
		return null;
	}

	const album = await chatDb.getAlbum(String(albumId));
	const content: AlbumContentItem[] = media.map((m) => {
		const separatorIndex = m.contentId.indexOf(":");
		const realContentId = Number(
			separatorIndex >= 0 ? m.contentId.slice(separatorIndex + 1) : m.contentId,
		);
		const url = m.dataBase64 ? toDataUri(m.contentType, m.dataBase64) : null;
		const thumbUrl = m.thumbDataBase64 ? toDataUri(m.contentType, m.thumbDataBase64) : url;

		return {
			contentId: realContentId,
			contentType: m.contentType,
			thumbUrl,
			url,
			coverUrl: url,
			processing: false,
		};
	});

	return {
		albumId,
		albumName: album?.albumName ?? null,
		content,
	};
}
