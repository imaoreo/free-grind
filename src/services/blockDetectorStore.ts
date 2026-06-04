import { appLog } from "../utils/logger";

export interface BlockEvent {
	profileId: string;
	displayName: string | null;
	imageHash: string | null;
	timestamp: number;
}

export interface RawBlockLog {
	type: string;
	payload: any;
	timestamp: number;
}

const BLOCKS_STORAGE_KEY = "fg-detected-blocks";
const RAW_LOGS_STORAGE_KEY = "fg-raw-block-logs";

export function getBlockEvents(): BlockEvent[] {
	try {
		const stored = localStorage.getItem(BLOCKS_STORAGE_KEY);
		return stored ? (JSON.parse(stored) as BlockEvent[]) : [];
	} catch (error) {
		appLog.error("[block-store] failed to parse block events:", error);
		return [];
	}
}

export function saveBlockEvents(events: BlockEvent[]) {
	try {
		localStorage.setItem(BLOCKS_STORAGE_KEY, JSON.stringify(events));
	} catch (error) {
		appLog.error("[block-store] failed to save block events:", error);
	}
}

export function addBlockEvent(event: BlockEvent) {
	const current = getBlockEvents();
	// Avoid duplicates within a short time window
	const isDuplicate = current.some(
		(e) => e.profileId === event.profileId && Math.abs(e.timestamp - event.timestamp) < 60000
	);
	if (isDuplicate) return;

	const updated = [event, ...current].slice(0, 100); // limit to last 100 events
	saveBlockEvents(updated);
}

export function clearBlockEvents() {
	saveBlockEvents([]);
}

export function getRawBlockLogs(): RawBlockLog[] {
	try {
		const stored = localStorage.getItem(RAW_LOGS_STORAGE_KEY);
		return stored ? (JSON.parse(stored) as RawBlockLog[]) : [];
	} catch (error) {
		appLog.error("[block-store] failed to parse raw block logs:", error);
		return [];
	}
}

export function saveRawBlockLogs(logs: RawBlockLog[]) {
	try {
		localStorage.setItem(RAW_LOGS_STORAGE_KEY, JSON.stringify(logs));
	} catch (error) {
		appLog.error("[block-store] failed to save raw block logs:", error);
	}
}

export function addRawBlockLog(log: Omit<RawBlockLog, "timestamp">) {
	const current = getRawBlockLogs();
	const fullLog: RawBlockLog = {
		...log,
		timestamp: Date.now(),
	};
	const updated = [fullLog, ...current].slice(0, 100); // limit to last 100 logs
	saveRawBlockLogs(updated);
}

export function clearRawBlockLogs() {
	saveRawBlockLogs([]);
}
