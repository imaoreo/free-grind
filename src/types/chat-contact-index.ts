export type ChatContactIndexRecord = {
	profileId: string;
	conversationId: string | null;
	lastMessageTimestamp: number | null;
	unreadCount: number;
	hasChatted: boolean;
	updatedAt: number;
};

export type InboxContactIndexInput = {
	profileId: string;
	conversationId: string | null;
	lastMessageTimestamp: number | null;
	unreadCount: number;
};

export type GridContactIndexInput = {
	profileId: string;
	unreadCount: number;
};
