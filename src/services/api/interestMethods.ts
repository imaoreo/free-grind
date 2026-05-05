import {
	interestTapsResponseSchema,
	interestViewsResponseSchema,
	type InterestTapsResponse,
	type InterestViewsResponse,
} from "../../types/interest";
import type { TapResult } from "../../types/api-functions";
import type { RestFetcher } from "../../types/chat-service";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";

export function createInterestMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async getViews(): Promise<InterestViewsResponse> {
			const response = await fetchRest("/v7/views/list");
			await assertSuccess(response, t("api.errors.load_views"));
			return interestViewsResponseSchema.parse(await parseJsonSafe(response));
		},

		async getTaps(): Promise<InterestTapsResponse> {
			const response = await fetchRest("/v2/taps/received");
			await assertSuccess(response, t("api.errors.load_taps"));
			return interestTapsResponseSchema.parse(await parseJsonSafe(response));
		},

		async tap(profileId: string | number): Promise<TapResult> {
			const recipientId =
				typeof profileId === "number" ? profileId : Number(profileId);

			if (!Number.isFinite(recipientId)) {
				throw new ApiFunctionError(t("api.errors.invalid_profile_id"), 400, { profileId });
			}

			const response = await fetchRest("/v2/taps/add", {
				method: "POST",
				body: {
					recipientId,
					tapType: 0,
				},
			});
			await assertSuccess(response, t("api.errors.send_tap"));

			const payload = await parseJsonSafe(response);
			const isMutual =
				typeof payload === "object" &&
				payload !== null &&
				"isMutual" in payload &&
				typeof (payload as { isMutual?: unknown }).isMutual === "boolean"
					? ((payload as { isMutual: boolean }).isMutual ?? false)
					: false;

			return { isMutual };
		},
	};
}
