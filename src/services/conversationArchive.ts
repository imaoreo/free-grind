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

// A synthetic, locally-generated block/unblock marker (see chatDb.insertSystemMessage)
// was inserted — dispatched so any mounted chat UI can append it live.
export const CHAT_SYSTEM_MESSAGE_EVENT = "fg:chat-system-message";
// A conversation's archived flag changed — dispatched so any mounted chat UI
// (which keeps its own in-memory archived-conversations map) can stay in
// sync without needing a bespoke update at every call site.
export const CHAT_ARCHIVE_STATE_EVENT = "fg:chat-archive-state";

export type ChatArchiveStateChangeDetail =
	| { conversationId: string; archived: true; reason: ArchivedReason }
	| { conversationId: string; archived: false };

function dispatchArchiveStateChange(detail: ChatArchiveStateChangeDetail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<ChatArchiveStateChangeDetail>(CHAT_ARCHIVE_STATE_EVENT, { detail }),
	);
}

export async function archiveConversation(
	conversationId: string,
	reason: ArchivedReason,
): Promise<void> {
	try {
		await chatDb.setConversationArchived(conversationId, true, reason);
		dispatchArchiveStateChange({ conversationId, archived: true, reason });
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
		dispatchArchiveStateChange({ conversationId, archived: false });
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
 *
 * It also fires when the *other profile* was deleted or banned — not a
 * block at all. The chat message endpoints don't surface that (a 404 there
 * just means "the conversation/message doesn't exist", block or not); the
 * only reliable signal is whether the profile itself still comes back from
 * a profile lookup (the same "not found = filtered out of the response"
 * pattern used for stale album shares in SettingsAlbumsPage). `isProfileFound`,
 * when given, is checked on *both* directions:
 * - about to archive: profile gone -> "not_found" (skip the misleading
 *   "You were blocked" marker), profile found -> real block as before.
 * - about to unarchive: profile still gone -> this isn't really an unblock
 *   (or a stale/duplicate event) -> stay archived instead of flipping to
 *   an unblocked state that isn't true.
 */
export async function toggleArchiveOnConversationDelete(
	conversationIds: string[],
	notificationId?: string | null,
	isProfileFound?: (profileId: string) => Promise<boolean>,
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

			// Default to "found" (i.e. a real block/unblock, not a deletion)
			// when there's no profile to check or the check itself fails —
			// matches the prior behavior and errs toward the far more common
			// case.
			const profileFound =
				isProfileFound && existing?.otherProfileId
					? await isProfileFound(existing.otherProfileId).catch(() => true)
					: true;

			if (isUnblock) {
				if (!profileFound) {
					appLog.debug(
						`[conversation-archive] ${conversationId}'s profile still not found — not treating this as an unblock`,
					);
					if (existing?.archivedReason !== "not_found") {
						await archiveConversation(conversationId, "not_found");
					}
					return;
				}
				await unarchiveConversation(conversationId);
				unarchived.push(conversationId);
			} else {
				const reason: ArchivedReason = profileFound ? "ws_delete" : "not_found";
				await archiveConversation(conversationId, reason);
				archived.push(conversationId);
				if (reason === "not_found") {
					// Genuinely gone (the profile was deleted/banned), not a
					// block — the archived banner already explains that via
					// the "not_found" reason, so skip the "You were blocked"
					// marker instead of leaving a misleading one in history.
					return;
				}
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

/**
 * Applies the immediate, local side effects of a self-triggered block/unblock:
 * archives (or unarchives) the conversation with this profile right away
 * instead of waiting on the chat.v1.conversation.delete round-trip, leaves a
 * "You blocked/unblocked this person" marker, and preempts that round-trip's
 * echo so it can't flip the state back. Called from the block/unblock
 * mutations themselves (see useProfileQueries.ts) so every entry point —
 * chat header, grid, profile page, blocked-list settings — behaves the same
 * way, not just the ones that happen to have a chat thread open.
 */
export async function applySelfBlockAction(
	profileId: string,
	action: "block" | "unblock",
): Promise<void> {
	const stored = await chatDb.findConversationByProfileId(profileId).catch(() => null);
	if (!stored) {
		return;
	}

	const { conversationId } = stored;
	markConversationDeleteHandled(conversationId);

	if (action === "block") {
		await archiveConversation(conversationId, "ws_delete");
	} else {
		await unarchiveConversation(conversationId);
	}

	try {
		const message = await chatDb.insertSystemMessage(
			conversationId,
			action === "block" ? "SystemBlockedBySelf" : "SystemUnblockedBySelf",
		);
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: [message] }),
			);
		}
	} catch (error) {
		appLog.error(
			`[conversation-archive] failed to insert self ${action} system message for ${conversationId}`,
			error,
		);
	}
}

// Any incoming WS activity from a profile whose conversation is currently
// archived (typing, a read receipt, a tap, a view, a message) is a live
// signal that they might be reachable again — recheck and pull the
// conversation out of archive if so, rather than waiting for the next
// chat.v1.conversation.delete, inbox reload, or profile-page visit. Cheap in
// the common case: findConversationByProfileId is a local read, and the
// network profile lookup only runs for conversations that are archived.
const RECHECK_COOLDOWN_MS = 30_000;
const lastRecheckedAt = new Map<string, number>();

export async function reconcileArchivedConversationForProfile(
	profileId: string,
	isProfileFound: (profileId: string) => Promise<boolean>,
): Promise<void> {
	const stored = await chatDb.findConversationByProfileId(profileId).catch(() => null);
	if (!stored?.archived) {
		return;
	}

	const now = Date.now();
	const last = lastRecheckedAt.get(profileId);
	if (last != null && now - last < RECHECK_COOLDOWN_MS) {
		return;
	}
	lastRecheckedAt.set(profileId, now);

	const found = await isProfileFound(profileId).catch(() => false);
	if (!found) {
		return;
	}

	const { conversationId } = stored;
	markConversationDeleteHandled(conversationId);
	await unarchiveConversation(conversationId);

	try {
		const message = await chatDb.insertSystemMessage(conversationId, "SystemUnblocked");
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: [message] }),
			);
		}
	} catch (error) {
		appLog.error(
			`[conversation-archive] failed to insert unblocked system message for ${conversationId}`,
			error,
		);
	}
}
