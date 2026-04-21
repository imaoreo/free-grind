import {
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	Ellipsis,
	Flame,
	ImagePlus,
	Loader2,
	MessageCircle,
	Pin,
	Search,
	Share2,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../contexts/AuthContext";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	createChatService,
	type ChatApiError,
} from "../../services/chatService";
import {
	ChatRealtimeManager,
	type RealtimeStatus,
	type RealtimeEnvelope,
} from "../../services/chatRealtime";
import {
	messageSchema,
	type ConversationEntry,
	type InboxFilters,
	type Message,
} from "../../types/chat";
import {
	getProfileImageUrl,
	getThumbImageUrl,
	validateMediaHash,
} from "../../utils/media";
import {
	indexConversations,
	indexMessages,
	searchConversationsLocal,
	searchMessagesLocal,
} from "./chat/cache";
import * as chatLog from "../../services/chatLog";

type UiMessage = Message & {
	clientState?: "pending" | "failed";
	/** True when the message was only found in the local log, not in the API response. */
	_localOnly?: boolean;
};

type AlbumListItem = {
	albumId: number;
	albumName: string | null;
	isShareable: boolean;
};

type AlbumContentItem = {
	contentId: number;
	contentType: string | null;
	thumbUrl: string | null;
	url: string | null;
	coverUrl: string | null;
	processing: boolean;
};

type AlbumViewerState = {
	albumId: number;
	albumName: string | null;
	content: AlbumContentItem[];
};

type SearchMode = "conversations" | "messages" | "profiles";

type InboxFilterKey =
	| "unreadOnly"
	| "favoritesOnly"
	| "chemistryOnly"
	| "rightNowOnly"
	| "onlineNowOnly";

const inboxFilterOptions: Array<{ key: InboxFilterKey; label: string }> = [
	{ key: "unreadOnly", label: "Unread" },
	{ key: "favoritesOnly", label: "Favorites" },
	{ key: "chemistryOnly", label: "Chemistry" },
	{ key: "rightNowOnly", label: "Right now" },
	{ key: "onlineNowOnly", label: "Online" },
];

type ProfileSearchResult = {
	profileId: number;
	displayName: string;
	age: number | null;
	distance: number | null;
	profileImageMediaHash: string | null;
	hasAlbum: boolean;
	showDistance: boolean;
};

const inboxRelativeTime = new Intl.RelativeTimeFormat(undefined, {
	numeric: "auto",
});

async function buildBinaryUpload(file: File): Promise<{
	body: Uint8Array;
	contentType: string;
}> {
	const fileBytes = new Uint8Array(await file.arrayBuffer());
	return {
		body: fileBytes,
		contentType: file.type || "application/octet-stream",
	};
}

function formatConversationTime(timestamp: number | null | undefined): string {
	if (!timestamp) {
		return "";
	}

	const now = Date.now();
	const diffMs = timestamp - now;
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;
	const dayMs = 24 * hourMs;

	if (Math.abs(diffMs) < hourMs) {
		return inboxRelativeTime.format(Math.round(diffMs / minuteMs), "minute");
	}

	if (Math.abs(diffMs) < dayMs) {
		return inboxRelativeTime.format(Math.round(diffMs / hourMs), "hour");
	}

	if (Math.abs(diffMs) < dayMs * 7) {
		return inboxRelativeTime.format(Math.round(diffMs / dayMs), "day");
	}

	return new Date(timestamp).toLocaleDateString();
}

function formatMessageTime(timestamp: number, now: number): string {
	const diffMs = now - timestamp;
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;

	if (diffMs < hourMs) {
		const minsAgo = Math.max(0, Math.floor(diffMs / minuteMs));
		if (minsAgo <= 1) {
			return "1 min ago";
		}
		return `${minsAgo} mins ago`;
	}

	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

function highlightMatch(
	text: string,
	query: string,
): Array<{ text: string; match: boolean }> {
	const needle = query.trim().toLowerCase();
	if (!needle) {
		return [{ text, match: false }];
	}

	const source = text;
	const lower = source.toLowerCase();
	const parts: Array<{ text: string; match: boolean }> = [];
	let cursor = 0;

	while (cursor < source.length) {
		const found = lower.indexOf(needle, cursor);
		if (found < 0) {
			parts.push({ text: source.slice(cursor), match: false });
			break;
		}

		if (found > cursor) {
			parts.push({ text: source.slice(cursor, found), match: false });
		}

		parts.push({
			text: source.slice(found, found + needle.length),
			match: true,
		});
		cursor = found + needle.length;
	}

	return parts.length > 0 ? parts : [{ text: source, match: false }];
}

function getPreviewText(conversation: ConversationEntry): string {
	const preview = conversation.data.preview;
	if (!preview) {
		return "No messages yet";
	}

	if (preview.text?.trim()) {
		return preview.text;
	}

	switch (preview.type) {
		case "Image":
		case "ExpiringImage":
			return "Sent an image";
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return "Shared an album";
		case "Audio":
			return "Sent an audio message";
		case "AlbumContentReaction":
			return "Reacted to album content";
		case "Video":
			return "Sent a video";
		default:
			return "Sent a message";
	}
}

function getMessagePreviewLabel(message: Message): string {
	if (
		typeof (message.body as Record<string, unknown> | null)?.text === "string"
	) {
		return String((message.body as Record<string, unknown>).text);
	}

	switch (message.type) {
		case "Image":
		case "ExpiringImage":
			return "Sent an image";
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return "Shared an album";
		case "Audio":
			return "Sent an audio message";
		case "AlbumContentReaction":
			return "Reacted to album content";
		case "Video":
			return "Sent a video";
		default:
			return "Sent a message";
	}
}

function getMessageText(message: UiMessage): string {
	if (!message.body || typeof message.body !== "object") {
		if (message.unsent) {
			return "This message was unsent";
		}
		if (message.type === "Image" || message.type === "ExpiringImage") {
			return "[image]";
		}
		if (message.type === "Audio") {
			return "[audio]";
		}
		return "[unsupported message]";
	}

	const body = message.body as Record<string, unknown>;
	if (typeof body.text === "string" && body.text.trim().length > 0) {
		return body.text;
	}

	if (
		message.type === "Album" ||
		message.type === "ExpiringAlbum" ||
		message.type === "ExpiringAlbumV2"
	) {
		return "Shared an album";
	}

	if (message.type === "Image" || message.type === "ExpiringImage") {
		return "Shared an image";
	}

	if (message.type === "Audio") {
		return "Shared an audio message";
	}

	if (message.type === "AlbumContentReaction") {
		return "Reacted to album content";
	}

	return `[${message.type}]`;
}

function getMessageImageUrl(message: UiMessage): string | null {
	const imageType = message.chat1Type?.toLowerCase();
	const isImageMessage =
		message.type === "Image" ||
		message.type === "ExpiringImage" ||
		imageType === "image" ||
		imageType === "expiring_image";

	if (!isImageMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const imageRecord =
		typeof body.image === "object" && body.image
			? (body.image as Record<string, unknown>)
			: null;

	const collectStringValues = (
		value: unknown,
		depth: number,
		out: string[],
	): void => {
		if (depth > 3) {
			return;
		}

		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				out.push(trimmed);
			}
			return;
		}

		if (!value || typeof value !== "object") {
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				collectStringValues(item, depth + 1, out);
			}
			return;
		}

		for (const nested of Object.values(value)) {
			collectStringValues(nested, depth + 1, out);
		}
	};

	const normalizeUrlCandidate = (candidate: string): string | null => {
		if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
			return candidate;
		}

		if (candidate.startsWith("/")) {
			return `https://cdns.grindr.com${candidate}`;
		}

		// Some payloads return CloudFront path without scheme.
		if (candidate.startsWith("d2wxe7lth7kp8g.cloudfront.net/")) {
			return `https://${candidate}`;
		}

		return null;
	};
	const urlCandidates: unknown[] = [
		body.url,
		body.imageUrl,
		body.mediaUrl,
		body.previewUrl,
		body.thumbUrl,
		body.signedUrl,
		body.cdnUrl,
		body.urlPath,
		imageRecord?.url,
		imageRecord?.imageUrl,
		imageRecord?.mediaUrl,
		imageRecord?.thumbUrl,
		imageRecord?.previewUrl,
		imageRecord?.signedUrl,
		imageRecord?.cdnUrl,
	];

	for (const candidate of urlCandidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			const normalized = normalizeUrlCandidate(candidate);
			if (normalized) {
				return normalized;
			}
		}
	}

	const discoveredStrings: string[] = [];
	collectStringValues(body, 0, discoveredStrings);
	for (const value of discoveredStrings) {
		const normalized = normalizeUrlCandidate(value);
		if (normalized) {
			return normalized;
		}
	}

	const hashCandidates: unknown[] = [
		body.imageHash,
		body.mediaHash,
		body.hash,
		body.fileCacheKey,
		imageRecord?.imageHash,
		imageRecord?.mediaHash,
		imageRecord?.hash,
		imageRecord?.fileCacheKey,
	];

	for (const hashCandidate of hashCandidates) {
		if (typeof hashCandidate !== "string") {
			continue;
		}

		const normalized = hashCandidate.trim();
		if (!normalized) {
			continue;
		}

		if (validateMediaHash(normalized)) {
			return getThumbImageUrl(normalized, "480x480");
		}

		// Fallback: some payloads send non-canonical hash-like values.
		if (/^[a-z0-9_-]{16,}$/i.test(normalized)) {
			return getThumbImageUrl(normalized, "480x480");
		}
	}

	return null;
}

function getMessageMediaId(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidate = body.mediaId;
	if (typeof candidate === "number" && Number.isFinite(candidate)) {
		return candidate;
	}
	if (typeof candidate === "string" && candidate.trim().length > 0) {
		const parsed = Number(candidate);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function extractImageHashFromSignedUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const pathParts = parsed.pathname.split("/").filter(Boolean);
		// Chat media URL format is typically /{uploaderProfileId}/{mediaHash}
		const hashCandidate = pathParts[pathParts.length - 1] ?? "";
		if (!hashCandidate) {
			return null;
		}
		if (validateMediaHash(hashCandidate)) {
			return hashCandidate;
		}
		return /^[a-z0-9_-]{16,}$/i.test(hashCandidate) ? hashCandidate : null;
	} catch {
		return null;
	}
}

function getMessageAudioUrl(message: UiMessage): string | null {
	const isAudioMessage =
		message.type === "Audio" || message.chat1Type?.toLowerCase() === "audio";
	if (!isAudioMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidates: unknown[] = [
		body.audioUrl,
		body.url,
		body.mediaUrl,
		(body.audio as Record<string, unknown> | null)?.url,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			return candidate;
		}
	}

	return null;
}

function isLocalClientMessageId(messageId: string): boolean {
	return (
		messageId.startsWith("local:") || messageId.startsWith("local-upload:")
	);
}

function getMessageAlbumId(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}
	const body = message.body as Record<string, unknown>;
	const rawAlbumId = body.albumId;
	const parsed =
		typeof rawAlbumId === "number"
			? rawAlbumId
			: typeof rawAlbumId === "string"
				? Number(rawAlbumId)
				: NaN;
	return Number.isFinite(parsed) ? parsed : null;
}

function getMessageAlbumCoverUrl(message: UiMessage): string | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}
	const body = message.body as Record<string, unknown>;
	if (typeof body.coverUrl === "string" && body.coverUrl.length > 0) {
		return body.coverUrl;
	}
	if (typeof body.previewUrl === "string" && body.previewUrl.length > 0) {
		return body.previewUrl;
	}
	return null;
}

function getOtherParticipant(
	conversation: ConversationEntry,
	userId: number | null,
) {
	return (
		conversation.data.participants.find(
			(participant) => participant.profileId !== userId,
		) ??
		conversation.data.participants[0] ??
		null
	);
}

function useDesktopBreakpoint() {
	const [isDesktop, setIsDesktop] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia("(min-width: 1024px)").matches
			: false,
	);

	useEffect(() => {
		const query = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	return isDesktop;
}

export function ChatPage() {
	const navigate = useNavigate();
	const { conversationId: routeConversationId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const { fetchRest, callMethod } = useApi();
	const { userId } = useAuth();
	const { geohash } = usePreferences();
	const service = useMemo(() => createChatService(fetchRest), [fetchRest]);
	const isDesktop = useDesktopBreakpoint();
	const threadBottomRef = useRef<HTMLDivElement | null>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
	const selectedConversationIdRef = useRef<string | null>(null);
	const messagePageKeyRef = useRef<string | null>(null);
	const isLoadingOlderMessagesRef = useRef(false);
	const selectedConversationUnreadCountRef = useRef(0);

	const [conversations, setConversations] = useState<ConversationEntry[]>([]);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [isLoadingInbox, setIsLoadingInbox] = useState(true);
	const [isLoadingMoreInbox, setIsLoadingMoreInbox] = useState(false);
	const [inboxError, setInboxError] = useState<string | null>(null);
	const [inboxFilters, setInboxFilters] = useState<InboxFilters>({});
	const [selectedDesktopConversationId, setSelectedDesktopConversationId] =
		useState<string | null>(null);

	const activeInboxFilters = useMemo(() => {
		const next: InboxFilters = {};
		for (const { key } of inboxFilterOptions) {
			if (inboxFilters[key]) {
				next[key] = true;
			}
		}
		return next;
	}, [inboxFilters]);

	const hasActiveInboxFilters = Object.keys(activeInboxFilters).length > 0;

	const toggleInboxFilter = useCallback((key: InboxFilterKey) => {
		setInboxFilters((previous) => ({
			...previous,
			[key]: !previous[key],
		}));
	}, []);

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
	const [isMutatingMessageId, setIsMutatingMessageId] = useState<string | null>(
		null,
	);

	const [isAlbumPickerOpen, setIsAlbumPickerOpen] = useState(false);
	const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
	const [isSharingAlbum, setIsSharingAlbum] = useState(false);
	const [shareableAlbums, setShareableAlbums] = useState<AlbumListItem[]>([]);
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
	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const [searchQuery, setSearchQuery] = useState("");
	const [startChatProfileIdDraft, setStartChatProfileIdDraft] = useState("");
	const [searchMode, setSearchMode] = useState<SearchMode>("messages");
	const [profileResults, setProfileResults] = useState<ProfileSearchResult[]>(
		[],
	);
	const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);
	const [profileSearchAfterDistance, setProfileSearchAfterDistance] = useState<
		string | null
	>(null);
	const [profileSearchAfterProfileId, setProfileSearchAfterProfileId] =
		useState<string | null>(null);
	const [pendingMessageScrollId, setPendingMessageScrollId] = useState<
		string | null
	>(null);
	const [activeThreadSearchIndex, setActiveThreadSearchIndex] = useState(0);
	const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
	const [websocketToken, setWebsocketToken] = useState<string | null>(null);

	const targetProfileId = useMemo(() => {
		const raw = searchParams.get("targetProfileId");
		if (!raw) {
			return null;
		}
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : null;
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
			) ?? null,
		[conversations, selectedConversationId],
	);

	useEffect(() => {
		selectedConversationIdRef.current = selectedConversationId;
	}, [selectedConversationId]);

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

	const conversationSearchResults = useMemo(
		() => searchConversationsLocal(searchQuery, 30),
		[searchQuery],
	);

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

				const text = getMessagePreviewLabel(latestMessage);

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
			console.log("[chat-ws:event]", envelope);
			applyRealtimeEnvelope(envelope);
		},
		[applyRealtimeEnvelope],
	);

	const handleRealtimeStatus = useCallback((status: RealtimeStatus) => {
		console.log("[chat-ws:status]", status);
		setRealtimeStatus(status);
	}, []);

	const loadAlbums = useCallback(async () => {
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
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to load albums",
			);
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
					// Apply filters client-side to avoid API failures with filter payloads.
					filters: undefined,
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
					error instanceof Error ? error.message : "Failed to load inbox";
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

				// Persist API messages to the local log.
				void chatLog.appendMessages(conversationId, response.messages);

				if (!older) {
					const mediaIdImageMessages = response.messages.filter((message) => {
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
						void service
							.getSharedConversationImages(conversationId)
							.then((sharedImages) => {
								const sharedImageMap = new Map<number, string>();
								for (const item of sharedImages) {
									if (item.url) sharedImageMap.set(item.mediaId, item.url);
								}

								const hydratedMessages: UiMessage[] = [];
								for (const message of mediaIdImageMessages) {
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
					}
				}

				setThreadMessages((previous) => {
					const map = new Map<string, UiMessage>();
					if (older) {
						// Older messages prepended; keep existing (including any local-only).
						for (const message of response.messages)
							map.set(message.messageId, message);
						for (const message of previous) map.set(message.messageId, message);
					} else {
						// Fresh load: preserve already-surfaced local-only messages.
						for (const message of previous) {
							if (message._localOnly) map.set(message.messageId, message);
						}
						for (const message of response.messages)
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
					void chatLog.readLog(conversationId).then((localMessages) => {
						const localOnly = localMessages
							.filter(
								(m) =>
									!apiIds.has(m.messageId) &&
									m.timestamp >= windowStart &&
									m.timestamp <= windowEnd,
							)
							.map((m) => ({ ...m, _localOnly: true }) as UiMessage);
						if (!localOnly.length) return;
						setThreadMessages((previous) => {
							const map = new Map<string, UiMessage>();
							for (const message of previous)
								map.set(message.messageId, message);
							for (const message of localOnly) {
								// Never override an authoritative API message.
								if (!map.has(message.messageId))
									map.set(message.messageId, message);
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
						const previewText = getMessagePreviewLabel(newest);

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
					error instanceof Error ? error.message : "Failed to load messages";
				setThreadError(message);
			} finally {
				setIsLoadingThread(false);
				setIsLoadingOlderMessages(false);
				isLoadingOlderMessagesRef.current = false;
			}
		},
		[service, syncConversation],
	);

	useEffect(() => {
		void loadInbox({ page: 1, replace: true });
	}, [loadInbox]);

	useEffect(() => {
		if (!isDesktop) {
			setSelectedDesktopConversationId(null);
		}
	}, [isDesktop]);

	useEffect(() => {
		if (!userId) {
			setWebsocketToken(null);
			setRealtimeStatus("idle");
			console.log("[chat-ws:token] skipped (no user)");
			return;
		}

		let active = true;
		void callMethod("websocket_token")
			.then((token) => {
				if (!active) {
					return;
				}
				setWebsocketToken(token ?? null);
				console.log("[chat-ws:token]", {
					hasToken: Boolean(token),
					tokenLength: token?.length ?? 0,
				});
				if (!token) {
					setRealtimeStatus("polling");
				}
			})
			.catch(() => {
				if (!active) {
					return;
				}
				setWebsocketToken(null);
				setRealtimeStatus("polling");
				console.warn("[chat-ws:token] failed to fetch websocket token");
			});

		return () => {
			active = false;
		};
	}, [callMethod, userId]);

	useEffect(() => {
		if (!websocketToken) {
			setRealtimeStatus("polling");
			console.log(
				"[chat-ws:lifecycle] websocket disabled, using polling fallback",
			);
			return;
		}

		console.log("[chat-ws:lifecycle] starting websocket manager");

		const manager = new ChatRealtimeManager({
			url: "wss://grindr.mobi/v1/ws",
			getToken: () => websocketToken,
			onEvent: handleRealtimeEvent,
			onStatusChange: handleRealtimeStatus,
			onRawMessage: (raw) => {
				console.log("[chat-ws:raw]", raw);
			},
			onParseError: (raw, error) => {
				console.warn("[chat-ws:parse-error]", { raw, error });
			},
		});

		manager.start();

		return () => {
			console.log("[chat-ws:lifecycle] stopping websocket manager");
			manager.stop({ suppressStatus: true });
		};
	}, [handleRealtimeEvent, handleRealtimeStatus, websocketToken]);

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

	const runProfileSearch = useCallback(
		async ({ loadMore }: { loadMore: boolean }) => {
			if (!geohash || searchQuery.trim().length < 2) {
				if (!loadMore) {
					setProfileResults([]);
					setProfileSearchAfterDistance(null);
					setProfileSearchAfterProfileId(null);
				}
				return;
			}

			setIsSearchingProfiles(true);
			try {
				const response = await service.searchProfiles({
					nearbyGeoHash: geohash,
					searchAfterDistance: loadMore
						? (profileSearchAfterDistance ?? undefined)
						: undefined,
					searchAfterProfileId: loadMore
						? (profileSearchAfterProfileId ?? undefined)
						: undefined,
				});

				const needle = searchQuery.trim().toLowerCase();
				const filtered = response.profiles.filter((profile) =>
					profile.displayName.toLowerCase().includes(needle),
				);

				setProfileResults((previous) => {
					const merged = loadMore ? [...previous, ...filtered] : filtered;
					const map = new Map<number, ProfileSearchResult>();
					for (const profile of merged) {
						map.set(profile.profileId, profile);
					}
					return [...map.values()];
				});

				setProfileSearchAfterDistance(
					response.lastDistanceInKm != null
						? String(response.lastDistanceInKm)
						: null,
				);
				setProfileSearchAfterProfileId(
					response.lastProfileId != null
						? String(response.lastProfileId)
						: null,
				);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to search profiles",
				);
			} finally {
				setIsSearchingProfiles(false);
			}
		},
		[
			geohash,
			profileSearchAfterDistance,
			profileSearchAfterProfileId,
			searchQuery,
			service,
		],
	);

	useEffect(() => {
		if (searchMode !== "profiles") {
			return;
		}

		if (searchQuery.trim().length < 2) {
			setProfileResults([]);
			setProfileSearchAfterDistance(null);
			setProfileSearchAfterProfileId(null);
			return;
		}

		const timeoutId = window.setTimeout(() => {
			void runProfileSearch({ loadMore: false });
		}, 280);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [runProfileSearch, searchMode, searchQuery]);

	useEffect(() => {
		setActiveThreadSearchIndex(0);
	}, [
		selectedThreadMessageMatches.length,
		selectedConversationId,
		searchQuery,
	]);

	const unreadTotal = useMemo(
		() =>
			conversations.reduce(
				(sum, conversation) => sum + conversation.data.unreadCount,
				0,
			),
		[conversations],
	);

	const filteredConversations = useMemo(() => {
		const now = Date.now();
		return conversations.filter((conversation) => {
			if (inboxFilters.unreadOnly && conversation.data.unreadCount <= 0) {
				return false;
			}

			if (inboxFilters.favoritesOnly && !conversation.data.favorite) {
				return false;
			}

			if (
				inboxFilters.chemistryOnly &&
				!conversation.data.participants.some(
					(participant) => participant.hasDatingPotential,
				)
			) {
				return false;
			}

			if (
				inboxFilters.rightNowOnly &&
				(!conversation.data.rightNow ||
					conversation.data.rightNow === "NOT_ACTIVE")
			) {
				return false;
			}

			if (
				inboxFilters.onlineNowOnly &&
				!conversation.data.participants.some(
					(participant) =>
						typeof participant.onlineUntil === "number" &&
						participant.onlineUntil > now,
				)
			) {
				return false;
			}

			return true;
		});
	}, [conversations, inboxFilters]);

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

		navigate(`/chat/${encodeURIComponent(nextId)}`);
	};

	const startChatByProfileId = useCallback(
		(rawProfileId: string) => {
			const parsed = Number(rawProfileId.trim());
			if (!Number.isInteger(parsed) || parsed <= 0) {
				toast.error("Enter a valid profile ID");
				return;
			}

			if (isDesktop) {
				setSelectedDesktopConversationId(null);
			}

			const nextParams = new URLSearchParams();
			nextParams.set("targetProfileId", String(parsed));
			navigate(`/chat?${nextParams.toString()}`);
			setStartChatProfileIdDraft("");
		},
		[isDesktop, navigate],
	);

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

			navigate(`/chat/${encodeURIComponent(conversationId)}`);
		},
		[isDesktop, navigate, searchParams, setSearchParams, targetProfileId],
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

	const openMessageSearchResult = useCallback(
		(result: { conversationId: string; messageId: string }) => {
			openConversationById(result.conversationId);
			setPendingMessageScrollId(result.messageId);
		},
		[openConversationById],
	);

	const moveThreadSearchMatch = useCallback(
		(direction: "prev" | "next") => {
			if (!selectedThreadMessageMatches.length) {
				return;
			}

			const delta = direction === "next" ? 1 : -1;
			const nextIndex =
				(activeThreadSearchIndex +
					delta +
					selectedThreadMessageMatches.length) %
				selectedThreadMessageMatches.length;
			setActiveThreadSearchIndex(nextIndex);
			setPendingMessageScrollId(
				selectedThreadMessageMatches[nextIndex].messageId,
			);
		},
		[activeThreadSearchIndex, selectedThreadMessageMatches],
	);

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
				error instanceof Error ? error.message : "Failed to update pin state",
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
				error instanceof Error ? error.message : "Failed to update mute state",
			);
		} finally {
			setIsUpdatingConversationState(false);
		}
	};

	const sendTextMessage = useCallback(
		async (text: string, retryMessageId?: string) => {
			if (!userId) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;

			if (!targetProfileIdValue) {
				toast.error("Unable to determine message recipient");
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
					error instanceof Error ? error.message : "Failed to send";
				if (apiError?.status === 429) {
					toast.error("Sending too fast. Please wait and retry.");
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

	const sendImageAttachment = useCallback(
		async (file: File) => {
			if (!userId) {
				return;
			}

			const targetProfileIdValue = selectedConversation
				? (getOtherParticipant(selectedConversation, userId)?.profileId ?? null)
				: targetProfileId;
			if (!targetProfileIdValue) {
				toast.error("Unable to determine message recipient");
				return;
			}

			if (!file.type.startsWith("image/")) {
				toast.error("Only image attachments are supported right now.");
				return;
			}

			if (file.size > 12 * 1024 * 1024) {
				toast.error("Image is too large. Limit is 12MB.");
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
						selectedConversation?.data.conversationId ??
						`direct:${targetProfileIdValue}`,
					senderId: userId,
					timestamp: Date.now(),
					unsent: false,
					reactions: [],
					type: "Image",
					chat1Type: "image",
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
				const uploaded = await service.uploadChatMedia({ multipart: binaryUpload });
				setUploadProgress(96);

				const imageUrl = uploaded.url;
				const imageHash = imageUrl
					? uploaded.mediaHash || extractImageHashFromSignedUrl(imageUrl)
					: uploaded.mediaHash;
				const sentMessage = await service.sendMessage({
					type: "Image",
					target: {
						type: "Direct",
						targetId: targetProfileIdValue,
					},
					body: {
						mediaId: uploaded.mediaId,
						width: null,
						height: null,
						...(imageUrl ? { url: imageUrl } : {}),
						...(imageHash ? { imageHash } : {}),
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
								chat1Type: sentMessage.chat1Type ?? "image",
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
					error instanceof Error ? error.message : "Image upload/send failed",
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

	const handleSend = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		void sendTextMessage(draft);
	};

	const handleRetry = (message: UiMessage) => {
		if (!message.body || typeof message.body !== "object") {
			return;
		}

		if (message.type === "Image" || message.type === "ExpiringImage") {
			toast.error("Please re-upload this image.");
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

		const previous = threadMessages;
		setIsMutatingMessageId(message.messageId);
		setOpenMessageActionId(null);
		setThreadMessages((current) =>
			current.map((item) => {
				if (item.messageId !== message.messageId) {
					return item;
				}
				const alreadyReacted = item.reactions.some(
					(reaction) => reaction.profileId === userId,
				);
				if (alreadyReacted) {
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

		try {
			await service.reactToMessage({
				conversationId: selectedConversation.data.conversationId,
				messageId: message.messageId,
				reactionType: 1,
			});
		} catch (error) {
			setThreadMessages(previous);
			toast.error(error instanceof Error ? error.message : "Failed to react");
		} finally {
			setIsMutatingMessageId(null);
		}
	};

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
			toast.error(error instanceof Error ? error.message : "Failed to unsend");
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
			toast.error(error instanceof Error ? error.message : "Failed to delete");
		} finally {
			setIsMutatingMessageId(null);
		}
	};

	const shareAlbumToCurrentConversation = useCallback(
		async (albumId: number) => {
			if (!selectedConversation || !userId) {
				return;
			}
			const targetProfile = getOtherParticipant(selectedConversation, userId);
			if (!targetProfile?.profileId) {
				toast.error("Unable to determine recipient for album share");
				return;
			}

			setIsSharingAlbum(true);
			try {
				await service.shareAlbum({
					albumId,
					profiles: [
						{
							profileId: targetProfile.profileId,
							expirationType: "INDEFINITE",
						},
					],
				});
				toast.success("Album shared");
				setIsAlbumPickerOpen(false);
				void loadThread({
					conversationId: selectedConversation.data.conversationId,
					older: false,
				});
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to share album",
				);
			} finally {
				setIsSharingAlbum(false);
			}
		},
		[loadThread, selectedConversation, service, userId],
	);

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
					error instanceof Error ? error.message : "Failed to open album",
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

	const toggleAlbumPicker = () => {
		const next = !isAlbumPickerOpen;
		setIsAlbumPickerOpen(next);
		if (next && shareableAlbums.length === 0) {
			void loadAlbums();
		}
	};

	const onAttachmentInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}
		void sendImageAttachment(file);
	};

	const renderInbox = (
		<div
			className={`flex h-full flex-col overflow-hidden p-3 sm:p-4 ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<h1 className="app-title">Inbox</h1>
					<p className="app-subtitle mt-1">
						{unreadTotal > 0
							? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}`
							: "All caught up"}
					</p>
					<p className="mt-1 text-xs text-[var(--text-muted)]">
						Realtime: {realtimeStatus}
					</p>
				</div>
				{hasActiveInboxFilters ? (
					<button
						type="button"
						onClick={clearInboxFilters}
						className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
					>
						Clear filters
					</button>
				) : null}
			</div>

			<div className="mb-3 flex flex-wrap gap-2">
				{inboxFilterOptions.map((filter) => {
					const active = Boolean(inboxFilters[filter.key]);
					return (
						<button
							key={filter.key}
							type="button"
							onClick={() => toggleInboxFilter(filter.key)}
							className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
								active
									? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
									: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
							}`}
						>
							{filter.label}
						</button>
					);
				})}
			</div>

			<div className="mb-3">
				<div className="relative">
					<Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--text-muted)]" />
					<input
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						placeholder="Search conversations, messages, profiles"
						className="input-field pl-9"
					/>
				</div>
				<form
					onSubmit={(event) => {
						event.preventDefault();
						startChatByProfileId(startChatProfileIdDraft);
					}}
					className="mt-2 flex items-center gap-2"
				>
					<input
						type="text"
						inputMode="numeric"
						value={startChatProfileIdDraft}
						onChange={(event) => setStartChatProfileIdDraft(event.target.value)}
						placeholder="Start chat by profile ID"
						className="input-field h-9 text-sm"
					/>
					<button
						type="submit"
						className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
					>
						Start
					</button>
				</form>
				<div className="mt-2 flex flex-wrap gap-2">
					{(["messages", "conversations", "profiles"] as const).map((mode) => (
						<button
							key={mode}
							type="button"
							onClick={() => setSearchMode(mode)}
							className={`rounded-lg border px-2 py-1 text-xs capitalize transition ${
								searchMode === mode
									? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
									: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]"
							}`}
						>
							{mode}
						</button>
					))}
				</div>
			</div>

			{isLoadingInbox ? (
				<div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading inbox...
				</div>
			) : inboxError ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
					<p className="text-sm text-[var(--text-muted)]">{inboxError}</p>
					<button
						type="button"
						onClick={() => void loadInbox({ page: 1, replace: true })}
						className="btn-accent px-4 py-2 text-sm"
					>
						Retry
					</button>
				</div>
			) : filteredConversations.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[var(--text-muted)]">
					<MessageCircle className="h-8 w-8" />
					<p className="text-sm">
						{hasActiveInboxFilters
							? "No conversations match your filters."
							: "No conversations yet."}
					</p>
				</div>
			) : searchQuery.trim().length >= 2 ? (
				<div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
					{searchMode === "conversations"
						? conversationSearchResults.map((result) => (
								<button
									key={result.conversationId}
									type="button"
									onClick={() => openConversationById(result.conversationId)}
									className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
								>
									<p className="truncate text-sm font-semibold">
										{highlightMatch(result.name, searchQuery).map(
											(part, index) =>
												part.match ? (
													<mark
														key={`${result.conversationId}-name-${index}`}
														className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
													>
														{part.text}
													</mark>
												) : (
													<span key={`${result.conversationId}-name-${index}`}>
														{part.text}
													</span>
												),
										)}
									</p>
									<p className="mt-1 truncate text-xs text-[var(--text-muted)]">
										{result.preview || "No preview"}
									</p>
								</button>
							))
						: null}

					{searchMode === "messages"
						? messageSearchResults.map((result) => (
								<button
									key={result.messageId}
									type="button"
									onClick={() => openMessageSearchResult(result)}
									className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
								>
									<p className="truncate text-xs text-[var(--text-muted)]">
										{result.conversationId}
									</p>
									<p className="mt-1 text-sm">
										{highlightMatch(result.text, searchQuery).map(
											(part, index) =>
												part.match ? (
													<mark
														key={`${result.messageId}-${index}`}
														className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
													>
														{part.text}
													</mark>
												) : (
													<span key={`${result.messageId}-${index}`}>
														{part.text}
													</span>
												),
										)}
									</p>
								</button>
							))
						: null}

					{searchMode === "profiles"
						? profileResults.map((profile) => (
								<button
									key={profile.profileId}
									type="button"
									onClick={() => {
										const returnTo = getProfileReturnToChatPath(
											profile.profileId,
										);
										const nextParams = new URLSearchParams();
										nextParams.set("returnTo", returnTo);
										navigate(
											`/profile/${profile.profileId}?${nextParams.toString()}`,
											{
												state: { returnTo },
											},
										);
									}}
									className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)]"
								>
									<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
										{profile.profileImageMediaHash ? (
											<img
												src={getProfileImageUrl(profile.profileImageMediaHash)}
												alt=""
												className="h-full w-full object-cover"
											/>
										) : null}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold">
											{highlightMatch(profile.displayName, searchQuery).map(
												(part, index) =>
													part.match ? (
														<mark
															key={`${profile.profileId}-${index}`}
															className="rounded bg-[var(--accent)] px-0.5 text-[var(--accent-contrast)]"
														>
															{part.text}
														</mark>
													) : (
														<span key={`${profile.profileId}-${index}`}>
															{part.text}
														</span>
													),
											)}
										</p>
										<p className="text-xs text-[var(--text-muted)]">
											{profile.distance != null
												? `${profile.distance.toFixed(1)} km`
												: "Distance unavailable"}
										</p>
									</div>
								</button>
							))
						: null}

					{searchMode === "profiles" ? (
						<div className="mt-2 flex items-center gap-2">
							<button
								type="button"
								disabled={isSearchingProfiles}
								onClick={() => void runProfileSearch({ loadMore: false })}
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]"
							>
								{isSearchingProfiles ? "Searching..." : "Refresh"}
							</button>
							{profileSearchAfterDistance && profileSearchAfterProfileId ? (
								<button
									type="button"
									disabled={isSearchingProfiles}
									onClick={() => void runProfileSearch({ loadMore: true })}
									className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-muted)]"
								>
									Load more profiles
								</button>
							) : null}
						</div>
					) : null}

					{searchMode === "conversations" &&
					conversationSearchResults.length === 0 ? (
						<p className="text-xs text-[var(--text-muted)]">
							No conversation matches found.
						</p>
					) : null}
					{searchMode === "messages" && messageSearchResults.length === 0 ? (
						<p className="text-xs text-[var(--text-muted)]">
							No message matches found in indexed cache.
						</p>
					) : null}
					{searchMode === "profiles" &&
					!isSearchingProfiles &&
					profileResults.length === 0 ? (
						<p className="text-xs text-[var(--text-muted)]">
							No profile matches found.
						</p>
					) : null}
				</div>
			) : (
				<div className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
					{filteredConversations.map((conversation) => {
						const otherParticipant = getOtherParticipant(conversation, userId);
						const isSelected =
							conversation.data.conversationId === selectedConversationId;

						return (
							<button
								type="button"
								key={conversation.data.conversationId}
								onClick={() => handleSelectConversation(conversation)}
								className={`w-full rounded-2xl border p-3 text-left transition ${
									isSelected
										? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
										: "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
								}`}
							>
								<div className="flex items-start gap-3">
									<div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)]">
										{otherParticipant?.primaryMediaHash ? (
											<img
												src={getProfileImageUrl(
													otherParticipant.primaryMediaHash,
												)}
												alt=""
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center text-xs text-[var(--text-muted)]">
												{(conversation.data.name || "?")
													.slice(0, 1)
													.toUpperCase()}
											</div>
										)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<p className="truncate font-semibold">
												{conversation.data.name || "Unknown"}
											</p>
											<span className="text-xs text-[var(--text-muted)]">
												{formatConversationTime(
													conversation.data.lastActivityTimestamp,
												)}
											</span>
										</div>
										<p className="mt-1 truncate text-sm text-[var(--text-muted)]">
											{getPreviewText(conversation)}
										</p>
										<div className="mt-2 flex items-center gap-2">
											{conversation.data.pinned ? (
												<span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">
													Pinned
												</span>
											) : null}
											{conversation.data.muted ? (
												<span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">
													Muted
												</span>
											) : null}
										</div>
									</div>
									{conversation.data.unreadCount > 0 ? (
										<span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--accent)] px-2 text-xs font-semibold text-[var(--accent-contrast)]">
											{Math.min(99, conversation.data.unreadCount)}
										</span>
									) : null}
								</div>
							</button>
						);
					})}

					{nextPage ? (
						<button
							type="button"
							onClick={handleLoadMoreInbox}
							disabled={isLoadingMoreInbox}
							className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] disabled:opacity-60"
						>
							{isLoadingMoreInbox ? "Loading..." : "Load more"}
						</button>
					) : null}
				</div>
			)}
		</div>
	);

	const renderThread = selectedConversation ? (
		<div
			className={`flex h-full flex-col overflow-hidden p-3 sm:p-4 ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			{(() => {
				const otherParticipant = getOtherParticipant(
					selectedConversation,
					userId,
				);
				return (
					<div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
						<div className="min-w-0">
							<p className="truncate text-lg font-semibold">
								{selectedConversation.data.name || "Conversation"}
							</p>
							<p className="text-sm text-[var(--text-muted)]">
								{selectedConversation.data.muted
									? "Notifications muted"
									: "Notifications enabled"}
							</p>
							{searchMode === "messages" && searchQuery.trim().length >= 2 ? (
								<p className="mt-1 text-xs text-[var(--text-muted)]">
									{selectedThreadMessageMatches.length > 0
										? `${activeThreadSearchIndex + 1}/${selectedThreadMessageMatches.length} matches in this thread`
										: "No matches in this thread"}
								</p>
							) : null}
						</div>
						<div className="flex items-center gap-2">
							{searchMode === "messages" &&
							searchQuery.trim().length >= 2 &&
							selectedThreadMessageMatches.length > 0 ? (
								<>
									<button
										type="button"
										onClick={() => moveThreadSearchMatch("prev")}
										className="rounded-xl border border-[var(--border)] px-2 py-2 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										<ChevronUp className="h-3.5 w-3.5" />
									</button>
									<button
										type="button"
										onClick={() => moveThreadSearchMatch("next")}
										className="rounded-xl border border-[var(--border)] px-2 py-2 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										<ChevronDown className="h-3.5 w-3.5" />
									</button>
								</>
							) : null}

							<button
								type="button"
								onClick={() => {
									if (!otherParticipant) {
										return;
									}
									const returnTo = getProfileReturnToChatPath(
										otherParticipant.profileId,
									);
									const nextParams = new URLSearchParams();
									nextParams.set("returnTo", returnTo);
									navigate(
										`/profile/${otherParticipant.profileId}?${nextParams.toString()}`,
										{ state: { returnTo } },
									);
								}}
								disabled={!otherParticipant}
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								View profile
							</button>
							<button
								type="button"
								disabled={isUpdatingConversationState}
								onClick={togglePin}
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								<Pin className="mr-1 inline h-3.5 w-3.5" />
								{selectedConversation.data.pinned ? "Unpin" : "Pin"}
							</button>
							<button
								type="button"
								disabled={isUpdatingConversationState}
								onClick={toggleMute}
								className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								{selectedConversation.data.muted ? (
									<Volume2 className="mr-1 inline h-3.5 w-3.5" />
								) : (
									<VolumeX className="mr-1 inline h-3.5 w-3.5" />
								)}
								{selectedConversation.data.muted ? "Unmute" : "Mute"}
							</button>
						</div>
					</div>
				);
			})()}

			{isLoadingThread &&
			threadConversationId !== selectedConversation.data.conversationId ? (
				<div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages...
				</div>
			) : threadError ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
					<p className="text-sm text-[var(--text-muted)]">{threadError}</p>
					<button
						type="button"
						onClick={() =>
							void loadThread({
								conversationId: selectedConversation.data.conversationId,
								older: false,
							})
						}
						className="btn-accent px-4 py-2 text-sm"
					>
						Retry
					</button>
				</div>
			) : (
				<>
					<div className="flex flex-1 flex-col overflow-y-auto">
						{messagePageKey ? (
							<button
								type="button"
								onClick={() =>
									void loadThread({
										conversationId: selectedConversation.data.conversationId,
										older: true,
									})
								}
								disabled={isLoadingOlderMessages}
								className="mx-auto mb-3 rounded-xl border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] disabled:opacity-60"
							>
								{isLoadingOlderMessages ? "Loading..." : "Load older messages"}
							</button>
						) : null}

						<div className="flex flex-col gap-2">
							{threadMessages.map((message) => {
								const mine = message.senderId === userId;
								const failed = message.clientState === "failed";
								const pending = message.clientState === "pending";
								const localOnly = message._localOnly === true;
								const imageUrl = getMessageImageUrl(message);
								const audioUrl = getMessageAudioUrl(message);
								const albumId = getMessageAlbumId(message);
								const albumCover = getMessageAlbumCoverUrl(message);
								const isActiveSearchMatch =
									selectedThreadMessageMatches[activeThreadSearchIndex]
										?.messageId === message.messageId;

								return (
									<div
										key={message.messageId}
										data-message-id={message.messageId}
										ref={(element) => {
											if (element) {
												messageElementRefs.current.set(
													message.messageId,
													element,
												);
											} else {
												messageElementRefs.current.delete(message.messageId);
											}
										}}
										className={`flex ${mine ? "justify-end" : "justify-start"}`}
									>
										<div
											className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
												mine
													? "bg-[var(--accent)] text-[var(--accent-contrast)]"
													: "bg-[var(--surface-2)] text-[var(--text)]"
											} ${isActiveSearchMatch ? "ring-2 ring-[var(--accent)]" : ""} ${localOnly ? "opacity-60 ring-1 ring-dashed ring-[var(--text-muted)]" : ""}`}
										>
											{localOnly ? (
												<p className="mb-1 text-xs opacity-60">
													Removed from API
												</p>
											) : null}
											{imageUrl ? (
												<button
													type="button"
													onClick={() => setFullScreenImageUrl(imageUrl)}
													className="mb-2 block overflow-hidden rounded-xl border border-black/10"
												>
													<img
														src={imageUrl}
														alt="Shared"
														className="max-h-64 w-full object-cover"
													/>
												</button>
											) : null}

											{audioUrl ? (
												<div className="mb-2 rounded-xl border border-black/10 bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-2">
													<audio
														controls
														preload="none"
														src={audioUrl}
														className="w-full"
													/>
												</div>
											) : null}

											{message.type === "Album" ||
											message.type === "ExpiringAlbum" ||
											message.type === "ExpiringAlbumV2" ? (
												<div className="mb-2 rounded-xl border border-black/10 bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-2">
													{albumCover ? (
														<img
															src={albumCover}
															alt="Album cover"
															className="mb-2 h-36 w-full rounded-lg object-cover"
														/>
													) : null}
													<div className="flex items-center justify-between gap-2">
														<span className="text-xs font-medium">
															Album share
														</span>
														<button
															type="button"
															onClick={() => {
																if (albumId) {
																	void openAlbumViewerById(albumId);
																}
															}}
															className="rounded-md border border-black/20 px-2 py-1 text-[11px]"
															disabled={!albumId}
														>
															Open
														</button>
													</div>
												</div>
											) : null}

											<p className="whitespace-pre-wrap break-words">
												{getMessageText(message)}
											</p>

											{message.reactions.length > 0 ? (
												<div className="mt-1 inline-flex items-center gap-1 rounded-full bg-black/10 px-2 py-0.5 text-[10px]">
													<Flame className="h-3 w-3" />
													<span>{message.reactions.length}</span>
												</div>
											) : null}

											<div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
												<div className="flex items-center gap-2">
													{pending ? <span>Sending...</span> : null}
													{failed ? <span>Failed</span> : null}
												</div>
												<div className="flex items-center gap-2">
													<span>
														{formatMessageTime(message.timestamp, nowTimestamp)}
													</span>
													{!pending &&
													!isLocalClientMessageId(message.messageId) ? (
														<button
															type="button"
															onClick={() =>
																setOpenMessageActionId((current) =>
																	current === message.messageId
																		? null
																		: message.messageId,
																)
															}
															className="rounded-md p-1 hover:bg-black/10"
														>
															<Ellipsis className="h-3.5 w-3.5" />
														</button>
													) : null}
												</div>
											</div>

											{openMessageActionId === message.messageId ? (
												<div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-black/10 p-2 text-[11px]">
													<button
														type="button"
														onClick={() => void handleReact(message)}
														disabled={isMutatingMessageId === message.messageId}
														className="rounded-md border border-black/20 px-2 py-1"
													>
														React 🔥
													</button>
													{mine && !message.unsent ? (
														<button
															type="button"
															onClick={() => void handleUnsend(message)}
															disabled={
																isMutatingMessageId === message.messageId
															}
															className="rounded-md border border-black/20 px-2 py-1"
														>
															Unsend
														</button>
													) : null}
													<button
														type="button"
														onClick={() => void handleDelete(message)}
														disabled={isMutatingMessageId === message.messageId}
														className="rounded-md border border-black/20 px-2 py-1"
													>
														Delete
													</button>
												</div>
											) : null}

											{failed ? (
												<button
													type="button"
													onClick={() => handleRetry(message)}
													className="mt-1 rounded-lg bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] px-2 py-1 text-[11px] font-semibold"
												>
													Retry
												</button>
											) : null}
										</div>
									</div>
								);
							})}
						</div>
						<div ref={threadBottomRef} />
					</div>

					<form
						onSubmit={handleSend}
						className="mt-3 border-t border-[var(--border)] pt-3"
					>
						<div className="mb-2 flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={toggleAlbumPicker}
								className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								<Share2 className="mr-1 inline h-3.5 w-3.5" /> Share album
							</button>
							<button
								type="button"
								onClick={() => attachmentInputRef.current?.click()}
								disabled={isUploadingAttachment}
								className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> Attach image
							</button>
							<input
								type="file"
								ref={attachmentInputRef}
								onChange={onAttachmentInput}
								accept="image/*"
								className="hidden"
							/>
							<button
								type="button"
								onClick={() => navigate("/settings/albums")}
								className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								Manage albums
							</button>
						</div>

						{isAlbumPickerOpen ? (
							<div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
								{isLoadingAlbums ? (
									<div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
										<Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
										albums...
									</div>
								) : shareableAlbums.length === 0 ? (
									<p className="text-xs text-[var(--text-muted)]">
										No albums available. Create one in Settings first.
									</p>
								) : (
									<div className="grid gap-2 sm:grid-cols-2">
										{shareableAlbums.map((album) => (
											<div
												key={album.albumId}
												className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
											>
												<p className="truncate text-xs font-medium">
													{album.albumName || `Album ${album.albumId}`}
												</p>
												<button
													type="button"
													onClick={() =>
														void shareAlbumToCurrentConversation(album.albumId)
													}
													disabled={!album.isShareable || isSharingAlbum}
													className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] disabled:opacity-50"
												>
													Share
												</button>
											</div>
										))}
									</div>
								)}
							</div>
						) : null}

						{isUploadingAttachment || uploadProgress > 0 ? (
							<div className="mb-2">
								<div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
									<span>Uploading image</span>
									<span>{Math.round(uploadProgress)}%</span>
								</div>
								<div className="h-2 rounded-full bg-[var(--surface-2)]">
									<div
										className="h-2 rounded-full bg-[var(--accent)] transition-all"
										style={{ width: `${Math.min(100, uploadProgress)}%` }}
									/>
								</div>
							</div>
						) : null}

						<div className="flex items-end gap-2">
							<textarea
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								rows={2}
								maxLength={5000}
								placeholder="Write a message..."
								className="input-field min-h-[56px] resize-none"
							/>
							<button
								type="submit"
								disabled={isSending || draft.trim().length === 0}
								className="btn-accent h-11 shrink-0 px-4 text-sm"
							>
								{isSending ? "Sending" : "Send"}
							</button>
						</div>
					</form>
				</>
			)}
		</div>
	) : targetProfileId ? (
		<div
			className={`flex h-full flex-col overflow-hidden p-3 sm:p-4 ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			<div className="mb-3 border-b border-[var(--border)] pb-3">
				<p className="text-lg font-semibold">New conversation</p>
				<p className="text-sm text-[var(--text-muted)]">
					Message profile #{targetProfileId} to start chatting.
				</p>
			</div>
			<div className="flex-1" />
			<form
				onSubmit={handleSend}
				className="border-t border-[var(--border)] pt-3"
			>
				<div className="mb-2 flex flex-wrap items-center gap-2">
					<button
						type="button"
						onClick={() => attachmentInputRef.current?.click()}
						disabled={isUploadingAttachment}
						className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
					>
						<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> Attach image
					</button>
					<input
						type="file"
						ref={attachmentInputRef}
						onChange={onAttachmentInput}
						accept="image/*"
						className="hidden"
					/>
				</div>

				{isUploadingAttachment || uploadProgress > 0 ? (
					<div className="mb-2">
						<div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
							<span>Uploading image</span>
							<span>{Math.round(uploadProgress)}%</span>
						</div>
						<div className="h-2 rounded-full bg-[var(--surface-2)]">
							<div
								className="h-2 rounded-full bg-[var(--accent)] transition-all"
								style={{ width: `${Math.min(100, uploadProgress)}%` }}
							/>
						</div>
					</div>
				) : null}

				<div className="flex items-end gap-2">
					<textarea
						value={draft}
						onChange={(event) => setDraft(event.target.value)}
						rows={2}
						maxLength={5000}
						placeholder="Write your first message..."
						className="input-field min-h-[56px] resize-none"
					/>
					<button
						type="submit"
						disabled={isSending || draft.trim().length === 0}
						className="btn-accent h-11 shrink-0 px-4 text-sm"
					>
						{isSending ? "Sending" : "Send"}
					</button>
				</div>
			</form>
		</div>
	) : (
		<div
			className={`flex h-full overflow-hidden items-center justify-center p-6 text-center text-[var(--text-muted)] ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			Select a conversation to view messages.
		</div>
	);

	return (
		<section
			className={`app-screen${isDesktop ? " overflow-hidden" : ""}`}
			style={isDesktop ? undefined : { paddingLeft: 0, paddingRight: 0 }}
		>
			<div className={isDesktop ? "mx-auto w-full max-w-6xl" : "w-full"}>
				{!isDesktop && selectedConversation ? (
					<div className="mb-3 flex items-center justify-between px-3">
						<button
							type="button"
							onClick={() => navigate("/chat")}
							className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]"
						>
							Back to inbox
						</button>
					</div>
				) : null}

				{isDesktop ? (
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
				) : selectedConversation ? (
					renderThread
				) : (
					renderInbox
				)}
			</div>

			{isAlbumViewerLoading ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50">
					<div className="surface-card flex items-center gap-2 p-4 text-sm text-[var(--text-muted)]">
						<Loader2 className="h-4 w-4 animate-spin" /> Loading album...
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
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
					<button
						type="button"
						onClick={() => setFullScreenImageUrl(null)}
						className="absolute right-4 top-4 rounded-lg border border-white/40 p-2 text-white"
					>
						<X className="h-4 w-4" />
					</button>
					<img
						src={fullScreenImageUrl}
						alt="Media"
						className="max-h-full max-w-full rounded-xl object-contain"
					/>
				</div>
			) : null}
		</section>
	);
}
