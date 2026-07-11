import type {
	BrowseCard,
	ProfileDetail,
} from "../GridPage.types";
import type { CacheEntry } from "../../../types/grid-cache";

const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000;

const profileCache = new Map<string, CacheEntry<ProfileDetail>>();
const browseCache = new Map<
	string,
	CacheEntry<{ cards: BrowseCard[]; nextPage: string | null }>
>();

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

export function getCachedBrowseCards(
	cacheKey: string,
): { cards: BrowseCard[]; nextPage: string | null } | null {
	return getFromCache(browseCache, cacheKey);
}

export function setCachedBrowseCards(
	cacheKey: string,
	cards: BrowseCard[],
	nextPage: string | null,
) {
	setInCache(browseCache, cacheKey, { cards, nextPage }, BROWSE_CACHE_TTL_MS);
}

export function removeProfileFromBrowseCache(profileId: string) {
	for (const [cacheKey, entry] of browseCache) {
		browseCache.set(cacheKey, {
			...entry,
			value: {
				...entry.value,
				cards: entry.value.cards.filter((card) => card.profileId !== profileId),
			},
		});
	}
}

/**
 * Resets every module-level cache here — call on logout/account switch.
 * Without this, a second account would briefly see the previous account's
 * profile cache and browse cards, since neither is keyed or cleared by
 * account. Genders/pronouns/blocked-list/own-profile fields are now React
 * Query caches instead (see hooks/queries/useProfileQueries.ts) — those are
 * cleared via queryClient on logout, not here.
 */
export function clearAllCaches(): void {
	profileCache.clear();
	browseCache.clear();
}
