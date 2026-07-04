import { useSyncExternalStore } from "react";
import {
	getInboxSyncStatus,
	subscribeInboxSyncStatus,
	type InboxSyncStatus,
} from "../services/inboxSync";

/** Live status of the background inbox sync for the given profile — see inboxSync.ts. */
export function useInboxSyncStatus(userId: number | null): InboxSyncStatus {
	return useSyncExternalStore(
		subscribeInboxSyncStatus,
		() => getInboxSyncStatus(userId),
		() => getInboxSyncStatus(userId),
	);
}
