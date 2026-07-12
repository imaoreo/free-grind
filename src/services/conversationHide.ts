/**
 * conversationHide.ts — manually hide/unhide a conversation from the inbox.
 *
 * Unlike conversationArchive.ts's `archived` flag (the server no longer
 * produces this conversation at all), a hidden conversation is a purely
 * client-side preference: it still comes back through /v4/inbox like any
 * other chat, so hiding never removes it from `conversations` state — it
 * only gates the client-side filteredConversations view via a locally
 * persisted flag in chatDb.
 */

import * as chatDb from "./chatDb";
import { appLog } from "../utils/logger";

// A conversation's hidden flag changed — dispatched so any mounted chat UI
// (which keeps its own in-memory hidden-conversation-ids set) can stay in
// sync without needing a bespoke update at every call site.
export const CHAT_HIDE_STATE_EVENT = "fg:chat-hide-state";

export type ChatHideStateChangeDetail = { conversationId: string; hidden: boolean };

function dispatchHideStateChange(detail: ChatHideStateChangeDetail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent<ChatHideStateChangeDetail>(CHAT_HIDE_STATE_EVENT, { detail }));
}

export async function hideConversation(conversationId: string): Promise<void> {
	try {
		await chatDb.setConversationHidden(conversationId, true);
		dispatchHideStateChange({ conversationId, hidden: true });
	} catch (error) {
		appLog.error(`[conversation-hide] failed to hide ${conversationId}`, error);
	}
}

export async function unhideConversation(conversationId: string): Promise<void> {
	try {
		await chatDb.setConversationHidden(conversationId, false);
		dispatchHideStateChange({ conversationId, hidden: false });
	} catch (error) {
		appLog.error(`[conversation-hide] failed to unhide ${conversationId}`, error);
	}
}

/**
 * Auto-unhide on new activity: a hidden chat shouldn't stay buried once the
 * other person actually sends something, so a hidden conversation is
 * unhidden as soon as a new message arrives in it. No-ops (and doesn't
 * dispatch) if the conversation wasn't hidden to begin with.
 */
export async function unhideConversationOnNewMessage(conversationId: string): Promise<void> {
	try {
		const didUnhide = await chatDb.unhideConversationIfHidden(conversationId);
		if (didUnhide) {
			dispatchHideStateChange({ conversationId, hidden: false });
		}
	} catch (error) {
		appLog.error(`[conversation-hide] failed to auto-unhide ${conversationId}`, error);
	}
}
