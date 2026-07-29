// Persists the chat inbox's filter state (the same InboxFilters query filters
// plus the Pinned/Archived/Hidden visibility filters) per-profile, exactly
// like GridPage's browse-filters-storage.ts persists browseFilters — both
// ride on chatDb's settings table, which lives in the per-account chatDb file
// swapped in by setActiveChatDbUser, so this is naturally per-profile with no
// extra bookkeeping.
import { getSetting, setSetting } from "../../../services/chatDb";
import type { InboxVisibilityFilter } from "../../../types/chat-page";
import { buildChatFiltersDraft, isNumberArray, type ChatFiltersDraft } from "./chatUtils";

const STORAGE_KEY = "chatInboxFilters";

function isVisibilityFilter(value: unknown): value is InboxVisibilityFilter {
	return value === "all" || value === "hide" || value === "only";
}

export function normalizeChatFiltersDraft(
	input: Partial<ChatFiltersDraft> | null | undefined,
): ChatFiltersDraft {
	const defaults = buildChatFiltersDraft({});
	const draft = input ?? {};

	return {
		unreadOnly: draft.unreadOnly === true,
		chemistryOnly: draft.chemistryOnly === true,
		favoritesOnly: draft.favoritesOnly === true,
		rightNowOnly: draft.rightNowOnly === true,
		onlineNowOnly: draft.onlineNowOnly === true,
		distanceMeters: typeof draft.distanceMeters === "string" ? draft.distanceMeters : defaults.distanceMeters,
		positions: isNumberArray(draft.positions) ? draft.positions : defaults.positions,
		pinnedFilter: isVisibilityFilter(draft.pinnedFilter) ? draft.pinnedFilter : defaults.pinnedFilter,
		archivedFilter: isVisibilityFilter(draft.archivedFilter) ? draft.archivedFilter : defaults.archivedFilter,
		hiddenFilter: isVisibilityFilter(draft.hiddenFilter) ? draft.hiddenFilter : defaults.hiddenFilter,
		needsReplyOnly: draft.needsReplyOnly === true,
	};
}

export async function loadChatFiltersDraft(): Promise<ChatFiltersDraft> {
	try {
		const stored = await getSetting<Partial<ChatFiltersDraft>>(STORAGE_KEY);
		return normalizeChatFiltersDraft(stored);
	} catch {
		return buildChatFiltersDraft({});
	}
}

export async function saveChatFiltersDraft(draft: ChatFiltersDraft): Promise<void> {
	try {
		await setSetting(STORAGE_KEY, draft);
	} catch {
		// Ignore storage failures to avoid blocking filter interactions.
	}
}
