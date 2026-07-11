/**
 * ChatRealtimeBridge — runs the chat WebSocket app-wide while the user is
 * authenticated, so incoming messages always trigger an in-app toast
 * regardless of the current route.
 *
 * Architecture:
 * - Owns the singleton ChatRealtimeManager (previously owned by ChatPage).
 * - Re-broadcasts envelopes and status changes via window CustomEvents
 *   (`fg:chat-realtime-event`, `fg:chat-realtime-status`) so ChatPage can
 *   keep its live UI in sync without holding its own connection.
 * - Persists incoming messages to chatLog and shows a toast — suppressed
 *   when the user is already viewing the conversation in the foreground or
 *   when the message was sent by the current user.
 * - Foreground system notifications: since this WebSocket delivers events
 *   instantly while FCM always carries relay delay, incoming messages/taps
 *   trigger an OS notification right here (only while the document is
 *   visible — backgrounded delivery stays on FCM). Desktop/iOS go through
 *   `notifyLocal()`; Android goes through the native `FreeGrindBridge`, whose
 *   `NotificationPoster` dedupes against the later FCM push for the same
 *   message/tap so it never shows twice.
 */

import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useAuth } from "../contexts/useAuth";
import { useApi } from "../hooks/useApi";
import { ChatRealtimeManager, setActiveRealtimeManager } from "../services/chatRealtime";
import { TauriWebSocket, isTauriRuntime } from "../services/tauriWebSocket";
import * as chatLog from "../services/chatLog";
import {
	incrementUnreadCountForProfile,
	clearUnreadCountForProfile,
} from "../services/chatContactIndex";
import {
	toggleArchiveOnConversationDelete,
	reconcileArchivedConversationForProfile,
	reconcileBlockStateWithBlockedList,
	CHAT_SYSTEM_MESSAGE_EVENT,
	CHAT_ARCHIVE_STATE_EVENT,
	type ChatArchiveStateChangeDetail,
} from "../services/conversationArchive";
import { messageSchema, type Message } from "../types/messages";
import type { RealtimeEnvelope, RealtimeStatus } from "../types/chat-realtime";
import { appLog } from "../utils/logger";
import {
	getMediaCaptureTarget,
	getOtherParticipant,
	getMessagePreviewLabel,
	getMessageImageUrl,
	getGaymojiUrl,
} from "../pages/app/chat/chatUtils";
import { fetchAndStoreMedia } from "../services/mediaStore";
import { captureAlbumsForMessages } from "../services/albumStore";
import { captureReplyPreviewsForMessages } from "../services/replyMediaStore";
import { getConversation, getDisplayName } from "../services/conversationDirectory";
import { runAutomationRulesForSender } from "../utils/automationRules";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useBlockedProfileIds } from "../hooks/queries/useProfileQueries";
import { isReadReceiptsHidden } from "../utils/privacy";
import { classifyProfileAccess } from "../utils/profileAccessStatus";
import {
	isChatNotificationsEnabled,
	isForegroundNotificationsEnabled,
	isTapNotificationsEnabled,
} from "../utils/notificationSettings";
import { notifyLocal, clearChatNotifications } from "../services/localNotify";

let cachedIsAndroid: boolean | null = null;
function isAndroidRuntime(): boolean {
	if (cachedIsAndroid != null) return cachedIsAndroid;
	if (!isTauriRuntime()) {
		cachedIsAndroid = false;
		return false;
	}
	try {
		cachedIsAndroid = platform() === "android";
	} catch {
		cachedIsAndroid = false;
	}
	return cachedIsAndroid;
}

function isAppForeground(): boolean {
	return typeof document === "undefined" || document.visibilityState === "visible";
}

export const CHAT_REALTIME_EVENT = "fg:chat-realtime-event";
export const CHAT_REALTIME_STATUS = "fg:chat-realtime-status";
export const TAP_RECEIVED_EVENT = "fg:tap-received";
export const VIEW_RECEIVED_EVENT = "fg:view-received";
export const TYPING_STATUS_EVENT = "fg:typing-status";
export const VIDEO_CALL_INCOMING_EVENT = "fg:video-call-incoming";
export const VIDEO_CALL_ENDED_EVENT = "fg:video-call-ended";
// Re-exported so existing importers (e.g. ChatPage.tsx) don't need to change
// where they pull this from — conversationArchive.ts is now the source of
// truth since it also dispatches this event from applySelfBlockAction.
export { CHAT_SYSTEM_MESSAGE_EVENT };

export type TypingStatusDetail = {
	conversationId: string;
	profileId: string;
	status: "Typing" | "Cleared" | "Sent";
};

export type VideoCallIncomingDetail = {
	channelId: string;
	senderId: string;
};

function parseIncomingCallPayload(payload: unknown): VideoCallIncomingDetail | null {
	if (!payload || typeof payload !== "object") return null;
	const r = payload as Record<string, unknown>;
	const channelId = typeof r.channelId === "string" ? r.channelId : null;
	const sender = r.senderId;
	const senderId =
		typeof sender === "string" ? sender : typeof sender === "number" ? String(sender) : null;
	if (!channelId || !senderId) return null;
	return { channelId, senderId };
}

export type VideoCallEndedDetail = {
	channelId: string;
	senderId: string;
	recipientId: string;
	result: string;
	duration: number;
};

function parseCallEndedPayload(payload: unknown): VideoCallEndedDetail | null {
	if (!payload || typeof payload !== "object") return null;
	const r = payload as Record<string, unknown>;
	const channelId = typeof r.channelId === "string" ? r.channelId : null;
	if (!channelId) return null;
	const toId = (v: unknown): string =>
		typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
	const duration = typeof r.duration === "number" ? r.duration : Number(r.duration) || 0;
	const result = typeof r.result === "string" ? r.result : "UNKNOWN";
	return {
		channelId,
		senderId: toId(r.senderId),
		recipientId: toId(r.recipientId),
		result,
		duration,
	};
}

// Global cache to allow late-mounting components (like ChatPage) to see the
// current connection status immediately.
let lastKnownStatus: RealtimeStatus = "idle";
export function getChatRealtimeStatus(): RealtimeStatus {
	return lastKnownStatus;
}

function dispatchStatus(status: RealtimeStatus) {
	// appLog.debug("[chat-ws:bridge] dispatchStatus", { status });
	lastKnownStatus = status;
	window.dispatchEvent(
		new CustomEvent<RealtimeStatus>(CHAT_REALTIME_STATUS, {
			detail: status,
		}),
	);
}

export type TapReceivedDetail = {
	profileId: string;
	displayName: string;
	imageHash: string | null;
	timestamp: number;
	tapType: number | null;
	isMutual: boolean;
};

function parseTapPayload(payload: unknown): TapReceivedDetail | null {
	if (!payload || typeof payload !== "object") return null;
	const r = payload as Record<string, unknown>;
	const sender = r.senderId;
	const profileId =
		typeof sender === "string"
			? sender
			: typeof sender === "number"
				? String(sender)
				: null;
	if (!profileId) return null;
	const ts = r.timestamp;
	const timestamp =
		typeof ts === "number"
			? ts
			: typeof ts === "string" && ts !== ""
				? Number(ts)
				: Date.now();
	const display =
		typeof r.senderDisplayName === "string" && r.senderDisplayName.trim()
			? r.senderDisplayName.trim()
			: "";
	const image =
		typeof r.senderProfileImageHash === "string" && r.senderProfileImageHash
			? r.senderProfileImageHash
			: null;
	const tapType =
		typeof r.tapType === "number"
			? r.tapType
			: typeof r.tapType === "string" && r.tapType !== ""
				? Number(r.tapType)
				: null;
	return {
		profileId,
		displayName: display,
		imageHash: image,
		timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
		tapType: Number.isFinite(tapType as number) ? (tapType as number) : null,
		isMutual: r.isMutual === true,
	};
}

export type ViewReceivedDetail = {
	profileId: string;
	imageHash: string | null;
	timestamp: number;
	viewedCount: number;
};

function parseViewPayload(payload: unknown): ViewReceivedDetail | null {
	if (!payload || typeof payload !== "object") return null;
	const r = payload as Record<string, unknown>;
	const mostRecent = r.mostRecent as Record<string, unknown> | undefined;
	if (!mostRecent) return null;

	return {
		profileId: String(mostRecent.profileId),
		imageHash: (mostRecent.photoHash as string) || null,
		timestamp: Number(mostRecent.timestamp) || Date.now(),
		viewedCount: Number(r.viewedCount) || 0,
	};
}

function extractMessages(envelope: RealtimeEnvelope): Message[] {
	const candidates: Message[] = [];

	const direct = messageSchema.safeParse(envelope.payload);
	if (direct.success) {
		candidates.push(direct.data);
	}

	for (const payload of [envelope.payload, envelope.data, envelope]) {
		if (!payload || typeof payload !== "object") continue;
		const record = payload as Record<string, unknown>;
		if (record.message) {
			const parsed = messageSchema.safeParse(record.message);
			if (parsed.success) candidates.push(parsed.data);
		}
		if (Array.isArray(record.messages)) {
			for (const candidate of record.messages) {
				const parsed = messageSchema.safeParse(candidate);
				if (parsed.success) candidates.push(parsed.data);
			}
		}
	}

	const seen = new Set<string>();
	return candidates.filter((m) => {
		if (seen.has(m.messageId)) return false;
		seen.add(m.messageId);
		return true;
	});
}

export function ChatRealtimeBridge() {
	const { userId, settingsReady } = useAuth();
	const { callMethod } = useApi();
    const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const location = useLocation();
	const { t } = useTranslation();

	const callMethodRef = useRef(callMethod);
	useEffect(() => {
		callMethodRef.current = callMethod;
	}, [callMethod]);

	const tRef = useRef(t);
	useEffect(() => {
		tRef.current = t;
	}, [t]);

	const pathRef = useRef(location.pathname);
	useEffect(() => {
		pathRef.current = location.pathname;
	}, [location.pathname]);

	const userIdRef = useRef<number | null>(userId);
	useEffect(() => {
		userIdRef.current = userId;
	}, [userId]);

	// tap.v1.tap_sent and tap.v2.tap_sent can both fire for the same real tap
	// during the server's version rollout — dedupe by sender within a short
	// window so we don't double-toast/double-notify for one tap.
	const recentTapSendersRef = useRef<Map<string, number>>(new Map());
	const shouldProcessIncomingTap = useCallback((profileId: string) => {
		const now = Date.now();
		const seen = recentTapSendersRef.current;
		for (const [key, seenAt] of seen) {
			if (now - seenAt > 10_000) {
				seen.delete(key);
			}
		}
		if (seen.has(profileId)) {
			return false;
		}
		seen.set(profileId, now);
		return true;
	}, []);

	// A profile still existing (isProfileFound) doesn't mean a conversation
	// archived by *our own* block should reopen — we chose that, and merely
	// receiving a stray/in-flight WS event for them (e.g. a read receipt
	// that was already in transit when the block landed) shouldn't undo it.
	// Only reconcile activity for profiles we haven't blocked ourselves.
	const { data: blockedProfileIdsData } = useBlockedProfileIds(userId != null);
	const blockedProfileIdsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		blockedProfileIdsRef.current = new Set(blockedProfileIdsData ?? []);
	}, [blockedProfileIdsData]);

	// Catches a block or unblock made on another device while this device's
	// app wasn't running at all, or otherwise missed here (so no WS event or
	// 403 ever had a chance to tell it) — see reconcileBlockStateWithBlockedList.
	// Runs whenever the blocked-profile-ids data actually changes (a new
	// array reference only happens on genuine query success), typically once
	// at app start and again on any later refetch. Gated on settingsReady,
	// not just userId, so this can't run against the previous account's
	// chatDb file (or the pre-login legacy one) while setActiveChatDbUser is
	// still switching — it would read/write the wrong conversations table.
	useEffect(() => {
		if (userId == null || !settingsReady || !blockedProfileIdsData) {
			return;
		}
		void reconcileBlockStateWithBlockedList(blockedProfileIdsData);
	}, [userId, settingsReady, blockedProfileIdsData]);

	// A conversation getting unarchived anywhere (this component's own WS
	// handling, ChatPage's foreground reappearance check, or inboxSync's
	// background walk) can mean a block cleared on another device — refresh
	// the blocked-profile-ids cache so the chat header's unblock button
	// (isBlockedBySelf in ChatPage) doesn't keep showing stale state that
	// nothing else would otherwise think to refetch for up to its 10-minute
	// staleTime.
	useEffect(() => {
		const handleArchiveStateChange = (event: Event) => {
			const detail = (event as CustomEvent<ChatArchiveStateChangeDetail>).detail;
			if (detail?.archived === false) {
				void queryClient.invalidateQueries({ queryKey: ["blocked-profile-ids"] });
			}
		};
		window.addEventListener(CHAT_ARCHIVE_STATE_EVENT, handleArchiveStateChange);
		return () => {
			window.removeEventListener(CHAT_ARCHIVE_STATE_EVENT, handleArchiveStateChange);
		};
	}, [queryClient]);

	// In-app toast whenever someone else blocks or unblocks us. Every
	// reconciliation path that determines this (the live WS event, ChatPage's
	// foreground reappearance check, inboxSync's background walk) funnels
	// through inserting a "SystemBlocked"/"SystemUnblocked" message and
	// dispatching this same event — listening once here, app-wide, catches
	// all of them regardless of which screen is open. Deliberately skips the
	// "...BySelf" variants: those are our own block/unblock action, already
	// visible from the confirmation dialog and immediate UI change that
	// triggered it, not something we need telling about again.
	useEffect(() => {
		const handleSystemMessage = (event: Event) => {
			const messages = (event as CustomEvent<Message[]>).detail;
			if (!Array.isArray(messages)) return;
			for (const message of messages) {
				if (message.type !== "SystemBlocked" && message.type !== "SystemUnblocked") {
					continue;
				}
				// getDisplayName falls back to the other participant's profile ID
				// when the conversation has no name (e.g. never nicknamed/messaged
				// enough to get one) — a bare "someone" is only shown when the
				// conversation isn't even in the directory yet.
				const name =
					getDisplayName(message.conversationId, userIdRef.current) ??
					tRef.current("chat.notifications.someone");
				if (message.type === "SystemBlocked") {
					toast(
						tRef.current("chat.block_toast.blocked_by_other", {
							defaultValue: "{{name}} blocked you",
							name,
						}),
					);
				} else {
					toast.success(
						tRef.current("chat.block_toast.unblocked_by_other", {
							defaultValue: "{{name}} unblocked you",
							name,
						}),
					);
				}
			}
		};
		window.addEventListener(CHAT_SYSTEM_MESSAGE_EVENT, handleSystemMessage as EventListener);
		return () => {
			window.removeEventListener(CHAT_SYSTEM_MESSAGE_EVENT, handleSystemMessage as EventListener);
		};
	}, []);

	// Boot the realtime manager whenever the user is authenticated.
	// getToken is called fresh on every (re)connect so an expired token
	// never blocks reconnection.
	useEffect(() => {
		if (!userId) {
			if (lastKnownStatus !== "idle") {
				dispatchStatus("idle");
			}
			return;
		}

		/*
		appLog.debug("[chat-ws:bridge] starting manager", {
			transport: isTauriRuntime() ? "tauri" : "browser",
		});
		*/

		// Shared by both the conversation.delete handling below and the
		// "any activity from an archived profile" recheck: deleted/banned
		// profiles are simply missing from this response instead of
		// erroring, same as the stale-share cleanup on the albums page.
		const isProfileFound = async (profileId: string): Promise<boolean> => {
			try {
				const raw = await apiFunctions.getProfilesByIds([profileId]);
				const profiles =
					raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
						? (raw as { profiles: unknown[] }).profiles
						: [];
				return profiles.some(
					(p) =>
						p &&
						typeof p === "object" &&
						String((p as { profileId?: unknown }).profileId) === profileId,
				);
			} catch {
				return true;
			}
		};

		// A fresh chat.v1.conversation.delete that isn't self-attributed could
		// mean either "they blocked us" or "their profile was deleted/banned" —
		// isProfileFound (a bulk profile lookup) can't reliably tell those apart.
		// classifyProfileAccess reads GET /v7/profiles/:id's stub-response quirk
		// (see its own doc comment) — an immediate and reliable signal (confirmed
		// live right after a block, no propagation delay), unlike attempting to
		// load the conversation's messages, which can lag behind the block being
		// enacted server-side.
		const checkConversationAccessible = async (
			profileId: string,
		): Promise<"accessible" | "not_found" | "blocked"> => {
			try {
				const profile = await apiFunctions.getProfileDetail(profileId);
				return classifyProfileAccess(profile);
			} catch {
				return "accessible";
			}
		};

		// Fallback for toggleArchiveOnConversationDelete's self/other
		// disambiguation: the local self-action marker only exists when the
		// block came from this device, so blocking the same profile from
		// another device would otherwise show as "You were blocked" here.
		// Fetches fresh (bypassing the cached blockedProfileIdsRef/query
		// staleTime) rather than risking a stale answer — this only runs on an
		// actual chat.v1.conversation.delete event, rare enough that a live
		// network round trip here is cheap, and correctness matters more than
		// saving one request for exactly this decision.
		const isBlockedByMe = async (profileId: string): Promise<boolean> => {
			try {
				const blockedIds = await apiFunctions.getBlockedProfileIds();
				// Seed the "blocked-profile-ids" query cache with this fresh
				// result — it's what ChatPage's unblock button (and every other
				// consumer) reads, and its 10-minute staleTime would otherwise
				// leave a block made on another device invisible here until the
				// next unrelated refetch, even after reopening the inbox.
				queryClient.setQueryData<string[]>(["blocked-profile-ids"], blockedIds);
				return blockedIds.includes(profileId);
			} catch {
				return false;
			}
		};

		// Any incoming activity from a profile whose conversation is
		// currently archived (typing, a read receipt, a tap, a view, a
		// message) is a live signal they might be reachable again — recheck
		// and pull it out of archive instead of waiting for the next
		// chat.v1.conversation.delete, inbox reload, or profile-page visit.
		const maybeUnarchiveOnActivity = (profileId: string | number | null | undefined) => {
			if (profileId == null) return;
			const id = String(profileId);
			if (blockedProfileIdsRef.current.has(id)) return;
			void reconcileArchivedConversationForProfile(id, isProfileFound);
		};

		// Foreground-only: fires the OS notification straight from the
		// WebSocket event so it shows up instantly, before FCM's delayed
		// push would otherwise be the only source. Android routes through
		// the native bridge (which dedupes against that later FCM push);
		// desktop/iOS have no competing push channel, so they go straight
		// to notifyLocal().
		const triggerIncomingMessageNotification = (m: Message) => {
			if (
				!isAppForeground() ||
				!isChatNotificationsEnabled() ||
				!isForegroundNotificationsEnabled()
			)
				return;

			const conv = getConversation(m.conversationId);
			const other = conv ? getOtherParticipant(conv, userIdRef.current) : null;
			const senderName = conv?.data.name?.trim() || tRef.current("chat.notifications.someone");
			const bodyText = getMessagePreviewLabel(m, tRef.current);
			// Same as the FCM-side native code: inline preview for picture/gif
			// content, deliberately excluded for ExpiringImage (view-once) and
			// Video (no thumbnail available).
			const previewImageUrl =
				m.type === "Image" || m.type === "Giphy"
					? getMessageImageUrl(m)
					: m.type === "Gaymoji"
						? getGaymojiUrl(m)
						: null;

			if (isAndroidRuntime()) {
				const payload = {
					event: "received",
					source: "realtime",
					receivedAt: Date.now(),
					senderName,
					bodyText,
					isTap: false,
					action: `chat:${m.conversationId}`,
					conversationId: m.conversationId,
					senderId: String(m.senderId),
					messageType: m.type,
					previewImageUrl,
					rawData: {
						senderProfileImageMediaHash: other?.primaryMediaHash ?? null,
					},
				};
				try {
					window.FreeGrindBridge?.postLocalNotification?.(JSON.stringify(payload));
				} catch (error) {
					appLog.warn("[chat-ws:bridge] postLocalNotification failed", error);
				}
				return;
			}

			void notifyLocal({ title: senderName, body: bodyText, group: m.conversationId });
		};

		const triggerTapNotification = (tap: TapReceivedDetail) => {
			if (
				!isAppForeground() ||
				!isTapNotificationsEnabled() ||
				!isForegroundNotificationsEnabled()
			)
				return;

			const senderName = tap.displayName || tRef.current("chat.notifications.someone");
			const bodyText = tap.isMutual
				? tRef.current("chat.notifications.tapped_you_back")
				: tRef.current("chat.notifications.tapped_you");

			if (isAndroidRuntime()) {
				const payload = {
					event: "received",
					source: "realtime",
					receivedAt: Date.now(),
					senderName,
					bodyText,
					isTap: true,
					action: "taps",
					conversationId: null,
					senderId: tap.profileId,
					messageType: null,
					rawData: {
						senderProfileId: tap.profileId,
						senderProfileImageMediaHash: tap.imageHash ?? null,
					},
				};
				try {
					window.FreeGrindBridge?.postLocalNotification?.(JSON.stringify(payload));
				} catch (error) {
					appLog.warn("[chat-ws:bridge] postLocalNotification failed (tap)", error);
				}
				return;
			}

			const onTapsRoute =
				pathRef.current === "/interest" || pathRef.current.startsWith("/interest/");
			if (onTapsRoute) return;
			void notifyLocal({ title: senderName, body: bodyText, group: "taps" });
		};

		const manager = new ChatRealtimeManager({
			url: "wss://grindr.mobi/v1/ws",
			getToken: async () => {
				try {
					const tok = await callMethodRef.current("websocket_token");
					return typeof tok === "string" ? tok : null;
				} catch {
					appLog.warn("[chat-ws:bridge] token fetch failed");
					return null;
				}
			},
			onStatusChange: (status) => {
				dispatchStatus(status);
			},
			onEvent: async (envelope) => {
				appLog.debug(`[chat-ws:bridge] onEvent type=${envelope.type} payload=${JSON.stringify(envelope.payload)}`);

				// Dispatch event AFTER potential DB updates if we want consistency,
				// or BEFORE if we want speed. Let's do DB updates first for critical stuff.

				// tap.v1.tap_sent / tap.v2.tap_sent — fire on both sender + recipient.
				// We only surface incoming taps (where we are the recipient). v2
				// carries isMutual in its payload; v1 does not, so isMutual only
				// resolves reliably once a v2 event (or its own REST response) arrives.
				if (envelope.type === "tap.v1.tap_sent" || envelope.type === "tap.v2.tap_sent") {
					const tap = parseTapPayload(envelope.payload);
					const currentUserId = userIdRef.current;
					if (
						tap &&
						currentUserId != null &&
						Number(tap.profileId) !== Number(currentUserId) &&
						shouldProcessIncomingTap(tap.profileId)
					) {
						appLog.debug(`[chat-ws:bridge] Incoming tap received from profileId: ${tap.profileId}`);
						window.dispatchEvent(
							new CustomEvent<TapReceivedDetail>(TAP_RECEIVED_EVENT, {
								detail: tap,
							}),
						);
						triggerTapNotification(tap);
						maybeUnarchiveOnActivity(tap.profileId);
						runAutomationRulesForSender(tap.profileId, "tap_received", apiFunctions).catch(() => {});
					}
				}

				if (envelope.type === "viewed_me.v1.new_view_received") {
					const view = parseViewPayload(envelope.payload);
					if (view) {
						appLog.debug(`[chat-ws:bridge] Incoming view received. Total views: ${view.viewedCount}`);
						window.dispatchEvent(
							new CustomEvent<ViewReceivedDetail>(VIEW_RECEIVED_EVENT, {
								detail: view,
							}),
						);
						maybeUnarchiveOnActivity(view.profileId);
					}
				}

				if (envelope.type === "videocall.v1.incoming_call") {
					const call = parseIncomingCallPayload(envelope.payload);
					if (call) {
						appLog.debug(`[chat-ws:bridge] Incoming video call from profileId: ${call.senderId}`);
						window.dispatchEvent(
							new CustomEvent<VideoCallIncomingDetail>(VIDEO_CALL_INCOMING_EVENT, {
								detail: call,
							}),
						);
					}
				}

				if (envelope.type === "videocall.v1.call_ended") {
					const ended = parseCallEndedPayload(envelope.payload);
					if (ended) {
						appLog.debug(`[chat-ws:bridge] Video call ended: ${JSON.stringify(ended)}`);
						window.dispatchEvent(
							new CustomEvent<VideoCallEndedDetail>(VIDEO_CALL_ENDED_EVENT, {
								detail: ended,
							}),
						);
					}
				}

				if (envelope.type === "chat.v1.typing_status") {
					const record = envelope.payload as Record<string, unknown> | undefined;
					if (record) {
						const conversationId = record.conversationId as string | undefined;
						const profileId = record.profileId as string | undefined;
						const status = record.status as string | undefined;
						if (conversationId && profileId && status) {
							window.dispatchEvent(
								new CustomEvent<TypingStatusDetail>(TYPING_STATUS_EVENT, {
									detail: { conversationId, profileId, status: status as TypingStatusDetail["status"] },
								}),
							);
							if (userIdRef.current != null && Number(profileId) !== Number(userIdRef.current)) {
								maybeUnarchiveOnActivity(profileId);
							}
						}
					}
				}

				if (envelope.type === "chat.v1.conversation_read") {
					const record = envelope.payload as Record<string, unknown> | undefined;
					if (record) {
						const cid = record.conversationId as string | undefined;
						const ts = Number(record.timestamp); // already milliseconds per API spec
						const senderId = Number(record.profileId);

						if (cid && !Number.isNaN(ts) && !Number.isNaN(senderId) && userIdRef.current != null) {
							if (senderId !== userIdRef.current) {
								await chatLog.appendMessages(cid, [], ts);
								maybeUnarchiveOnActivity(senderId);
							} else {
								// This is the server echoing back that *we* read this
								// conversation — possibly from another of our own
								// devices — so any system notification still showing
								// for it here is now stale.
								void clearChatNotifications(cid).catch(() => {});

								const conv = getConversation(cid);
								if (conv && !isReadReceiptsHidden(cid)) {
									const other = getOtherParticipant(conv, userIdRef.current);
									if (other?.profileId) {
										await clearUnreadCountForProfile(String(other.profileId)).catch(() => {});
									}
								}
							}
						}
					}
				}

				// chat.v1.conversation.delete — fires both when we're blocked/deleted
				// and on unblock, with nothing in the payload to tell which. Toggle
				// based on current archived state instead: never delete, and never
				// archive an already-archived conversation again. Runs before the
				// forwarded CustomEvent below so any mounted ChatPage listener sees
				// DB-consistent state.
				if (
					envelope.type === "chat.v1.conversation.delete" &&
					envelope.payload &&
					typeof envelope.payload === "object"
				) {
					const record = envelope.payload as Record<string, unknown>;
					const ids = Array.isArray(record.conversationIds)
						? (record.conversationIds as unknown[]).filter(
								(id): id is string => typeof id === "string",
							)
						: [];
					if (ids.length > 0) {
						const notificationId =
							typeof envelope.notificationId === "string" ? envelope.notificationId : null;
						const { systemMessages } = await toggleArchiveOnConversationDelete(
							ids,
							notificationId,
							isProfileFound,
							isBlockedByMe,
							checkConversationAccessible,
							userIdRef.current,
						);
						if (systemMessages.length > 0) {
							window.dispatchEvent(
								new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, {
									detail: systemMessages,
								}),
							);
						}
					}
				}

				const messages = extractMessages(envelope);
				if (messages.length > 0) {
					const byConv = new Map<string, Message[]>();
					for (const m of messages) {
						let messageText = "";
						const msgBody: any = m.body;
						if (msgBody && typeof msgBody.text === "string") {
							messageText = msgBody.text;
						}

						const isIncoming = userIdRef.current != null && Number(m.senderId) !== Number(userIdRef.current);

						// --- CUSTOM AUTOMATION RULES ---
						if (isIncoming && m.senderId) {
							const { blocked: blockedByNewChat } = await runAutomationRulesForSender(
								String(m.senderId),
								"new_chat",
								apiFunctions,
								undefined,
								messageText,
							).catch(() => ({ blocked: false, matchedRuleNames: [] }));
							if (blockedByNewChat) continue; // A rule blocked the sender — skip processing this message.

							// Dedupes per messageId rather than per sender — the custom-rule
							// equivalent of the forbidden keyword check above (e.g. a
							// "message contains keyword" rule), evaluated once per message.
							const { blocked: blockedByMessage } = await runAutomationRulesForSender(
								String(m.senderId),
								"message_received",
								apiFunctions,
								undefined,
								messageText,
								m.messageId,
							).catch(() => ({ blocked: false, matchedRuleNames: [] }));
							if (blockedByMessage) continue;
						}
						// -----------------------------

						const list = byConv.get(m.conversationId) ?? [];
						list.push(m);
						byConv.set(m.conversationId, list);

						if (isIncoming) {
							maybeUnarchiveOnActivity(m.senderId);
						}

						// Update local contact index for unread badge persistence
						if (isIncoming) {
							const path = pathRef.current;
							const isViewingThisChat =
								path === `/app/chat/${m.conversationId}` ||
								path.startsWith(`/app/chat/${m.conversationId}/`);
							if (!isViewingThisChat) {
								await incrementUnreadCountForProfile(
									String(m.senderId),
									m.conversationId,
									m.timestamp,
								).catch((err) => {
									appLog.warn("[chat-ws:bridge] failed to increment unread", err);
								});
								triggerIncomingMessageNotification(m);
							}
						}
					}
					
					for (const [cid, msgs] of byConv) {
						await chatLog.appendMessages(cid, msgs);
						for (const msg of msgs) {
							const target = getMediaCaptureTarget(msg);
							if (!target) continue;
							void fetchAndStoreMedia({
								mediaKey: target.mediaKey,
								kind: target.kind,
								url: target.url,
								conversationId: cid,
								messageId: msg.messageId,
								viewOnce: target.viewOnce,
								isOwnMessage:
									userIdRef.current != null && Number(msg.senderId) === Number(userIdRef.current),
							});
						}
						captureAlbumsForMessages(msgs, cid, (id) => apiFunctions.getAlbum(id));
						captureReplyPreviewsForMessages(msgs, cid);
					}
				}

				// Dispatch AFTER DB/Log persistence so listeners see updated state in DB
				window.dispatchEvent(
					new CustomEvent<RealtimeEnvelope>(CHAT_REALTIME_EVENT, {
						detail: envelope,
					}),
				);
			},
			onRawMessage: (raw) => {
				// appLog.debug(`[chat-ws:bridge:raw] ${JSON.stringify(raw)}`);
			},
			onParseError: (raw, error) => {
				appLog.warn("[chat-ws:bridge:parse-error]", { raw, error });
			},
			buildSocket: isTauriRuntime()
				? (url) => new TauriWebSocket(url) as unknown as WebSocket
				: undefined,
		});

		manager.start();
		setActiveRealtimeManager(manager);

		// Handle Foreground/Background shifts on Android
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				// appLog.debug("[chat-ws:bridge] app visible; checking connection...");
				// Restarting the manager is the safest way to ensure a fresh,
				// functional socket after a potentially long background sleep.
				manager.stop({ suppressStatus: true });
				manager.start();
			}
		};

		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			// appLog.debug("[chat-ws:bridge] stopping manager");
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			setActiveRealtimeManager(null);
			manager.stop({ suppressStatus: true });
		};
	}, [userId]);

	return null;
}
