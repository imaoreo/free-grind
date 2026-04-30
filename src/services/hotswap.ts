import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	applyUpdate,
	checkUpdate,
	configure,
	notifyReady,
} from "tauri-plugin-hotswap-api";
import {
	registerPresence as registerPresenceApi,
	trackUpdateCheck as trackUpdateCheckApi,
} from "./apiFunctions";

// Subscribe to hotswap lifecycle events for debugging
if (typeof window !== "undefined") {
	void (async () => {
		if (!isTauri()) return;
		await listen("hotswap://lifecycle", (event) => {
			console.log("[hotswap-lifecycle]", JSON.stringify(event.payload));
		});
		await listen("hotswap://download-progress", (event) => {
			const p = event.payload as { downloaded: number; total?: number };
			console.log(`[hotswap-progress] ${p.downloaded}/${p.total ?? "?"}`);
		});
	})();
}

let startupReadyNotified = false;
const HOTSWAP_CHANNEL_STORAGE_KEY = "hotswap-channel";
const AUTH_USER_ID_STORAGE_KEY = "fg-user-id";
const HOTSWAP_CHANNELS = ["main", "development", "testingwjay"] as const;

export type HotswapChannel = (typeof HOTSWAP_CHANNELS)[number];

function isHotswapChannel(value: string): value is HotswapChannel {
	return HOTSWAP_CHANNELS.includes(value as HotswapChannel);
}

function resolveDefaultChannel(): HotswapChannel {
	const envChannel = import.meta.env.VITE_HOTSWAP_CHANNEL;
	if (typeof envChannel === "string" && isHotswapChannel(envChannel)) {
		return envChannel;
	}

	return "main";
}

function readStoredChannel(): HotswapChannel | null {
	const value = window.localStorage.getItem(HOTSWAP_CHANNEL_STORAGE_KEY);
	if (!value || !isHotswapChannel(value)) {
		return null;
	}

	return value;
}

function readStoredUserId(): string | null {
	const value = window.localStorage.getItem(AUTH_USER_ID_STORAGE_KEY);
	if (!value) {
		return null;
	}

	return value;
}

let currentChannel: HotswapChannel = readStoredChannel() ?? resolveDefaultChannel();

export interface HotswapCheckResult {
	available: boolean;
	requiresBinaryUpdate: boolean;
	notes: string | null;
}

const BINARY_REQUIRED_MARKER = "[BINARY_REQUIRED]";

function parseBinaryRequiredNotes(notes: string | null): {
	requiresBinaryUpdate: boolean;
	message: string | null;
} {
	if (!notes) {
		return { requiresBinaryUpdate: false, message: null };
	}

	if (!notes.includes(BINARY_REQUIRED_MARKER)) {
		return { requiresBinaryUpdate: false, message: notes };
	}

	return {
		requiresBinaryUpdate: true,
		message: notes.replace(BINARY_REQUIRED_MARKER, "").trim() || null,
	};
}

export function getHotswapChannels(): readonly HotswapChannel[] {
	return HOTSWAP_CHANNELS;
}

export function getCurrentHotswapChannel(): HotswapChannel {
	return currentChannel;
}

export function isHotswapAvailable(): boolean {
	return isTauri();
}

export async function markHotswapStartupReady(): Promise<void> {
	if (!isHotswapAvailable() || startupReadyNotified) {
		return;
	}

	await configure({ channel: currentChannel });
	await notifyReady();
	startupReadyNotified = true;
}

/**
 * Detect platform and architecture from environment
 * Returns { platform, arch } - both lowercase strings
 */
function detectPlatformAndArch(): { platform: string; arch: string } {
	const buildTarget = import.meta.env.TAURI_PLATFORM || "";
	let platform = buildTarget.toLowerCase();

	if (!platform && typeof navigator !== "undefined") {
		const ua = navigator.userAgent.toLowerCase();
		if (ua.includes("linux")) platform = "linux";
		else if (ua.includes("mac")) platform = "macos";
		else if (ua.includes("windows")) platform = "windows";
		else if (ua.includes("android")) platform = "android";
		else if (ua.includes("iphone")) platform = "ios";
		else platform = "unknown";
	}

	const buildArch = import.meta.env.TAURI_ARCH || "";
	const arch = buildArch.toLowerCase() || "unknown";

	return { platform: platform || "unknown", arch };
}

/**
 * Track update check analytics
 * Sends data to backend for analytics dashboard
 */
async function trackUpdateCheck(): Promise<void> {
	try {
		const appVersion = import.meta.env.VITE_APP_VERSION || "unknown";
		const { platform, arch } = detectPlatformAndArch();

		const analyticsData = {
			channel: currentChannel,
			platform,
			arch,
			version: appVersion,
			appVersion,
		};

		await trackUpdateCheckApi(analyticsData);
		console.log("[hotswap-analytics] Tracked update check:", analyticsData);
	} catch (error) {
		console.warn("[hotswap-analytics] Error tracking update check:", error);
	}
}

async function runPostUpdateCallbacks(): Promise<void> {
	const userId = readStoredUserId();
	const requests: Promise<void>[] = [trackUpdateCheck()];

	if (userId) {
		requests.push(registerPresenceApi(userId));
	}

	await Promise.allSettled(requests);
}

export async function autoCheckAndInstallUpdate(): Promise<void> {
	if (!isHotswapAvailable()) {
		return;
	}

	try {
		const result = await checkForHotswapUpdate();

		// Skip if binary update is required (user needs to manually download APK)
		if (result.requiresBinaryUpdate) {
			console.log(
				"[hotswap] Binary update required, skipping auto-install:",
				result.notes,
			);
			return;
		}

		if (result.available) {
			console.log("[hotswap] Auto-installing available update...");
			await installHotswapUpdate();
			await runPostUpdateCallbacks();

			console.log("[hotswap] Applying update immediately...");
			window.location.reload();
		}
	} catch (error) {
		console.error("[hotswap] Auto-update check failed:", error);
	}
}

export async function setHotswapChannel(channel: HotswapChannel): Promise<void> {
	currentChannel = channel;
	window.localStorage.setItem(HOTSWAP_CHANNEL_STORAGE_KEY, channel);

	if (!isHotswapAvailable()) {
		return;
	}

	await configure({ channel });
}

export async function checkForHotswapUpdate(): Promise<HotswapCheckResult> {
	if (!isHotswapAvailable()) {
		return { available: false, requiresBinaryUpdate: false, notes: null };
	}

	// Track update checks during normal polling
	void trackUpdateCheck();

	const result = await checkUpdate();
	const parsedNotes = parseBinaryRequiredNotes(result.notes);

	return {
		available: result.available,
		requiresBinaryUpdate: parsedNotes.requiresBinaryUpdate,
		notes: parsedNotes.message,
	};
}

export async function installHotswapUpdate(): Promise<void> {
	if (!isHotswapAvailable()) {
		return;
	}

	await applyUpdate();
}
