import {
	albumDetailSchema,
	albumLimitsSchema,
	albumsResponseSchema,
	sharedAlbumViewSchema,
	sharedAlbumsResponseSchema,
	type Album,
	type AlbumDetail,
	type AlbumLimits,
	type SharedAlbumView,
	type SharedAlbum,
} from "../types/albums";
import {
	browseCardSchema,
	browseProfileSchema,
	cascadeResponseSchema,
	profileDetailResponseSchema,
	type BrowseCard,
	type ProfileDetail,
} from "../types/grid";
import {
	type AgeVerificationFaceTecResponse,
	type AgeVerificationOptions,
	type AgeVerificationSession,
	type Liveness3dRequest,
} from "../types/age-verification";
import { createChatService } from "./chatService";
import type {
	CreateOwnAlbumInput,
	DeleteOwnAlbumContentInput,
	DeleteOwnAlbumInput,
	GetSharedAlbumsForProfileInput,
	ManagedGender,
	ManagedPronoun,
	OpenSharedAlbumInput,
	OpenSharedAlbumResult,
	ProfileImageUploadResult,
	ReorderOwnAlbumContentInput,
	RenameOwnAlbumInput,
	UploadOwnAlbumContentInput,
	GetSharedAlbumsInput,
} from "../types/api-functions";
import type { RestFetcher, RestResponse } from "../types/chat-service";

export class ApiFunctionError extends Error {
	status: number;
	payload: unknown;

	constructor(message: string, status: number, payload: unknown) {
		super(message);
		this.name = "ApiFunctionError";
		this.status = status;
		this.payload = payload;
	}
}

async function parseJsonSafe(response: RestResponse): Promise<unknown> {
	try {
		return response.json();
	} catch {
		return null;
	}
}

async function assertSuccess(response: RestResponse, fallbackMessage: string) {
	if (response.status >= 200 && response.status < 300) {
		return;
	}

	const payload = await parseJsonSafe(response);
	const message =
		typeof payload === "object" &&
		payload !== null &&
		"message" in payload &&
		typeof (payload as { message?: unknown }).message === "string"
			? ((payload as { message: string }).message || fallbackMessage)
			: fallbackMessage;

	throw new ApiFunctionError(message, response.status, payload);
}

export function createApiFunctions(fetchRest: RestFetcher) {
	const chatService = createChatService(fetchRest);

	return {
		...chatService,

		async request(
			path: string,
			options?: {
				method?: string;
				body?: unknown;
				rawBody?: Uint8Array;
				contentType?: string;
				abortController?: AbortController;
			},
		) {
			return fetchRest(path, options);
		},

		async getOwnAlbums(): Promise<Album[]> {
			const response = await fetchRest("/v1/albums");
			await assertSuccess(response, "Failed to load own albums");
			const parsed = albumsResponseSchema.parse(await parseJsonSafe(response));
			return parsed.albums;
		},

		async getOwnAlbumDetails(albumId: string | number): Promise<AlbumDetail> {
			const response = await fetchRest(`/v2/albums/${albumId}`);
			await assertSuccess(response, "Failed to load own album details");
			return albumDetailSchema.parse(await parseJsonSafe(response));
		},

		async getOwnAlbumStorage(): Promise<AlbumLimits> {
			const response = await fetchRest("/v1/albums/storage");
			await assertSuccess(response, "Failed to load own album storage");
			return albumLimitsSchema.parse(await parseJsonSafe(response));
		},

		async createOwnAlbum(input: CreateOwnAlbumInput): Promise<{ albumId: number }> {
			const response = await fetchRest("/v2/albums", {
				method: "POST",
				body: { albumName: input.albumName },
			});
			await assertSuccess(response, "Failed to create own album");
			const payload = await parseJsonSafe(response);
			const albumId =
				typeof payload === "object" &&
				payload !== null &&
				"albumId" in payload &&
				typeof (payload as { albumId?: unknown }).albumId === "number"
					? (payload as { albumId: number }).albumId
					: Number((payload as { albumId?: unknown } | null)?.albumId);

			if (!Number.isFinite(albumId)) {
				throw new ApiFunctionError("Invalid album response", response.status, payload);
			}

			return { albumId };
		},

		async renameOwnAlbum(input: RenameOwnAlbumInput): Promise<{ ok: true }> {
			const response = await fetchRest(`/v2/albums/${input.albumId}`, {
				method: "PUT",
				body: { albumName: input.albumName },
			});
			await assertSuccess(response, "Failed to rename own album");
			return { ok: true };
		},

		async deleteOwnAlbum(input: DeleteOwnAlbumInput): Promise<{ ok: true }> {
			const response = await fetchRest(`/v1/albums/${input.albumId}`, {
				method: "DELETE",
			});
			await assertSuccess(response, "Failed to delete own album");
			return { ok: true };
		},

		async uploadOwnAlbumContent(
			input: UploadOwnAlbumContentInput,
		): Promise<{ contentId: number }> {
			const response = await fetchRest(`/v1/albums/${input.albumId}/content`, {
				method: "POST",
				rawBody: input.multipart.body,
				contentType: input.multipart.contentType,
			});
			await assertSuccess(response, "Failed to upload own album content");
			const payload = await parseJsonSafe(response);
			const contentId =
				typeof payload === "object" &&
				payload !== null &&
				"contentId" in payload &&
				typeof (payload as { contentId?: unknown }).contentId === "number"
					? (payload as { contentId: number }).contentId
					: Number((payload as { contentId?: unknown } | null)?.contentId);

			if (!Number.isFinite(contentId)) {
				throw new ApiFunctionError(
					"Invalid upload content response",
					response.status,
					payload,
				);
			}

			return { contentId };
		},

		async reorderOwnAlbumContent(
			input: ReorderOwnAlbumContentInput,
		): Promise<{ ok: true }> {
			const response = await fetchRest(
				`/v1/albums/${input.albumId}/content/order`,
				{
					method: "POST",
					body: { contentIds: input.contentIds },
				},
			);
			await assertSuccess(response, "Failed to reorder own album content");
			return { ok: true };
		},

		async deleteOwnAlbumContent(
			input: DeleteOwnAlbumContentInput,
		): Promise<{ ok: true }> {
			const response = await fetchRest(
				`/v1/albums/${input.albumId}/content/${input.contentId}`,
				{
					method: "DELETE",
				},
			);
			await assertSuccess(response, "Failed to delete own album content");
			return { ok: true };
		},

		async getSharedAlbums(
			input: GetSharedAlbumsInput,
		): Promise<SharedAlbumView> {
			const response = await fetchRest("/v3/pressie-albums/feed", {
				method: "POST",
				body: input,
			});
			await assertSuccess(response, "Failed to load shared albums");
			return sharedAlbumViewSchema.parse(await parseJsonSafe(response));
		},

		async getSharedAlbumsForProfile(
			input: GetSharedAlbumsForProfileInput,
		): Promise<SharedAlbum[]> {
			const response = await fetchRest(`/v2/albums/shares/${input.profileId}`);
			if (response.status === 404) {
				return [];
			}
			await assertSuccess(response, "Failed to load shared albums for profile");
			const payload = sharedAlbumsResponseSchema.parse(
				await parseJsonSafe(response),
			);
			return payload.albums;
		},

		async openSharedAlbum(
			input: OpenSharedAlbumInput,
		): Promise<OpenSharedAlbumResult> {
			const response = await fetchRest(`/v3/albums/${input.albumId}/view`);
			if (
				response.status !== 403 &&
				(response.status < 200 || response.status >= 300)
			) {
				await assertSuccess(response, "Failed to open shared album");
			}
			return { status: response.status };
		},

		async getManagedGenders(): Promise<ManagedGender[]> {
			const response = await fetchRest("/public/v2/genders");
			await assertSuccess(response, "Failed to load genders");
			const payload = await parseJsonSafe(response);
			if (!Array.isArray(payload)) {
				throw new ApiFunctionError("Invalid genders response", response.status, payload);
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
			await assertSuccess(response, "Failed to load pronouns");
			const payload = await parseJsonSafe(response);
			if (!Array.isArray(payload)) {
				throw new ApiFunctionError("Invalid pronouns response", response.status, payload);
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
			await assertSuccess(response, "Failed to load profile media");
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
			await assertSuccess(response, "Failed to load browse profiles");
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
			await assertSuccess(response, "Failed to load profile details");
			const parsed = profileDetailResponseSchema.parse(
				await parseJsonSafe(response),
			);
			return parsed.profiles[0];
		},

		async getRawProfile(profileId: number | string): Promise<unknown> {
			const response = await fetchRest(`/v7/profiles/${profileId}`);
			await assertSuccess(response, "Failed to load profile");
			return parseJsonSafe(response);
		},

		async updateMyProfile(payload: unknown): Promise<{ ok: true }> {
			const response = await fetchRest("/v4/me/profile", {
				method: "PATCH",
				body: payload,
			});
			await assertSuccess(response, "Failed to save profile");
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
			await assertSuccess(response, "Failed to update profile photos");
			return { ok: true };
		},

		async deleteMyProfileImages(mediaHashes: string[]): Promise<{ ok: true }> {
			const response = await fetchRest("/v3/me/profile/images", {
				method: "DELETE",
				body: { media_hashes: mediaHashes },
			});
			await assertSuccess(response, "Failed to delete profile photos");
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
			await assertSuccess(response, "Failed to upload profile image");
			const payload = await parseJsonSafe(response);
			if (typeof payload !== "object" || payload === null) {
				throw new ApiFunctionError(
					"Invalid profile upload response",
					response.status,
					payload,
				);
			}
			return payload as ProfileImageUploadResult;
		},

		async getAgeVerificationOptions(): Promise<AgeVerificationOptions> {
			const response = await fetchRest("/v1/age-verification/options");
			await assertSuccess(response, "Failed to fetch age verification options");
			return response.json() as AgeVerificationOptions;
		},

		async createAgeVerificationSession(): Promise<AgeVerificationSession> {
			const response = await fetchRest("/v1/age-verification/session", {
				method: "POST",
			});
			await assertSuccess(response, "Failed to create age verification session");
			return response.json() as AgeVerificationSession;
		},

		async verifyAgeLiveness3d(
			data: Liveness3dRequest,
		): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/liveness3d", {
				method: "POST",
				body: data,
			});
			await assertSuccess(response, "Liveness3d verification failed");
			return response.json() as AgeVerificationFaceTecResponse;
		},

		async verifyAgeEnrollment(): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/enrollment", {
				method: "POST",
			});
			await assertSuccess(response, "Enrollment verification failed");
			return response.json() as AgeVerificationFaceTecResponse;
		},

		async verifyAgeDocument(
			photoIdMatchData: Record<string, unknown>,
		): Promise<AgeVerificationFaceTecResponse> {
			const response = await fetchRest("/v1/age-verification/verify/document", {
				method: "POST",
				body: photoIdMatchData,
			});
			await assertSuccess(response, "Document verification failed");
			return response.json() as AgeVerificationFaceTecResponse;
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
			await assertSuccess(response, "Failed to load Right Now feed");
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
