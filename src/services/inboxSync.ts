/**
 * inboxSync.ts — throttled background sync of the chat list and each
 * changed conversation's latest messages into chatDb, run every time a
 * profile is loaded (app start / login / account switch).
 *
 * The very first run for a profile walks the *entire* inbox (every page) and
 * fetches every conversation's latest messages, then marks that profile as
 * having completed a full sync. Every run after that is incremental: since
 * the inbox is server-sorted pinned-first then most-recently-active-first,
 * a page where nothing is new or updated (every entry's
 * lastActivityTimestamp already matches what's stored) means every deeper
 * page is unchanged too, so paging stops right there instead of re-walking
 * conversations that haven't moved. Latest messages are then only re-fetched
 * for the conversations that page-walk actually found to be new or updated.
 *
 * Deliberately slow and sequential: one request at a time with a delay in
 * between, so it never competes with the foreground chat UI (or the
 * server's rate limits) while the user is actively using the app. All
 * writes go through chatDb's normal idempotent upserts, so if the app
 * closes mid-sync nothing is corrupted.
 *
 * The initial full walk itself is resumable too: after each page is fully
 * processed, the next page number is checkpointed (inboxSyncResumePageV1),
 * so an app restart partway through page 40 of 100 continues at page 40
 * next launch instead of re-walking 1..40 again. The checkpoint is only
 * meaningful before the "done" flag is set — it's reset once the full walk
 * completes, since incremental runs already stop early on their own (see
 * pageHadChange below).
 *
 * The "done" flag only covers the conversation-list walk, not individual
 * message fetches — each conversation row also tracks the
 * lastActivityTimestamp it last had its messages fetched at
 * (messagesSyncedActivityTimestamp, set via chatDb.markConversationMessagesSynced
 * only on a successful fetch). A conversation is re-enqueued for message
 * fetching whenever that doesn't match its current lastActivityTimestamp —
 * whether because it's genuinely new/updated, or because a prior run was
 * interrupted before ever fetching its messages. So an interrupted
 * first-ever run (e.g. the app closed partway through 1800 conversations)
 * resumes on next launch by skipping every conversation already fetched and
 * picking up only where it left off, rather than restarting the multi-hour
 * message-fetch pass from scratch.
 */

import type { createApiFunctions } from "./apiFunctions";
import * as chatDb from "./chatDb";
import { upsertChatContactIndexFromInbox } from "./chatContactIndex";
import { getOtherParticipant } from "../pages/app/chat/chatUtils";
import { appLog } from "../utils/logger";
import {
	reconcileReappearedConversation,
	CHAT_SYSTEM_MESSAGE_EVENT,
} from "./conversationArchive";
import type { Message } from "../types/messages";

type ApiFunctions = ReturnType<typeof createApiFunctions>;

const INBOX_SYNC_DONE_SETTING_KEY = "inboxSyncCompletedV1";
// Only meaningful while the initial full walk (hasCompletedFullSync === false)
// hasn't finished yet — the page to resume the list-walk from next time,
// so an app restart partway through page 40 of 100 continues at 40 instead
// of re-walking 1..40 again. Irrelevant once hasCompletedFullSync is true,
// since incremental runs already stop early via the pageHadChange check.
const INBOX_SYNC_RESUME_PAGE_SETTING_KEY = "inboxSyncResumePageV1";
const PAGE_DELAY_MS = 400;
const MESSAGE_FETCH_DELAY_MS = 2_500;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Live status — a tiny framework-agnostic pub/sub so a Settings screen can
// show progress without polling. Keyed by profile id since chatDb (and so
// the sync) is scoped per profile; readers just ask for whichever profile is
// currently signed in. Snapshots are only ever replaced wholesale (never
// mutated), so a subscriber can safely compare by reference.
// ---------------------------------------------------------------------------

export type InboxSyncStatus =
	| { phase: "idle" }
	| { phase: "syncing_list"; conversationsSoFar: number; changedSoFar: number }
	| { phase: "syncing_messages"; completed: number; total: number }
	| { phase: "done"; conversations: number; changed: number }
	| { phase: "error"; message: string };

const IDLE_STATUS: InboxSyncStatus = { phase: "idle" };

const statusByUser = new Map<number, InboxSyncStatus>();
const statusListeners = new Set<() => void>();

function setStatus(userId: number, status: InboxSyncStatus): void {
	statusByUser.set(userId, status);
	for (const listener of statusListeners) {
		listener();
	}
}

export function getInboxSyncStatus(userId: number | null): InboxSyncStatus {
	if (userId == null) {
		return IDLE_STATUS;
	}
	return statusByUser.get(userId) ?? IDLE_STATUS;
}

export function subscribeInboxSyncStatus(listener: () => void): () => void {
	statusListeners.add(listener);
	return () => {
		statusListeners.delete(listener);
	};
}

// Bumped every time a new sync starts, invalidating whatever run came before
// it — guards against a still-running sync from a previous profile writing
// into the newly active one after a fast account switch (chatDb always
// targets whatever profile setActiveChatDbUser last pointed it at).
let currentToken = 0;
const inFlightByUser = new Map<number, Promise<void>>();

/**
 * Starts (or reuses an already-running) inbox sync for `userId`. Safe — and
 * intended — to call on every profile load: the first run for a profile
 * does a full walk, every run after is incremental (see module docstring).
 */
export function runInboxSync(
	apiFunctions: ApiFunctions,
	userId: number,
	isStillActive: () => boolean,
): Promise<void> {
	const existing = inFlightByUser.get(userId);
	if (existing) {
		return existing;
	}

	currentToken += 1;
	const myToken = currentToken;
	const isStale = () => myToken !== currentToken || !isStillActive();

	const promise = doSync(apiFunctions, userId, isStale).finally(() => {
		inFlightByUser.delete(userId);
	});
	inFlightByUser.set(userId, promise);
	return promise;
}

async function doSync(
	apiFunctions: ApiFunctions,
	userId: number,
	isStale: () => boolean,
): Promise<void> {
	try {
		const hasCompletedFullSync = await chatDb.getSetting<boolean>(INBOX_SYNC_DONE_SETTING_KEY);
		if (isStale()) {
			return;
		}

		const resumePage = hasCompletedFullSync
			? null
			: await chatDb.getSetting<number>(INBOX_SYNC_RESUME_PAGE_SETTING_KEY);
		if (isStale()) {
			return;
		}

		appLog.info("[inbox-sync] starting sync", { userId, hasCompletedFullSync, resumePage });
		setStatus(userId, { phase: "syncing_list", conversationsSoFar: 0, changedSoFar: 0 });

		let conversationsSeen = 0;
		const changedConversations: { conversationId: string; lastActivityTimestamp: number | null }[] = [];

		let page: number | null = resumePage ?? 1;
		while (page != null) {
			if (isStale()) {
				return;
			}

			const response = await apiFunctions.listConversations({ page });

			const contactEntries = response.entries
				.map((entry) => {
					const other = getOtherParticipant(entry, userId);
					if (!other?.profileId) {
						return null;
					}
					return {
						profileId: String(other.profileId),
						conversationId: entry.data.conversationId,
						lastMessageTimestamp: entry.data.lastActivityTimestamp ?? null,
						unreadCount: entry.data.unreadCount ?? 0,
					};
				})
				.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

			if (contactEntries.length > 0) {
				await upsertChatContactIndexFromInbox(contactEntries).catch((error) => {
					appLog.warn("[inbox-sync] failed to persist chat contact index", error);
				});
			}

			let pageHadChange = false;
			const reappearedMessages: Message[] = [];
			for (const entry of response.entries) {
				if (isStale()) {
					return;
				}

				const existing = await chatDb.getConversation(entry.data.conversationId).catch(() => null);
				// "Changed" means either the metadata moved, or messages were never
				// actually fetched for the conversation's current state — the
				// latter is what makes a sync interrupted mid-message-fetch resume
				// correctly instead of silently skipping conversations whose row
				// got upserted but whose messages never landed.
				const isNewOrChanged =
					!existing ||
					existing.entry.data.lastActivityTimestamp !== entry.data.lastActivityTimestamp ||
					existing.messagesSyncedActivityTimestamp !== entry.data.lastActivityTimestamp;

				const other = getOtherParticipant(entry, userId);
				await chatDb
					.upsertConversation(entry, other?.profileId != null ? String(other.profileId) : null)
					.catch((error) => {
						appLog.warn("[inbox-sync] failed to persist conversation", error);
					});

				// This conversation showing up here at all means the server can
				// still produce it — the same "reappeared" signal ChatPage's
				// foreground /v4/inbox poll uses to clear a stale block-related
				// archive. Without this, a block/unblock that happens on another
				// device while this device's WS is disconnected (so neither the
				// live WS path nor the foreground poll ever saw it) leaves the
				// conversation archived — with a stale "blocked" block_state, and
				// so a stale unblock button — forever, even though this background
				// sync just fetched its latest messages successfully.
				if (existing?.archived) {
					const message = await reconcileReappearedConversation(
						entry.data.conversationId,
						existing.archivedReason,
					).catch(() => null);
					if (message) {
						reappearedMessages.push(message);
					}
				}

				conversationsSeen += 1;
				if (isNewOrChanged) {
					pageHadChange = true;
					changedConversations.push({
						conversationId: entry.data.conversationId,
						lastActivityTimestamp: entry.data.lastActivityTimestamp ?? null,
					});
				}
			}
			if (reappearedMessages.length > 0 && typeof window !== "undefined") {
				window.dispatchEvent(
					new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: reappearedMessages }),
				);
			}
			setStatus(userId, {
				phase: "syncing_list",
				conversationsSoFar: conversationsSeen,
				changedSoFar: changedConversations.length,
			});

			if (response.entries.length === 0) {
				break;
			}

			// Once a full walk has happened before, the inbox's sort order
			// (pinned, then most-recently-active first) guarantees a page with
			// no new/updated entries means every page after it is unchanged
			// too — stop instead of re-walking the whole inbox every launch.
			if (hasCompletedFullSync && !pageHadChange) {
				break;
			}

			page = response.nextPage ?? null;
			if (page == null) {
				break;
			}
			if (!hasCompletedFullSync) {
				await chatDb.setSetting(INBOX_SYNC_RESUME_PAGE_SETTING_KEY, page);
			}
			await sleep(PAGE_DELAY_MS);
		}

		appLog.info("[inbox-sync] chat list sync complete, fetching latest messages", {
			userId,
			conversationsSeen,
			changed: changedConversations.length,
		});
		setStatus(userId, { phase: "syncing_messages", completed: 0, total: changedConversations.length });

		for (let i = 0; i < changedConversations.length; i += 1) {
			if (isStale()) {
				return;
			}
			const { conversationId, lastActivityTimestamp } = changedConversations[i];
			try {
				const response = await apiFunctions.listMessages({ conversationId });
				if (response.messages.length > 0) {
					await chatDb.upsertMessages(conversationId, response.messages);
				}
				// Only recorded on success — a failed fetch leaves this
				// conversation looking "not yet synced" so the next run (whether
				// that's a retry moments later or after the app was closed and
				// reopened) picks it back up instead of silently giving up on it.
				await chatDb.markConversationMessagesSynced(conversationId, lastActivityTimestamp);
			} catch (error) {
				appLog.warn("[inbox-sync] failed to fetch/persist latest messages", {
					conversationId,
					error,
				});
			}
			setStatus(userId, {
				phase: "syncing_messages",
				completed: i + 1,
				total: changedConversations.length,
			});
			await sleep(MESSAGE_FETCH_DELAY_MS);
		}

		if (!isStale()) {
			if (!hasCompletedFullSync) {
				await chatDb.setSetting(INBOX_SYNC_DONE_SETTING_KEY, true);
				await chatDb.setSetting(INBOX_SYNC_RESUME_PAGE_SETTING_KEY, 1);
			}
			const totalConversations = await chatDb
				.listConversations({ includeArchived: true })
				.then((rows) => rows.length)
				.catch(() => conversationsSeen);
			setStatus(userId, {
				phase: "done",
				conversations: totalConversations,
				changed: changedConversations.length,
			});
			appLog.info("[inbox-sync] sync finished", {
				userId,
				conversations: totalConversations,
				changed: changedConversations.length,
			});
		}
	} catch (error) {
		appLog.error("[inbox-sync] sync failed", { userId, error });
		setStatus(userId, {
			phase: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
}
