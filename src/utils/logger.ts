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

function redactUnknown(value: unknown, parentKey?: string): unknown {
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

	if (Array.isArray(value)) {
		return value.map((entry) => redactUnknown(entry));
	}

	if (typeof value === "object") {
		const output: Record<string, unknown> = {};
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			output[key] = redactUnknown(nested, key);
		}
		return output;
	}

	return String(value);
}

function normalizeLogArg(value: unknown): unknown {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	let serializable: unknown = value;
	if (typeof value === "object" && value !== null) {
		try {
			serializable = JSON.parse(JSON.stringify(value));
		} catch {
			serializable = String(value);
		}
	}

	return redactUnknown(serializable);
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

	const writer =
		level === "debug"
			? console.debug
			: level === "info"
				? console.info
				: level === "warn"
					? console.warn
					: console.error;

	writer(...args);
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