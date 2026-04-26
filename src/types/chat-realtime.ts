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
