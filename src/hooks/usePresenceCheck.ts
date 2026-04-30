import { useEffect, useState, useCallback } from "react";
import { useApiFunctions } from "./useApiFunctions";

const presenceCache = new Map<string, boolean>();

/**
 * Hook to check if a profile uses Free Grind
 * Caches results and queries in batches
 */
export function usePresenceCheck(profileId: string | null) {
	const [usesFreegrind, setUsesFreegrind] = useState<boolean | null>(null);
	const apiFunctions = useApiFunctions();

	useEffect(() => {
		if (!profileId) {
			setUsesFreegrind(null);
			return;
		}

		// Check cache first
		if (presenceCache.has(profileId)) {
			setUsesFreegrind(presenceCache.get(profileId) ?? false);
			return;
		}

		// Query the API
		void apiFunctions.checkPresence(profileId).then((result) => {
			const isFreegrind = result[profileId] ?? false;
			presenceCache.set(profileId, isFreegrind);
			setUsesFreegrind(isFreegrind);
		});
	}, [profileId, apiFunctions]);

	return usesFreegrind;
}

/**
 * Hook to check multiple profile IDs at once (max 50)
 * Returns a map of profileId -> boolean
 */
export function usePresenceCheckBatch(profileIds: string[] | null) {
	const [results, setResults] = useState<Record<string, boolean>>({});
	const apiFunctions = useApiFunctions();

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
		if (profileIds && profileIds.length > 0) {
			void check(profileIds);
		}
	}, [profileIds, check]);

	return results;
}
