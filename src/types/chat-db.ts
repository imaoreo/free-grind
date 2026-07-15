import type { ConversationEntry, Message } from "./messages";

export type ArchivedReason = "not_found" | "ws_delete";

// Explicit, durable record of who blocked whom for this conversation — the
// source of truth for archiving/system-message decisions instead of
// inferring direction from toggling `archived` on an ambiguous
// chat.v1.conversation.delete event (see conversationArchive.ts).
export type BlockState = "blocked_by_me" | "blocked_by_other";

export type StoredConversation = {
	conversationId: string;
	otherProfileId: string | null;
	entry: ConversationEntry;
	archived: boolean;
	archivedReason: ArchivedReason | null;
	archivedAt: number | null;
	// Manual, local-only "hide from inbox" flag — unlike `archived`, a hidden
	// conversation still round-trips through /v4/inbox normally; this only
	// gates the client-side filteredConversations view.
	hidden: boolean;
	blockState: BlockState | null;
	lastSeenInInboxAt: number | null;
	// The conversation's lastActivityTimestamp as of the last time its messages
	// were successfully fetched — not just when the conversation row itself
	// was upserted. Lets inboxSync tell "metadata is current" apart from
	// "messages are current", so an interrupted first sync resumes by
	// re-fetching only conversations whose messages never actually landed,
	// instead of restarting the whole message fetch from scratch.
	messagesSyncedActivityTimestamp: number | null;
	createdAt: number;
	updatedAt: number;
};

export type StoredMessage = Message & {
	localHistory: boolean;
};

// A durable, standalone record of a block/unblock initiated by the *other*
// side — kept separate from the messages table (rather than derived from
// SystemBlocked/SystemUnblocked messages on read) so the profile's name and
// avatar are captured at the moment it happens and survive even if the
// conversation itself later becomes unresolvable (e.g. the other profile is
// deleted/banned, or the conversation ages out of the live inbox entirely).
export type BlockEventType = "blocked" | "unblocked";

export type StoredBlockEvent = {
	id: string;
	profileId: string | null;
	conversationId: string;
	eventType: BlockEventType;
	timestamp: number;
	displayName: string | null;
	avatarMediaHash: string | null;
	createdAt: number;
};

export type MediaKind = "image" | "video" | "audio";
export type MediaFetchStatus = "pending" | "ok" | "failed";

export type MediaFileUpsertInput = {
	mediaKey: string;
	conversationId: string | null;
	messageId: string | null;
	kind: MediaKind;
	mimeType: string | null;
	dataBase64: string;
	viewOnce: boolean;
	sizeBytes: number | null;
	fetchStatus: MediaFetchStatus;
};

export type StoredMediaFile = {
	mediaKey: string;
	conversationId: string | null;
	messageId: string | null;
	kind: MediaKind;
	mimeType: string | null;
	dataBase64: string;
	viewOnce: boolean;
	sizeBytes: number | null;
	fetchStatus: MediaFetchStatus;
	fetchedAt: number;
};

/**
 * StoredMediaFile plus the sender of the message it's attached to — only
 * available where the query joins against `messages` (getMediaFilesForConversation),
 * so it's a distinct type rather than a field on StoredMediaFile itself.
 * Null for media with no messageId (e.g. live-merged items with no local
 * message to join against) — treat as "sender unknown".
 */
export type StoredMediaFileWithSender = StoredMediaFile & {
	senderId: number | null;
};

export type AlbumUpsertInput = {
	albumId: string;
	ownerProfileId: string | null;
	albumName: string | null;
	conversationId: string | null;
	sharedViaMessageId: string | null;
};

export type StoredAlbum = {
	albumId: string;
	ownerProfileId: string | null;
	albumName: string | null;
	conversationId: string | null;
	sharedViaMessageId: string | null;
	previewCoverBase64: string | null;
	previewCoverMimeType: string | null;
	createdAt: number;
	updatedAt: number;
};

export type AlbumMediaUpsertInput = {
	contentId: string;
	albumId: string;
	contentType: string | null;
	dataBase64: string | null;
	thumbDataBase64: string | null;
	remainingViews: number | null;
	isViewable: boolean | null;
};

export type StoredAlbumMedia = {
	contentId: string;
	albumId: string;
	contentType: string | null;
	dataBase64: string | null;
	thumbDataBase64: string | null;
	remainingViews: number | null;
	isViewable: boolean | null;
	fetchedAt: number | null;
};

export type StoredAvatar = {
	mediaHash: string;
	dataBase64: string;
	mimeType: string | null;
	fetchedAt: number;
};

export type DownloadedMediaPlatform = "ios" | "android" | "desktop";

/**
 * One entry per file this app has saved to the device (Photos album asset
 * id on iOS, MediaStore content URI on Android, relative path on desktop) —
 * the manifest used to report total storage used and to delete precisely
 * what we saved, nothing else. Device-local bookkeeping only — never part
 * of the portable chat-data export/import.
 */
export type DownloadedMediaEntry = {
	identifier: string;
	platform: DownloadedMediaPlatform;
	albumId: string | null;
	byteSize: number;
	mimeType: string | null;
	kind: "image" | "video" | null;
	savedAt: number;
};

export type FullDbExport = {
	version: 1;
	exportedAt: number;
	ownerUserId: number;
	tables: {
		conversations: Record<string, unknown>[];
		conversation_meta: Record<string, unknown>[];
		messages: Record<string, unknown>[];
		media_files: Record<string, unknown>[];
		albums: Record<string, unknown>[];
		album_media: Record<string, unknown>[];
		avatars: Record<string, unknown>[];
		settings: Record<string, unknown>[];
		saved_phrases: Record<string, unknown>[];
		saved_locations: Record<string, unknown>[];
		sexual_health_prep_doses: Record<string, unknown>[];
		sexual_health_encounters: Record<string, unknown>[];
		sexual_health_appointments: Record<string, unknown>[];
		sexual_health_sti_tests: Record<string, unknown>[];
	};
};
