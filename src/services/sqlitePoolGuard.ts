import type Database from "@tauri-apps/plugin-sql";
import { appLog } from "../utils/logger";

/**
 * chatDb.ts and chatContactIndex.ts each own a connection that gets closed
 * out from under in-flight queries whenever the active account switches
 * (chatDb closes the previous account's pool by path so the new account
 * never shows stale data — see setActiveChatDbUser). Anything already
 * in-flight against that pool at the moment of closing loses the race and
 * throws sqlx's "attempted to acquire a connection on a closed pool", which
 * nothing downstream catches, surfacing as an unhandled rejection.
 *
 * That data is for an account we've already navigated away from, so it's
 * not worth reconnecting or retrying — just fail soft.
 */
export function isClosedPoolError(error: unknown): boolean {
	const message =
		error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
	return /closed pool|connection.*closed|pool.*closed/i.test(message ?? "");
}

export function guardAgainstClosedPool(db: Database, label: string): Database {
	const rawSelect = db.select.bind(db);
	const rawExecute = db.execute.bind(db);

	db.select = (async <T>(query: string, values?: unknown[]): Promise<T> => {
		try {
			return await rawSelect<T>(query, values);
		} catch (error) {
			if (!isClosedPoolError(error)) {
				throw error;
			}
			appLog.warn(`[${label}] select skipped: connection pool already closed`, { query });
			return [] as unknown as T;
		}
	}) as Database["select"];

	db.execute = (async (query: string, values?: unknown[]) => {
		try {
			return await rawExecute(query, values);
		} catch (error) {
			if (!isClosedPoolError(error)) {
				throw error;
			}
			appLog.warn(`[${label}] write dropped: connection pool already closed`, { query });
			return { rowsAffected: 0 };
		}
	}) as Database["execute"];

	return db;
}
