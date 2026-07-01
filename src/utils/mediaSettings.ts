// Backed by the active profile's db, kept in an in-memory cache so it can be
// checked synchronously from plain service modules (mediaStore.ts,
// albumStore.ts) that aren't part of the React tree — mirrors the pattern in
// utils/autoblock.ts.
import { getSetting, setSetting } from "../services/chatDb";

const AUTO_DOWNLOAD_MEDIA_KEY = "autoDownloadMedia";

let autoDownloadMediaCache = false;

export async function loadMediaSettingsCache(): Promise<void> {
	try {
		autoDownloadMediaCache = (await getSetting<boolean>(AUTO_DOWNLOAD_MEDIA_KEY)) === true;
	} catch {
		autoDownloadMediaCache = false;
	}
}

export function isAutoDownloadMediaEnabled(): boolean {
	return autoDownloadMediaCache;
}

export async function setAutoDownloadMediaEnabled(value: boolean): Promise<void> {
	autoDownloadMediaCache = value;
	await setSetting(AUTO_DOWNLOAD_MEDIA_KEY, value);
}
