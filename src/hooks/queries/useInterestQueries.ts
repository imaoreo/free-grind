import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useEffect } from "react";
import { TAP_RECEIVED_EVENT, VIEW_RECEIVED_EVENT } from "../../components/ChatRealtimeBridge";
import { interestViewsStore } from "../../services/interestViewsStore";
import { fromStoredView, toStoredView, normalizeViews, normalizeTaps } from "../../pages/app/interest/interestUtils";
import { useTranslation } from "react-i18next";
import { DEFAULT_STALE_TIME_MS } from "../../config/ui-constants";

export function useInterestData() {
	const api = useApiFunctions();
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	const query = useQuery({
		queryKey: ["interest", "list"],
		queryFn: async () => {
			// 1. Parallel fetch from API
			const [tapsResponse, viewsResponse] = await Promise.all([
				api.getTaps(),
				api.getViews(),
			]);

			// 2. Load cached views from IndexedDB (persistence)
			const cachedRows = await interestViewsStore.getAll();
			const cachedViews = cachedRows.map(fromStoredView);

			// 3. Normalize & Merge
			const normalizedViews = normalizeViews(viewsResponse, cachedViews, t);
			const normalizedTaps = normalizeTaps(tapsResponse, t);

			// 4. Update persistence store with merged views
			await interestViewsStore.upsertMany(
				normalizedViews.map((item) => toStoredView(item))
			);

			return {
				taps: normalizedTaps,
				views: normalizedViews,
				// Extract viewedCount from the raw response for the UI
				viewedCount: (viewsResponse as any)?.totalViewers || (viewsResponse as any)?.data?.totalViewers || 0
			};
		},
		staleTime: DEFAULT_STALE_TIME_MS,
		refetchOnWindowFocus: true, // Auto-sync when app returns to foreground
	});

	// Handle WebSocket updates
	useEffect(() => {
		const handleUpdate = () => {
			// Invalidate query to trigger a background refetch
			queryClient.invalidateQueries({ queryKey: ["interest", "list"] });
		};

		window.addEventListener(TAP_RECEIVED_EVENT, handleUpdate);
		window.addEventListener(VIEW_RECEIVED_EVENT, handleUpdate);

		return () => {
			window.removeEventListener(TAP_RECEIVED_EVENT, handleUpdate);
			window.removeEventListener(VIEW_RECEIVED_EVENT, handleUpdate);
		};
	}, [queryClient]);

	return query;
}
