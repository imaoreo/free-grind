import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";
import {
	type RightNowCreatePostRequest,
	type RightNowCreatePostResponse,
	type RightNowFeedItem,
	type RightNowUploadMediaResponse,
	type RightNowUpdatePostRequest,
	type RightNowEntitlements,
	rightNowCreatePostRequestSchema,
	rightNowCreatePostResponseSchema,
	rightNowFeedEntrySchema,
	rightNowUploadMediaResponseSchema,
	rightNowUpdatePostRequestSchema,
	rightNowEntitlementsSchema,
} from "../../types/right-now";

export function createFeedMethods(fetchRest: RestFetcher, t: (key: string, defaultValue?: string) => string) {
	return {
		async getEntitlements(): Promise<RightNowEntitlements> {
			const url = "/v1/entitlements";
			const response = await fetchRest(url);
			await assertSuccess(response, t("api.errors.load_right_now"));
			const payload = await parseJsonSafe(response);
			return rightNowEntitlementsSchema.parse(payload);
		},

		async uploadRightNowMedia(params: {
			body: Uint8Array;
			contentType: string;
			coords: {
				top: number;
				left: number;
				right: number;
				bottom: number;
			};
		}): Promise<RightNowUploadMediaResponse> {
			const { top, left, right, bottom } = params.coords;
			const url = `/v1/media/upload?img_1_bottom=${bottom}&img_1_left=${left}&img_1_right=${right}&img_1_top=${top}`;
			const response = await fetchRest(url, {
				method: "POST",
				rawBody: params.body,
				contentType: params.contentType,
			});
			await assertSuccess(response, t("api.errors.upload_image"));
			const payload = await parseJsonSafe(response);
			return rightNowUploadMediaResponseSchema.parse(payload);
		},

		async getRightNowFeed(params?: {
			sort?: "DISTANCE" | "RECENCY";
			hosting?: boolean;
			ageMin?: number;
			ageMax?: number;
			sexualPositions?: string;
		}): Promise<RightNowFeedItem[]> {
			const queryParams = new URLSearchParams();
			if (params?.sort) queryParams.set("sort", params.sort);
			if (params?.hosting != null) queryParams.set("hosting", String(params.hosting));
			if (typeof params?.ageMin === "number") queryParams.set("ageMin", String(params.ageMin));
			if (typeof params?.ageMax === "number") queryParams.set("ageMax", String(params.ageMax));
			if (params?.sexualPositions) queryParams.set("sexualPositions", params.sexualPositions);

			const url = `/v5/rightnow/feed?${queryParams.toString()}`;
			const response = await fetchRest(url);
			await assertSuccess(response, t("api.errors.load_right_now"));
			const raw = (await parseJsonSafe(response)) as Record<string, unknown> | null;
			const rawItems = Array.isArray(raw?.items) ? (raw.items as unknown[]) : [];

			return rawItems
				.map((item): RightNowFeedItem | null => {
					const result = rightNowFeedEntrySchema.safeParse(item);
					if (!result.success) return null;

					const type = result.data.type;
					if (type !== "right_now_post_v3" && type !== "locked_post_v1") {
						return null;
					}

					const r = result.data.data;
					return {
						id: r.id ?? null,
						profileId: r.profileId,
						displayName: r.displayName ?? null,
						profileImageMediaHash: r.mediaHash ?? null,
						media: r.media ?? [],
						text: r.text ?? null,
						hosting: r.hosting,
						postedAt: r.posted ?? null,
						expiresAt: r.expiration ?? null,
						distanceMeters: r.distance ?? null,
						lat: r.lat ?? null,
						lon: r.lon ?? null,
						onlineUntil: r.onlineUntil ?? null,
						isFavorite: r.favorite,
						recentlyChatted: r.recentlyChatted,
						mpuScore: r.mpuScore,
						premiumType: type === "locked_post_v1" ? (r.type ?? "locked") : null,
					};
				})
				.filter((item): item is RightNowFeedItem => item !== null);
		},

		async createRightNowPost(params: RightNowCreatePostRequest): Promise<RightNowCreatePostResponse> {
			const validated = rightNowCreatePostRequestSchema.parse(params);
			const url = "/v3/rightnow/posts";
			const response = await fetchRest(url, {
				method: "POST",
				body: validated,
			});
			await assertSuccess(response, t("api.errors.session_right_now"));
			const payload = await parseJsonSafe(response);
			return rightNowCreatePostResponseSchema.parse(payload);
		},

		async getActiveRightNowPost(): Promise<RightNowCreatePostResponse> {
			const url = "/v3/rightnow/active-post";
			const response = await fetchRest(url);
			await assertSuccess(response, t("api.errors.load_right_now"));
			const payload = await parseJsonSafe(response);
			return rightNowCreatePostResponseSchema.parse(payload);
		},

		async updateRightNowPost(
			postId: number,
			params: RightNowUpdatePostRequest,
		): Promise<{ ok: true }> {
			const validated = rightNowUpdatePostRequestSchema.parse(params);
			const url = `/v3/rightnow/posts/${postId}`;
			const response = await fetchRest(url, {
				method: "PATCH",
				body: validated,
			});
			await assertSuccess(response, t("api.errors.update_right_now", "Failed to update post"));
			return { ok: true };
		},
	};
}
