import { useEffect, useState, useCallback } from "react";
import { useApiFunctions } from "./useApiFunctions";
import { useAnalyticsConsent } from "./useAnalyticsConsent";

const presenceCache = new Map<string, boolean>();

/**
 * Hook to check if a profile uses Free Grind.
 * Caches results and re-evaluates when consent changes.
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

		// Query the API
		void apiFunctions.checkPresence(profileId).then((result) => {
			if (!isActive) {
				return;
			}

			const isFreegrind = result[profileId] ?? false;
			presenceCache.set(profileId, isFreegrind);
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
