import {
	Album,
	ChevronLeft,
	ChevronRight,
	Ellipsis,
	ImagePlus,
	Loader2,
	MessageCircle,
	Pin,
	Search,
	Share2,
	SlidersHorizontal,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import {
    Fragment,
	type FormEvent,
	type TouchEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import toast from "react-hot-toast";
import { useApi } from "../../hooks/useApi";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { usePresenceCheckBatch } from "../../hooks/usePresenceCheck";
import { useAuth } from "../../contexts/AuthContext";
import { type ChatApiError } from "../../services/chatService";
import { ChatRealtimeManager } from "../../services/chatRealtime";
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
	getProfileImageUrl,
	getThumbImageUrl,
	validateMediaHash,
} from "../../utils/media";
import { Avatar } from "../../components/ui/avatar";
import blankProfileImage from "../../images/blank-profile.png";
import freegrindLogo from "../../images/freegrind-logo.webp";
import {
	indexConversations,
	indexMessages,
	searchMessagesLocal,
} from "./chat/cache";
import { InboxAlbumsTabs } from "./components/InboxAlbumsTabs";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { ChatSearchPage } from "./ChatSearchPage";
import * as chatLog from "../../services/chatLog";
import { formatDistance } from "./gridpage/utils";

type ChatFiltersDraft = {
	unreadOnly: boolean;
	chemistryOnly: boolean;
	favoritesOnly: boolean;
	rightNowOnly: boolean;
	onlineNowOnly: boolean;
	distanceMeters: string;
	positions: number[];
};

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function buildChatFiltersDraft(filters: InboxFilters): ChatFiltersDraft {
	return {
		unreadOnly: filters.unreadOnly === true,
		chemistryOnly: filters.chemistryOnly === true,
		favoritesOnly: filters.favoritesOnly === true,
		rightNowOnly: filters.rightNowOnly === true,
		onlineNowOnly: filters.onlineNowOnly === true,
		distanceMeters:
			typeof filters.distanceMeters === "number"
				? String(filters.distanceMeters)
				: "",
		positions: filters.positions ?? [],
	};
}

function parseChatFiltersFromLocationState(state: unknown): InboxFilters | null {
	const safe =
		typeof state === "object" && state !== null
			? (state as { inboxFiltersDraft?: Partial<ChatFiltersDraft> })
			: {};
	const draft = safe.inboxFiltersDraft;

	if (!draft) {
		return null;
	}

	const distanceMeters =
		typeof draft.distanceMeters === "string" && draft.distanceMeters.trim() !== ""
			? Number(draft.distanceMeters)
			: undefined;

	return {
		unreadOnly: draft.unreadOnly === true ? true : undefined,
		chemistryOnly: draft.chemistryOnly === true ? true : undefined,
		favoritesOnly: draft.favoritesOnly === true ? true : undefined,
		rightNowOnly: draft.rightNowOnly === true ? true : undefined,
		onlineNowOnly: draft.onlineNowOnly === true ? true : undefined,
		positions:
			isNumberArray(draft.positions) && draft.positions.length > 0
				? draft.positions
				: undefined,
		distanceMeters:
			typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
				? distanceMeters
				: undefined,
	};
}

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

function formatDateTime24(timestamp: number): string {
	const date = new Date(timestamp);
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = String(date.getFullYear()).slice(-2);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");

	return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Determines the date header label for grouping messages in the chat thread.
 * Returns "Today", "Yesterday", a weekday (e.g., "Monday"), or a formatted date.
 */
function formatDateHeader(timestamp: number, now: number): string {
	const msgDate = new Date(timestamp);
	const nowDate = new Date(now);

	const isSameDay = (d1: Date, d2: Date) =>
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate();

	if (isSameDay(msgDate, nowDate)) {
		return "Today";
	}

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDay(msgDate, yesterday)) {
		return "Yesterday";
	}

	const oneWeekAgo = new Date(now);
	oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

	if (msgDate > oneWeekAgo) {
		return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(
			msgDate,
		);
	}

	return new Intl.DateTimeFormat(undefined, {
		day: "numeric",
		month: "long",
		year:
			msgDate.getFullYear() === nowDate.getFullYear() ? undefined : "numeric",
	}).format(msgDate);
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
		if (message.type === "Video") {
			return "[video]";
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

	if (message.type === "Video") {
		return "Shared a video";
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
				console.log("Found image URL candidate:", { candidate, normalized });
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

function getMessageTakenOnGrindr(message: UiMessage): boolean {
	if (!message.body || typeof message.body !== "object") {
		return false;
	}

	const body = message.body as Record<string, unknown>;
	return body.takenOnGrindr === true;
}

function getMessageImageCreatedAt(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidate = body.createdAt;
	const parsed =
		typeof candidate === "number"
			? candidate
			: typeof candidate === "string"
				? Number(candidate)
				: NaN;

	if (!Number.isFinite(parsed)) {
		return null;
	}

	// Some payloads use seconds while others use milliseconds.
	return parsed < 100_000_000_000 ? parsed * 1000 : parsed;
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

function getMessageVideoUrl(message: UiMessage): string | null {
	const mediaType = message.chat1Type?.toLowerCase();
	const isVideoMessage = message.type === "Video" || mediaType === "video";
	if (!isVideoMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidates: unknown[] = [
		body.videoUrl,
		body.url,
		body.mediaUrl,
		body.signedUrl,
		(body.video as Record<string, unknown> | null)?.url,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			console.log("Found video URL candidate:", { candidate });
			return candidate;
		}
	}

	return null;
}

function getParticipantAvatarUrl(hash: string | null | undefined): string {
	if (!hash || !validateMediaHash(hash)) {
		return blankProfileImage;
	}

	return getProfileImageUrl(hash);
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
	const location = useLocation();
	const navigate = useNavigate();
	const { conversationId: routeConversationId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const { callMethod } = useApi();
	const service = useApiFunctions();
	const { userId } = useAuth();
	const isDesktop = useDesktopBreakpoint();
	const threadBottomRef = useRef<HTMLDivElement | null>(null);
	const threadScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const attachmentInputRef = useRef<HTMLInputElement | null>(null);
	const messageElementRefs = useRef(new Map<string, HTMLDivElement>());
	const selectedConversationIdRef = useRef<string | null>(null);
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
	const [websocketToken, setWebsocketToken] = useState<string | null>(null);

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
		messagePageKeyRef.current = messagePageKey;
	}, [messagePageKey]);

	useEffect(() => {
		isLoadingOlderMessagesRef.current = isLoadingOlderMessages;
	}, [isLoadingOlderMessages]);

	useEffect(() => {
		selectedConversationUnreadCountRef.current =
			selectedConversation?.data.unreadCount ?? 0;
	}, [selectedConversation]);

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
				error instanceof Error ? error.message : "Failed to load albums",
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
					label: "Connected",
					symbol: "✓",
					className:
						"border-emerald-500/40 bg-emerald-500/15 text-emerald-700",
				};
			case "disconnected":
			case "error":
				return {
					label: realtimeStatus === "error" ? "Error" : "Offline",
					symbol: "•",
					className: "border-red-500/40 bg-red-500/15 text-red-700",
				};
			default:
				return {
					label:
						realtimeStatus === "reconnecting"
							? "Reconnecting"
							: realtimeStatus === "connecting"
								? "Connecting"
								: realtimeStatus === "polling"
									? "Polling"
									: "Idle",
					symbol: "•",
					className:
						"border-amber-500/40 bg-amber-500/15 text-amber-700",
				};
		}
	}, [realtimeStatus]);

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
		toast.success("Cleared local history for this chat");
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
				toast.error("Unable to determine message recipient");
				return;
			}

			const isImage = file.type.startsWith("image/");
			const isVideo = file.type.startsWith("video/");
			if (!isImage && !isVideo) {
				toast.error("Only image and video attachments are supported.");
				return;
			}

			if (file.size > 12 * 1024 * 1024) {
				toast.error("Attachment is too large. Limit is 12MB.");
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
						: "Attachment upload/send failed",
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
					: "Failed to react",
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

	const toggleAlbumPicker = useCallback(async () => {
		if (isAlbumPickerOpen) {
			setIsAlbumPickerOpen(false);
			return;
		}

		const albums = shareableAlbums.length > 0 ? shareableAlbums : await loadAlbums();
		const shareable = albums.filter((album) => album.isShareable);

		if (shareable.length === 1) {
			void shareAlbumToCurrentConversation(shareable[0].albumId);
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
		<PullToRefreshContainer
			className={`flex h-full flex-col overflow-hidden p-3 sm:p-4 ${
				isDesktop ? "surface-card" : ""
			}`}
			onRefresh={() => loadInbox({ page: 1, replace: true })}
			isDisabled={isLoadingInbox || isLoadingMoreInbox}
			isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel="Refreshing inbox..."
			onTouchStartExtra={handleInboxTouchStart}
			onTouchEndExtra={handleInboxTouchEnd}
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<InboxAlbumsTabs
						activeTab="inbox"
						onInboxClick={() => navigate("/chat")}
						onAlbumsClick={() => navigate("/settings/shared-albums")}
						trailing={
							<span
								className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${realtimeStatusMeta.className}`}
							>
								<span className="leading-none">{realtimeStatusMeta.symbol}</span>
								<span>{realtimeStatusMeta.label}</span>
							</span>
						}
					/>
					<p className="app-subtitle mt-1">Your conversations</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => 
                            navigate("/chat/filters", {
								state: {
									inboxFiltersDraft: buildChatFiltersDraft(inboxFilters),
									returnTo: `${location.pathname}${location.search}`,
								},
							})
                        }
						className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						aria-label="Open search"
					>
						<SlidersHorizontal className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => navigate("/chat/search")}
						className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						aria-label="Open search"
					>
						<Search className="h-4 w-4" />
					</button>
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
			) : (
				<div ref={inboxListRef} className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
										<img
											src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
											alt={conversation.data.name || "Profile"}
											className="h-full w-full object-cover"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-1 min-w-0">
												<p className="truncate font-semibold">
													{conversation.data.name || "Unknown"}
												</p>
												{otherParticipant?.profileId && presenceResults[otherParticipant.profileId] && (
													<img
														src={freegrindLogo}
														alt="Free Grind user"
														title="Uses Free Grind"
														className="shrink-0 h-4 w-4 rounded-full border border-[var(--border)]"
													/>
												)}
											</div>
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
		</PullToRefreshContainer>
	);

	const renderSearch = <ChatSearchPage />;

	const renderThread = selectedConversation ? (
		<div
			className={`flex h-full flex-col ${!isDesktop ? "overflow-visible p-0" : "overflow-hidden p-3 sm:p-4"} ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			{(() => {
				const otherParticipant = getOtherParticipant(
					selectedConversation,
					userId,
				);
				return (
					<div 
						className={`mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3 ${!isDesktop ? "fixed inset-x-0 top-0 z-20 bg-[var(--surface)] py-3 px-3 sm:px-4" : ""}`}
						style={!isDesktop ? {
							top: 0,
							paddingTop: "max(12px, env(safe-area-inset-top))",
						} : undefined}
					>
						<div className={`min-w-0 flex items-center gap-3 ${!isDesktop ? "pl-3 sm:pl-4" : ""}`}>
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
								aria-label="Open profile"
								className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface-2)] transition hover:border-[var(--accent)] disabled:cursor-default disabled:opacity-80"
							>
								<img
									src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
									alt={selectedConversation.data.name || "Profile"}
									className="h-full w-full object-cover"
								/>
							</button>
							<div className="min-w-0">
								<div className="flex items-center gap-1.5 min-w-0">
									<p className="truncate text-lg font-semibold">
										{selectedConversation.data.name || "Conversation"}
									</p>
									{otherParticipant?.profileId && presenceResults[otherParticipant.profileId] && (
										<img
											src={freegrindLogo}
											alt="Free Grind user"
											title="Uses Free Grind"
											className="shrink-0 h-5 w-5 rounded-full border border-[var(--border)]"
										/>
									)}
								</div>
								<p className="text-sm text-[var(--text-muted)]">
									{otherParticipant?.distanceMetres
										? formatDistance(otherParticipant.distanceMetres)
										: "Distance unknown"}
								</p>
							</div>
						</div>
						{isDesktop ? (
							<div className="flex items-center gap-2">
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
								<button
									type="button"
									onClick={() => void clearLocalHistory()}
									className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									Clear local history
								</button>
							</div>
						) : (
							<div
								ref={headerActionsMenuRef}
								className="relative pr-3 sm:pr-4"
							>
								<button
									type="button"
									onClick={() =>
										setIsHeaderActionsMenuOpen((current) => !current)
									}
									className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									aria-label="Open conversation actions"
									aria-expanded={isHeaderActionsMenuOpen}
								>
									<Ellipsis className="h-4 w-4" />
								</button>
								{isHeaderActionsMenuOpen ? (
									<div className="absolute right-0 top-full z-30 mt-2 flex min-w-[180px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
										<button
											type="button"
											onClick={() => {
												setIsHeaderActionsMenuOpen(false);
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
											className="rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
										>
											View profile
										</button>
										<button
											type="button"
											disabled={isUpdatingConversationState}
											onClick={() => {
												setIsHeaderActionsMenuOpen(false);
												void togglePin();
											}}
											className="rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
										>
											{selectedConversation.data.pinned ? "Unpin" : "Pin"}
										</button>
										<button
											type="button"
											disabled={isUpdatingConversationState}
											onClick={() => {
												setIsHeaderActionsMenuOpen(false);
												void toggleMute();
											}}
											className="rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
										>
											{selectedConversation.data.muted ? "Unmute" : "Mute"}
										</button>
										<button
											type="button"
											onClick={() => {
												setIsHeaderActionsMenuOpen(false);
												void clearLocalHistory();
											}}
											className="rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
										>
											Clear local history
										</button>
									</div>
								) : null}
							</div>
						)}
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
					<div
						ref={threadScrollContainerRef}
						onScroll={handleThreadScroll}
						className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto ${!isDesktop ? "px-3 sm:px-4 pb-[200px] pt-[140px]" : ""}`}
					>
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

						<div className={`flex flex-col gap-2 ${!isDesktop ? "pt-4" : ""}`}>
                        {(() => {
                            // Track the last header label to detect day transitions during rendering
                            let lastHeader = "";
                            return threadMessages.map((message) => {
                                const currentHeader = formatDateHeader(
                                    message.timestamp,
                                    nowTimestamp,
                                );
                                const isNewDay = currentHeader !== lastHeader;
                                lastHeader = currentHeader;
								const mine =
									userId != null && Number(message.senderId) === Number(userId);
								const failed = message.clientState === "failed";
								const pending = message.clientState === "pending";
								const localOnly = message._localOnly === true;
								const imageUrl = getMessageImageUrl(message);
								const messageTakenOnGrindr = getMessageTakenOnGrindr(message);
								const imageCreatedAt = getMessageImageCreatedAt(message);
								const imageCreatedAtLabel =
									imageCreatedAt != null
										? formatDateTime24(imageCreatedAt)
										: null;
								const videoUrl = getMessageVideoUrl(message);
								const audioUrl = getMessageAudioUrl(message);
								const albumId = getMessageAlbumId(message);
								const albumCover = getMessageAlbumCoverUrl(message);
								const messageText = getMessageText(message);
								const isExpiringImage = message.type === "ExpiringImage";
								const isAlbumMessage =
									message.type === "Album" ||
									message.type === "ExpiringAlbum" ||
									message.type === "ExpiringAlbumV2";
								const isImageOnlyBubble =
									Boolean(imageUrl) && messageText === "Shared an image";
								const isAlbumOnlyBubble =
									isAlbumMessage && messageText === "Shared an album";
								const isMediaOnlyBubble = isImageOnlyBubble || isAlbumOnlyBubble;
								const senderParticipant =
									selectedConversation.data.participants.find(
										(participant) =>
											Number(participant.profileId) === Number(message.senderId),
									) ?? null;
								const senderAvatarUrl =
									senderParticipant?.primaryMediaHash &&
									validateMediaHash(senderParticipant.primaryMediaHash)
										? getThumbImageUrl(senderParticipant.primaryMediaHash, "320x320")
										: blankProfileImage;
								const senderLabel = mine
									? "You"
									: selectedConversation.data.name?.trim() || "Unknown";
								const isActiveSearchMatch =
									selectedThreadMessageMatches[activeThreadSearchIndex]
										?.messageId === message.messageId;
								const fireButtonClass = mine
									? "absolute -left-3 -top-2"
									: "absolute -right-3 -top-2";

								return (
								/* Use Fragment to allow rendering the separator and the message as a single map item */
                                <Fragment key={message.messageId}>
                                    {isNewDay && (
                                        <div className="my-6 flex items-center gap-4 px-4 opacity-80">
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                                {currentHeader}
                                            </span>
                                            <div className="h-px flex-1 bg-[var(--border)]" />
                                        </div>
                                    )}
                                    <div
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
										className={`flex w-full ${mine ? "justify-end" : "justify-start"}`}
									>
										<div
											onDoubleClick={() => void handleMessageTap(message)}
											onTouchStart={() => startMessageLongPress(message.messageId)}
											onTouchEnd={endMessageLongPress}
											onTouchCancel={endMessageLongPress}
											onTouchMove={endMessageLongPress}
											className={`relative group/bubble max-w-[85%] rounded-2xl text-sm ${
												isMediaOnlyBubble
													? "overflow-hidden bg-transparent p-0"
													: `px-3 py-2 ${
														mine
															? "bg-[var(--accent)] text-[var(--accent-contrast)]"
															: "bg-[var(--surface-2)] text-[var(--text)]"
													}`
											} ${isActiveSearchMatch ? "ring-2 ring-[var(--accent)]" : ""} ${localOnly ? "opacity-60 ring-1 ring-dashed ring-[var(--text-muted)]" : ""}`}
										>
											{localOnly ? (
												<p className="mb-1 text-xs opacity-60">
													From local history
												</p>
											) : null}
											{imageUrl ? (
												<button
													type="button"
													onClick={() => {
														if (messageLongPressTriggeredRef.current) {
															messageLongPressTriggeredRef.current = false;
															return;
														}
														openFullScreenImage(imageUrl);
													}}
													className={`${isImageOnlyBubble ? "block w-full" : "mb-2 block overflow-hidden rounded-xl border border-black/10"}`}
												>
													<div className="relative">
													<img
														src={imageUrl}
														alt="Shared"
															className={`${isImageOnlyBubble ? "max-h-80 w-full object-cover" : "max-h-64 w-full object-cover"}`}
													/>
													{isExpiringImage ? (
														<div className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-semibold text-white ring-1 ring-white/25">
															1
														</div>
													) : null}
													{!mine ? (
														<div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
															{ messageTakenOnGrindr ? (
                                                                <img
                                                                    src={freegrindLogo}
                                                                    alt="Taken on Grindr"
                                                                    className="h-3.5 w-3.5 rounded-full"
                                                                />
                                                            ) : null}

                                                            <span>
                                                                {imageCreatedAtLabel
                                                                    ? ` ${imageCreatedAtLabel}`
                                                                    : ""}
                                                            </span>
														</div>
													) : null}
                                                
														{isImageOnlyBubble ? (
															<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 py-2 text-[10px] text-white">
																<div className="flex items-center gap-2">
																	{pending ? <span>Sending...</span> : null}
																	{failed ? <span>Failed</span> : null}
																</div>
																<div className="flex items-center gap-2">
																	<span>
																		{formatMessageTime(message.timestamp, nowTimestamp)}
																	</span>
																	{isDesktop &&
																	!pending &&
																	!isLocalClientMessageId(message.messageId) ? (
																		<button
																			type="button"
																			onClick={(event) => {
																				event.stopPropagation();
																				setOpenMessageActionId((current) =>
																					current === message.messageId ? null : message.messageId,
																				);
																			}}
																			className="rounded-md p-1 hover:bg-white/10"
																		>
																			<Ellipsis className="h-3.5 w-3.5" />
																		</button>
																	) : null}
																</div>
															</div>
														) : null}
													</div>
												</button>
											) : null}

											{isAlbumOnlyBubble ? (
												<button
													type="button"
													onClick={() => {
														if (messageLongPressTriggeredRef.current) {
															messageLongPressTriggeredRef.current = false;
															return;
														}
														if (albumId) {
															void openAlbumViewerById(albumId);
														}
													}}
													className="block w-full"
													disabled={!albumId}
												>
													<div className="relative h-56 w-full overflow-hidden bg-[var(--surface-2)]">
														<div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)]">
															<Album className="h-8 w-8" />
														</div>
														{albumCover ? (
															<img
																src={albumCover}
																alt="Album cover"
																className="h-full w-full object-cover"
																onError={(event) => {
																	event.currentTarget.style.display = "none";
																}}
															/>
														) : null}
														<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-white">
															<Avatar
																src={senderAvatarUrl}
																alt={senderLabel}
																fallback={senderLabel}
																className="h-16 w-16 border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-sm"
															/>
															<p className="max-w-full truncate text-sm font-semibold leading-tight text-white drop-shadow">
																{senderLabel}
															</p>
														</div>
														<div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 py-2 text-[10px] text-white">
															<div className="flex items-center gap-2">
																{pending ? <span>Sending...</span> : null}
																{failed ? <span>Failed</span> : null}
															</div>
															<div className="flex items-center gap-2">
																<span>
																	{formatMessageTime(message.timestamp, nowTimestamp)}
																</span>
																{isDesktop &&
																!pending &&
																!isLocalClientMessageId(message.messageId) ? (
																	<button
																		type="button"
																		onClick={(event) => {
																			event.stopPropagation();
																			setOpenMessageActionId((current) =>
																				current === message.messageId ? null : message.messageId,
																			);
																		}}
																		className="rounded-md p-1 hover:bg-white/10"
																	>
																		<Ellipsis className="h-3.5 w-3.5" />
																	</button>
																) : null}
															</div>
														</div>
													</div>
												</button>
											) : null}

											{videoUrl ? (
												<div className="mb-2 overflow-hidden rounded-xl border border-black/10 bg-black">
													<video
														controls
														preload="metadata"
														src={videoUrl}
														className="max-h-72 w-full"
													/>
												</div>
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

											{isAlbumMessage && !isAlbumOnlyBubble ? (
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

											{!isMediaOnlyBubble ? (
												<p className="whitespace-pre-wrap break-words">
													{messageText}
												</p>
											) : null}

													{!isLocalClientMessageId(message.messageId) ? (
												<button
													type="button"
													onClick={() => void handleReact(message)}
													disabled={isMutatingMessageId === message.messageId}
															className={`${fireButtonClass} cursor-pointer transition-opacity ${
														message.reactions.length > 0
															? "opacity-100"
															: "opacity-0 group-hover/bubble:opacity-60"
													} hover:opacity-80`}
												>
													<span className={`chat-reaction-flame text-2xl inline-flex ${
														reactionBurstMessageId === message.messageId ? "chat-reaction-flame--burst" : ""
													}`}>
														🔥
													</span>
												</button>
											) : null}

											{!isMediaOnlyBubble ? (
											<div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
												<div className="flex items-center gap-2">
													{pending ? <span>Sending...</span> : null}
													{failed ? <span>Failed</span> : null}
												</div>
												<div className="flex items-center gap-2">
													<span>
														{formatMessageTime(message.timestamp, nowTimestamp)}
													</span>
													{isDesktop &&
													!pending &&
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
											) : null}

											{isDesktop && openMessageActionId === message.messageId ? (
												<div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-black/10 p-2 text-[11px]">
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
						            </Fragment>
                                );
                            });
                        })()}
						</div>
						<div ref={threadBottomRef} />
					</div>

					<form
						onSubmit={handleSend}
						className={`${!isDesktop ? "fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4" : "mt-3 pt-3"} border-t border-[var(--border)] bg-[var(--surface)]`}
						style={!isDesktop ? { paddingBottom: "max(12px, env(safe-area-inset-bottom))" } : undefined}
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
								<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> Attach media
							</button>
							<input
								type="file"
								ref={attachmentInputRef}
								onChange={onAttachmentInput}
								accept="image/*,video/*"
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

						{pendingAttachmentFile ? (
							<div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
								<p className="text-xs font-medium text-[var(--text)]">
									Ready to send: {pendingAttachmentFile.name}
								</p>
								<div className="mt-2 grid gap-2">
									<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
										<input
											type="checkbox"
											checked={attachmentLooping}
											onChange={(event) =>
												setAttachmentLooping(event.target.checked)
											}
										/>
										<span>looping</span>
									</label>
									<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
										<input
											type="checkbox"
											checked={attachmentTakenOnGrindr}
											onChange={(event) =>
												setAttachmentTakenOnGrindr(event.target.checked)
											}
										/>
										<span>takenOnGrindr</span>
									</label>
								</div>
								<div className="mt-3 flex gap-2">
									<button
										type="button"
										onClick={confirmPendingAttachment}
										disabled={isUploadingAttachment}
										className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
									>
										Send attachment
									</button>
									<button
										type="button"
										onClick={cancelPendingAttachment}
										disabled={isUploadingAttachment}
										className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
									>
										Cancel
									</button>
								</div>
							</div>
						) : null}

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
									<span>Uploading attachment</span>
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

					{!isDesktop && selectedActionMessage && albumViewer === null ? (
						<div
							className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
							onClick={() => setOpenMessageActionId(null)}
						>
							<div
								className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-3 shadow-2xl"
								onClick={(event) => event.stopPropagation()}
							>
								<p className="px-1 pb-2 text-center text-xs font-medium tracking-wide text-[var(--text-muted)]">
									Message actions
								</p>
								<div className="grid gap-2">
									{selectedActionMessageMine && !selectedActionMessage.unsent ? (
										<button
											type="button"
											onClick={() => void handleUnsend(selectedActionMessage)}
											disabled={
												isMutatingMessageId === selectedActionMessage.messageId
											}
											className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-60"
										>
											Unsend
										</button>
									) : null}
									<button
										type="button"
										onClick={() => void handleDelete(selectedActionMessage)}
										disabled={
											isMutatingMessageId === selectedActionMessage.messageId
										}
										className="w-full rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-60"
									>
										Delete
									</button>
									<button
										type="button"
										onClick={() => setOpenMessageActionId(null)}
										className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										Cancel
									</button>
								</div>
							</div>
						</div>
					) : null}
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
						<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> Attach media
					</button>
					<input
						type="file"
						ref={attachmentInputRef}
						onChange={onAttachmentInput}
						accept="image/*,video/*"
						className="hidden"
					/>
				</div>

				{pendingAttachmentFile ? (
					<div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
						<p className="text-xs font-medium text-[var(--text)]">
							Ready to send: {pendingAttachmentFile.name}
						</p>
						<div className="mt-2 grid gap-2">
							<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
								<input
									type="checkbox"
									checked={attachmentLooping}
									onChange={(event) =>
										setAttachmentLooping(event.target.checked)
									}
								/>
								<span>looping</span>
							</label>
							<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
								<input
									type="checkbox"
									checked={attachmentTakenOnGrindr}
									onChange={(event) =>
										setAttachmentTakenOnGrindr(event.target.checked)
									}
								/>
								<span>takenOnGrindr</span>
							</label>
						</div>
						<div className="mt-3 flex gap-2">
							<button
								type="button"
								onClick={confirmPendingAttachment}
								disabled={isUploadingAttachment}
								className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
							>
								Send attachment
							</button>
							<button
								type="button"
								onClick={cancelPendingAttachment}
								disabled={isUploadingAttachment}
								className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
							>
								Cancel
							</button>
						</div>
					</div>
				) : null}

				{isUploadingAttachment || uploadProgress > 0 ? (
					<div className="mb-2">
						<div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
							<span>Uploading attachment</span>
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
