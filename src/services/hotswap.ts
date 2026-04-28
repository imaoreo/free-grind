import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	applyUpdate,
	checkUpdate,
	configure,
	notifyReady,
} from "tauri-plugin-hotswap-api";

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
