import { isTauri } from "@tauri-apps/api/core";
import {
	applyUpdate,
	checkUpdate,
	configure,
	notifyReady,
} from "tauri-plugin-hotswap-api";

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
