export const ANNOUNCEMENT_STORAGE_KEY = "fg-last-seen-announcement-version";

export function getLastSeenAnnouncementVersion(): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		return window.localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function markAnnouncementSeen(version: string): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, version);
	} catch {
		// Ignore storage write failures.
	}
}
