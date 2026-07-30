import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";

// --- STEALTH MODE / APP DISGUISE ---
// Lets the user swap the app's launcher icon (+ name on Android) for a
// decoy (Calculator/Notes/Weather) so it doesn't announce itself on the
// home screen or app drawer.
//
// Android: implemented via AndroidManifest activity-alias +
// PackageManager.setComponentEnabledSetting (see AppDisguise.kt) — the OS
// itself is the source of truth for which identity is active, read
// synchronously through FreeGrindBridge on every call.
//
// iOS: only the icon can change at runtime (UIApplication.setAlternateIconName
// via the ios-app-disguise plugin — see AppDisguisePlugin.swift); the name
// under it stays "Free Grind" (CFBundleDisplayName has no runtime override).
// There's also no synchronous native getter for the current alternate icon,
// so — unlike Android — the choice is mirrored into localStorage as the
// source of truth for the synchronous initial-state read the settings UI
// needs; the native call is fired (not awaited) to apply it.

export type AppDisguiseId = "default" | "calculator" | "notes" | "weather";

export const APP_DISGUISE_IDS: AppDisguiseId[] = ["default", "calculator", "notes", "weather"];

const IOS_ALTERNATE_ICON_NAME: Record<AppDisguiseId, string | null> = {
	default: null,
	calculator: "Calculator",
	notes: "Notes",
	weather: "Weather",
};

const IOS_DISGUISE_STORAGE_KEY = "fg-app-disguise";

type DisguiseBridge = {
	setAppDisguise?: (id: string) => boolean;
	getAppDisguise?: () => string;
};

function getBridge(): DisguiseBridge | undefined {
	return (window as unknown as { FreeGrindBridge?: DisguiseBridge }).FreeGrindBridge;
}

function isAndroidSupported(): boolean {
	return platform() === "android" && typeof getBridge()?.setAppDisguise === "function";
}

function isIosSupported(): boolean {
	return platform() === "ios";
}

export function isAppDisguiseSupported(): boolean {
	return isAndroidSupported() || isIosSupported();
}

export function getCurrentAppDisguise(): AppDisguiseId {
	if (isAndroidSupported()) {
		const raw = getBridge()?.getAppDisguise?.();
		return APP_DISGUISE_IDS.includes(raw as AppDisguiseId) ? (raw as AppDisguiseId) : "default";
	}

	if (isIosSupported()) {
		try {
			const raw = window.localStorage.getItem(IOS_DISGUISE_STORAGE_KEY);
			return APP_DISGUISE_IDS.includes(raw as AppDisguiseId) ? (raw as AppDisguiseId) : "default";
		} catch {
			return "default";
		}
	}

	return "default";
}

/**
 * Applies the disguise and reports whether the request was accepted.
 * Android resolves synchronously (native call is synchronous). iOS's native
 * call is async (Promise-based `invoke`) with no synchronous success signal,
 * so it's applied optimistically here — the localStorage write (the value
 * getCurrentAppDisguise reads back) happens immediately, and the actual
 * UIApplication.setAlternateIconName call is fired in the background;
 * failures are logged but don't revert the UI, since it's a rare case that
 * only rejects for reasons the toggle can't do anything about (e.g. running
 * on iPad or an unsupported OS version).
 */
export function setAppDisguise(id: AppDisguiseId): boolean {
	if (isAndroidSupported()) {
		return getBridge()?.setAppDisguise?.(id) ?? false;
	}

	if (isIosSupported()) {
		try {
			window.localStorage.setItem(IOS_DISGUISE_STORAGE_KEY, id);
		} catch {
			// Ignore storage write failures — the invoke call below still fires.
		}
		void invoke("plugin:ios-app-disguise|set_alternate_icon", { name: IOS_ALTERNATE_ICON_NAME[id] }).catch(
			(error) => {
				console.error("[appDisguise] failed to set iOS alternate icon", error);
			},
		);
		return true;
	}

	return false;
}
