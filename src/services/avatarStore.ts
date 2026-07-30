/**
 * avatarStore.ts — eager fetch-and-store of chat-visible avatars into chatDb.
 *
 * Originally scoped to chat only (inbox list, thread, search, shared albums)
 * — not the Grid/Browse/Profile pages, per instruction, to avoid caching
 * every photo of every profile a user casually swipes past. The profile page
 * now opts in too, but only for a profile you've actually chatted with (see
 * `cache` option below) — so archived/blocked chat partners' photos are
 * still viewable once their live profile is unreachable, without paying that
 * storage cost for ordinary Grid/Browse viewing.
 *
 * Mirrors mediaStore.ts's pattern: a synchronous in-memory cache (so render
 * code, including inside list-item loops, can resolve a cached avatar
 * without awaiting a DB read) backed by chatDb's avatars table, keyed by
 * content-addressed media hash.
 */

import * as chatDb from "./chatDb";
import { fetchAndEncode, toDataUri } from "./mediaStore";
import { getThumbImageUrl, validateMediaHash } from "../utils/media";
import { appLog } from "../utils/logger";
import { limitChatDbBlobRead } from "../utils/chatDbBlobLimiter";

const inFlight = new Map<string, Promise<void>>();
const memoryCache = new Map<string, string>();
const cacheListeners = new Set<() => void>();

function setCachedAvatarUri(mediaHash: string, uri: string): void {
	memoryCache.set(mediaHash, uri);
	for (const listener of cacheListeners) {
		listener();
	}
}

/** Subscribe to avatar cache updates; returns an unsubscribe function. */
export function subscribeToAvatarCache(listener: () => void): () => void {
	cacheListeners.add(listener);
	return () => {
		cacheListeners.delete(listener);
	};
}

/**
 * Fetch and store the avatar for `mediaHash` if not already cached. Safe to
 * call repeatedly (fire-and-forget, e.g. on every render) — de-duped
 * in-flight and skipped once cached. Never throws. `sourceUrl` overrides the
 * default 320x320 thumb (e.g. a full-resolution profile photo URL) — a hash
 * already cached under a smaller size is left as-is rather than re-fetched,
 * since this is a best-effort offline fallback, not a quality guarantee.
 */
export async function fetchAndStoreAvatar(
	mediaHash: string | null | undefined,
	sourceUrl?: string,
): Promise<void> {
	if (!mediaHash || !validateMediaHash(mediaHash)) {
		return;
	}
	if (memoryCache.has(mediaHash) || inFlight.has(mediaHash)) {
		return inFlight.get(mediaHash);
	}

	const run = (async () => {
		try {
			const cached = await limitChatDbBlobRead(() => chatDb.getAvatar(mediaHash));
			if (cached) {
				setCachedAvatarUri(mediaHash, toDataUri(cached.mimeType, cached.dataBase64));
				return;
			}

			const fetched = await fetchAndEncode(sourceUrl ?? getThumbImageUrl(mediaHash, "320x320"));
			if (!fetched) {
				return;
			}

			await chatDb.upsertAvatar(mediaHash, fetched.base64, fetched.mimeType);
			setCachedAvatarUri(mediaHash, toDataUri(fetched.mimeType, fetched.base64));
		} catch (error) {
			appLog.warn(`[avatar-store] failed to fetch/store avatar ${mediaHash}`, error);
		} finally {
			inFlight.delete(mediaHash);
		}
	})();

	inFlight.set(mediaHash, run);
	return run;
}

/**
 * Resolves the best available avatar src: the cached local copy if present
 * (kicking off a background fetch-and-store as a side effect when it isn't,
 * unless `cache: false`), else `fallbackUrl`. Plain function, not a hook —
 * safe to call from inside list-item render loops; pair with
 * useAvatarCache() once per component so the component re-renders as
 * avatars get cached.
 *
 * Pass `cache: false` to read whatever's already cached without triggering a
 * new fetch-and-store — e.g. Grid/Browse profile photos, which stay
 * uncached by design (see file header) unless the profile happens to
 * already be cached via a chat. Pass `sourceUrl` to control what gets
 * fetched when caching is enabled (defaults to a 320x320 thumb).
 */
export function resolveAvatarSrc(
	mediaHash: string | null | undefined,
	fallbackUrl: string | null,
	options?: { cache?: boolean; sourceUrl?: string },
): string | null {
	if (!mediaHash || !validateMediaHash(mediaHash)) {
		return fallbackUrl;
	}
	if (options?.cache ?? true) {
		void fetchAndStoreAvatar(mediaHash, options?.sourceUrl);
	}
	return memoryCache.get(mediaHash) ?? fallbackUrl;
}
