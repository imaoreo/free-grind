/**
 * localNotify.ts — fire native OS notifications instantly from the chat
 * WebSocket while the app is in the foreground, instead of waiting on FCM's
 * delivery delay.
 *
 * Android is intentionally excluded; it has its own native notification
 * pipeline (FreeGrindFirebaseMessagingService / NotificationPoster) reached
 * via the FreeGrindBridge JS interface, which dedupes against the FCM path.
 * Desktop and iOS have no competing push channel, so this is a plain
 * fire-and-forget call.
 */

import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

// Matches the Linux .desktop entry's `Icon=`/`StartupWMClass=` value (the
// main binary name, not the bundle `identifier`) — confirmed against the
// installed /usr/share/applications/Free Grind.desktop. Passing this as the
// notification icon lets the icon theme resolve it once the app is properly
// installed with icons bundled (see tauri.conf.json `bundle.icon`).
const APP_ICON_NAME = "free-grind";

let permissionPromise: Promise<boolean> | null = null;
let cachedIsSupported: boolean | null = null;

function detectLocalNotifySupported(): boolean {
	if (cachedIsSupported != null) return cachedIsSupported;
	if (!isTauriRuntime()) {
		cachedIsSupported = false;
		return false;
	}
	try {
		const p = platform();
		cachedIsSupported = p === "macos" || p === "windows" || p === "linux" || p === "ios";
	} catch (error) {
		appLog.warn("[notify] platform() failed", error);
		cachedIsSupported = false;
	}
	return cachedIsSupported;
}

async function ensurePermission(): Promise<boolean> {
	if (!permissionPromise) {
		permissionPromise = (async () => {
			try {
				const already = await isPermissionGranted();
				appLog.debug("[notify] isPermissionGranted ->", already);
				if (already) return true;
				appLog.debug("[notify] requesting permission");
				const result = await requestPermission();
				appLog.debug("[notify] requestPermission ->", result);
				return result === "granted";
			} catch (error) {
				appLog.warn("[notify] permission check failed", error);
				return false;
			}
		})();
	}
	return permissionPromise;
}

/**
 * Trigger the OS permission prompt eagerly so the user sees it on app start
 * rather than waiting for the first incoming message. Safe to call repeatedly;
 * only prompts once per app session.
 */
export async function primeLocalNotifications(): Promise<boolean> {
	if (!detectLocalNotifySupported()) {
		appLog.debug("[notify] prime skipped (not supported)");
		return false;
	}
	appLog.debug("[notify] priming permission");
	return ensurePermission();
}

export interface LocalNotifyOptions {
	title: string;
	body: string;
	/** Conversation/thread grouping key (e.g. conversationId, or "taps"). */
	group?: string;
	/** When true, skip the notification (e.g. user is viewing the conversation). */
	suppress?: boolean;
}

export async function notifyLocal(options: LocalNotifyOptions): Promise<void> {
	if (options.suppress) {
		appLog.debug("[notify] suppressed", options.title);
		return;
	}
	if (!detectLocalNotifySupported()) {
		return;
	}
	const granted = await ensurePermission();
	if (!granted) {
		appLog.debug("[notify] permission not granted, skipping");
		return;
	}
	try {
		appLog.debug("[notify] sending", options.title);
		sendNotification({
			title: options.title,
			body: options.body,
			group: options.group,
			icon: APP_ICON_NAME,
		});
	} catch (error) {
		appLog.warn("[notify] sendNotification failed", error);
	}
}
