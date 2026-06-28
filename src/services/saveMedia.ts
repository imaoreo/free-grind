import { platform } from "@tauri-apps/plugin-os";
import { fetch } from "@tauri-apps/plugin-http";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile, remove, BaseDirectory } from "@tauri-apps/plugin-fs";
import {
	requestPhotosAuth,
	getPhotosAuthStatus,
	PhotosAuthorizationStatus,
	requestAlbums,
	createAlbum,
	createPhotos,
	createVideos,
	PHAssetCollectionType,
	PHAssetCollectionSubtype,
} from "@gbyte/tauri-plugin-ios-photos";
import { AndroidFs, AndroidPublicGeneralPurposeDir } from "tauri-plugin-android-fs-api";
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

const ALBUM_NAME = "Free Grind";
const SAVE_DIR = "fg-media-save";
const FOLDER_NAME = "FreeGrind";

export function isIos(): boolean {
	if (!isTauriRuntime()) return false;
	try {
		return platform() === "ios";
	} catch {
		return false;
	}
}

export function isAndroid(): boolean {
	if (!isTauriRuntime()) return false;
	try {
		return platform() === "android";
	} catch {
		return false;
	}
}

function isDesktopTauri(): boolean {
	return isTauriRuntime() && !isIos() && !isAndroid();
}

async function ensurePhotosAuthorized(): Promise<boolean> {
	let status = await getPhotosAuthStatus();
	if (status !== PhotosAuthorizationStatus.authorized && status !== PhotosAuthorizationStatus.limited) {
		status = await requestPhotosAuth();
	}
	return status === PhotosAuthorizationStatus.authorized || status === PhotosAuthorizationStatus.limited;
}

async function ensureAlbumId(): Promise<string> {
	const albums = await requestAlbums({
		with: PHAssetCollectionType.album,
		subtype: PHAssetCollectionSubtype.albumRegular,
	});
	const existing = albums.find((album) => album.name === ALBUM_NAME);
	if (existing) return existing.id;

	const created = await createAlbum({ title: ALBUM_NAME });
	if (!created) throw new Error("Failed to create photo album");
	return created;
}

function extensionFromUrl(url: string, type: "image" | "video"): string {
	try {
		const pathname = new URL(url).pathname;
		const match = /\.([a-zA-Z0-9]+)$/.exec(pathname);
		if (match) return match[1].toLowerCase();
	} catch {
		// ignore, fall back to default below xd
	}
	return type === "video" ? "mp4" : "jpg";
}

/**
 * // Downloads a remote chat-media URL and saves it to the devices photo
 * // library, in a "Free Grind" album. iOS only.
 */
export async function saveMediaToGallery(url: string, type: "image" | "video"): Promise<boolean> {
	if (!isIos()) return false;

	const authorized = await ensurePhotosAuthorized();
	if (!authorized) {
		appLog.warn("[saveMedia] Photos permission not granted");
		return false;
	}

	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to download media (${response.status})`);
	const bytes = new Uint8Array(await response.arrayBuffer());

	const cache = await appCacheDir();

	try {
		await mkdir(SAVE_DIR, { baseDir: BaseDirectory.AppCache, recursive: true });
	} catch (error) {
		appLog.error("[saveMedia] mkdir failed", error);
		throw error;
	}

	const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionFromUrl(url, type)}`;
	const relativePath = `${SAVE_DIR}/${fileName}`;
	const absolutePath = await join(cache, relativePath);

	try {
		await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppCache });
	} catch (error) {
		appLog.error("[saveMedia] writeFile failed", error);
		throw error;
	}

	try {
		const albumId = await ensureAlbumId();

		const created = type === "video"
			? await createVideos({ album: albumId, files: [absolutePath] })
			: await createPhotos({ album: albumId, files: [absolutePath] });

		if (!created || created.length === 0) {
			throw new Error("Photos library did not return a created asset");
		}
		return true;
	} catch (error) {
		appLog.error("[saveMedia] createPhotos/createVideos failed", error);
		throw error;
	} finally {
		await remove(relativePath, { baseDir: BaseDirectory.AppCache }).catch((error) => {
			appLog.warn("[saveMedia] Failed to clean up temp file", error);
		});
	}
}

async function fetchMediaBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string | null }> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to download media (${response.status})`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	return { bytes, contentType: response.headers.get("content-type") };
}

function mimeTypeFor(type: "image" | "video", extension: string, contentType: string | null): string {
	if (contentType) return contentType.split(";")[0].trim();
	if (type === "video") return extension === "mov" ? "video/quicktime" : "video/mp4";
	return extension === "png" ? "image/png" : "image/jpeg";
}

/**
 * Saves a remote chat-media URL into the public Downloads collection via
 * MediaStore, in a "FreeGrind" sub-folder. Android only.
 */
async function saveMediaToGalleryAndroid(url: string, type: "image" | "video"): Promise<boolean> {
	const { bytes, contentType } = await fetchMediaBytes(url);
	const extension = extensionFromUrl(url, type);
	const mimeType = mimeTypeFor(type, extension, contentType);
	const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
	const relativePath = `${FOLDER_NAME}/${fileName}`;

	const uri = type === "video"
		? await AndroidFs.createNewPublicVideoFile(AndroidPublicGeneralPurposeDir.Download, relativePath, mimeType, { isPending: true })
		: await AndroidFs.createNewPublicImageFile(AndroidPublicGeneralPurposeDir.Download, relativePath, mimeType, { isPending: true });

	try {
		await AndroidFs.writeFile(uri, bytes);
		await AndroidFs.setPublicFilePending(uri, false);
		await AndroidFs.scanPublicFile(uri);
		return true;
	} catch (error) {
		appLog.error("[saveMedia] Android writeFile/scan failed", error);
		await AndroidFs.removeFile(uri).catch(() => {});
		throw error;
	}
}

/**
 * Saves a remote chat-media URL into the user's Downloads folder, in a
 * "FreeGrind" sub-folder. Desktop (Windows/macOS/Linux) only.
 */
async function saveMediaToFolderDesktop(url: string, type: "image" | "video"): Promise<boolean> {
	const { bytes } = await fetchMediaBytes(url);
	const extension = extensionFromUrl(url, type);
	const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
	const baseDir = BaseDirectory.Download;

	await mkdir(FOLDER_NAME, { baseDir, recursive: true });
	await writeFile(`${FOLDER_NAME}/${fileName}`, bytes, { baseDir });
	return true;
}

const BATCH_DELAY_MS = 400;

export type SaveMediaBatchItem = { url: string; type: "image" | "video" };

export type SaveMediaBatchResult = {
	total: number;
	succeeded: number;
	failed: number;
};

function downloadFile(url: string): void {
	const a = document.createElement("a");
	a.href = url;
	a.download = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	a.target = "_blank";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

/**
 * Saves a single media item natively where possible: iOS -> photo library
 * album, Android/desktop -> Downloads/FreeGrind folder. Falls back to a
 * plain browser download/open outside of Tauri (web preview), and also if
 * the native save itself throws (e.g. missing plugin/permission).
 */
export async function saveMediaToDevice(url: string, type: "image" | "video"): Promise<boolean> {
	if (isIos()) return saveMediaToGallery(url, type);

	if (isAndroid()) {
		try {
			return await saveMediaToGalleryAndroid(url, type);
		} catch (error) {
			appLog.error("[saveMedia] Android save failed, falling back to browser", error);
			downloadFile(url);
			return true;
		}
	}

	if (isDesktopTauri()) {
		try {
			return await saveMediaToFolderDesktop(url, type);
		} catch (error) {
			appLog.error("[saveMedia] Desktop save failed, falling back to browser", error);
			downloadFile(url);
			return true;
		}
	}

	downloadFile(url);
	return true;
}

/**
 * Sequentially!!! saves a list of media items, with a tiny bitty delay between each
 * to avoid triggerin the CDN/API.
 */
export async function saveMediaBatch(
	items: SaveMediaBatchItem[],
	onProgress?: (done: number, total: number) => void,
): Promise<SaveMediaBatchResult> {
	let succeeded = 0;
	let failed = 0;

	for (let i = 0; i < items.length; i++) {
		const { url, type } = items[i];
		try {
			const saved = await saveMediaToDevice(url, type);
			if (saved) succeeded++;
			else failed++;
		} catch (error) {
			appLog.error("[saveMedia] Failed to save item in batch", error);
			failed++;
		}

		onProgress?.(i + 1, items.length);

		if (i < items.length - 1) {
			await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
		}
	}

	return { total: items.length, succeeded, failed };
}
