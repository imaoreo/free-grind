import {
	ChevronLeft,
	ChevronRight,
	Loader2,
	X,
} from "lucide-react";
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
import { usePresenceCheckBatch } from "../../hooks/usePresenceCheck";
import { useAuth } from "../../contexts/useAuth";
import { type ChatApiError } from "../../services/chatService";
import { setConversationDirectory } from "../../services/conversationDirectory";
import {
	CHAT_REALTIME_EVENT,
	CHAT_REALTIME_STATUS,
} from "../../components/ChatRealtimeBridge";
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
import {
	indexConversations,
	indexMessages,
	searchMessagesLocal,
} from "./chat/cache";
import { ChatSearchPage } from "./ChatSearchPage";
import { ChatInboxPanel } from "./chat/ChatInboxPanel";
import { ChatThreadPanel } from "./chat/ChatThreadPanel";
import * as chatLog from "../../services/chatLog";
import {
	buildBinaryUpload,
	extractImageHashFromSignedUrl,
	getMessageImageUrl,
	getMessageMediaId,
	getMessagePreviewLabel,
	getOtherParticipant,
	isLocalClientMessageId,
	parseChatFiltersFromLocationState,
	useDesktopBreakpoint,
} from "./chat/chatUtils";
import { appLog } from "../../utils/logger";


export function ChatPage() {
	const { t } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const { conversationId: routeConversationId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const service = useApiFunctions();
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

	const [conversations, setConversations] = useState<ConversationEntry[]>([]);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [isLoadingMoreInbox, setIsLoadingMoreInbox] = useState(false);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [inboxFilters, setInboxFilters] = useState<InboxFilters>({});
	const [selectedDesktopConversationId, setSelectedDesktopConversationId] =
		useState<string | null>(null);

	useEffect(() => {
		const nextFilters = parseChatFiltersFromLocationState(location.state);
		if (nextFilters) {
			setInboxFilters(nextFilters);
		}
	}, [location.key, location.state]);

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

	const [threadConversationId, setThreadConversationId] = useState<
		string | null
	>(null);
	const [threadMessages, setThreadMessages] = useState<UiMessage[]>([]);
	const [messagePageKey, setMessagePageKey] = useState<string | null>(null);
	const [isLoadingThread, setIsLoadingThread] = useState(false);
	const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
	const [threadError, setThreadError] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [isSending, setIsSending] = useState(false);
	const [isUpdatingConversationState, setIsUpdatingConversationState] =
		useState(false);

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
	const [pendingAlbumShare, setPendingAlbumShare] = useState<{
		albumId: number;
		albumName: string;
	} | null>(null);
	const [albumViewer, setAlbumViewer] = useState<AlbumViewerState | null>(null);
	const [albumViewerMediaIndex, setAlbumViewerMediaIndex] = useState<
		number | null
	>(null);
	const [isAlbumViewerLoading, setIsAlbumViewerLoading] = useState(false);
	const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(
		null,
	);

	const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [pendingAttachmentFile, setPendingAttachmentFile] =
		useState<File | null>(null);
	const [attachmentLooping, setAttachmentLooping] = useState(false);
	const [attachmentTakenOnGrindr, setAttachmentTakenOnGrindr] = useState(false);
	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const searchQuery = "";
	const imageViewerHistoryPushedRef = useRef(false);
	const inboxTouchStartXRef = useRef<number | null>(null);
	const inboxListRef = useRef<HTMLDivElement | null>(null);
	const [pendingMessageScrollId, setPendingMessageScrollId] = useState<
		string | null
	>(null);
	const [activeThreadSearchIndex, setActiveThreadSearchIndex] = useState(0);
	const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");

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
			const map = new Map<string, UiMessage>();
			for (const message of previous) {
				map.set(message.messageId, message);
			}
			for (const message of messages) {
				if (
					activeConversationId &&
					message.conversationId !== activeConversationId
				) {
					continue;
				}
				map.set(message.messageId, message);
			}

			return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
		});

		const byConversation = new Map<string, Message>();
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
		}

		setConversations((previous) =>
			previous.map((conversation) => {
				const latestMessage = byConversation.get(
					conversation.data.conversationId,
				);
				if (!latestMessage) {
					return conversation;
				}

				const text = getMessagePreviewLabel(latestMessage, t);

				return {
					...conversation,
					data: {
						...conversation.data,
						lastActivityTimestamp: latestMessage.timestamp,
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
			}),
		);
	}, []);

	const applyRealtimeEnvelope = useCallback(
		(envelope: RealtimeEnvelope) => {
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
		[mergeIncomingMessages],
	);

	const handleRealtimeEvent = useCallback(
		(envelope: RealtimeEnvelope) => {
			appLog.debug("[chat-ws:event]", envelope);
			applyRealtimeEnvelope(envelope);
		},
		[applyRealtimeEnvelope],
	);

	const handleRealtimeStatus = useCallback((status: RealtimeStatus) => {
		appLog.debug("[chat-ws:status]", status);
		setRealtimeStatus(status);
	}, []);

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
		async ({ page, replace }: { page: number; replace: boolean }) => {
			if (replace) {
				setIsLoadingInbox(true);
				setInboxError(null);
			} else {
				setIsLoadingMoreInbox(true);
			}

			try {
				const response = await service.listConversations({
					page,
					filters: activeInboxFiltersRef.current,
				});

				setConversations((previous) => {
					if (replace) {
						return response.entries;
					}

					const map = new Map<string, ConversationEntry>();
					for (const entry of previous) {
						map.set(entry.data.conversationId, entry);
					}
					for (const entry of response.entries) {
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
		[service, targetProfileId],
	);

	const loadThread = useCallback(
		async ({
			conversationId,
			older,
		}: {
			conversationId: string;
			older: boolean;
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
				setIsLoadingThread(true);
				setThreadError(null);
				setThreadConversationId(conversationId);
			}

			try {
				const response = await service.listMessages({
					conversationId,
					pageKey: older ? (messagePageKeyRef.current ?? undefined) : undefined,
					includeProfile: true,
				});

				const localMessages = await chatLog.readLog(conversationId);
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
				void chatLog.appendMessages(conversationId, responseMessages);

				if (!older) {
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

								setThreadMessages((previous) => {
									const map = new Map<string, UiMessage>();
									for (const message of previous) {
										map.set(message.messageId, message);
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
									for (const message of previous)
										map.set(message.messageId, message);
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
				}

				setThreadMessages((previous) => {
					const map = new Map<string, UiMessage>();
					if (older) {
						// Older messages prepended; keep existing (including any local-only).
						for (const message of responseMessages)
							map.set(message.messageId, message);
						for (const message of previous) map.set(message.messageId, message);
					} else {
						// Fresh load: preserve already-surfaced local-only messages
						// only for this conversation.
						for (const message of previous) {
							if (
								message._localOnly &&
								message.conversationId === conversationId
							) {
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
					void chatLog.readLog(conversationId).then(async (localMessages) => {
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

						if (!localOnly.length) return;
						setThreadMessages((previous) => {
							const map = new Map<string, UiMessage>();
							for (const message of previous)
								map.set(message.messageId, message);
							for (const message of localOnly) {
								if (!map.has(message.messageId)) {
									map.set(message.messageId, message);
								}
							}
							return [...map.values()].sort(
								(a, b) => a.timestamp - b.timestamp,
							);
						});
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
								syncConversation((conversation) => ({
									...conversation,
									data: { ...conversation.data, unreadCount: 0 },
								}));
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

	const handleThreadScroll = useCallback(() => {
		const container = threadScrollContainerRef.current;
		if (
			!container ||
			isLoadingOlderMessagesRef.current ||
			!messagePageKeyRef.current
		) {
			return;
		}

		if (container.scrollTop <= 40 && selectedConversationIdRef.current) {
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
		const baseIntervalMs =
			realtimeStatus === "connected"
				? 60_000
				: realtimeStatus === "reconnecting" || realtimeStatus === "error"
					? 12_000
					: 20_000;
		const intervalMs = document.hidden
			? Math.max(baseIntervalMs * 2, 30_000)
			: baseIntervalMs;

		const intervalId = window.setInterval(() => {
			void loadInbox({ page: 1, replace: true });
			if (selectedConversationId) {
				void loadThread({
					conversationId: selectedConversationId,
					older: false,
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
			setThreadError(null);
			return;
		}

		void loadThread({ conversationId: selectedConversationId, older: false });
	}, [loadThread, selectedConversationId]);

	useEffect(() => {
		if (!threadMessages.length) {
			return;
		}

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

		threadBottomRef.current?.scrollIntoView({ block: "end" });
	}, [threadMessages.length]);

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

	const filteredConversations = conversations;

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

	const sendTextMessage = useCallback(
		async (text: string, retryMessageId?: string) => {
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
						replyToMessage: null,
						replyPreview: null,
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
			selectedConversation,
			service,
			syncConversation,
			targetProfileId,
			userId,
		],
	);

	const sendMediaAttachment = useCallback(
		async (
			file: File,
			options: { looping: boolean; takenOnGrindr: boolean },
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
				const uploaded = await service.uploadChatMedia({
					multipart: binaryUpload,
					options: {
						looping: options.looping,
						takenOnGrindr: options.takenOnGrindr,
					},
				});
				setUploadProgress(96);

				const imageUrl = uploaded.url;
				const imageHash = imageUrl
					? uploaded.mediaHash || extractImageHashFromSignedUrl(imageUrl)
					: uploaded.mediaHash;
				const messageType = isVideo ? "Video" : "Image";
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
	}, []);

	const confirmPendingAttachment = useCallback(() => {
		if (!pendingAttachmentFile) {
			return;
		}

		void sendMediaAttachment(pendingAttachmentFile, {
			looping: attachmentLooping,
			takenOnGrindr: attachmentTakenOnGrindr,
		});
		setPendingAttachmentFile(null);
		setAttachmentLooping(false);
		setAttachmentTakenOnGrindr(false);
	}, [
		attachmentLooping,
		attachmentTakenOnGrindr,
		pendingAttachmentFile,
		sendMediaAttachment,
	]);

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

		void sendTextMessage(body.text, message.messageId);
	};

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

	const shareAlbumToCurrentConversation = useCallback(
		async (albumId: number, albumName?: string | null) => {
			if (!selectedConversation || !userId) {
				return;
			}
			const targetProfile = getOtherParticipant(selectedConversation, userId);
			if (!targetProfile?.profileId) {
				toast.error(t("chat.errors.album_share_missing_recipient"));
				return;
			}

			setPendingAlbumShare({
				albumId,
				albumName: albumName?.trim() || t("chat.album_fallback", { id: albumId }),
			});
		},
		[selectedConversation, t, userId],
	);

	const closePendingAlbumShare = useCallback(() => {
		if (isSharingAlbum) {
			return;
		}

		setPendingAlbumShare(null);
	}, [isSharingAlbum]);

	const confirmPendingAlbumShare = useCallback(async () => {
		if (!selectedConversation || !userId || !pendingAlbumShare) {
			return;
		}

		const targetProfile = getOtherParticipant(selectedConversation, userId);
		if (!targetProfile?.profileId) {
			toast.error(t("chat.errors.album_share_missing_recipient"));
			return;
		}

		setIsSharingAlbum(true);
		try {
			await service.shareAlbum({
				albumId: pendingAlbumShare.albumId,
				profiles: [
					{
						profileId: targetProfile.profileId,
						expirationType: "INDEFINITE",
					},
				],
			});
			toast.success(t("chat.toasts.album_shared"));
			setPendingAlbumShare(null);
			setIsAlbumPickerOpen(false);
			void loadThread({
				conversationId: selectedConversation.data.conversationId,
				older: false,
			});
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("chat.errors.album_share_failed"),
			);
		} finally {
			setIsSharingAlbum(false);
		}
	}, [loadThread, pendingAlbumShare, selectedConversation, service, t, userId]);

	const openAlbumViewerById = useCallback(
		async (albumId: number) => {
			setIsAlbumViewerLoading(true);
			try {
				const details = await service.getAlbum(albumId);
				setAlbumViewer({
					albumId: details.albumId,
					albumName: details.albumName,
					content: details.content,
				});
				setAlbumViewerMediaIndex(null);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : t("chat.errors.album_open_failed"),
				);
			} finally {
				setIsAlbumViewerLoading(false);
			}
		},
		[service],
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

	const showPreviousAlbumMedia = useCallback(() => {
		if (!albumViewer || albumViewerMediaIndex === null) {
			return;
		}

		setAlbumViewerMediaIndex(
			(albumViewerMediaIndex - 1 + albumViewer.content.length) %
				albumViewer.content.length,
		);
	}, [albumViewer, albumViewerMediaIndex]);

	const showNextAlbumMedia = useCallback(() => {
		if (!albumViewer || albumViewerMediaIndex === null) {
			return;
		}

		setAlbumViewerMediaIndex(
			(albumViewerMediaIndex + 1) % albumViewer.content.length,
		);
	}, [albumViewer, albumViewerMediaIndex]);

	useEffect(() => {
		if (albumViewerMediaIndex === null) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closeAlbumMediaViewer();
				return;
			}

			if (event.key === "ArrowLeft") {
				showPreviousAlbumMedia();
				return;
			}

			if (event.key === "ArrowRight") {
				showNextAlbumMedia();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		albumViewerMediaIndex,
		closeAlbumMediaViewer,
		showNextAlbumMedia,
		showPreviousAlbumMedia,
	]);

	const toggleAlbumPicker = useCallback(async () => {
		if (isAlbumPickerOpen) {
			setIsAlbumPickerOpen(false);
			return;
		}

		const albums = shareableAlbums.length > 0 ? shareableAlbums : await loadAlbums();
		const shareable = albums.filter((album) => album.isShareable);

		if (shareable.length === 1) {
			void shareAlbumToCurrentConversation(
				shareable[0].albumId,
				shareable[0].albumName,
			);
			return;
		}

		setIsAlbumPickerOpen(true);
	}, [
		isAlbumPickerOpen,
		loadAlbums,
		shareAlbumToCurrentConversation,
		shareableAlbums,
	]);

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
	};

	const openFullScreenImage = useCallback((imageUrl: string) => {
		setFullScreenImageUrl(imageUrl);
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
			hasActiveInboxFilters={hasActiveInboxFilters}
			filteredConversations={filteredConversations}
			nextPage={nextPage}
			realtimeStatusMeta={realtimeStatusMeta}
			selectedConversationId={selectedConversationId}
			userId={userId}
			nowTimestamp={nowTimestamp}
			presenceResults={presenceResults}
			inboxListRef={inboxListRef}
			onRefreshInbox={() => void loadInbox({ page: 1, replace: true })}
			onLoadMoreInbox={handleLoadMoreInbox}
			onInboxTouchStart={handleInboxTouchStart}
			onInboxTouchEnd={handleInboxTouchEnd}
			onSelectConversation={handleSelectConversation}
			onClearInboxFilters={clearInboxFilters}
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
			threadBottomRef={threadBottomRef}
			handleSend={handleSend}
			toggleAlbumPicker={toggleAlbumPicker}
			attachmentInputRef={attachmentInputRef}
			onAttachmentInput={onAttachmentInput}
			isUploadingAttachment={isUploadingAttachment}
			pendingAttachmentFile={pendingAttachmentFile}
			attachmentLooping={attachmentLooping}
			attachmentTakenOnGrindr={attachmentTakenOnGrindr}
			setAttachmentLooping={setAttachmentLooping}
			setAttachmentTakenOnGrindr={setAttachmentTakenOnGrindr}
			confirmPendingAttachment={confirmPendingAttachment}
			cancelPendingAttachment={cancelPendingAttachment}
			isAlbumPickerOpen={isAlbumPickerOpen}
			isLoadingAlbums={isLoadingAlbums}
			shareableAlbums={shareableAlbums}
			isSharingAlbum={isSharingAlbum}
				pendingAlbumShare={pendingAlbumShare}
			shareAlbumToCurrentConversation={shareAlbumToCurrentConversation}
			confirmPendingAlbumShare={confirmPendingAlbumShare}
			closePendingAlbumShare={closePendingAlbumShare}
			uploadProgress={uploadProgress}
			draft={draft}
			setDraft={setDraft}
			isSending={isSending}
			selectedActionMessage={selectedActionMessage}
			selectedActionMessageMine={selectedActionMessageMine}
			albumViewer={albumViewer}
		/>
	);

	return (
		<section
			className={`app-screen${isDesktop ? " overflow-hidden" : ""}`}
			style={isDesktop ? undefined : { paddingLeft: 0, paddingRight: 0 }}
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

			{isAlbumViewerLoading ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
					<div className="surface-card flex items-center gap-2 p-4 text-sm text-[var(--text-muted)]">
						<Loader2 className="h-4 w-4 animate-spin" /> {t("chat.loading_album")}
					</div>
				</div>
			) : null}

			{albumViewer ? (
				<div
					className="fixed inset-0 z-40 bg-black/65 p-4"
					onClick={() => {
						setAlbumViewerMediaIndex(null);
						setAlbumViewer(null);
					}}
				>
					<div
						className="mx-auto flex h-full w-full max-w-4xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between">
							<p className="font-semibold">
								{albumViewer.albumName || "Album"}
							</p>
							<button
								type="button"
								onClick={() => {
									setAlbumViewerMediaIndex(null);
									setAlbumViewer(null);
								}}
								className="rounded-lg border border-[var(--border)] p-2"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						<div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
							{albumViewer.content.map((item, index) => {
								const mediaUrl = item.url || item.thumbUrl || item.coverUrl;
								if (!mediaUrl) {
									return (
										<div
											key={item.contentId}
											className="flex min-h-24 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--text-muted)]"
										>
											Unavailable
										</div>
									);
								}

								return (
									<button
										type="button"
										key={item.contentId}
										onClick={() => openAlbumMediaViewer(index)}
										className="relative overflow-hidden rounded-lg"
									>
										<img
											src={mediaUrl}
											alt="Album content"
											className="h-32 w-full object-cover"
										/>
										{item.contentType?.startsWith("video/") ? (
											<span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
												Video
											</span>
										) : null}
									</button>
								);
							})}
						</div>
					</div>
				</div>
			) : null}

			{albumViewer && albumViewerMediaIndex !== null
				? (() => {
						const selected = albumViewer.content[albumViewerMediaIndex] ?? null;
						if (!selected) {
							return null;
						}
						const mediaUrl =
							selected.url || selected.thumbUrl || selected.coverUrl;
						if (!mediaUrl) {
							return null;
						}

						const isVideo = selected.contentType?.startsWith("video/");
						return (
							<div
								className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6"
								onClick={closeAlbumMediaViewer}
							>
								<button
									type="button"
									onClick={(event) => {
										event.stopPropagation();
										closeAlbumMediaViewer();
									}}
									className="absolute right-3 top-3 z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5"
									aria-label="Close album media viewer"
								>
									<X className="h-5 w-5" />
								</button>

								<div
									className="relative z-[82] flex max-h-full w-full max-w-5xl flex-col items-center justify-center gap-3"
									onClick={(event) => event.stopPropagation()}
								>
									<button
										type="button"
										onClick={showPreviousAlbumMedia}
										className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11"
										aria-label="Previous album media"
									>
										<ChevronLeft className="h-5 w-5" />
									</button>
									<button
										type="button"
										onClick={showNextAlbumMedia}
										className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11"
										aria-label="Next album media"
									>
										<ChevronRight className="h-5 w-5" />
									</button>

									{isVideo ? (
										<video
											src={mediaUrl}
											controls
											className="max-h-[82vh] w-auto max-w-full rounded-xl object-contain"
										/>
									) : (
										<img
											src={mediaUrl}
											alt="Album content"
											className="max-h-[82vh] w-auto max-w-full rounded-xl object-contain"
										/>
									)}

									<p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
										{albumViewerMediaIndex + 1} / {albumViewer.content.length}
									</p>
								</div>
							</div>
						);
					})()
				: null}

			{fullScreenImageUrl ? (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
					onClick={closeFullScreenImage}
				>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							closeFullScreenImage();
						}}
						className="absolute right-4 top-4 rounded-lg border border-white/40 p-2 text-white"
					>
						<X className="h-4 w-4" />
					</button>
					<img
						src={fullScreenImageUrl}
						alt="Media"
						className="max-h-full max-w-full rounded-xl object-contain"
						onClick={(event) => event.stopPropagation()}
					/>
				</div>
			) : null}
		</section>
	);
}
