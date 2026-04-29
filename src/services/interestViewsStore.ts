type StoredInterestView = {
	profileId: string;
	displayName: string;
	imageHash: string | null;
	timestamp: number | null;
	viewCount: number | null;
	updatedAt: number;
};

const DB_NAME = "open-grind-interest";
const DB_VERSION = 1;
const STORE_NAME = "views";

function openDatabase(): Promise<IDBDatabase | null> {
	if (typeof window === "undefined" || !("indexedDB" in window)) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		const request = window.indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: "profileId" });
				store.createIndex("updatedAt", "updatedAt", { unique: false });
			}
		};

		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(null);
	});
}

function getAllFromStore(db: IDBDatabase): Promise<StoredInterestView[]> {
	return new Promise((resolve) => {
		const tx = db.transaction(STORE_NAME, "readonly");
		const store = tx.objectStore(STORE_NAME);
		const request = store.getAll();

		request.onsuccess = () => {
			const rows = Array.isArray(request.result)
				? (request.result as StoredInterestView[])
				: [];
			rows.sort((left, right) => {
				const leftSort = left.timestamp ?? left.updatedAt;
				const rightSort = right.timestamp ?? right.updatedAt;
				return rightSort - leftSort;
			});
			resolve(rows);
		};

		request.onerror = () => resolve([]);
	});
}

function putMany(db: IDBDatabase, rows: StoredInterestView[]): Promise<void> {
	return new Promise((resolve) => {
		const tx = db.transaction(STORE_NAME, "readwrite");
		const store = tx.objectStore(STORE_NAME);
		for (const row of rows) {
			store.put(row);
		}
		tx.oncomplete = () => resolve();
		tx.onerror = () => resolve();
		tx.onabort = () => resolve();
	});
}

export const interestViewsStore = {
	async getAll(): Promise<StoredInterestView[]> {
		const db = await openDatabase();
		if (!db) {
			return [];
		}

		try {
			return await getAllFromStore(db);
		} finally {
			db.close();
		}
	},

	async upsertMany(rows: Omit<StoredInterestView, "updatedAt">[]): Promise<void> {
		if (rows.length === 0) {
			return;
		}

		const db = await openDatabase();
		if (!db) {
			return;
		}

		const now = Date.now();
		const nextRows: StoredInterestView[] = rows.map((row) => ({
			...row,
			updatedAt: now,
		}));

		try {
			await putMany(db, nextRows);
		} finally {
			db.close();
		}
	},
};

export type { StoredInterestView };