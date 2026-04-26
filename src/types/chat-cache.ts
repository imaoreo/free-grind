export type IndexedConversation = {
	conversationId: string;
	name: string;
	preview: string;
	searchText: string;
};

export type IndexedMessage = {
	messageId: string;
	conversationId: string;
	senderId: number;
	timestamp: number;
	text: string;
	searchText: string;
};

export type ScoredResult<T> = {
	score: number;
	item: T;
};
