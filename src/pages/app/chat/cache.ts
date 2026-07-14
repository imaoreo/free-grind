import type { ConversationEntry, Message } from "../../../types/messages";
import type {
	IndexedConversation,
	IndexedMessage,
	ScoredResult,
} from "../../../types/chat-cache";
import { getMessageText } from "../../../utils/messageText";
import { isLocalClientMessageId } from "./chatUtils";

const conversationIndex = new Map<string, IndexedConversation>();
const messageIndex = new Map<string, IndexedMessage>();

function normalize(input: string): string {
	return input.trim().toLowerCase();
}

function scoreMatch(haystack: string, needle: string): number {
	const startsWith = haystack.startsWith(needle) ? 60 : 0;
	const index = haystack.indexOf(needle);
	if (index < 0) {
		return -1;
	}
	const proximity = Math.max(0, 40 - index);
	return startsWith + proximity;
}

export function indexConversations(entries: ConversationEntry[]) {
	for (const entry of entries) {
		const conversationId = entry.data.conversationId;
		const name = entry.data.name ?? "Someone";
		const preview = entry.data.preview?.text ?? "";
		const searchText = normalize(`${name} ${preview}`);

		conversationIndex.set(conversationId, {
			conversationId,
			name,
			preview,
			searchText,
		});
	}
}

export function indexMessages(messages: Message[]) {
	for (const message of messages) {
		// Optimistic client-side ids (local:/local-upload:) are superseded by a
		// server-confirmed message under a different id once sending completes,
		// but that swap only happens in threadMessages state — this index is a
		// module-level Map that's never pruned, so indexing the local id would
		// leave a stale duplicate entry search results keep matching forever.
		if (isLocalClientMessageId(message.messageId)) {
			continue;
		}

		const text = getMessageText(message);
		if (!text) {
			continue;
		}

		messageIndex.set(message.messageId, {
			messageId: message.messageId,
			conversationId: message.conversationId,
			senderId: message.senderId,
			timestamp: message.timestamp,
			text,
			searchText: normalize(text),
		});
	}
}

export function searchConversationsLocal(query: string, limit = 24) {
	const needle = normalize(query);
	if (!needle) {
		return [];
	}

	const scored: ScoredResult<IndexedConversation>[] = [];
	for (const item of conversationIndex.values()) {
		const score = scoreMatch(item.searchText, needle);
		if (score >= 0) {
			scored.push({ score, item });
		}
	}

	return scored
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
		.map((entry) => entry.item);
}

export function searchMessagesLocal(
	query: string,
	options?: {
		conversationId?: string;
		limit?: number;
	},
) {
	const needle = normalize(query);
	if (!needle) {
		return [];
	}

	const limit = options?.limit ?? 40;
	const scored: ScoredResult<IndexedMessage>[] = [];
	for (const item of messageIndex.values()) {
		if (
			options?.conversationId &&
			item.conversationId !== options.conversationId
		) {
			continue;
		}

		const score = scoreMatch(item.searchText, needle);
		if (score >= 0) {
			scored.push({ score, item });
		}
	}

	return scored
		.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			return b.item.timestamp - a.item.timestamp;
		})
		.slice(0, limit)
		.map((entry) => entry.item);
}
