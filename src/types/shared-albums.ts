import type { SharedAlbum } from "./albums";

export type SharedAlbumItem = {
	profileId: number;
	profileName: string;
	conversationId: string | null;
	album: SharedAlbum;
};

export type AlbumViewer = {
	albumId: number;
	albumName: string | null;
	content: Array<{
		contentId: number;
		contentType: string | null;
		thumbUrl: string | null;
		url: string | null;
		coverUrl: string | null;
		processing: boolean;
	}>;
};
