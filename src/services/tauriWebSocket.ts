/**
 * TauriWebSocket — a `WebSocket`-shaped wrapper backed by the Rust-side
 * `ws_connect` / `ws_send` / `ws_disconnect` commands.
 *
 * Browser `WebSocket` cannot set the `Authorization` / `User-Agent` headers
 * the Grindr WS API requires. The Rust side handles the real network socket
 * and forwards every frame back as a Tauri event. This class lets the existing
 * `ChatRealtimeManager` keep using a `WebSocket`-like API without changes.
 *
 * Logging is intentionally noisy (`[chat-ws:tauri]`) for testing.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { appLog } from "../utils/logger";

type WsEvent =
	| { kind: "open" }
	| { kind: "message"; data: string }
	| { kind: "binary"; len: number; data_b64: string }
	| { kind: "close"; code: number; reason: string }
	| { kind: "error"; message: string };

const WS_EVENT_NAME = "grindr-ws://event";

let activeInstance: TauriWebSocket | null = null;

export class TauriWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	readonly CONNECTING = TauriWebSocket.CONNECTING;
	readonly OPEN = TauriWebSocket.OPEN;
	readonly CLOSING = TauriWebSocket.CLOSING;
	readonly CLOSED = TauriWebSocket.CLOSED;

	readyState: number = TauriWebSocket.CONNECTING;

	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	readonly url: string;

	private unlisten: UnlistenFn | null = null;
	private closed = false;

	constructor(url: string) {
		this.url = url;
		appLog.debug("[chat-ws:tauri] new TauriWebSocket", { url });

		// Only allow one bridge connection at a time; the Rust side enforces this
		// too, but tearing the previous instance down here keeps callbacks tidy.
		if (activeInstance && activeInstance !== this) {
			appLog.debug(
				"[chat-ws:tauri] superseding previous TauriWebSocket instance",
			);
			activeInstance.close(1000, "superseded");
		}
		activeInstance = this;

		void this.bootstrap();
	}

	private async bootstrap() {
		try {
			this.unlisten = await listen<WsEvent>(WS_EVENT_NAME, (event) => {
				this.handleEvent(event.payload);
			});

			appLog.debug("[chat-ws:tauri] invoking ws_connect");
			await invoke("ws_connect", { url: this.url });
			appLog.debug("[chat-ws:tauri] ws_connect resolved");
		} catch (error) {
			appLog.warn("[chat-ws:tauri] bootstrap failed", error);
			this.dispatchError(error);
			this.dispatchClose(1006, String(error));
		}
	}

	private handleEvent(event: WsEvent) {
		if (this.closed && event.kind !== "close") {
			appLog.debug("[chat-ws:tauri] ignoring event after close", event.kind);
			return;
		}

		switch (event.kind) {
			case "open":
				appLog.debug("[chat-ws:tauri] event: open");
				this.readyState = TauriWebSocket.OPEN;
				this.onopen?.(new Event("open"));
				return;
			case "message":
				appLog.debug(
					"[chat-ws:tauri] event: message",
					event.data.length,
					"bytes",
				);
				this.onmessage?.(
					new MessageEvent("message", { data: event.data }),
				);
				return;
			case "binary": {
				appLog.debug("[chat-ws:tauri] event: binary", event.len, "bytes");
				const bytes = decodeBase64(event.data_b64);
				this.onmessage?.(
					new MessageEvent("message", { data: bytes.buffer }),
				);
				return;
			}
			case "close":
				appLog.debug("[chat-ws:tauri] event: close", event);
				this.dispatchClose(event.code, event.reason);
				return;
			case "error":
				appLog.warn("[chat-ws:tauri] event: error", event.message);
				this.dispatchError(event.message);
				return;
		}
	}

	private dispatchError(error: unknown) {
		try {
			this.onerror?.(new Event("error"));
		} catch (callbackError) {
			appLog.warn(
				"[chat-ws:tauri] onerror callback threw",
				callbackError,
				error,
			);
		}
	}

	private dispatchClose(code: number, reason: string) {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.readyState = TauriWebSocket.CLOSED;
		this.cleanupListener();
		try {
			this.onclose?.(
				new CloseEvent("close", { code, reason, wasClean: code === 1000 }),
			);
		} catch (callbackError) {
			appLog.warn("[chat-ws:tauri] onclose callback threw", callbackError);
		}
		if (activeInstance === this) {
			activeInstance = null;
		}
	}

	private cleanupListener() {
		if (this.unlisten) {
			try {
				this.unlisten();
			} catch (error) {
				appLog.warn("[chat-ws:tauri] unlisten failed", error);
			}
			this.unlisten = null;
		}
	}

	send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		if (this.readyState !== TauriWebSocket.OPEN) {
			appLog.warn("[chat-ws:tauri] send called while not open", this.readyState);
			return;
		}

		if (typeof data !== "string") {
			appLog.warn(
				"[chat-ws:tauri] non-text send not implemented; dropping frame",
			);
			return;
		}

		appLog.debug("[chat-ws:tauri] send", data.length, "bytes");
		void invoke("ws_send", { payload: data }).catch((error) => {
			appLog.warn("[chat-ws:tauri] ws_send failed", error);
			this.dispatchError(error);
		});
	}

	close(code = 1000, reason = ""): void {
		appLog.debug("[chat-ws:tauri] close requested", { code, reason });
		this.readyState = TauriWebSocket.CLOSING;
		void invoke("ws_disconnect").catch((error) => {
			appLog.warn("[chat-ws:tauri] ws_disconnect failed", error);
		});
		// Fire close locally so the manager's reconnect logic engages even if the
		// Rust side never emits a close event back.
		this.dispatchClose(code, reason);
	}
}

export function isTauriRuntime(): boolean {
	if (typeof window === "undefined") {
		return false;
	}
	const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
	return Boolean(w.__TAURI_INTERNALS__);
}

function decodeBase64(b64: string): Uint8Array {
	const binary = atob(b64);
	const out = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		out[i] = binary.charCodeAt(i);
	}
	return out;
}
