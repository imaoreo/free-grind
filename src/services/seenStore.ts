/**
 * seenStore — tracks the last time the user looked at the Interest tab so
 * NavBar can show a small "new" indicator (red dot) when something newer
 * has arrived since.
 *
 * Storage is a single localStorage key per section. Mark/clear dispatches a
 * window event so other components can react without polling.
 */

const INTEREST_KEY = "fg-interest-last-seen";

export const INTEREST_SEEN_EVENT = "fg:interest-seen";

export function getInterestLastSeen(): number {
	if (typeof window === "undefined") return 0;
	const raw = window.localStorage.getItem(INTEREST_KEY);
	const value = raw ? Number(raw) : 0;
	return Number.isFinite(value) ? value : 0;
}

export function markInterestSeen(at: number = Date.now()): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(INTEREST_KEY, String(at));
	window.dispatchEvent(new CustomEvent(INTEREST_SEEN_EVENT, { detail: at }));
}
