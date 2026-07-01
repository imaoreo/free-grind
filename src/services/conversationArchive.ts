/**
 * conversationArchive.ts — archive/unarchive a conversation locally.
 *
 * Archiving never deletes anything; it's a flag flip in chatDb.ts. A
 * conversation is archived when the server can no longer produce it (404 on
 * open, or a chat.v1.conversation.delete event — which fires for both being
 * blocked and for unblock, so the only reliable way back is the conversation
 * reappearing in a fresh /v4/inbox response, see ChatPage.tsx's loadInbox).
 */

import * as chatDb from "./chatDb";
import type { ArchivedReason } from "../types/chat-db";
import type { Message } from "../types/messages";
import { appLog } from "../utils/logger";

export async function archiveConversation(
	conversationId: string,
	reason: ArchivedReason,
): Promise<void> {
	try {
		await chatDb.setConversationArchived(conversationId, true, reason);
	} catch (error) {
		appLog.error(`[conversation-archive] failed to archive ${conversationId}`, error);
	}
}

export async function archiveConversations(
	conversationIds: string[],
	reason: ArchivedReason,
): Promise<void> {
	await Promise.all(
		conversationIds.map((conversationId) => archiveConversation(conversationId, reason)),
	);
}

export async function unarchiveConversation(conversationId: string): Promise<void> {
	try {
		await chatDb.setConversationArchived(conversationId, false, null);
	} catch (error) {
		appLog.error(`[conversation-archive] failed to unarchive ${conversationId}`, error);
	}
}

/**
 * chat.v1.conversation.delete fires for both being blocked and for unblock,
 * with no way to tell which from the payload alone. Use current local state
 * as the disambiguator: the first such event for a conversation is the
 * block (not yet archived -> archive it); a second one for an already
 * archived conversation can only be the matching unblock -> unarchive it.
 */
export async function toggleArchiveOnConversationDelete(
	conversationIds: string[],
): Promise<{ archived: string[]; unarchived: string[]; systemMessages: Message[] }> {
	const archived: string[] = [];
	const unarchived: string[] = [];
	const systemMessages: Message[] = [];
	await Promise.all(
		conversationIds.map(async (conversationId) => {
			const existing = await chatDb.getConversation(conversationId).catch(() => null);
			const isUnblock = existing?.archived === true;
			if (isUnblock) {
				await unarchiveConversation(conversationId);
				unarchived.push(conversationId);
			} else {
				await archiveConversation(conversationId, "ws_delete");
				archived.push(conversationId);
			}
			// Leave a local marker in the conversation's own history so it's
			// visible in the chat log when this happened.
			try {
				const message = await chatDb.insertSystemMessage(
					conversationId,
					isUnblock ? "SystemUnblocked" : "SystemBlocked",
				);
				systemMessages.push(message);
			} catch (error) {
				appLog.error(
					`[conversation-archive] failed to insert system message for ${conversationId}`,
					error,
				);
			}
		}),
	);
	return { archived, unarchived, systemMessages };
}
