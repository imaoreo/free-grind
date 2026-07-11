/**
 * mediaStore.ts — eager fetch-and-store of chat media bytes into chatDb.
 *
 * Once a message's image/video/audio URL is resolved (even momentarily,
 * since CloudFront signed URLs expire on a timer), the bytes are downloaded
 * via @tauri-apps/plugin-http (bypasses webview CORS — same pattern already
 * proven in saveMedia.ts against these exact CDN hosts) and stored as base64
 * in chat.sqlite3, so the content survives URL expiry / view-once forever.
 * The tap-to-reveal/blur UI is unaffected — only where the bytes come from
 * changes.
 */

import { fetch } from "@tauri-apps/plugin-http";
import * as chatDb from "./chatDb";
import type { MediaKind } from "../types/chat-db";
import { appLog } from "../utils/logger";
import { isAutoDownloadMediaEnabled } from "../utils/mediaSettings";
import { limitChatDbBlobRead } from "../utils/chatDbBlobLimiter";

// De-dupe concurrent fetches for the same key (e.g. multiple hydration passes
// racing for the same image).
const inFlight = new Map<string, Promise<void>>();

// Synchronous in-memory cache so render code (which can't await a DB read)
// can prefer the locally-stored copy once it's available. Populated as
// fetchAndStoreMedia resolves (whether by downloading or finding a DB hit).
const memoryCache = new Map<string, string>();
const cacheListeners = new Set<() => void>();

function setCachedMediaUri(mediaKey: string, uri: string): void {
	memoryCache.set(mediaKey, uri);
	for (const listener of cacheListeners) {
		listener();
	}
}

/** Synchronous read of the in-memory media cache. */
export function getCachedMediaUri(mediaKey: string | null | undefined): string | null {
	if (!mediaKey) {
		return null;
	}
	return memoryCache.get(mediaKey) ?? null;
}

/** Subscribe to in-memory cache updates; returns an unsubscribe function. */
export function subscribeToMediaCache(listener: () => void): () => void {
	cacheListeners.add(listener);
	return () => {
		cacheListeners.delete(listener);
	};
}

function bytesToBase64(data: ArrayBuffer, mimeType: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([data], { type: mimeType || "application/octet-stream" });
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			const commaIndex = dataUrl.indexOf(",");
			resolve(commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl);
		};
		reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
		reader.readAsDataURL(blob);
	});
}

export function toDataUri(mimeType: string | null, base64: string): string {
	return `data:${mimeType || "application/octet-stream"};base64,${base64}`;
}

/**
 * Checks whether a CloudFront signed URL has expired by reading the
 * `Expires` query parameter (Unix epoch seconds). No network request needed.
 * Returns false if the URL cannot be parsed or has no Expires param.
 */
export function isSignedUrlExpired(url: string): boolean {
	try {
		const expires = new URL(url).searchParams.get("Expires");
		if (!expires) return false;
		return Date.now() > Number(expires) * 1000;
	} catch {
		return false;
	}
}

export type FetchedMedia = {
	base64: string;
	mimeType: string | null;
	sizeBytes: number;
};

/** Downloads `url` and base64-encodes it. Returns null on any failure (logs, never throws). */
export async function fetchAndEncode(url: string): Promise<FetchedMedia | null> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to download media (${response.status})`);
		}
		const arrayBuffer = await response.arrayBuffer();
		const mimeType =
			response.headers.get("content-type")?.split(";")[0]?.trim() || null;
		const base64 = await bytesToBase64(arrayBuffer, mimeType || "application/octet-stream");
		return { base64, mimeType, sizeBytes: arrayBuffer.byteLength };
	} catch (error) {
		appLog.warn(`[media-store] failed to fetch/encode ${url}`, error);
		return null;
	}
}

export type FetchAndStoreMediaParams = {
	mediaKey: string;
	kind: MediaKind;
	url: string;
	conversationId: string | null;
	messageId: string | null;
	viewOnce: boolean;
	// Whether the signed-in user sent this message themselves — auto-download
	// to the device's Downloads folder only ever mirrors media *received*
	// from someone else, never the user's own outgoing photos/videos.
	isOwnMessage: boolean;
	// Set for captures of secondary preview content (reply-quote thumbnails,
	// reaction bubbles) rather than the actual media a message is about —
	// never worth mirroring to the device's Downloads folder even when
	// received. Defaults to false.
	skipAutoDownload?: boolean;
};

async function downloadAndStore(params: FetchAndStoreMediaParams): Promise<void> {
	const { mediaKey, kind, url, conversationId, messageId, viewOnce, isOwnMessage, skipAutoDownload } = params;
	const fetched = await fetchAndEncode(url);

	if (!fetched) {
		await chatDb
			.upsertMediaFile({
				mediaKey,
				conversationId,
				messageId,
				kind,
				mimeType: null,
				dataBase64: "",
				viewOnce,
				sizeBytes: null,
				fetchStatus: "failed",
			})
			.catch(() => {});
		return;
	}

	await chatDb.upsertMediaFile({
		mediaKey,
		conversationId,
		messageId,
		kind,
		mimeType: fetched.mimeType,
		dataBase64: fetched.base64,
		viewOnce,
		sizeBytes: fetched.sizeBytes,
		fetchStatus: "ok",
	});
	setCachedMediaUri(mediaKey, toDataUri(fetched.mimeType, fetched.base64));

	if (!isOwnMessage && !skipAutoDownload && (kind === "image" || kind === "video")) {
		void maybeAutoDownloadToDevice(fetched.base64, fetched.mimeType, kind, conversationId);
	}
}

/**
 * Mirrors newly-cached media into the device's Downloads folder, if the user
 * has opted in. Dynamically imported to avoid a circular dependency —
 * saveMedia.ts itself imports toDataUri from this module.
 */
async function maybeAutoDownloadToDevice(
	base64: string,
	mimeType: string | null,
	kind: "image" | "video",
	conversationId: string | null,
): Promise<void> {
	if (!isAutoDownloadMediaEnabled()) {
		return;
	}
	try {
		const { saveMediaBytesToDeviceSilent } = await import("./saveMedia");
		await saveMediaBytesToDeviceSilent(base64, mimeType, kind, conversationId);
	} catch (error) {
		appLog.warn("[media-store] auto-download to device failed", error);
	}
}

/**
 * Fetch and store media bytes for `mediaKey` if not already cached. Safe to
 * call repeatedly/concurrently (fire-and-forget) — de-duped in-flight,
 * skipped once already stored, retried on a previous failure. Never throws.
 */
export async function fetchAndStoreMedia(
	params: FetchAndStoreMediaParams,
): Promise<void> {
	const { mediaKey, url } = params;
	if (!mediaKey || !url) {
		return;
	}

	const existing = inFlight.get(mediaKey);
	if (existing) {
		return existing;
	}

	const run = (async () => {
		try {
			const cached = await limitChatDbBlobRead(() => chatDb.getMediaFile(mediaKey));
			if (cached?.fetchStatus === "ok") {
				setCachedMediaUri(mediaKey, toDataUri(cached.mimeType, cached.dataBase64));
				// Self-heal: a reply-quote/reaction preview capture for this same
				// content-hash mediaKey (see replyMediaStore.ts) may have left
				// message_id null, or pointed at a message that's since been
				// superseded — if this call carries a real messageId that
				// doesn't match what's stored, re-associate now that we know
				// which message this content actually belongs to. Cheap since
				// the bytes are already cached — no refetch needed.
				if (params.messageId != null && cached.messageId !== params.messageId) {
					await chatDb
						.upsertMediaFile({
							mediaKey,
							conversationId: params.conversationId,
							messageId: params.messageId,
							kind: cached.kind,
							mimeType: cached.mimeType,
							dataBase64: cached.dataBase64,
							viewOnce: cached.viewOnce,
							sizeBytes: cached.sizeBytes,
							fetchStatus: cached.fetchStatus,
						})
						.catch(() => {});
				}
				return;
			}
			// Signed URLs that already expired are guaranteed to 403 — skip the
			// network round-trip (and the log spam it'd produce) instead of
			// re-hitting CloudFront every time this message is re-processed
			// (poll, realtime merge, hydration pass) until a fresh URL arrives.
			if (isSignedUrlExpired(url)) {
				if (cached?.fetchStatus !== "failed") {
					await chatDb
						.upsertMediaFile({
							mediaKey,
							conversationId: params.conversationId,
							messageId: params.messageId,
							kind: params.kind,
							mimeType: null,
							dataBase64: "",
							viewOnce: params.viewOnce,
							sizeBytes: null,
							fetchStatus: "failed",
						})
						.catch(() => {});
				}
				return;
			}
			await downloadAndStore(params);
		} finally {
			inFlight.delete(mediaKey);
		}
	})();

	inFlight.set(mediaKey, run);
	return run;
}

/**
 * Returns a ready-to-use data: URI for previously-stored media, or null if
 * not cached (yet, or the last fetch failed).
 */
export async function getLocalMediaUri(
	mediaKey: string | null | undefined,
): Promise<string | null> {
	if (!mediaKey) {
		return null;
	}
	const stored = await limitChatDbBlobRead(() => chatDb.getMediaFile(mediaKey));
	if (!stored || stored.fetchStatus !== "ok") {
		return null;
	}
	return toDataUri(stored.mimeType, stored.dataBase64);
}

/**
 * The primary media_key (see chatUtils.ts's getMediaKeyForMessage) is
 * derived from whatever the live message body currently offers — a hash,
 * a URL, a mediaId. Once the server stops including that field (expired
 * signed URL no longer refreshed, conversation archived, etc.) the same
 * message can no longer reproduce that key, even though chatDb may still
 * have the bytes filed under it. message_id is stable forever, so this is
 * a parallel, URL-independent cache namespace keyed by it instead — used
 * as a fallback wherever the primary lookup can't even be attempted.
 */
export function getMessageFallbackMediaKey(messageId: string): string {
	return `msg:${messageId}`;
}

/**
 * Populates the in-memory cache (under the message-id fallback key) from
 * whatever's already stored for this message, regardless of whether the
 * live message currently carries a usable URL. Safe to call repeatedly.
 */
export async function hydrateMediaByMessageId(messageId: string): Promise<void> {
	const key = getMessageFallbackMediaKey(messageId);
	if (memoryCache.has(key) || inFlight.has(key)) {
		return;
	}

	const run = (async () => {
		try {
			const stored = await limitChatDbBlobRead(() =>
				chatDb.getMediaFileByMessageId(messageId),
			);
			if (stored?.fetchStatus === "ok") {
				setCachedMediaUri(key, toDataUri(stored.mimeType, stored.dataBase64));
			}
		} finally {
			inFlight.delete(key);
		}
	})();

	inFlight.set(key, run);
	return run;
}
