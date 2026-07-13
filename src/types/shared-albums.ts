import type { SharedAlbum } from "./albums";

export type SharedAlbumItem = {
	profileId: number;
	profileName: string;
	profileMediaHash: string | null;
	onlineUntil: number | null;
	distanceMetres: number | null;
	conversationId: string | null;
	album: SharedAlbum;
	albumNumber: number;
	totalAlbumsShared?: number;
	localOnly?: boolean;
};

export type AlbumViewer = {
	albumId: number;
	albumName: string | null;
	profileId: number;
	profileName: string;
	profileMediaHash: string | null;
	onlineUntil: number | null;
	distanceMetres: number | null;
	conversationId: string | null;
	content: Array<{
		contentId: number;
		contentType: string | null;
		thumbUrl: string | null;
		url: string | null;
		coverUrl: string | null;
		processing: boolean;
	}>;
};

/**
 * Folder key for saved media — the album owner's profile id, always known
 * directly on the viewer (unlike conversationId, which is only resolved by
 * matching against the locally-cached conversation list in
 * SharedAlbumsPage.tsx/SharedAlbumsPanel.tsx and can miss older/archived
 * chats). Using the bare profile id here also keeps it identical to the
 * folder saveMedia.ts resolves a chat conversationId down to, so the same
 * person's saves always land in the same folder regardless of entry point.
 */
export function albumViewerFolderKey(viewer: AlbumViewer): string {
	return String(viewer.profileId);
}
