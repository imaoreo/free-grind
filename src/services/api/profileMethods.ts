import {
	browseCardSchema,
	browseProfileSchema,
	cascadeResponseSchema,
	profileDetailResponseSchema,
	type BrowseCard,
	type ProfileDetail,
} from "../../types/grid";
import type {
	ManagedGender,
	ManagedPronoun,
	ProfileImageUploadResult,
} from "../../types/api-functions";
import type { RestFetcher } from "../../types/chat-service";
import type { VisitingMode } from "../../types/visiting";
import { isVisitingMode } from "../../types/visiting";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";
import { appLog } from "../../utils/logger";

export type BlockedProfile = {
	profileId: string;
	displayName: string | null;
	profileImageMediaHash: string | null;
	timestamp: number | null;
};

export function createProfileMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	const methods = {
		async getBlockedProfiles(): Promise<BlockedProfile[]> {
			const response = await fetchRest("/v3.1/me/blocks");
			await assertSuccess(response, t("profile_details.block_failed"));
			const payload = await parseJsonSafe(response);

			if (typeof payload !== "object" || payload === null) {
				throw new ApiFunctionError(
					t("profile_details.block_failed"),
					response.status,
					payload,
				);
			}

			const blocking = (payload as { blocking?: unknown }).blocking;
			if (!Array.isArray(blocking) || blocking.length === 0) {
				return [];
			}

			const blockEntries = blocking
				.map((entry) => {
					if (typeof entry !== "object" || entry === null) return null;
					const profileId = (entry as { profileId?: unknown }).profileId;
					const blockedTime = (entry as { blockedTime?: unknown }).blockedTime;
					if (typeof profileId !== "string" && typeof profileId !== "number") return null;
					return {
						profileId: String(profileId),
						timestamp: typeof blockedTime === "number" ? blockedTime : null,
					};
				})
				.filter((entry): entry is { profileId: string; timestamp: number | null } => entry !== null);

			if (blockEntries.length === 0) {
				return [];
			}

			const targetProfileIds = blockEntries.map(e => Number(e.profileId)).filter(id => !isNaN(id));
			const detailsMap = new Map<string, { displayName: string | null; profileImageMediaHash: string | null }>();

			// Chunk targetProfileIds into batches of 50 to avoid Grindr API limit (typically 50-100 per request)
			const CHUNK_SIZE = 50;
			const chunks: number[][] = [];
			for (let i = 0; i < targetProfileIds.length; i += CHUNK_SIZE) {
				chunks.push(targetProfileIds.slice(i, i + CHUNK_SIZE));
			}

			try {
				appLog.debug(`[getBlockedProfiles] Fetching details for ${targetProfileIds.length} profiles in ${chunks.length} chunks`);
				await Promise.all(
					chunks.map(async (chunk, index) => {
						const detailsResponse = await fetchRest("/v3/profiles", {
							method: "POST",
							body: { targetProfileIds: chunk },
						});
						await assertSuccess(detailsResponse, t("profile_details.block_failed"));
						const detailsPayload = await parseJsonSafe(detailsResponse);

						if (detailsPayload && typeof detailsPayload === "object" && Array.isArray((detailsPayload as any).profiles)) {
							const profilesData = (detailsPayload as { profiles: any[] }).profiles;
							profilesData.forEach((p) => {
								if (p && typeof p === "object" && p.profileId) {
									detailsMap.set(String(p.profileId), {
										displayName: typeof p.displayName === "string" ? p.displayName : null,
										profileImageMediaHash: typeof p.profileImageMediaHash === "string" ? p.profileImageMediaHash : null,
									});
								}
							});
						} else {
							appLog.warn(`[getBlockedProfiles] Chunk ${index} returned invalid payload:`, detailsPayload);
						}
					})
				);

				// Map original block entries to include metadata, keeping the server's original ordering
				return blockEntries.map((entry) => {
					const meta = detailsMap.get(entry.profileId);
					return {
						profileId: entry.profileId,
						displayName: meta?.displayName ?? null,
						profileImageMediaHash: meta?.profileImageMediaHash ?? null,
						timestamp: entry.timestamp,
					};
				});
			} catch (err) {
				appLog.error("Failed to fetch blocked profile details:", err);
			}

			// Fallback if details query fails
			return blockEntries.map((entry) => ({
				profileId: entry.profileId,
				displayName: null,
				profileImageMediaHash: null,
				timestamp: entry.timestamp,
			}));
		},

		async getBlockedProfileIds(): Promise<string[]> {
			const profiles = await methods.getBlockedProfiles();
			return profiles.map((p) => p.profileId);
		},

		async blockProfile(profileId: string): Promise<{ ok: true }> {
			const response = await fetchRest(
				`/v3/me/blocks/${encodeURIComponent(profileId)}`,
				{ method: "POST" },
			);
			await assertSuccess(response, t("profile_details.block_failed"));
			return { ok: true };
		},

		async unblockProfile(profileId: string): Promise<{ ok: true }> {
			const response = await fetchRest(
				`/v3/me/blocks/${encodeURIComponent(profileId)}`,
				{ method: "DELETE" },
			);
			await assertSuccess(response, t("profile_details.unblock_failed"));
			return { ok: true };
		},

		async unblockAllProfiles(): Promise<{ ok: true }> {
			const response = await fetchRest("/v3/me/blocks", { method: "DELETE" });
			await assertSuccess(response, t("settings_blocked.unblock_all_failed", { defaultValue: "Failed to unblock all profiles." }));
			return { ok: true };
		},

		async getManagedGenders(): Promise<ManagedGender[]> {
			const response = await fetchRest("/public/v2/genders");
			await assertSuccess(response, t("api.errors.load_genders"));
			const payload = await parseJsonSafe(response);
			if (!Array.isArray(payload)) {
				throw new ApiFunctionError(t("api.errors.invalid_genders_response"), response.status, payload);
			}
			return payload
				.map((entry) => {
					if (
						typeof entry === "object" &&
						entry !== null &&
						typeof (entry as { genderId?: unknown }).genderId === "number" &&
						typeof (entry as { gender?: unknown }).gender === "string"
					) {
						return {
							genderId: (entry as { genderId: number }).genderId,
							gender: (entry as { gender: string }).gender,
						};
					}
					return null;
				})
				.filter((entry): entry is ManagedGender => entry !== null);
		},

		async getManagedPronouns(): Promise<ManagedPronoun[]> {
			const response = await fetchRest("/v1/pronouns");
			await assertSuccess(response, t("api.errors.load_pronouns"));
			const payload = await parseJsonSafe(response);
			if (!Array.isArray(payload)) {
				throw new ApiFunctionError(t("api.errors.invalid_pronouns_response"), response.status, payload);
			}
			return payload
				.map((entry) => {
					if (
						typeof entry === "object" &&
						entry !== null &&
						typeof (entry as { pronounId?: unknown }).pronounId === "number" &&
						typeof (entry as { pronoun?: unknown }).pronoun === "string"
					) {
						return {
							pronounId: (entry as { pronounId: number }).pronounId,
							pronoun: (entry as { pronoun: string }).pronoun,
						};
					}
					return null;
				})
				.filter((entry): entry is ManagedPronoun => entry !== null);
		},

		async getBrowseProfileMedia(profileId: number | string): Promise<{
			profileImageMediaHash: string | null;
			medias: Array<{ mediaHash?: string }>;
		}> {
			const response = await fetchRest(`/v7/profiles/${profileId}`);
			await assertSuccess(response, t("api.errors.load_profile_media"));
			const parsed = browseProfileSchema.parse(await parseJsonSafe(response));
			return {
				profileImageMediaHash: parsed.profiles[0]?.profileImageMediaHash ?? null,
				medias: parsed.profiles[0]?.medias ?? [],
			};
		},

		async getBrowseCards(params: {
			geohash: string;
			page?: number;
			filters?: {
				onlineOnly?: boolean;
				photoOnly?: boolean;
				faceOnly?: boolean;
				hasAlbum?: boolean;
				notRecentlyChatted?: boolean;
				fresh?: boolean;
				rightNow?: boolean;
				favorites?: boolean;
				shuffle?: boolean;
				hot?: boolean;
				ageMin?: number;
				ageMax?: number;
				heightCmMin?: number;
				heightCmMax?: number;
				weightGramsMin?: number;
				weightGramsMax?: number;
				tribes?: string;
				lookingFor?: string;
				relationshipStatuses?: string;
				bodyTypes?: string;
				sexualPositions?: string;
				meetAt?: string;
				nsfwPics?: string;
				tags?: string;
			};
		}): Promise<{ cards: BrowseCard[]; nextPage: number | null }> {
			const queryParams = new URLSearchParams({
				nearbyGeoHash: params.geohash,
			});

			if (typeof params.page === "number") {
				queryParams.set("pageNumber", String(params.page));
			}

			if (params.filters?.onlineOnly) queryParams.set("onlineOnly", "true");
			if (params.filters?.photoOnly) queryParams.set("photoOnly", "true");
			if (params.filters?.faceOnly) queryParams.set("faceOnly", "true");
			if (params.filters?.hasAlbum) queryParams.set("hasAlbum", "true");
			if (params.filters?.notRecentlyChatted)
				queryParams.set("notRecentlyChatted", "true");
			if (params.filters?.fresh) queryParams.set("fresh", "true");
			if (params.filters?.rightNow) queryParams.set("rightNow", "true");
			if (params.filters?.favorites) queryParams.set("favorites", "true");
			if (params.filters?.shuffle) queryParams.set("shuffle", "true");
			if (params.filters?.hot) queryParams.set("hot", "true");
			if (typeof params.filters?.ageMin === "number") {
				queryParams.set("ageMin", String(params.filters.ageMin));
			}
			if (typeof params.filters?.ageMax === "number") {
				queryParams.set("ageMax", String(params.filters.ageMax));
			}
			if (typeof params.filters?.heightCmMin === "number") {
				queryParams.set("heightCmMin", String(params.filters.heightCmMin));
			}
			if (typeof params.filters?.heightCmMax === "number") {
				queryParams.set("heightCmMax", String(params.filters.heightCmMax));
			}
			if (typeof params.filters?.weightGramsMin === "number") {
				queryParams.set("weightGramsMin", String(params.filters.weightGramsMin));
			}
			if (typeof params.filters?.weightGramsMax === "number") {
				queryParams.set("weightGramsMax", String(params.filters.weightGramsMax));
			}
			if (params.filters?.tribes) queryParams.set("tribes", params.filters.tribes);
			if (params.filters?.lookingFor)
				queryParams.set("lookingFor", params.filters.lookingFor);
			if (params.filters?.relationshipStatuses)
				queryParams.set("relationshipStatuses", params.filters.relationshipStatuses);
			if (params.filters?.bodyTypes)
				queryParams.set("bodyTypes", params.filters.bodyTypes);
			if (params.filters?.sexualPositions)
				queryParams.set("sexualPositions", params.filters.sexualPositions);
			if (params.filters?.meetAt) queryParams.set("meetAt", params.filters.meetAt);
			if (params.filters?.nsfwPics)
				queryParams.set("nsfwPics", params.filters.nsfwPics);
			if (params.filters?.tags) queryParams.set("tags", params.filters.tags);

			const url = `/v4/cascade?${queryParams.toString()}`;
			const response = await fetchRest(url);
			await assertSuccess(response, t("api.errors.load_browse_profiles"));
			const parsed = cascadeResponseSchema.parse(await parseJsonSafe(response));
			const cards: BrowseCard[] = [];
			for (const item of parsed.items) {
				if (item.type !== "full_profile_v1" && item.type !== "partial_profile_v1") {
					continue;
				}
				const candidate = browseCardSchema.safeParse(item.data);
				if (candidate.success) {
					cards.push(candidate.data);
				}
			}
			return {
				cards,
				nextPage: parsed.nextPage ?? null,
			};
		},

		async getProfileDetail(profileId: string): Promise<ProfileDetail> {
			const response = await fetchRest(`/v7/profiles/${profileId}`);
			await assertSuccess(response, t("api.errors.load_profile_details"));
			const parsed = profileDetailResponseSchema.parse(
				await parseJsonSafe(response),
			);

			return parsed.profiles[0];
		},

		async getRawProfile(profileId: number | string): Promise<unknown> {
			const response = await fetchRest(`/v7/profiles/${profileId}`);
			await assertSuccess(response, t("api.errors.load_profile"));
			return parseJsonSafe(response);
		},

		async getVisitingMode(): Promise<VisitingMode> {
			const response = await fetchRest("/v1/visiting/settings");
			await assertSuccess(response, t("api.errors.load_visiting_mode"));
			const payload = await parseJsonSafe(response);
			const setting =
				typeof payload === "object" && payload !== null
					? (payload as { setting?: unknown }).setting
					: null;

			if (!isVisitingMode(setting)) {
				throw new ApiFunctionError(
					t("api.errors.invalid_visiting_mode_response"),
					response.status,
					payload,
				);
			}

			return setting;
		},

		async updateVisitingMode(setting: VisitingMode): Promise<{ ok: true }> {
			const response = await fetchRest("/v1/visiting/settings", {
				method: "PUT",
				body: { setting },
			});
			await assertSuccess(response, t("api.errors.save_visiting_mode"));
			return { ok: true };
		},

		async updateMyProfile(payload: unknown): Promise<{ ok: true }> {
			const response = await fetchRest("/v4/me/profile", {
				method: "PATCH",
				body: payload,
			});
			await assertSuccess(response, t("api.errors.save_profile"));
			return { ok: true };
		},

		async updateMyProfileImages(payload: {
			primaryImageHash: string | null;
			secondaryImageHashes: string[];
		}): Promise<{ ok: true }> {
			const response = await fetchRest("/v3/me/profile/images", {
				method: "PUT",
				body: payload,
			});
			await assertSuccess(response, t("api.errors.update_photos"));
			return { ok: true };
		},

		async deleteMyProfileImages(mediaHashes: string[]): Promise<{ ok: true }> {
			const response = await fetchRest("/v3/me/profile/images", {
				method: "DELETE",
				body: { media_hashes: mediaHashes },
			});
			await assertSuccess(response, t("api.errors.delete_photos"));
			return { ok: true };
		},

		async uploadProfileImage(params: {
			path: string;
			body: Uint8Array;
			contentType: string;
		}): Promise<ProfileImageUploadResult> {
			const response = await fetchRest(params.path, {
				method: "POST",
				rawBody: params.body,
				contentType: params.contentType,
			});
			await assertSuccess(response, t("api.errors.upload_image"));
			const payload = await parseJsonSafe(response);
			if (typeof payload !== "object" || payload === null) {
				throw new ApiFunctionError(
					t("api.errors.invalid_upload_profile_response"),
					response.status,
					payload,
				);
			}
			return payload as ProfileImageUploadResult;
		},
	};
	return methods;
}
