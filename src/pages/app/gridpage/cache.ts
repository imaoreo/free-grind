import type {
	BrowseCard,
	ManagedOption,
	ProfileDetail,
} from "../GridPage.types";
import type { CacheEntry } from "../../../types/grid-cache";

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const BROWSE_CACHE_TTL_MS = 60 * 1000;
const PUBLIC_OPTIONS_CACHE_TTL_MS = 30 * 60 * 1000;

const profileCache = new Map<string, CacheEntry<ProfileDetail>>();
const browseCache = new Map<string, CacheEntry<BrowseCard[]>>();
let genderOptionsCache: CacheEntry<ManagedOption[]> | null = null;
let pronounOptionsCache: CacheEntry<ManagedOption[]> | null = null;

function getFromCache<T>(
	cache: Map<string, CacheEntry<T>>,
	key: string,
): T | null {
	const entry = cache.get(key);
	if (!entry) {
		return null;
	}

	if (entry.expiresAt <= Date.now()) {
		cache.delete(key);
		return null;
	}

	return entry.value;
}

function setInCache<T>(
	cache: Map<string, CacheEntry<T>>,
	key: string,
	value: T,
	ttlMs: number,
) {
	cache.set(key, {
		value,
		expiresAt: Date.now() + ttlMs,
	});
}

export function getCachedProfileDetail(
	profileId: string,
): ProfileDetail | null {
	return getFromCache(profileCache, profileId);
}

export function setCachedProfileDetail(
	profileId: string,
	profile: ProfileDetail,
) {
	setInCache(profileCache, profileId, profile, PROFILE_CACHE_TTL_MS);
}

export function getCachedBrowseCards(cacheKey: string): BrowseCard[] | null {
	return getFromCache(browseCache, cacheKey);
}

export function setCachedBrowseCards(cacheKey: string, cards: BrowseCard[]) {
	setInCache(browseCache, cacheKey, cards, BROWSE_CACHE_TTL_MS);
}

export function getCachedGenderOptions(): ManagedOption[] | null {
	if (!genderOptionsCache) {
		return null;
	}

	if (genderOptionsCache.expiresAt <= Date.now()) {
		genderOptionsCache = null;
		return null;
	}

	return genderOptionsCache.value;
}

export function setCachedGenderOptions(options: ManagedOption[]) {
	genderOptionsCache = {
		value: options,
		expiresAt: Date.now() + PUBLIC_OPTIONS_CACHE_TTL_MS,
	};
}

export function getCachedPronounOptions(): ManagedOption[] | null {
	if (!pronounOptionsCache) {
		return null;
	}

	if (pronounOptionsCache.expiresAt <= Date.now()) {
		pronounOptionsCache = null;
		return null;
	}

	return pronounOptionsCache.value;
}

export function setCachedPronounOptions(options: ManagedOption[]) {
	pronounOptionsCache = {
		value: options,
		expiresAt: Date.now() + PUBLIC_OPTIONS_CACHE_TTL_MS,
	};
}
