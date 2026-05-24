import type { RightNowFeedItem } from "../../../services/apiFunctions";

interface RightNowCache {
	items: RightNowFeedItem[];
	timestamp: number;
}

let cache: RightNowCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 Minuten Gültigkeit

export function getCachedRightNowFeed(): RightNowFeedItem[] | null {
	if (!cache) return null;
	if (Date.now() - cache.timestamp > CACHE_TTL) {
		cache = null;
		return null;
	}
	return cache.items;
}

export function setCachedRightNowFeed(items: RightNowFeedItem[]) {
	cache = {
		items,
		timestamp: Date.now(),
	};
}

export function clearCachedRightNowFeed() {
	cache = null;
}
