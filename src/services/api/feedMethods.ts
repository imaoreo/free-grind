import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

export type RightNowFeedItem = {
	id: number | null;
	profileId: string;
	displayName: string | null;
	profileImageMediaHash: string | null;
	imageUrl: string | null;
	text: string | null;
	hosting: boolean;
	postedAt: number | null;
	distanceMeters: number | null;
	lat: number | null;
	lon: number | null;
	onlineUntil: number | null;
};

export function createFeedMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
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
					if (typeof item !== "object" || item === null) return null;
					const entry = item as Record<string, unknown>;
					if (entry.type !== "right_now_post_v3") return null;

					const r =
						typeof entry.data === "object" && entry.data !== null
							? (entry.data as Record<string, unknown>)
							: null;
					if (!r) return null;

					const profileId =
						typeof r.profileId === "string"
							? r.profileId
							: typeof r.profileId === "number"
								? String(r.profileId)
								: null;
					if (!profileId) return null;

					const firstMedia = Array.isArray(r.media) ? r.media[0] : null;
					const thumbnailUrl =
						typeof firstMedia === "object" &&
						firstMedia !== null &&
						typeof (firstMedia as { data?: unknown }).data === "object" &&
						(firstMedia as { data: Record<string, unknown> }).data !== null &&
						typeof (firstMedia as { data: Record<string, unknown> }).data.thumbnailUrl === "string"
							? ((firstMedia as { data: Record<string, string> }).data.thumbnailUrl ?? null)
							: null;

					return {
						id: typeof r.id === "number" ? r.id : null,
						profileId,
						displayName:
							typeof r.displayName === "string" ? r.displayName : null,
						profileImageMediaHash:
							typeof r.mediaHash === "string"
								? r.mediaHash
								: null,
						imageUrl: thumbnailUrl,
						text: typeof r.text === "string" ? r.text : null,
						hosting: r.hosting === true,
						postedAt:
							typeof r.posted === "number" ? r.posted : null,
						distanceMeters:
							typeof r.distance === "number" ? r.distance : null,
						lat: typeof r.lat === "number" ? r.lat : null,
						lon: typeof r.lon === "number" ? r.lon : null,
						onlineUntil:
							typeof r.onlineUntil === "number" ? r.onlineUntil : null,
					};
				})
				.filter((item): item is RightNowFeedItem => item !== null);
		},
	};
}
