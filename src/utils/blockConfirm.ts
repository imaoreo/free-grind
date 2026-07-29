// Shared by GridPage, GridProfilePage, ChatThreadPanel (read before blocking)
// and BehaviorPage (the direct settings toggle) so they all agree on the same
// localStorage keys. App-wide, not per profile.
export const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
// Shared by ChatThreadPanel (overflow menu delete) and ChatInboxPanel
// (context menu / swipe delete) so "don't ask again" applies everywhere a
// conversation can be deleted from, not just the place it was checked.
export const SKIP_DELETE_CONVERSATION_CONFIRM_KEY = "chat_skip_delete_conversation_confirm";

// Shared by ChatThreadMessages (link tap in a message) and BehaviorPage (the
// direct settings toggle).
export const SKIP_LINK_OPEN_CONFIRM_KEY = "chat_skip_link_open_confirm";

// ChatInboxPanel and ChatThreadPanel are mounted side by side (desktop split
// view), not sequentially — so a `useState(() => localStorage.getItem(...))`
// per component goes stale the moment the *other* panel flips the flag,
// since each copy only reads localStorage once at its own mount. These read
// straight from localStorage on every check instead of caching in state, so
// "don't ask again" set in one panel is honored by the other immediately.
export function isBlockConfirmSkipped(): boolean {
	return typeof window !== "undefined" && localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
}
export function isDeleteConversationConfirmSkipped(): boolean {
	return (
		typeof window !== "undefined" &&
		localStorage.getItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY) === "true"
	);
}
export function isLinkOpenConfirmSkipped(): boolean {
	return typeof window !== "undefined" && localStorage.getItem(SKIP_LINK_OPEN_CONFIRM_KEY) === "true";
}
