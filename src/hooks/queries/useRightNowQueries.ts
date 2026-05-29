import { useQuery } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import type { RightNowFeedItem } from "../../services/apiFunctions";

import { SCROLL_RESTORATION_TIMEOUT_MS, DEFAULT_STALE_TIME_MS } from "../../config/ui-constants";

interface RightNowQueryParams {
	sort: string;
	hosting?: boolean;
	ageMin?: number;
	ageMax?: number;
	sexualPositions?: string;
}

export function useRightNowFeed(params: RightNowQueryParams) {
	const api = useApiFunctions();

	return useQuery({
		queryKey: ["rightnow", "feed", params],
		queryFn: async () => {
			const items = await api.getRightNowFeed(params);
			// Deduplicate items by their ID to prevent React "duplicate key" errors
			// if the API returns overlapping data during refreshes.
			const seen = new Set();
			return items.filter((item) => {
				const key = item.id ?? item.profileId;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true,
	});
}
