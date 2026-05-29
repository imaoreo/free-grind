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
			return await api.getRightNowFeed(params);
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true,
	});
}
