export type RealtimeStatus =
	| "idle"
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
	heartbeatMs?: number;
	maxBackoffMs?: number;
	buildSocket?: (url: string) => WebSocket;
}

export class ChatRealtimeManager {
	private readonly options: ChatRealtimeManagerOptions;
	private socket: WebSocket | null = null;
	private reconnectTimer: number | null = null;
	private heartbeatTimer: number | null = null;
	private reconnectAttempts = 0;
	private stopped = true;

	constructor(options: ChatRealtimeManagerOptions) {
		this.options = {
			heartbeatMs: 25_000,
			maxBackoffMs: 25_000,
			...options,
		};
	}

	start() {
		if (!this.stopped) {
			return;
		}
		this.stopped = false;
		void this.connect();
	}

	stop() {
		this.stopped = true;
		this.clearReconnect();
		this.clearHeartbeat();
		if (this.socket) {
			this.socket.close();
			this.socket = null;
		}
		this.setStatus("disconnected");
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

		this.setStatus("reconnecting");
		this.clearReconnect();
		this.reconnectTimer = window.setTimeout(() => {
			void this.connect();
		}, delay);
	}

	private startHeartbeat() {
		this.clearHeartbeat();
		const heartbeatMs = this.options.heartbeatMs ?? 25_000;
		this.heartbeatTimer = window.setInterval(() => {
			if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
				return;
			}

			this.socket.send(
				JSON.stringify({
					type: "ws.ping",
					timestamp: Date.now(),
				}),
			);
		}, heartbeatMs);
	}

	private async connect() {
		if (this.stopped) {
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
				this.setStatus("connected");
				this.startHeartbeat();
			};

			socket.onmessage = (event) => {
				try {
					const parsed = JSON.parse(String(event.data)) as RealtimeEnvelope;
					this.options.onEvent(parsed);
				} catch {
					// Ignore malformed frames.
				}
			};

			socket.onerror = () => {
				this.setStatus("error");
			};

			socket.onclose = () => {
				this.clearHeartbeat();
				this.socket = null;
				if (this.stopped) {
					this.setStatus("disconnected");
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
