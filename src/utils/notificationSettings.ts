// Shared by NotificationsPage (the settings toggles) and ChatRealtimeBridge
// (which gates the instant foreground notifications it fires from the chat
// WebSocket) — lets the user control chat and tap notifications separately,
// plus one general switch for whether either shows while the app is open
// (foreground) or only via FCM once it's backgrounded/closed.
export const CHAT_NOTIFICATIONS_ENABLED_KEY = "notif_chat_enabled";
export const TAP_NOTIFICATIONS_ENABLED_KEY = "notif_taps_enabled";
export const FOREGROUND_NOTIFICATIONS_ENABLED_KEY = "notif_foreground_enabled";

// All three default to enabled (true) — absence of a stored value, or any
// value other than the literal "false", means "on", so existing installs
// that never touched these keys keep today's always-on behavior.
function readSetting(key: string): boolean {
	return typeof window === "undefined" || localStorage.getItem(key) !== "false";
}

export function isChatNotificationsEnabled(): boolean {
	return readSetting(CHAT_NOTIFICATIONS_ENABLED_KEY);
}
export function isTapNotificationsEnabled(): boolean {
	return readSetting(TAP_NOTIFICATIONS_ENABLED_KEY);
}
export function isForegroundNotificationsEnabled(): boolean {
	return readSetting(FOREGROUND_NOTIFICATIONS_ENABLED_KEY);
}

// Android's FCM push is posted natively (FreeGrindFirebaseMessagingService /
// NotificationPoster), entirely outside this WebView's JS — so these
// preferences need mirroring into MainActivity for the background/foreground
// FCM path to honor them too, not just the instant WS-triggered path here.
// No-op outside the Android WebView.
export function syncNotificationSettingsToNative(): void {
	try {
		const payload = JSON.stringify({
			chatEnabled: isChatNotificationsEnabled(),
			tapsEnabled: isTapNotificationsEnabled(),
			foregroundEnabled: isForegroundNotificationsEnabled(),
		});
		(
			window as unknown as {
				FreeGrindBridge?: { setNotificationPreferences?: (json: string) => void };
			}
		).FreeGrindBridge?.setNotificationPreferences?.(payload);
	} catch {
		// no-op outside the Android WebView
	}
}
