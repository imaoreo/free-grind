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
} from "../../types/albums";
import type {
	CreateOwnAlbumInput,
	DeleteOwnAlbumContentInput,
	DeleteOwnAlbumInput,
	GetSharedAlbumsForProfileInput,
	OpenSharedAlbumInput,
	OpenSharedAlbumResult,
	ReorderOwnAlbumContentInput,
	RenameOwnAlbumInput,
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
			const response = await fetchRest(`/v1/albums/${input.albumId}/content`, {
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
				await assertSuccess(response, t("api.errors.open_shared_album"));
			}
			return { status: response.status };
		},
	};
}
