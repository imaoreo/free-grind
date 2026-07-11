import {
	albumDetailSchema,
	albumLimitsSchema,
	albumPosterSchema,
	albumSharesResponseSchema,
	albumsResponseSchema,
	profileAlbumShareStatusSchema,
	sharedAlbumViewSchema,
	sharedAlbumsResponseSchema,
	type Album,
	type AlbumDetail,
	type AlbumLimits,
	type AlbumPoster,
	type ProfileAlbumShareStatus,
	type SharedAlbumView,
	type SharedAlbum,
} from "../../types/albums";
import type {
	AddOwnAlbumContentByIdsInput,
	CheckProfileAlbumShareInput,
	CreateOwnAlbumInput,
	DeleteOwnAlbumContentInput,
	DeleteOwnAlbumInput,
	GetAlbumContentProcessingInput,
	GetAlbumPosterInput,
	GetAlbumSharesInput,
	GetSharedAlbumsForProfileInput,
	OpenSharedAlbumInput,
	OpenSharedAlbumResult,
	RemoveAlbumShareInput,
	RemoveAlbumShareResult,
	ReorderOwnAlbumContentInput,
	RenameOwnAlbumInput,
	UnshareAlbumInput,
	UploadOwnAlbumContentInput,
	GetSharedAlbumsInput,
} from "../../types/api-functions";
import type { RestFetcher } from "../../types/chat-service";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";

export function createAlbumMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async getOwnAlbums(): Promise<Album[]> {
			const response = await fetchRest("/v1/albums");
			await assertSuccess(response, t("api.errors.load_albums"));
			const parsed = albumsResponseSchema.parse(await parseJsonSafe(response));
			return parsed.albums;
		},

		async getOwnAlbumDetails(albumId: string | number): Promise<AlbumDetail> {
			const response = await fetchRest(`/v2/albums/${albumId}`);
			await assertSuccess(response, t("api.errors.load_album_details"));
			return albumDetailSchema.parse(await parseJsonSafe(response));
		},

		async getOwnAlbumStorage(): Promise<AlbumLimits> {
			const response = await fetchRest("/v1/albums/storage");
			await assertSuccess(response, t("api.errors.load_album_storage"));
			return albumLimitsSchema.parse(await parseJsonSafe(response));
		},

		async createOwnAlbum(input: CreateOwnAlbumInput): Promise<{ albumId: number }> {
			const response = await fetchRest("/v2/albums", {
				method: "POST",
				body: { albumName: input.albumName },
			});
			await assertSuccess(response, t("api.errors.create_album"));
			const payload = await parseJsonSafe(response);
			const albumId =
				typeof payload === "object" &&
				payload !== null &&
				"albumId" in payload &&
				typeof (payload as { albumId?: unknown }).albumId === "number"
					? (payload as { albumId: number }).albumId
					: Number((payload as { albumId?: unknown } | null)?.albumId);

			if (!Number.isFinite(albumId)) {
				throw new ApiFunctionError(t("api.errors.invalid_album_response"), response.status, payload);
			}

			return { albumId };
		},

		async renameOwnAlbum(input: RenameOwnAlbumInput): Promise<{ ok: true }> {
			const response = await fetchRest(`/v2/albums/${input.albumId}`, {
				method: "PUT",
				body: { albumName: input.albumName },
			});
			await assertSuccess(response, t("api.errors.rename_album"));
			return { ok: true };
		},

		async deleteOwnAlbum(input: DeleteOwnAlbumInput): Promise<{ ok: true }> {
			const response = await fetchRest(`/v1/albums/${input.albumId}`, {
				method: "DELETE",
			});
			await assertSuccess(response, t("api.errors.delete_album"));
			return { ok: true };
		},

		async uploadOwnAlbumContent(
			input: UploadOwnAlbumContentInput,
		): Promise<{ contentId: number }> {
			const query = new URLSearchParams();
			if (input.width != null) query.set("width", String(input.width));
			if (input.height != null) query.set("height", String(input.height));
			const qs = query.toString();
			const url = `/v1/albums/${input.albumId}/content${qs ? `?${qs}` : ""}`;
			const response = await fetchRest(url, {
				method: "POST",
				rawBody: input.multipart.body,
				contentType: input.multipart.contentType,
			});
			await assertSuccess(response, t("api.errors.upload_content"));
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
					t("api.errors.invalid_upload_response"),
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
			await assertSuccess(response, t("api.errors.reorder_content"));
			return { ok: true };
		},

		async addOwnAlbumContentByIds(
			input: AddOwnAlbumContentByIdsInput,
		): Promise<{ ok: true }> {
			const response = await fetchRest(
				`/v1/albums/${input.albumId}/content/chat/list-by-id?isFresh=true`,
				{
					method: "POST",
					body: { ids: input.ids },
				},
			);
			await assertSuccess(
				response,
				t("api.errors.add_album_content_by_ids", {
					defaultValue: "Failed to add media to album.",
				}),
			);
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
			await assertSuccess(response, t("api.errors.delete_content"));
			return { ok: true };
		},

		async getAlbumPoster(input: GetAlbumPosterInput): Promise<AlbumPoster> {
			const response = await fetchRest(
				`/v1/albums/${input.albumId}/content/${input.contentId}/poster`,
			);
			await assertSuccess(response, t("api.errors.load_album_poster", { defaultValue: "Failed to load album poster." }));
			return albumPosterSchema.parse(await parseJsonSafe(response));
		},

		async getSharedAlbums(
			input: GetSharedAlbumsInput,
		): Promise<SharedAlbumView> {
			const response = await fetchRest("/v3/pressie-albums/feed", {
				method: "POST",
				body: input,
			});
			await assertSuccess(response, t("api.errors.load_shared_albums"));
			return sharedAlbumViewSchema.parse(await parseJsonSafe(response));
		},

		async getSharedAlbumsForProfile(
			input: GetSharedAlbumsForProfileInput,
		): Promise<SharedAlbum[]> {
			const response = await fetchRest(`/v2/albums/shares/${input.profileId}`);
			if (response.status === 404) {
				return [];
			}
			await assertSuccess(response, t("api.errors.load_shared_albums_profile"));
			const payload = sharedAlbumsResponseSchema.parse(await parseJsonSafe(response));
			return payload.albums;
		},

		async checkProfileAlbumShare(
			input: CheckProfileAlbumShareInput,
		): Promise<ProfileAlbumShareStatus> {
			const response = await fetchRest("/v2/albums/shares", {
				method: "POST",
				body: { profileId: String(input.profileId) },
			});
			await assertSuccess(
				response,
				t("api.errors.check_profile_album_share", {
					defaultValue: "Failed to check album status.",
				}),
			);
			return profileAlbumShareStatusSchema.parse(await parseJsonSafe(response));
		},

		async openSharedAlbum(
			input: OpenSharedAlbumInput,
		): Promise<OpenSharedAlbumResult> {
			const response = await fetchRest(`/v3/albums/${input.albumId}/view`);
			if (
				response.status !== 403 &&
				(response.status < 200 || response.status >= 300)
			) {
				await assertSuccess(response, t("api.errors.open_shared_album"));
			}
			return { status: response.status };
		},

		// Recipient-initiated removal of *our own* share of someone else's
		// album — used by the "delete" action on the shared-albums page.
		// 403 is tolerated the same way openSharedAlbum does: it's the observed
		// response for a share that's already gone, not a real failure, and the
		// caller cleans up the local cache regardless of which status comes back.
		async removeAlbumShare(input: RemoveAlbumShareInput): Promise<RemoveAlbumShareResult> {
			const response = await fetchRest(`/v1/albums/${input.albumId}/shares/remove`, {
				method: "POST",
			});
			if (
				response.status !== 403 &&
				(response.status < 200 || response.status >= 300)
			) {
				await assertSuccess(response, t("api.errors.remove_album_share"));
			}
			return { status: response.status };
		},

		async getAlbumShares(input: GetAlbumSharesInput): Promise<number[]> {
			const response = await fetchRest(`/v1/albums/${input.albumId}/shares`);
			await assertSuccess(response, t("api.errors.load_album_shares"));
			const payload = albumSharesResponseSchema.parse(await parseJsonSafe(response));
			return payload.profileIds;
		},

		async unshareAlbum(input: UnshareAlbumInput): Promise<{ ok: true }> {
			const response = await fetchRest(`/v1/albums/${input.albumId}/unshares`, {
				method: "PUT",
				body: { profiles: input.profiles },
			});
			await assertSuccess(response, t("api.errors.unshare_album"));
			return { ok: true };
		},

		async getAlbumContentProcessing(input: GetAlbumContentProcessingInput): Promise<boolean> {
			const response = await fetchRest(`/v1/albums/${input.albumId}/content/${input.contentId}/processing`);
			await assertSuccess(response, t("api.errors.load_album_processing"));
			const payload = await parseJsonSafe(response);
			return typeof payload === "object" && payload !== null && "processing" in payload
				? Boolean((payload as { processing: unknown }).processing)
				: false;
		},
	};
}
