export interface ApiTraceEntry {
	id: string;
	kind: "rest" | "command";
	timestamp: number;
	durationMs: number;
	method: string;
	path: string;
	status: number | null;
	success: boolean;
	requestBody: string | null;
	responseBody: string | null;
	error: string | null;
}

const MAX_ENTRIES = 250;
const MAX_PREVIEW_LENGTH = 3000;

let entries: ApiTraceEntry[] = [];
const listeners = new Set<(value: ApiTraceEntry[]) => void>();

function trimPreview(value: string): string {
	if (value.length <= MAX_PREVIEW_LENGTH) {
		return value;
	}
	return `${value.slice(0, MAX_PREVIEW_LENGTH)}\n... (truncated)`;
}

export function toTracePreview(value: unknown): string | null {
	if (value == null) {
		return null;
	}

	if (typeof value === "string") {
		return trimPreview(value);
	}

	if (value instanceof Uint8Array) {
		try {
			return trimPreview(new TextDecoder().decode(value));
		} catch {
			return `Uint8Array(${value.byteLength} bytes)`;
		}
	}

	if (typeof value === "object") {
		try {
			return trimPreview(JSON.stringify(value, null, 2));
		} catch {
			return "[Unserializable object]";
		}
	}

	return trimPreview(String(value));
}

function emit() {
	for (const listener of listeners) {
		listener(entries);
	}
}

export function addApiTraceEntry(entry: ApiTraceEntry) {
	entries = [entry, ...entries].slice(0, MAX_ENTRIES);
	emit();
}

export function getApiTraceEntries(): ApiTraceEntry[] {
	return entries;
}

export function clearApiTraceEntries() {
	entries = [];
	emit();
}

export function subscribeApiTraceEntries(
	listener: (value: ApiTraceEntry[]) => void,
): () => void {
	listeners.add(listener);
	listener(entries);
	return () => {
		listeners.delete(listener);
	};
}

export function exportApiTraceEntries(): string {
	return JSON.stringify(entries, null, 2);
}
