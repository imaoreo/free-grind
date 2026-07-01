/**
 * savedAccountProfiles.ts — persists each account's display name and
 * profile-image media hash, keyed by profile id, so the account switcher
 * (SettingsPage) can show a real name/avatar instead of just the bare
 * email/profile id for accounts that aren't currently active.
 *
 * Deliberately separate from gridpage/cache.ts's caches: those are
 * session-scoped and wiped on every account switch (clearAllCaches), while
 * this is keyed by profile id from the start and meant to survive switches
 * — and it's only a display name plus a public CDN media hash (see
 * utils/media.ts), not sensitive credential data, so plain localStorage is
 * fine.
 */

const STORAGE_KEY = "fg-saved-account-profiles";

export interface SavedAccountProfileCache {
	displayName: string | null;
	photoHash: string | null;
}

type StoredProfiles = Record<string, SavedAccountProfileCache>;

function loadAll(): StoredProfiles {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === "object" ? (parsed as StoredProfiles) : {};
	} catch {
		return {};
	}
}

function saveAll(all: StoredProfiles): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getSavedAccountProfile(profileId: string): SavedAccountProfileCache {
	return loadAll()[profileId] ?? { displayName: null, photoHash: null };
}

export function setSavedAccountPhotoHash(profileId: string, hash: string | null): void {
	const all = loadAll();
	all[profileId] = { displayName: all[profileId]?.displayName ?? null, photoHash: hash };
	saveAll(all);
}

export function setSavedAccountDisplayName(profileId: string, name: string | null): void {
	const all = loadAll();
	all[profileId] = { displayName: name, photoHash: all[profileId]?.photoHash ?? null };
	saveAll(all);
}

export function removeSavedAccountProfile(profileId: string): void {
	const all = loadAll();
	delete all[profileId];
	saveAll(all);
}
