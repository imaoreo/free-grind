/**
 * diagnostics.ts — storage health snapshot for diagnosing lag over time.
 *
 * Measures the on-disk size of every persistent store the app writes to:
 *   - chat-log/  (AppData JSON files)
 *   - SQLite chat_contact_index DB + WAL + SHM files
 *   - IndexedDB interest views (entry count)
 *   - localStorage (estimated byte size)
 *
 * Call runDiagnostics() once; the result is a plain object you can log or
 * display in developer mode.
 */

import { BaseDirectory, exists, readDir, stat } from "@tauri-apps/plugin-fs";
import { interestViewsStore } from "./interestViewsStore";
import { getLocalProfileId } from "../utils/profile";
import { appLog } from "../utils/logger";

export type StoreDiagnostic = {
	label: string;
	fileCount?: number;
	bytes: number;
	formattedSize: string;
	note?: string;
};

export type DiagnosticsSnapshot = {
	takenAt: string;
	takenAtMs: number;
	stores: StoreDiagnostic[];
	idbViewCount: number;
	localStorageBytes: number;
	localStorageFormatted: string;
	totalBytes: number;
	totalFormatted: string;
};

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function safeStatSize(path: string, baseDir: BaseDirectory): Promise<number> {
	try {
		const fileExists = await exists(path, { baseDir });
		if (!fileExists) return 0;
		const info = await stat(path, { baseDir });
		return info.size ?? 0;
	} catch {
		return 0;
	}
}

async function measureChatLogs(): Promise<StoreDiagnostic> {
	try {
		const dirExists = await exists("chat-log", { baseDir: BaseDirectory.AppData });
		if (!dirExists) {
			return { label: "chat-log/ files", fileCount: 0, bytes: 0, formattedSize: "0 B", note: "directory not found" };
		}

		const entries = await readDir("chat-log", { baseDir: BaseDirectory.AppData });
		let totalBytes = 0;
		let fileCount = 0;

		await Promise.all(
			entries.map(async (entry) => {
				if (entry.isFile) {
					const bytes = await safeStatSize(`chat-log/${entry.name}`, BaseDirectory.AppData);
					totalBytes += bytes;
					fileCount++;
				}
			}),
		);

		return {
			label: "chat-log/ files",
			fileCount,
			bytes: totalBytes,
			formattedSize: formatBytes(totalBytes),
		};
	} catch (error) {
		appLog.warn("[diagnostics] chat-log measure failed", error);
		return { label: "chat-log/ files", bytes: 0, formattedSize: "error", note: String(error) };
	}
}

async function measureSqlite(): Promise<StoreDiagnostic[]> {
	const profileId = getLocalProfileId();
	const baseName = `chat_contact_index_${profileId}.sqlite3`;

	const files = [
		{ suffix: "", label: "SQLite DB" },
		{ suffix: "-wal", label: "SQLite WAL" },
		{ suffix: "-shm", label: "SQLite SHM" },
	];

	const results: StoreDiagnostic[] = [];

	for (const { suffix, label } of files) {
		const path = `${baseName}${suffix}`;
		const bytes = await safeStatSize(path, BaseDirectory.AppData);
		results.push({ label, bytes, formattedSize: formatBytes(bytes) });
	}

	return results;
}

function measureLocalStorage(): number {
	try {
		let total = 0;
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i) ?? "";
			const value = localStorage.getItem(key) ?? "";
			total += key.length + value.length;
		}
		// localStorage stores UTF-16, so multiply by 2 for byte estimate
		return total * 2;
	} catch {
		return 0;
	}
}

export async function runDiagnostics(): Promise<DiagnosticsSnapshot> {
	appLog.info("[diagnostics] running storage snapshot...");

	const [chatLogs, sqliteFiles, idbViews] = await Promise.all([
		measureChatLogs(),
		measureSqlite(),
		interestViewsStore.getAll().then((rows) => rows.length).catch(() => 0),
	]);

	const lsBytes = measureLocalStorage();
	const stores: StoreDiagnostic[] = [chatLogs, ...sqliteFiles];
	const totalBytes = stores.reduce((sum, s) => sum + s.bytes, 0) + lsBytes;

	const snapshot: DiagnosticsSnapshot = {
		takenAt: new Date().toISOString(),
		takenAtMs: Date.now(),
		stores,
		idbViewCount: idbViews,
		localStorageBytes: lsBytes,
		localStorageFormatted: formatBytes(lsBytes),
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
	};

	appLog.info("[diagnostics] snapshot complete", {
		totalFormatted: snapshot.totalFormatted,
		chatLogFiles: chatLogs.fileCount,
		chatLogSize: chatLogs.formattedSize,
		sqliteWal: sqliteFiles.find((f) => f.label === "SQLite WAL")?.formattedSize,
		idbViewCount: idbViews,
	});

	return snapshot;
}
