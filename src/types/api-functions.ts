import type {
	Album,
	AlbumDetail,
	AlbumLimits,
	SharedAlbum,
	SharedAlbumView,
} from "./albums";
import type { MultipartUpload } from "./chat-service";

export type ApiFunctionName =
	| "getOwnAlbums"
	| "getOwnAlbumDetails"
	| "getOwnAlbumStorage"
	| "createOwnAlbum"
	| "renameOwnAlbum"
	| "deleteOwnAlbum"
	| "uploadOwnAlbumContent"
	| "reorderOwnAlbumContent"
	| "deleteOwnAlbumContent"
	| "getSharedAlbums"
	| "getSharedAlbumsForProfile"
	| "openSharedAlbum";

export interface CreateOwnAlbumInput {
	albumName: string;
}

export interface RenameOwnAlbumInput {
	albumId: string;
	albumName: string;
}

export interface DeleteOwnAlbumInput {
	albumId: string;
}

export interface UploadOwnAlbumContentInput {
	albumId: string;
	multipart: MultipartUpload;
}

export interface ReorderOwnAlbumContentInput {
	albumId: string;
	contentIds: number[];
}

export interface DeleteOwnAlbumContentInput {
	albumId: string;
	contentId: string;
}

export interface GetSharedAlbumsForProfileInput {
	profileId: number;
}

export interface OpenSharedAlbumInput {
	albumId: number;
}

export interface ApiFunctionVoidResult {
	ok: true;
}

export interface OpenSharedAlbumResult {
	status: number;
}

export interface ApiFunctionResultMap {
	getOwnAlbums: Album[];
	getOwnAlbumDetails: AlbumDetail;
	getOwnAlbumStorage: AlbumLimits;
	createOwnAlbum: { albumId: number };
	renameOwnAlbum: ApiFunctionVoidResult;
	deleteOwnAlbum: ApiFunctionVoidResult;
	uploadOwnAlbumContent: { contentId: number };
	reorderOwnAlbumContent: ApiFunctionVoidResult;
	deleteOwnAlbumContent: ApiFunctionVoidResult;
	getSharedAlbums: SharedAlbumView;
	getSharedAlbumsForProfile: SharedAlbum[];
	openSharedAlbum: OpenSharedAlbumResult;
}

export type ApiFunctionResult<T extends ApiFunctionName> = ApiFunctionResultMap[T];

export interface ApiFunctionDefinition {
	name: ApiFunctionName;
	label: string;
	description: string;
}

export interface ManagedGender {
	genderId: number;
	gender: string;
}

export interface ManagedPronoun {
	pronounId: number;
	pronoun: string;
}

export interface ProfileImageUploadResult {
	hash?: string;
	mediaHash?: string;
	imageSizes?: Array<{ mediaHash?: string }>;
}

export interface GetSharedAlbumsInput {
    isFavorite?: boolean;
    isOnline?: boolean;
    onlyVideo?: boolean;
    blur?: boolean;
}
