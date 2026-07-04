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
 * closes mid-sync nothing is corrupted — an interrupted first-ever run
 * simply retries in full next launch, since only a completed one persists
 * the "done" flag.
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

/**
 * Whether it's currently safe to page further through chatDb instead of the
 * live `/v4/inbox` endpoint (e.g. ChatPage's "load more" pagination).
 *
 * Deliberately checks the *live* in-memory status, not just "has this
 * profile ever finished a full sync" — a profile can be fully synced from a
 * prior session and still be mid-catch-up right now (e.g. the app sat
 * closed long enough that several pages' worth of new/changed conversations
 * piled up server-side; runInboxSync walks through all of them before
 * settling, not just the first page). Scrolling to load more *during* that
 * catch-up would otherwise serve an incomplete batch straight from a chatDb
 * that hasn't caught up yet. Only once this session's run has actually
 * settled to "done" is chatDb guaranteed current.
 */
export function isSafeToPageInboxLocally(userId: number | null): boolean {
	return getInboxSyncStatus(userId).phase === "done";
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

		appLog.info("[inbox-sync] starting sync", { userId, hasCompletedFullSync });
		setStatus(userId, { phase: "syncing_list", conversationsSoFar: 0, changedSoFar: 0 });

		let conversationsSeen = 0;
		const changedConversationIds: string[] = [];

		let page: number | null = 1;
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
				const isNewOrChanged =
					!existing || existing.entry.data.lastActivityTimestamp !== entry.data.lastActivityTimestamp;

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
					changedConversationIds.push(entry.data.conversationId);
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
				changedSoFar: changedConversationIds.length,
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
			await sleep(PAGE_DELAY_MS);
		}

		appLog.info("[inbox-sync] chat list sync complete, fetching latest messages", {
			userId,
			conversationsSeen,
			changed: changedConversationIds.length,
		});
		setStatus(userId, { phase: "syncing_messages", completed: 0, total: changedConversationIds.length });

		for (let i = 0; i < changedConversationIds.length; i += 1) {
			if (isStale()) {
				return;
			}
			const conversationId = changedConversationIds[i];
			try {
				const response = await apiFunctions.listMessages({ conversationId });
				if (response.messages.length > 0) {
					await chatDb.upsertMessages(conversationId, response.messages);
				}
			} catch (error) {
				appLog.warn("[inbox-sync] failed to fetch/persist latest messages", {
					conversationId,
					error,
				});
			}
			setStatus(userId, {
				phase: "syncing_messages",
				completed: i + 1,
				total: changedConversationIds.length,
			});
			await sleep(MESSAGE_FETCH_DELAY_MS);
		}

		if (!isStale()) {
			if (!hasCompletedFullSync) {
				await chatDb.setSetting(INBOX_SYNC_DONE_SETTING_KEY, true);
			}
			const totalConversations = await chatDb
				.listConversations({ includeArchived: true })
				.then((rows) => rows.length)
				.catch(() => conversationsSeen);
			setStatus(userId, {
				phase: "done",
				conversations: totalConversations,
				changed: changedConversationIds.length,
			});
			appLog.info("[inbox-sync] sync finished", {
				userId,
				conversations: totalConversations,
				changed: changedConversationIds.length,
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
