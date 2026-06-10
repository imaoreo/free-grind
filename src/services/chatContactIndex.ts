import Database from "@tauri-apps/plugin-sql";
import type {
	ChatContactIndexRecord,
	GridContactIndexInput,
	InboxContactIndexInput,
} from "../types/chat-contact-index";
import { appLog } from "../utils/logger";
import { getLocalProfileId } from "../utils/profile";

export const CHAT_CONTACT_INDEX_UPDATED_EVENT = "fg:chat-contact-index-updated";

function getDbName(): string {
	return `sqlite:chat_contact_index_${getLocalProfileId()}.sqlite3`;
}
const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const SQLITE_LOCK_RETRY_DELAYS_MS = [30, 80, 180, 350] as const;

type ChatContactIndexRow = {
	profile_id: string;
	conversation_id: string | null;
	last_message_timestamp: number | null;
	unread_count: number;
	has_chatted: number | boolean;
	updated_at: number;
};

type LocalNicknameRow = {
	profile_id: string;
	local_nickname: string;
};

let dbPromise: Promise<Database> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function getDb(): Promise<Database> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const db = await Database.load(getDbName());
			// Enable WAL mode and a reasonable busy timeout to improve concurrency.
			// Note: We avoid manual BEGIN transactions because the Tauri plugin uses a connection pool
			// without session affinity, which makes manual transactions unreliable.
			try {
				await db.execute("PRAGMA journal_mode = WAL");
				await db.execute("PRAGMA synchronous = NORMAL");
				await db.execute(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
				// Checkpoint every 200 pages (~800 KB) instead of the default 1000 pages (~4 MB).
				// This keeps the WAL small so reads don't have to scan a huge log file.
				await db.execute("PRAGMA wal_autocheckpoint = 200");
				// Run an immediate passive checkpoint to flush any existing WAL backlog.
				await db.execute("PRAGMA wal_checkpoint(PASSIVE)");
			} catch (error) {
				appLog.warn("[chat-index] failed to set pragmas", error);
			}

			// Ensure tables are created inside the serialized queue.
			await executeWithLockRetry(db, "init-tables", async () => {
				await db.execute(`
				CREATE TABLE IF NOT EXISTS chat_contact_index (
					profile_id TEXT PRIMARY KEY,
					conversation_id TEXT,
					last_message_timestamp INTEGER,
					unread_count INTEGER NOT NULL DEFAULT 0,
					has_chatted INTEGER NOT NULL DEFAULT 0,
					updated_at INTEGER NOT NULL
				)
			`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_chat_contact_index_updated_at ON chat_contact_index(updated_at DESC)",
				);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_chat_contact_index_last_message ON chat_contact_index(last_message_timestamp DESC)",
				);
				await db.execute(`
				CREATE TABLE IF NOT EXISTS chat_local_profile_meta (
					profile_id TEXT PRIMARY KEY,
					local_nickname TEXT NOT NULL,
					updated_at INTEGER NOT NULL
				)
			`);
				await db.execute(
					"CREATE INDEX IF NOT EXISTS idx_chat_local_profile_meta_updated_at ON chat_local_profile_meta(updated_at DESC)",
				);
			});

			// Periodic checkpoint every 2 minutes to keep the WAL from growing
			// between the autocheckpoint page-count triggers.
			const checkpointInterval = setInterval(async () => {
				try {
					await db.execute("PRAGMA wal_checkpoint(PASSIVE)");
				} catch {
					// Non-fatal — will retry next interval
				}
			}, 2 * 60 * 1000);
			// Don't prevent process exit
			if (typeof checkpointInterval === "object") (checkpointInterval as any).unref?.();

			return db;
		})();
	}

	return dbPromise;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function isSqliteLockedError(error: unknown): boolean {
	if (typeof error !== "string") {
		const message = error instanceof Error ? error.message : JSON.stringify(error);
		if (!message) {
			return false;
		}
		return /database is locked|\(code:\s*(5|517)\)/i.test(message);
	}

	return /database is locked|\(code:\s*(5|517)\)/i.test(error);
}

async function executeWithLockRetry(
	_db: Database,
	label: string,
	run: () => Promise<void>,
): Promise<void> {
	const queuedRun = async () => {
		const maxAttempts = SQLITE_LOCK_RETRY_DELAYS_MS.length + 1;

		for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
			try {
				await run();
				if (attempt > 1) {
					appLog.warn("[chat-index] recovered from sqlite lock", {
						label,
						attempt,
					});
				}
				return;
			} catch (error) {
				const locked = isSqliteLockedError(error);
				if (!locked || attempt >= maxAttempts) {
					throw error;
				}

				const delayMs = SQLITE_LOCK_RETRY_DELAYS_MS[attempt - 1] ?? 400;
				appLog.warn("[chat-index] sqlite lock during write, retrying", {
					label,
					attempt,
					delayMs,
				});
				await sleep(delayMs);
			}
		}
	};

	const current = writeQueue.then(queuedRun, queuedRun);
	writeQueue = current.then(() => undefined, () => undefined);
	await current;
}

export async function initChatContactIndex(): Promise<void> {
	await getDb();
}

export async function upsertChatContactIndexFromInbox(
	entries: InboxContactIndexInput[],
): Promise<void> {
	if (entries.length === 0) {
		return;
	}

	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-from-inbox", async () => {
		for (const entry of entries) {
			const profileId = entry.profileId.trim();
			if (!profileId) {
				continue;
			}

			await db.execute(
				`
			INSERT INTO chat_contact_index (
				profile_id,
				conversation_id,
				last_message_timestamp,
				unread_count,
				has_chatted,
				updated_at
			) VALUES ($1, $2, $3, $4, 1, $5)
			ON CONFLICT(profile_id) DO UPDATE SET
				conversation_id = COALESCE(excluded.conversation_id, chat_contact_index.conversation_id),
				last_message_timestamp = CASE
					WHEN excluded.last_message_timestamp IS NULL THEN chat_contact_index.last_message_timestamp
					WHEN chat_contact_index.last_message_timestamp IS NULL THEN excluded.last_message_timestamp
					WHEN excluded.last_message_timestamp > chat_contact_index.last_message_timestamp THEN excluded.last_message_timestamp
					ELSE chat_contact_index.last_message_timestamp
				END,
				unread_count = CASE
					WHEN excluded.last_message_timestamp IS NULL THEN chat_contact_index.unread_count
					WHEN chat_contact_index.last_message_timestamp IS NULL THEN excluded.unread_count
					WHEN excluded.last_message_timestamp > chat_contact_index.last_message_timestamp THEN excluded.unread_count
					ELSE chat_contact_index.unread_count
				END,
				has_chatted = 1,
				updated_at = excluded.updated_at
			`,
				[
					profileId,
					entry.conversationId,
					entry.lastMessageTimestamp,
					Math.max(0, entry.unreadCount ?? 0),
					now,
				],
			);
		}
	});

	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(CHAT_CONTACT_INDEX_UPDATED_EVENT));
	}
}

export async function upsertChatContactIndexFromGrid(
	entries: GridContactIndexInput[],
): Promise<void> {
	if (entries.length === 0) {
		return;
	}

	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "upsert-from-grid", async () => {
		for (const entry of entries) {
			const profileId = entry.profileId.trim();
			if (!profileId) {
				continue;
			}

			const unreadCount = Math.max(0, entry.unreadCount ?? 0);

			await db.execute(
				`
			INSERT INTO chat_contact_index (
				profile_id,
				conversation_id,
				last_message_timestamp,
				unread_count,
				has_chatted,
				updated_at
			) VALUES ($1, NULL, NULL, $2, CASE WHEN $2 > 0 THEN 1 ELSE 0 END, $3)
			ON CONFLICT(profile_id) DO UPDATE SET
				has_chatted = CASE
					WHEN chat_contact_index.has_chatted = 1 THEN 1
					WHEN excluded.unread_count > 0 THEN 1
					ELSE 0
				END,
				updated_at = excluded.updated_at
			`,
				[profileId, unreadCount, now],
			);
		}
	});

	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(CHAT_CONTACT_INDEX_UPDATED_EVENT));
	}
}

export async function getChatContactIndexForProfiles(
	profileIds: string[],
): Promise<ChatContactIndexRecord[]> {
	if (profileIds.length === 0) {
		return [];
	}

	const db = await getDb();
	const ids = profileIds.map((id) => id.trim()).filter(Boolean);
	if (ids.length === 0) {
		return [];
	}

	const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
	const rows = await db.select<ChatContactIndexRow[]>(
		`
		SELECT
			profile_id,
			conversation_id,
			last_message_timestamp,
			unread_count,
			has_chatted,
			updated_at
		FROM chat_contact_index
		WHERE profile_id IN (${placeholders})
		`,
		ids,
	);

	/*
	appLog.debug("[chat-index] hydrate", {
		queried: ids.length,
		matched: rows.length,
		hasChattedCount: rows.filter((r) => Boolean(r.has_chatted)).length,
	});
	*/

	return rows.map((row) => ({
		profileId: row.profile_id,
		conversationId: row.conversation_id,
		lastMessageTimestamp: row.last_message_timestamp,
		unreadCount: row.unread_count,
		hasChatted: Boolean(row.has_chatted),
		updatedAt: row.updated_at,
	}));
}

export function indexChatContactRecordsByProfileId(
	records: ChatContactIndexRecord[],
): Record<string, ChatContactIndexRecord> {
	const next: Record<string, ChatContactIndexRecord> = {};
	for (const record of records) {
		next[record.profileId] = record;
	}
	return next;
}

/**
 * Increment the unread count for a profile in the local index.
 * Useful for realtime message arrivals when the full inbox isn't being reloaded.
 */
export async function incrementUnreadCountForProfile(
	profileId: string,
	conversationId: string,
	lastMessageTimestamp: number,
): Promise<void> {
	const normalizedProfileId = profileId?.trim();
	if (!normalizedProfileId || normalizedProfileId === "undefined" || normalizedProfileId === "null") {
		return;
	}

	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "increment-unread", async () => {
		await db.execute(
			`
			INSERT INTO chat_contact_index (
				profile_id,
				conversation_id,
				last_message_timestamp,
				unread_count,
				has_chatted,
				updated_at
			) VALUES ($1, $2, $3, 1, 1, $4)
			ON CONFLICT(profile_id) DO UPDATE SET
				conversation_id = COALESCE(excluded.conversation_id, chat_contact_index.conversation_id),
				last_message_timestamp = CASE
					WHEN excluded.last_message_timestamp > COALESCE(chat_contact_index.last_message_timestamp, 0)
					THEN excluded.last_message_timestamp
					ELSE chat_contact_index.last_message_timestamp
				END,
				unread_count = chat_contact_index.unread_count + 1,
				has_chatted = 1,
				updated_at = excluded.updated_at
			`,
			[normalizedProfileId, conversationId, lastMessageTimestamp, now],
		);
	});

	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(CHAT_CONTACT_INDEX_UPDATED_EVENT));
	}
}

/**
 * Reset the unread count to zero for a profile in the local index.
 */
export async function clearUnreadCountForProfile(
	profileId: string,
): Promise<void> {
	const normalizedProfileId = profileId.trim();
	if (!normalizedProfileId) {
		return;
	}

	const db = await getDb();
	const now = Date.now();

	await executeWithLockRetry(db, "clear-unread", async () => {
		await db.execute(
			`
			INSERT INTO chat_contact_index (
				profile_id,
				conversation_id,
				last_message_timestamp,
				unread_count,
				has_chatted,
				updated_at
			) VALUES ($1, NULL, NULL, 0, 1, $2)
			ON CONFLICT(profile_id) DO UPDATE SET
				unread_count = 0,
				has_chatted = 1,
				updated_at = excluded.updated_at
			`,
			[normalizedProfileId, now],
		);
	});

	if (typeof window !== "undefined") {
		window.dispatchEvent(new CustomEvent(CHAT_CONTACT_INDEX_UPDATED_EVENT));
	}
}

export async function getProfileIdForConversation(
	conversationId: string,
): Promise<string | null> {
	const db = await getDb();
	const rows = await db.select<{ profile_id: string }[]>(
		`SELECT profile_id FROM chat_contact_index WHERE conversation_id = $1 LIMIT 1`,
		[conversationId],
	);
	return rows[0]?.profile_id ?? null;
}

export async function setLocalNicknameForProfile(
	profileId: string,
	nickname: string | null,
): Promise<void> {
	const normalizedProfileId = profileId.trim();
	if (!normalizedProfileId) {
		return;
	}

	const normalizedNickname = nickname?.trim() ?? "";
	const db = await getDb();

	await executeWithLockRetry(db, "set-local-nickname", async () => {
		if (!normalizedNickname) {
			await db.execute(
				"DELETE FROM chat_local_profile_meta WHERE profile_id = $1",
				[normalizedProfileId],
			);
			return;
		}

		await db.execute(
			`
			INSERT INTO chat_local_profile_meta (
				profile_id,
				local_nickname,
				updated_at
			) VALUES ($1, $2, $3)
			ON CONFLICT(profile_id) DO UPDATE SET
				local_nickname = excluded.local_nickname,
				updated_at = excluded.updated_at
			`,
			[normalizedProfileId, normalizedNickname, Date.now()],
		);
	});
}

export async function getLocalNicknamesForProfiles(
	profileIds: string[],
): Promise<Record<string, string>> {
	if (profileIds.length === 0) {
		return {};
	}

	const ids = profileIds.map((id) => id.trim()).filter(Boolean);
	if (ids.length === 0) {
		return {};
	}

	const db = await getDb();
	const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
	const rows = await db.select<LocalNicknameRow[]>(
		`
		SELECT profile_id, local_nickname
		FROM chat_local_profile_meta
		WHERE profile_id IN (${placeholders})
		`,
		ids,
	);

	const next: Record<string, string> = {};
	for (const row of rows) {
		const nickname = row.local_nickname.trim();
		if (nickname) {
			next[row.profile_id] = nickname;
		}
	}

	return next;
}
