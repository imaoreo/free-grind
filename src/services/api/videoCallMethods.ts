import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";
import type { StartVideoCallResult, VideoCallInfoResult, RenewVideoCallResult } from "../../types/video-call";

export function createVideoCallMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async startVideoCall(targetProfileId: number): Promise<StartVideoCallResult> {
			const response = await fetchRest("/v1/video-call", {
				method: "POST",
				body: { targetProfileId },
			});
			await assertSuccess(response, t("video_call.start_failed"));
			return response.json() as Promise<StartVideoCallResult>;
		},

		// Response body isn't documented — some backends return a fresh Agora
		// token here for the callee, so we parse it defensively rather than
		// assuming an empty body.
		async joinVideoCall(channelId: string): Promise<{ token: string | null }> {
			const response = await fetchRest("/v1/video-call/join", {
				method: "PATCH",
				body: { channelId },
			});
			await assertSuccess(response, t("video_call.join_failed"));
			const payload = await parseJsonSafe(response);
			const token =
				payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).token === "string"
					? ((payload as Record<string, unknown>).token as string)
					: null;
			return { token };
		},

		async leaveVideoCall(channelId: string): Promise<void> {
			const response = await fetchRest("/v1/video-call/leave", {
				method: "PATCH",
				body: { channelId },
			});
			await assertSuccess(response, t("video_call.leave_failed"));
		},

		// Renews the Agora token for the caller's own active call. No body —
		// the server identifies the call via the session, not a channelId, so
		// this can't be spoofed into renewing someone else's call.
		async extendVideoCall(): Promise<RenewVideoCallResult> {
			const response = await fetchRest("/v1/video-call", {
				method: "PATCH",
			});
			await assertSuccess(response, t("video_call.extend_failed"));
			return response.json() as Promise<RenewVideoCallResult>;
		},

		// Confirmed shape: { remainingSeconds }. Remaining allowance for the
		// current period — daily for Free accounts, monthly for XTRA/Unlimited.
		async getVideoCallInfo(): Promise<VideoCallInfoResult> {
			const response = await fetchRest("/v3/video-call", {
				method: "GET",
			});
			await assertSuccess(response, t("video_call.info_failed"));
			return response.json() as Promise<VideoCallInfoResult>;
		},
	};
}
