import { appLog } from "../utils/logger";

type BlockedMeRecord = {
	profileId: string;
	conversationId: string;
	displayName: string;
	avatarHash: string | null;
	lastSeenAt: number;
	status: "watching" | "confirmed";
	blockedAt: number | null;
	updatedAt: number;
};

const DB_NAME = "open-grind-blocked-me";
const DB_VERSION = 1;
const STORE_NAME = "blocked_me";

const MAX_WATCHING_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 daysjll

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		try {
			const request = window.indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: "profileId" });
				}
			};

			request.onsuccess = () => resolve(request.result);
			request.onerror = (e) => {
				appLog.error("[blockedMeStore] IDB Open Error", e);
				resolve(null);
			};
		} catch (err) {
			appLog.error("[blockedMeStore] IDB Fatal Error", err);
			resolve(null);
		}
	});
}

export const blockedMeStore = {
	async getAll(): Promise<BlockedMeRecord[]> {
		const db = await openDatabase();
		if (!db) return [];

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readonly");
			const store = tx.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const rows = (request.result as BlockedMeRecord[]) || [];
				db.close();
				resolve(rows);
			};

			request.onerror = (event) => {
				appLog.error("[blockedMeStore] getAll request failed", event);
				db.close();
				resolve([]);
			};
		});
	},

	async getConfirmed(): Promise<BlockedMeRecord[]> {
		const rows = await blockedMeStore.getAll();
		return rows
			.filter((row) => row.status === "confirmed")
			.sort((a, b) => (b.blockedAt ?? 0) - (a.blockedAt ?? 0));
	},

	async upsertWatching(
		rows: Array<Pick<BlockedMeRecord, "profileId" | "conversationId" | "displayName" | "avatarHash" | "lastSeenAt">>,
	): Promise<void> {
		if (rows.length === 0) return;

		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const now = Date.now();

			for (const row of rows) {
				const getRequest = store.get(row.profileId);
				getRequest.onsuccess = () => {
					const existing = getRequest.result as BlockedMeRecord | undefined;
					if (existing?.status === "confirmed") return;
					store.put({
						...row,
						status: "watching",
						blockedAt: null,
						updatedAt: now,
					} satisfies BlockedMeRecord);
				};
			}

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (e) => {
				appLog.error("[blockedMeStore] upsertWatching error", e);
				db.close();
				resolve();
			};
		});
	},

	async markConfirmed(profileId: string, blockedAt: number): Promise<void> {
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const getRequest = store.get(profileId);

			getRequest.onsuccess = () => {
				const existing = getRequest.result as BlockedMeRecord | undefined;
				if (!existing) {
					db.close();
					resolve();
					return;
				}
				store.put({
					...existing,
					status: "confirmed",
					blockedAt,
					updatedAt: Date.now(),
				} satisfies BlockedMeRecord);
			};

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (e) => {
				appLog.error("[blockedMeStore] markConfirmed error", e);
				db.close();
				resolve();
			};
		});
	},

	async removeRecord(profileId: string): Promise<void> {
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			store.delete(profileId);

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (e) => {
				appLog.error("[blockedMeStore] removeRecord error", e);
				db.close();
				resolve();
			};
		});
	},

	async cleanup(): Promise<void> {
		const db = await openDatabase();
		if (!db) return;

		return new Promise((resolve) => {
			const tx = db.transaction(STORE_NAME, "readwrite");
			const store = tx.objectStore(STORE_NAME);
			const request = store.getAll();

			request.onsuccess = () => {
				const rows = (request.result as BlockedMeRecord[]) || [];
				const now = Date.now();

				for (const row of rows) {
					if (row.status === "watching" && now - row.lastSeenAt > MAX_WATCHING_AGE_MS) {
						store.delete(row.profileId);
					}
				}
			};

			tx.oncomplete = () => {
				db.close();
				resolve();
			};

			tx.onerror = (event) => {
				appLog.error("[blockedMeStore] cleanup transaction failed", event);
				db.close();
				resolve();
			};
		});
	},
};

export type { BlockedMeRecord };
