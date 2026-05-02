/**
 * desktopNotify.ts — fire native OS notifications when a new chat message
 * arrives while the app is in the background or the conversation isn't open.
 *
 * Mobile (iOS/Android) is intentionally excluded; the OS already handles its
 * own notifications via the chat app stack.
 */

import {
	isPermissionGranted,
	requestPermission,
	sendNotification,
} from "@tauri-apps/plugin-notification";
import { platform } from "@tauri-apps/plugin-os";
import { isTauriRuntime } from "./tauriWebSocket";

let permissionPromise: Promise<boolean> | null = null;
let cachedIsDesktop: boolean | null = null;

function detectDesktop(): boolean {
	if (cachedIsDesktop != null) return cachedIsDesktop;
	if (!isTauriRuntime()) {
		cachedIsDesktop = false;
		return false;
	}
	try {
		const p = platform();
		cachedIsDesktop = p === "macos" || p === "windows" || p === "linux";
	} catch (error) {
		console.warn("[notify] platform() failed", error);
		cachedIsDesktop = false;
	}
	return cachedIsDesktop;
}

async function ensurePermission(): Promise<boolean> {
	if (!permissionPromise) {
		permissionPromise = (async () => {
			try {
				const already = await isPermissionGranted();
				console.log("[notify] isPermissionGranted ->", already);
				if (already) return true;
				console.log("[notify] requesting permission…");
				const result = await requestPermission();
				console.log("[notify] requestPermission ->", result);
				return result === "granted";
			} catch (error) {
				console.warn("[notify] permission check failed", error);
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
export async function primeDesktopNotifications(): Promise<boolean> {
	if (!detectDesktop()) {
		console.log("[notify] prime skipped (not desktop)");
		return false;
	}
	console.log("[notify] priming permission");
	return ensurePermission();
}

export interface DesktopNotifyOptions {
	title: string;
	body: string;
	/** When true, skip the notification (e.g. user is viewing the conversation). */
	suppress?: boolean;
}

export async function notifyMessage(
	options: DesktopNotifyOptions,
): Promise<void> {
	if (options.suppress) {
		console.log("[notify] suppressed", options.title);
		return;
	}
	if (!detectDesktop()) {
		return;
	}
	const granted = await ensurePermission();
	if (!granted) {
		console.log("[notify] permission not granted, skipping");
		return;
	}
	try {
		console.log("[notify] sending", options.title);
		sendNotification({ title: options.title, body: options.body });
	} catch (error) {
		console.warn("[notify] sendNotification failed", error);
	}
}
