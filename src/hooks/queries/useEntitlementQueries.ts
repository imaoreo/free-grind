import { useQuery } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import type { RightNowEntitlements } from "../../types/right-now";

/**
 * Hook to fetch user entitlements.
 * Stale time is set to Infinity to fetch only once per session.
 */
export function useEntitlements(userId: number | null, enabled = true) {
	const api = useApiFunctions();
	return useQuery<RightNowEntitlements>({
		queryKey: ["entitlements", userId],
		queryFn: () => api.getEntitlements(),
		staleTime: Infinity,
		gcTime: Infinity,
		enabled: enabled && !!userId,
	});
}
