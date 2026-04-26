import {
	albumDetailSchema,
	albumLimitsSchema,
	albumsResponseSchema,
	sharedAlbumsResponseSchema,
	type Album,
	type AlbumDetail,
	type AlbumLimits,
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
	return {
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
		}): Promise<{ cards: BrowseCard[]; nextPage: number | null }> {
			const url = params.page
				? `/v4/cascade?nearbyGeoHash=${encodeURIComponent(params.geohash)}&pageNumber=${params.page}`
				: `/v4/cascade?nearbyGeoHash=${encodeURIComponent(params.geohash)}`;
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
	};
}
