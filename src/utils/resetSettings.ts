import * as chatDb from "../services/chatDb";
import { PREFERENCES_STORAGE_KEY } from "../contexts/PreferencesContext";
import { SKIP_BLOCK_CONFIRM_KEY, SKIP_DELETE_CONVERSATION_CONFIRM_KEY } from "./blockConfirm";
import { CHAT_NOTIFICATIONS_ENABLED_KEY, TAP_NOTIFICATIONS_ENABLED_KEY, FOREGROUND_NOTIFICATIONS_ENABLED_KEY } from "./notificationSettings";

// localStorage keys owned by individual feature files that don't export a
// constant for them — kept here as literals rather than exporting private
// constants from those files just for this one caller.
const RESETTABLE_LOCAL_STORAGE_KEYS = [
	PREFERENCES_STORAGE_KEY,
	"browseFilters",
	"chatInboxFilters",
	"open-grind:right-now-filters",
	"fg-show-right-now",
	"fg-show-interest",
	"fg-interest-default-tab",
	"fg-interest-last-tab",
	SKIP_BLOCK_CONFIRM_KEY,
	SKIP_DELETE_CONVERSATION_CONFIRM_KEY,
	CHAT_NOTIFICATIONS_ENABLED_KEY,
	TAP_NOTIFICATIONS_ENABLED_KEY,
	FOREGROUND_NOTIFICATIONS_ENABLED_KEY,
];

/**
 * Resets every user-facing app preference/toggle to its default: theme,
 * grid layout, units, privacy, automation rules, filters, notification
 * toggles, "don't ask again" flags, PrEP mode, and saved location.
 *
 * Deliberately leaves alone: conversations/messages/media, account/auth
 * state, onboarding-complete, analytics consent, and sync bookkeeping
 * (inbox-sync/seen-timestamps/saved-phrases-sync flags) — wiping those
 * wouldn't reset a "setting", just force an expensive resync or replay
 * onboarding unexpectedly.
 */
export async function resetAllSettings(): Promise<void> {
	await chatDb.resetAllSettings();
	for (const key of RESETTABLE_LOCAL_STORAGE_KEYS) {
		localStorage.removeItem(key);
	}
}
