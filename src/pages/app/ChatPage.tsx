import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	type FormEvent,
	type TouchEvent,
	useCallback,
	useEffect,
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
import { useBlockProfile } from "../../hooks/queries/useProfileQueries";
import { usePresenceCheckBatch } from "../../hooks/usePresenceCheck";
import { useAuth } from "../../contexts/useAuth";
import { type ChatApiError } from "../../services/chatService";
import { setConversationDirectory } from "../../services/conversationDirectory";
import {
	CHAT_REALTIME_EVENT,
	CHAT_REALTIME_STATUS,
	getChatRealtimeStatus,
} from "../../components/ChatRealtimeBridge";
import { PhotoViewer, type PhotoViewerMedia } from "../../components/PhotoViewer";
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
import { ChatSearchPage } from "./ChatSearchPage";
import { ChatInboxPanel } from "./chat/ChatInboxPanel";
import { ChatThreadPanel } from "./chat/ChatThreadPanel";
import { ChatAlbumSheet } from "./chat/ChatAlbumSheet";
import { ChatMediaSheet } from "./chat/ChatMediaSheet";
import * as chatLog from "../../services/chatLog";
import {
	buildBinaryUpload,
	extractImageHashFromSignedUrl,
	getMessageAlbumId,
	getMessageImageUrl,
	getMessageVideoUrl,
	getMessageMediaId,
	getMessagePreviewLabel,
	getOtherParticipant,
	isLocalClientMessageId,
	parseChatFiltersFromLocationState,
    formatDateTime24
} from "./chat/chatUtils";
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
import { markInboxSeen } from "../../services/seenStore";
import { shouldAutoBlock, isOutsideAgeLimits } from "../../utils/autoblock";
import { isChatGhosted } from "../../utils/privacy";
import freegrindLogo from "../../images/freegrind-logo.webp";
import { getCachedOwnProfilePhotoHash, setCachedOwnProfilePhotoHash } from "./gridpage/cache";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";

export function ChatPage() {
	const { t } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const { conversationId: routeConversationId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const service = useApiFunctions();
	const { mutateAsync: blockProfileMutation } = useBlockProfile();
	const { userId } = useAuth();
	const isDesktop = useDesktopBreakpoint();
	const threadBottomRef = useRef<HTMLDivElement | null>(null);
	const threadScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
	const selectedConversationIdRef = useRef<string | null>(null);
	const conversationsRef = useRef<ConversationEntry[]>([]);
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
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [isLoadingMoreInbox, setIsLoadingMoreInbox] = useState(false);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [inboxFilters, setInboxFilters] = useState<InboxFilters>({});
	const [selectedDesktopConversationId, setSelectedDesktopConversationId] =
		useState<string | null>(null);

	const [hidePinned, setHidePinned] = useState(() => {
		return localStorage.getItem("chat_hide_pinned") === "true";
	});

	useEffect(() => {
		localStorage.setItem("chat_hide_pinned", String(hidePinned));
	}, [hidePinned]);

	useEffect(() => {
		if (!userId) return;
		const cached = getCachedOwnProfilePhotoHash();
		if (cached !== undefined) {
			setOwnProfilePhotoUrl(cached ? getThumbImageUrl(cached, "75x75") : null);
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
				setOwnProfilePhotoUrl(hash ? getThumbImageUrl(hash, "75x75") : null);
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
	const [replyTargetMessageId, setReplyTargetMessageId] = useState<string | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [isUpdatingConversationState, setIsUpdatingConversationState] =
		useState(false);
	const [isBlockingProfileId, setIsBlockingProfileId] = useState<string | null>(
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
	const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
	const [fullScreenMediaType, setFullScreenMediaType] = useState<"image" | "video">("image");
	const [fullScreenImageMeta, setFullScreenImageMeta] = useState<{
		takenOnGrindr: boolean;
		createdAtLabel: string | null;
		timestamp: number;
	} | null>(null);

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
	const inboxTouchStartXRef = useRef<number | null>(null);
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
	const isSearchRoute = routeConversationId === "search";

	const selectedConversationId = targetProfileId || isSearchRoute
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
			if (routeConversationId && routeConversationId !== "search") {
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

		if (!routeConversationId || routeConversationId === "search") {
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
		isSearchRoute,
	]);

	const selectedConversation = useMemo(
		() =>
			conversations.find(
				(conversation) =>
					conversation.data.conversationId === selectedConversationId,
			) ?? null,
		[conversations, selectedConversationId],
	);

	const selectedConversationOtherProfileId = useMemo(() => {
		if (!selectedConversation || userId == null) {
			return null;
		}
		const otherParticipant = getOtherParticipant(selectedConversation, userId);
		return otherParticipant?.profileId != null
			? String(otherParticipant.profileId)
			: null;
	}, [selectedConversation, userId]);

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
	}, [conversations, userId]);

	const handleInboxTouchStart = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			inboxTouchStartXRef.current = event.touches[0]?.clientX ?? null;
		},
		[],
	);

	const handleInboxTouchEnd = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			const startX = inboxTouchStartXRef.current;
			if (startX == null) {
				return;
			}

			const endX = event.changedTouches[0]?.clientX ?? startX;
			const deltaX = startX - endX;

			if (deltaX > 70) {
				navigate("/settings/shared-albums");
			}

			inboxTouchStartXRef.current = null;
		},
		[navigate],
	);

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
				const response = await service.listConversations({
					page,
					filters: activeInboxFiltersRef.current,
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
						return entriesWithUnreadFixed;
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

				setNextPage(response.nextPage ?? null);
				if (replace && response.entries.length > 0) {
					setSelectedDesktopConversationId((previous) =>
						previous &&
						response.entries.some(
							(conversation) => conversation.data.conversationId === previous,
						)
							? previous
							: targetProfileId
								? null
								: (response.entries[0]?.data.conversationId ?? null),
					);
				}
			} catch (error) {
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

					if (!localBody?.url || currentBody?.url) {
						return message;
					}

					return {
						...message,
						body: { ...(currentBody ?? {}), url: localBody.url },
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
						if (getMessageImageUrl(message as UiMessage)) return false;
						return getMessageMediaId(message as UiMessage) !== null;
					});

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
								if (!getMessageImageUrl(hydrated)) {
									continue;
								}

								hydratedMessages.push(hydrated);
								unresolvedMessageIds.delete(hydrated.messageId);
							}

							if (hydratedMessages.length > 0) {
								void chatLog.appendMessages(conversationId, hydratedMessages);

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

								const hydratedMessages: UiMessage[] = [];
								for (const message of fallbackMessages) {
									const mediaId = getMessageMediaId(message as UiMessage);
									if (mediaId == null) continue;
									const url = sharedImageMap.get(mediaId);
									if (!url || !message.body || typeof message.body !== "object")
										continue;
									const hydrated = {
										...message,
										body: { ...(message.body as Record<string, unknown>), url },
									} as UiMessage;
									if (getMessageImageUrl(hydrated))
										hydratedMessages.push(hydrated);
								}

								if (!hydratedMessages.length) return;

								// Persist resolved image URLs so they survive CloudFront expiry.
								void chatLog.appendMessages(conversationId, hydratedMessages);

								setThreadMessages((previous) => {
									const map = new Map<string, UiMessage>();
									for (const message of previous) {
										if (message.conversationId === conversationId) {
											map.set(message.messageId, message);
										}
									}
									for (const message of hydratedMessages)
										map.set(message.messageId, message);
									return [...map.values()].sort(
										(a, b) => a.timestamp - b.timestamp,
									);
								});
							})
							.catch(() => {
								// Best effort only.
							});
						});
					}

					// Hydrate received video messages that have no URL yet (mediaId may be null).
					const mediaIdVideoMessages = responseMessages.filter((message) => {
						const isVideoLike = message.type === "Video" || (message as UiMessage).chat1Type?.toLowerCase() === "video";
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
									updates.push(result.value as UiMessage);
								} else {
									updates.push({ ...original, body: { ...(original.body as Record<string, unknown> ?? {}), _videoExpired: true } });
								}
							}
							if (updates.length === 0) return;
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

// --- AUTO BLOCK CHECK (HISTORICAL CHAT SCANNER) ---
				let shouldNukeThread = false;
				let blockReason = "";

				// 1. Check if their historical messages contain bad words
				for (const m of responseMessages) {
					let messageText = "";
					const msgBody: any = m.body;
					if (msgBody && typeof msgBody.text === "string") {
						messageText = msgBody.text;
					}
					
					const isIncoming = userId != null && Number(m.senderId) !== Number(userId);

					if (isIncoming && shouldAutoBlock(messageText, "chat")) {
						shouldNukeThread = true;
						blockReason = "Keyword in message history";
						break;
					}
				}

				const otherParticipant = getOtherParticipant(selectedConversation || { data: { participants: [] } } as any, userId);
				const blockId = otherParticipant?.profileId || (responseMessages[0] && responseMessages[0].senderId);

				if (shouldNukeThread) {
					appLog.info(`[AutoBlock] Sweeping historical conversation. Reason: ${blockReason}`);
					
					if (blockId) {
						blockProfileMutation(String(blockId)).catch(() => {});
					}

					setThreadMessages([]);
					setThreadConversationId(null);
					if (isDesktop) {
						setSelectedDesktopConversationId(null);
					} else {
						navigate("/chat", { replace: true });
					}
					toast.success(`Auto-blocked: ${blockReason}`);
					return; // Stop loading the rest of the thread!
				}

				// 2. Fetch their profile in the background to check their Age AND Bio
				if (blockId) {
					service.getProfileDetail(String(blockId)).then((profile) => {
						const matchedBioWord = shouldAutoBlock(profile.aboutMe, "chat");
						const isBadAge = isOutsideAgeLimits(profile.age, "chat");

						if (matchedBioWord || isBadAge) {
							const reason = isBadAge ? `Age limit (${profile.age})` : `Keyword in Bio`;
							appLog.info(`[AutoBlock] Sweeping conversation due to: ${reason}`);
							
							blockProfileMutation(String(blockId)).catch(() => {});
							
							setThreadMessages([]);
							setThreadConversationId(null);
							if (isDesktop) {
								setSelectedDesktopConversationId(null);
							} else {
								navigate("/chat", { replace: true });
							}
							toast.success(`Auto-blocked: ${reason}`);
						}
					}).catch(() => {});
				}
				// --------------------------------------------------

				setThreadMessages((previous) => {
					const map = new Map<string, UiMessage>();
					if (older) {
						// Older messages prepended; keep existing (including any local-only).
						for (const message of responseMessages)
							map.set(message.messageId, message);
						for (const message of previous) map.set(message.messageId, message);
					} else {
						// Fresh load or poll: preserve already-surfaced messages for this conversation.
						for (const message of previous) {
							if (message.conversationId === conversationId) {
								map.set(message.messageId, message);
							}
						}
						for (const message of responseMessages)
							map.set(message.messageId, message);
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
					const newest = response.messages[response.messages.length - 1];
					if (newest) {
						const previewText = getMessagePreviewLabel(newest, t);

						syncConversation((conversation) => ({
							...conversation,
							data: {
								...conversation.data,
								lastActivityTimestamp: newest.timestamp,
								preview: {
									conversationId: {
										value: newest.conversationId,
									},
									messageId: newest.messageId,
									senderId: newest.senderId,
									type: newest.type,
									chat1Type: newest.chat1Type ?? "text",
									text: previewText,
									albumId: null,
									imageHash: null,
								},
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
 								// --- GHOST CHECK ---
 								if (isChatGhosted(conversationId)) return conversation; 
 								// -------------------
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
				const message =
					error instanceof Error ? error.message : t("chat.errors.load_messages");
				setThreadError(message);
			} finally {
				setIsLoadingThread(false);
				setIsLoadingOlderMessages(false);
				isLoadingOlderMessagesRef.current = false;
			}
		},
		[service, syncConversation],
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
					map.set(message.messageId, message);
				}
			}

			return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
		});

		// Hydrate real-time video messages that arrive without a URL.
		const incomingVideosWithoutUrl = messages.filter((m) => {
			const isVideoLike = m.type === "Video" || (m as UiMessage).chat1Type?.toLowerCase() === "video";
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
						updates.push(result.value as UiMessage);
					} else {
						updates.push({ ...original, body: { ...(original.body as Record<string, unknown> ?? {}), _videoExpired: true } });
					}
				}
				if (!updates.length) return;
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
 				
 				// --- GHOST CHECK ---
 				if (!isChatGhosted(conversation.data.conversationId)) {
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
 				// -------------------
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
			// appLog.debug(`[ChatPage] applyRealtimeEnvelope type=${envelope.type} full=${JSON.stringify(envelope)}`);

			// chat.v1.conversation.delete — remove blocked/deleted conversations
			if (
				envelope.type === "chat.v1.conversation.delete" &&
				envelope.payload &&
				typeof envelope.payload === "object"
			) {
				const record = envelope.payload as Record<string, unknown>;
				const ids = Array.isArray(record.conversationIds)
					? (record.conversationIds as unknown[]).filter(
							(id): id is string => typeof id === "string",
						)
					: [];
				if (ids.length > 0) {
					setConversations((previous) =>
						previous.filter((c) => !ids.includes(c.data.conversationId)),
					);
				}
				return;
			}

			if (envelope.type === "chat.v1.read" || envelope.type === "chat.v1.message_read") {
				// appLog.debug(`[ChatPage] read event detected type=${envelope.type} payload=${JSON.stringify(envelope.payload)}`);
				const payloads: unknown[] = [envelope.payload, envelope.data, envelope];
				for (const payload of payloads) {
					if (!payload || typeof payload !== "object") continue;
					const record = payload as Record<string, unknown>;
					const cid = (record.conversationId || record.cid) as string | undefined;
					const rawTs = Number(record.timestamp || record.ts);
					const ts = rawTs < 100_000_000_000 ? rawTs * 1000 : rawTs;
					const senderId = Number(record.profileId || record.senderId);

					// appLog.debug(`[ChatPage] parsed read event candidate cid=${cid} ts=${ts} senderId=${senderId} currentUserId=${userId} activeCid=${selectedConversationIdRef.current}`);

					if (cid && !Number.isNaN(ts) && !Number.isNaN(senderId)) {
						// If the other person read our messages
						if (userId != null && senderId !== userId) {
							if (cid === selectedConversationIdRef.current) {
								// appLog.debug("[ChatPage] updating threadLastReadTimestamp", { ts });
								setThreadLastReadTimestamp(ts);
							}
							void chatLog.appendMessages(cid, [], ts);
						}
						return; // Found it
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
		[mergeIncomingMessages, userId],
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
		}
		// Also try scrollIntoView as a fallback
		threadBottomRef.current?.scrollIntoView({ block: "end" });

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

	useEffect(() => {
		void loadInbox({ page: 1, replace: true });
	}, [loadInbox, activeInboxFilters]);

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
		const onStatus = (event: Event) => {
			const status = (event as CustomEvent<RealtimeStatus>).detail;
			if (status) handleRealtimeStatus(status);
		};
		window.addEventListener(CHAT_REALTIME_EVENT, onEvent as EventListener);
		window.addEventListener(CHAT_REALTIME_STATUS, onStatus as EventListener);
		return () => {
			window.removeEventListener(CHAT_REALTIME_EVENT, onEvent as EventListener);
			window.removeEventListener(
				CHAT_REALTIME_STATUS,
				onStatus as EventListener,
			);
		};
	}, [handleRealtimeEvent, handleRealtimeStatus]);

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
			if (selectedConversationId) {
				void loadThread({
					conversationId: selectedConversationId,
					older: false,
					silent: true,
				});
			}
		}, intervalMs);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [loadInbox, loadThread, realtimeStatus, selectedConversationId]);

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

		// Always scroll on new conversation OR if a new message arrived at the end
		if (isNewConversation || isNewMessageArrival) {
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

	const filteredConversations = useMemo(() => {
		if (hidePinned) {
			return conversations.filter((c) => !c.data.pinned);
		}
		return conversations;
	}, [conversations, hidePinned]);

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

		if (!existingConversation) {
			return;
		}

		if (selectedConversationId === existingConversation.data.conversationId) {
			return;
		}

		openConversationById(existingConversation.data.conversationId);
	}, [
		conversations,
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

	const togglePin = async () => {
		if (!selectedConversation || isUpdatingConversationState) {
			return;
		}

		setIsUpdatingConversationState(true);
		const isPinned = selectedConversation.data.pinned;

		try {
			if (isPinned) {
				await service.unpinConversation(
					selectedConversation.data.conversationId,
				);
			} else {
				await service.pinConversation(selectedConversation.data.conversationId);
			}
			syncConversation((conversation) => ({
				...conversation,
				data: { ...conversation.data, pinned: !isPinned },
			}));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("chat.errors.update_pin_state"),
			);
		} finally {
			setIsUpdatingConversationState(false);
		}
	};

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

	const clearLocalHistory = useCallback(async () => {
		if (!selectedConversation) {
			return;
		}

		const conversationId = selectedConversation.data.conversationId;
		await chatLog.clearLog(conversationId);
		setThreadMessages((previous) =>
			previous.filter(
				(message) =>
					!(message._localOnly && message.conversationId === conversationId),
			),
		);
		toast.success(t("chat.toasts.cleared_local_history"));
	}, [selectedConversation]);

	const deleteConversationFromChat = useCallback(
		async (conversationId: string) => {
			if (isDeletingConversationId) {
				return;
			}

			setIsDeletingConversationId(conversationId);
			try {
				await service.deleteConversation(conversationId);
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
		[isDeletingConversationId, isDesktop, navigate, service, t],
	);

	const blockProfileFromChat = useCallback(
		async (profileId: number) => {
			if (isBlockingProfileId) {
				return;
			}

			const targetProfileId = String(profileId);
			setIsBlockingProfileId(targetProfileId);

			try {
				await blockProfileMutation(targetProfileId);
				setConversations((previous) =>
					previous.filter(
						(conversation) =>
							!conversation.data.participants.some(
								(participant) =>
									String(participant.profileId) === targetProfileId,
							),
					),
				);
				setSelectedDesktopConversationId((current) => {
					if (!current) {
						return null;
					}
					const activeConversation = conversationsRef.current.find(
						(conversation) => conversation.data.conversationId === current,
					);
					if (!activeConversation) {
						return null;
					}
					const blockedInSelectedConversation =
						activeConversation.data.participants.some(
							(participant) =>
								String(participant.profileId) === targetProfileId,
						);
					return blockedInSelectedConversation ? null : current;
				});
				setThreadConversationId((current) => {
					if (!current) {
						return null;
					}
					const activeConversation = conversationsRef.current.find(
						(conversation) => conversation.data.conversationId === current,
					);
					if (!activeConversation) {
						return null;
					}
					const blockedInSelectedConversation =
						activeConversation.data.participants.some(
							(participant) =>
								String(participant.profileId) === targetProfileId,
						);
					return blockedInSelectedConversation ? null : current;
				});
				setThreadMessages((previous) =>
					previous.filter(
						(message) =>
							message.conversationId !== selectedConversationIdRef.current,
					),
				);
				toast.success(t("profile_details.block_success"));
				navigate("/chat", { replace: true });
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
		[isBlockingProfileId, navigate, service, t],
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
			const textWithReplyContext =
				replySnippet.length > 0 ? `> ${replySnippet}\n${trimmed}` : trimmed;

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
						body: { text: textWithReplyContext },
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
					text: textWithReplyContext,
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
				});

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
		[loadInbox, openConversationById, selectedConversation, service, t, targetProfileId, userId],
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

			if (!selectedConversation?.data.conversationId) {
				return;
			}

			const localMessageId = `local-upload:${Date.now()}:${Math.random()}`;
			const objectUrl = URL.createObjectURL(file);
			setThreadMessages((previous) => [
				...previous,
				{
					messageId: localMessageId,
					conversationId: selectedConversation.data.conversationId,
					senderId: userId,
					timestamp: Date.now(),
					unsent: false,
					reactions: [],
					type: isVideo ? "Video" : "Image",
					chat1Type: isVideo ? "video" : "image",
					body: { url: objectUrl },
					replyToMessage: null,
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
				const messageType = isVideo ? "Video" : isOnceImage ? "ExpiringImage" : "Image";
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

	const onAudioRecorded = useCallback((blob: Blob, durationMs: number) => {
		setPendingAudioBlob(blob);
		setPendingAudioDuration(durationMs);
	}, []);

	const cancelAudio = useCallback(() => {
		setPendingAudioBlob(null);
		setPendingAudioDuration(0);
	}, []);

	const confirmAudio = useCallback(async () => {
		if (!pendingAudioBlob || !userId) return;
		const targetIdValue = selectedConversation
			? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
			: targetProfileId;
		if (!targetIdValue) return;
		setIsSendingAudio(true);
		try {
			const audioBytes = new Uint8Array(await pendingAudioBlob.arrayBuffer());
			const uploaded = await service.uploadChatMedia({
				multipart: { body: audioBytes, contentType: pendingAudioBlob.type || "audio/webm" },
				options: { looping: false, takenOnGrindr: false },
			});
			await service.sendMessage({
				type: "Audio",
				target: { type: "Direct", targetId: Number(targetIdValue) },
				body: {
					mediaId: uploaded.mediaId,
					mediaHash: uploaded.mediaHash,
					url: uploaded.url,
					contentType: pendingAudioBlob.type || "audio/webm",
					length: pendingAudioDuration,
				},
			});
			setPendingAudioBlob(null);
			setPendingAudioDuration(0);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("chat.errors.send_failed"));
		} finally {
			setIsSendingAudio(false);
		}
	}, [pendingAudioBlob, pendingAudioDuration, userId, selectedConversation, targetProfileId, service, t]);

	const handleSend = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void sendTextMessage(draft);
	};

	const handleRetry = (message: UiMessage) => {
		if (!message.body || typeof message.body !== "object") {
			return;
		}

		if (message.type === "Image" || message.type === "ExpiringImage") {
			toast.error(t("chat.errors.reupload_image"));
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
		setThreadMessages((current) =>
			current.map((item) =>
				item.messageId === message.messageId
					? {
							...item,
							unsent: true,
							body: null,
							type: "Retract",
						}
					: item,
			),
		);

		try {
			await service.unsendMessage({
				conversationId: selectedConversation.data.conversationId,
				messageId: message.messageId,
			});
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
		if (!selectedConversation) return;
		const recipient = getOtherParticipant(selectedConversation, userId);
		if (!recipient) return;
		setIsSharingAlbum(true);
		try {
			await service.shareAlbum({ albumId, profiles: [{ profileId: recipient.profileId, expirationType: expirationType as any }] });
			toast.success(t("chat.toasts.album_shared"));
			void loadThread({ conversationId: selectedConversation.data.conversationId, older: false });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.errors.album_share_failed"));
		} finally {
			setIsSharingAlbum(false);
		}
	}, [selectedConversation, userId, t, loadThread]);

	const openAlbumViewerById = useCallback(
		async (albumId: number) => {
			albumViewerCancelledRef.current = false;
			setIsAlbumSheetOpen(true);
			setIsAlbumViewerLoading(true);
			setAlbumViewer(null);
			setAlbumViewerMediaIndex(null);
			try {
				const details = await service.getAlbum(albumId);
				if (albumViewerCancelledRef.current) return;
				setAlbumViewer({
					albumId: details.albumId,
					albumName: details.albumName,
					content: details.content,
				});
			} catch (error) {
				if (albumViewerCancelledRef.current) return;
				setIsAlbumSheetOpen(false);
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.album_open_failed"),
				);
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
		const cid = selectedConversationId ?? conversations[0]?.data.conversationId;
		if (!cid) return;

		setIsLoadingDrawer(true);
		setDrawerError(null);
		try {
			const media = await service.getDrawerMedia(cid);
			setDrawerMedia(media);
		} catch (error) {
			const message = error instanceof Error ? error.message : t("chat.errors.load_drawer_media");
			setDrawerError(message);
			toast.error(message);
		} finally {
			setIsLoadingDrawer(false);
		}
	}, [selectedConversationId, conversations, service, t]);

	const toggleDrawer = useCallback(async () => {
		if (isDrawerOpen) {
			setIsDrawerOpen(false);
			return;
		}

		setIsDrawerOpen(true);
		const [, ] = await Promise.all([
			drawerMedia.length === 0 ? loadDrawerMedia() : Promise.resolve(),
			shareableAlbums.length === 0 ? loadAlbums() : Promise.resolve(),
		]);
	}, [isDrawerOpen, drawerMedia.length, loadDrawerMedia, shareableAlbums.length, loadAlbums]);

	const sendDrawerMedia = useCallback(
		async (mediaIds: number[], maxViews?: number) => {
			if (!selectedConversation || !userId || mediaIds.length === 0) {
				return;
			}

			const targetProfileIdValue = getOtherParticipant(selectedConversation, userId)
				?.profileId ?? null;
			if (!targetProfileIdValue) {
				toast.error(t("chat.errors.missing_recipient"));
				return;
			}

			setIsSendingDrawerMedia(true);
			let finalSentMessage: UiMessage | undefined;
			try {
				// Send each media item as a separate image/video message
				for (const mediaId of mediaIds) {
					const media = drawerMedia.find((m) => m.id === mediaId);
					if (!media) continue;

					const isVideo = media.contentType.startsWith("video");
					const views = maxViews ?? 2147483647;
					const isOnceImage = !isVideo && views === 1;
					const messageType = isOnceImage ? "ExpiringImage" : isVideo ? "Video" : "Image";

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
					});

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
			userId,
			drawerMedia,
			service,
			t,
			syncConversation,
			loadDrawerMedia,
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
		setFullScreenImageUrl(imageUrl);
		setFullScreenImageMeta(meta ?? null);
		setFullScreenMediaType(mediaType);
	}, []);

	const closeFullScreenImage = useCallback(() => {
		if (!fullScreenImageUrl) {
			return;
		}

		setFullScreenImageUrl(null);

		if (imageViewerHistoryPushedRef.current) {
			imageViewerHistoryPushedRef.current = false;
			window.history.back();
		}
	}, [fullScreenImageUrl]);

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
			setFullScreenImageUrl(null);
		};

		window.addEventListener("popstate", handlePopState);

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [fullScreenImageUrl]);

	const renderInbox = (
		<ChatInboxPanel
			isDesktop={isDesktop}
			isLoadingInbox={isLoadingInbox}
			isLoadingMoreInbox={isLoadingMoreInbox}
			inboxError={inboxError}
			inboxFilters={inboxFilters}
			hidePinned={hidePinned}
			hasActiveInboxFilters={hasActiveInboxFilters}
			filteredConversations={filteredConversations}
			nextPage={nextPage}
			realtimeStatusMeta={realtimeStatusMeta}
			selectedConversationId={selectedConversationId}
			userId={userId}
			localNicknamesByProfileId={localNicknamesByProfileId}
			chatContactIndexByProfileId={chatContactIndexByProfileId}
			nowTimestamp={nowTimestamp}
			presenceResults={presenceResults}
			inboxListRef={inboxListRef}
			onRefreshInbox={() => void loadInbox({ page: 1, replace: true })}
			onLoadMoreInbox={handleLoadMoreInbox}
			onInboxTouchStart={handleInboxTouchStart}
			onInboxTouchEnd={handleInboxTouchEnd}
			onSelectConversation={handleSelectConversation}
			onViewProfile={(profileId) => {
				const returnTo = getProfileReturnToChatPath(profileId);
				const nextParams = new URLSearchParams();
				nextParams.set("returnTo", returnTo);
				navigate(`/profile/${profileId}?${nextParams.toString()}`, { state: { returnTo } });
			}}
			onClearInboxFilters={clearInboxFilters}
			onToggleHidePinned={() => setHidePinned((prev) => !prev)}
			onToggleFavoritesOnly={toggleInboxFavoritesOnly}
			onOpenFilters={(inboxFiltersDraft) =>
				navigate("/chat/filters", {
					state: {
						inboxFiltersDraft,
						returnTo: `${location.pathname}${location.search}`,
					},
				})
			}
			onOpenSearch={() => navigate("/chat/search")}
			onOpenInbox={() => navigate("/chat")}
			onOpenAlbums={() => navigate("/settings/shared-albums")}
		/>
	);

	const renderSearch = <ChatSearchPage />;

	const renderThread = (
		<ChatThreadPanel
			navigate={navigate}
			isDesktop={isDesktop}
			selectedConversation={selectedConversation}
			targetProfileId={targetProfileId}
			userId={userId}
			nowTimestamp={nowTimestamp}
			presenceResults={presenceResults}
			isUpdatingConversationState={isUpdatingConversationState}
			isHeaderActionsMenuOpen={isHeaderActionsMenuOpen}
			setIsHeaderActionsMenuOpen={setIsHeaderActionsMenuOpen}
			headerActionsMenuRef={headerActionsMenuRef}
			togglePin={togglePin}
			toggleMute={toggleMute}
			clearLocalHistory={clearLocalHistory}
			onDeleteConversation={deleteConversationFromChat}
			isDeletingConversation={isDeletingConversationId !== null}
			onBlockProfile={blockProfileFromChat}
			isBlockingProfile={isBlockingProfileId !== null}
			onToggleFavorite={toggleFavoriteFromChat}
			isFavorite={selectedConversation?.data.favorite ?? false}
			isTogglingFavorite={isTogglingFavoriteProfileId !== null}
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
		/>
	);

	return (
		<section
			className={`app-screen ${isDesktop ? "overflow-hidden" : "!p-0 !max-w-none !w-full"}`}
		>
			<div className={isDesktop ? "mx-auto w-full max-w-6xl" : "w-full"}>

        				{isSearchRoute ? (
        					renderSearch
        				) : isDesktop ? (
        					<div
        						className="grid h-full grid-cols-[360px_minmax(0,1fr)] gap-3"
        						style={{
        							height:
        								"calc(100dvh - (env(safe-area-inset-top, 0px) + 16px) - (env(safe-area-inset-bottom, 0px) + 92px))",
						}}
					>
						{renderInbox}
						{renderThread}
					</div>
				) : selectedConversation ?? targetProfileId ? (
					renderThread
				) : (
					renderInbox
				)}
			</div>

			{isChatMediaSheetOpen && selectedConversation ? (() => {
				const otherP = getOtherParticipant(selectedConversation, userId);
				const otherPhotoUrl = otherP?.primaryMediaHash && validateMediaHash(otherP.primaryMediaHash)
					? getThumbImageUrl(otherP.primaryMediaHash, "75x75")
					: null;
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
			/>

			<PhotoViewer
				isOpen={!!fullScreenImageUrl}
				onClose={closeFullScreenImage}
				photos={fullScreenImageUrl ? [{ url: fullScreenImageUrl, type: fullScreenMediaType }] : []}
				renderExtraInfo={fullScreenImageMeta ? () => (
                    <p className="inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
                        <style>{`
                            @keyframes logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
                            .logo-shine { animation: logo-shine 2.8s ease-in-out infinite; }
                        `}</style>
                        {fullScreenImageMeta.takenOnGrindr ? (
                            <img
                                src={freegrindLogo}
                                alt={t("chat.thread.taken_on_grindr")}
                                className="h-3.5 w-3.5 rounded-full logo-shine"
                            />
                        ) : null}
                        {fullScreenImageMeta.timestamp ? (
                            <span>{formatDateTime24(fullScreenImageMeta.timestamp)}</span>
                        ) : null}
                    </p>
				) : undefined}
			/>
		</section>
	);
}
