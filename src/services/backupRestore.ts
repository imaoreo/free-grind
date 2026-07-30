import { invoke } from "@tauri-apps/api/core";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { BaseDirectory, mkdir, open, remove, writeFile as writeFsFile } from "@tauri-apps/plugin-fs";

/**
 * Mirrors `EXPORT_TABLES[].category` in `src-tauri/src/commands/backup.rs` —
 * keep the two lists in sync.
 */
export type BackupCategoryId =
	| "chat_messages"
	| "media_albums"
	| "saved_phrases"
	| "saved_locations"
	| "settings"
	| "sexual_health";

export const BACKUP_CATEGORY_IDS: BackupCategoryId[] = [
	"chat_messages",
	"media_albums",
	"saved_phrases",
	"saved_locations",
	"settings",
	"sexual_health",
];

export type BackupInspection =
	| { ok: true; categories: BackupCategoryId[]; exportedAt: number }
	| { ok: false; error: "wrong_owner" | "invalid_format" };

export type ImportBackupResult = { ok: true; rowsImported: number } | { ok: false; error: "wrong_owner" | "invalid_format" };

const BACKUP_TEMP_DIR = "backup-tmp";

async function tempZipPath(prefix: string): Promise<string> {
	await mkdir(BACKUP_TEMP_DIR, { baseDir: BaseDirectory.AppCache, recursive: true });
	return join(await appCacheDir(), BACKUP_TEMP_DIR, `${prefix}-${crypto.randomUUID()}.zip`);
}

export function newExportTempPath(): Promise<string> {
	return tempZipPath("export");
}

/** Copies a picked `File` to a scratch path on disk, streamed so a large archive never sits fully in WebView memory. */
export async function copyPickedFileToTemp(file: File): Promise<string> {
	const path = await tempZipPath("import");
	await writeFsFile(path, file.stream());
	return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
	await remove(path).catch(() => {});
}

/** Reads a file back off disk in chunks, for handing to a streaming writer (Android SAF / desktop). */
export async function* readFileInChunks(path: string): AsyncGenerator<Uint8Array> {
	const file = await open(path, { read: true });
	try {
		const CHUNK_SIZE = 512 * 1024;
		while (true) {
			const buffer = new Uint8Array(CHUNK_SIZE);
			const bytesRead = await file.read(buffer);
			if (bytesRead === null) break;
			yield bytesRead === CHUNK_SIZE ? buffer : buffer.slice(0, bytesRead);
		}
	} finally {
		await file.close();
	}
}

export function exportBackupToFile(
	dbFileName: string,
	ownerUserId: number,
	destPath: string,
	categories: BackupCategoryId[],
): Promise<void> {
	return invoke("export_backup_to_file", { dbFileName, ownerUserId, destPath, categories });
}

export function inspectBackupFile(srcPath: string, ownerUserId: number): Promise<BackupInspection> {
	return invoke("inspect_backup_file", { srcPath, ownerUserId });
}

export function importBackupFile(
	dbFileName: string,
	ownerUserId: number,
	srcPath: string,
	categories: BackupCategoryId[],
): Promise<ImportBackupResult> {
	return invoke("import_backup_from_file", { dbFileName, ownerUserId, srcPath, categories });
}
