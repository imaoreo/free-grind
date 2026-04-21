import { decode } from "@msgpack/msgpack";

export type RealtimeStatus =
	| "idle"
	| "polling"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "disconnected"
	| "error";

export interface RealtimeEnvelope {
	type?: string;
	event?: string;
	timestamp?: number;
	payload?: unknown;
	data?: unknown;
	[key: string]: unknown;
}

export interface ChatRealtimeManagerOptions {
	url: string;
	getToken?: () => Promise<string | null> | string | null;
	onEvent: (event: RealtimeEnvelope) => void;
	onStatusChange?: (status: RealtimeStatus) => void;
	onRawMessage?: (raw: unknown) => void;
	onParseError?: (raw: unknown, error: unknown) => void;
	heartbeatMs?: number;
	maxSilenceMs?: number;
	maxBackoffMs?: number;
	buildSocket?: (url: string) => WebSocket;
}

async function normalizeSocketData(data: unknown): Promise<{
	kind: "text" | "blob" | "arraybuffer" | "unknown";
	size: number | null;
	text: string | null;
	bytes: Uint8Array | null;
	raw: unknown;
}> {
	if (typeof data === "string") {
		return {
			kind: "text",
			size: data.length,
			text: data,
			bytes: null,
			raw: data,
		};
	}

	if (data instanceof Blob) {
		const buffer = await data.arrayBuffer();
		const bytes = new Uint8Array(buffer);
		const text = new TextDecoder().decode(bytes);
		return {
			kind: "blob",
			size: data.size,
			text,
			bytes,
			raw: data,
		};
	}

	if (data instanceof ArrayBuffer) {
		const bytes = new Uint8Array(data);
		const text = new TextDecoder().decode(bytes);
		return {
			kind: "arraybuffer",
			size: data.byteLength,
			text,
			bytes,
			raw: data,
		};
	}

	return {
		kind: "unknown",
		size: null,
		text: null,
		bytes: null,
		raw: data,
	};
}

export class ChatRealtimeManager {
	private readonly options: ChatRealtimeManagerOptions;
	private socket: WebSocket | null = null;
	private reconnectTimer: number | null = null;
	private heartbeatTimer: number | null = null;
	private livenessTimer: number | null = null;
	private reconnectAttempts = 0;
	private stopped = true;
	private suppressDisconnectStatus = false;
	private lastActivityAt = 0;
	private readonly handleOnline = () => {
		if (this.stopped) {
			return;
		}
		if (!this.socket) {
			void this.connect();
		}
	};
	private readonly handleOffline = () => {
		if (this.stopped) {
			return;
		}
		this.setStatus("disconnected");
		if (this.socket) {
			this.socket.close();
		}
	};

	constructor(options: ChatRealtimeManagerOptions) {
		this.options = {
			heartbeatMs: 25_000,
			maxSilenceMs: 180_000,
			maxBackoffMs: 25_000,
			...options,
		};
	}

	start() {
		if (!this.stopped) {
			return;
		}
		this.stopped = false;
		this.suppressDisconnectStatus = false;
		window.addEventListener("online", this.handleOnline);
		window.addEventListener("offline", this.handleOffline);
		void this.connect();
	}

	stop(options?: { suppressStatus?: boolean }) {
		this.stopped = true;
		this.suppressDisconnectStatus = options?.suppressStatus ?? false;
		window.removeEventListener("online", this.handleOnline);
		window.removeEventListener("offline", this.handleOffline);
		this.clearReconnect();
		this.clearHeartbeat();
		this.clearLiveness();
		if (this.socket) {
			this.socket.close();
			this.socket = null;
			return;
		}

		if (!this.suppressDisconnectStatus) {
			this.setStatus("disconnected");
		}
	}

	private setStatus(next: RealtimeStatus) {
		this.options.onStatusChange?.(next);
	}

	private clearReconnect() {
		if (this.reconnectTimer != null) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private clearHeartbeat() {
		if (this.heartbeatTimer != null) {
			window.clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private clearLiveness() {
		if (this.livenessTimer != null) {
			window.clearInterval(this.livenessTimer);
			this.livenessTimer = null;
		}
	}

	private markActivity() {
		this.lastActivityAt = Date.now();
	}

	private buildUrlWithToken(baseUrl: string, token: string | null): string {
		if (!token) {
			return baseUrl;
		}

		try {
			const url = new URL(baseUrl);
			url.searchParams.set("token", token);
			return url.toString();
		} catch {
			return baseUrl;
		}
	}

	private scheduleReconnect() {
		if (this.stopped) {
			return;
		}

		const exp = Math.min(this.reconnectAttempts, 6);
		const delay = Math.min(
			this.options.maxBackoffMs ?? 25_000,
			1000 * Math.pow(2, exp),
		);
		const jitter = Math.floor(Math.random() * 300);

		this.setStatus("reconnecting");
		this.clearReconnect();
		this.reconnectTimer = window.setTimeout(() => {
			void this.connect();
		}, delay + jitter);
	}

	private startHeartbeat() {
		this.clearHeartbeat();
		const heartbeatMs = this.options.heartbeatMs ?? 25_000;
		this.heartbeatTimer = window.setInterval(() => {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
				return;
			}

			try {
				this.socket.send(
					JSON.stringify({
						type: "ws.ping",
						timestamp: Date.now(),
					}),
				);
			} catch {
				this.socket.close();
			}
		}, heartbeatMs);
	}

	private startLivenessWatchdog() {
		this.clearLiveness();
		const silenceMs = this.options.maxSilenceMs ?? 180_000;
		const heartbeatMs = this.options.heartbeatMs ?? 25_000;
		this.livenessTimer = window.setInterval(
			() => {
				if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
					return;
				}
				if (this.lastActivityAt <= 0) {
					return;
				}
				if (Date.now() - this.lastActivityAt > silenceMs) {
					this.socket.close();
				}
			},
			Math.max(heartbeatMs, 10_000),
		);
	}

	private async connect() {
		if (this.stopped) {
			return;
		}

		if (typeof navigator !== "undefined" && !navigator.onLine) {
			this.setStatus("disconnected");
			this.scheduleReconnect();
			return;
		}

		this.setStatus("connecting");
		this.clearReconnect();

		try {
			const token = this.options.getToken
				? await this.options.getToken()
				: null;
			const url = this.buildUrlWithToken(this.options.url, token);
			const socket = this.options.buildSocket
				? this.options.buildSocket(url)
				: new WebSocket(url);

			this.socket = socket;

			socket.onopen = () => {
				this.reconnectAttempts = 0;
				this.markActivity();
				this.setStatus("connected");
				this.startHeartbeat();
				this.startLivenessWatchdog();
			};

			socket.onmessage = (event) => {
				void (async () => {
					const normalized = await normalizeSocketData(event.data);
					this.markActivity();
					this.options.onRawMessage?.(normalized);

					// Prefer JSON text decoding; fallback to msgpack for binary frames.
					if (normalized.text) {
						try {
							const parsed = JSON.parse(normalized.text) as RealtimeEnvelope;
							this.options.onEvent(parsed);
							return;
						} catch {
							// Continue to msgpack fallback.
						}
					}

					if (normalized.bytes) {
						try {
							const decoded = decode(normalized.bytes);
							if (decoded && typeof decoded === "object") {
								this.options.onEvent(decoded as RealtimeEnvelope);
								return;
							}
						} catch {
							// Will report below.
						}
					}

					this.options.onParseError?.(normalized, "Unable to decode frame");
				})();
			};

			socket.onerror = () => {
				this.setStatus("error");
			};

			socket.onclose = () => {
				this.clearHeartbeat();
				this.clearLiveness();
				this.socket = null;
				if (this.stopped) {
					if (!this.suppressDisconnectStatus) {
						this.setStatus("disconnected");
					}
					this.suppressDisconnectStatus = false;
					return;
				}
				this.reconnectAttempts += 1;
				this.scheduleReconnect();
			};
		} catch {
			this.reconnectAttempts += 1;
			this.scheduleReconnect();
		}
	}
}
