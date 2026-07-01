/**
 * seenStore — tracks the last time the user looked at the Interest/Inbox/
 * Right Now tabs so NavBar can show a small "new" indicator (red dot) when
 * something newer has arrived since.
 *
 * Backed by the active profile's db, kept in an in-memory cache so the
 * getters stay synchronous (read during render init and in frequent
 * NavBar badge comparisons) — mirrors the pattern in utils/autoblock.ts.
 * Mark/clear dispatches a window event so other components can react
 * without polling.
 */

import { getSetting, setSetting } from "./chatDb";

interface SeenTimestamps {
	interest: number;
	interestViews: number;
	interestTaps: number;
	inbox: number;
	rightNow: number;
}

const DEFAULT_SEEN: SeenTimestamps = {
	interest: 0,
	interestViews: 0,
	interestTaps: 0,
	inbox: 0,
	rightNow: 0,
};

const SEEN_SETTINGS_KEY = "seenTimestamps";

let seenCache: SeenTimestamps = DEFAULT_SEEN;

export async function loadSeenCache(): Promise<void> {
	try {
		const stored = await getSetting<Partial<SeenTimestamps>>(SEEN_SETTINGS_KEY);
		seenCache = { ...DEFAULT_SEEN, ...stored };
	} catch {
		seenCache = DEFAULT_SEEN;
	}
}

function persistSeenCache(patch: Partial<SeenTimestamps>): void {
	seenCache = { ...seenCache, ...patch };
	void setSetting(SEEN_SETTINGS_KEY, seenCache);
}

export const INTEREST_SEEN_EVENT = "fg:interest-seen";
export const INBOX_SEEN_EVENT = "fg:inbox-seen";
export const RIGHTNOW_SEEN_EVENT = "fg:rightnow-seen";

export function getInterestLastSeen(): number {
	return seenCache.interest;
}

export function markInterestSeen(at: number = Date.now()): void {
	persistSeenCache({ interest: at });
	window.dispatchEvent(new CustomEvent(INTEREST_SEEN_EVENT, { detail: at }));
}

export function getInterestTabLastSeen(tab: "views" | "taps"): number {
	return tab === "views" ? seenCache.interestViews : seenCache.interestTaps;
}

export function markInterestTabSeen(tab: "views" | "taps", at: number = Date.now()): void {
	persistSeenCache(tab === "views" ? { interestViews: at } : { interestTaps: at });
}

export function getInboxLastSeen(): number {
	return seenCache.inbox;
}

export function markInboxSeen(at: number = Date.now()): void {
	persistSeenCache({ inbox: at });
	window.dispatchEvent(new CustomEvent(INBOX_SEEN_EVENT, { detail: at }));
}

export function getRightNowLastSeen(): number {
	return seenCache.rightNow;
}

export function markRightNowSeen(at: number = Date.now()): void {
	persistSeenCache({ rightNow: at });
	window.dispatchEvent(new CustomEvent(RIGHTNOW_SEEN_EVENT, { detail: at }));
}
