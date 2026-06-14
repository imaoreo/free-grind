/**
 * ChatRealtimeBridge — runs the chat WebSocket app-wide while the user is
 * authenticated, so incoming messages always trigger an in-app toast (and a
 * desktop notification on supported platforms) regardless of the current
 * route.
 *
 * Architecture:
 * - Owns the singleton ChatRealtimeManager (previously owned by ChatPage).
 * - Re-broadcasts envelopes and status changes via window CustomEvents
 *   (`fg:chat-realtime-event`, `fg:chat-realtime-status`) so ChatPage can
 *   keep its live UI in sync without holding its own connection.
 * - Persists incoming messages to chatLog and shows a toast — suppressed
 *   when the user is already viewing the conversation in the foreground or
 *   when the message was sent by the current user.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { useApi } from "../hooks/useApi";
import { ChatRealtimeManager, setActiveRealtimeManager } from "../services/chatRealtime";
import { TauriWebSocket, isTauriRuntime } from "../services/tauriWebSocket";
import * as chatLog from "../services/chatLog";
import {
	incrementUnreadCountForProfile,
	clearUnreadCountForProfile,
} from "../services/chatContactIndex";
import { messageSchema, type Message } from "../types/messages";
import type { RealtimeEnvelope, RealtimeStatus } from "../types/chat-realtime";
import { appLog } from "../utils/logger";
import { getOtherParticipant } from "../pages/app/chat/chatUtils";
import { getConversation } from "../services/conversationDirectory";
import { shouldAutoBlock, getMatchedForbiddenWord, notifyAutoBlock } from "../utils/autoblock";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { isChatGhosted } from "../utils/privacy";

export const CHAT_REALTIME_EVENT = "fg:chat-realtime-event";
export const CHAT_REALTIME_STATUS = "fg:chat-realtime-status";
export const TAP_RECEIVED_EVENT = "fg:tap-received";
export const VIEW_RECEIVED_EVENT = "fg:view-received";

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

	const callMethodRef = useRef(callMethod);
	useEffect(() => {
		callMethodRef.current = callMethod;
	}, [callMethod]);

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

				if (envelope.type === "chat.v1.read" || envelope.type === "chat.v1.message_read") {
					const payloads: unknown[] = [envelope.payload, envelope.data, envelope];
					for (const payload of payloads) {
						if (!payload || typeof payload !== "object") continue;
						const record = payload as Record<string, unknown>;
						const cid = (record.conversationId || record.cid) as string | undefined;
						const rawTs = Number(record.timestamp || record.ts);
						const ts = rawTs < 100_000_000_000 ? rawTs * 1000 : rawTs;
						const senderId = Number(record.profileId || record.senderId);

						if (cid && !Number.isNaN(ts) && !Number.isNaN(senderId) && userIdRef.current != null) {
							if (senderId !== userIdRef.current) {
								// The other person read our messages
								await chatLog.appendMessages(cid, [], ts);
							} else {
								// WE read the messages (possibly on another device)
								// Try to find the profileId for this conversation to clear the index
								const conv = getConversation(cid);
 							if (conv && !isChatGhosted(cid)) { // <-- Added Ghost Check
 								const other = getOtherParticipant(conv, userIdRef.current);
 								if (other?.profileId) {
 									await clearUnreadCountForProfile(String(other.profileId)).catch(() => {});
 								}
 							}
							}
							break;
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
							}
						}
					}
					
					for (const [cid, msgs] of byConv) {
						await chatLog.appendMessages(cid, msgs);
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
