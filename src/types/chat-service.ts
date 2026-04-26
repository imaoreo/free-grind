export interface RestResponse {
	status: number;
	json: () => unknown;
	text: () => string;
	bytes: () => Uint8Array;
}

export interface RestFetchOptions {
	method?: string;
	body?: unknown;
	rawBody?: Uint8Array;
	contentType?: string;
	abortController?: AbortController;
}

export type RestFetcher = (
	path: string,
	options?: RestFetchOptions,
) => Promise<RestResponse>;

export interface MultipartUpload {
	body: Uint8Array;
	contentType: string;
}

export interface SearchProfilesParams {
	nearbyGeoHash: string;
	searchAfterDistance?: string;
	searchAfterProfileId?: string;
	online?: boolean;
	hasAlbum?: boolean;
}

export interface SearchProfileMedia {
	mediaHash?: string;
	type?: number;
	state?: number;
}

export interface SearchProfileResult {
	profileId: number;
	displayName: string;
	age: number | null;
	distance: number | null;
	profileImageMediaHash: string | null;
	medias: SearchProfileMedia[] | null;
	profileTags: string[];
	hasAlbum: boolean;
	showDistance: boolean;
	showAge: boolean;
	approximateDistance: boolean;
	boosting: boolean;
	isFavorite: boolean;
	new: boolean;
	lastChatTimestamp: number | null;
	lastUpdatedTime: number | null;
	lastViewed: number | null;
	seen: number | null;
	hasFaceRecognition: boolean;
	gender: number[];
}

export interface SearchProfilesResponse {
	profiles: SearchProfileResult[];
	lastDistanceInKm: number | null;
	lastProfileId: number | null;
}

export interface SharedConversationImage {
	mediaId: number;
	url: string | null;
	expiresAt: number | null;
}

export interface UploadChatMediaParams {
	multipart: MultipartUpload;
	options: { looping: boolean; takenOnGrindr: boolean };
}

export interface UploadChatMediaResponse {
	mediaId: number;
	mediaHash: string | null;
	url: string | null;
}

export interface UploadAlbumContentParams {
	albumId: number | string;
	multipart: MultipartUpload;
}

export interface UploadAlbumContentResponse {
	contentId: number;
}

export interface SharedAlbumProfile {
	profileId: number;
	expirationType: string | number;
}

export interface CreateAlbumResponse {
	albumId: number;
}

export interface AlbumContentItem {
	contentId: number;
	contentType: string | null;
	thumbUrl: string | null;
	url: string | null;
	coverUrl: string | null;
	processing: boolean;
}

export interface AlbumDetailsResponse {
	albumId: number;
	albumName: string | null;
	content: AlbumContentItem[];
}
