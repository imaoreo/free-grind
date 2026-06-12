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
import { isTauriRuntime } from "./tauriWebSocket";
import { appLog } from "../utils/logger";

const ALBUM_NAME = "Free Grind";
const SAVE_DIR = "fg-media-save";

export function isIos(): boolean {
	if (!isTauriRuntime()) return false;
	try {
		return platform() === "ios";
	} catch {
		return false;
	}
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
 * Sequentially!!! saves a list of media items, with a tiny bitty delay between each
 * to avoid triggerin the CDN/API. On iOS, items are saved to the photo
 * library. On other platforms, each item triggers a browser download (thats how it was before)
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
			if (isIos()) {
				const saved = await saveMediaToGallery(url, type);
				if (saved) succeeded++;
				else failed++;
			} else {
				downloadFile(url);
				succeeded++;
			}
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
