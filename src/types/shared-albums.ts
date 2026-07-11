import type { SharedAlbum } from "./albums";

export type SharedAlbumItem = {
	profileId: number;
	profileName: string;
	profileMediaHash: string | null;
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
 * Folder key for saved media: prefers conversationId, but that's only
 * resolved by matching against the locally-cached conversation list (see
 * SharedAlbumsPage.tsx/SharedAlbumsPanel.tsx), which can miss older/archived
 * chats — falling back to profileId (always known) keeps saves out of a
 * flat, unsplit folder in that case.
 */
export function albumViewerFolderKey(viewer: AlbumViewer): string {
	return viewer.conversationId ?? `profile-${viewer.profileId}`;
}
