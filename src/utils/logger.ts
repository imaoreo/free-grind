const isDev = import.meta.env.DEV;
const MAX_LOG_HISTORY = 100;

type AppLogLevel = "debug" | "info" | "warn" | "error";

export type AppLogEntry = {
	timestamp: string;
	level: AppLogLevel;
	args: unknown[];
};

const logHistory: AppLogEntry[] = [];

function normalizeLogArg(value: unknown): unknown {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean" ||
		value == null
	) {
		return value;
	}

	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return String(value);
	}
	}

function pushLogEntry(level: AppLogLevel, args: unknown[]) {
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