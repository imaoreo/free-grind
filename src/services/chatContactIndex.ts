import Database from "@tauri-apps/plugin-sql";
import type {
	ChatContactIndexRecord,
	GridContactIndexInput,
	InboxContactIndexInput,
} from "../types/chat-contact-index";
import { appLog } from "../utils/logger";

const CHAT_INDEX_DB = "sqlite:chat_contact_index.sqlite3";

type ChatContactIndexRow = {
	profile_id: string;
	conversation_id: string | null;
	last_message_timestamp: number | null;
	unread_count: number;
	has_chatted: number | boolean;
	updated_at: number;
};

let dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
	if (!dbPromise) {
		dbPromise = (async () => {
			const db = await Database.load(CHAT_INDEX_DB);
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
			return db;
		})();
	}

	return dbPromise;
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
				unread_count = COALESCE(excluded.unread_count, chat_contact_index.unread_count),
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

	appLog.debug("[chat-index] upsert from inbox", { count: entries.length });
}

export async function upsertChatContactIndexFromGrid(
	entries: GridContactIndexInput[],
): Promise<void> {
	if (entries.length === 0) {
		return;
	}

	const db = await getDb();
	const now = Date.now();

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
				unread_count = CASE
					WHEN excluded.unread_count > chat_contact_index.unread_count THEN excluded.unread_count
					ELSE chat_contact_index.unread_count
				END,
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

	appLog.debug("[chat-index] hydrate", {
		queried: ids.length,
		matched: rows.length,
		hasChattedCount: rows.filter((r) => Boolean(r.has_chatted)).length,
	});

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
