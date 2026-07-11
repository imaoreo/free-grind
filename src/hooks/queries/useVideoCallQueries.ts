import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiFunctions } from "../useApiFunctions";
import { useAuth } from "../../contexts/useAuth";

// Account-wide (not per-conversation) allowance from GET /v3/video-call —
// only changes after a call is used or when a new billing period starts
// (daily for Free, monthly for XTRA/Unlimited), so it's fetched once and
// cached rather than refetched per conversation/screen.
export const VIDEO_CALL_INFO_QUERY_KEY = ["video-call-remaining-seconds"] as const;

export function useVideoCallRemainingSeconds(enabled: boolean) {
	const api = useApiFunctions();
	const { userId } = useAuth();
	return useQuery({
		queryKey: VIDEO_CALL_INFO_QUERY_KEY,
		queryFn: async () => (await api.getVideoCallInfo()).remainingSeconds,
		enabled: enabled && userId != null,
		staleTime: Infinity,
		gcTime: Infinity,
	});
}

export function useRefreshVideoCallRemainingSeconds() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: VIDEO_CALL_INFO_QUERY_KEY });
}
