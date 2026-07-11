/**
 * conversationArchive.ts — archive/unarchive a conversation locally, and
 * track the explicit, durable `block_state` (chatDb.ts) that says who
 * blocked whom.
 *
 * Archiving never deletes anything; it's a flag flip in chatDb.ts. A
 * conversation is archived when the server can no longer produce it (404 on
 * open, or a chat.v1.conversation.delete event — which fires for both being
 * blocked and for unblock, so the only reliable way back is the conversation
 * reappearing in a fresh /v4/inbox response, see ChatPage.tsx's loadInbox).
 *
 * `block_state` exists because chat.v1.conversation.delete alone can't tell
 * "we blocked them" from "they blocked us" from "their profile was deleted"
 * — every caller that determines one of those (a self-triggered mutation, a
 * WS event, a 403 while loading a thread, the auto-block-on-spam path)
 * funnels through claimBlockStateTransition, which atomically checks-and-
 * sets it. Because it's a real column checked against the DB (not a
 * time-windowed heuristic), a duplicate signal is recognized as such no
 * matter how much later it arrives — a redelivered event, a stale in-flight
 * request that resolves after the fact, or another call site altogether.
 */

import * as chatDb from "./chatDb";
import type { ArchivedReason, BlockState } from "../types/chat-db";
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

// Synchronous, in-memory pre-claim so two calls racing within the same tick
// (or a few seconds of each other) can't both pass the DB check inside
// claimBlockStateTransition — without this, both could read the
// pre-transition block_state before either had written the new one back.
const CLAIM_TTL_MS = 5_000;
const pendingBlockStateClaim = new Map<string, { target: BlockState | null; at: number }>();

/**
 * Atomically checks-and-sets a conversation's block_state. Returns true only
 * for the one call that actually performs the transition — every other call
 * (racing within the claim TTL, or arriving any time later once block_state
 * already reflects the target) returns false, so callers can gate archiving
 * and system-message insertion on this instead of re-deriving "did this
 * already happen" from timing or message history.
 */
export async function claimBlockStateTransition(
	conversationId: string,
	target: BlockState | null,
): Promise<boolean> {
	const now = Date.now();
	const pending = pendingBlockStateClaim.get(conversationId);
	if (pending && pending.target === target && now - pending.at < CLAIM_TTL_MS) {
		appLog.debug(
			`[conversation-archive] block_state transition to ${target} for ${conversationId} already claimed`,
		);
		return false;
	}
	pendingBlockStateClaim.set(conversationId, { target, at: now });

	const stored = await chatDb.getConversation(conversationId).catch(() => null);
	if ((stored?.blockState ?? null) === target) {
		appLog.debug(
			`[conversation-archive] ${conversationId} already has block_state ${target}`,
		);
		return false;
	}

	await chatDb.setBlockState(conversationId, target);
	return true;
}

// The server (or a flaky WS reconnect) can redeliver the same
// chat.v1.conversation.delete event for a conversation within milliseconds
// of the first one — skip exact redeliveries we've already seen by
// notificationId, and skip any event for a conversation that was processed
// moments ago even if its notificationId is new/null.
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
 * echo that will still arrive shortly after.
 */
export function markConversationDeleteHandled(conversationId: string): void {
	lastProcessedAt.set(conversationId, Date.now());
}

/**
 * chat.v1.conversation.delete fires for both being blocked and for unblock,
 * with no way to tell which from the payload alone, and also fires when the
 * *other profile* was deleted or banned — not a block at all. Rather than
 * flipping `archived` reactively and guessing the reason afterwards, this
 * determines who's involved first (self marker, the server's own block
 * list, the current `block_state`, and finally a live profile-status check —
 * checkConversationAccessible, when given) and only then archives/unarchives
 * to match. Every actual transition goes through claimBlockStateTransition
 * against the durable `block_state` column, so a duplicate or redelivered
 * signal from any call site, any time later, is always recognized as such
 * instead of leaving a second system message.
 */
// Conversation ids are "{otherProfileId}:{ownProfileId}" (or the reverse —
// whichever isn't our own id is theirs). The stored other_profile_id column
// is only backfilled by upsertConversation from a live /v4/inbox entry's
// participant list, so a conversation that's never been through that yet
// (e.g. one just started, blocked within moments of the first message)
// would otherwise have it null — breaking the isBlockedByMe/
// checkConversationAccessible checks below, which need a profile id to
// check against, silently falling back to the far less reliable
// isProfileFound path instead.
export function deriveOtherProfileIdFromConversationId(
	conversationId: string,
	currentUserId: number | string | null | undefined,
): string | null {
	if (currentUserId == null) return null;
	const parts = conversationId.split(":");
	if (parts.length !== 2) return null;
	const ownId = String(currentUserId);
	if (parts[0] === ownId) return parts[1];
	if (parts[1] === ownId) return parts[0];
	return null;
}

export async function toggleArchiveOnConversationDelete(
	conversationIds: string[],
	notificationId?: string | null,
	isProfileFound?: (profileId: string) => Promise<boolean>,
	isBlockedByMe?: (profileId: string) => Promise<boolean>,
	checkConversationAccessible?: (
		profileId: string,
	) => Promise<"accessible" | "not_found" | "blocked">,
	currentUserId?: number | string | null,
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
	// Determines block direction/attribution first, and only then archives
	// or unarchives to match — rather than flipping `archived` reactively and
	// trying to explain the flip afterwards. Only actually inserts a message
	// when claimBlockStateTransition confirms this is a real transition, so
	// a redelivered or independently-arriving duplicate of this same event
	// (from any call site, any time later) is always recognized as such.
	const insertBlockMessage = async (
		conversationId: string,
		type: "SystemBlocked" | "SystemBlockedBySelf" | "SystemUnblocked" | "SystemUnblockedBySelf",
	) => {
		try {
			const message = await chatDb.insertSystemMessage(conversationId, type);
			systemMessages.push(message);
		} catch (error) {
			appLog.error(
				`[conversation-archive] failed to insert system message for ${conversationId}`,
				error,
			);
		}
	};

	await Promise.all(
		dedupedIds.map(async (conversationId) => {
			const existing = await chatDb.getConversation(conversationId).catch(() => null);
			const currentBlockState = existing?.blockState ?? null;
			const otherProfileId =
				existing?.otherProfileId ??
				deriveOtherProfileIdFromConversationId(conversationId, currentUserId);
			if (otherProfileId && !existing?.otherProfileId) {
				void chatDb.backfillOtherProfileId(conversationId, otherProfileId).catch((error) => {
					appLog.warn(
						`[conversation-archive] failed to backfill other_profile_id for ${conversationId}`,
						error,
					);
				});
			}

			// 1. Self-attribution first — always correct regardless of anything
			// else, since it's set by our own mutation before the request even
			// goes out (see useProfileQueries.ts).
			if (consumeSelfBlockAction(conversationId, "block")) {
				if (await claimBlockStateTransition(conversationId, "blocked_by_me")) {
					await archiveConversation(conversationId, "ws_delete");
					archived.push(conversationId);
					await insertBlockMessage(conversationId, "SystemBlockedBySelf");
				}
				return;
			}
			if (consumeSelfBlockAction(conversationId, "unblock")) {
				if (await claimBlockStateTransition(conversationId, null)) {
					await unarchiveConversation(conversationId);
					unarchived.push(conversationId);
					await insertBlockMessage(conversationId, "SystemUnblockedBySelf");
				}
				return;
			}

			// 2. We already know we're the one who blocked them. A second delete
			// event here isn't necessarily a stale echo of that same block — it's
			// also exactly how an unblock made from *another* device arrives: that
			// device's mutation never set our local self-action marker (only the
			// device that ran the mutation gets one), so step 1 can't catch it.
			// Verify live via isBlockedByMe first, same as the blocked_by_other
			// branch below verifies via checkConversationAccessible, rather than
			// assuming every repeat delivery here means nothing changed.
			if (currentBlockState === "blocked_by_me") {
				const stillBlockedByMe =
					isBlockedByMe && otherProfileId
						? await isBlockedByMe(otherProfileId).catch(() => true)
						: true;
				if (stillBlockedByMe) {
					return;
				}
				if (await claimBlockStateTransition(conversationId, null)) {
					await unarchiveConversation(conversationId);
					unarchived.push(conversationId);
					await insertBlockMessage(conversationId, "SystemUnblockedBySelf");
				}
				return;
			}

			// 3. Cross-device self-block: no local marker exists for a block
			// made from another device/session, but the server's own block
			// list confirms it's us.
			if (
				isBlockedByMe &&
				otherProfileId &&
				(await isBlockedByMe(otherProfileId).catch(() => false))
			) {
				if (await claimBlockStateTransition(conversationId, "blocked_by_me")) {
					await archiveConversation(conversationId, "ws_delete");
					archived.push(conversationId);
					await insertBlockMessage(conversationId, "SystemBlockedBySelf");
				}
				return;
			}

			// 4. Already known blocked by them — a second event here (not our
			// own unblock, not a self-block confirmation) usually means their
			// unblock, but don't just assume that from a second delivery of
			// this same ambiguous event: verify live first (checkConversationAccessible
			// — displayName "4" means still blocked) so a redelivered/stale
			// event can't be misread as an unblock that never actually happened.
			if (currentBlockState === "blocked_by_other") {
				const stillBlocked =
					checkConversationAccessible && otherProfileId
						? (await checkConversationAccessible(otherProfileId).catch(
								() => "accessible" as const,
							)) === "blocked"
						: false;
				if (stillBlocked) {
					appLog.debug(
						`[conversation-archive] ${conversationId} still shows as blocked — ignoring stale/redelivered delete event`,
					);
					return;
				}
				if (await claimBlockStateTransition(conversationId, null)) {
					await unarchiveConversation(conversationId);
					unarchived.push(conversationId);
					await insertBlockMessage(conversationId, "SystemUnblocked");
				}
				return;
			}

			// 5. Neither side currently known-blocked. Check live whether this
			// event means "blocked" or "profile deleted/banned" before deciding
			// what to do. checkConversationAccessible (GET /v7/profiles/:id) gives
			// a specific blocked-vs-gone signal — isProfileFound (a bulk profile
			// lookup) can't reliably tell those apart, since a backend that also
			// hides blocked-you profiles from generic lookups makes a genuine
			// block look identical to a deletion, silently archiving with the
			// wrong reason and skipping the "You were blocked" marker (and,
			// later, the matching "You were unblocked" one too, since block_state
			// never got set). Falls back to isProfileFound's plain found/not-found
			// when unavailable. Default to "accessible" when neither check is
			// conclusive, erring toward the far more common case.
			let status: "accessible" | "not_found" | "blocked";
			if (checkConversationAccessible && otherProfileId) {
				status = await checkConversationAccessible(otherProfileId).catch(
					() => "accessible" as const,
				);
			} else {
				const profileFound =
					isProfileFound && otherProfileId
						? await isProfileFound(otherProfileId).catch(() => true)
						: true;
				status = profileFound ? "accessible" : "not_found";
			}

			if (existing?.archived && existing.archivedReason === "not_found") {
				// Was archived because the profile seemed gone, not because of a
				// block. Still not found: nothing changed. Now shows as blocked:
				// this was mis-attributed before (isProfileFound's bulk lookup
				// couldn't tell a block from a deletion, or checkConversationAccessible
				// wasn't available yet at the time) — correct the record properly
				// instead of just silently unarchiving, so it ends up with the
				// right block_state and the "You were blocked" marker it should
				// have had all along. Otherwise genuinely reachable again: a real
				// reappearance.
				if (status === "not_found") {
					return;
				}
				if (status === "blocked") {
					if (await claimBlockStateTransition(conversationId, "blocked_by_other")) {
						await archiveConversation(conversationId, "ws_delete");
						archived.push(conversationId);
						await insertBlockMessage(conversationId, "SystemBlocked");
					}
					return;
				}
				await unarchiveConversation(conversationId);
				unarchived.push(conversationId);
				return;
			}

			if (status === "not_found") {
				appLog.debug(
					`[conversation-archive] ${conversationId} not found — treating as gone, not a block`,
				);
				if (existing?.archivedReason !== "not_found") {
					await archiveConversation(conversationId, "not_found");
					archived.push(conversationId);
				}
				return;
			}

			// status is "accessible" or "blocked" — either way, a
			// chat.v1.conversation.delete fired for a real reason (not just a
			// profile lookup coming up empty), so treat it as a genuine block
			// by the other party.
			if (await claimBlockStateTransition(conversationId, "blocked_by_other")) {
				await archiveConversation(conversationId, "ws_delete");
				archived.push(conversationId);
				await insertBlockMessage(conversationId, "SystemBlocked");
			}
		}),
	);
	return { archived, unarchived, systemMessages };
}

/**
 * A conversation showing up as new/changed in a fresh inbox-style response
 * (the foreground `/v4/inbox` poll, or inboxSync's background walk) usually
 * means the other party messaged again, or someone unblocked someone. Only
 * trust that signal for a block-related archive (`ws_delete`) with a
 * block_state still set — an archive for another reason (e.g. "not_found")
 * isn't block-related, and a block_state already cleared means something
 * else (most likely the matching WS event) already resolved this for real,
 * so there's nothing left to reconcile. Returns the system message to
 * broadcast, if any transition actually happened.
 */
export async function reconcileReappearedConversation(
	conversationId: string,
	archivedReason: ArchivedReason | null | undefined,
): Promise<Message | null> {
	if (archivedReason !== "ws_delete") {
		return null;
	}
	const stored = await chatDb.getConversation(conversationId).catch(() => null);
	if (!stored?.blockState) {
		return null;
	}
	if (!(await claimBlockStateTransition(conversationId, null).catch(() => false))) {
		return null;
	}
	await unarchiveConversation(conversationId);
	const isSelf = consumeSelfBlockAction(conversationId, "unblock");
	try {
		return await chatDb.insertSystemMessage(
			conversationId,
			isSelf ? "SystemUnblockedBySelf" : "SystemUnblocked",
		);
	} catch (error) {
		appLog.error(
			`[conversation-archive] failed to insert unblocked system message for ${conversationId}`,
			error,
		);
		return null;
	}
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

	// The matching chat.v1.conversation.delete WS event (handled by
	// toggleArchiveOnConversationDelete) can race ahead of this onSuccess
	// callback and get here first — it consults the same onMutate-time self
	// marker, so it already applied this exact transition correctly
	// attributed. claimBlockStateTransition checks the durable block_state
	// column, so this is recognized as a no-op regardless of how that race
	// resolved, or how much later this call lands.
	const claimed = await claimBlockStateTransition(
		conversationId,
		action === "block" ? "blocked_by_me" : null,
	);
	if (!claimed) {
		return;
	}

	if (action === "block") {
		await archiveConversation(conversationId, "ws_delete");
		// This conversation is done for good — no live path will ever mark it
		// read again (see ChatPage's clearUnreadForArchivedEntry, which only
		// helps while a chat page happens to be mounted), so a stale unread
		// count would otherwise stick around forever after blocking from
		// somewhere that isn't chat (grid, profile page, blocked-list settings).
		await chatDb.setConversationUnreadCount(conversationId, 0).catch(() => {});
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

	const claimed = await claimBlockStateTransition(conversationId, null);
	if (!claimed) {
		return;
	}
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

/**
 * Cross-checks every local conversation against the server's own blocked-
 * profile-ids list, both directions:
 * - server lists them, we don't know it yet -> archive + block_state =
 *   'blocked_by_me'. Catches a block made on another device while this
 *   device's app wasn't running at all, so no chat.v1.conversation.delete WS
 *   event or 403 ever had a chance to tell it.
 * - we have them marked 'blocked_by_me', server no longer lists them ->
 *   unarchive + clear block_state. Catches an unblock made on another
 *   device (or missed here for any other reason) the same way.
 *
 * Called whenever useBlockedProfileIds' data changes (see
 * ChatRealtimeBridge.tsx) — typically once at app start, and again on any
 * later refetch (staleTime elapsing, or right after our own block/unblock
 * mutations, where it's a cheap no-op since applySelfBlockAction already
 * handled those synchronously). One local table scan, and
 * claimBlockStateTransition is a no-op for every conversation that's
 * already correctly marked, so re-running this on every data change is
 * inexpensive.
 */
export async function reconcileBlockStateWithBlockedList(
	blockedProfileIds: string[],
): Promise<void> {
	const blockedSet = new Set(blockedProfileIds);
	const conversations = await chatDb.listConversations({ includeArchived: true }).catch(() => []);
	const toReconcile = conversations.filter((c) => {
		if (!c.otherProfileId) return false;
		const shouldBeBlockedByMe = blockedSet.has(c.otherProfileId);
		return shouldBeBlockedByMe
			? c.blockState !== "blocked_by_me"
			: c.blockState === "blocked_by_me";
	});
	if (toReconcile.length === 0) {
		return;
	}

	appLog.debug(
		`[conversation-archive] reconciling ${toReconcile.length} conversation(s) against the server's blocked-profile list`,
	);

	const messages: Message[] = [];
	await Promise.all(
		toReconcile.map(async (conversation) => {
			const shouldBeBlockedByMe = blockedSet.has(conversation.otherProfileId as string);
			const claimed = await claimBlockStateTransition(
				conversation.conversationId,
				shouldBeBlockedByMe ? "blocked_by_me" : null,
			);
			if (!claimed) {
				return;
			}
			try {
				if (shouldBeBlockedByMe) {
					await archiveConversation(conversation.conversationId, "ws_delete");
					const message = await chatDb.insertSystemMessage(
						conversation.conversationId,
						"SystemBlockedBySelf",
					);
					messages.push(message);
				} else {
					await unarchiveConversation(conversation.conversationId);
					const message = await chatDb.insertSystemMessage(
						conversation.conversationId,
						"SystemUnblockedBySelf",
					);
					messages.push(message);
				}
			} catch (error) {
				appLog.error(
					`[conversation-archive] failed to insert reconciled ${shouldBeBlockedByMe ? "block" : "unblock"} message for ${conversation.conversationId}`,
					error,
				);
			}
		}),
	);

	if (messages.length > 0 && typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: messages }),
		);
	}
}
