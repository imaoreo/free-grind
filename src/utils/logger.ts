const isDev = import.meta.env.DEV;
const MAX_LOG_HISTORY = 100;
const REDACTED = "[REDACTED]";

type AppLogLevel = "debug" | "info" | "warn" | "error";

export type AppLogEntry = {
	timestamp: string;
	level: AppLogLevel;
	args: unknown[];
};

const logHistory: AppLogEntry[] = [];

const REDACT_KEY_PATTERN = /(token|authorization|auth|cookie|session|password|secret|api[_-]?key|jwt)/i;

function isLikelySensitiveString(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}

	const bearerLike = /^Bearer\s+[A-Za-z0-9._\-+/=]+$/i.test(trimmed);
	const jwtLike = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed);
	const longOpaque = /^[A-Za-z0-9+/_=-]{24,}$/.test(trimmed);

	return bearerLike || jwtLike || longOpaque;
}

function shouldRedactKey(key: string): boolean {
	return REDACT_KEY_PATTERN.test(key);
}

function redactUnknown(value: unknown, parentKey?: string, seen = new WeakSet()): unknown {
	if (parentKey && shouldRedactKey(parentKey)) {
		return REDACTED;
	}

	if (typeof value === "string") {
		return isLikelySensitiveString(value) ? REDACTED : value;
	}

	if (
		typeof value === "number" ||
		typeof value === "boolean" ||
		value == null
	) {
		return value;
	}

	if (typeof value === "object") {
		// Prevent circular references
		if (seen.has(value as object)) {
			return "[Circular]";
		}
		seen.add(value as object);

		if (Array.isArray(value)) {
			return value.map((entry) => redactUnknown(entry, undefined, seen));
		}

		const output: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			output[key] = redactUnknown(nested, key, seen);
		}
		return output;
	}

	return String(value);
}

// Host-object error types — DOMException (getUserMedia), GeolocationPositionError
// (navigator.geolocation), and similar — don't extend Error and carry their
// name/message/code on the prototype rather than as own enumerable properties,
// so redactUnknown's Object.entries() finds nothing and logs "{}". Duck-type
// instead of enumerating every such type individually.
function isErrorLike(
	value: unknown,
): value is { name?: string; message?: string; code?: number; stack?: string } {
	if (value instanceof Error) {
		return true;
	}
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as { message?: unknown; name?: unknown; code?: unknown };
	return (
		typeof candidate.message === "string" &&
		(typeof candidate.name === "string" || typeof candidate.code === "number")
	);
}

function normalizeLogArg(value: unknown): unknown {
	if (isErrorLike(value)) {
		return {
			name: value.name,
			message: value.message,
			...(typeof value.code === "number" ? { code: value.code } : {}),
			...(value.stack ? { stack: value.stack } : {}),
		};
	}

	return redactUnknown(value);
}

function shouldCaptureForHistory(level: AppLogLevel): boolean {
	if (isDev) {
		return true;
	}

	return level === "warn" || level === "error";
}

function pushLogEntry(level: AppLogLevel, args: unknown[]) {
	if (!shouldCaptureForHistory(level)) {
		return;
	}

	logHistory.push({
		timestamp: new Date().toISOString(),
		level,
		args: args.map(normalizeLogArg),
	});

	if (logHistory.length > MAX_LOG_HISTORY) {
		logHistory.splice(0, logHistory.length - MAX_LOG_HISTORY);
	}
}

function writeLog(level: AppLogLevel, args: unknown[]) {
	pushLogEntry(level, args);

	if ((level === "debug" || level === "info") && !isDev) {
		return;
	}

	const processedArgs = args.map((arg) => {
		if (typeof arg === "object" && arg !== null) {
			try {
				return JSON.stringify(normalizeLogArg(arg));
			} catch {
				return String(arg);
			}
		}
		return arg;
	});

	const writer =
		level === "debug"
			? console.debug
			: level === "info"
				? console.info
				: level === "warn"
					? console.warn
					: console.error;

	writer(...processedArgs);
}

export function getRecentAppLogs(limit = MAX_LOG_HISTORY): AppLogEntry[] {
	if (limit <= 0) {
		return [];
	}

	return logHistory.slice(-limit);
}

export const appLog = {
	debug: (...args: unknown[]) => {
		writeLog("debug", args);
	},
	info: (...args: unknown[]) => {
		writeLog("info", args);
	},
	warn: (...args: unknown[]) => {
		writeLog("warn", args);
	},
	error: (...args: unknown[]) => {
		writeLog("error", args);
	},
};