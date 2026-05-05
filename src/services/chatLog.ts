/**
 * chatLog.ts — local-first message persistence.
 *
 * Stores every message seen in the app to $APPDATA/chat-log/{conversationId}.json
 * so that unsent messages, messages from blocked users, and expired media URLs
 * remain accessible even after they disappear from the Grindr API.
 */

import {
	BaseDirectory,
	exists,
	mkdir,
	readDir,
	readTextFile,
	remove,
	writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { Message } from "../types/messages";

const LOG_DIR = "chat-log";

async function ensureDir(): Promise<void> {
	const dirExists = await exists(LOG_DIR, { baseDir: BaseDirectory.AppData });
	if (!dirExists) {
		await mkdir(LOG_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
	}
}

function safeId(conversationId: string): string {
	// Restrict to filesystem-safe characters.
	return conversationId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function logPath(conversationId: string): string {
	return `${LOG_DIR}/${safeId(conversationId)}.json`;
}

export type ChatLogData = {
	messages: Message[];
	lastReadTimestamp?: number | null;
};

/**
 * Read all locally stored messages and metadata for a conversation.
 * Returns an empty structure if no log exists yet.
 */
export async function readLog(conversationId: string): Promise<ChatLogData> {
	try {
		const path = logPath(conversationId);
		const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
		if (!fileExists) return { messages: [] };
		const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
		const parsed: unknown = JSON.parse(text);

		if (Array.isArray(parsed)) {
			// Backward compatibility: old format was just the array of messages.
			return { messages: parsed as Message[] };
		}

		if (parsed && typeof parsed === "object" && "messages" in parsed) {
			return parsed as ChatLogData;
		}

		return { messages: [] };
	} catch {
		return { messages: [] };
	}
}

/**
 * Merge incoming messages and metadata into the persisted log for a conversation.
 *
 * - New messages are added.
 * - Existing messages are updated, except: if the stored copy has a resolved
 *   image URL (body.url) and the incoming copy does not, the stored URL is
 *   preserved so cached media survives API expiry.
 * - lastReadTimestamp is updated if provided.
 */
export async function appendMessages(
	conversationId: string,
	messages: Message[],
	lastReadTimestamp?: number | null,
): Promise<void> {
	if (!messages.length && lastReadTimestamp === undefined) return;
	try {
		await ensureDir();
		const existingData = await readLog(conversationId);
		const existing = existingData.messages;
		const map = new Map<string, Message>();
		for (const m of existing) {
			map.set(m.messageId, m);
		}
		for (const m of messages) {
			const prev = map.get(m.messageId);
			if (prev) {
				const prevBody = prev.body as
					| Record<string, unknown>
					| null
					| undefined;
				const newBody = m.body as Record<string, unknown> | null | undefined;
				// Preserve a previously cached media URL if the new copy lost it.
				if (prevBody?.url && !newBody?.url) {
					map.set(m.messageId, {
						...m,
						body: { ...newBody, url: prevBody.url },
					});
				} else {
					map.set(m.messageId, m);
				}
			} else {
				map.set(m.messageId, m);
			}
		}
		const sorted = [...map.values()].sort((a, b) => a.timestamp - b.timestamp);

		const newData: ChatLogData = {
			messages: sorted,
			lastReadTimestamp:
				lastReadTimestamp !== undefined
					? lastReadTimestamp
					: (existingData.lastReadTimestamp ?? null),
		};

		await writeTextFile(logPath(conversationId), JSON.stringify(newData), {
			baseDir: BaseDirectory.AppData,
		});
	} catch {
		// Best effort only — never block the UI.
	}
}

/**
 * Export all locally stored messages across all conversations.
 *
 * Returns an object keyed by conversationId, each value being the array of
 * stored messages. Conversations with empty logs are omitted.
 */
export async function exportAllLogs(): Promise<Record<string, Message[]>> {
	const result: Record<string, Message[]> = {};

	try {
		const dirExists = await exists(LOG_DIR, { baseDir: BaseDirectory.AppData });
		if (!dirExists) return result;

		const entries = await readDir(LOG_DIR, { baseDir: BaseDirectory.AppData });

		await Promise.all(
			entries
				.filter((entry) => entry.name?.endsWith(".json"))
				.map(async (entry) => {
					const name = entry.name!;
					const conversationId = name.slice(0, -5); // strip .json
					try {
						const text = await readTextFile(`${LOG_DIR}/${name}`, {
							baseDir: BaseDirectory.AppData,
						});
						const parsed: unknown = JSON.parse(text);
						if (Array.isArray(parsed) && parsed.length > 0) {
							result[conversationId] = parsed as Message[];
						} else if (
							parsed &&
							typeof parsed === "object" &&
							"messages" in parsed &&
							Array.isArray((parsed as any).messages)
						) {
							result[conversationId] = (parsed as any).messages;
						}
					} catch {
						// Skip unreadable files.
					}
				}),
		);
	} catch {
		// Return whatever was collected.
	}

	return result;
}

/**
 * Remove local history for one conversation.
 */
export async function clearLog(conversationId: string): Promise<void> {
	try {
		const path = logPath(conversationId);
		const fileExists = await exists(path, { baseDir: BaseDirectory.AppData });
		if (!fileExists) {
			return;
		}
		await remove(path, { baseDir: BaseDirectory.AppData });
	} catch {
		// Best effort only.
	}
}
