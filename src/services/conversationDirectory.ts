/**
 * conversationDirectory.ts — process-wide cache of the latest inbox so the
 * global ChatRealtimeBridge can resolve sender display names for toasts
 * without re-fetching the inbox itself.
 *
 * ChatPage publishes every inbox refresh; the bridge reads on demand.
 */

import type { ConversationEntry } from "../types/messages";

let directory = new Map<string, ConversationEntry>();

export function setConversationDirectory(entries: ConversationEntry[]): void {
	const next = new Map<string, ConversationEntry>();
	for (const entry of entries) {
		next.set(entry.data.conversationId, entry);
	}
	directory = next;
}

export function getConversation(
	conversationId: string,
): ConversationEntry | null {
	return directory.get(conversationId) ?? null;
}

export function getDisplayName(
	conversationId: string,
	currentUserId: number | null,
): string | null {
	const conv = directory.get(conversationId);
	if (!conv) return null;
	const name = conv.data.name?.trim();
	if (name) return name;
	const other =
		conv.data.participants.find((p) => p.profileId !== currentUserId) ??
		conv.data.participants[0] ??
		null;
	return other?.profileId != null ? String(other.profileId) : null;
}

export function getOtherParticipantImageHash(
	conversationId: string,
	currentUserId: number | null,
): string | null {
	const conv = directory.get(conversationId);
	if (!conv) return null;
	const other =
		conv.data.participants.find((p) => p.profileId !== currentUserId) ??
		conv.data.participants[0] ??
		null;
	return other?.primaryMediaHash ?? null;
}
