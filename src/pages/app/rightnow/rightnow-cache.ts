import type { RightNowFeedItem } from "../../../services/apiFunctions";

interface RightNowCache {
	items: RightNowFeedItem[];
	timestamp: number;
}

const cache = new Map<string, RightNowCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minute validity

function normalizeKey(key?: string): string {
	return key && key.length > 0 ? key : "default";
}

export function getCachedRightNowFeed(key?: string): RightNowFeedItem[] | null {
	const normalizedKey = normalizeKey(key);
	const entry = cache.get(normalizedKey);
	if (!entry) return null;
	if (Date.now() - entry.timestamp > CACHE_TTL) {
		cache.delete(normalizedKey);
		return null;
	}
	return entry.items;
}

export function setCachedRightNowFeed(items: RightNowFeedItem[], key?: string) {
	cache.set(normalizeKey(key), {
		items,
		timestamp: Date.now(),
	});
}

export function clearCachedRightNowFeed() {
	cache.clear();
}
