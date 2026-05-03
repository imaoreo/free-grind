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

import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { useApi } from "../hooks/useApi";
import { ChatRealtimeManager } from "../services/chatRealtime";
import { TauriWebSocket, isTauriRuntime } from "../services/tauriWebSocket";
import * as chatLog from "../services/chatLog";
import { messageSchema, type Message } from "../types/messages";
import type { RealtimeEnvelope, RealtimeStatus } from "../types/chat-realtime";

export const CHAT_REALTIME_EVENT = "fg:chat-realtime-event";
export const CHAT_REALTIME_STATUS = "fg:chat-realtime-status";
export const TAP_RECEIVED_EVENT = "fg:tap-received";

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
	const location = useLocation();

	const [token, setToken] = useState<string | null>(null);

	const pathRef = useRef(location.pathname);
	useEffect(() => {
		pathRef.current = location.pathname;
	}, [location.pathname]);

	const userIdRef = useRef<number | null>(userId);
	useEffect(() => {
		userIdRef.current = userId;
	}, [userId]);

	// Fetch the WS token whenever the authenticated user changes.
	useEffect(() => {
		if (!userId) {
			setToken(null);
			window.dispatchEvent(
				new CustomEvent<RealtimeStatus>(CHAT_REALTIME_STATUS, {
					detail: "idle",
				}),
			);
			console.log("[chat-ws:bridge] no user; skipping token fetch");
			return;
		}

		let active = true;
		void callMethod("websocket_token")
			.then((tok) => {
				if (!active) return;
				const value = (tok as string | null) ?? null;
				setToken(value);
				console.log("[chat-ws:bridge] token", {
					hasToken: Boolean(value),
					tokenLength: value?.length ?? 0,
				});
				if (!value) {
					window.dispatchEvent(
						new CustomEvent<RealtimeStatus>(CHAT_REALTIME_STATUS, {
							detail: "polling",
						}),
					);
				}
			})
			.catch(() => {
				if (!active) return;
				setToken(null);
				window.dispatchEvent(
					new CustomEvent<RealtimeStatus>(CHAT_REALTIME_STATUS, {
						detail: "polling",
					}),
				);
				console.warn("[chat-ws:bridge] token fetch failed");
			});

		return () => {
			active = false;
		};
	}, [callMethod, userId]);

	// Boot the realtime manager once we have a token.
	useEffect(() => {
		if (!token) return;

		console.log("[chat-ws:bridge] starting manager", {
			transport: isTauriRuntime() ? "tauri" : "browser",
		});

		const manager = new ChatRealtimeManager({
			url: "wss://grindr.mobi/v1/ws",
			getToken: () => token,
			onStatusChange: (status) => {
				window.dispatchEvent(
					new CustomEvent<RealtimeStatus>(CHAT_REALTIME_STATUS, {
						detail: status,
					}),
				);
			},
			onEvent: (envelope) => {
				window.dispatchEvent(
					new CustomEvent<RealtimeEnvelope>(CHAT_REALTIME_EVENT, {
						detail: envelope,
					}),
				);

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
						window.dispatchEvent(
							new CustomEvent<TapReceivedDetail>(TAP_RECEIVED_EVENT, {
								detail: tap,
							}),
						);
						console.log("[chat-ws:bridge] tap", { from: tap.displayName });
					}
				}

				const messages = extractMessages(envelope);
				if (!messages.length) return;

				// Persist (idempotent) so navigating to the chat shows the message
				// even if ChatPage is not mounted right now.
				const byConv = new Map<string, Message[]>();
				for (const m of messages) {
					const list = byConv.get(m.conversationId) ?? [];
					list.push(m);
					byConv.set(m.conversationId, list);
				}
				for (const [cid, msgs] of byConv) {
					void chatLog.appendMessages(cid, msgs);
				}
			},
			onRawMessage: (raw) => {
				console.log("[chat-ws:bridge:raw]", raw);
			},
			onParseError: (raw, error) => {
				console.warn("[chat-ws:bridge:parse-error]", { raw, error });
			},
			buildSocket: isTauriRuntime()
				? (url) => new TauriWebSocket(url) as unknown as WebSocket
				: undefined,
		});

		manager.start();

		return () => {
			console.log("[chat-ws:bridge] stopping manager");
			manager.stop({ suppressStatus: true });
		};
	}, [token]);

	return null;
}
