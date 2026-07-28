/**
 * conversationMerge.ts — fold an archived conversation (typically left over
 * from a profile the user no longer uses) into a still-active one, so old
 * and new history read as a single continuous thread instead of two
 * disjoint chats. See chatDb.mergeConversationInto for the actual row
 * migration; this is the validation + event-dispatch wrapper around it,
 * mirroring conversationArchive.ts's CHAT_ARCHIVE_STATE_EVENT pattern so any
 * mounted chat UI can react without a bespoke update at every call site.
 */

import * as chatDb from "./chatDb";
import { appLog } from "../utils/logger";

export const CHAT_MERGE_EVENT = "fg:chat-merge";

export type ChatMergeDetail = {
	sourceConversationId: string;
	targetConversationId: string;
	movedMessages: number;
};

function dispatchMerge(detail: ChatMergeDetail) {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent<ChatMergeDetail>(CHAT_MERGE_EVENT, { detail }));
}

/**
 * Only archived → active is allowed: an active conversation always has a
 * server-side counterpart that keeps producing its own messages
 * independently, so merging one live conversation into another would start
 * diverging again immediately from whichever side the server still updates.
 */
export async function mergeArchivedConversationIntoActive(
	sourceConversationId: string,
	targetConversationId: string,
): Promise<ChatMergeDetail> {
	if (sourceConversationId === targetConversationId) {
		throw new Error("Cannot merge a conversation into itself");
	}

	const [source, target] = await Promise.all([
		chatDb.getConversation(sourceConversationId),
		chatDb.getConversation(targetConversationId),
	]);

	if (!source) {
		throw new Error("Source conversation not found");
	}
	if (!source.archived) {
		throw new Error("Only archived conversations can be merged");
	}
	if (!target) {
		throw new Error("Target conversation not found");
	}
	if (target.archived) {
		throw new Error("Cannot merge into an archived conversation");
	}

	const { movedMessages } = await chatDb.mergeConversationInto(
		sourceConversationId,
		targetConversationId,
	);

	appLog.info(
		`[conversation-merge] moved ${movedMessages} message(s) from ${sourceConversationId} into ${targetConversationId}`,
	);

	const detail: ChatMergeDetail = { sourceConversationId, targetConversationId, movedMessages };
	dispatchMerge(detail);
	return detail;
}
