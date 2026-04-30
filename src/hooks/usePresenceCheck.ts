import { useEffect, useState, useCallback } from "react";
import { useApiFunctions } from "./useApiFunctions";
import { useAnalyticsConsent } from "./useAnalyticsConsent";

type ApiFunctions = ReturnType<typeof useApiFunctions>;

const presenceCache = new Map<string, boolean>();

// --- Microtask-based request coalescer ---
// Collects IDs from concurrent usePresenceCheck calls and fires a single
// batch API request on the next microtask tick, eliminating N+1 patterns in
// grid/list views where each tile mounts its own usePresenceCheck.
type BatchResolver = (value: boolean) => void;

type PendingBatch = {
	apiFunctions: ApiFunctions;
	ids: Map<string, BatchResolver[]>;
};

let currentBatch: PendingBatch | null = null;
let flushScheduled = false;

function scheduleFlush() {
	if (flushScheduled) return;
	flushScheduled = true;
	void Promise.resolve().then(async () => {
		flushScheduled = false;
		if (!currentBatch) return;

		const { apiFunctions, ids } = currentBatch;
		currentBatch = null;

		const idList = [...ids.keys()];

		try {
			const results = await apiFunctions.checkPresence(idList);
			ids.forEach((callbacks, id) => {
				const val = results[id] ?? false;
				presenceCache.set(id, val);
				callbacks.forEach((cb) => cb(val));
			});
		} catch {
			// On error resolve all pending resolvers with false so hooks don't hang.
			ids.forEach((callbacks, id) => {
				presenceCache.set(id, false);
				callbacks.forEach((cb) => cb(false));
			});
		}
	});
}

function enqueueBatchCheck(id: string, apiFunctions: ApiFunctions): Promise<boolean> {
	if (!currentBatch) {
		currentBatch = { apiFunctions, ids: new Map() };
	} else {
		// Update to the most recent apiFunctions reference (same instance in practice).
		currentBatch.apiFunctions = apiFunctions;
	}
	return new Promise<boolean>((resolve) => {
		const existing = currentBatch!.ids.get(id);
		if (existing) {
			existing.push(resolve);
		} else {
			currentBatch!.ids.set(id, [resolve]);
		}
		scheduleFlush();
	});
}

/**
 * Hook to check if a single profile uses Free Grind.
 * Concurrent calls from the same render are automatically coalesced into a
 * single batch API request. Re-evaluates when consent changes.
 */
export function usePresenceCheck(profileId: string | null) {
	const [usesFreegrind, setUsesFreegrind] = useState<boolean | null>(null);
	const apiFunctions = useApiFunctions();
	const hasConsent = useAnalyticsConsent();

	useEffect(() => {
		let isActive = true;

		if (!hasConsent) {
			presenceCache.clear();
			setUsesFreegrind(null);
			return () => {
				isActive = false;
			};
		}

		if (!profileId) {
			setUsesFreegrind(null);
			return () => {
				isActive = false;
			};
		}

		// Check cache first
		if (presenceCache.has(profileId)) {
			setUsesFreegrind(presenceCache.get(profileId) ?? false);
			return () => {
				isActive = false;
			};
		}

		// Enqueue in the coalescing batch
		void enqueueBatchCheck(profileId, apiFunctions).then((isFreegrind) => {
			if (!isActive) {
				return;
			}
			setUsesFreegrind(isFreegrind);
		});

		return () => {
			isActive = false;
		};
	}, [profileId, apiFunctions, hasConsent]);

	return usesFreegrind;
}

/**
 * Hook to check multiple profile IDs at once (max 50).
 * Returns a map of profileId -> boolean.
 * Re-evaluates when consent changes.
 */
export function usePresenceCheckBatch(profileIds: string[] | null) {
	const [results, setResults] = useState<Record<string, boolean>>({});
	const apiFunctions = useApiFunctions();
	const hasConsent = useAnalyticsConsent();

	const check = useCallback(
		async (ids: string[]) => {
			if (ids.length === 0) {
				setResults({});
				return;
			}

			// Filter out already cached IDs
			const uncachedIds = ids.filter((id) => !presenceCache.has(id));

			if (uncachedIds.length > 0) {
				const apiResults = await apiFunctions.checkPresence(uncachedIds);
				// Store in cache
				Object.entries(apiResults).forEach(([id, isFreegrind]) => {
					presenceCache.set(id, isFreegrind);
				});
			}

			// Combine cached and new results
			const combined: Record<string, boolean> = {};
			ids.forEach((id) => {
				combined[id] = presenceCache.get(id) ?? false;
			});
			setResults(combined);
		},
		[apiFunctions]
	);

	useEffect(() => {
		if (!hasConsent) {
			presenceCache.clear();
			setResults({});
			return;
		}

		if (profileIds && profileIds.length > 0) {
			void check(profileIds);
		}
	}, [profileIds, check, hasConsent]);

	return results;
}
