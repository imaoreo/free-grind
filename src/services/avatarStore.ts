/**
 * avatarStore.ts — eager fetch-and-store of chat-visible avatars into chatDb.
 *
 * Scoped to chat only (inbox list, thread, search, shared albums) — not the
 * Grid/Browse/Profile pages, per instruction. Mirrors mediaStore.ts's
 * pattern: a synchronous in-memory cache (so render code, including inside
 * list-item loops, can resolve a cached avatar without awaiting a DB read)
 * backed by chatDb's avatars table, keyed by content-addressed media hash.
 */

import * as chatDb from "./chatDb";
import { fetchAndEncode, toDataUri } from "./mediaStore";
import { getProfileImageUrl, validateMediaHash } from "../utils/media";
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
 * in-flight and skipped once cached. Never throws.
 */
export async function fetchAndStoreAvatar(
	mediaHash: string | null | undefined,
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

			const fetched = await fetchAndEncode(getProfileImageUrl(mediaHash));
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
 * (kicking off a background fetch-and-store as a side effect when it
 * isn't), else `fallbackUrl`. Plain function, not a hook — safe to call from
 * inside list-item render loops; pair with useAvatarCache() once per
 * component so the component re-renders as avatars get cached.
 */
export function resolveAvatarSrc(
	mediaHash: string | null | undefined,
	fallbackUrl: string | null,
): string | null {
	if (!mediaHash || !validateMediaHash(mediaHash)) {
		return fallbackUrl;
	}
	void fetchAndStoreAvatar(mediaHash);
	return memoryCache.get(mediaHash) ?? fallbackUrl;
}
