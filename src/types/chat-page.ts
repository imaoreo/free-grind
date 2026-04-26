import type { Message } from "./messages";
import type { SearchProfileResult } from "./chat-service";

export type UiMessage = Message & {
	clientState?: "pending" | "failed";
	_localOnly?: boolean;
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

export type SearchMode = "conversations" | "messages" | "profiles";

export type InboxFilterKey =
	| "unreadOnly"
	| "favoritesOnly"
	| "chemistryOnly"
	| "rightNowOnly"
	| "onlineNowOnly";

export type ProfileSearchResult = SearchProfileResult;
