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

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { platform } from "@tauri-apps/plugin-os";
import { useAuth } from "../contexts/useAuth";
import { useApi } from "../hooks/useApi";
import { ChatRealtimeManager, setActiveRealtimeManager } from "../services/chatRealtime";
import { TauriWebSocket, isTauriRuntime } from "../services/tauriWebSocket";
import * as chatLog from "../services/chatLog";
import {
	incrementUnreadCountForProfile,
	clearUnreadCountForProfile,
} from "../services/chatContactIndex";
import { toggleArchiveOnConversationDelete } from "../services/conversationArchive";
import { messageSchema, type Message } from "../types/messages";
import type { RealtimeEnvelope, RealtimeStatus } from "../types/chat-realtime";
import { appLog } from "../utils/logger";
import {
	getMediaCaptureTarget,
	getOtherParticipant,
	getMessagePreviewLabel,
} from "../pages/app/chat/chatUtils";
import { fetchAndStoreMedia } from "../services/mediaStore";
import { captureAlbumsForMessages } from "../services/albumStore";
import { getConversation } from "../services/conversationDirectory";
import { shouldAutoBlock, getMatchedForbiddenWord, notifyAutoBlock } from "../utils/autoblock";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { isReadReceiptsHidden } from "../utils/privacy";
import { notifyLocal } from "../services/localNotify";

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
export const CHAT_SYSTEM_MESSAGE_EVENT = "fg:chat-system-message";

export type TypingStatusDetail = {
	conversationId: string;
	profileId: string;
	status: "Typing" | "Cleared" | "Sent";
};

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
			: profileId;
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
	const { userId } = useAuth();
	const { callMethod } = useApi();
    const apiFunctions = useApiFunctions();
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

		// Foreground-only: fires the OS notification straight from the
		// WebSocket event so it shows up instantly, before FCM's delayed
		// push would otherwise be the only source. Android routes through
		// the native bridge (which dedupes against that later FCM push);
		// desktop/iOS have no competing push channel, so they go straight
		// to notifyLocal().
		const triggerIncomingMessageNotification = (m: Message) => {
			if (!isAppForeground()) return;

			const conv = getConversation(m.conversationId);
			const other = conv ? getOtherParticipant(conv, userIdRef.current) : null;
			const senderName = conv?.data.name?.trim() || "Someone";
			const bodyText = getMessagePreviewLabel(m, tRef.current);

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
			if (!isAppForeground()) return;

			const senderName = tap.displayName || "Someone";
			const bodyText = tap.isMutual ? "Tapped you back" : "Tapped you";

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

				// tap.v1.tap_sent — fires on both sender + recipient. We only
				// surface incoming taps (where we are the recipient).
				if (envelope.type === "tap.v1.tap_sent") {
					const tap = parseTapPayload(envelope.payload);
					const currentUserId = userIdRef.current;
					if (
						tap &&
						currentUserId != null &&
						Number(tap.profileId) !== Number(currentUserId)
					) {
						appLog.debug(`[chat-ws:bridge] Incoming tap received from profileId: ${tap.profileId}`);
						window.dispatchEvent(
							new CustomEvent<TapReceivedDetail>(TAP_RECEIVED_EVENT, {
								detail: tap,
							}),
						);
						triggerTapNotification(tap);
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
							} else {
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
						const { systemMessages } = await toggleArchiveOnConversationDelete(ids, notificationId);
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
						// --- LIVE AUTO BLOCK CHECK ---
						let messageText = "";
						const msgBody: any = m.body;
						if (msgBody && typeof msgBody.text === "string") {
							messageText = msgBody.text;
						}
						
						const isIncoming = userIdRef.current != null && Number(m.senderId) !== Number(userIdRef.current);
						const matchedWord = getMatchedForbiddenWord(messageText, "chat");

						if (isIncoming && matchedWord) {
							notifyAutoBlock("Spam Intercepted", `Keyword: "${matchedWord}"`);
							
							if (m.senderId) {
								apiFunctions.blockProfile(String(m.senderId)).catch(() => {});
							}
							continue; // Skip processing this message entirely!
						}
						// -----------------------------

						const list = byConv.get(m.conversationId) ?? [];
						list.push(m);
						byConv.set(m.conversationId, list);

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
							});
						}
						captureAlbumsForMessages(msgs, cid, (id) => apiFunctions.getAlbum(id));
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
