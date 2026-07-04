import type { Message } from "./messages";

export type UiMessage = Message & {
	clientState?: "pending" | "failed";
	_localOnly?: boolean;
	/** Content kept locally despite the server wiping it via unsend. */
	localHistory?: boolean;
};

export type AlbumListItem = {
	albumId: number;
	albumName: string | null;
	isShareable: boolean;
};

export type AlbumContentItem = {
	contentId: number;
	contentType: string | null;
	thumbUrl: string | null;
	url: string | null;
	coverUrl: string | null;
	processing: boolean;
};

export type AlbumViewerState = {
	albumId: number;
	albumName: string | null;
	content: AlbumContentItem[];
};

export type InboxFilterKey =
	| "unreadOnly"
	| "favoritesOnly"
	| "chemistryOnly"
	| "rightNowOnly"
	| "onlineNowOnly";
