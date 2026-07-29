/**
 * profileHide.ts — manually hide/unhide a profile from the grid.
 *
 * Purely a client-side preference (mirrors conversationHide.ts): unlike
 * blocking, a hidden profile still comes back through /v4/cascade like any
 * other card — this only gates GridPage's client-side sortedCards view via a
 * locally persisted flag in chatDb.
 */

import * as chatDb from "./chatDb";
import { appLog } from "../utils/logger";

// A profile's hidden flag changed — dispatched so any mounted grid UI (which
// keeps its own in-memory hidden-profile-ids set) can stay in sync without
// needing a bespoke update at every call site.
export const GRID_HIDE_STATE_EVENT = "fg:grid-hide-state";

export type GridHideStateChangeDetail = { profileId: string; hidden: boolean };

function dispatchHideStateChange(detail: GridHideStateChangeDetail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent<GridHideStateChangeDetail>(GRID_HIDE_STATE_EVENT, { detail }));
}

export async function hideProfile(
	profileId: string,
	displayName: string | null = null,
	avatarMediaHash: string | null = null,
): Promise<void> {
	try {
		await chatDb.hideProfile(profileId, displayName, avatarMediaHash);
		dispatchHideStateChange({ profileId, hidden: true });
	} catch (error) {
		appLog.error(`[profile-hide] failed to hide ${profileId}`, error);
	}
}

export async function unhideProfile(profileId: string): Promise<void> {
	try {
		await chatDb.unhideProfile(profileId);
		dispatchHideStateChange({ profileId, hidden: false });
	} catch (error) {
		appLog.error(`[profile-hide] failed to unhide ${profileId}`, error);
	}
}
