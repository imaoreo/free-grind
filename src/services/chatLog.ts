/**
 * chatLog.ts — local-first message persistence.
 *
 * Backed entirely by chatDb.ts (SQLite) so unsent messages, messages from
 * blocked users, and expired media URLs remain accessible even after they
 * disappear from the Grindr API. No JSON files are read or written — this
 * module is just a thin, write-queue-serialized merge layer over chatDb.
 */

import type { Message } from "../types/messages";
import * as chatDb from "./chatDb";
import { appLog } from "../utils/logger";

let writeQueue: Promise<void> = Promise.resolve();

export type ChatLogData = {
	messages: Message[];
	lastReadTimestamp?: number | null;
};

/**
 * Read all locally stored messages and metadata for a conversation.
 * Returns an empty structure if nothing is stored yet.
 */
export async function readLog(conversationId: string): Promise<ChatLogData> {
	try {
		const [messages, lastReadTimestamp] = await Promise.all([
			chatDb.getMessages(conversationId),
			chatDb.getLastReadTimestamp(conversationId),
		]);
		return { messages, lastReadTimestamp };
	} catch (error) {
		appLog.error(`[chatLog] readLog failed for ${conversationId}`, error);
		return { messages: [] };
	}
}

/**
 * Merge incoming messages and metadata into the persisted log for a conversation.
 *
 * - New messages are stored.
 * - Existing messages are updated, except:
 *   - if the stored copy has a resolved image URL (body.url) and the
 *     incoming copy does not, the stored URL is preserved so cached media
 *     survives API expiry.
 *   - if the incoming copy is an unsend (unsent: true, empty body) and we
 *     already had real content cached, the content is kept and the row is
 *     flagged local_history instead of being wiped — it remains visible,
 *     just marked as locally-retained history.
 * - lastReadTimestamp is updated if provided.
 *
 * Only the incoming subset is read/written (not every message ever stored
 * for the conversation) — already-persisted rows are left untouched.
 */
export async function appendMessages(
	conversationId: string,
	messages: Message[],
	lastReadTimestamp?: number | null,
): Promise<void> {
	if (!messages.length && lastReadTimestamp === undefined) return;

	const run = async () => {
		try {
			const existing = messages.length
				? await chatDb.getMessages(conversationId)
				: [];
			const existingById = new Map(existing.map((m) => [m.messageId, m] as const));
			const unsendWipeMessageIds: string[] = [];

			const merged = messages.map((m) => {
				const prev = existingById.get(m.messageId);
				if (!prev) {
					return m;
				}
				const prevBody = prev.body as Record<string, unknown> | null | undefined;
				const newBody = m.body as Record<string, unknown> | null | undefined;

				if (m.unsent && !newBody && prevBody) {
					unsendWipeMessageIds.push(m.messageId);
					return { ...prev, unsent: true };
				}

				if (prevBody?.url && !newBody?.url) {
					return { ...m, body: { ...newBody, url: prevBody.url } };
				}
				return m;
			});

			if (merged.length) {
				await chatDb.upsertMessages(conversationId, merged);
			}

			for (const messageId of unsendWipeMessageIds) {
				await chatDb.setMessageLocalHistory(messageId, true);
			}

			if (lastReadTimestamp !== undefined) {
				await chatDb.setLastReadTimestamp(conversationId, lastReadTimestamp);
			}
		} catch (error) {
			appLog.error(`[chatLog] appendMessages failed for ${conversationId}`, error);
		}
	};

	writeQueue = writeQueue.then(run, run);
	return writeQueue;
}

/**
 * Export all locally stored messages across all conversations.
 *
 * Returns an object keyed by conversationId, each value being the array of
 * stored messages. Conversations with empty logs are omitted.
 */
export async function exportAllLogs(): Promise<Record<string, Message[]>> {
	try {
		return await chatDb.exportAllMessages();
	} catch (error) {
		appLog.error("[chatLog] exportAllLogs failed", error);
		return {};
	}
}

/**
 * Remove local history for one conversation (messages + last-read marker).
 * This is a manual, user-initiated wipe (e.g. "Clear local history") — the
 * conversation row itself (archive state, pinned/favorite, etc.) is untouched.
 */
export async function clearLog(conversationId: string): Promise<void> {
	try {
		await chatDb.clearMessagesForConversation(conversationId);
	} catch (error) {
		appLog.error(`[chatLog] clearLog failed for ${conversationId}`, error);
	}
}

/**
 * Remove a single message from local storage (e.g. after a successful
 * "delete message" — without this, the message would resurface on the next
 * load since the API merge treats anything missing from the response but
 * present locally as a message that should be retained).
 */
export async function removeMessage(messageId: string): Promise<void> {
	try {
		await chatDb.deleteMessageRow(messageId);
	} catch (error) {
		appLog.error(`[chatLog] removeMessage failed for ${messageId}`, error);
	}
}
