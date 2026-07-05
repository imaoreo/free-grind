import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	type FormEvent,
	type TouchEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useBlockProfile, useUnblockProfile, useBlockedProfileIds } from "../../hooks/queries/useProfileQueries";
import { usePresenceCheckBatch } from "../../hooks/usePresenceCheck";
import { useAuth } from "../../contexts/useAuth";
import { ChatApiError } from "../../services/chatService";
import { setConversationDirectory } from "../../services/conversationDirectory";
import * as chatDb from "../../services/chatDb";
import { isSafeToPageInboxLocally } from "../../services/inboxSync";
import type { ArchivedReason } from "../../types/chat-db";
import {
	archiveConversation,
	unarchiveConversation,
	claimBlockStateTransition,
	deriveOtherProfileIdFromConversationId,
	markConversationDeleteHandled,
	CHAT_ARCHIVE_STATE_EVENT,
	type ChatArchiveStateChangeDetail,
} from "../../services/conversationArchive";
import {
	CHAT_REALTIME_EVENT,
	CHAT_REALTIME_STATUS,
	CHAT_SYSTEM_MESSAGE_EVENT,
	TYPING_STATUS_EVENT,
	getChatRealtimeStatus,
	type TypingStatusDetail,
} from "../../components/ChatRealtimeBridge";
import { PhotoViewer, type PhotoViewerMedia } from "../../components/PhotoViewer";
import { PhotoActionBar } from "../../components/PhotoActionBar";
import {
	messageSchema,
	type ConversationEntry,
	type InboxFilters,
	type Message,
} from "../../types/messages";
import type { RealtimeEnvelope, RealtimeStatus } from "../../types/chat-realtime";
import type {
	AlbumListItem,
	AlbumViewerState,
	UiMessage,
} from "../../types/chat-page";
import type { DrawerMedia } from "./chat/ChatDrawerPanel";
import {
	indexConversations,
	indexMessages,
	searchMessagesLocal,
} from "./chat/cache";
import { ChatInboxPanel } from "./chat/ChatInboxPanel";
import { ChatInboxHeader } from "./chat/ChatInboxHeader";
import { ChatFiltersOverlay } from "./chat/ChatFiltersOverlay";
import { ChatThreadPanel } from "./chat/ChatThreadPanel";
import { parseSlashCommand } from "./chat/slashCommands";
import { ChatAlbumSheet } from "./chat/ChatAlbumSheet";
import { ChatMediaSheet } from "./chat/ChatMediaSheet";
import * as chatLog from "../../services/chatLog";
import {
	buildBinaryUpload,
	buildChatFiltersDraft,
	buildPreviewFromMessage,
	extractImageHashFromSignedUrl,
	getMediaCaptureTarget,
	isPreviewUnhelpful,
	getMessageAlbumId,
	getMessageImageUrl,
	getMessageImageCreatedAt,
	getMessageTakenOnGrindr,
	getMessageVideoUrl,
	getMessageMediaId,
	getMessagePreviewLabel,
	getOtherParticipant,
	isLocalClientMessageId,
	parseChatFiltersFromLocationState,
    formatDateTime24,
	type ChatFiltersDraft,
} from "./chat/chatUtils";
import { fetchAndStoreMedia, hydrateMediaByMessageId, isSignedUrlExpired } from "../../services/mediaStore";
import { captureAlbum, captureAlbumsForMessages, getLocalAlbum } from "../../services/albumStore";
import { captureReplyPreviewsForMessages } from "../../services/replyMediaStore";
import { useAvatarCache } from "../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../services/avatarStore";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { appLog } from "../../utils/logger";
import {
	clearUnreadCountForProfile,
	getChatContactIndexForProfiles,
	getLocalNicknamesForProfiles,
	indexChatContactRecordsByProfileId,
	setLocalNicknameForProfile,
	upsertChatContactIndexFromInbox,
} from "../../services/chatContactIndex";
import type { ChatContactIndexRecord } from "../../types/chat-contact-index";
import { markInboxSeen, getInboxLastSeen } from "../../services/seenStore";
import { SCROLL_RESTORATION_TIMEOUT_MS } from "../../config/ui-constants";
import { clearAutomationSeenHistoryForSender, runAutomationRulesForSender } from "../../utils/automationRules";
import { consumeSelfBlockAction } from "../../utils/selfBlockActions";
import { isReadReceiptsHidden } from "../../utils/privacy";
import freegrindLogo from "../../images/freegrind-logo.webp";
import { getCachedOwnProfilePhotoHash, removeProfileFromBrowseCache, setCachedOwnProfilePhotoHash, getCachedProfileDetail, setCachedProfileDetail } from "./gridpage/cache";
import type { ProfileDetail } from "../../types/grid";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";

// Local pagination for archived threads (chatDb has no server to ask, so we
// page through it ourselves) — a "pageKey" here is this prefix + a cursor
// timestamp, never sent anywhere, just round-tripped through the same
// messagePageKeyRef the live API path already uses.
const LOCAL_PAGE_KEY_PREFIX = "local:";
const ARCHIVED_THREAD_PAGE_SIZE = 30;
// Cap for the fully-offline inbox fallback below — chatDb's background sync
// (inboxSync.ts) can hold the user's entire chat history locally, far more
// than a single screen should ever render at once, and there's no server to
// page from while offline anyway.
const OFFLINE_INBOX_FALLBACK_LIMIT = 100;
// Batch size for local-first "load more" pagination once the background
// inbox sync has walked the whole chat list at least once — mirrors the
// live API's actual page size (~190 conversations/page) so scrolling
// behaves the same either way.
const LOCAL_INBOX_PAGE_SIZE = 190;
// Synthetic, locally-generated block/unblock markers (see
// chatDb.insertSystemMessage) — never real chat activity, so excluded
// wherever "the newest message" is used to drive a conversation's
// lastActivityTimestamp/sort position.
const SYSTEM_MESSAGE_TYPES = new Set<string>([
	"SystemBlocked",
	"SystemUnblocked",
	"SystemBlockedBySelf",
	"SystemUnblockedBySelf",
]);

/**
 * Eagerly fetch-and-store every message's media bytes into chatDb, fire-and-
 * forget. Safe to call repeatedly for the same messages — mediaStore de-dupes
 * in-flight fetches and skips anything already cached. Called from every
 * point a message's URL gets resolved (initial load, hydration fallbacks,
 * realtime arrival) so content survives signed-URL expiry / view-once limits.
 */
function captureMediaForMessages(
	messages: UiMessage[],
	conversationId: string,
	userId: number | null,
): void {
	for (const message of messages) {
		const target = getMediaCaptureTarget(message);
		if (target) {
			void fetchAndStoreMedia({
				mediaKey: target.mediaKey,
				kind: target.kind,
				url: target.url,
				conversationId,
				messageId: message.messageId,
				viewOnce: target.viewOnce,
				isOwnMessage: userId != null && message.senderId === userId,
			});
		} else if (message.type !== "Giphy") {
			// No live URL on this message anymore (expired, archived
			// conversation, server stopped refreshing it) — fall back to
			// whatever's already cached for it by message id instead.
			void hydrateMediaByMessageId(message.messageId);
		}
	}
}

/**
 * In-memory counterpart to chatLog.ts's DB-level merge rule: when an
 * incoming update wipes a message's body via unsend but we already had real
 * content showing for it, keep showing that content (flagged localHistory)
 * instead of letting the wipe blindly overwrite it. Without this, the DB
 * stays correct but the UI flickers back to "message was unsent" the next
 * time this conversation's messages are merged in-memory (poll, reload,
 * realtime echo of our own unsend).
 */
function mergeMessagePreservingUnsendWipe(
	previous: UiMessage | undefined,
	incoming: UiMessage,
): UiMessage {
	if (!previous) {
		return incoming;
	}
	const prevBody = previous.body as Record<string, unknown> | null | undefined;
	const newBody = incoming.body as Record<string, unknown> | null | undefined;
	if (incoming.unsent && !newBody && prevBody) {
		return { ...previous, unsent: true, localHistory: true };
	}
	return incoming;
}



export function ChatPage() {
	const { t } = useTranslation();
	useAvatarCache();
	const location = useLocation();
	const navigate = useNavigate();
	const { conversationId: routeConversationId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const service = useApiFunctions();
	const { mutateAsync: blockProfileMutation } = useBlockProfile();
	const { mutateAsync: unblockProfileMutation } = useUnblockProfile();
	const { data: blockedProfileIdsData, refetch: refetchBlockedProfileIds } = useBlockedProfileIds();
	const { userId, settingsReady } = useAuth();
	const isDesktop = useDesktopBreakpoint();
	const threadBottomRef = useRef<HTMLDivElement | null>(null);
	const threadScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
	const selectedConversationIdRef = useRef<string | null>(null);
	const conversationsRef = useRef<ConversationEntry[]>([]);
	const threadMessagesRef = useRef<UiMessage[]>([]);
	const messagePageKeyRef = useRef<string | null>(null);
	const isLoadingOlderMessagesRef = useRef(false);
	const preserveThreadScrollRef = useRef(false);
	const olderLoadSnapshotRef = useRef<{
		scrollTop: number;
		scrollHeight: number;
	} | null>(null);
	const selectedConversationUnreadCountRef = useRef(0);
	const lastLoadedConversationIdRef = useRef<string | null>(null);
	const lastMessageIdRef = useRef<string | null>(null);
	const conversationsWithPendingUnreadRef = useRef(new Set<string>());

	const [conversations, setConversations] = useState<ConversationEntry[]>([]);
	// The canonical source of truth for archived chats' display data — holds
	// the full entry directly rather than just an id, so archived chats render
	// independently of whatever `conversations` (the live-inbox mirror)
	// happens to contain at any given moment. A conversation that's gone from
	// the server by definition never comes back via /v4/inbox to repopulate
	// `conversations` on its own, so it can't be the source for this.
	const [archivedConversations, setArchivedConversations] = useState<
		Map<string, { reason: ArchivedReason; entry: ConversationEntry }>
	>(new Map());
	const archivedConversationsRef = useRef(archivedConversations);
	useEffect(() => {
		archivedConversationsRef.current = archivedConversations;
	}, [archivedConversations]);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [isLoadingMoreInbox, setIsLoadingMoreInbox] = useState(false);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [inboxFilters, setInboxFilters] = useState<InboxFilters>({});
	const [selectedDesktopConversationId, setSelectedDesktopConversationId] =
		useState<string | null>(null);

	const [hidePinned, setHidePinned] = useState(false);
	const [hideArchived, setHideArchived] = useState(false);

	useEffect(() => {
		void chatDb.getSetting<boolean>("chatHidePinned").then((value) => {
			if (value != null) setHidePinned(value);
		});
	}, []);

	// Header state (shared between ChatInboxHeader on desktop and ChatInboxPanel on mobile)
	const [chatIsSearchOpen, setChatIsSearchOpen] = useState(false);
	const [chatSearchQuery, setChatSearchQuery] = useState("");
	const [chatIsFiltersOpen, setChatIsFiltersOpen] = useState(false);
	const [chatFiltersDraft, setChatFiltersDraft] = useState<ChatFiltersDraft>(() => buildChatFiltersDraft({}));

	const hidePinnedLoadedRef = useRef(false);
	useEffect(() => {
		if (!hidePinnedLoadedRef.current) {
			// Skip the very first run (mount with the default `false`) so it
			// can't race the async load above and overwrite a stored `true`.
			hidePinnedLoadedRef.current = true;
			return;
		}
		void chatDb.setSetting("chatHidePinned", hidePinned);
	}, [hidePinned]);

	useEffect(() => {
		if (!userId) return;
		const cached = getCachedOwnProfilePhotoHash();
		if (cached !== undefined) {
			setOwnProfilePhotoUrl(resolveAvatarSrc(cached, cached ? getThumbImageUrl(cached, "75x75") : null));
			return;
		}
		void (async () => {
			try {
				const parsed = await service.getBrowseProfileMedia(userId);
				const hash =
					parsed.medias?.map((m) => m.mediaHash ?? "").find((h) => validateMediaHash(h)) ??
					(parsed.profileImageMediaHash && validateMediaHash(parsed.profileImageMediaHash)
						? parsed.profileImageMediaHash
						: null) ??
					null;
				setCachedOwnProfilePhotoHash(hash);
				setOwnProfilePhotoUrl(resolveAvatarSrc(hash, hash ? getThumbImageUrl(hash, "75x75") : null));
			} catch {
				setOwnProfilePhotoUrl(null);
			}
		})();
	}, [userId, service]);

	useEffect(() => {
		const nextFilters = parseChatFiltersFromLocationState(location.state);
		if (nextFilters) {
			setInboxFilters(nextFilters);

			// Clear the state from the history entry so it doesn't re-apply when returning to this page
			const safeState =
				typeof location.state === "object" && location.state !== null
					? (location.state as Record<string, unknown>)
					: {};
			navigate(location.pathname + location.search, {
				replace: true,
				state: { ...safeState, inboxFiltersDraft: undefined },
			});
		}
	}, [location.key, location.state, navigate, location.pathname, location.search]);

	const activeInboxFilters = useMemo(() => {
		const next: InboxFilters = {
			unreadOnly: inboxFilters.unreadOnly ?? false,
			chemistryOnly: inboxFilters.chemistryOnly ?? false,
			favoritesOnly: inboxFilters.favoritesOnly ?? false,
			rightNowOnly: inboxFilters.rightNowOnly ?? false,
			onlineNowOnly: inboxFilters.onlineNowOnly ?? false,
			positions: inboxFilters.positions ?? [],
		};
		if (inboxFilters.distanceMeters != null) {
			next.distanceMeters = inboxFilters.distanceMeters;
		}
		return next;
	}, [inboxFilters]);

	const hasActiveInboxFilters =
		Boolean(inboxFilters.unreadOnly) ||
		Boolean(inboxFilters.chemistryOnly) ||
		Boolean(inboxFilters.favoritesOnly) ||
		Boolean(inboxFilters.rightNowOnly) ||
		Boolean(inboxFilters.onlineNowOnly) ||
		(inboxFilters.positions?.length ?? 0) > 0 ||
		inboxFilters.distanceMeters != null;

	const chatActiveFilterCount = [
		inboxFilters.unreadOnly,
		inboxFilters.chemistryOnly,
		inboxFilters.favoritesOnly,
		inboxFilters.rightNowOnly,
		inboxFilters.onlineNowOnly,
		inboxFilters.distanceMeters !== null && inboxFilters.distanceMeters !== undefined,
		(inboxFilters.positions?.length ?? 0) > 0,
	].filter(Boolean).length;

	const activeInboxFiltersRef = useRef(activeInboxFilters);
	activeInboxFiltersRef.current = activeInboxFilters;

	const clearInboxFilters = useCallback(() => {
		setInboxFilters({});
	}, []);

	const toggleInboxFavoritesOnly = useCallback(() => {
		setInboxFilters((previous) => ({
			...previous,
			favoritesOnly: previous.favoritesOnly ? undefined : true,
		}));
	}, []);

	const [threadConversationId, setThreadConversationId] = useState<
		string | null
	>(null);
	const [threadMessages, setThreadMessages] = useState<UiMessage[]>([]);
	const [threadLastReadTimestamp, setThreadLastReadTimestamp] = useState<number | null>(null);
	const [messagePageKey, setMessagePageKey] = useState<string | null>(null);
	const [isLoadingThread, setIsLoadingThread] = useState(false);
	const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
	const [threadError, setThreadError] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [typingConversationIds, setTypingConversationIds] = useState<Set<string>>(new Set());
	const typingExpireTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
	const isSendingTypingRef = useRef(false);
	const typingDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [isUpdatingConversationState, setIsUpdatingConversationState] =
		useState(false);
	const [isBlockingProfileId, setIsBlockingProfileId] = useState<string | null>(
		null,
	);
	const [isUnblockingProfileId, setIsUnblockingProfileId] = useState<string | null>(
		null,
	);
	const [isDeletingConversationId, setIsDeletingConversationId] = useState<string | null>(
		null,
	);
	const [isTogglingFavoriteProfileId, setIsTogglingFavoriteProfileId] = useState<string | null>(null);
	const [localNicknamesByProfileId, setLocalNicknamesByProfileId] = useState<
		Record<string, string>
	>({});
	const [chatContactIndexByProfileId, setChatContactIndexByProfileId] = useState<
		Record<string, ChatContactIndexRecord>
	>({});

	const [openMessageActionId, setOpenMessageActionId] = useState<string | null>(
		null,
	);
	const [isHeaderActionsMenuOpen, setIsHeaderActionsMenuOpen] =
		useState(false);
	const headerActionsMenuRef = useRef<HTMLDivElement | null>(null);
	const messageLongPressTimeoutRef = useRef<number | null>(null);
	const messageLongPressTriggeredRef = useRef(false);
	const [isMutatingMessageId, setIsMutatingMessageId] = useState<string | null>(
		null,
	);
	const [reactionBurstMessageId, setReactionBurstMessageId] = useState<
		string | null
	>(null);

	// Extract profile IDs from conversations for batch presence check
	const conversationProfileIds = useMemo(
		() =>
			conversations
				.map((conv) => {
					const otherParticipant = getOtherParticipant(conv, userId);
					return otherParticipant?.profileId != null
						? String(otherParticipant.profileId)
						: null;
				})
				.filter((id): id is string => id != null)
				.slice(0, 50), // Limit to 50
		[conversations, userId],
	);
	const presenceResults = usePresenceCheckBatch(
		conversationProfileIds.length > 0 ? conversationProfileIds : null,
	);

	const conversationProfileIdsJson = JSON.stringify(conversationProfileIds);

	useEffect(() => {
		if (conversationProfileIds.length === 0) {
			setChatContactIndexByProfileId({});
			return;
		}

		let cancelled = false;
		void getChatContactIndexForProfiles(conversationProfileIds)
			.then((records) => {
				if (cancelled) {
					return;
				}
				setChatContactIndexByProfileId(indexChatContactRecordsByProfileId(records));
			})
			.catch((error) => {
				appLog.warn("[chat-index] failed to hydrate chat list contact index", error);
			});

		return () => {
			cancelled = true;
		};
	}, [conversationProfileIdsJson]);

	const reactionBurstTimeoutRef = useRef<number | null>(null);

	const triggerReactionBurst = useCallback((messageId: string) => {
		if (reactionBurstTimeoutRef.current != null) {
			window.clearTimeout(reactionBurstTimeoutRef.current);
		}
		setReactionBurstMessageId(messageId);
		reactionBurstTimeoutRef.current = window.setTimeout(() => {
			setReactionBurstMessageId((current) =>
				current === messageId ? null : current,
			);
			reactionBurstTimeoutRef.current = null;
		}, 520);
	}, []);

	useEffect(() => {
		return () => {
			if (reactionBurstTimeoutRef.current != null) {
				window.clearTimeout(reactionBurstTimeoutRef.current);
			}
			if (messageLongPressTimeoutRef.current != null) {
				window.clearTimeout(messageLongPressTimeoutRef.current);
			}
			// Cleanup double tap timeouts
			for (const id of Object.values(doubleTapTimeoutRef.current)) {
				window.clearTimeout(id);
			}
		};
	}, []);

	useEffect(() => {
		setIsHeaderActionsMenuOpen(false);
	}, [routeConversationId, isDesktop]);

	useEffect(() => {
		if (!isHeaderActionsMenuOpen) {
			return;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (
				headerActionsMenuRef.current &&
				target instanceof Node &&
				!headerActionsMenuRef.current.contains(target)
			) {
				setIsHeaderActionsMenuOpen(false);
			}
		};

		window.addEventListener("pointerdown", handlePointerDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [isHeaderActionsMenuOpen]);

	const clearMessageLongPress = useCallback(() => {
		if (messageLongPressTimeoutRef.current != null) {
			window.clearTimeout(messageLongPressTimeoutRef.current);
			messageLongPressTimeoutRef.current = null;
		}
	}, []);

	const startMessageLongPress = useCallback(
		(messageId: string) => {
			if (isDesktop || isLocalClientMessageId(messageId)) {
				return;
			}

			messageLongPressTriggeredRef.current = false;
			clearMessageLongPress();
			messageLongPressTimeoutRef.current = window.setTimeout(() => {
				messageLongPressTriggeredRef.current = true;
				setOpenMessageActionId((current) =>
					current === messageId ? null : messageId,
				);
			}, 420);
		},
		[clearMessageLongPress, isDesktop],
	);

	const endMessageLongPress = useCallback(() => {
		clearMessageLongPress();
	}, [clearMessageLongPress]);

	const [isAlbumPickerOpen, setIsAlbumPickerOpen] = useState(false);
	const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
	const [isSharingAlbum, setIsSharingAlbum] = useState(false);
	const [shareableAlbums, setShareableAlbums] = useState<AlbumListItem[]>([]);
	const [albumCoverMap, setAlbumCoverMap] = useState<Map<number, string>>(new Map());
	const [ownProfilePhotoUrl, setOwnProfilePhotoUrl] = useState<string | null>(null);
	const [pendingAlbumShare, setPendingAlbumShare] = useState<{
		albumId: number;
		albumName: string;
	} | null>(null);
	const [albumViewer, setAlbumViewer] = useState<AlbumViewerState | null>(null);
	const [albumViewerMediaIndex, setAlbumViewerMediaIndex] = useState<
		number | null
	>(null);
	const [isAlbumViewerLoading, setIsAlbumViewerLoading] = useState(false);
	const [isAlbumSheetOpen, setIsAlbumSheetOpen] = useState(false);
	const [isChatMediaSheetOpen, setIsChatMediaSheetOpen] = useState(false);
	const albumViewerCancelledRef = useRef(false);
	type ThreadMediaItem = PhotoViewerMedia & { meta?: { takenOnGrindr: boolean; createdAtLabel: string | null; timestamp: number } };
	const [fullScreenMediaList, setFullScreenMediaList] = useState<ThreadMediaItem[]>([]);
	const [fullScreenMediaIndex, setFullScreenMediaIndex] = useState(0);
	const fullScreenImageUrl = fullScreenMediaList.length > 0 ? fullScreenMediaList[fullScreenMediaIndex]?.url ?? null : null;

	const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [pendingAttachmentFile, setPendingAttachmentFile] =
		useState<File | null>(null);
	const [attachmentLooping, setAttachmentLooping] = useState(false);
	const [attachmentTakenOnGrindr, setAttachmentTakenOnGrindr] = useState(false);
	const [attachmentMaxViews, setAttachmentMaxViews] = useState(2147483647);
	const [pendingAudioBlob, setPendingAudioBlob] = useState<Blob | null>(null);
	const [pendingAudioDuration, setPendingAudioDuration] = useState(0);
	const [isSendingAudio, setIsSendingAudio] = useState(false);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [isLoadingDrawer, setIsLoadingDrawer] = useState(false);
	const [drawerError, setDrawerError] = useState<string | null>(null);
	const [drawerMedia, setDrawerMedia] = useState<DrawerMedia[]>([]);
	const [isSendingDrawerMedia, setIsSendingDrawerMedia] = useState(false);
	const [isAddingDrawerMedia, setIsAddingDrawerMedia] = useState(false);
	const [deletingDrawerMediaId, setDeletingDrawerMediaId] = useState<number | null>(null);
	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const searchQuery = "";
	const imageViewerHistoryPushedRef = useRef(false);

	const inboxListRef = useRef<HTMLDivElement | null>(null);
	const [pendingMessageScrollId, setPendingMessageScrollId] = useState<
		string | null
	>(null);
	const [activeThreadSearchIndex, setActiveThreadSearchIndex] = useState(0);
	const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(() => getChatRealtimeStatus());

	const albumViewerPhotos = useMemo<PhotoViewerMedia[]>(() => {
		if (!albumViewer) return [];
		return albumViewer.content.map((item) => ({
			url: item.url || item.thumbUrl || item.coverUrl || "",
			type: item.contentType?.startsWith("video/") ? "video" : "image",
		}));
	}, [albumViewer]);

	const maxActivityTimestamp = useMemo(() => {
		return conversations.reduce(
			(max, conv) => Math.max(max, conv.data.lastActivityTimestamp ?? 0),
			0,
		);
	}, [conversations]);

	// Mark the inbox as "seen" whenever the user visits this page or new messages arrive.
	useEffect(() => {
		markInboxSeen(Math.max(Date.now(), maxActivityTimestamp));
	}, [location.pathname, maxActivityTimestamp]);

	// Scroll memory state (effects are placed after filteredConversations declaration)
	const [hasRestoredInboxScroll, setHasRestoredInboxScroll] = useState(false);
	const initialLastSeenInbox = useRef(getInboxLastSeen());

	const targetProfileId = useMemo(() => {
		const raw = searchParams.get("targetProfileId");
		if (!raw) {
			return null;
		}
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
	}, [searchParams]);
	const chatReturnTo = useMemo(() => {
		const raw = searchParams.get("returnTo");
		if (!raw || !raw.startsWith("/")) {
			return null;
		}
		return raw;
	}, [searchParams]);
	const selectedConversationId = targetProfileId
		? null
		: isDesktop
			? selectedDesktopConversationId
			: (routeConversationId ?? null);

	// Keep selection in sync when the layout breakpoint flips (e.g. fullscreen toggle).
	const prevIsDesktopRef = useRef(isDesktop);
	useEffect(() => {
		const wasDesktop = prevIsDesktopRef.current;
		prevIsDesktopRef.current = isDesktop;
		if (wasDesktop === isDesktop) return;

		if (isDesktop) {
			// Switched to desktop: pull the active route conversation into state.
			if (routeConversationId) {
				setSelectedDesktopConversationId(routeConversationId);
			}
		} else {
			// Switched to mobile: push the desktop selection into the URL.
			if (selectedDesktopConversationId) {
				navigate(`/chat/${encodeURIComponent(selectedDesktopConversationId)}`, {
					replace: true,
				});
			}
		}
	}, [isDesktop, routeConversationId, selectedDesktopConversationId, navigate]);

	// On desktop, initialize selection from route when landing on /chat/:id
	// (e.g. returning from profile). Do not keep forcing it afterward.
	useEffect(() => {
		if (!isDesktop || targetProfileId) {
			return;
		}

		if (!routeConversationId) {
			return;
		}

		if (selectedDesktopConversationId !== null) {
			return;
		}

		setSelectedDesktopConversationId(routeConversationId);
	}, [
		isDesktop,
		routeConversationId,
		selectedDesktopConversationId,
		targetProfileId,
	]);

	const selectedConversation = useMemo(
		() =>
			conversations.find(
				(conversation) =>
					conversation.data.conversationId === selectedConversationId,
			) ??
			(selectedConversationId
				? archivedConversations.get(selectedConversationId)?.entry ?? null
				: null),
		[conversations, archivedConversations, selectedConversationId],
	);

	// Header info (favorite, distance, online status, ...) for a chat started
	// from a profile before any conversation exists — there's no participant
	// record to read this from yet, so fetch the profile directly.
	const [targetProfileDetail, setTargetProfileDetail] = useState<ProfileDetail | null>(null);
	useEffect(() => {
		if (!targetProfileId || selectedConversation) {
			setTargetProfileDetail(null);
			return;
		}
		const idStr = String(targetProfileId);
		setTargetProfileDetail(getCachedProfileDetail(idStr));
		let cancelled = false;
		void service.getProfileDetail(idStr).then((profile) => {
			if (cancelled) return;
			setTargetProfileDetail(profile);
			setCachedProfileDetail(idStr, profile);
		}).catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [targetProfileId, selectedConversation, service]);

	// Landing directly on a conversationId that isn't in the currently loaded
	// live inbox page(s) or the archived map (e.g. opening a message search
	// result for an older conversation the inbox hasn't paginated to) would
	// otherwise resolve selectedConversation to null and silently fall back
	// to showing the inbox instead of the thread. It's still in local chatDb
	// (that's what made it searchable in the first place) — pull it in from
	// there instead of requiring a live /v4/inbox page to already include it.
	useEffect(() => {
		if (!selectedConversationId || selectedConversation) {
			return;
		}
		let cancelled = false;
		void chatDb.getConversation(selectedConversationId).then((stored) => {
			if (cancelled || !stored) {
				return;
			}
			if (stored.archived) {
				setArchivedConversations((previous) => {
					if (previous.has(stored.conversationId)) return previous;
					const next = new Map(previous);
					next.set(stored.conversationId, {
						reason: stored.archivedReason ?? "ws_delete",
						entry: stored.entry,
					});
					return next;
				});
			} else {
				setConversations((previous) => {
					if (previous.some((c) => c.data.conversationId === stored.conversationId)) {
						return previous;
					}
					return [...previous, stored.entry];
				});
			}
		});
		return () => {
			cancelled = true;
		};
	}, [selectedConversationId, selectedConversation]);

	const selectedConversationOtherProfileId = useMemo(() => {
		if (selectedConversation && userId != null) {
			const otherParticipant = getOtherParticipant(selectedConversation, userId);
			if (otherParticipant?.profileId != null) {
				return String(otherParticipant.profileId);
			}
		}
		// No conversation yet (chat started from a profile) — the profile id is
		// still known, so favorite/nickname/etc. can key off it directly.
		return targetProfileId ? String(targetProfileId) : null;
	}, [selectedConversation, userId, targetProfileId]);

	const isSelectedConversationBlockedBySelf = useMemo(() => {
		if (!selectedConversationOtherProfileId || !blockedProfileIdsData) {
			return false;
		}
		return blockedProfileIdsData.includes(selectedConversationOtherProfileId);
	}, [selectedConversationOtherProfileId, blockedProfileIdsData]);

	useEffect(() => {
		const profileIds = conversations
			.map((conversation) => {
				if (userId == null) {
					return null;
				}
				const otherParticipant = getOtherParticipant(conversation, userId);
				return otherParticipant?.profileId != null
					? String(otherParticipant.profileId)
					: null;
			})
			.filter((id): id is string => id !== null);

		if (targetProfileId && !profileIds.includes(String(targetProfileId))) {
			profileIds.push(String(targetProfileId));
		}

		if (profileIds.length === 0) {
			setLocalNicknamesByProfileId({});
			return;
		}

		let cancelled = false;
		void getLocalNicknamesForProfiles(profileIds)
			.then((nicknames) => {
				if (cancelled) {
					return;
				}
				setLocalNicknamesByProfileId(nicknames);
			})
			.catch((error) => {
				appLog.warn("[chat] failed to hydrate local nicknames", error);
			});

		return () => {
			cancelled = true;
		};
	}, [conversations, userId, targetProfileId]);


	useEffect(() => {
		selectedConversationIdRef.current = selectedConversationId;
		if (selectedConversationId) {
			conversationsWithPendingUnreadRef.current.delete(selectedConversationId);
		}
	}, [selectedConversationId]);

	useEffect(() => {
		conversationsRef.current = conversations;
		setConversationDirectory(conversations);
	}, [conversations]);

	useEffect(() => {
		threadMessagesRef.current = threadMessages;
	}, [threadMessages]);

	// Shared by every archive trigger (ws-delete, 404-on-open): records the
	// reason plus a displayable entry, sourced from whatever's already loaded
	// and falling back to chatDb for anything not currently in memory.
	const archiveConversationsLocally = useCallback(
		(ids: string[], reason: ArchivedReason) => {
			const unresolved: string[] = [];
			const resolved = new Map<string, ConversationEntry>();
			for (const id of ids) {
				const entry =
					archivedConversationsRef.current.get(id)?.entry ??
					conversationsRef.current.find((c) => c.data.conversationId === id);
				if (entry) {
					resolved.set(id, entry);
				} else {
					unresolved.push(id);
				}
			}

			if (resolved.size > 0) {
				setArchivedConversations((previous) => {
					const next = new Map(previous);
					for (const [id, entry] of resolved) {
						next.set(id, { reason, entry });
					}
					return next;
				});
			}

			if (unresolved.length > 0) {
				void Promise.all(unresolved.map((id) => chatDb.getConversation(id))).then(
					(results) => {
						setArchivedConversations((previous) => {
							const next = new Map(previous);
							for (const result of results) {
								if (result) {
									next.set(result.conversationId, { reason, entry: result.entry });
								}
							}
							return next;
						});
					},
				);
			}
		},
		[],
	);

	useEffect(() => {
		messagePageKeyRef.current = messagePageKey;
	}, [messagePageKey]);

	useEffect(() => {
		isLoadingOlderMessagesRef.current = isLoadingOlderMessages;
	}, [isLoadingOlderMessages]);

	useEffect(() => {
		selectedConversationUnreadCountRef.current =
			selectedConversation?.data.unreadCount ?? 0;
	}, [selectedConversation]);
	useEffect(() => {
		setPendingAlbumShare(null);
		albumViewerCancelledRef.current = true;
		setIsAlbumSheetOpen(false);
		setAlbumViewer(null);
		setAlbumViewerMediaIndex(null);
		setIsAlbumViewerLoading(false);
	}, [selectedConversationId]);

	const messageSearchResults = useMemo(
		() => searchMessagesLocal(searchQuery, { limit: 80 }),
		[searchQuery],
	);

	const selectedThreadMessageMatches = useMemo(
		() =>
			messageSearchResults.filter(
				(result) => result.conversationId === selectedConversationId,
			),
		[messageSearchResults, selectedConversationId],
	);

	const syncConversation = useCallback(
		(update: (conversation: ConversationEntry) => ConversationEntry) => {
			setConversations((previous) =>
				previous.map((conversation) =>
					conversation.data.conversationId === selectedConversationId
						? update(conversation)
						: conversation,
				),
			);
		},
		[selectedConversationId],
	);

	const loadAlbums = useCallback(async (): Promise<AlbumListItem[]> => {
		setIsLoadingAlbums(true);
		try {
			const items = await service.listAlbums();
			const mapped = items
				.map((item) => {
					const albumId =
						typeof item.albumId === "number"
							? item.albumId
							: Number(item.albumId);
					return {
						albumId,
						albumName: item.albumName ?? null,
						isShareable: item.isShareable !== false,
					};
				})
				.filter((item) => Number.isFinite(item.albumId));
			setShareableAlbums(mapped);

			const coverEntries = await Promise.all(
				mapped.map(async ({ albumId }) => {
					try {
						const detail = await service.getAlbum(albumId);
						const first = detail.content?.[0];
						const url = first?.thumbUrl || first?.url || first?.coverUrl;
						return url ? ([albumId, url] as [number, string]) : null;
					} catch {
						return null;
					}
				}),
			);
			setAlbumCoverMap(new Map(coverEntries.filter((e): e is [number, string] => e !== null)));

			return mapped;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("chat.errors.load_albums"),
			);
			return [];
		} finally {
			setIsLoadingAlbums(false);
		}
	}, [service]);

	// Hydrate archived conversations from the local DB on mount. These never
	// come back from a fresh /v4/inbox response (by definition — that's what
	// "archived" means here), so they need to be seeded into UI state once;
	// archivedConversations (not `conversations`) is what filteredConversations
	// renders them from, so there's nothing else to keep in sync here.
	// Gated on settingsReady, not just mount — without it, landing on this
	// page before setActiveChatDbUser finishes switching to the per-account
	// chatDb file (e.g. right after login) would hydrate from the wrong/empty
	// db, find nothing, and never retry since this only runs once per mount —
	// archived chats would stay missing from the list until the next full
	// remount of this page.
	useEffect(() => {
		if (!settingsReady) {
			return;
		}
		let cancelled = false;
		void chatDb
			.listConversations({ includeArchived: true })
			.then(async (stored) => {
				if (cancelled) {
					return;
				}
				const archived = stored.filter((c) => c.archived);
				appLog.debug(
					`[ChatPage] hydrated ${archived.length} archived conversation(s) from chatDb`,
				);
				if (archived.length === 0) {
					return;
				}
				// Same fallback as loadInbox: the stored preview can be null if it
				// was last synced while the live API was already returning that,
				// even though we have real local history.
				const withPreviews = await Promise.all(
					archived.map(async (c) => {
						if (!isPreviewUnhelpful(c.entry.data.preview)) {
							return c;
						}
						const messages = await chatDb.getMessages(c.conversationId);
						for (let i = messages.length - 1; i >= 0; i--) {
							const message = messages[i];
							if (message.body && typeof message.body === "object") {
								return {
									...c,
									entry: {
										...c.entry,
										data: {
											...c.entry.data,
											preview: buildPreviewFromMessage(message, t),
										},
									},
								};
							}
						}
						return c;
					}),
				);
				if (cancelled) {
					return;
				}
				// Re-verify against chatDb one last time right before committing —
				// `stored`'s archived flag was read before the withPreviews pass
				// above (which awaits a per-conversation chatDb.getMessages call),
				// so a live unblock reconciliation (a WS event, or another mounted
				// page) landing during that window would already have correctly
				// unarchived this conversation elsewhere, only for this hydration's
				// now-stale snapshot to blindly re-add it here and hide it again.
				const stillArchivedIds = new Set(
					(await chatDb.listConversations({ includeArchived: true }).catch(() => stored))
						.filter((c) => c.archived)
						.map((c) => c.conversationId),
				);
				if (cancelled) {
					return;
				}
				setArchivedConversations((previous) => {
					const next = new Map(previous);
					for (const c of withPreviews) {
						if (!stillArchivedIds.has(c.conversationId)) {
							continue;
						}
						next.set(c.conversationId, {
							reason: c.archivedReason ?? "ws_delete",
							entry: c.entry,
						});
					}
					return next;
				});
			})
			.catch((error) => {
				appLog.warn("[ChatPage] failed to hydrate archived conversations", error);
			});
		return () => {
			cancelled = true;
		};
	}, [settingsReady]);

	const loadInbox = useCallback(
		async ({
			page,
			replace,
			silent,
		}: { page: number; replace: boolean; silent?: boolean }) => {
			if (replace) {
				if (!silent) {
					setIsLoadingInbox(true);
				}
				setInboxError(null);
			} else {
				setIsLoadingMoreInbox(true);
			}

			try {
				const filters = activeInboxFiltersRef.current;
				const hasActiveServerFilters =
					filters.unreadOnly ||
					filters.chemistryOnly ||
					filters.favoritesOnly ||
					filters.rightNowOnly ||
					filters.onlineNowOnly ||
					(filters.positions?.length ?? 0) > 0 ||
					filters.distanceMeters != null;

				// Local-first pagination: once the background inbox sync (see
				// inboxSync.ts) has settled to "done" this session, chatDb is
				// confirmed current and "load more" while scrolling can page
				// straight through it instead of re-hitting the live /v4/inbox
				// endpoint. isSafeToPageInboxLocally checks the *live* sync
				// status rather than "ever completed" — if the app sat closed
				// long enough that several pages of new/changed conversations
				// piled up, the sync is busy catching up through all of them
				// (not just the first page) and this correctly stays false
				// until it settles, so scrolling during that window still goes
				// live instead of serving an incomplete local batch. Active
				// server-side filters (unreadOnly, chemistryOnly, etc.) also
				// always go live — chatDb has no way to reproduce that
				// filtering locally.
				if (!replace && !hasActiveServerFilters && isSafeToPageInboxLocally(userId)) {
					const stored = await chatDb.listConversations({ includeArchived: false });
					const offset = conversationsRef.current.length;
					const nextBatch = stored.slice(offset, offset + LOCAL_INBOX_PAGE_SIZE);

					if (nextBatch.length > 0) {
						setConversations((previous) => {
							const seen = new Set(previous.map((entry) => entry.data.conversationId));
							const additions = nextBatch
								.map((c) => c.entry)
								.filter((entry) => !seen.has(entry.data.conversationId));
							return additions.length > 0 ? [...previous, ...additions] : previous;
						});
					}
					setNextPage(offset + nextBatch.length < stored.length ? page + 1 : null);
					return;
				}

				const response = await service.listConversations({
					page,
					filters,
				});

				if (userId != null) {
					const inboxContactEntries = response.entries
						.map((entry) => {
							const otherParticipant = getOtherParticipant(entry, userId);
							if (!otherParticipant?.profileId) {
								return null;
							}

							return {
								profileId: String(otherParticipant.profileId),
								conversationId: entry.data.conversationId,
								lastMessageTimestamp: entry.data.lastActivityTimestamp ?? null,
								unreadCount: entry.data.unreadCount ?? 0,
							};
						})
						.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

					void upsertChatContactIndexFromInbox(inboxContactEntries).catch((error) => {
						appLog.warn("[chat-index] failed to persist inbox metadata", error);
					});
				}

				// Persist every fetched conversation durably (needed so a conversation
				// can be found locally later — e.g. opening a chat from a profile —
				// regardless of inbox pagination, and so offline reads have data).
				for (const entry of response.entries) {
					const otherParticipant = getOtherParticipant(entry, userId);
					void chatDb
						.upsertConversation(
							entry,
							otherParticipant?.profileId != null
								? String(otherParticipant.profileId)
								: null,
						)
						.catch((error) => {
							appLog.warn("[chat-db] failed to persist conversation", error);
						});
				}

				// A conversation reappearing in a fresh inbox response usually means
				// the other party messaged again, or someone unblocked someone. But
				// for a block-related archive (archivedReason "ws_delete", either
				// direction), don't trust that signal blindly — an inbox page that
				// was already in flight when the block happened can still land
				// afterwards and look exactly like a "reappearance" even though
				// nothing actually changed (more likely the more pages the inbox
				// has, since more requests can be in flight at once), and the
				// *other* party blocking us can have the same server-side
				// propagation lag on their side of the inbox filtering. block_state
				// is the one signal that covers both directions: if it's still set,
				// this "reappearance" is stale and should be ignored; if it's
				// already null, something else (the matching WS event, most likely)
				// already resolved this for real and the reappearance is consistent
				// with that.
				const reappearedCandidateIds = response.entries
					.map((entry) => entry.data.conversationId)
					.filter((cid) => archivedConversationsRef.current.has(cid));
				const reappearedArchivedIds = (
					await Promise.all(
						reappearedCandidateIds.map(async (cid) => {
							const info = archivedConversationsRef.current.get(cid);
							if (info?.reason !== "ws_delete") {
								return cid;
							}
							const stored = await chatDb.getConversation(cid).catch(() => null);
							return stored?.blockState == null ? cid : null;
						}),
					)
				).filter((cid): cid is string => cid !== null);
				if (reappearedArchivedIds.length > 0) {
					for (const cid of reappearedArchivedIds) {
						void unarchiveConversation(cid);
					}
					// Insert "SystemUnblocked" for conversations that were archived
					// due to a block (ws_delete / offline-403). Conversations that
					// disappeared due to a 404 ("not_found") are not block-related
					// and don't get this marker.
					const blockArchivedIds = reappearedArchivedIds.filter(
						(cid) => archivedConversationsRef.current.get(cid)?.reason === "ws_delete",
					);
					if (blockArchivedIds.length > 0) {
						const inserted = await Promise.all(
							blockArchivedIds.map(async (cid) => {
								const isSelf = consumeSelfBlockAction(cid, "unblock");
								const claimed = await claimBlockStateTransition(cid, null).catch(() => false);
								if (!claimed) return null;
								return chatDb
									.insertSystemMessage(cid, isSelf ? "SystemUnblockedBySelf" : "SystemUnblocked")
									.catch(() => null);
							}),
						);
						const valid = inserted.filter((m): m is Message => m !== null);
						if (valid.length > 0) {
							window.dispatchEvent(
								new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: valid }),
							);
						}
					}
					setArchivedConversations((previous) => {
						const next = new Map(previous);
						for (const cid of reappearedArchivedIds) {
							next.delete(cid);
						}
						return next;
					});
				}

				// A conversation the server has permanently dropped from its own
				// inbox listing (blocked, then unarchived locally — the server
				// only relists it once someone messages that profile afresh) needs
				// to come from chatDb directly, since no future response will ever
				// confirm it on its own. Bounded by recency instead of a blanket
				// chatDb.listConversations() union (which would defeat pagination
				// by dumping the user's entire local history in): anything locally
				// known, unarchived, and at least as recent as the least-recent
				// non-pinned entry the server actually returned would have to
				// belong on this same page too, so if it's missing, the server
				// isn't just paginating it further down — it genuinely can't
				// produce it, and our local copy is the only record left.
				// Recovered here (async, before the setConversations call below) so
				// the union below can stay a single, synchronous pass over
				// `previous` — see that block for why it's sourced from `previous`
				// and not a ref.
				let recoveredEntries: ConversationEntry[] = [];
				if (replace && !hasActiveServerFilters) {
					const responseIds = new Set(
						response.entries.map((entry) => entry.data.conversationId),
					);
					const nonPinnedTimestamps = response.entries
						.filter((entry) => !entry.data.pinned)
						.map((entry) => entry.data.lastActivityTimestamp ?? 0);
					const cutoff = nonPinnedTimestamps.length > 0 ? Math.min(...nonPinnedTimestamps) : 0;
					const localCandidates = await chatDb.listConversationsSince(cutoff).catch(() => []);
					recoveredEntries = localCandidates
						.filter((c) => !responseIds.has(c.conversationId))
						.map((c) => c.entry);
				}

				setConversations((previous) => {
					const entriesWithUnreadFixed = response.entries.map((entry) => {
						const cid = entry.data.conversationId;

						// If this is the active conversation, it's definitely read.
						if (cid === selectedConversationIdRef.current) {
							return {
								...entry,
								data: { ...entry.data, unreadCount: 0 },
							};
						}

						if (conversationsWithPendingUnreadRef.current.has(cid)) {
							conversationsWithPendingUnreadRef.current.delete(cid);
							if (entry.data.unreadCount === 0) {
								return {
									...entry,
									data: { ...entry.data, unreadCount: 1 },
								};
							}
						}
						return entry;
					});

					if (replace) {
						// Archived conversations are rendered from archivedConversations
						// directly (see filteredConversations), not from this array, so
						// there's nothing to preserve here — a plain replace is correct.

						let combined = entriesWithUnreadFixed;
						if (!hasActiveServerFilters) {
							// Union in whatever was already paged into view but that this
							// response didn't include (e.g. one unarchived elsewhere while
							// this page wasn't mounted, or — for a block-related archive —
							// one the server will *never* list again on its own, since it
							// only relists a conversation once someone messages that
							// profile afresh) so the list never loses something it was
							// already showing. Sourced from `previous` (this update's own
							// guaranteed-current state), not a ref snapshotted earlier in
							// this async function: two overlapping loadInbox calls (e.g. a
							// poll and a send-triggered refresh elsewhere) each reach this
							// updater at their own pace, and only `previous` is guaranteed
							// to already reflect whatever the other one just committed —
							// a ref read earlier in either call's timeline could still be
							// the pre-union snapshot, silently dropping the recovered entry
							// the moment the other call's "replace" wins the race.
							const responseIds = new Set(
								entriesWithUnreadFixed.map((entry) => entry.data.conversationId),
							);
							const missingFromPrevious = previous.filter(
								(entry) => !responseIds.has(entry.data.conversationId),
							);
							const missingIds = new Set(
								missingFromPrevious.map((entry) => entry.data.conversationId),
							);
							const newlyRecovered = recoveredEntries.filter(
								(entry) =>
									!responseIds.has(entry.data.conversationId) &&
									!missingIds.has(entry.data.conversationId),
							);
							const missingLocalEntries = [...missingFromPrevious, ...newlyRecovered];
							if (missingLocalEntries.length > 0) {
								// Insert each missing entry at the position it belongs under
								// the list's normal sort order (pinned, then
								// lastActivityTimestamp desc), without touching the relative
								// order of the server-provided entries — a full re-sort of the
								// combined array risks reshuffling them relative to each other
								// whenever the server's own ordering doesn't line up exactly
								// with this comparator (precision, tie-breaking, etc.).
								const comparePosition = (a: ConversationEntry, b: ConversationEntry) => {
									if (a.data.pinned && !b.data.pinned) return -1;
									if (b.data.pinned && !a.data.pinned) return 1;
									return (
										(b.data.lastActivityTimestamp ?? 0) -
										(a.data.lastActivityTimestamp ?? 0)
									);
								};
								const next = [...entriesWithUnreadFixed];
								for (const entry of missingLocalEntries) {
									let insertAt = next.length;
									for (let i = 0; i < next.length; i += 1) {
										if (comparePosition(entry, next[i]) < 0) {
											insertAt = i;
											break;
										}
									}
									next.splice(insertAt, 0, entry);
								}
								combined = next;
							}
						}

						// Polling re-fetches on a fixed interval regardless of whether
						// anything changed — avoid an unnecessary re-render (visible as
						// the list/avatars appearing to "reload") when the data is
						// actually identical to what's already shown.
						if (
							previous.length === combined.length &&
							JSON.stringify(previous) === JSON.stringify(combined)
						) {
							return previous;
						}
						return combined;
					}

					const map = new Map<string, ConversationEntry>();
					for (const entry of previous) {
						map.set(entry.data.conversationId, entry);
					}
					for (const entry of entriesWithUnreadFixed) {
						map.set(entry.data.conversationId, entry);
					}
					return [...map.values()].sort((a, b) => {
						if (a.data.pinned && !b.data.pinned) {
							return -1;
						}
						if (b.data.pinned && !a.data.pinned) {
							return 1;
						}
						return (
							(b.data.lastActivityTimestamp ?? 0) -
							(a.data.lastActivityTimestamp ?? 0)
						);
					});
				});

				// The live API sometimes returns a null preview for a conversation
				// whose last message was unsent server-side, even though we have
				// real history for it locally — patch in a preview built from that
				// history instead of leaving the inbox row stuck on "no messages
				// yet" for a conversation that clearly has messages.
				const entriesNeedingFallbackPreview = response.entries.filter((entry) =>
					isPreviewUnhelpful(entry.data.preview),
				);
				if (entriesNeedingFallbackPreview.length > 0) {
					void Promise.all(
						entriesNeedingFallbackPreview.map(async (entry) => {
							const cid = entry.data.conversationId;
							const localData = await chatLog.readLog(cid);
							for (let i = localData.messages.length - 1; i >= 0; i--) {
								const message = localData.messages[i];
								if (message.body && typeof message.body === "object") {
									return [cid, buildPreviewFromMessage(message, t)] as const;
								}
							}
							return null;
						}),
					).then((results) => {
						const patches = new Map(
							results.filter(
								(r): r is readonly [string, ReturnType<typeof buildPreviewFromMessage>] =>
									r != null,
							),
						);
						if (patches.size === 0) {
							return;
						}
						setConversations((previous) =>
							previous.map((conversation) =>
								patches.has(conversation.data.conversationId)
									? {
											...conversation,
											data: {
												...conversation.data,
												preview: patches.get(conversation.data.conversationId)!,
											},
										}
									: conversation,
							),
						);
					});
				}

				setNextPage(response.nextPage ?? null);
				if (replace && response.entries.length > 0) {
					setSelectedDesktopConversationId((previous) =>
						// A selection already made (e.g. via the targetProfileId lookup,
						// which can resolve through the local DB for a conversation
						// that isn't on this inbox page) must never be clobbered just
						// because it's absent from *this* page's entries — only default
						// to the first conversation when nothing is selected yet.
						previous ?? (targetProfileId ? null : (response.entries[0]?.data.conversationId ?? null)),
					);
				}
			} catch (error) {
				// A real HTTP error response (ChatApiError) should still surface as
				// an error — only fall back to the local DB when the request never
				// got an HTTP response at all (no connectivity).
				if (!(error instanceof ChatApiError) && replace) {
					try {
						const stored = await chatDb.listConversations({ includeArchived: true });
						setConversations(
							stored.slice(0, OFFLINE_INBOX_FALLBACK_LIMIT).map((c) => c.entry),
						);
						setNextPage(null);
						setInboxError(null);
						return;
					} catch {
						// Fall through to the generic error path below.
					}
				}
				const message =
					error instanceof Error ? error.message : t("chat.errors.load_inbox");
				setInboxError(message);
			} finally {
				setIsLoadingInbox(false);
				setIsLoadingMoreInbox(false);
			}
		},
		[service, targetProfileId, t, userId],
	);

	const loadThread = useCallback(
		async ({
			conversationId,
			older,
			silent,
		}: {
			conversationId: string;
			older: boolean;
			silent?: boolean;
		}) => {
			// Already known to be gone server-side (discovered via an earlier 404)
			// — skip the doomed network call entirely and page through the local
			// cache instead, mirroring the live path's pageKey/"load older"
			// mechanics exactly so the experience is identical either way.
			if (archivedConversationsRef.current.has(conversationId)) {
				if (older) {
					if (!messagePageKeyRef.current || isLoadingOlderMessagesRef.current) {
						return;
					}
					const container = threadScrollContainerRef.current;
					if (container) {
						preserveThreadScrollRef.current = true;
						olderLoadSnapshotRef.current = {
							scrollTop: container.scrollTop,
							scrollHeight: container.scrollHeight,
						};
					}
					isLoadingOlderMessagesRef.current = true;
					setIsLoadingOlderMessages(true);
					try {
						const beforeTimestamp = Number(
							messagePageKeyRef.current.slice(LOCAL_PAGE_KEY_PREFIX.length),
						);
						const olderMessages = await chatDb.getMessagesPage(conversationId, {
							beforeTimestamp,
							limit: ARCHIVED_THREAD_PAGE_SIZE,
						});
						const nextPageKey =
							olderMessages.length > 0
								? `${LOCAL_PAGE_KEY_PREFIX}${olderMessages[0].timestamp}`
								: null;
						setMessagePageKey(nextPageKey);
						messagePageKeyRef.current = nextPageKey;
						if (selectedConversationIdRef.current === conversationId) {
							setThreadMessages((previous) => {
								const map = new Map<string, UiMessage>();
								for (const m of olderMessages) map.set(m.messageId, m);
								for (const m of previous) map.set(m.messageId, m);
								return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
							});
						}
					} finally {
						setIsLoadingOlderMessages(false);
						isLoadingOlderMessagesRef.current = false;
					}
					return;
				}

				setThreadError(null);
				setThreadConversationId(conversationId);
				const [initialMessages, lastRead] = await Promise.all([
					chatDb.getMessagesPage(conversationId, { limit: ARCHIVED_THREAD_PAGE_SIZE }),
					chatDb.getLastReadTimestamp(conversationId),
				]);
				const nextPageKey =
					initialMessages.length > 0
						? `${LOCAL_PAGE_KEY_PREFIX}${initialMessages[0].timestamp}`
						: null;
				setMessagePageKey(nextPageKey);
				messagePageKeyRef.current = nextPageKey;
				if (selectedConversationIdRef.current === conversationId) {
					setThreadMessages(initialMessages);
					setThreadLastReadTimestamp(lastRead ?? null);
				}

				// Archived threads never reach the live API, so the normal
				// markRead/unread-clearing path further up never runs for them —
				// clear local unread state directly here instead, otherwise it
				// stays stuck "unread" forever.
				const archivedEntry = archivedConversationsRef.current.get(conversationId)?.entry;
				if (archivedEntry && archivedEntry.data.unreadCount > 0) {
					void chatDb.setConversationUnreadCount(conversationId, 0).catch(() => {});
					setArchivedConversations((previous) => {
						const info = previous.get(conversationId);
						if (!info) {
							return previous;
						}
						const next = new Map(previous);
						next.set(conversationId, {
							...info,
							entry: {
								...info.entry,
								data: { ...info.entry.data, unreadCount: 0 },
							},
						});
						return next;
					});
					const other = getOtherParticipant(archivedEntry, userId);
					if (other?.profileId) {
						const pid = String(other.profileId);
						void clearUnreadCountForProfile(pid).catch(() => {});
						setChatContactIndexByProfileId((prev) => {
							const existing = prev[pid];
							if (!existing) {
								return prev;
							}
							return { ...prev, [pid]: { ...existing, unreadCount: 0 } };
						});
					}
				}
				return;
			}

			if (older) {
				if (!messagePageKeyRef.current || isLoadingOlderMessagesRef.current) {
					return;
				}
				const container = threadScrollContainerRef.current;
				if (container) {
					preserveThreadScrollRef.current = true;
					olderLoadSnapshotRef.current = {
						scrollTop: container.scrollTop,
						scrollHeight: container.scrollHeight,
					};
				}
				isLoadingOlderMessagesRef.current = true;
				setIsLoadingOlderMessages(true);
			} else {
				if (!silent) {
					setIsLoadingThread(true);
				}
				setThreadError(null);
				setThreadConversationId(conversationId);

				// Load initial state from local log if available.
				void chatLog.readLog(conversationId).then((localData) => {
					if (selectedConversationIdRef.current === conversationId) {
						setThreadLastReadTimestamp(localData.lastReadTimestamp ?? null);
					}
				});
			}

			try {
				const response = await service.listMessages({
					conversationId,
					pageKey: older ? (messagePageKeyRef.current ?? undefined) : undefined,
					includeProfile: true,
				});

				const localData = await chatLog.readLog(conversationId);
				const localMessages = localData.messages;
				const localMessageMap = new Map(
					localMessages.map((message) => [message.messageId, message] as const),
				);
				const responseMessages = response.messages.map((message) => {
					const localMessage = localMessageMap.get(message.messageId);
					const localBody =
						localMessage?.body && typeof localMessage.body === "object"
							? (localMessage.body as Record<string, unknown>)
							: null;
					const currentBody =
						message.body && typeof message.body === "object"
							? (message.body as Record<string, unknown>)
							: null;

					// Unsend wipe (by either party) — if we already had real content
					// cached locally, keep showing it instead of the server's emptied
					// version. Source of truth here is chatDb (durable across
					// restarts), not just in-memory state.
					if (message.unsent && !currentBody && localBody) {
						return { ...localMessage, unsent: true, localHistory: true } as UiMessage;
					}

					// If the API already returned a fresh URL, use it as-is.
					if (currentBody?.url) {
						return message;
					}

					// Restore the cached URL only when it hasn't expired yet.
					// Expired → return message without URL so the hydration pass below
					// calls getMessage() and fetches a new signed URL from the API.
					// Check body.url first (normalized form), then fall back to any URL field.
					const cachedUrl = localMessage
						? ((typeof localBody?.url === "string" ? localBody.url : null)
							?? getMessageImageUrl(localMessage)
							?? getMessageVideoUrl(localMessage))
						: null;
					if (!cachedUrl || isSignedUrlExpired(cachedUrl)) {
						return message;
					}

					return {
						...message,
						body: { ...(currentBody ?? {}), url: cachedUrl },
					};
				});

				// Persist API messages to the local log.
				const normalizedLastRead = response.lastReadTimestamp
					? (response.lastReadTimestamp < 100_000_000_000 ? response.lastReadTimestamp * 1000 : response.lastReadTimestamp)
					: null;

				void chatLog.appendMessages(
					conversationId,
					responseMessages,
					older ? undefined : normalizedLastRead,
				);
				captureMediaForMessages(responseMessages, conversationId, userId);
				captureAlbumsForMessages(responseMessages, conversationId, (id) =>
					service.getAlbum(id),
				);
				captureReplyPreviewsForMessages(responseMessages, conversationId);

				if (!older) {
					setThreadLastReadTimestamp(normalizedLastRead);
					const mediaIdImageMessages = responseMessages.filter((message) => {
						const imageType = message.chat1Type?.toLowerCase();
						const isImageLike =
							message.type === "Image" ||
							message.type === "ExpiringImage" ||
							imageType === "image" ||
							imageType === "expiring_image";

						if (!isImageLike) return false;
						return !getMessageImageUrl(message as UiMessage);
					});

                    // Images that have no URL (including those whose cached URL was expired
                    // and stripped above) need a fresh signed URL from the API.
					if (mediaIdImageMessages.length > 0) {
						const unresolvedMessageIds = new Set(
							mediaIdImageMessages.map((message) => message.messageId),
						);

						void Promise.allSettled(
							mediaIdImageMessages.map((message) =>
								service.getMessage({
									conversationId,
									messageId: message.messageId,
								}),
							),
						).then((results) => {
							const hydratedMessages: UiMessage[] = [];

							for (let index = 0; index < results.length; index += 1) {
								const result = results[index];
								if (result.status !== "fulfilled") {
									continue;
								}

								const hydrated = result.value as UiMessage;
								const resolvedUrl = getMessageImageUrl(hydrated);
								if (!resolvedUrl) {
									continue;
								}

								// Normalize the URL to body.url so the cache restore logic
								// can reliably find it regardless of which field the API used.
								const normalizedHydrated = (hydrated.body as any)?.url
									? hydrated
									: { ...hydrated, body: { ...(hydrated.body as Record<string, unknown> ?? {}), url: resolvedUrl } };
								hydratedMessages.push(normalizedHydrated);
								unresolvedMessageIds.delete(hydrated.messageId);
							}

							if (hydratedMessages.length > 0) {
								void chatLog.appendMessages(conversationId, hydratedMessages);
								captureMediaForMessages(hydratedMessages, conversationId, userId);

								if (selectedConversationIdRef.current !== conversationId) return;

								setThreadMessages((previous) => {
									const map = new Map<string, UiMessage>();
									for (const message of previous) {
										if (message.conversationId === conversationId) {
											map.set(message.messageId, message);
										}
									}
									for (const message of hydratedMessages) {
										map.set(message.messageId, message);
									}
									return [...map.values()].sort(
										(a, b) => a.timestamp - b.timestamp,
									);
								});
							}

							const fallbackMessages = mediaIdImageMessages.filter((message) =>
								unresolvedMessageIds.has(message.messageId),
							);

							if (fallbackMessages.length === 0) {
								return;
							}

						void service
							.getSharedConversationImages(conversationId)
							.then((sharedImages) => {
								if (selectedConversationIdRef.current !== conversationId) return;

								const sharedImageMap = new Map<number, string>();
								for (const item of sharedImages) {
									if (item.url) sharedImageMap.set(item.mediaId, item.url);
								}

								const resolvedMessages: UiMessage[] = [];
								const expiredMessages: UiMessage[] = [];

								for (const message of fallbackMessages) {
									const mediaId = getMessageMediaId(message as UiMessage);
									if (mediaId == null) continue;
									const url = sharedImageMap.get(mediaId);
									if (url && message.body && typeof message.body === "object") {
										const hydrated = {
											...message,
											body: { ...(message.body as Record<string, unknown>), url },
										} as UiMessage;
										if (getMessageImageUrl(hydrated)) {
											resolvedMessages.push(hydrated);
											continue;
										}
									}
									expiredMessages.push({
										...(message as UiMessage),
										body: {
											...((message.body as Record<string, unknown>) ?? {}),
											_imageExpired: true,
										},
									});
								}

								if (resolvedMessages.length > 0) {
									void chatLog.appendMessages(conversationId, resolvedMessages);
									captureMediaForMessages(resolvedMessages, conversationId, userId);

									if (selectedConversationIdRef.current !== conversationId) return;
									setThreadMessages((previous) => {
										const map = new Map<string, UiMessage>();
										for (const message of previous) {
											if (message.conversationId === conversationId) {
												map.set(message.messageId, message);
											}
										}
										for (const message of resolvedMessages)
											map.set(message.messageId, message);
										return [...map.values()].sort(
											(a, b) => a.timestamp - b.timestamp,
										);
									});
								}

								if (expiredMessages.length > 0 && selectedConversationIdRef.current === conversationId) {
									setThreadMessages((previous) => {
										const map = new Map<string, UiMessage>();
										for (const message of previous) {
											if (message.conversationId === conversationId) {
												map.set(message.messageId, message);
											}
										}
										for (const message of expiredMessages)
											map.set(message.messageId, message);
										return [...map.values()].sort(
											(a, b) => a.timestamp - b.timestamp,
										);
									});
								}
							})
							.catch(() => {
								// Best effort only.
							});
						});
					}

					// Hydrate received video messages that have no URL yet (mediaId may be null).
					const mediaIdVideoMessages = responseMessages.filter((message) => {
						const isVideoLike = message.type === "Video" || message.type === "PrivateVideo" || message.type === "NonExpiringVideo" || (message as UiMessage).chat1Type?.toLowerCase() === "video" || (message as UiMessage).chat1Type?.toLowerCase() === "private_video" || (message as UiMessage).chat1Type?.toLowerCase() === "expiring_video";
						if (!isVideoLike) return false;
						return !getMessageVideoUrl(message as UiMessage);
					});

					if (mediaIdVideoMessages.length > 0) {
						void Promise.allSettled(
							mediaIdVideoMessages.map((message) =>
								service.getMessage({ conversationId, messageId: message.messageId }),
							),
						).then((results) => {
							const updates: UiMessage[] = [];
							for (let i = 0; i < results.length; i++) {
								const result = results[i];
								const original = mediaIdVideoMessages[i] as UiMessage;
								if (result.status === "fulfilled" && getMessageVideoUrl(result.value as UiMessage)) {
									const videoMsg = result.value as UiMessage;
									const resolvedVideoUrl = getMessageVideoUrl(videoMsg);
									// Normalize to body.url for reliable cache restore.
									const normalizedVideo = resolvedVideoUrl && !(videoMsg.body as any)?.url
										? { ...videoMsg, body: { ...(videoMsg.body as Record<string, unknown> ?? {}), url: resolvedVideoUrl } }
										: videoMsg;
									updates.push(normalizedVideo);
								} else {
									updates.push({ ...original, body: { ...(original.body as Record<string, unknown> ?? {}), _videoExpired: true } });
								}
							}
							if (updates.length === 0) return;
                            const nonExpiredUpdates = updates.filter((u) => !(u.body as any)?._videoExpired);
                            void chatLog.appendMessages(conversationId, nonExpiredUpdates);
                            captureMediaForMessages(nonExpiredUpdates, conversationId, userId);
							if (selectedConversationIdRef.current !== conversationId) return;
							setThreadMessages((previous) => {
								const map = new Map<string, UiMessage>();
								for (const message of previous) {
									if (message.conversationId === conversationId) map.set(message.messageId, message);
								}
								for (const message of updates) map.set(message.messageId, message);
								return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
							});
						});
					}
				}

// --- CUSTOM AUTOMATION RULES (HISTORICAL CHAT SCANNER) ---
				const otherParticipant = getOtherParticipant(selectedConversation || { data: { participants: [] } } as any, userId);
				const blockId = otherParticipant?.profileId || (responseMessages[0] && responseMessages[0].senderId);

				if (blockId) {
					// No eager profile fetch here — runAutomationRulesForSender
					// (see its own doc comment) already dedupes per
					// (trigger, sender/messageId) and only fetches a profile
					// itself, lazily, if some enabled rule's conditions actually
					// need one. Prefetching it here unconditionally used to cost
					// a GET /v7/profiles/:id on every poll of an open thread
					// (this runs on every loadThread call, not just genuinely
					// new messages), even though the dedupe below almost always
					// short-circuits before a profile would ever be used.

					// "new_chat" only fires when they messaged us, not when we started
					// the conversation — gate on the most recent message being incoming.
					const lastMessage = responseMessages.reduce<typeof responseMessages[number] | null>(
						(latest, m) => (!latest || m.timestamp > latest.timestamp ? m : latest),
						null,
					);
					const lastMessageIsIncoming =
						lastMessage != null && userId != null && Number(lastMessage.senderId) !== Number(userId);

					if (lastMessageIsIncoming) {
						const lastMessageText =
							(lastMessage?.body as { text?: string } | undefined)?.text ?? null;

						runAutomationRulesForSender(
							String(blockId),
							"new_chat",
							service,
							undefined,
							lastMessageText,
						).then(({ blocked }) => {
							if (blocked) {
								removeProfileFromBrowseCache(String(blockId));
								setThreadMessages([]);
								setThreadConversationId(null);
								if (isDesktop) {
									setSelectedDesktopConversationId(null);
								} else {
									navigate("/chat", { replace: true });
								}
							}
						}).catch(() => {});
					}

					// "message_received" dedupes per messageId rather than per sender,
					// so (unlike "new_chat" above) it's evaluated against every incoming
					// message in this batch, not just the latest — each one only ever
					// runs once across the app's lifetime regardless of how many times
					// this thread gets reopened.
					for (const m of responseMessages) {
						const isIncoming = userId != null && Number(m.senderId) !== Number(userId);
						if (!isIncoming) continue;
						const text = (m.body as { text?: string } | undefined)?.text ?? null;
						runAutomationRulesForSender(
							String(blockId),
							"message_received",
							service,
							undefined,
							text,
							m.messageId,
						).then(({ blocked }) => {
							if (blocked) {
								removeProfileFromBrowseCache(String(blockId));
								setThreadMessages([]);
								setThreadConversationId(null);
								if (isDesktop) {
									setSelectedDesktopConversationId(null);
								} else {
									navigate("/chat", { replace: true });
								}
							}
						}).catch(() => {});
					}
				}
				// --------------------------------------------------

				setThreadMessages((previous) => {
					const previousById = new Map(previous.map((m) => [m.messageId, m] as const));
					const map = new Map<string, UiMessage>();
					if (older) {
						// Older messages prepended; keep existing (including any local-only).
						for (const message of responseMessages)
							map.set(
								message.messageId,
								mergeMessagePreservingUnsendWipe(previousById.get(message.messageId), message),
							);
						for (const message of previous) map.set(message.messageId, message);
					} else {
						// Fresh load or poll: seed from the full local history (chatDb)
						// first, not just whatever's already in memory — otherwise a
						// conversation that just came back from being archived (e.g.
						// unblocked, partner messaged again) would lose everything
						// older than the live API's response, which can be as narrow
						// as that one brand-new message. Hybrid: old local history,
						// then the fresh data layered on top.
						const localById = new Map(
							localMessages
								.filter((m) => m.conversationId === conversationId)
								.map((m) => [m.messageId, m] as const),
						);
						for (const [id, message] of localById) {
							// Flagged local-only since they're no longer on the server
							// (the live response below didn't include them) — anything
							// that *is* still live gets this overwritten further down.
							map.set(id, { ...message, _localOnly: true } as UiMessage);
						}
						for (const message of previous) {
							if (message.conversationId === conversationId) {
								map.set(message.messageId, message);
							}
						}
						for (const message of responseMessages)
							map.set(
								message.messageId,
								mergeMessagePreservingUnsendWipe(
									previousById.get(message.messageId) ?? localById.get(message.messageId),
									message,
								),
							);
					}
					return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
				});

				// Surface messages from the local log that don't appear in this API page
				// (e.g. unsent by the sender, conversation disappeared after a block).
				if (!older && response.messages.length > 0) {
					const windowStart = response.messages[0].timestamp;
					const windowEnd =
						response.messages[response.messages.length - 1].timestamp;
					const apiIds = new Set(response.messages.map((m) => m.messageId));
					void chatLog.readLog(conversationId).then(async (localData) => {
						const localMessages = localData.messages;
						const localCandidates = localMessages.filter(
							(m) =>
								!apiIds.has(m.messageId) &&
								m.timestamp >= windowStart &&
								m.timestamp <= windowEnd,
						);
						if (!localCandidates.length) return;

						// Verify candidates are truly absent from API before surfacing
						// them as local-history messages.
						const checks = await Promise.allSettled(
							localCandidates.map((candidate) =>
								service.getMessage({
									conversationId,
									messageId: candidate.messageId,
								}),
							),
						);

						const localOnly: UiMessage[] = [];
						for (let i = 0; i < localCandidates.length; i += 1) {
							const check = checks[i];
							if (check.status === "fulfilled") {
								continue;
							}
							localOnly.push({
								...localCandidates[i],
								_localOnly: true,
							} as UiMessage);
						}

				if (localOnly.length > 0) {
					if (selectedConversationIdRef.current !== conversationId) return;

					setThreadMessages((previous) => {
						const map = new Map<string, UiMessage>();
						for (const message of previous) {
							if (message.conversationId === conversationId) {
								map.set(message.messageId, message);
							}
						}
						for (const message of localOnly) {
							if (!map.has(message.messageId)) {
								map.set(message.messageId, message);
							}
						}
						return [...map.values()].sort(
							(a, b) => a.timestamp - b.timestamp,
						);
					});
				}
					});
				}

				const firstMessage = response.messages[0];
				setMessagePageKey(firstMessage ? firstMessage.messageId : null);
				messagePageKeyRef.current = firstMessage
					? firstMessage.messageId
					: null;

				if (!older) {
					// Same idea as loadInbox's fallback: don't just take the live
					// API's raw last message for the preview — if it's an empty
					// unsend (or otherwise contentless), that would overwrite a
					// perfectly good preview with a generic placeholder every time
					// this thread is opened. Walk back through the combined local +
					// live history to find the last message that actually has
					// content, but still timestamp the conversation by the true
					// newest message.
					const candidateMessages = new Map<string, Message>();
					for (const message of localMessages) {
						if (message.conversationId === conversationId) {
							candidateMessages.set(message.messageId, message);
						}
					}
					for (const message of responseMessages) {
						candidateMessages.set(message.messageId, message);
					}
					// Synthetic block/unblock markers (see chatDb.insertSystemMessage)
					// are timestamped with whenever this device *noticed*/reconciled
					// the block, not a real chat event — counting them here would jump
					// the conversation straight to the top of the list the moment its
					// thread is opened, even though nothing new was actually said.
					const realCandidates = [...candidateMessages.values()].filter(
						(message) => !SYSTEM_MESSAGE_TYPES.has(message.type ?? ""),
					);
					const sortedCandidates = realCandidates.sort(
						(a, b) => a.timestamp - b.timestamp,
					);
					const newest = sortedCandidates[sortedCandidates.length - 1];
					let bestPreviewMessage: Message | null = null;
					for (let i = sortedCandidates.length - 1; i >= 0; i--) {
						const candidate = sortedCandidates[i];
						if (candidate.body && typeof candidate.body === "object") {
							bestPreviewMessage = candidate;
							break;
						}
					}

					if (newest && bestPreviewMessage) {
						syncConversation((conversation) => ({
							...conversation,
							data: {
								...conversation.data,
								lastActivityTimestamp: newest.timestamp,
								preview: buildPreviewFromMessage(bestPreviewMessage, t),
							},
						}));
					}
				}

				if (!older && selectedConversationUnreadCountRef.current > 0) {
					const newest = response.messages[response.messages.length - 1];
					if (newest?.messageId) {
						void service
							.markRead(conversationId, newest.messageId)
							.then(() => {
								syncConversation((conversation) => {
 								// Hiding read receipts only suppresses telling the *server*
 								// (handled inside service.markRead itself) — our own local
 								// unread state should still clear, otherwise it stays stuck
 								// "unread" forever even though we're actively reading it.
 								const other = getOtherParticipant(conversation, userId);
 								if (other?.profileId) {
 									const pid = String(other.profileId);
 									void clearUnreadCountForProfile(pid).catch(() => {});
 									setChatContactIndexByProfileId((prev) => {
											const existing = prev[pid];
											if (!existing) return prev;
											return {
												...prev,
												[pid]: { ...existing, unreadCount: 0 },
											};
										});
									}
									return {
										...conversation,
										data: { ...conversation.data, unreadCount: 0 },
									};
								});
							})
							.catch(() => {
								// Best effort only.
							});
					}
				}
			} catch (error) {
				const apiError = error as ChatApiError;
				if (apiError?.status === 404 && !archivedConversationsRef.current.has(conversationId)) {
					// The server can no longer produce this conversation at all —
					// archive it locally instead of just showing a load error.
					void archiveConversation(conversationId, "not_found");
					archiveConversationsLocally([conversationId], "not_found");
				}
				if (apiError?.status === 403 && !archivedConversationsRef.current.has(conversationId)) {
					// 403 means this conversation is now inaccessible — either we
					// were blocked while the app was offline, or (less commonly)
					// this is a block we made ourselves from another device/session
					// that hasn't reached this one yet. Archive it the same way a WS
					// delete would, persist to chatDb so the next launch starts it as
					// archived, and disambiguate self vs. other the same way
					// toggleArchiveOnConversationDelete does before leaving a local
					// system message marking when it was detected.
					void archiveConversation(conversationId, "ws_delete");
					archiveConversationsLocally([conversationId], "ws_delete");
					const storedConversation = await chatDb.getConversation(conversationId).catch(() => null);
					// Falls back to parsing the conversationId itself when
					// other_profile_id hasn't been backfilled yet (only ever set
					// from a live /v4/inbox entry's participant list) — otherwise a
					// conversation that's never been through that sync would silently
					// skip this check entirely.
					const otherProfileId =
						storedConversation?.otherProfileId ??
						deriveOtherProfileIdFromConversationId(conversationId, userId);
					// Fetches fresh rather than relying on blockedProfileIdsData's
					// query staleTime — a 403 here is rare enough that a live
					// round trip is cheap, and getting self vs. other right matters
					// more than saving one request for exactly this decision.
					const isSelf =
						consumeSelfBlockAction(conversationId, "block") ||
						(otherProfileId
							? await service
									.getBlockedProfileIds()
									.then((ids) => ids.includes(otherProfileId))
									.catch(() => false)
							: false);
					const claimed = await claimBlockStateTransition(
						conversationId,
						isSelf ? "blocked_by_me" : "blocked_by_other",
					).catch(() => false);
					if (claimed) {
						await chatDb
							.insertSystemMessage(conversationId, isSelf ? "SystemBlockedBySelf" : "SystemBlocked")
							.catch(() => {});
					}
				}
				if (apiError?.status === 404 || apiError?.status === 403 || archivedConversationsRef.current.has(conversationId)) {
					// Recover the same way whether the request literally 404d/403d,
					// or it failed because a block's chat.v1.conversation.delete WS
					// event raced ahead and archived the conversation while a
					// poll/open was already in flight — show cached history instead
					// of an error state (this will keep failing forever, so
					// surfacing "failed to load" would be wrong).
					if (!older && selectedConversationIdRef.current === conversationId) {
						const localData = await chatLog.readLog(conversationId);
						setThreadMessages(localData.messages);
						setThreadLastReadTimestamp(localData.lastReadTimestamp ?? null);
						setThreadError(null);
					}
					return;
				}
				// A real HTTP error response (ChatApiError, handled above) should still
				// surface as an error — only fall back to the local DB when the
				// request never got an HTTP response at all (no connectivity).
				if (!(error instanceof ChatApiError) && !older) {
					try {
						const localData = await chatLog.readLog(conversationId);
						if (
							localData.messages.length > 0 &&
							selectedConversationIdRef.current === conversationId
						) {
							setThreadMessages(localData.messages);
							setThreadLastReadTimestamp(localData.lastReadTimestamp ?? null);
							setThreadError(null);
							return;
						}
					} catch {
						// Fall through to the generic error path below.
					}
				}

				const message =
					error instanceof Error ? error.message : t("chat.errors.load_messages");
				setThreadError(message);
			} finally {
				setIsLoadingThread(false);
				setIsLoadingOlderMessages(false);
				isLoadingOlderMessagesRef.current = false;
			}
		},
		[service, syncConversation, archiveConversationsLocally],
	);

	const mergeIncomingMessages = useCallback((messages: Message[]) => {
		if (!messages.length) {
			return;
		}

		// Persist incoming realtime messages so they survive deletions/blocks.
		const byConv = new Map<string, Message[]>();
		for (const m of messages) {
			const list = byConv.get(m.conversationId) ?? [];
			list.push(m);
			byConv.set(m.conversationId, list);
		}
		for (const [cid, msgs] of byConv) {
			void chatLog.appendMessages(cid, msgs);
			captureMediaForMessages(msgs, cid, userId);
			captureAlbumsForMessages(msgs, cid, (id) => service.getAlbum(id));
			captureReplyPreviewsForMessages(msgs, cid);
		}

		setThreadMessages((previous) => {
			const activeConversationId = selectedConversationIdRef.current;
			if (!activeConversationId) return [];

			const map = new Map<string, UiMessage>();
			// Only preserve messages that belong to the CURRENT active conversation
			for (const message of previous) {
				if (message.conversationId === activeConversationId) {
					map.set(message.messageId, message);
				}
			}

			for (const message of messages) {
				if (message.conversationId === activeConversationId) {
					map.set(
						message.messageId,
						mergeMessagePreservingUnsendWipe(map.get(message.messageId), message),
					);
				}
			}

			return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
		});

		// Hydrate real-time image messages that arrive without a URL.
		const incomingImagesWithoutUrl = messages.filter((m) => {
			const imageType = (m as UiMessage).chat1Type?.toLowerCase();
			const isImageLike = m.type === "Image" || m.type === "ExpiringImage" || imageType === "image" || imageType === "expiring_image";
			if (!isImageLike) return false;
			return !getMessageImageUrl(m as UiMessage);
		});
		if (incomingImagesWithoutUrl.length > 0) {
			void Promise.allSettled(
				incomingImagesWithoutUrl.map((m) =>
					service.getMessage({ conversationId: m.conversationId, messageId: m.messageId }),
				),
			).then((results) => {
				const updates: UiMessage[] = [];
				for (let i = 0; i < results.length; i++) {
					const result = results[i];
					const original = incomingImagesWithoutUrl[i] as UiMessage;
					if (result.status === "fulfilled" && getMessageImageUrl(result.value as UiMessage)) {
						const imageMsg = result.value as UiMessage;
						const resolvedImageUrl = getMessageImageUrl(imageMsg);
						const normalizedImage = resolvedImageUrl && !(imageMsg.body as any)?.url
							? { ...imageMsg, body: { ...(imageMsg.body as Record<string, unknown> ?? {}), url: resolvedImageUrl } }
							: imageMsg;
						updates.push(normalizedImage);
					} else {
						updates.push({ ...original, body: { ...(original.body as Record<string, unknown> ?? {}), _imageExpired: true } });
					}
				}
				if (!updates.length) return;
				const nonExpiredImageUpdates = updates.filter((u) => !(u.body as any)?._imageExpired);
				void chatLog.appendMessages(
					incomingImagesWithoutUrl[0].conversationId,
					nonExpiredImageUpdates,
				);
				captureMediaForMessages(
					nonExpiredImageUpdates,
					incomingImagesWithoutUrl[0].conversationId,
					userId,
				);
				setThreadMessages((prev) => {
					const map = new Map<string, UiMessage>();
					for (const m of prev) map.set(m.messageId, m);
					for (const m of updates) map.set(m.messageId, m);
					return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
				});
			});
		}

		// Hydrate real-time video messages that arrive without a URL.
		const incomingVideosWithoutUrl = messages.filter((m) => {
			const isVideoLike = m.type === "Video" || m.type === "NonExpiringVideo" || (m as UiMessage).chat1Type?.toLowerCase() === "video" || (m as UiMessage).chat1Type?.toLowerCase() === "private_video" || (m as UiMessage).chat1Type?.toLowerCase() === "expiring_video";
			if (!isVideoLike) return false;
			return !getMessageVideoUrl(m as UiMessage);
		});
		if (incomingVideosWithoutUrl.length > 0) {
			void Promise.allSettled(
				incomingVideosWithoutUrl.map((m) =>
					service.getMessage({ conversationId: m.conversationId, messageId: m.messageId }),
				),
			).then((results) => {
				const updates: UiMessage[] = [];
				for (let i = 0; i < results.length; i++) {
					const result = results[i];
					const original = incomingVideosWithoutUrl[i] as UiMessage;
					if (result.status === "fulfilled" && getMessageVideoUrl(result.value as UiMessage)) {
						const videoMsg = result.value as UiMessage;
						const resolvedVideoUrl = getMessageVideoUrl(videoMsg);
						const normalizedVideo = resolvedVideoUrl && !(videoMsg.body as any)?.url
							? { ...videoMsg, body: { ...(videoMsg.body as Record<string, unknown> ?? {}), url: resolvedVideoUrl } }
							: videoMsg;
						updates.push(normalizedVideo);
					} else {
						updates.push({ ...original, body: { ...(original.body as Record<string, unknown> ?? {}), _videoExpired: true } });
					}
				}
				if (!updates.length) return;
				const nonExpiredVideoUpdates = updates.filter((u) => !(u.body as any)?._videoExpired);
				if (nonExpiredVideoUpdates.length > 0) {
					void chatLog.appendMessages(incomingVideosWithoutUrl[0].conversationId, nonExpiredVideoUpdates);
					captureMediaForMessages(
						nonExpiredVideoUpdates,
						incomingVideosWithoutUrl[0].conversationId,
						userId,
					);
				}
				setThreadMessages((prev) => {
					const map = new Map<string, UiMessage>();
					for (const m of prev) map.set(m.messageId, m);
					for (const m of updates) map.set(m.messageId, m);
					return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
				});
			});
		}

		const byConversation = new Map<string, Message>();
		let hasUnknownConversation = false;
		for (const message of messages) {
			const previous = byConversation.get(message.conversationId);
			if (
				!previous ||
				previous.timestamp < message.timestamp ||
				(previous.timestamp === message.timestamp &&
					previous.messageId < message.messageId)
			) {
				byConversation.set(message.conversationId, message);
			}

			if (!conversationsRef.current.some(c => c.data.conversationId === message.conversationId)) {
				hasUnknownConversation = true;
			}
		}

		if (hasUnknownConversation) {
			void loadInbox({ page: 1, replace: true, silent: true });
		}

		// If a message arrives for an archived conversation, unarchive it immediately
		// and insert a SystemUnblocked marker if it was archived due to a block.
		// Same guard as loadInbox: for a block-related archive (either direction),
		// a message already in flight the instant the block happened (on our side
		// or the other party's) can still land right after, which would otherwise
		// look identical to a genuine unblock — cross-check those against the
		// current block_state first (covers both directions; a blocked-profile-
		// ids check only covers the "we blocked them" one).
		const incomingConversationIds = [...new Set(messages.map((m) => m.conversationId))];
		const incomingCandidateIds = incomingConversationIds.filter((cid) =>
			archivedConversationsRef.current.has(cid),
		);
		void (async () => {
			const reappearedArchivedIds = (
				await Promise.all(
					incomingCandidateIds.map(async (cid) => {
						const info = archivedConversationsRef.current.get(cid);
						if (info?.reason !== "ws_delete") {
							return cid;
						}
						const stored = await chatDb.getConversation(cid).catch(() => null);
						return stored?.blockState == null ? cid : null;
					}),
				)
			).filter((cid): cid is string => cid !== null);
			if (reappearedArchivedIds.length === 0) {
				return;
			}
			for (const cid of reappearedArchivedIds) {
				void unarchiveConversation(cid);
			}
			const blockArchivedIds = reappearedArchivedIds.filter(
				(cid) => archivedConversationsRef.current.get(cid)?.reason === "ws_delete",
			);
			if (blockArchivedIds.length > 0) {
				void Promise.all(
					blockArchivedIds.map(async (cid) => {
						const isSelf = consumeSelfBlockAction(cid, "unblock");
						const claimed = await claimBlockStateTransition(cid, null).catch(() => false);
						if (!claimed) return null;
						return chatDb
							.insertSystemMessage(cid, isSelf ? "SystemUnblockedBySelf" : "SystemUnblocked")
							.catch(() => null);
					}),
				).then((inserted) => {
					const valid = inserted.filter((m): m is Message => m !== null);
					if (valid.length > 0) {
						window.dispatchEvent(
							new CustomEvent<Message[]>(CHAT_SYSTEM_MESSAGE_EVENT, { detail: valid }),
						);
					}
				});
			}
			setArchivedConversations((previous) => {
				const next = new Map(previous);
				for (const cid of reappearedArchivedIds) {
					next.delete(cid);
				}
				return next;
			});
		})();

		// Update threadLastReadTimestamp if we receive a message from the other person
		// in the active chat, because it implies they've read our previous messages.
		const activeConversationId = selectedConversationIdRef.current;
		if (activeConversationId) {
			const otherPersonMessages = messages.filter(
				(m) =>
					m.conversationId === activeConversationId &&
					userId != null &&
					Number(m.senderId) !== Number(userId),
			);
			if (otherPersonMessages.length > 0) {
				const maxTs = Math.max(...otherPersonMessages.map((m) => m.timestamp));
				setThreadLastReadTimestamp((prev) => Math.max(prev ?? 0, maxTs));
			}
		}

		// Update unread markers and local index for messages not in the active chat
		for (const m of messages) {
			if (
				userId != null &&
				Number(m.senderId) !== Number(userId) &&
				m.conversationId !== activeConversationId
			) {
				conversationsWithPendingUnreadRef.current.add(m.conversationId);

				const pid = String(m.senderId);
				setChatContactIndexByProfileId((prev) => {
					const existing = prev[pid];
					return {
						...prev,
						[pid]: {
							profileId: pid,
							conversationId: m.conversationId,
							lastMessageTimestamp: m.timestamp,
							unreadCount: (existing?.unreadCount ?? 0) + 1,
							hasChatted: true,
							updatedAt: Date.now(),
						},
					};
				});
			}
		}

		setConversations((previous) => {
			const updated = previous.map((conversation) => {
				const latestMessage = byConversation.get(
					conversation.data.conversationId,
				);
				if (!latestMessage) {
					return conversation;
				}

				const text = getMessagePreviewLabel(latestMessage, t);
				const isMine = userId != null && Number(latestMessage.senderId) === Number(userId);
				const isActive = selectedConversationIdRef.current === conversation.data.conversationId;

				if (isActive && !isMine) {
 				void service
 					.markRead(conversation.data.conversationId, latestMessage.messageId)
 					.catch(() => {});

 				// Hiding read receipts only suppresses telling the *server*
 				// (handled inside service.markRead itself) — our own local
 				// unread state should still clear, otherwise it stays stuck
 				// "unread" forever even though we're actively reading it.
 				const other = getOtherParticipant(conversation, userId);
 				if (other?.profileId) {
 					const pid = String(other.profileId);
 					void clearUnreadCountForProfile(pid).catch(() => {});
 					setChatContactIndexByProfileId((prev) => {
 						const existing = prev[pid];
 						if (!existing) return prev;
 						return {
 							...prev,
 							[pid]: { ...existing, unreadCount: 0 },
 						};
 					});
 				}
 			}

				return {
					...conversation,
					data: {
						...conversation.data,
						lastActivityTimestamp: latestMessage.timestamp,
						unreadCount: (isMine || isActive) ? conversation.data.unreadCount : (conversation.data.unreadCount + 1),
						preview: {
							conversationId: {
								value: latestMessage.conversationId,
							},
							messageId: latestMessage.messageId,
							senderId: latestMessage.senderId,
							type: latestMessage.type,
							chat1Type: latestMessage.chat1Type ?? "text",
							text,
							albumId: null,
							imageHash: null,
						},
					},
				};
			});

			// Re-sort so the conversation with the newest message moves to the top
			return [...updated].sort((a, b) => {
				if (a.data.pinned && !b.data.pinned) return -1;
				if (b.data.pinned && !a.data.pinned) return 1;
				return (b.data.lastActivityTimestamp ?? 0) - (a.data.lastActivityTimestamp ?? 0);
			});
		});
	}, [loadInbox, userId, t]);

	const applyRealtimeEnvelope = useCallback(
		(envelope: RealtimeEnvelope) => {
			appLog.debug(`[ChatPage] applyRealtimeEnvelope type=${envelope.type} full=${JSON.stringify(envelope)}`);

			// chat.v1.conversation.delete (blocked/deleted, or unblock — nothing
			// in the payload to tell which) is handled once, authoritatively, by
			// ChatRealtimeBridge's toggleArchiveOnConversationDelete (DB state +
			// dedup + self/other attribution). That dispatches
			// CHAT_ARCHIVE_STATE_EVENT / CHAT_SYSTEM_MESSAGE_EVENT, which this
			// page already listens for below (onArchiveStateChange /
			// onSystemMessage) — handling the raw envelope here too raced the
			// bridge's own dedup and could flip a conversation's archived state
			// right back based on a stale `archivedConversationsRef` read.

			if (envelope.type === "chat.v1.conversation_read") {
				const record = envelope.payload as Record<string, unknown> | undefined;
				if (record) {
					const cid = record.conversationId as string | undefined;
					const ts = Number(record.timestamp); // already milliseconds per API spec
					const senderId = Number(record.profileId);

					if (cid && !Number.isNaN(ts) && !Number.isNaN(senderId)) {
						if (userId != null && senderId !== userId) {
							if (cid === selectedConversationIdRef.current) {
								setThreadLastReadTimestamp(ts);
							}
							void chatLog.appendMessages(cid, [], ts);
						}
					}
				}
				return;
			}

			const candidates: Message[] = [];

			// Try envelope.payload directly as a Message (chat.v1.message_sent payload IS the message)
			const directPayload = messageSchema.safeParse(envelope.payload);
			if (directPayload.success) {
				candidates.push(directPayload.data);
			}

			const payloads: unknown[] = [envelope.payload, envelope.data, envelope];
			for (const payload of payloads) {
				if (!payload || typeof payload !== "object") {
					continue;
				}

				const record = payload as Record<string, unknown>;
				if (record.message) {
					const parsed = messageSchema.safeParse(record.message);
					if (parsed.success) {
						candidates.push(parsed.data);
					}
				}

				if (Array.isArray(record.messages)) {
					for (const candidate of record.messages) {
						const parsed = messageSchema.safeParse(candidate);
						if (parsed.success) {
							candidates.push(parsed.data);
						}
					}
				}
			}

			// Deduplicate by messageId before merging
			const seen = new Set<string>();
			const unique = candidates.filter((m) => {
				if (seen.has(m.messageId)) return false;
				seen.add(m.messageId);
				return true;
			});

			if (unique.length > 0) {
				mergeIncomingMessages(unique);
			}
		},
		[mergeIncomingMessages, userId, archiveConversationsLocally],
	);

	const handleRealtimeEvent = useCallback(
		(envelope: RealtimeEnvelope) => {
			// appLog.debug("[ChatPage] RECEIVED EVENT FROM BRIDGE", { type: envelope.type });
			applyRealtimeEnvelope(envelope);
		},
		[applyRealtimeEnvelope],
	);

	const handleRealtimeStatus = useCallback((status: RealtimeStatus) => {
		// appLog.debug("[chat-ws:status]", status);
		setRealtimeStatus(status);
	}, []);

	const scrollThreadToBottom = useCallback((attempts = 10) => {
		const container = threadScrollContainerRef.current;
		if (container) {
			container.scrollTop = container.scrollHeight;
		} else {
			// No scroll container yet (still mounting) — scrollIntoView is a
			// reasonable fallback here. Once the container exists, prefer
			// scrollTop = scrollHeight exclusively: threadBottomRef sits right
			// after the messages, before the scroll container's own trailing
			// paddingBottom (composer clearance), so scrollIntoView'ing it
			// stops short of that padding and undoes the line above, landing
			// the view a composer's-height short of the true bottom.
			threadBottomRef.current?.scrollIntoView({ block: "end" });
		}

		if (attempts <= 1) {
			return;
		}

		window.setTimeout(() => {
			scrollThreadToBottom(attempts - 1);
		}, 50);
	}, []);

	const handleThreadScroll = useCallback(() => {
		const container = threadScrollContainerRef.current;
		if (
			!container ||
			isLoadingOlderMessagesRef.current ||
			!messagePageKeyRef.current
		) {
			return;
		}

		if (container.scrollTop <= 150 && selectedConversationIdRef.current) {
			void loadThread({
				conversationId: selectedConversationIdRef.current,
				older: true,
			});
		}
	}, [loadThread]);

	// Gated on settingsReady for the same reason as the archived-conversations
	// hydration effect above: right after login, setActiveChatDbUser is still
	// switching chatDb from the legacy/previous account's file to this
	// account's own one. Firing loadInbox (which persists every entry via
	// chatDb.upsertConversation) before that finishes can grab the pool that's
	// about to be closed mid-write — unlike sqlitePoolGuard's "stale account we
	// already left" case, this data is for the account we just logged into, so
	// a dropped write here is real loss, not a harmless discard.
	useEffect(() => {
		if (!settingsReady) {
			return;
		}
		void loadInbox({ page: 1, replace: true });
	}, [loadInbox, activeInboxFilters, settingsReady]);

	// Re-verify the blocked-profile list fresh from the server every time the
	// inbox screen opens, instead of trusting whatever's cached for up to its
	// 10-minute staleTime — a block/unblock made on another device (while this
	// device's WS was disconnected, or missed here for any other reason)
	// would otherwise stay unreconciled until that staleTime happens to
	// elapse. The refetched data flows into ChatRealtimeBridge's own
	// reconcileBlockStateWithBlockedList effect (same "blocked-profile-ids"
	// query key), which archives/unarchives every conversation to match.
	useEffect(() => {
		if (!settingsReady) {
			return;
		}
		void refetchBlockedProfileIds();
	}, [settingsReady, refetchBlockedProfileIds]);

	useEffect(() => {
		if (!isDesktop) {
			setSelectedDesktopConversationId(null);
		}
	}, [isDesktop]);

	useEffect(() => {
		const onEvent = (event: Event) => {
			const envelope = (event as CustomEvent<RealtimeEnvelope>).detail;
			if (envelope) handleRealtimeEvent(envelope);
		};
		const onSystemMessage = (event: Event) => {
			const messages = (event as CustomEvent<Message[]>).detail;
			if (!messages?.length) return;
			const activeConversationId = selectedConversationIdRef.current;
			const relevant = messages.filter((m) => m.conversationId === activeConversationId);
			if (relevant.length === 0) return;
			setThreadMessages((previous) => {
				const map = new Map<string, UiMessage>();
				for (const m of previous) map.set(m.messageId, m);
				for (const m of relevant) map.set(m.messageId, m);
				return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
			});
		};
		const onStatus = (event: Event) => {
			const status = (event as CustomEvent<RealtimeStatus>).detail;
			if (status) handleRealtimeStatus(status);
		};
		const onTyping = (event: Event) => {
			const detail = (event as CustomEvent<TypingStatusDetail>).detail;
			if (!detail) return;
			const { conversationId, status } = detail;
			if (status === "Typing") {
				setTypingConversationIds((prev) => {
					const next = new Set(prev);
					next.add(conversationId);
					return next;
				});
				// Auto-expire after 8s in case Cleared never arrives
				const existing = typingExpireTimers.current.get(conversationId);
				if (existing) clearTimeout(existing);
				const timer = setTimeout(() => {
					setTypingConversationIds((prev) => {
						const next = new Set(prev);
						next.delete(conversationId);
						return next;
					});
					typingExpireTimers.current.delete(conversationId);
				}, 8000);
				typingExpireTimers.current.set(conversationId, timer);
			} else {
				setTypingConversationIds((prev) => {
					if (!prev.has(conversationId)) return prev;
					const next = new Set(prev);
					next.delete(conversationId);
					return next;
				});
				const existing = typingExpireTimers.current.get(conversationId);
				if (existing) {
					clearTimeout(existing);
					typingExpireTimers.current.delete(conversationId);
				}
			}
		};
		// A conversation's archived flag changed somewhere that doesn't have
		// this page's in-memory state (e.g. unblocking from Settings > Blocked
		// or from the grid) — mirror it here so the chat list/thread reflect
		// it immediately instead of only after the next inbox reload.
		const onArchiveStateChange = (event: Event) => {
			const detail = (event as CustomEvent<ChatArchiveStateChangeDetail>).detail;
			if (!detail) return;
			if (detail.archived) {
				archiveConversationsLocally([detail.conversationId], detail.reason);
			} else {
				// Resolve the entry before removing it from archivedConversations
				// below, and add it straight into `conversations` — otherwise an
				// unarchived conversation the live /v4/inbox hasn't caught up to
				// yet would vanish entirely (neither archived nor live) until the
				// server happens to return it.
				const entryToRestore = archivedConversationsRef.current.get(
					detail.conversationId,
				)?.entry;
				setArchivedConversations((previous) => {
					if (!previous.has(detail.conversationId)) return previous;
					const next = new Map(previous);
					next.delete(detail.conversationId);
					return next;
				});
				if (entryToRestore) {
					setConversations((previous) => {
						if (previous.some((c) => c.data.conversationId === detail.conversationId)) {
							return previous;
						}
						const next = [...previous, entryToRestore];
						return next.sort((a, b) => {
							if (a.data.pinned && !b.data.pinned) return -1;
							if (b.data.pinned && !a.data.pinned) return 1;
							return (
								(b.data.lastActivityTimestamp ?? 0) - (a.data.lastActivityTimestamp ?? 0)
							);
						});
					});
				}
			}
		};
		window.addEventListener(CHAT_REALTIME_EVENT, onEvent as EventListener);
		window.addEventListener(CHAT_REALTIME_STATUS, onStatus as EventListener);
		window.addEventListener(TYPING_STATUS_EVENT, onTyping as EventListener);
		window.addEventListener(CHAT_SYSTEM_MESSAGE_EVENT, onSystemMessage as EventListener);
		window.addEventListener(CHAT_ARCHIVE_STATE_EVENT, onArchiveStateChange as EventListener);
		return () => {
			window.removeEventListener(CHAT_REALTIME_EVENT, onEvent as EventListener);
			window.removeEventListener(
				CHAT_REALTIME_STATUS,
				onStatus as EventListener,
			);
			window.removeEventListener(TYPING_STATUS_EVENT, onTyping as EventListener);
			window.removeEventListener(
				CHAT_SYSTEM_MESSAGE_EVENT,
				onSystemMessage as EventListener,
			);
			window.removeEventListener(
				CHAT_ARCHIVE_STATE_EVENT,
				onArchiveStateChange as EventListener,
			);
		};
	}, [handleRealtimeEvent, handleRealtimeStatus, archiveConversationsLocally]);

	// Send typing status to API when draft changes
	const selectedConversationIdForTyping = selectedConversation?.data.conversationId ?? null;
	useEffect(() => {
		if (!selectedConversationIdForTyping) return;
		if (isReadReceiptsHidden(selectedConversationIdForTyping)) return;
		const cid = selectedConversationIdForTyping;

		if (typingDebounceTimer.current) {
			clearTimeout(typingDebounceTimer.current);
			typingDebounceTimer.current = null;
		}

		if (draft.length > 0) {
			typingDebounceTimer.current = setTimeout(() => {
				if (!isSendingTypingRef.current) {
					isSendingTypingRef.current = true;
					service.sendTypingStatus(cid, "Typing").finally(() => {
						isSendingTypingRef.current = false;
					});
				}
			}, 300);
		} else {
			service.sendTypingStatus(cid, "Cleared").catch(() => {});
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [draft, selectedConversationIdForTyping]);

	useEffect(() => {
		if (realtimeStatus === "connected") {
			return;
		}

		const baseIntervalMs =
			realtimeStatus === "reconnecting" || realtimeStatus === "error"
					? 12_000
					: 20_000;
		const intervalMs = document.hidden
			? Math.max(baseIntervalMs * 2, 30_000)
			: baseIntervalMs;

		const intervalId = window.setInterval(() => {
			void loadInbox({ page: 1, replace: true, silent: true });
		}, intervalMs);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [loadInbox, realtimeStatus]);

	// The realtime socket can report "connected" while still silently dropping
	// individual events (e.g. chat.v1.conversation_read), so read-receipt status
	// for the open chat can go stale even when realtimeStatus looks healthy.
	// Poll the active thread on a short interval, independent of connection
	// status, as a fallback so "read"/"unread" catches up regardless.
	useEffect(() => {
		// Archived conversations are gone server-side and will 404 forever —
		// polling them for read receipts is pointless and just spams failed
		// requests every cycle.
		if (!selectedConversationId || archivedConversations.has(selectedConversationId)) {
			return;
		}

		// If the other person sent the last message, our own messages before
		// it are necessarily already read (they had to read up to that point
		// to reply) — there's nothing left to confirm. Only keep polling
		// while we're the one waiting to see if our own last message gets
		// read; otherwise this would just send a request every cycle for no
		// reason.
		const lastMessage = threadMessages[threadMessages.length - 1];
		const lastMessageIsMine =
			lastMessage != null &&
			userId != null &&
			Number(lastMessage.senderId) === Number(userId);
		if (!lastMessageIsMine) {
			return;
		}

		const intervalMs = document.hidden ? 20_000 : 10_000;

		const intervalId = window.setInterval(() => {
			void loadThread({
				conversationId: selectedConversationId,
				older: false,
				silent: true,
			});
		}, intervalMs);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [loadThread, selectedConversationId, archivedConversations, threadMessages, userId]);

	// Periodically re-check album share status for messages in the open thread
	// so a revoked share triggers the "no longer shared" badge without the user
	// having to reload the thread. Uses refs so the interval itself is stable
	// and doesn't restart on every message change.
	useEffect(() => {
		if (!selectedConversationId) return;

		const intervalId = window.setInterval(() => {
			const cid = selectedConversationIdRef.current;
			if (!cid) return;
			const albumMessages = threadMessagesRef.current.filter(
				(m) => m.type === "Album" || m.type === "ExpiringAlbum" || m.type === "ExpiringAlbumV2",
			);
			if (albumMessages.length === 0) return;
			captureAlbumsForMessages(albumMessages, cid, (id) => service.getAlbum(id));
		}, document.hidden ? 60_000 : 30_000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [selectedConversationId, service]);

	useEffect(() => {
		if (!selectedConversationId) {
			setThreadConversationId(null);
			setThreadMessages([]);
			setThreadLastReadTimestamp(null);
			setThreadError(null);
			setReplyTargetMessageId(null);
			lastLoadedConversationIdRef.current = null;
			setIsDrawerOpen(false);
			setDrawerMedia([]);
			setPendingAttachmentFile(null);
			return;
		}

		setThreadLastReadTimestamp(null);
		void loadThread({ conversationId: selectedConversationId, older: false });
	}, [loadThread, selectedConversationId]);

	useEffect(() => {
		if (!replyTargetMessageId) {
			return;
		}
		const hasTarget = threadMessages.some(
			(message) => message.messageId === replyTargetMessageId,
		);
		if (!hasTarget) {
			setReplyTargetMessageId(null);
		}
	}, [replyTargetMessageId, threadMessages]);

	useEffect(() => {
		if (!threadMessages.length) {
			lastMessageIdRef.current = null;
			return;
		}

		const lastMessage = threadMessages[threadMessages.length - 1];
		const isNewMessageArrival = lastMessageIdRef.current !== lastMessage.messageId;
		lastMessageIdRef.current = lastMessage.messageId;

		if (preserveThreadScrollRef.current) {
			const container = threadScrollContainerRef.current;
			const snapshot = olderLoadSnapshotRef.current;
			if (container && snapshot) {
				const heightDelta = container.scrollHeight - snapshot.scrollHeight;
				container.scrollTop = snapshot.scrollTop + heightDelta;
			}
			olderLoadSnapshotRef.current = null;
			preserveThreadScrollRef.current = false;
			return;
		}

		const container = threadScrollContainerRef.current;
		const isNewConversation =
			lastLoadedConversationIdRef.current !== selectedConversationId;

		const isNearBottom = container
			? container.scrollHeight - container.scrollTop - container.clientHeight < 250
			: true;

		const iSentLastMessage = userId != null && Number(lastMessage.senderId) === Number(userId);

		// Always scroll on a new conversation. For a new message at the end,
		// only force it if it's mine (I just hit send — I should always see
		// it, even mid-navigation like the targetProfileId -> real
		// conversationId swap right after sending a brand-new chat's first
		// message, which can otherwise eat the "new" signal above before the
		// real thread lands) or if I was already near the bottom (so an
		// incoming message from the other side doesn't yank someone reading
		// older history back down).
		if (isNewConversation || (isNewMessageArrival && (iSentLastMessage || isNearBottom))) {
			scrollThreadToBottom();
		}

		lastLoadedConversationIdRef.current = selectedConversationId;
	}, [threadMessages, selectedConversationId, scrollThreadToBottom, userId]);

	useEffect(() => {
		indexConversations(conversations);
	}, [conversations]);

	useEffect(() => {
		indexMessages(threadMessages);
	}, [threadMessages]);

	useEffect(() => {
		if (!pendingMessageScrollId) {
			return;
		}

		const target = messageElementRefs.current.get(pendingMessageScrollId);
		if (!target) {
			return;
		}

		target.scrollIntoView({ block: "center", behavior: "smooth" });
		setPendingMessageScrollId(null);
	}, [pendingMessageScrollId, threadMessages]);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setNowTimestamp(Date.now());
		}, 30_000);

		return () => {
			window.clearInterval(intervalId);
		};
	}, []);

	useEffect(() => {
		setActiveThreadSearchIndex(0);
	}, [
		selectedThreadMessageMatches.length,
		selectedConversationId,
	]);

	const realtimeStatusMeta = useMemo(() => {
		switch (realtimeStatus) {
			case "connected":
				return {
					label: t("chat.realtime.connected"),
					symbol: "✓",
					className:
						"border-emerald-500/40 bg-emerald-500/15 text-emerald-700",
				};
			case "disconnected":
			case "error":
				return {
					label:
						realtimeStatus === "error"
							? t("chat.realtime.error")
							: t("chat.realtime.offline"),
					symbol: "•",
					className: "border-red-500/40 bg-red-500/15 text-red-700",
				};
			default:
				return {
					label:
						realtimeStatus === "reconnecting"
							? t("chat.realtime.reconnecting")
							: realtimeStatus === "connecting"
								? t("chat.realtime.connecting")
								: realtimeStatus === "polling"
									? t("chat.realtime.polling")
									: t("chat.realtime.idle"),
					symbol: "•",
					className:
						"border-amber-500/40 bg-amber-500/15 text-amber-700",
				};
		}
	}, [realtimeStatus, t]);

	const selectedActionMessage = useMemo(() => {
		if (!openMessageActionId) {
			return null;
		}
		return (
			threadMessages.find((message) => message.messageId === openMessageActionId) ??
			null
		);
	}, [openMessageActionId, threadMessages]);

	const selectedActionMessageMine =
		selectedActionMessage != null &&
		userId != null &&
		Number(selectedActionMessage.senderId) === Number(userId);

	const replyTargetMessage = useMemo(() => {
		if (!replyTargetMessageId) {
			return null;
		}
		return (
			threadMessages.find((message) => message.messageId === replyTargetMessageId) ??
			null
		);
	}, [replyTargetMessageId, threadMessages]);

	const archivedConversationIds = useMemo(
		() => new Set(archivedConversations.keys()),
		[archivedConversations],
	);

	const filteredConversations = useMemo(() => {
		// The normal view shows everything, including archived chats, mixed
		// in by recency. The "Archived" pill, when active, hides them instead
		// of narrowing down to only them — same idea as hidePinned hiding
		// pinned chats rather than the reverse. Archived entries are sourced
		// from archivedConversations directly (never from `conversations`,
		// which only ever mirrors live /v4/inbox data and so can never
		// contain something that's by definition gone from there).
		const liveConversations = conversations.filter(
			(c) => !archivedConversations.has(c.data.conversationId),
		);

		let result: ConversationEntry[];
		if (hideArchived) {
			result = liveConversations;
		} else {
			const archivedEntries = [...archivedConversations.values()].map(
				(info) => info.entry,
			);
			// Sort archived entries back into their natural position (by
			// recency) instead of always tacking them on at the very end,
			// where a single archived chat among many active ones would be
			// easy to miss without scrolling.
			result = [...liveConversations, ...archivedEntries].sort((a, b) => {
				if (a.data.pinned && !b.data.pinned) return -1;
				if (b.data.pinned && !a.data.pinned) return 1;
				return (b.data.lastActivityTimestamp ?? 0) - (a.data.lastActivityTimestamp ?? 0);
			});
		}

		if (activeInboxFilters.favoritesOnly) {
			result = result.filter((c) => c.data.favorite);
		}
		if (hidePinned) {
			result = result.filter((c) => !c.data.pinned);
		}
		return result;
	}, [
		conversations,
		hidePinned,
		activeInboxFilters.favoritesOnly,
		archivedConversations,
		hideArchived,
	]);

	// Scroll memory: save position on scroll (re-attaches when list mounts/unmounts)
	useEffect(() => {
		const container = inboxListRef.current;
		if (!container) return;
		const handleScroll = () => {
			sessionStorage.setItem("chat-inbox-scroll", JSON.stringify({
				top: container.scrollTop,
				timestamp: Date.now(),
			}));
		};
		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filteredConversations.length]);

	// Scroll memory: restore position once on first load
	useLayoutEffect(() => {
		if (filteredConversations.length === 0 || isLoadingInbox || hasRestoredInboxScroll || !inboxListRef.current) return;
		const storageKey = "chat-inbox-scroll";
		if (maxActivityTimestamp > initialLastSeenInbox.current) {
			sessionStorage.removeItem(storageKey);
			inboxListRef.current.scrollTop = 0;
			setHasRestoredInboxScroll(true);
			return;
		}
		const saved = sessionStorage.getItem(storageKey);
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				if (parsed && typeof parsed === "object" && "top" in parsed) {
					const { top, timestamp } = parsed as { top: number; timestamp: number };
					if (Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS) {
						inboxListRef.current.scrollTop = top;
					} else {
						sessionStorage.removeItem(storageKey);
					}
				} else {
					sessionStorage.removeItem(storageKey);
				}
			} catch {
				sessionStorage.removeItem(storageKey);
			}
		}
		setHasRestoredInboxScroll(true);
	}, [filteredConversations.length, isLoadingInbox, hasRestoredInboxScroll, maxActivityTimestamp]);

	const handleSelectConversation = (conversation: ConversationEntry) => {
		const nextId = conversation.data.conversationId;
		if (targetProfileId) {
			const nextParams = new URLSearchParams(searchParams);
			nextParams.delete("targetProfileId");
			setSearchParams(nextParams, { replace: true });
		}
		if (isDesktop) {
			setSelectedDesktopConversationId(nextId);
			return;
		}
		const nextParams = new URLSearchParams();
		if (chatReturnTo) {
			nextParams.set("returnTo", chatReturnTo);
		}
		navigate(
			nextParams.size > 0
				? `/chat/${encodeURIComponent(nextId)}?${nextParams.toString()}`
				: `/chat/${encodeURIComponent(nextId)}`,
		);
	};

	const openConversationById = useCallback(
		(conversationId: string) => {
			if (targetProfileId) {
				const nextParams = new URLSearchParams(searchParams);
				nextParams.delete("targetProfileId");
				setSearchParams(nextParams, { replace: true });
			}

			if (isDesktop) {
				setSelectedDesktopConversationId(conversationId);
				return;
			}
			const nextParams = new URLSearchParams();
			if (chatReturnTo) {
				nextParams.set("returnTo", chatReturnTo);
			}
			navigate(
				nextParams.size > 0
					? `/chat/${encodeURIComponent(conversationId)}?${nextParams.toString()}`
					: `/chat/${encodeURIComponent(conversationId)}`,
			);
		},
		[
			chatReturnTo,
			isDesktop,
			navigate,
			searchParams,
			setSearchParams,
			targetProfileId,
		],
	);

	const getProfileReturnToChatPath = useCallback(
		(profileId: number) => {
			if (selectedConversationId) {
				return `/chat/${encodeURIComponent(selectedConversationId)}`;
			}

			const nextParams = new URLSearchParams();
			nextParams.set("targetProfileId", String(profileId));
			return `/chat?${nextParams.toString()}`;
		},
		[selectedConversationId],
	);

	useEffect(() => {
		if (!targetProfileId) {
			return;
		}

		const existingConversation = conversations.find((conversation) =>
			conversation.data.participants.some(
				(participant) => participant.profileId === targetProfileId,
			),
		);

		if (existingConversation) {
			if (selectedConversationId !== existingConversation.data.conversationId) {
				openConversationById(existingConversation.data.conversationId);
			}
			return;
		}

		// Could be an archived conversation — those are never in `conversations`
		// (see filteredConversations), so check archivedConversations directly
		// before falling back to a fresh DB lookup.
		const existingArchived = [...archivedConversations.values()].find((info) =>
			info.entry.data.participants.some(
				(participant) => participant.profileId === targetProfileId,
			),
		);
		if (existingArchived) {
			if (selectedConversationId !== existingArchived.entry.data.conversationId) {
				openConversationById(existingArchived.entry.data.conversationId);
			}
			return;
		}

		// Not found in the currently-loaded (paginated) inbox state — fall back
		// to the local DB, which remembers every conversation ever seen
		// regardless of inbox pagination. Fixes opening a chat from a profile
		// landing on an empty "new conversation" screen when a real one exists.
		let cancelled = false;
		void chatDb.findConversationByProfileId(String(targetProfileId)).then((stored) => {
			if (cancelled || !stored) {
				return;
			}
			if (stored.archived) {
				setArchivedConversations((previous) => {
					const next = new Map(previous);
					next.set(stored.conversationId, {
						reason: stored.archivedReason ?? "not_found",
						entry: stored.entry,
					});
					return next;
				});
			} else {
				setConversations((previous) =>
					previous.some((c) => c.data.conversationId === stored.conversationId)
						? previous
						: [...previous, stored.entry],
				);
			}
			openConversationById(stored.conversationId);
		});

		return () => {
			cancelled = true;
		};
	}, [
		conversations,
		archivedConversations,
		openConversationById,
		selectedConversationId,
		targetProfileId,
	]);

	const handleLoadMoreInbox = () => {
		if (!nextPage || isLoadingMoreInbox) {
			return;
		}

		void loadInbox({ page: nextPage, replace: false });
	};

	const togglePinConversation = useCallback(
		async (conversationId: string, isPinned: boolean) => {
			if (isUpdatingConversationState) {
				return;
			}

			setIsUpdatingConversationState(true);

			try {
				if (isPinned) {
					await service.unpinConversation(conversationId);
				} else {
					await service.pinConversation(conversationId);
				}
				setConversations((previous) => {
					const updated = previous.map((conversation) =>
						conversation.data.conversationId === conversationId
							? { ...conversation, data: { ...conversation.data, pinned: !isPinned } }
							: conversation,
					);
					// Re-sort so the pin change is reflected in list order immediately.
					return [...updated].sort((a, b) => {
						if (a.data.pinned && !b.data.pinned) return -1;
						if (b.data.pinned && !a.data.pinned) return 1;
						return (b.data.lastActivityTimestamp ?? 0) - (a.data.lastActivityTimestamp ?? 0);
					});
				});
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.update_pin_state"),
				);
			} finally {
				setIsUpdatingConversationState(false);
			}
		},
		[isUpdatingConversationState, service, t],
	);

	const togglePin = useCallback(() => {
		if (!selectedConversation) {
			return;
		}
		return togglePinConversation(selectedConversation.data.conversationId, selectedConversation.data.pinned);
	}, [selectedConversation, togglePinConversation]);

	const toggleMute = async () => {
		if (!selectedConversation || isUpdatingConversationState) {
			return;
		}

		setIsUpdatingConversationState(true);
		const isMuted = selectedConversation.data.muted;

		try {
			if (isMuted) {
				await service.unmuteConversation(
					selectedConversation.data.conversationId,
				);
			} else {
				await service.muteConversation(
					selectedConversation.data.conversationId,
				);
			}
			syncConversation((conversation) => ({
				...conversation,
				data: { ...conversation.data, muted: !isMuted },
			}));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("chat.errors.update_mute_state"),
			);
		} finally {
			setIsUpdatingConversationState(false);
		}
	};

	const deleteConversationFromChat = useCallback(
		async (conversationId: string, localOnly = false) => {
			if (isDeletingConversationId) {
				return;
			}

			setIsDeletingConversationId(conversationId);
			try {
				// A real server-side delete fires the exact same
				// chat.v1.conversation.delete WS event as being blocked (nothing in
				// the payload tells them apart) — without this, that echo lands on
				// toggleArchiveOnConversationDelete, which has no way to know this
				// deletion was our own doing and misattributes it as "blocked by
				// other", inserting a false "You were blocked" system message.
				markConversationDeleteHandled(conversationId);

				// Conversations already archived locally (block/404/inbox absence)
				// have nothing server-side left worth deleting for us — and the
				// server may already 404 on them — so those purges stay local-only.
				if (!localOnly) {
					await service.deleteConversation(conversationId);
				}

				// Resolved once, up front, so both the album-revoke step below and
				// the contact-index cleanup after the cascade can use it.
				const entry =
					archivedConversationsRef.current.get(conversationId)?.entry ??
					conversationsRef.current.find((c) => c.data.conversationId === conversationId);
				let recipientProfileId =
					entry && userId != null
						? getOtherParticipant(entry, userId)?.profileId ?? null
						: null;
				if (recipientProfileId == null) {
					const stored = await chatDb.getConversation(conversationId).catch(() => null);
					recipientProfileId = stored?.otherProfileId ? Number(stored.otherProfileId) : null;
				}

				// Deleting the conversation only removes it from our own inbox —
				// it doesn't revoke albums we shared in it, so the recipient could
				// still view them afterward. Read the shared-album list before the
				// cascade below wipes it, and best-effort revoke our own albums.
				try {
					if (recipientProfileId != null) {
						const sharedAlbums = await chatDb.getAlbumsForConversation(conversationId);
						const ownAlbums = sharedAlbums.filter(
							(album) => album.ownerProfileId != null && Number(album.ownerProfileId) === userId,
						);
						await Promise.all(
							ownAlbums.map((album) =>
								service
									.stopAlbumShare(Number(album.albumId), recipientProfileId)
									.catch(() => {}),
							),
						);
					}
				} catch {
					// Best-effort — the local cascade below still cleans up regardless.
				}

				await chatDb.deleteConversationCascade(conversationId);

				// The unread badge on the grid/profile tile lives in a separate
				// local index (chat_contact_index), keyed by profile id rather than
				// conversation id — deleteConversationCascade above only touches
				// the conversations/messages tables, so without this the grid would
				// keep showing unread messages from a profile whose chat we just
				// deleted entirely.
				if (recipientProfileId != null) {
					const recipientProfileIdStr = String(recipientProfileId);
					await clearUnreadCountForProfile(recipientProfileIdStr).catch(() => {});
					await clearAutomationSeenHistoryForSender(recipientProfileIdStr).catch(() => {});
					setChatContactIndexByProfileId((previous) => {
						const existing = previous[recipientProfileIdStr];
						if (!existing || existing.unreadCount === 0) {
							return previous;
						}
						return {
							...previous,
							[recipientProfileIdStr]: { ...existing, unreadCount: 0 },
						};
					});
				}
				setArchivedConversations((previous) => {
					if (!previous.has(conversationId)) {
						return previous;
					}
					const next = new Map(previous);
					next.delete(conversationId);
					return next;
				});
				const remainingConversations = conversationsRef.current.filter(
					(conversation) => conversation.data.conversationId !== conversationId,
				);
				setConversations(remainingConversations);
				setThreadMessages((previous) =>
					previous.filter(
						(message) => message.conversationId !== conversationId,
					),
				);

				setThreadConversationId((current) =>
					current === conversationId ? null : current,
				);

				if (isDesktop) {
					setSelectedDesktopConversationId((current) => {
						if (current !== conversationId) {
							return current;
						}
						return remainingConversations[0]?.data.conversationId ?? null;
					});
				} else {
					navigate("/chat", { replace: true });
				}

				toast.success(t("chat.toasts.conversation_deleted"));
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("chat.errors.delete_conversation"),
				);
			} finally {
				setIsDeletingConversationId(null);
			}
		},
		[isDeletingConversationId, isDesktop, navigate, service, t, userId],
	);

	const deleteConversationLocalOnly = useCallback(
		(conversationId: string) => deleteConversationFromChat(conversationId, true),
		[deleteConversationFromChat],
	);

	const blockProfileFromChat = useCallback(
		async (profileId: number) => {
			if (isBlockingProfileId) {
				return;
			}

			const targetProfileId = String(profileId);
			setIsBlockingProfileId(targetProfileId);

			try {
				// blockProfileMutation's onSuccess (useBlockProfile) already
				// archives the conversation, leaves the "You blocked this
				// person" marker, and suppresses the matching WS echo — this
				// page picks that up live via the CHAT_ARCHIVE_STATE_EVENT /
				// CHAT_SYSTEM_MESSAGE_EVENT listeners below, moving straight
				// into the same read-only archived view used when someone
				// else blocks us, instead of deleting it from the list.
				await blockProfileMutation(targetProfileId);
				removeProfileFromBrowseCache(targetProfileId);
				toast.success(t("profile_details.block_success"));
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("profile_details.block_failed"),
				);
			} finally {
				setIsBlockingProfileId(null);
			}
		},
		[isBlockingProfileId, blockProfileMutation, t],
	);

	const unblockProfileFromChat = useCallback(
		async (profileId: number) => {
			if (isUnblockingProfileId) {
				return;
			}

			const targetProfileId = String(profileId);
			setIsUnblockingProfileId(targetProfileId);

			try {
				// unblockProfileMutation's onSuccess (useUnblockProfile) already
				// takes the conversation out of archive, leaves the "You
				// unblocked this person" marker, and suppresses the matching
				// WS echo — this page picks that up live via the
				// CHAT_ARCHIVE_STATE_EVENT / CHAT_SYSTEM_MESSAGE_EVENT
				// listeners below.
				await unblockProfileMutation(targetProfileId);
				toast.success(t("profile_details.unblock_success"));
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("profile_details.unblock_failed"),
				);
			} finally {
				setIsUnblockingProfileId(null);
			}
		},
		[isUnblockingProfileId, unblockProfileMutation, t],
	);

	const toggleFavoriteFromChat = useCallback(
		async (profileId: number, currentlyFavorite: boolean) => {
			if (isTogglingFavoriteProfileId) return;
			const strId = String(profileId);
			setIsTogglingFavoriteProfileId(strId);
			try {
				if (currentlyFavorite) {
					await service.removeFavorite(strId);
				} else {
					await service.addFavorite(strId);
				}
				setConversations((previous) =>
					previous.map((conv) => {
						const isMatch = conv.data.participants.some(
							(p) => String(p.profileId) === strId,
						);
						if (!isMatch) return conv;
						return {
							...conv,
							data: { ...conv.data, favorite: !currentlyFavorite },
						};
					}),
				);
				setTargetProfileDetail((previous) =>
					previous && String(previous.profileId) === strId
						? { ...previous, isFavorite: !currentlyFavorite }
						: previous,
				);
				toast.success(
					currentlyFavorite
						? t("favorites.removed")
						: t("favorites.added"),
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: currentlyFavorite
						? t("favorites.remove_failed")
						: t("favorites.add_failed"),
				);
			} finally {
				setIsTogglingFavoriteProfileId(null);
			}
		},
		[isTogglingFavoriteProfileId, service, t],
	);

	const executeSlashCommand = useCallback(
		async ({ command, arg }: NonNullable<ReturnType<typeof parseSlashCommand>>) => {
			const targetId = arg
				? Number(arg)
				: selectedConversationOtherProfileId
				? Number(selectedConversationOtherProfileId)
				: null;
			const needsTargetId = ["block", "unblock", "open", "clear", "favourite"].includes(command.name);
			if (needsTargetId && (targetId == null || Number.isNaN(targetId))) {
				toast.error(t("chat.slash_commands.errors.no_target", { defaultValue: "Open a chat or provide an ID" }));
				return;
			}

			switch (command.name) {
				case "block":
					await blockProfileFromChat(targetId as number);
					break;
				case "unblock":
					await unblockProfileFromChat(targetId as number);
					break;
				case "clear":
					await blockProfileFromChat(targetId as number);
					await unblockProfileFromChat(targetId as number);
					break;
				case "open": {
					const returnTo = getProfileReturnToChatPath(targetId as number);
					const nextParams = new URLSearchParams();
					nextParams.set("returnTo", returnTo);
					navigate(`/profile/${targetId}?${nextParams.toString()}`, { state: { returnTo } });
					break;
				}
				case "chat":
					if (!arg) {
						toast.error(t("chat.slash_commands.errors.no_chat_id", { defaultValue: "Provide a chat ID" }));
						break;
					}
					openConversationById(arg);
					break;
				case "mute":
					if (!selectedConversation) {
						toast.error(t("chat.slash_commands.errors.no_conversation", { defaultValue: "Open a chat first" }));
						break;
					}
					await toggleMute();
					break;
				case "pin":
					if (!selectedConversation) {
						toast.error(t("chat.slash_commands.errors.no_conversation", { defaultValue: "Open a chat first" }));
						break;
					}
					togglePin();
					break;
				case "favourite": {
					// Profile-dependent, not conversation-dependent — works the same
					// as the header's favorite button even before a chat exists.
					const currentlyFavorite =
						selectedConversation?.data.favorite ?? targetProfileDetail?.isFavorite ?? false;
					await toggleFavoriteFromChat(targetId as number, currentlyFavorite);
					break;
				}
				case "id":
					if (!selectedConversationOtherProfileId) {
						toast.error(t("chat.slash_commands.errors.no_conversation", { defaultValue: "Open a chat first" }));
						break;
					}
					toast.success(
						t("chat.slash_commands.id.result", {
							defaultValue: `Profile ID: ${selectedConversationOtherProfileId}`,
							id: selectedConversationOtherProfileId,
						}),
					);
					navigator.clipboard?.writeText(selectedConversationOtherProfileId).catch(() => {});
					break;
			}
		},
		[
			selectedConversationOtherProfileId,
			selectedConversation,
			targetProfileDetail,
			blockProfileFromChat,
			unblockProfileFromChat,
			getProfileReturnToChatPath,
			navigate,
			openConversationById,
			toggleMute,
			togglePin,
			toggleFavoriteFromChat,
			t,
		],
	);

	const editLocalNicknameFromChat = useCallback(
		async (profileId: number, defaultName: string) => {
			const profileKey = String(profileId);
			const existingNickname = localNicknamesByProfileId[profileKey] ?? "";
			const input = window.prompt(
				t("chat.nicknames.prompt"),
				existingNickname || defaultName,
			);
			if (input === null) {
				return;
			}

			const normalized = input.trim();
			try {
				await setLocalNicknameForProfile(profileKey, normalized || null);
				setLocalNicknamesByProfileId((previous) => {
					const next = { ...previous };
					if (normalized) {
						next[profileKey] = normalized;
					} else {
						delete next[profileKey];
					}
					return next;
				});
				toast.success(
					normalized
						? t("chat.nicknames.saved")
						: t("chat.nicknames.cleared"),
				);
			} catch (error) {
				appLog.warn("[chat] failed to save local nickname", error);
				const fallbackMessage = t("chat.nicknames.save_failed");
				const message =
					error instanceof Error
						? error.message
						: typeof error === "string"
							? error
							: JSON.stringify(error) || fallbackMessage;
				toast.error(
					message || fallbackMessage,
				);
			}
		},
		[localNicknamesByProfileId, t],
	);

	const sendTextMessage = useCallback(
		async (
			text: string,
			retryMessageId?: string,
			options?: { includeReplyContext?: boolean },
		) => {
			if (!userId) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;

			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			const trimmed = text.trim();
			if (!trimmed) {
				return;
			}

			const includeReplyContext = options?.includeReplyContext ?? true;
			const selectedReplyMessage =
				includeReplyContext && replyTargetMessageId
					? (threadMessages.find(
							(message) => message.messageId === replyTargetMessageId,
						) ?? null)
					: null;
			const replySnippet = selectedReplyMessage
				? getMessagePreviewLabel(selectedReplyMessage, t).trim()
				: "";

			setIsSending(true);
			const localMessageId =
				retryMessageId ?? `local:${Date.now()}:${Math.random()}`;
			if (!retryMessageId) {
				setThreadMessages((previous) => [
					...previous,
					{
						messageId: localMessageId,
						conversationId:
							selectedConversation?.data.conversationId ??
							`direct:${targetProfileIdValue}`,
						senderId: userId,
						timestamp: Date.now(),
						unsent: false,
						reactions: [],
						type: "Text",
						chat1Type: "text",
						body: { text: trimmed },
						replyToMessage: selectedReplyMessage
							? { messageId: selectedReplyMessage.messageId }
							: null,
						replyPreview: selectedReplyMessage
							? { text: replySnippet }
							: null,
						dynamic: false,
						clientState: "pending",
					},
				]);
			}

			setThreadMessages((previous) =>
				previous.map((message) =>
					message.messageId === localMessageId
						? { ...message, clientState: "pending" }
						: message,
				),
			);

			try {
				const sentMessage = await service.sendText({
					targetProfileId: targetProfileIdValue,
					text: trimmed,
					replyToMessageId: selectedReplyMessage?.messageId ?? null,
				});

				setThreadMessages((previous) => {
					const merged = previous
						.filter((message) => message.messageId !== localMessageId)
						.concat(sentMessage);
					const map = new Map<string, UiMessage>();
					for (const message of merged) {
						map.set(message.messageId, message);
					}
					return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
				});

				if (selectedConversation) {
					syncConversation((conversation) => ({
						...conversation,
						data: {
							...conversation.data,
							lastActivityTimestamp: sentMessage.timestamp,
							preview: {
								conversationId: {
									value: conversation.data.conversationId,
								},
								messageId: sentMessage.messageId,
								senderId: sentMessage.senderId,
								type: sentMessage.type,
								chat1Type: sentMessage.chat1Type ?? "text",
								text: trimmed,
								albumId: null,
								imageHash: null,
							},
						},
					}));
				} else {
					openConversationById(sentMessage.conversationId);
					void loadInbox({ page: 1, replace: true });
				}

				setDraft("");
				setReplyTargetMessageId(null);
			} catch (error) {
				setThreadMessages((previous) =>
					previous.map((message) =>
						message.messageId === localMessageId
							? { ...message, clientState: "failed" }
							: message,
					),
				);

				const apiError = error as ChatApiError;
				const fallback =
					error instanceof Error ? error.message : t("chat.errors.send_failed");
				if (apiError?.status === 429) {
					toast.error(t("chat.errors.rate_limited"));
				} else {
					toast.error(fallback);
				}
			} finally {
				setIsSending(false);
			}
		},
		[
			loadInbox,
			openConversationById,
			replyTargetMessageId,
			selectedConversation,
			service,
			syncConversation,
			targetProfileId,
			threadMessages,
			t,
			userId,
		],
	);

	const sendLocationMessage = useCallback(
		async (lat: number, lon: number) => {
			if (!userId) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;

			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			setIsSending(true);

			try {
				const sentMessage = await service.sendMessage({
					type: "Location",
					target: {
						type: "Direct",
						targetId: targetProfileIdValue,
					},
					body: { lat, lon },
					replyToMessageId: replyTargetMessageId,
				});

				setReplyTargetMessageId(null);
				if (selectedConversation) {
					setThreadMessages((previous) => [...previous, sentMessage]);
				} else {
					openConversationById(sentMessage.conversationId);
					void loadInbox({ page: 1, replace: true });
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			} finally {
				setIsSending(false);
			}
		},
		[loadInbox, openConversationById, selectedConversation, service, t, targetProfileId, userId, replyTargetMessageId, setReplyTargetMessageId],
	);

	const sendGiphyMessage = useCallback(
		async (gif: { id: string; urlPath: string; stillPath: string; previewPath: string; width: number; height: number }) => {
			if (!userId) return;

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;

			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			setIsSending(true);

			try {
				const sentMessage = await service.sendMessage({
					type: "Giphy",
					target: {
						type: "Direct",
						targetId: targetProfileIdValue,
					},
					body: {
						id: gif.id,
						urlPath: gif.urlPath,
						stillPath: gif.stillPath,
						previewPath: gif.previewPath,
						width: gif.width,
						height: gif.height,
						imageHash: "",
					},
					replyToMessageId: replyTargetMessageId,
				});

				setReplyTargetMessageId(null);
				if (selectedConversation) {
					setThreadMessages((previous) => [...previous, sentMessage]);
				} else {
					openConversationById(sentMessage.conversationId);
					void loadInbox({ page: 1, replace: true });
				}
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			} finally {
				setIsSending(false);
			}
		},
		[loadInbox, openConversationById, selectedConversation, service, t, targetProfileId, userId, replyTargetMessageId, setReplyTargetMessageId],
	);

	// Sent from the in-thread album image viewer's reply/react bar — deliberately
	// independent of the main compose bar's isSending/replyTargetMessageId state,
	// since the photo viewer sits on top of it and shouldn't disable or hijack it.
	const sendAlbumContentReaction = useCallback(
		async (albumId: number, albumContentId: number) => {
			if (!userId) return;
			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;
			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}
			try {
				const sentMessage = await service.sendMessage({
					type: "AlbumContentReaction",
					target: { type: "Direct", targetId: targetProfileIdValue },
					body: { albumId, albumContentId },
				});
				if (selectedConversation) {
					setThreadMessages((previous) => [...previous, sentMessage]);
				}
				toast.success(t("chat.toasts.album_reaction_sent", { defaultValue: "Reaction sent" }));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			}
		},
		[selectedConversation, service, t, targetProfileId, userId],
	);

	const sendAlbumContentReply = useCallback(
		async (albumId: number, albumContentId: number, contentType: string | null, text: string) => {
			if (!userId) return;
			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;
			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}
			try {
				const sentMessage = await service.sendMessage({
					type: "AlbumContentReply",
					target: { type: "Direct", targetId: targetProfileIdValue },
					body: { albumId, albumContentId, albumContentReply: text, contentType: contentType ?? "image/jpeg" },
				});
				if (selectedConversation) {
					setThreadMessages((previous) => [...previous, sentMessage]);
				}
				toast.success(t("chat.toasts.album_reply_sent", { defaultValue: "Reply sent" }));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			}
		},
		[selectedConversation, service, t, targetProfileId, userId],
	);

	const sendMediaAttachment = useCallback(
		async (
			file: File,
			options: {
				looping: boolean;
				takenOnGrindr: boolean;
				maxViews: number;
			},
		) => {
			if (!userId) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;
			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			const isImage = file.type.startsWith("image/");
			const isVideo = file.type.startsWith("video/");
			if (!isImage && !isVideo) {
				toast.error("Only image and video attachments are supported.");
				return;
			}

			if (file.size > 12 * 1024 * 1024) {
				toast.error(t("chat.attachments.too_large"));
				return;
			}

			setIsUploadingAttachment(true);
			setUploadProgress(5);

			const localMessageId = `local-upload:${Date.now()}:${Math.random()}`;
			const objectUrl = URL.createObjectURL(file);
			setThreadMessages((previous) => [
				...previous,
				{
					messageId: localMessageId,
					conversationId:
						selectedConversation?.data.conversationId ?? `direct:${targetProfileIdValue}`,
					senderId: userId,
					timestamp: Date.now(),
					unsent: false,
					reactions: [],
					type: isVideo ? "Video" : "Image",
					chat1Type: isVideo ? "video" : "image",
					body: { url: objectUrl },
					replyToMessage: replyTargetMessageId ? { messageId: replyTargetMessageId } : null,
					replyPreview: null,
					dynamic: false,
					clientState: "pending",
				},
			]);

			const progressId = window.setInterval(() => {
				setUploadProgress((previous) => Math.min(92, previous + 8));
			}, 260);

			try {
				const binaryUpload = await buildBinaryUpload(file);
				let durationSeconds: number | undefined;
				if (isVideo) {
					durationSeconds = await new Promise<number>((resolve) => {
						const vid = document.createElement("video");
						vid.preload = "metadata";
						const objUrl = URL.createObjectURL(file);
						vid.onloadedmetadata = () => { URL.revokeObjectURL(objUrl); resolve(Math.ceil(vid.duration)); };
						vid.onerror = () => { URL.revokeObjectURL(objUrl); resolve(0); };
						vid.src = objUrl;
					});
				}
				const uploaded = await service.uploadChatMedia({
					multipart: binaryUpload,
					options: {
						looping: options.looping,
						takenOnGrindr: options.takenOnGrindr,
						durationSeconds,
					},
				});
				setUploadProgress(96);

				const imageUrl = uploaded.url;
				const imageHash = imageUrl
					? uploaded.mediaHash || extractImageHashFromSignedUrl(imageUrl)
					: uploaded.mediaHash;
				const isOnceImage = isImage && options.maxViews === 1;
				const isUnlimitedVideo = isVideo && options.maxViews > 2;
				const messageType = isVideo ? (isUnlimitedVideo ? "NonExpiringVideo" : "Video") : isOnceImage ? "ExpiringImage" : "Image";
				const sentMessage = await service.sendMessage({
					type: messageType,
					target: {
						type: "Direct",
						targetId: targetProfileIdValue,
					},
					body: {
						mediaId: uploaded.mediaId,
						width: null,
						height: null,
						...(isVideo ? { viewsRemaining: options.maxViews, maxViews: options.maxViews } : {}),
						...(isOnceImage ? { viewsRemaining: 1, maxViews: 1, duration: 10 } : {}),
						...(imageUrl ? { url: imageUrl } : {}),
						...(isImage && imageHash ? { imageHash } : {}),
					},
					replyToMessageId: replyTargetMessageId,
				});

				setReplyTargetMessageId(null);
				setThreadMessages((previous) => {
					const merged = previous
						.filter((message) => message.messageId !== localMessageId)
						.concat(sentMessage);
					const map = new Map<string, UiMessage>();
					for (const message of merged) {
						map.set(message.messageId, message);
					}
					return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
				});

				if (selectedConversation) {
					syncConversation((conversation) => ({
						...conversation,
						data: {
							...conversation.data,
							lastActivityTimestamp: sentMessage.timestamp,
							preview: {
								conversationId: {
									value: conversation.data.conversationId,
								},
								messageId: sentMessage.messageId,
								senderId: sentMessage.senderId,
								type: sentMessage.type,
								chat1Type:
									sentMessage.chat1Type ?? (isVideo ? "video" : "image"),
								text: null,
								albumId: null,
								imageHash: null,
							},
						},
					}));
				} else {
					openConversationById(sentMessage.conversationId);
					void loadInbox({ page: 1, replace: true });
				}

				setUploadProgress(100);
				window.setTimeout(() => setUploadProgress(0), 240);
			} catch (error) {
				setThreadMessages((previous) =>
					previous.map((message) =>
						message.messageId === localMessageId
							? { ...message, clientState: "failed" }
							: message,
					),
				);
				toast.error(
					error instanceof Error
						? error.message
						: t("chat.errors.attachment_upload_send_failed"),
				);
			} finally {
				window.clearInterval(progressId);
				setIsUploadingAttachment(false);
				if (uploadProgress < 100) {
					setUploadProgress(0);
				}
				URL.revokeObjectURL(objectUrl);
			}
		},
		[
			loadInbox,
			openConversationById,
			selectedConversation,
			service,
			syncConversation,
			targetProfileId,
			uploadProgress,
			userId,
			replyTargetMessageId,
			setReplyTargetMessageId,
		],
	);

	const cancelPendingAttachment = useCallback(() => {
		setPendingAttachmentFile(null);
		setAttachmentLooping(false);
		setAttachmentTakenOnGrindr(false);
		setAttachmentMaxViews(2147483647);
	}, []);

	const confirmPendingAttachment = useCallback(() => {
		if (!pendingAttachmentFile) {
			return;
		}

		void sendMediaAttachment(pendingAttachmentFile, {
			looping: attachmentLooping,
			takenOnGrindr: attachmentTakenOnGrindr,
			maxViews: attachmentMaxViews,
		});
		setPendingAttachmentFile(null);
		setAttachmentLooping(false);
		setAttachmentTakenOnGrindr(false);
		setAttachmentMaxViews(2147483647);
	}, [
		attachmentLooping,
		attachmentMaxViews,
		attachmentTakenOnGrindr,
		pendingAttachmentFile,
		sendMediaAttachment,
	]);

	const confirmAttachmentFile = useCallback(
		(file: File) => {
			void sendMediaAttachment(file, {
				looping: attachmentLooping,
				takenOnGrindr: attachmentTakenOnGrindr,
				maxViews: attachmentMaxViews,
			});
			setPendingAttachmentFile(null);
			setAttachmentLooping(false);
			setAttachmentTakenOnGrindr(false);
			setAttachmentMaxViews(2147483647);
		},
		[attachmentLooping, attachmentMaxViews, attachmentTakenOnGrindr, sendMediaAttachment],
	);

	const sendAudioBlob = useCallback(async (blob: Blob, durationMs: number) => {
		if (!userId) return;
		const targetIdValue = selectedConversation
			? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
			: targetProfileId;
		if (!targetIdValue) return;
		setIsSendingAudio(true);
		try {
			const audioBytes = new Uint8Array(await blob.arrayBuffer());
			const uploaded = await service.uploadChatMedia({
				multipart: { body: audioBytes, contentType: blob.type || "audio/webm" },
				options: { looping: false, takenOnGrindr: false, durationSeconds: durationMs },
			});
			await service.sendMessage({
				type: "Audio",
				target: { type: "Direct", targetId: Number(targetIdValue) },
				body: {
					mediaId: uploaded.mediaId,
					mediaHash: uploaded.mediaHash,
					url: uploaded.url,
					contentType: blob.type || "audio/webm",
					length: durationMs,
					expiresAt: uploaded.expiresAt,
				},
				replyToMessageId: replyTargetMessageId,
			});
			setPendingAudioBlob(null);
			setPendingAudioDuration(0);
			setReplyTargetMessageId(null);
		} catch (err) {
			console.error("[sendAudioBlob] failed", {
				err,
				blobType: blob?.type,
				blobSize: blob?.size,
				durationMs,
				conversationId: selectedConversation?.data.conversationId,
				targetId: targetIdValue,
			});
			toast.error(err instanceof Error ? err.message : t("chat.errors.send_failed"));
		} finally {
			setIsSendingAudio(false);
		}
	}, [userId, selectedConversation, targetProfileId, service, t, replyTargetMessageId, setReplyTargetMessageId]);

	const sendAudioBlobRef = useRef(sendAudioBlob);
	useEffect(() => { sendAudioBlobRef.current = sendAudioBlob; }, [sendAudioBlob]);

	const onAudioRecorded = useCallback((blob: Blob, durationMs: number, autoSend?: boolean) => {
		if (autoSend) {
			void sendAudioBlobRef.current(blob, durationMs);
		} else {
			setPendingAudioBlob(blob);
			setPendingAudioDuration(durationMs);
		}
	}, []);

	const cancelAudio = useCallback(() => {
		setPendingAudioBlob(null);
		setPendingAudioDuration(0);
	}, []);

	const confirmAudio = useCallback(async () => {
		if (!pendingAudioBlob) return;
		await sendAudioBlob(pendingAudioBlob, pendingAudioDuration);
	}, [pendingAudioBlob, pendingAudioDuration, sendAudioBlob]);

	const handleSend = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const parsedCommand = parseSlashCommand(draft.trim());
		if (parsedCommand) {
			setDraft("");
			void executeSlashCommand(parsedCommand);
			return;
		}
		void sendTextMessage(draft);
		scrollThreadToBottom();
	};

	const handleRetry = (message: UiMessage) => {
		if (!message.body || typeof message.body !== "object") {
			return;
		}

		if (message.type === "Image" || message.type === "ExpiringImage") {
			toast.error(t("chat.errors.reupload_image"));
			return;
		}

		if (message.type === "Video" || message.type === "PrivateVideo" || message.type === "NonExpiringVideo") {
			toast.error(t("chat.errors.reupload_video"));
			return;
		}

		const body = message.body as Record<string, unknown>;
		if (typeof body.text !== "string") {
			return;
		}

		void sendTextMessage(body.text, message.messageId, {
			includeReplyContext: false,
		});
	};

	const handleReplyToMessage = useCallback((message: UiMessage) => {
		if (isLocalClientMessageId(message.messageId)) {
			return;
		}
		setReplyTargetMessageId(message.messageId);
		setOpenMessageActionId(null);
	}, []);

	const handleReact = async (message: UiMessage) => {
		if (!selectedConversation || !userId || isMutatingMessageId) {
			return;
		}
		const alreadyReactedByUser = message.reactions.some(
			(reaction) => reaction.profileId === userId && reaction.reactionType === 1,
		);
		if (alreadyReactedByUser) {
			return;
		}

		const previous = threadMessages;
		setIsMutatingMessageId(message.messageId);
		setOpenMessageActionId(null);
		setThreadMessages((current) =>
			current.map((item) => {
				if (item.messageId !== message.messageId) {
					return item;
				}

				return {
					...item,
					reactions: [
						...item.reactions,
						{ profileId: userId, reactionType: 1 },
					],
				};
			}),
		);
		triggerReactionBurst(message.messageId);

		try {
			await service.reactToMessage({
				conversationId: selectedConversation.data.conversationId,
				messageId: message.messageId,
				reactionType: 1,
			});
		} catch (error) {
			setThreadMessages(previous);
			toast.error(
				error instanceof Error
					? error.message
					: t("chat.errors.react_failed"),
			);
		} finally {
			setIsMutatingMessageId(null);
		}
	};

	const doubleTapTimeoutRef = useRef<Record<string, number>>({});
	const handleMessageTap = useCallback(
		(message: UiMessage) => {
			const messageId = message.messageId;
			if (doubleTapTimeoutRef.current[messageId]) {
				window.clearTimeout(doubleTapTimeoutRef.current[messageId]);
				delete doubleTapTimeoutRef.current[messageId];
				void handleReact(message);
			} else {
				doubleTapTimeoutRef.current[messageId] = window.setTimeout(() => {
					delete doubleTapTimeoutRef.current[messageId];
				}, 300);
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	const handleUnsend = async (message: UiMessage) => {
		if (isMutatingMessageId) {
			return;
		}

		if (isLocalClientMessageId(message.messageId)) {
			setOpenMessageActionId(null);
			setThreadMessages((current) =>
				current.filter((item) => item.messageId !== message.messageId),
			);
			return;
		}

		if (!selectedConversation) {
			return;
		}

		const previous = threadMessages;
		setIsMutatingMessageId(message.messageId);
		setOpenMessageActionId(null);
		// Keep the original content visible — only flag it as unsent/local
		// history, instead of wiping the body the way the server does.
		setThreadMessages((current) =>
			current.map((item) =>
				item.messageId === message.messageId
					? { ...item, unsent: true, localHistory: true }
					: item,
			),
		);
		try {
			await service.unsendMessage({
				conversationId: selectedConversation.data.conversationId,
				messageId: message.messageId,
			});
			// Only persist once the server has actually confirmed the unsend —
			// otherwise a failed request would leave the DB row incorrectly
			// flagged unsent even though nothing happened server-side.
			void chatDb.markMessageUnsentLocally(message.messageId);
		} catch (error) {
			setThreadMessages(previous);
			toast.error(error instanceof Error ? error.message : t("chat.errors.unsend_failed"));
		} finally {
			setIsMutatingMessageId(null);
		}
	};

	const handleDelete = async (message: UiMessage) => {
		if (isMutatingMessageId) {
			return;
		}

		if (isLocalClientMessageId(message.messageId)) {
			setOpenMessageActionId(null);
			setThreadMessages((current) =>
				current.filter((item) => item.messageId !== message.messageId),
			);
			void chatLog.removeMessage(message.messageId);
			return;
		}

		if (!selectedConversation) {
			return;
		}

		const previous = threadMessages;
		setIsMutatingMessageId(message.messageId);
		setOpenMessageActionId(null);
		setThreadMessages((current) =>
			current.filter((item) => item.messageId !== message.messageId),
		);

		try {
			await service.deleteMessage({
				conversationId: selectedConversation.data.conversationId,
				messageId: message.messageId,
			});
			await chatLog.removeMessage(message.messageId);
		} catch (error) {
			setThreadMessages(previous);
			toast.error(error instanceof Error ? error.message : t("chat.errors.delete_failed"));
		} finally {
			setIsMutatingMessageId(null);
		}
	};

	const handleStopAlbumShare = useCallback(async (albumId: number) => {
		if (!selectedConversation || isMutatingMessageId) return;
		const recipient = getOtherParticipant(selectedConversation, userId);
		if (!recipient) return;
		setIsMutatingMessageId(String(albumId));
		try {
			await service.stopAlbumShare(albumId, recipient.profileId);
			toast.success(t("chat.toasts.album_share_stopped", { defaultValue: "Album share stopped." }));
			setThreadMessages((prev) =>
				prev.map((msg) => {
					if (getMessageAlbumId(msg) !== albumId) return msg;
					const body = msg.body as Record<string, unknown>;
					return { ...msg, body: { ...body, isViewable: false, ownerProfileId: null } };
				}),
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.errors.album_share_failed"));
		} finally {
			setIsMutatingMessageId(null);
			setOpenMessageActionId(null);
		}
	}, [selectedConversation, userId, isMutatingMessageId, t]);

	const shareAlbumToCurrentConversation = useCallback(
		async (albumId: number, albumName?: string | null) => {
        const targetProfile = selectedConversation
            ? getOtherParticipant(selectedConversation, userId)
            : null;
        const recipientProfileId = targetProfile?.profileId ?? targetProfileId;

        if (!recipientProfileId) {
            toast.error(t("chat.errors.album_share_missing_recipient"));
            return;
        }

        setPendingAlbumShare({
            albumId,
            albumName: albumName?.trim() || t("chat.album_fallback", { id: albumId }),
        });
    },
    [selectedConversation, targetProfileId, t, userId],
	);

	const closePendingAlbumShare = useCallback(() => {
		if (isSharingAlbum) {
			return;
		}

		setPendingAlbumShare(null);
	}, [isSharingAlbum]);

	const confirmPendingAlbumShare = useCallback(async (expirationType: any = "INDEFINITE") => {
        if (!pendingAlbumShare) return;

        const targetProfile = selectedConversation
            ? getOtherParticipant(selectedConversation, userId)
            : null;
        const recipientProfileId = targetProfile?.profileId ?? targetProfileId;

        if (!recipientProfileId) {
            toast.error(t("chat.errors.album_share_missing_recipient"));
            return;
        }

        setIsSharingAlbum(true);
        try {
            await service.shareAlbum({
                albumId: pendingAlbumShare.albumId,
                profiles: [{ profileId: recipientProfileId, expirationType }],
            });
            toast.success(t("chat.toasts.album_shared"));
            setPendingAlbumShare(null);
            setIsAlbumPickerOpen(false);
            if (selectedConversation) {
                void loadThread({
                    conversationId: selectedConversation.data.conversationId,
                    older: false,
                });
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("chat.errors.album_share_failed"));
        } finally {
            setIsSharingAlbum(false);
        }
    }, [loadThread, pendingAlbumShare, selectedConversation, targetProfileId, service, t, userId]);

	const handleShareAlbumFromDrawer = useCallback(async (albumId: number, expirationType: string) => {
		const recipientProfileId = selectedConversation
			? getOtherParticipant(selectedConversation, userId)?.profileId ?? null
			: targetProfileId;
		if (!recipientProfileId) {
			toast.error(t("chat.errors.album_share_missing_recipient"));
			return;
		}
		setIsSharingAlbum(true);
		try {
			await service.shareAlbum({ albumId, profiles: [{ profileId: recipientProfileId, expirationType: expirationType as any }] });
			toast.success(t("chat.toasts.album_shared"));
			if (selectedConversation) {
				void loadThread({ conversationId: selectedConversation.data.conversationId, older: false });
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.errors.album_share_failed"));
		} finally {
			setIsSharingAlbum(false);
		}
	}, [selectedConversation, targetProfileId, userId, t, loadThread]);

	const openAlbumViewerById = useCallback(
		async (albumId: number, isOwnAlbum?: boolean) => {
			albumViewerCancelledRef.current = false;
			setIsAlbumSheetOpen(true);
			setAlbumViewerMediaIndex(null);

			// Show the local cache immediately if we have one — covers both the
			// offline case and the case where the share has already
			// expired/exhausted server-side but we captured it durably when it
			// was first received.
			const cached = await getLocalAlbum(albumId).catch(() => null);
			if (albumViewerCancelledRef.current) return;
			if (cached) {
				setAlbumViewer({ ...cached, isOwn: isOwnAlbum });
				setIsAlbumViewerLoading(false);
			} else {
				setAlbumViewer(null);
				setIsAlbumViewerLoading(true);
			}

			// Always also try refreshing from the live API — the owner can add
			// content to an album after it was first shared, so don't keep
			// showing a stale local snapshot forever just because we have one.
			// captureAlbum reuses already-downloaded bytes per content item and
			// only fetches genuinely new ones, so this doesn't re-download
			// anything we already have.
			try {
				const details = await service.getAlbum(albumId);
				if (albumViewerCancelledRef.current) return;
				await captureAlbum({
					albumId: details.albumId,
					albumName: details.albumName,
					content: details.content,
					ownerProfileId: null,
					conversationId: null,
					sharedViaMessageId: null,
					remainingViews: null,
					isViewable: null,
				});
				const merged = await getLocalAlbum(albumId);
				if (albumViewerCancelledRef.current) return;
				setAlbumViewer(
					merged
						? { ...merged, isOwn: isOwnAlbum }
						: {
							albumId: details.albumId,
							albumName: details.albumName,
							content: details.content,
							isOwn: isOwnAlbum,
						},
				);
			} catch (error) {
				if (albumViewerCancelledRef.current) return;
				if (!cached) {
					setIsAlbumSheetOpen(false);
					toast.error(
						error instanceof Error ? error.message : t("chat.errors.album_open_failed"),
					);
				}
			} finally {
				if (!albumViewerCancelledRef.current) setIsAlbumViewerLoading(false);
			}
		},
		[service, t],
	);

	const closeAlbumMediaViewer = useCallback(() => {
		setAlbumViewerMediaIndex(null);
	}, []);

	const openAlbumMediaViewer = useCallback(
		(index: number) => {
			if (!albumViewer || index < 0 || index >= albumViewer.content.length) {
				return;
			}

			const item = albumViewer.content[index];
			const mediaUrl = item.url || item.thumbUrl || item.coverUrl;
			if (!mediaUrl) {
				return;
			}

			setAlbumViewerMediaIndex(index);
		},
		[albumViewer],
	);

	const toggleAlbumPicker = useCallback(async () => {
		if (isAlbumPickerOpen) {
			setIsAlbumPickerOpen(false);
			return;
		}

		if (shareableAlbums.length === 0) {
			await loadAlbums();
		}

		setIsAlbumPickerOpen(true);
	}, [
		isAlbumPickerOpen,
		loadAlbums,
		shareAlbumToCurrentConversation,
		shareableAlbums,
	]);

	const loadDrawerMedia = useCallback(async () => {
		// The per-conversation endpoint's "used" flag is scoped to that one
		// conversation (so you don't accidentally resend the same pic twice to
		// the same person) — falling back to some other conversationId here
		// would show media as already-sent based on a completely unrelated
		// chat. Before a conversation exists yet (new chat from a profile),
		// use the conversation-less endpoint instead — its items just never
		// come back marked as used.
		setIsLoadingDrawer(true);
		setDrawerError(null);
		try {
			const media = selectedConversationId
				? await service.getDrawerMedia(selectedConversationId)
				: await service.getGlobalDrawerMedia();
			setDrawerMedia(media);
		} catch (error) {
			const message = error instanceof Error ? error.message : t("chat.errors.load_drawer_media");
			setDrawerError(message);
			toast.error(message);
		} finally {
			setIsLoadingDrawer(false);
		}
	}, [selectedConversationId, service, t]);

	const toggleDrawer = useCallback(async () => {
		if (isDrawerOpen) {
			setIsDrawerOpen(false);
			return;
		}

		// Nothing to send to without a recipient (either an open conversation
		// or a profile we're starting a new chat with).
		if (!selectedConversationId && !targetProfileId) return;

		setIsDrawerOpen(true);
		const [, ] = await Promise.all([
			drawerMedia.length === 0 ? loadDrawerMedia() : Promise.resolve(),
			shareableAlbums.length === 0 ? loadAlbums() : Promise.resolve(),
		]);
	}, [isDrawerOpen, selectedConversationId, targetProfileId, drawerMedia.length, loadDrawerMedia, shareableAlbums.length, loadAlbums]);

	const sendDrawerMedia = useCallback(
		async (mediaIds: number[], maxViews?: number) => {
			if (!userId || mediaIds.length === 0) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? getOtherParticipant(selectedConversation, userId)?.profileId ?? null
				: targetProfileId;
			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			setIsSendingDrawerMedia(true);
			let finalSentMessage: UiMessage | undefined;
			let pendingReplyId = replyTargetMessageId;
			try {
				// Send each media item as a separate image/video message
				for (const mediaId of mediaIds) {
					const media = drawerMedia.find((m) => m.id === mediaId);
					if (!media) continue;

					const isVideo = media.contentType.startsWith("video");
					const views = maxViews ?? 2147483647;
					const isOnceImage = !isVideo && views === 1;
                    const isUnlimitedVideo = isVideo && views > 2;
				    const messageType = isVideo ? (isUnlimitedVideo ? "NonExpiringVideo" : "Video") : isOnceImage ? "ExpiringImage" : "Image";

					const sentMessage = await service.sendMessage({
						type: messageType,
						target: {
							type: "Direct",
							targetId: targetProfileIdValue,
						},
						body: {
							mediaId,
							width: null,
							height: null,
							url: media.url,
							...(isOnceImage ? { viewsRemaining: 1, maxViews: 1, duration: 10 } : {}),
							...(isVideo ? { viewsRemaining: views, maxViews: views } : {}),
						},
						replyToMessageId: pendingReplyId,
					});
					pendingReplyId = null;

					// Track the last sent message for preview update
					finalSentMessage = sentMessage;
				}

				// Update conversation preview with the last sent message
				if (selectedConversation && finalSentMessage) {
					const finalMessage = finalSentMessage;
					syncConversation((conversation) => ({
						...conversation,
						data: {
							...conversation.data,
							lastActivityTimestamp: finalMessage.timestamp,
							preview: {
								conversationId: {
									value: conversation.data.conversationId,
								},
								messageId: finalMessage.messageId,
								senderId: finalMessage.senderId,
								type: finalMessage.type,
								chat1Type: finalMessage.chat1Type ?? "image",
								text: null,
								albumId: null,
								imageHash: null,
							},
						},
					}));
				}

				setReplyTargetMessageId(null);
				toast.success(t("chat.toasts.media_sent"));
				setIsDrawerOpen(false);

				// Reload drawer media to update "used" status
				await loadDrawerMedia();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.send_drawer_media"),
				);
			} finally {
				setIsSendingDrawerMedia(false);
			}
		},
		[
			selectedConversation,
			targetProfileId,
			userId,
			drawerMedia,
			service,
			t,
			syncConversation,
			loadDrawerMedia,
			replyTargetMessageId,
			setReplyTargetMessageId,
		],
	);

	const addDrawerMedia = useCallback(
		async (file: File, takenOnGrindr: boolean, looping?: boolean) => {
			const isVideo = file.type.startsWith("video/");

			if (file.size > 100 * 1024 * 1024) {
				toast.error(t("chat.attachments.too_large"));
				return;
			}

			setIsAddingDrawerMedia(true);
			try {
				let durationSeconds: number | undefined;
				if (isVideo) {
					durationSeconds = await new Promise<number>((resolve) => {
						const vid = document.createElement("video");
						vid.preload = "metadata";
						vid.onloadedmetadata = () => {
							resolve(isFinite(vid.duration) ? Math.round(vid.duration) : 0);
							URL.revokeObjectURL(vid.src);
						};
						vid.onerror = () => { resolve(0); URL.revokeObjectURL(vid.src); };
						vid.src = URL.createObjectURL(file);
					});
				}

				const binaryUpload = await buildBinaryUpload(file);
				const uploaded = await service.uploadChatMedia({
					multipart: binaryUpload,
					options: {
						looping: isVideo ? (looping ?? false) : false,
						takenOnGrindr: isVideo ? false : takenOnGrindr,
						...(durationSeconds != null ? { durationSeconds } : {}),
					},
				});
				await service.addMediaToDrawer(uploaded.mediaId);

				await loadDrawerMedia();
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.upload_media_failed"),
				);
			} finally {
				setIsAddingDrawerMedia(false);
			}
		},
		[loadDrawerMedia, service, t],
	);

	const deleteDrawerMedia = useCallback(
		async (mediaId: number) => {
			setDeletingDrawerMediaId(mediaId);
			try {
				await service.deleteDrawerMedia(mediaId);
				setDrawerMedia((previous) => previous.filter((item) => item.id !== mediaId));
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.delete_failed"),
				);
			} finally {
				setDeletingDrawerMediaId(null);
			}
		},
		[service, t],
	);

	const onAttachmentInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}

		if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
			toast.error("Only image and video attachments are supported.");
			return;
		}

		setPendingAttachmentFile(file);
		setAttachmentLooping(false);
		setAttachmentTakenOnGrindr(false);
		setAttachmentMaxViews(file.type.startsWith("video/") ? 1 : 2147483647);
	};

	const openFullScreenImage = useCallback((imageUrl: string, meta?: { takenOnGrindr: boolean; createdAtLabel: string | null; timestamp: number }, mediaType: "image" | "video" = "image") => {
		const list: ThreadMediaItem[] = [];
		for (const msg of threadMessages) {
			const imgUrl = getMessageImageUrl(msg);
			if (imgUrl) {
				const createdAt = getMessageImageCreatedAt(msg);
				list.push({
					url: imgUrl,
					type: "image",
					meta: {
						takenOnGrindr: getMessageTakenOnGrindr(msg),
						createdAtLabel: createdAt != null ? formatDateTime24(createdAt) : null,
						timestamp: msg.timestamp,
					},
				});
				continue;
			}
			const vidUrl = getMessageVideoUrl(msg);
			if (vidUrl) list.push({ url: vidUrl, type: "video" });
		}
		const idx = list.findIndex((item) => item.url === imageUrl);
		if (idx === -1 || list.length === 0) {
			// Fallback: single item
			setFullScreenMediaList([{ url: imageUrl, type: mediaType, meta: meta ?? undefined }]);
			setFullScreenMediaIndex(0);
		} else {
			setFullScreenMediaList(list);
			setFullScreenMediaIndex(idx);
		}
	}, [threadMessages]);

	const closeFullScreenImage = useCallback(() => {
		if (fullScreenMediaList.length === 0) {
			return;
		}

		setFullScreenMediaList([]);
		setFullScreenMediaIndex(0);

		if (imageViewerHistoryPushedRef.current) {
			imageViewerHistoryPushedRef.current = false;
			window.history.back();
		}
	}, [fullScreenMediaList.length]);

	useEffect(() => {
		if (!fullScreenImageUrl || imageViewerHistoryPushedRef.current) {
			return;
		}

		window.history.pushState({ chatImageViewer: true }, "");
		imageViewerHistoryPushedRef.current = true;
	}, [fullScreenImageUrl]);

	useEffect(() => {
		const handlePopState = () => {
			if (!imageViewerHistoryPushedRef.current || !fullScreenImageUrl) {
				return;
			}

			imageViewerHistoryPushedRef.current = false;
			setFullScreenMediaList([]);
			setFullScreenMediaIndex(0);
		};

		window.addEventListener("popstate", handlePopState);

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [fullScreenImageUrl]);

	const sharedInboxHeaderProps = {
		realtimeStatusMeta,
		inboxFilters,
		hidePinned,
		hasActiveInboxFilters,
		activeFilterCount: chatActiveFilterCount,
		isSearchOpen: chatIsSearchOpen,
		searchQuery: chatSearchQuery,
		onSetIsSearchOpen: setChatIsSearchOpen,
		onSetSearchQuery: setChatSearchQuery,
		onSetIsFiltersOpen: setChatIsFiltersOpen,
		onSetFiltersDraft: setChatFiltersDraft,
		onToggleFavoritesOnly: toggleInboxFavoritesOnly,
		onToggleHidePinned: () => setHidePinned((prev) => !prev),
		hideArchived,
		archivedCount: archivedConversations.size,
		onToggleHideArchived: () => setHideArchived((prev) => !prev),
	} as const;

	const renderInbox = (
		<ChatInboxPanel
			{...sharedInboxHeaderProps}
			isDesktop={isDesktop}
			showHeader={!isDesktop}
			isLoadingInbox={isLoadingInbox}
			isLoadingMoreInbox={isLoadingMoreInbox}
			inboxError={inboxError}
			filteredConversations={filteredConversations}
			archivedConversationIds={archivedConversationIds}
			nextPage={nextPage}
			selectedConversationId={selectedConversationId}
			userId={userId}
			localNicknamesByProfileId={localNicknamesByProfileId}
			chatContactIndexByProfileId={chatContactIndexByProfileId}
			nowTimestamp={nowTimestamp}
			presenceResults={presenceResults}
			inboxListRef={inboxListRef}
			onRefreshInbox={() => loadInbox({ page: 1, replace: true })}
			onLoadMoreInbox={handleLoadMoreInbox}
			onSelectConversation={handleSelectConversation}
			onOpenConversationById={openConversationById}
			onViewProfile={(profileId) => {
				const returnTo = "/chat";
				const nextParams = new URLSearchParams();
				nextParams.set("returnTo", returnTo);
				navigate(`/profile/${profileId}?${nextParams.toString()}`, { state: { returnTo } });
			}}
			onClearInboxFilters={clearInboxFilters}
			typingConversationIds={typingConversationIds}
			onTogglePinConversation={togglePinConversation}
			onDeleteConversation={deleteConversationFromChat}
			onDeleteConversationLocal={deleteConversationLocalOnly}
			isDeletingConversationId={isDeletingConversationId}
		/>
	);

	const renderThread = (
		<ChatThreadPanel
			navigate={navigate}
			isDesktop={isDesktop}
			selectedConversation={selectedConversation}
			targetProfileId={targetProfileId}
			targetProfileDetail={targetProfileDetail}
			userId={userId}
			nowTimestamp={nowTimestamp}
			presenceResults={presenceResults}
			isUpdatingConversationState={isUpdatingConversationState}
			isHeaderActionsMenuOpen={isHeaderActionsMenuOpen}
			setIsHeaderActionsMenuOpen={setIsHeaderActionsMenuOpen}
			headerActionsMenuRef={headerActionsMenuRef}
			togglePin={togglePin}
			toggleMute={toggleMute}
			onDeleteConversation={deleteConversationFromChat}
			isDeletingConversation={isDeletingConversationId !== null}
			onBlockProfile={blockProfileFromChat}
			isBlockingProfile={isBlockingProfileId !== null}
			onUnblockProfile={unblockProfileFromChat}
			isUnblockingProfile={isUnblockingProfileId !== null}
			isBlockedBySelf={isSelectedConversationBlockedBySelf}
			onToggleFavorite={toggleFavoriteFromChat}
			isFavorite={selectedConversation?.data.favorite ?? targetProfileDetail?.isFavorite ?? false}
			isTogglingFavorite={isTogglingFavoriteProfileId !== null}
			isArchived={
				selectedConversationId
					? archivedConversations.has(selectedConversationId)
					: false
			}
			archivedReason={
				selectedConversationId
					? archivedConversations.get(selectedConversationId)?.reason ?? null
					: null
			}
			localNickname={
				selectedConversationOtherProfileId
					? localNicknamesByProfileId[selectedConversationOtherProfileId] ?? null
					: null
			}
			onEditLocalNickname={editLocalNicknameFromChat}
			getProfileReturnToChatPath={getProfileReturnToChatPath}
			isLoadingThread={isLoadingThread}
			threadConversationId={threadConversationId}
			threadError={threadError}
			loadThread={loadThread}
			threadScrollContainerRef={threadScrollContainerRef}
			handleThreadScroll={handleThreadScroll}
			messagePageKey={messagePageKey}
			isLoadingOlderMessages={isLoadingOlderMessages}
			threadMessages={threadMessages}
			threadLastReadTimestamp={threadLastReadTimestamp}
			messageElementRefs={messageElementRefs}
			handleMessageTap={handleMessageTap}
			startMessageLongPress={startMessageLongPress}
			endMessageLongPress={endMessageLongPress}
			messageLongPressTriggeredRef={messageLongPressTriggeredRef}
			openFullScreenImage={openFullScreenImage}
			openAlbumViewerById={openAlbumViewerById}
			selectedThreadMessageMatches={selectedThreadMessageMatches}
			activeThreadSearchIndex={activeThreadSearchIndex}
			openMessageActionId={openMessageActionId}
			setOpenMessageActionId={setOpenMessageActionId}
			isMutatingMessageId={isMutatingMessageId}
			reactionBurstMessageId={reactionBurstMessageId}
			handleReact={handleReact}
			handleUnsend={handleUnsend}
			handleDelete={handleDelete}
			handleRetry={handleRetry}
			handleReply={handleReplyToMessage}
			handleStopAlbumShare={handleStopAlbumShare}
			threadBottomRef={threadBottomRef}
			handleSend={handleSend}
			toggleAlbumPicker={toggleAlbumPicker}
			toggleDrawer={toggleDrawer}
			attachmentInputRef={attachmentInputRef}
			onAttachmentInput={onAttachmentInput}
			isUploadingAttachment={isUploadingAttachment}
			pendingAttachmentFile={pendingAttachmentFile}
			attachmentLooping={attachmentLooping}
			attachmentTakenOnGrindr={attachmentTakenOnGrindr}
			attachmentMaxViews={attachmentMaxViews}
			setAttachmentLooping={setAttachmentLooping}
			setAttachmentTakenOnGrindr={setAttachmentTakenOnGrindr}
			setAttachmentMaxViews={setAttachmentMaxViews}
			confirmPendingAttachment={confirmPendingAttachment}
			confirmAttachmentFile={confirmAttachmentFile}
			cancelPendingAttachment={cancelPendingAttachment}
			isAlbumPickerOpen={isAlbumPickerOpen}
			isLoadingAlbums={isLoadingAlbums}
			shareableAlbums={shareableAlbums}
			albumCoverMap={albumCoverMap}
			ownProfilePhotoUrl={ownProfilePhotoUrl}
			isSharingAlbum={isSharingAlbum}
			pendingAlbumShare={pendingAlbumShare}
			shareAlbumToCurrentConversation={shareAlbumToCurrentConversation}
			confirmPendingAlbumShare={confirmPendingAlbumShare}
			closePendingAlbumShare={closePendingAlbumShare}
			isDrawerOpen={isDrawerOpen}
			isLoadingDrawer={isLoadingDrawer}
			drawerError={drawerError}
			drawerMedia={drawerMedia}
			isSendingDrawerMedia={isSendingDrawerMedia}
			isAddingDrawerMedia={isAddingDrawerMedia}
			deletingDrawerMediaId={deletingDrawerMediaId}
			onLoadDrawerMedia={loadDrawerMedia}
			onSendDrawerMedia={sendDrawerMedia}
			onAddDrawerMedia={addDrawerMedia}
			onDeleteDrawerMedia={deleteDrawerMedia}
			onShareAlbumFromDrawer={handleShareAlbumFromDrawer}
			onStopAlbumShareFromDrawer={handleStopAlbumShare}
			onSendLocation={sendLocationMessage}
			onSendGiphy={sendGiphyMessage}
			onAudioRecorded={onAudioRecorded}
			pendingAudioBlob={pendingAudioBlob}
			pendingAudioDuration={pendingAudioDuration}
			isSendingAudio={isSendingAudio}
			confirmAudio={confirmAudio}
			cancelAudio={cancelAudio}
			uploadProgress={uploadProgress}
			draft={draft}
			setDraft={setDraft}
			replyTargetMessage={replyTargetMessage}
			clearReplyTarget={() => setReplyTargetMessageId(null)}
			isSending={isSending}
			selectedActionMessage={selectedActionMessage}
			selectedActionMessageMine={selectedActionMessageMine}
			isAlbumSheetOpen={isAlbumSheetOpen}
			onOpenMediaSheet={() => setIsChatMediaSheetOpen(true)}
			isPartnerTyping={selectedConversation != null && typingConversationIds.has(selectedConversation.data.conversationId)}
		/>
	);

		return (
			<section
				className={`app-screen ${isDesktop ? "w-full !h-dvh !px-0 !pb-0 overflow-x-hidden flex flex-col" : "!p-0 !max-w-none !w-full"}`}
			>
				{isDesktop ? (
					<>
						<ChatInboxHeader
							{...sharedInboxHeaderProps}
							isDesktop={true}
						/>
						<div className="flex-1 min-h-0 mx-auto w-full max-w-6xl px-3 pb-[calc(env(safe-area-inset-bottom,0px)+104px)] grid grid-cols-[360px_minmax(0,1fr)] grid-rows-[1fr] gap-3">
							{renderInbox}
							{renderThread}
						</div>
					</>
				) : (
					<div className="w-full">
						{selectedConversation ?? targetProfileId ? renderThread : renderInbox}
					</div>
				)}

			{chatIsFiltersOpen && (
				<ChatFiltersOverlay
					isDesktop={isDesktop}
					draft={chatFiltersDraft}
					onChangeDraft={setChatFiltersDraft}
					onClose={() => setChatIsFiltersOpen(false)}
					onApply={setInboxFilters}
				/>
			)}

			{isChatMediaSheetOpen && selectedConversation ? (() => {
				const otherP = getOtherParticipant(selectedConversation, userId);
				const otherPhotoUrl = resolveAvatarSrc(
					otherP?.primaryMediaHash,
					otherP?.primaryMediaHash && validateMediaHash(otherP.primaryMediaHash)
						? getThumbImageUrl(otherP.primaryMediaHash, "75x75")
						: null,
				);
				return (
					<ChatMediaSheet
						conversationId={selectedConversation.data.conversationId}
						senderProfileId={otherP?.profileId != null ? String(otherP.profileId) : null}
						userId={userId}
						isDesktop={isDesktop}
						onClose={() => setIsChatMediaSheetOpen(false)}
						openAlbumViewerById={openAlbumViewerById}
						openFullScreenImage={(url) => openFullScreenImage(url)}
						senderPhotoUrl={otherPhotoUrl}
					/>
				);
			})() : null}

			{isAlbumSheetOpen ? (
				<ChatAlbumSheet
					viewer={albumViewer}
					isLoading={isAlbumViewerLoading}
					fullScreenIndex={albumViewerMediaIndex}
					onClose={() => {
						albumViewerCancelledRef.current = true;
						setIsAlbumSheetOpen(false);
						setAlbumViewer(null);
						setAlbumViewerMediaIndex(null);
						setIsAlbumViewerLoading(false);
					}}
					onOpenFullScreen={openAlbumMediaViewer}
					isDesktop={isDesktop}
				/>
			) : null}

			<PhotoViewer
				isOpen={albumViewer !== null && albumViewerMediaIndex !== null}
				onClose={closeAlbumMediaViewer}
				photos={albumViewerPhotos}
				initialIndex={albumViewerMediaIndex ?? 0}
				renderFooter={(idx) => {
					const item = albumViewer?.content[idx];
					if (!albumViewer || !item || albumViewer.isOwn) return null;
					return (
						<PhotoActionBar
							onSendText={(text) =>
								sendAlbumContentReply(albumViewer.albumId, item.contentId, item.contentType, text)
							}
							onReact={() => sendAlbumContentReaction(albumViewer.albumId, item.contentId)}
						/>
					);
				}}
			/>

			<PhotoViewer
				isOpen={fullScreenMediaList.length > 0}
				onClose={closeFullScreenImage}
				photos={fullScreenMediaList}
				initialIndex={fullScreenMediaIndex}
				onIndexChange={setFullScreenMediaIndex}
				renderExtraInfo={(idx) => {
					const meta = fullScreenMediaList[idx]?.meta;
					if (!meta) return null;
					return (
						<p className="inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
							<style>{`
								@keyframes logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
								.logo-shine { animation: logo-shine 2.8s ease-in-out infinite; }
							`}</style>
							{meta.takenOnGrindr ? (
								<img
									src={freegrindLogo}
									alt={t("chat.thread.taken_on_grindr")}
									className="h-3.5 w-3.5 rounded-full logo-shine"
								/>
							) : null}
							{meta.createdAtLabel ?? (meta.timestamp ? formatDateTime24(meta.timestamp) : null) ? (
								<span>{meta.createdAtLabel ?? formatDateTime24(meta.timestamp)}</span>
							) : null}
						</p>
					);
				}}
			/>
		</section>
	);
}