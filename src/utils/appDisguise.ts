import { platform } from "@tauri-apps/plugin-os";

// --- STEALTH MODE / APP DISGUISE ---
// Lets the user swap the Android launcher icon+name for a decoy (Calculator/
// Notes/Weather) so the app doesn't announce itself on the home screen or
// app drawer. Implemented natively via AndroidManifest activity-alias +
// PackageManager.setComponentEnabledSetting (see AppDisguise.kt) — the OS
// itself is the source of truth for which identity is active, so there's
// nothing to persist here; every read goes straight to the bridge.
//
// iOS has no native counterpart yet: Apple's alternate-icon API can swap the
// icon but not the name shown under it, and there's no existing Swift bridge
// in gen/apple to hook into (unlike Android's JsBridge). isAppDisguiseSupported()
// gates the feature to Android only until that's built.

export type AppDisguiseId = "default" | "calculator" | "notes" | "weather";

export const APP_DISGUISE_IDS: AppDisguiseId[] = ["default", "calculator", "notes", "weather"];

type DisguiseBridge = {
	setAppDisguise?: (id: string) => boolean;
	getAppDisguise?: () => string;
};

function getBridge(): DisguiseBridge | undefined {
	return (window as unknown as { FreeGrindBridge?: DisguiseBridge }).FreeGrindBridge;
}

export function isAppDisguiseSupported(): boolean {
	return platform() === "android" && typeof getBridge()?.setAppDisguise === "function";
}

export function getCurrentAppDisguise(): AppDisguiseId {
	const raw = getBridge()?.getAppDisguise?.();
	return APP_DISGUISE_IDS.includes(raw as AppDisguiseId) ? (raw as AppDisguiseId) : "default";
}

/** Returns whether the native switch call reported success. */
export function setAppDisguise(id: AppDisguiseId): boolean {
	return getBridge()?.setAppDisguise?.(id) ?? false;
}
