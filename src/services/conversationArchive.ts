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
import { consumeSelfBlockAction } from "../utils/selfBlockActions";

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

// The server (or a flaky WS reconnect) can redeliver the same
// chat.v1.conversation.delete event for a conversation within milliseconds
// of the first one. Since the only way we tell block from unblock is by
// flipping current local state, a redelivered duplicate would flip it right
// back — producing an endless blocked/unblocked/blocked/... spam of system
// messages. Guard against that two ways: skip exact redeliveries we've
// already seen by notificationId, and skip any event for a conversation
// that was processed moments ago even if its notificationId is new/null.
const DUPLICATE_EVENT_WINDOW_MS = 15_000;
const lastProcessedAt = new Map<string, number>();
const seenNotificationIds = new Map<string, number>();
const NOTIFICATION_ID_TTL_MS = 10 * 60_000;

function pruneSeenNotificationIds(now: number) {
	for (const [id, seenAt] of seenNotificationIds) {
		if (now - seenAt > NOTIFICATION_ID_TTL_MS) {
			seenNotificationIds.delete(id);
		}
	}
}

/**
 * Lets a caller that just archived/unarchived a conversation directly (e.g.
 * blocking someone from an open chat, applied immediately rather than
 * waiting on the WS round-trip) preempt the matching chat.v1.conversation.delete
 * echo that will still arrive shortly after — without this, that echo would
 * read local state as "already archived" and flip it right back to unarchived.
 */
export function markConversationDeleteHandled(conversationId: string): void {
	lastProcessedAt.set(conversationId, Date.now());
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
	notificationId?: string | null,
): Promise<{ archived: string[]; unarchived: string[]; systemMessages: Message[] }> {
	const archived: string[] = [];
	const unarchived: string[] = [];
	const systemMessages: Message[] = [];
	const now = Date.now();

	if (notificationId) {
		pruneSeenNotificationIds(now);
		if (seenNotificationIds.has(notificationId)) {
			appLog.debug(
				`[conversation-archive] ignoring redelivered notification ${notificationId}`,
			);
			return { archived, unarchived, systemMessages };
		}
		seenNotificationIds.set(notificationId, now);
	}

	const dedupedIds = conversationIds.filter((conversationId) => {
		const last = lastProcessedAt.get(conversationId);
		if (last != null && now - last < DUPLICATE_EVENT_WINDOW_MS) {
			appLog.debug(
				`[conversation-archive] ignoring duplicate conversation.delete for ${conversationId}`,
			);
			return false;
		}
		lastProcessedAt.set(conversationId, now);
		return true;
	});
	await Promise.all(
		dedupedIds.map(async (conversationId) => {
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
			// visible in the chat log when this happened. Distinguish "we did
			// this" from "this was done to us" using the self-action tracker.
			const isSelf = consumeSelfBlockAction(conversationId, isUnblock ? "unblock" : "block");
			try {
				const message = await chatDb.insertSystemMessage(
					conversationId,
					isUnblock
						? isSelf
							? "SystemUnblockedBySelf"
							: "SystemUnblocked"
						: isSelf
							? "SystemBlockedBySelf"
							: "SystemBlocked",
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
