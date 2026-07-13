import {
	Album,
	Archive,
	Ban,
	Check,
	CheckCheck,
	ChevronLeft,
	Copy,
	Download,
	EllipsisVertical,
	Eye,
	EyeOff,
	Star,
	Hourglass,
	ImagePlus,
	Images,
	Infinity,
	Loader2,
	MapPin,
	Mic,
	Square,
	Plus,
	Settings2,
	BookMarked,
	MessageCircleOff,
	MessageCircleX,
	MessageSquarePlus,
	MessageSquareQuote,
	PencilLine,
	Pin,
	Play,
	Reply,
	RotateCw,
	SendHorizontal,
	Share2,
	ShieldCheck,
	SquareCenterlineDashedHorizontal,
	SquareStack,
	Sticker,
	TimerOff,
	Trash2,
	Video,
	VideoOff,
	Undo2,
	User,
	Volume2,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { NavigateFunction } from "react-router-dom";
import toast from "react-hot-toast";
import { appLog } from "../../../utils/logger";
import { isIos, saveMediaToDevice } from "../../../services/saveMedia";
import { startOutgoingCall } from "../../../components/VideoCallManager";
import { useVideoCallRemainingSeconds } from "../../../hooks/queries/useVideoCallQueries";
import { isWebRtcSupported } from "../../../services/agoraCall";
import {
	useModalClose,
} from "../../../hooks/useModalClose";
import type { AlbumListItem, UiMessage } from "../../../types/chat-page";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { ProfileDetail } from "../../../types/grid";
import type { DrawerMedia } from "./ChatDrawerPanel";
import { ChatDrawerPanel } from "./ChatDrawerPanel";
import { decodeGeohash } from "../../../utils/geohash";
import { MapLocationPicker } from "../gridpage/components/MapLocationPicker";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { usePreferences } from "../../../contexts/PreferencesContext";
import {
	getMessageLocation,
	getMessagePreviewLabel,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getMessageImageUrl,
	getMessageVideoUrl,
	getMessageAudioUrl,
	getMessageAlbumId,
	getMessageAlbumCoverUrl,
	getMediaCaptureTarget,
} from "./chatUtils";
import { getCachedMediaUri } from "../../../services/mediaStore";
import { getThumbImageUrl } from "../../../utils/media";
import { formatDistance } from "../gridpage/utils";
import { ProfileImage } from "../../../components/ui/profile-image";
import { FreeGrindBadge } from "../../../components/FreeGrindBadge";
import { ChatThreadMessages } from "./ChatThreadMessages";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { PromptDialog } from "../../../components/ui/prompt-dialog";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { getShowReadReceiptToggle, isReadReceiptsHidden, toggleReadReceiptsHidden } from "../../../utils/privacy";
import { ToggleRow } from "../../../components/ui/toggle-row";
import { BottomDrawer } from "../../../components/ui/bottom-drawer";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { GiphyPickerSheet } from "./GiphyPickerSheet";
import type { ArchivedReason } from "../../../types/chat-db";
import { useAvatarCache } from "../../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { matchSlashCommandsByPrefix, type SlashCommandDef } from "./slashCommands";
import { getForbiddenWords, setForbiddenWords } from "../../../utils/autoblock";
import {
	SKIP_BLOCK_CONFIRM_KEY,
	SKIP_UNBLOCK_CONFIRM_KEY,
	SKIP_DELETE_CONVERSATION_CONFIRM_KEY,
	isBlockConfirmSkipped,
	isUnblockConfirmSkipped,
	isDeleteConversationConfirmSkipped,
} from "../../../utils/blockConfirm";

async function fixWebmDuration(blob: Blob, durationMs: number): Promise<Blob> {
	if (!blob.type.includes("webm")) return blob;
	const buf = await blob.arrayBuffer();
	const data = new Uint8Array(buf);
	// Find Matroska Duration element (ID 0x4489) with 8-byte float64 (size VINT 0x88)
	for (let i = 0; i < data.length - 10; i++) {
		if (data[i] === 0x44 && data[i + 1] === 0x89 && data[i + 2] === 0x88) {
			new DataView(buf).setFloat64(i + 3, durationMs, false);
			return new Blob([buf], { type: blob.type });
		}
	}
	return blob;
}
import {
	loadSavedPhrases,
	saveSavedPhrases,

	SAVED_PHRASES_UPDATED_EVENT,
} from "../../../services/savedPhrases";

type ChatThreadPanelProps = {
	navigate: NavigateFunction;
	isDesktop: boolean;
	selectedConversation: ConversationEntry | null;
	targetProfileId: number | null;
	targetProfileDetail?: ProfileDetail | null;
	userId: number | null;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	isUpdatingConversationState: boolean;
	isHeaderActionsMenuOpen: boolean;
	setIsHeaderActionsMenuOpen: (value: ((current: boolean) => boolean) | boolean) => void;
	headerActionsMenuRef: { current: HTMLDivElement | null };
	togglePin: () => void | Promise<void>;
	toggleMute: () => void | Promise<void>;
	isHidden: boolean;
	toggleHide: () => void;
	onDeleteConversation?: (conversationId: string) => void | Promise<void>;
	isDeletingConversation?: boolean;
	onBlockProfile?: (profileId: number) => void | Promise<void>;
	isBlockingProfile?: boolean;
	onUnblockProfile?: (profileId: number) => void | Promise<void>;
	isUnblockingProfile?: boolean;
	isBlockedBySelf?: boolean;
	onToggleFavorite?: (profileId: number, currentlyFavorite: boolean) => void | Promise<void>;
	isFavorite?: boolean;
	isTogglingFavorite?: boolean;
	localNickname?: string | null;
	onEditLocalNickname?: (profileId: number, defaultName: string) => void | Promise<void>;
	getProfileReturnToChatPath: (profileId: number) => string;
	isLoadingThread: boolean;
	threadConversationId: string | null;
	threadError: string | null;
	loadThread: (args: { conversationId: string; older: boolean }) => void | Promise<void>;
	threadScrollContainerRef: { current: HTMLDivElement | null };
	handleThreadScroll: (event: React.UIEvent<HTMLDivElement>) => void;
	messagePageKey: string | null;
	isLoadingOlderMessages: boolean;
	threadMessages: UiMessage[];
	threadLastReadTimestamp: number | null;
	messageElementRefs: { current: Map<string, HTMLDivElement> };
	handleMessageTap: (message: Message) => void | Promise<void>;
	startMessageLongPress: (messageId: string) => void;
	endMessageLongPress: () => void;
	messageLongPressTriggeredRef: { current: boolean };
	openFullScreenImage: (imageUrl: string, meta?: { takenOnGrindr: boolean; createdAtLabel: string | null; timestamp: number }, mediaType?: "image" | "video", messageId?: string, senderId?: number) => void;
	openAlbumViewerById: (albumId: number, isOwnAlbum?: boolean) => void | Promise<void>;
	selectedThreadMessageMatches: Array<{ messageId: string }>;
	activeThreadSearchIndex: number;
	openMessageActionId: string | null;
	setOpenMessageActionId: (value: ((current: string | null) => string | null) | string | null) => void;
	isMutatingMessageId: string | null;
	reactionBurstMessageId: string | null;
	handleReact: (message: Message) => void | Promise<void>;
	handleUnsend: (message: Message) => void | Promise<void>;
	handleDelete: (message: Message) => void | Promise<void>;
	handleRetry: (message: Message) => void;
	handleReply: (message: Message) => void | Promise<void>;
	handleStopAlbumShare: (albumId: number) => void | Promise<void>;
	threadBottomRef: { current: HTMLDivElement | null };
	handleSend: (event: React.FormEvent<HTMLFormElement>) => void;
	toggleAlbumPicker: () => void;
	toggleDrawer: () => void;
	attachmentInputRef: { current: HTMLInputElement | null };
	onAttachmentInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
	isUploadingAttachment: boolean;
	pendingAttachmentFile: File | null;
	attachmentLooping: boolean;
	attachmentTakenOnGrindr: boolean;
	attachmentMaxViews: number;
	setAttachmentLooping: (value: boolean) => void;
	setAttachmentTakenOnGrindr: (value: boolean) => void;
	setAttachmentMaxViews: (value: number) => void;
	confirmPendingAttachment: () => void;
	confirmAttachmentFile: (file: File) => void | Promise<void>;
	cancelPendingAttachment: () => void;
	isAlbumPickerOpen: boolean;
	isLoadingAlbums: boolean;
	shareableAlbums: AlbumListItem[];
	albumCoverMap?: Map<number, string>;
	ownProfilePhotoUrl?: string | null;
	isSharingAlbum: boolean;
	pendingAlbumShare: {
		albumId: number;
		albumName: string;
	} | null;
	shareAlbumToCurrentConversation: (
		albumId: number,
		albumName?: string | null,
	) => void | Promise<void>;
	confirmPendingAlbumShare: (expirationType: string) => void | Promise<void>;
	closePendingAlbumShare: () => void;
	isDrawerOpen: boolean;
	isLoadingDrawer: boolean;
	drawerError: string | null;
	drawerMedia: DrawerMedia[];
	isSendingDrawerMedia: boolean;
	isAddingDrawerMedia: boolean;
	deletingDrawerMediaId: number | null;
	onLoadDrawerMedia: () => void | Promise<void>;
	onSendDrawerMedia: (mediaIds: number[], maxViews?: number) => Promise<void>;
	onAddDrawerMedia: (file: File, takenOnGrindr: boolean) => Promise<void>;
	onDeleteDrawerMedia: (mediaId: number) => Promise<void>;
	onShareAlbumFromDrawer: (albumId: number, expirationType: string) => Promise<void>;
	onStopAlbumShareFromDrawer: (albumId: number) => Promise<void>;
	onSendLocation: (lat: number, lon: number) => void | Promise<void>;
	onSendGiphy: (gif: { id: string; urlPath: string; stillPath: string; previewPath: string; width: number; height: number }) => void | Promise<void>;
	onAudioRecorded: (blob: Blob, durationMs: number, autoSend?: boolean) => void;
	pendingAudioBlob: Blob | null;
	pendingAudioDuration: number;
	isSendingAudio: boolean;
	confirmAudio: () => void | Promise<void>;
	cancelAudio: () => void;
	uploadProgress: number;
	draft: string;
	setDraft: (value: string) => void;
	replyTargetMessage: UiMessage | null;
	clearReplyTarget: () => void;
	isSending: boolean;
	selectedActionMessage: UiMessage | null;
	selectedActionMessageMine: boolean;
	isAlbumSheetOpen: boolean;
	onOpenMediaSheet?: () => void;
	isPartnerTyping?: boolean;
	isArchived?: boolean;
	archivedReason?: ArchivedReason | null;
};


function AudioPreviewPlayer({ blob, durationMs, recordedBars, recordedFraction }: { blob: Blob; durationMs: number; recordedBars: number[]; recordedFraction: number }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const u = URL.createObjectURL(blob);
		setUrl(u);
		return () => { setTimeout(() => URL.revokeObjectURL(u), 3000); };
	}, [blob]);
	if (!url) return null;
	return <AudioMessagePlayer src={url} messageId="preview" mine={false} className="w-full" durationHint={durationMs / 1000} hideSpeed compact initialBars={recordedBars} recordedFraction={recordedFraction} />;
}

export function ChatThreadPanel(props: ChatThreadPanelProps) {
	const { t } = useTranslation();
	useAvatarCache();
    const apiFunctions = useApiFunctions();
	const { unitsPreset, geohash } = usePreferences();
	// Feature-detected once (doesn't change during the app's lifetime) —
	// hides every video-call entry point entirely on WebView builds without
	// RTCPeerConnection (confirmed missing on some Linux WebKitGTK builds)
	// instead of showing a menu item that would only fail after tapping it.
	const [webRtcSupported] = useState(() => isWebRtcSupported());
	const [selectedExpirationType, setSelectedExpirationType] = useState("INDEFINITE");
	const [pendingLocationShare, setPendingLocationShare] = useState<{ lat: number; lon: number } | null>(null);
	const [banWordPrompt, setBanWordPrompt] = useState<{ text: string } | null>(null);
	const [banNamePrompt, setBanNamePrompt] = useState<{ text: string } | null>(null);
	const [isSavedPhrasesOpen, setIsSavedPhrasesOpen] = useState(false);
	const [phrasesExpanded, setPhrasesExpanded] = useState(false);
	const [isGiphyPickerOpen, setIsGiphyPickerOpen] = useState(false);
	const [newPhraseInput, setNewPhraseInput] = useState("");
	const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
	const [isComposerFocused, setIsComposerFocused] = useState(false);

	const [isRecording, setIsRecording] = useState(false);
	const [recordingMs, setRecordingMs] = useState(0);
	const [waveformBars, setWaveformBars] = useState<number[]>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const waveformBarsRef = useRef<number[]>([]);
	const [recordedWaveform, setRecordedWaveform] = useState<number[]>([]);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const recordingStartRef = useRef(0);
	const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const recordingMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const waveformRafRef = useRef<number | null>(null);
	const swipeStartXRef = useRef(0);
	const isCapturingRef = useRef(false);
	const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const hasVibratedRef = useRef(false);
	const [recordDragX, setRecordDragX] = useState(0);
	const [showRecordCircle, setShowRecordCircle] = useState(false);
	const [trashBounce, setTrashBounce] = useState(false);
	const CANCEL_THRESHOLD = window.innerWidth * 0.35;
	const dragProgress = Math.min(1, Math.abs(Math.min(0, recordDragX)) / CANCEL_THRESHOLD);
	const stopRecordingRef = useRef<(autoSend?: boolean) => void>(() => {});

	const cleanupAnalyser = useCallback(() => {
		if (waveformRafRef.current) { cancelAnimationFrame(waveformRafRef.current); waveformRafRef.current = null; }
		analyserRef.current = null;
		if (audioCtxRef.current) { void audioCtxRef.current.close(); audioCtxRef.current = null; }
		setWaveformBars([]);
	}, []);

	useEffect(() => { waveformBarsRef.current = waveformBars; }, [waveformBars]);

	useEffect(() => {
		return () => {
			if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
			if (waveformRafRef.current) cancelAnimationFrame(waveformRafRef.current);
			mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
			void audioCtxRef.current?.close();
		};
	}, []);

	const startRecording = useCallback(async () => {
		if (isRecording) return;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"].find(
				(t) => MediaRecorder.isTypeSupported(t),
			) ?? "";
			const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
			chunksRef.current = [];
			recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
			recorder.start(100);
			mediaRecorderRef.current = recorder;
			recordingStartRef.current = Date.now();
			setIsRecording(true);
			(window as unknown as { FreeGrindBridge?: { vibrate?: (ms: number) => void } }).FreeGrindBridge?.vibrate?.(30) ?? navigator.vibrate?.(30);
			setRecordingMs(0);
			recordingTimerRef.current = setInterval(() => {
				const elapsed = Date.now() - recordingStartRef.current;
				setRecordingMs(elapsed);
				if (elapsed >= 60_000) stopRecordingRef.current();
			}, 100);
			recordingMaxTimerRef.current = setTimeout(() => stopRecordingRef.current(), 60_000);
			try {
				const audioCtx = new AudioContext();
				const analyser = audioCtx.createAnalyser();
				analyser.fftSize = 64;
				analyser.smoothingTimeConstant = 0.7;
				audioCtx.createMediaStreamSource(stream).connect(analyser);
				audioCtxRef.current = audioCtx;
				analyserRef.current = analyser;
				const data = new Uint8Array(analyser.frequencyBinCount);
				let lastSample = 0;
				const tick = (t: number) => {
					if (t - lastSample >= 80) {
						lastSample = t;
						analyser.getByteFrequencyData(data);
						const amp = data.slice(0, 10).reduce((a, b) => a + b, 0) / 10 / 255;
						setWaveformBars(prev => [...prev, amp]);
					}
					waveformRafRef.current = requestAnimationFrame(tick);
				};
				waveformRafRef.current = requestAnimationFrame(tick);
			} catch { /* analyser failure is non-fatal */ }
		} catch (err) {
			const name = err instanceof DOMException ? err.name : "";
			if (name === "NotFoundError" || name === "DevicesNotFoundError") {
				toast.error(t("chat.errors.microphone_not_found", { defaultValue: "No microphone found." }));
			} else if (name === "NotAllowedError" || name === "PermissionDeniedError") {
				toast.error(t("chat.errors.microphone_denied", { defaultValue: "Microphone access denied." }));
			} else {
				toast.error(t("chat.errors.microphone_access", { defaultValue: "Could not access microphone." }));
			}
		}
	}, [isRecording, t]);

	const stopRecording = useCallback((autoSend?: boolean) => {
		const recorder = mediaRecorderRef.current;
		if (!recorder || recorder.state === "inactive") return;
		if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
		if (recordingMaxTimerRef.current) { clearTimeout(recordingMaxTimerRef.current); recordingMaxTimerRef.current = null; }
		const durationMs = Date.now() - recordingStartRef.current;
		const capturedBars = [...waveformBarsRef.current];
		cleanupAnalyser();
		recorder.onstop = () => {
			recorder.stream.getTracks().forEach((t) => t.stop());
			const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
			if (rawBlob.size === 0) {
				console.error("[stopRecording] blob is empty — no audio data from mic");
				toast.error(t("chat.errors.recording_failed", { defaultValue: "No audio data captured." }));
				mediaRecorderRef.current = null;
				return;
			}
			void fixWebmDuration(rawBlob, durationMs).then((blob) => {
				if (durationMs >= 500) {
					if (autoSend) {
						(window as unknown as { FreeGrindBridge?: { vibrate?: (ms: number) => void } }).FreeGrindBridge?.vibrate?.(30) ?? navigator.vibrate?.(30);
					}
					setRecordedWaveform(capturedBars);
					props.onAudioRecorded(blob, durationMs, autoSend);
				} else {
					toast.error(t("chat.errors.recording_too_short", { defaultValue: "Recording too short." }));
				}
				mediaRecorderRef.current = null;
			});
		};
		recorder.stop();
		setIsRecording(false);
		setRecordingMs(0);
	}, [cleanupAnalyser, props, t]);
	useEffect(() => { stopRecordingRef.current = stopRecording; }, [stopRecording]);

	const cancelRecording = useCallback(() => {
		const recorder = mediaRecorderRef.current;
		if (!recorder || recorder.state === "inactive") return;
		if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
		if (recordingMaxTimerRef.current) { clearTimeout(recordingMaxTimerRef.current); recordingMaxTimerRef.current = null; }
		cleanupAnalyser();
		recorder.onstop = () => {
			recorder.stream.getTracks().forEach((t) => t.stop());
			mediaRecorderRef.current = null;
		};
		recorder.stop();
		setIsRecording(false);
		setRecordingMs(0);
	}, [cleanupAnalyser]);

	const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
	const [attachmentCrop, setAttachmentCrop] = useState<Crop | undefined>(undefined);
	const [attachmentCompletedCrop, setAttachmentCompletedCrop] = useState<PixelCrop | undefined>(undefined);
	const [isDraggingAttachmentCrop, setIsDraggingAttachmentCrop] = useState(false);
	const attachmentImgRef = useRef<HTMLImageElement | null>(null);
	const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
	const fullLayoutHeightRef = useRef(0);
	const restingOverlapRef = useRef<number | null>(null);
	const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
	const [isDeleteConversationConfirmOpen, setIsDeleteConversationConfirmOpen] =
		useState(false);
	const [dontAskDeleteConversationAgain, setDontAskDeleteConversationAgain] = useState(false);
	const [dontAskBlockAgain, setDontAskBlockAgain] = useState(false);
	const [isUnblockConfirmOpen, setIsUnblockConfirmOpen] = useState(false);
	const [dontAskUnblockAgain, setDontAskUnblockAgain] = useState(false);

	const {
		navigate,
		isDesktop,
		selectedConversation,
		targetProfileId,
		targetProfileDetail = null,
		userId,
		nowTimestamp,
		presenceResults,
		isUpdatingConversationState,
		isHeaderActionsMenuOpen,
		setIsHeaderActionsMenuOpen,
		headerActionsMenuRef,
		togglePin,
		toggleMute,
		isHidden,
		toggleHide,
		onDeleteConversation,
		isDeletingConversation = false,
		onBlockProfile,
		isBlockingProfile = false,
		onUnblockProfile,
		isUnblockingProfile = false,
		isBlockedBySelf = false,
		onToggleFavorite,
		isFavorite = false,
		isArchived = false,
		archivedReason = null,
		isTogglingFavorite = false,
		localNickname = null,
		onEditLocalNickname,
		getProfileReturnToChatPath,
		isLoadingThread,
		threadConversationId,
		threadError,
		loadThread,
		threadScrollContainerRef,
		handleThreadScroll,
		messagePageKey,
		isLoadingOlderMessages,
		threadMessages,
		threadLastReadTimestamp,
		messageElementRefs,
		handleMessageTap,
		startMessageLongPress,
		endMessageLongPress,
		messageLongPressTriggeredRef,
		openFullScreenImage,
		openAlbumViewerById,
		selectedThreadMessageMatches,
		activeThreadSearchIndex,
		openMessageActionId,
		setOpenMessageActionId,
		isMutatingMessageId,
		reactionBurstMessageId,
		handleReact,
		handleUnsend,
		handleDelete,
		handleRetry,
		handleReply,
		handleStopAlbumShare,
		threadBottomRef,
		handleSend,
		toggleAlbumPicker,
		attachmentInputRef,
		onAttachmentInput,
		isUploadingAttachment,
		pendingAttachmentFile,
		attachmentLooping,
		attachmentTakenOnGrindr,
		attachmentMaxViews,
		setAttachmentLooping,
		setAttachmentTakenOnGrindr,
		setAttachmentMaxViews,
		confirmPendingAttachment: _confirmPendingAttachment,
		confirmAttachmentFile,
		cancelPendingAttachment,
		isAlbumPickerOpen,
		isLoadingAlbums,
		shareableAlbums,
		albumCoverMap: externalAlbumCoverMap,
		ownProfilePhotoUrl,
		isSharingAlbum,
		pendingAlbumShare,
		shareAlbumToCurrentConversation,
        confirmPendingAlbumShare,
        closePendingAlbumShare,
		uploadProgress,
		draft,
		setDraft,
		replyTargetMessage,
		clearReplyTarget,
		isSending,
		selectedActionMessage,
		selectedActionMessageMine,
		isAlbumSheetOpen,
		onOpenMediaSheet,
		isPartnerTyping = false,
		toggleDrawer,
		isDrawerOpen,
		isLoadingDrawer,
		drawerError,
		drawerMedia,
		isSendingDrawerMedia,
		isAddingDrawerMedia,
		deletingDrawerMediaId,
		onLoadDrawerMedia,
		onSendDrawerMedia,
		onAddDrawerMedia,
		onDeleteDrawerMedia,
		onShareAlbumFromDrawer,
		onStopAlbumShareFromDrawer,
		onSendLocation,
		onSendGiphy,
	} = props;

    const [savedPhrases, setSavedPhrases] = useState<string[]>([]);

	// Account-wide (not per-conversation) video-call allowance — read from the
	// shared cache VideoCallManager already keeps populated (fetched once at
	// app start, refreshed after each call), so opening a conversation never
	// triggers its own network request here.
	const { data: videoCallRemainingSecondsData } = useVideoCallRemainingSeconds(true);
	const videoCallRemainingSeconds = videoCallRemainingSecondsData ?? null;

	useEffect(() => {
		void loadSavedPhrases().then(setSavedPhrases);
	}, []);

	useEffect(() => {
		if (!pendingAttachmentFile) {
			setAttachmentPreviewUrl(null);
			setAttachmentCrop(undefined);
			setAttachmentCompletedCrop(undefined);
			return;
		}
		const url = URL.createObjectURL(pendingAttachmentFile);
		setAttachmentPreviewUrl(url);
		setAttachmentCrop(undefined);
		setAttachmentCompletedCrop(undefined);
		return () => URL.revokeObjectURL(url);
	}, [pendingAttachmentFile]);

	useEffect(() => {
		if (!attachmentPreviewUrl) return;
		setAttachmentCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
	}, [attachmentPreviewUrl]);

	useEffect(() => {
		if (replyTargetMessage) {
			textareaRef.current?.focus();
		}
	}, [replyTargetMessage]);

	const applyAttachmentTransform = useCallback(async (type: "flipH" | "rotateCw") => {
		const img = attachmentImgRef.current;
		if (!img || !img.complete || img.naturalWidth === 0) return;
		const sw = img.naturalWidth;
		const sh = img.naturalHeight;
		const canvas = document.createElement("canvas");
		canvas.width = type === "rotateCw" ? sh : sw;
		canvas.height = type === "rotateCw" ? sw : sh;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.translate(canvas.width / 2, canvas.height / 2);
		if (type === "flipH") ctx.scale(-1, 1);
		if (type === "rotateCw") ctx.rotate(Math.PI / 2);
		ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.95),
		);
		if (!blob) return;
		setAttachmentPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return URL.createObjectURL(blob);
		});
	}, []);

	const handleConfirmAttachment = useCallback(async () => {
		if (!pendingAttachmentFile) return;
		let fileToUpload: File = pendingAttachmentFile;
		const isFullImage =
			!attachmentCompletedCrop ||
			!attachmentImgRef.current ||
			(attachmentCompletedCrop.x <= 1 &&
				attachmentCompletedCrop.y <= 1 &&
				Math.abs(attachmentCompletedCrop.width - attachmentImgRef.current.width) <= 2 &&
				Math.abs(attachmentCompletedCrop.height - attachmentImgRef.current.height) <= 2);
		if (!isFullImage && attachmentCompletedCrop?.width && attachmentCompletedCrop.height && attachmentImgRef.current) {
			const img = attachmentImgRef.current;
			const scaleX = img.naturalWidth / img.width;
			const scaleY = img.naturalHeight / img.height;
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(attachmentCompletedCrop.width * scaleX);
			canvas.height = Math.round(attachmentCompletedCrop.height * scaleY);
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.drawImage(
					img,
					attachmentCompletedCrop.x * scaleX,
					attachmentCompletedCrop.y * scaleY,
					attachmentCompletedCrop.width * scaleX,
					attachmentCompletedCrop.height * scaleY,
					0,
					0,
					canvas.width,
					canvas.height,
				);
				fileToUpload = await new Promise<File>((resolve) => {
					canvas.toBlob(
						(blob) => {
							if (!blob) { resolve(pendingAttachmentFile); return; }
							resolve(new File([blob], pendingAttachmentFile.name, { type: pendingAttachmentFile.type || "image/jpeg" }));
						},
						pendingAttachmentFile.type || "image/jpeg",
						0.92,
					);
				});
			}
		}
		await confirmAttachmentFile(fileToUpload);
	}, [pendingAttachmentFile, attachmentCompletedCrop, confirmAttachmentFile]);

	const handleUsePhrase = (phrase: string) => {
		setDraft(phrase);
	};

	const handleAddPhrase = async () => {
		const trimmed = newPhraseInput.trim();
		if (!trimmed) return;
		const updated = await saveSavedPhrases([...savedPhrases, trimmed]);
		setSavedPhrases(updated);
		setNewPhraseInput("");
	};

	const handleDeletePhrase = async (index: number) => {
		const updated = await saveSavedPhrases(savedPhrases.filter((_, i) => i !== index));
		setSavedPhrases(updated);
	};


	useEffect(() => {
		const syncSavedPhrases = (event: Event) => {
			const detail = (event as CustomEvent<string[]>).detail;
			if (Array.isArray(detail)) {
				setSavedPhrases(detail);
				return;
			}
			void loadSavedPhrases().then(setSavedPhrases);
		};

		window.addEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);

		return () => {
			window.removeEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);
		};
	}, []);
    
    const filteredPhrases = savedPhrases.filter((phrase) =>
        draft.trim() === "" || phrase.toLowerCase().startsWith(draft.toLowerCase()),
    );

    const slashMenuMatch = draft.match(/^\/(\w*)$/);
    const slashMatchCandidates = useMemo(
        () => (slashMenuMatch ? matchSlashCommandsByPrefix(slashMenuMatch[1]) : []),
        [draft],
    );
    const slashMatches = isComposerFocused ? slashMatchCandidates : [];

    useEffect(() => {
        setSlashSelectedIndex(0);
    }, [slashMatches.length, slashMenuMatch?.[1]]);

    const selectSlashCommand = (command: SlashCommandDef) => {
        if (command.requiresConversation && !selectedConversation) {
            return;
        }
        if (command.takesArg) {
            setDraft(`/${command.name} `);
            textareaRef.current?.focus();
        } else {
            setDraft(`/${command.name}`);
            requestAnimationFrame(() => textareaRef.current?.form?.requestSubmit());
        }
    };

	const albumCoverMap = useMemo(() => {
		const map = new Map<number, string>();
		for (const msg of threadMessages) {
			const aid = getMessageAlbumId(msg);
			const cover = getMessageAlbumCoverUrl(msg);
			if (aid && cover) map.set(aid, cover);
		}
		if (externalAlbumCoverMap) {
			for (const [aid, cover] of externalAlbumCoverMap) {
				map.set(aid, cover);
			}
		}
		return map;
	}, [threadMessages, externalAlbumCoverMap]);

	const sharedAlbumIds = useMemo(() => {
		const ids = new Set<number>();
		for (const msg of threadMessages) {
			const aid = getMessageAlbumId(msg);
			const body = msg.body as any;
			if (aid && body?.isViewable) ids.add(aid);
		}
		return ids;
	}, [threadMessages]);

    const [showReadReceiptToggle] = useState(() => getShowReadReceiptToggle());
    const [readReceiptsHidden, setReadReceiptsHidden] = useState(true);

    useEffect(() => {
        if (selectedConversation) {
            setReadReceiptsHidden(isReadReceiptsHidden(selectedConversation.data.conversationId));
        }
    }, [selectedConversation]);

	const closeBlockConfirm = () => {
		if (isBlockingProfile) {
			return;
		}
		setIsBlockConfirmOpen(false);
	};

	const closeUnblockConfirm = () => {
		if (isUnblockingProfile) {
			return;
		}
		setIsUnblockConfirmOpen(false);
	};

	const closeDeleteConversationConfirm = () => {
		if (isDeletingConversation) {
			return;
		}
		setIsDeleteConversationConfirmOpen(false);
	};

	const handleLocationShareRequest = () => {
		if (pendingLocationShare) {
			setPendingLocationShare(null);
			return;
		}
		if (!geohash) {
			toast.error(t("chat.errors.no_location_set", { defaultValue: "No location set in settings" }));
			return;
		}
		try {
			const decoded = decodeGeohash(geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			setPendingLocationShare({ lat, lon });
		} catch (error) {
			appLog.error("Failed to decode geohash", error);
			toast.error(t("chat.errors.invalid_location", { defaultValue: "Invalid location format" }));
		}
	};

	const onFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        handleSend(event);
        textareaRef.current?.focus();
    };

	const handleCopy = async (message: UiMessage) => {
		const location = getMessageLocation(message);
		const body = message.body as any;
		const hasRealText = body && typeof body.text === "string" && body.text.trim().length > 0;

		let content = "";
		if (location) {
			content = `${location.lat}, ${location.lon}`;
		} else if (hasRealText) {
			content = body.text;
		}

		if (!content) {
			setOpenMessageActionId(null);
			return;
		}

		try {
			await navigator.clipboard.writeText(content);
			toast.success(t("chat.toasts.copied", { defaultValue: "Copied to clipboard" }));
		} catch (error) {
			appLog.error("Copy failed", error);
		}
		setOpenMessageActionId(null);
	};

	const handleAddMessageToSavedPhrases = async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed) return;
		const updated = await saveSavedPhrases([...savedPhrases, trimmed]);
		setSavedPhrases(updated);
		toast.success(t("chat.actions.added_to_saved_phrases", { defaultValue: "Added to saved phrases" }));
	};

	useModalClose({
		isOpen: pendingAlbumShare !== null,
		onClose: closePendingAlbumShare,
		escapeKey: false,
	});

	useModalClose({
		isOpen: isBlockConfirmOpen,
		onClose: closeBlockConfirm,
		escapeKey: !isBlockingProfile,
	});

	useModalClose({
		isOpen: isUnblockConfirmOpen,
		onClose: closeUnblockConfirm,
		escapeKey: !isUnblockingProfile,
	});

	useModalClose({
		isOpen: isDeleteConversationConfirmOpen,
		onClose: closeDeleteConversationConfirm,
		escapeKey: !isDeletingConversation,
	});

	useModalClose({
		isOpen: isSavedPhrasesOpen,
		onClose: () => setIsSavedPhrasesOpen(false),
		escapeKey: false,
	});

	useEffect(() => {
		setIsBlockConfirmOpen(false);
		setIsDeleteConversationConfirmOpen(false);
		setDontAskBlockAgain(false);
		setIsUnblockConfirmOpen(false);
		setDontAskUnblockAgain(false);
	}, [selectedConversation?.data.conversationId]);

	useEffect(() => {
		if (isDesktop) {
			setMobileKeyboardInset(0);
			return;
		}

		if (typeof window === "undefined" || !window.visualViewport) {
			setMobileKeyboardInset(0);
			return;
		}

		const viewport = window.visualViewport;

		const updateKeyboardInset = () => {
			fullLayoutHeightRef.current = Math.max(fullLayoutHeightRef.current, window.innerHeight);
			const layoutHeight = fullLayoutHeightRef.current;
			const visibleBottom = viewport.height + viewport.offsetTop;
			const overlap = Math.max(0, Math.round(layoutHeight - visibleBottom));
			if (restingOverlapRef.current === null || overlap < restingOverlapRef.current) {
				restingOverlapRef.current = overlap;
			}
			const keyboardOverlap = overlap - restingOverlapRef.current;
			setMobileKeyboardInset(keyboardOverlap >= 60 ? keyboardOverlap : 0);
		};

		updateKeyboardInset();
		viewport.addEventListener("resize", updateKeyboardInset);
		viewport.addEventListener("scroll", updateKeyboardInset);

		return () => {
			viewport.removeEventListener("resize", updateKeyboardInset);
			viewport.removeEventListener("scroll", updateKeyboardInset);
		};
	}, [isDesktop]);

	useEffect(() => {
		if (isDesktop || !(selectedConversation || targetProfileId)) {
			return;
		}
		const { body, documentElement: html } = document;
		const previousBodyPosition = body.style.position;
		const previousBodyTop = body.style.top;
		const previousBodyLeft = body.style.left;
		const previousBodyRight = body.style.right;
		const previousBodyWidth = body.style.width;
		const previousHtmlOverflow = html.style.overflow;
		window.scrollTo(0, 0);
		html.style.overflow = "hidden";
		body.style.position = "fixed";
		body.style.top = "0";
		body.style.left = "0";
		body.style.right = "0";
		body.style.width = "100%";
		return () => {
			html.style.overflow = previousHtmlOverflow;
			body.style.position = previousBodyPosition;
			body.style.top = previousBodyTop;
			body.style.left = previousBodyLeft;
			body.style.right = previousBodyRight;
			body.style.width = previousBodyWidth;
			window.scrollTo(0, 0);
		};
	}, [isDesktop, selectedConversation, targetProfileId]);

	const renderThread = (selectedConversation || targetProfileId) ? (
		<div
			className={`flex h-full flex-col ${!isDesktop ? "overflow-hidden p-0" : "overflow-hidden p-3 sm:p-4"} ${
				isDesktop ? "surface-card" : ""
			}`}
			style={
				!isDesktop
					? {
						height: `calc(100dvh - ${mobileKeyboardInset}px)`,
					}
					: undefined
			}
		>
			{(() => {
				const otherParticipant = selectedConversation
					? getOtherParticipant(selectedConversation, userId)
					: null;
				const profileId = selectedConversation
					? otherParticipant?.profileId ?? null
					: targetProfileId;
				const avatarHash = selectedConversation
					? otherParticipant?.primaryMediaHash
					: targetProfileDetail?.profileImageMediaHash;
				const distanceMetres = selectedConversation
					? otherParticipant?.distanceMetres
					: targetProfileDetail?.distance;
				const onlineMeta = getParticipantOnlineMeta(
					selectedConversation ? otherParticipant?.lastOnline : targetProfileDetail?.seen,
					selectedConversation ? otherParticipant?.onlineUntil : targetProfileDetail?.onlineUntil,
					nowTimestamp,
					t,
				);
				const isOnline = onlineMeta.isOnline;
				const distanceLabel = distanceMetres ? formatDistance(distanceMetres, t, unitsPreset) : null;
				const actualProfileName = selectedConversation ? selectedConversation.data.name : targetProfileDetail?.displayName;
				const displayName =
					localNickname ||
					actualProfileName ||
					t("common.unknown_display_name");

				// Blocking a chat with a live conversation archives it — that's why
				// the existing-conversation case keys off isArchived. There's no
				// conversation to archive yet in the new-chat case, so key off
				// isBlockedBySelf directly there instead.
				const showBlockGroup = selectedConversation ? !isArchived : !isBlockedBySelf;
				const showUnblockButton = selectedConversation
					? isArchived && isBlockedBySelf
					: isBlockedBySelf;

				const requestBlockProfile = () => {
					if (profileId == null || isBlockingProfile || !onBlockProfile) {
						return;
					}

					setIsHeaderActionsMenuOpen(false);
					if (isBlockConfirmSkipped()) {
						void onBlockProfile(profileId);
						return;
					}

					setDontAskBlockAgain(false);
					setIsBlockConfirmOpen(true);
				};

				const confirmBlockProfile = () => {
					if (profileId == null || isBlockingProfile || !onBlockProfile) {
						return;
					}

					if (dontAskBlockAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
					}

					setIsBlockConfirmOpen(false);
					void onBlockProfile(profileId);
				};

				const requestUnblockProfile = () => {
					if (profileId == null || isUnblockingProfile || !onUnblockProfile) {
						return;
					}

					setIsHeaderActionsMenuOpen(false);
					if (isUnblockConfirmSkipped()) {
						void onUnblockProfile(profileId);
						return;
					}

					setDontAskUnblockAgain(false);
					setIsUnblockConfirmOpen(true);
				};

				const confirmUnblockProfile = () => {
					if (profileId == null || isUnblockingProfile || !onUnblockProfile) {
						return;
					}

					if (dontAskUnblockAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_UNBLOCK_CONFIRM_KEY, "true");
					}

					setIsUnblockConfirmOpen(false);
					void onUnblockProfile(profileId);
				};

				const requestDeleteConversation = () => {
					if (!selectedConversation || !onDeleteConversation || isDeletingConversation) {
						return;
					}
					setIsHeaderActionsMenuOpen(false);
					if (isDeleteConversationConfirmSkipped()) {
						void onDeleteConversation(selectedConversation.data.conversationId);
						return;
					}
					setDontAskDeleteConversationAgain(false);
					setIsDeleteConversationConfirmOpen(true);
				};

				const confirmDeleteConversation = () => {
					if (!selectedConversation || !onDeleteConversation || isDeletingConversation) {
						return;
					}
					if (dontAskDeleteConversationAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY, "true");
					}
					setIsDeleteConversationConfirmOpen(false);
					void onDeleteConversation(selectedConversation.data.conversationId);
				};

				return (
					<>
						<div
							className={`flex items-center justify-between gap-3 border-b border-[var(--border)] ${!isDesktop ? "shrink-0 bg-[var(--surface)] px-[var(--app-px)] pb-3" : "mb-3 pb-3 -mx-3 sm:-mx-4 px-3 sm:px-4"}`}
							style={
								!isDesktop
									? {
										paddingTop:
											"calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))",
									}
									: undefined
							}
						>
							<div
								className={`min-w-0 flex items-center gap-3 ${!isDesktop ? "pl-0" : ""}`}
							>
                                {!isDesktop && (
                                    <button
                                        type="button"
                                        onClick={() => navigate("/chat")}
                                        className="shrink-0 rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
                                        aria-label={t("browse_location.back_aria")}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                )}
								<button
									type="button"
									onClick={() => {
										if (profileId == null) {
											return;
										}
										const returnTo = getProfileReturnToChatPath(profileId);
										const nextParams = new URLSearchParams();
										nextParams.set("returnTo", returnTo);
										navigate(
											`/profile/${profileId}?${nextParams.toString()}`,
											{ state: { returnTo } },
										);
									}}
									disabled={profileId == null || isArchived}
									aria-label="Open profile"
									title={onlineMeta.label}
									className={`h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-[var(--surface-2)] transition disabled:cursor-default disabled:opacity-80 ${
										isOnline
											? "border-emerald-500 shadow-[0_0_0_2px_color-mix(in_srgb,var(--surface)_70%,transparent)] hover:border-emerald-400"
											: "border-[var(--border)] hover:border-[var(--accent)]"
									}`}
								>
									<ProfileImage
										src={resolveAvatarSrc(
											avatarHash,
											getParticipantAvatarUrl(avatarHash),
										)}
										alt={displayName}
										className={isArchived ? "grayscale" : undefined}
									/>
								</button>
								<div className="min-w-0">
									<div className="flex items-center gap-1.5 min-w-0">
										<p className="truncate text-lg font-semibold">
											{displayName}
										</p>
										{profileId != null && presenceResults[profileId] ? (
											<FreeGrindBadge size="md" title={t("profile_details.uses_free_grind")} />
										) : null}
									</div>
									<p className="text-sm text-[var(--text-muted)]">
										{distanceLabel
											? `${onlineMeta.label} · ${distanceLabel}`
											: onlineMeta.label}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
            {isDesktop && showBlockGroup && (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            if (profileId == null || !onToggleFavorite) return;
                            void onToggleFavorite(profileId, isFavorite);
                        }}
                        disabled={isTogglingFavorite || profileId == null || !onToggleFavorite}
                        title={isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
                        className={`rounded-xl border p-2 transition disabled:opacity-60 ${
                            isFavorite
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                        }`}
                    >
                        {isTogglingFavorite ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
                        )}
                    </button>
                    <button
                        type="button"
                        disabled={isUpdatingConversationState || !selectedConversation}
                        onClick={togglePin}
                        title={selectedConversation?.data.pinned ? t("chat.unpin") : t("chat.pin")}
                        className={`rounded-xl border p-2 transition disabled:opacity-40 disabled:cursor-not-allowed ${
                            selectedConversation?.data.pinned
                                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110"
                                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
                        }`}
                    >
                        <Pin className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={requestBlockProfile}
                        disabled={isBlockingProfile || profileId == null || !onBlockProfile}
                        title={isBlockingProfile ? t("profile_details.block_in_progress") : t("profile_details.block")}
                        className="rounded-xl border border-red-500/40 bg-red-500/10 p-2 text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
                    >
                        {isBlockingProfile ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Ban className="h-4 w-4" />
                        )}
                    </button>
                </>
            )}

            {isDesktop && showUnblockButton && (
                <button
                    type="button"
                    onClick={requestUnblockProfile}
                    disabled={isUnblockingProfile || profileId == null || !onUnblockProfile}
                    title={isUnblockingProfile ? t("profile_details.unblock_in_progress") : t("profile_details.unblock")}
                    className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-60"
                >
                    {isUnblockingProfile ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <ShieldCheck className="h-4 w-4" />
                    )}
                </button>
            )}

								{isDesktop && onOpenMediaSheet && (
									<button
										type="button"
										onClick={onOpenMediaSheet}
										disabled={!selectedConversation}
										className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
										aria-label="Received media"
									>
										<Images className="h-4 w-4" />
									</button>
								)}

								<div
									ref={headerActionsMenuRef}
									className={`relative ${!isDesktop ? "pr-0" : ""}`}
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
										<EllipsisVertical className="h-4 w-4" />
									</button>
									{isHeaderActionsMenuOpen ? (
										<div className="absolute right-0 top-full z-30 mt-2 flex max-h-[70dvh] min-w-[210px] flex-col gap-1 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 shadow-lg">
											<div className="flex shrink-0 flex-col gap-1 px-2">
											{!isArchived && (
											<button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													if (profileId == null) return;
													const returnTo = getProfileReturnToChatPath(profileId);
													const nextParams = new URLSearchParams();
													nextParams.set("returnTo", returnTo);
													navigate(`/profile/${profileId}?${nextParams.toString()}`, { state: { returnTo } });
												}}
												disabled={profileId == null}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
											>
												<User className="mr-2 h-4 w-4 opacity-70" />
												{t("chat.view_profile")}
											</button>
											)}
											{!isArchived && profileId != null && (() => {
												const videoCallExhausted =
													webRtcSupported && videoCallRemainingSeconds != null && videoCallRemainingSeconds <= 0;
												const videoCallDisabled = !webRtcSupported || videoCallExhausted;
												const remainingMinutes = videoCallRemainingSeconds != null ? Math.floor(videoCallRemainingSeconds / 60) : null;
												return (
												<button
													type="button"
													onClick={() => {
														if (videoCallDisabled) return;
														setIsHeaderActionsMenuOpen(false);
														startOutgoingCall(String(profileId), displayName, avatarHash ?? null);
													}}
													disabled={videoCallDisabled}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
												>
													{videoCallDisabled ? (
														<VideoOff className="mr-2 h-4 w-4 opacity-70" />
													) : (
														<Video className="mr-2 h-4 w-4 opacity-70" />
													)}
													<span className="flex flex-col">
														<span>{t("chat.start_video_call")}</span>
														{!webRtcSupported ? (
															<span className="text-xs text-[var(--text-muted)]">{t("chat.video_call_platform_unsupported")}</span>
														) : videoCallExhausted ? (
															<span className="text-xs text-[var(--text-muted)]">{t("chat.video_call_limit_reached")}</span>
														) : remainingMinutes != null ? (
															<span className="text-xs text-[var(--text-muted)]">
																{remainingMinutes >= 1
																	? t("chat.video_call_minutes_left", { count: remainingMinutes })
																	: t("chat.video_call_seconds_left", { count: videoCallRemainingSeconds! })}
															</span>
														) : null}
													</span>
												</button>
												);
											})()}
											{!isDesktop && onOpenMediaSheet && (
												<button
													type="button"
													onClick={() => {
														setIsHeaderActionsMenuOpen(false);
														onOpenMediaSheet();
													}}
													disabled={!selectedConversation}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
												>
													<Images className="mr-2 h-4 w-4 opacity-70" />
													{t("chat.received_media")}
												</button>
											)}
											{showReadReceiptToggle && !isArchived && (
												<button
													type="button"
													onClick={() => {
														if (!selectedConversation) return;
														setIsHeaderActionsMenuOpen(false);
														const newState = toggleReadReceiptsHidden(selectedConversation.data.conversationId);
														setReadReceiptsHidden(newState);
														if (!newState) {
															const lastMsg = threadMessages[threadMessages.length - 1];
															if (lastMsg) {
																apiFunctions.markRead(selectedConversation.data.conversationId, lastMsg.messageId).catch(() => {});
																loadThread({ conversationId: selectedConversation.data.conversationId, older: false });
															}
														}
														toast.success(newState ? "Read receipts turned off for this chat." : "Read receipts turned on for this chat.");
													}}
													disabled={!selectedConversation}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40"
												>
													{readReceiptsHidden ? <Check className="mr-2 h-4 w-4 opacity-70" /> : <CheckCheck className="mr-2 h-4 w-4 opacity-70" />}
													<span className="flex flex-col">
														<span>{t("chat.read_receipts_label")}</span>
														<span className="text-xs text-[var(--text-muted)]">
															{readReceiptsHidden ? t("chat.read_receipts_off") : t("chat.read_receipts_on")}
														</span>
													</span>
												</button>
											)}
											<button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													if (profileId == null || !onEditLocalNickname) return;
													void onEditLocalNickname(profileId, displayName);
												}}
												disabled={profileId == null || !onEditLocalNickname}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
											>
												<PencilLine className="mr-2 h-4 w-4 opacity-70" />
												{localNickname ? t("chat.nicknames.edit") : t("chat.nicknames.set")}
											</button>
											{!isDesktop && showBlockGroup && (
												<button
													type="button"
													onClick={() => {
														setIsHeaderActionsMenuOpen(false);
														if (profileId == null || !onToggleFavorite) return;
														void onToggleFavorite(profileId, isFavorite);
													}}
													disabled={isTogglingFavorite || profileId == null || !onToggleFavorite}
													className={`flex items-center rounded-lg px-2 py-2 text-left text-sm transition disabled:opacity-60 ${
														isFavorite ? "text-[var(--accent)] hover:bg-[var(--accent)]/10" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
													}`}
												>
													{isTogglingFavorite ? (
														<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													) : (
														<Star className={`mr-2 h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
													)}
													{isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
												</button>
											)}
											{!isDesktop && (
												<button
													type="button"
													disabled={isUpdatingConversationState || !selectedConversation}
													onClick={() => {
														setIsHeaderActionsMenuOpen(false);
														void togglePin();
													}}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
												>
													<Pin className="mr-2 h-4 w-4 opacity-70" />
													{selectedConversation?.data.pinned ? t("chat.unpin") : t("chat.pin")}
												</button>
											)}
											<button
												type="button"
												disabled={!selectedConversation}
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													toggleHide();
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
											>
												{isHidden ? <Eye className="mr-2 h-4 w-4 opacity-70" /> : <EyeOff className="mr-2 h-4 w-4 opacity-70" />}
												{isHidden
													? t("chat.unhide_conversation", { defaultValue: "Unhide" })
													: t("chat.hide_conversation", { defaultValue: "Hide" })}
											</button>
											{!isArchived && (
												<button
													type="button"
													disabled={isUpdatingConversationState || !selectedConversation}
													onClick={() => {
														setIsHeaderActionsMenuOpen(false);
														void toggleMute();
													}}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed"
												>
													{selectedConversation?.data.muted ? (
														<Volume2 className="mr-2 h-4 w-4 opacity-70" />
													) : (
														<MessageCircleOff className="mr-2 h-4 w-4 opacity-70" />
													)}
													{selectedConversation?.data.muted ? t("chat.unmute") : t("chat.mute")}
												</button>
											)}
											</div>
											{/* — Keyword banning — */}
											{!isArchived && actualProfileName && (
												<>
													<div className="h-px shrink-0 bg-[var(--border)]" />
													<div className="flex shrink-0 flex-col gap-1 px-2">
													<button
														type="button"
														onClick={() => {
															setIsHeaderActionsMenuOpen(false);
															setBanNamePrompt({ text: actualProfileName });
														}}
														className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
													>
														<Ban className="mr-2 h-4 w-4 opacity-70" />
														<span className="flex flex-col">
															<span>Add forbidden Keyword</span>
															<span className="text-xs text-[var(--text-muted)]">Profile Name</span>
														</span>
													</button>
													</div>
												</>
											)}
											{/* — Destructive — */}
											<div className="h-px shrink-0 bg-[var(--border)]" />
											<div className="flex shrink-0 flex-col gap-1 px-2">
											{!isDesktop && showBlockGroup && (
												<button
													type="button"
													onClick={requestBlockProfile}
													disabled={isBlockingProfile || profileId == null || !onBlockProfile}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
												>
													<Ban className="mr-2 h-4 w-4 opacity-70" />
													{isBlockingProfile ? t("profile_details.block_in_progress") : t("profile_details.block")}
												</button>
											)}
											{!isDesktop && showUnblockButton && (
												<button
													type="button"
													onClick={requestUnblockProfile}
													disabled={isUnblockingProfile || profileId == null || !onUnblockProfile}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-emerald-400 transition hover:bg-emerald-500/10 disabled:opacity-60"
												>
													<ShieldCheck className="mr-2 h-4 w-4 opacity-70" />
													{isUnblockingProfile ? t("profile_details.unblock_in_progress") : t("profile_details.unblock")}
												</button>
											)}
											<button
												type="button"
												onClick={requestDeleteConversation}
												disabled={!selectedConversation || !onDeleteConversation || isDeletingConversation}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
											>
												<MessageCircleX className="mr-2 h-4 w-4 opacity-70" />
												{isDeletingConversation ? t("chat.delete_conversation_in_progress") : t("chat.delete_conversation")}
											</button>
											</div>
										</div>
									) : null}
								</div>
							</div>
						</div>

						<ConfirmDialog
							isOpen={isBlockConfirmOpen}
							title={t("profile_details.block")}
							message={t("profile_details.block_confirm")}
							confirmLabel={t("profile_details.block")}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={confirmBlockProfile}
							onCancel={closeBlockConfirm}
							isProcessing={isBlockingProfile}
							confirmTone="danger"
							dontAskAgainLabel={t("profile_details.dont_ask_again")}
							dontAskAgainChecked={dontAskBlockAgain}
							onDontAskAgainChange={setDontAskBlockAgain}
						/>
						<ConfirmDialog
							isOpen={isUnblockConfirmOpen}
							title={t("profile_details.unblock")}
							message={t("profile_details.unblock_confirm")}
							confirmLabel={t("profile_details.unblock")}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={confirmUnblockProfile}
							onCancel={closeUnblockConfirm}
							isProcessing={isUnblockingProfile}
							confirmTone="default"
							dontAskAgainLabel={t("profile_details.dont_ask_again")}
							dontAskAgainChecked={dontAskUnblockAgain}
							onDontAskAgainChange={setDontAskUnblockAgain}
						/>
						<ConfirmDialog
							isOpen={isDeleteConversationConfirmOpen}
							title={t("chat.delete_conversation")}
							message={t("chat.delete_conversation_confirm")}
							confirmLabel={t("chat.delete_conversation")}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={confirmDeleteConversation}
							onCancel={closeDeleteConversationConfirm}
							isProcessing={isDeletingConversation}
							confirmTone="danger"
							dontAskAgainLabel={t("profile_details.dont_ask_again")}
							dontAskAgainChecked={dontAskDeleteConversationAgain}
							onDontAskAgainChange={setDontAskDeleteConversationAgain}
						/>
						<PromptDialog
							isOpen={banWordPrompt !== null}
							title={t("chat.actions.ban_word", { defaultValue: "Add forbidden keyword" })}
							message={t("chat.actions.ban_word_prompt", {
								defaultValue: "Trim this message down to the specific keyword you want to ban:",
							})}
							defaultValue={banWordPrompt?.text ?? ""}
							confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={(wordToBan) => {
								const currentList = getForbiddenWords();
								const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
								void setForbiddenWords(newList);
								toast.success(
									t("chat.actions.ban_word_added", {
										defaultValue: "Added \"{{word}}\" to forbidden keywords!",
										word: wordToBan,
									}),
								);
								setBanWordPrompt(null);
							}}
							onCancel={() => setBanWordPrompt(null)}
						/>
						<PromptDialog
							isOpen={banNamePrompt !== null}
							title={t("chat.actions.ban_word", { defaultValue: "Add forbidden keyword" })}
							message={t("chat.actions.ban_name_prompt", {
								defaultValue: "Trim this down to the exact name or phrase you want to ban:",
							})}
							defaultValue={banNamePrompt?.text ?? ""}
							confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={(wordToBan) => {
								const currentList = getForbiddenWords();
								const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
								void setForbiddenWords(newList);
								toast.success(
									t("chat.actions.ban_word_added", {
										defaultValue: "Added \"{{word}}\" to forbidden keywords!",
										word: wordToBan,
									}),
								);
								setBanNamePrompt(null);
							}}
							onCancel={() => setBanNamePrompt(null)}
						/>
					</>
				);
			})()}

			{selectedConversation ? (
				isLoadingThread &&
				threadConversationId !== selectedConversation.data.conversationId ? (
				<div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat.loading_messages")}
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
						{t("chat.retry")}
					</button>
				</div>
			) : (
				<ChatThreadMessages
						isDesktop={isDesktop}
						selectedConversation={selectedConversation}
						userId={userId}
						nowTimestamp={nowTimestamp}
						messagePageKey={messagePageKey}
						isLoadingOlderMessages={isLoadingOlderMessages}
						loadThread={loadThread}
						threadScrollContainerRef={threadScrollContainerRef}
						handleThreadScroll={handleThreadScroll}
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
						handleReply={handleReply}
						handleStopAlbumShare={handleStopAlbumShare}
						threadBottomRef={threadBottomRef}
						isPartnerTyping={isPartnerTyping}
						isArchived={isArchived}
						ownProfilePhotoUrl={ownProfilePhotoUrl}
				/>
				)
			) : (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-muted)]">
						<MessageCircleOff className="h-6 w-6 opacity-50" />
					</div>
					<div>
						<p className="text-sm font-medium text-[var(--text-muted)]">{t("chat.new_conversation.no_messages_yet", { defaultValue: "No messages yet" })}</p>
						<p className="mt-1 text-xs text-[var(--text-muted)] opacity-70">{t("chat.new_conversation.send_first_message_hint", { defaultValue: "Send a message below to start the conversation." })}</p>
					</div>
				</div>
			)}

					{isArchived ? (
						<div
					className={`${!isDesktop ? "shrink-0 px-[var(--app-px)] py-3" : "mt-3 pt-3 -mx-3 sm:-mx-4 px-3 sm:px-4"} bg-[var(--surface)]`}
							style={
								!isDesktop
									? { paddingBottom: mobileKeyboardInset > 0 ? "12px" : "max(12px, env(safe-area-inset-bottom))" }
									: undefined
							}
						>
							<div className="flex items-start gap-3 rounded-2xl bg-[var(--surface-2)] p-3">
								<div className="shrink-0 rounded-xl bg-[var(--surface)] p-2.5">
									<Archive className="h-4 w-4 text-[var(--text-muted)]" />
								</div>
								<div className="grid gap-0.5 pt-0.5">
									<p className="text-sm font-semibold text-[var(--text)]">
										{t("chat.archived.title", { defaultValue: "Conversation archived" })}
									</p>
									<p className="text-xs text-[var(--text-muted)]">
										{archivedReason === "not_found"
											? t("chat.archived.not_found", {
													defaultValue: "This conversation is no longer available. You can still read the history.",
												})
											: t("chat.archived.blocked_or_deleted", {
													defaultValue: "This conversation is archived. You can still read the history, but can no longer send messages or view this person's profile.",
												})}
									</p>
								</div>
							</div>
						</div>
					) : (
					<form
						onSubmit={onFormSubmit}
						className={`relative ${!isDesktop ? "shrink-0 px-[var(--app-px)] py-3" : "mt-3 pt-3 -mx-3 sm:-mx-4 px-3 sm:px-4"} border-t border-[var(--border)] bg-[var(--surface)]`}
						style={
							!isDesktop
								? { paddingBottom: mobileKeyboardInset > 0 ? "12px" : "max(12px, env(safe-area-inset-bottom))" }
								: undefined
						}
					>
						{(isUploadingAttachment || uploadProgress > 0) && (
							<div
								className="h-0.5 bg-[var(--surface-2)] mb-3"
								style={{ marginTop: "-12px", marginLeft: "calc(-1 * var(--app-px))", marginRight: "calc(-1 * var(--app-px))" }}
							>
								<div
									className="h-0.5 bg-[var(--accent)] transition-all duration-300"
									style={{ width: `${Math.min(100, uploadProgress)}%` }}
								/>
							</div>
						)}
						{/* --- QUICK PHRASE PILLS --- */}
						{!slashMenuMatch && filteredPhrases.length > 0 && (
							<div className="mb-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								{filteredPhrases.map((phrase, idx) => {
									const isExact = phrase.toLowerCase() === draft.trim().toLowerCase();
									return (
										<button
											key={idx}
											type="button"
											onClick={() => handleUsePhrase(phrase)}
											className={`max-w-[200px] shrink-0 rounded-2xl rounded-br-[3px] border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
												isExact
													? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
													: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
											}`}
										>
											<span className="block truncate">{phrase}</span>
										</button>
									);
								})}
							</div>
						)}
						{/* -------------------------- */}

                        {selectedConversation && replyTargetMessage ? (() => {
							const rtm = replyTargetMessage;
							const rtmBody = rtm.body as Record<string, unknown> | null | undefined;
							const isAudioReply = rtm.type === "Audio" || rtm.chat1Type?.toLowerCase() === "audio";
							const isImageReply = rtm.type === "Image" || rtm.type === "ExpiringImage" || rtm.chat1Type?.toLowerCase() === "image" || rtm.chat1Type?.toLowerCase() === "expiring_image";
							const isVideoReply = rtm.type === "Video" || rtm.type === "PrivateVideo" || rtm.type === "NonExpiringVideo"
								|| rtm.chat1Type?.toLowerCase() === "video" || rtm.chat1Type?.toLowerCase() === "privatevideo" || rtm.chat1Type?.toLowerCase() === "nonexpiringvideo";
							// Prefer the locally-cached copy over the live body URL — by the
							// time a video's signed URL is used here it may already have
							// expired (same reasoning as the in-thread reply-quote bar).
							const videoCaptureTarget = isVideoReply ? getMediaCaptureTarget(rtm) : null;
							const cachedVideoUri = videoCaptureTarget?.kind === "video"
								? getCachedMediaUri(videoCaptureTarget.mediaKey)
								: null;
							const videoUrl = isVideoReply ? (cachedVideoUri ?? getMessageVideoUrl(rtm)) : null;
							const thumbUrl = (() => {
								if (isImageReply) {
									const fromUtil = getMessageImageUrl(rtm);
									if (fromUtil) return fromUtil;
									const hash = typeof rtmBody?.imageHash === "string" ? rtmBody.imageHash : null;
									if (hash) return getThumbImageUrl(hash, "320x320");
									const imgObj = rtmBody?.image as Record<string, unknown> | null | undefined;
									const urlCandidate = imgObj?.url ?? imgObj?.imageUrl ?? rtmBody?.url ?? rtmBody?.imageUrl;
									return typeof urlCandidate === "string" ? urlCandidate : null;
								}
								if (rtm.type === "AlbumContentReaction" || rtm.type === "AlbumContentReply") {
									return typeof rtmBody?.previewUrl === "string" ? rtmBody.previewUrl : null;
								}
								const albumCover = getMessageAlbumCoverUrl(rtm);
								if (albumCover) return albumCover;
								return null;
							})();
							const audioDuration = (() => {
								if (!isAudioReply) return null;
								const rawMs = typeof rtmBody?.length === "number" ? rtmBody.length : null;
								if (rawMs === null) return null;
								const totalSec = Math.floor(rawMs / 1000);
								return `${Math.floor(totalSec / 60)}:${(totalSec % 60).toString().padStart(2, "0")}`;
							})();
							return (
								<div className="relative mb-2 overflow-hidden rounded-xl bg-[var(--surface-2)]">
									<div className="absolute left-0 top-0 h-full w-[3px] bg-[var(--accent)]" />
									<div className="flex items-center gap-2 py-[13px] pl-[13px] pr-2">
										<div className="min-w-0 flex-1">
											<p className="mb-0.5 truncate text-[11px] font-semibold text-[var(--accent)]">
												{userId != null && Number(rtm.senderId) === Number(userId)
													? "Replying to myself"
													: `Replying to "${selectedConversation?.data.name?.trim() || ""}"`
												}
											</p>
											<p className="truncate text-xs text-[var(--text-muted)]">
												{isAudioReply ? t("chat.thread.audio_label") : getMessagePreviewLabel(rtm, t)}
											</p>
										</div>
										{thumbUrl ? (
											<img src={thumbUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
										) : videoUrl ? (
											<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-black">
												<video
													muted
													preload="metadata"
													src={videoUrl}
													onLoadedMetadata={(e) => { (e.currentTarget as HTMLVideoElement).currentTime = 0.001; }}
													className="h-full w-full object-cover"
												/>
												<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
													<Play className="h-3.5 w-3.5 fill-white text-white drop-shadow" />
												</div>
											</div>
										) : isAudioReply ? (
											<div className="flex w-10 shrink-0 items-center justify-end py-0.5 text-[var(--text-muted)]">
												<div className="flex flex-col items-center gap-1">
													<Mic className="h-4 w-4" />
													<span className="text-[10px]">{audioDuration ?? "0:00"}</span>
												</div>
											</div>
										) : null}
										<button
											type="button"
											onClick={clearReplyTarget}
											className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-[var(--text)]"
											aria-label={t("chat.actions.cancel")}
										>
											<X className="h-3.5 w-3.5" />
										</button>
									</div>
								</div>
							);
						})() : null}

						{props.pendingAudioBlob ? (
							<div className="mb-2 rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] pl-1.5 pr-1 py-1.5 flex items-center gap-1">
								<div className="flex-1 min-w-0">
									<AudioPreviewPlayer blob={props.pendingAudioBlob} durationMs={props.pendingAudioDuration} recordedBars={recordedWaveform} recordedFraction={Math.min(1, props.pendingAudioDuration / 60_000)} />
								</div>
								<button
									type="button"
									onClick={() => { setRecordedWaveform([]); props.cancelAudio(); }}
									className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:text-red-500"
									aria-label={t("chat.actions.cancel")}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									onClick={() => { setRecordedWaveform([]); void props.confirmAudio(); }}
									disabled={props.isSendingAudio}
									className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--accent)] transition hover:opacity-80 disabled:opacity-40"
									aria-label={t("chat.attachments.send")}
								>
									{props.isSendingAudio
										? <Loader2 className="h-3.5 w-3.5 animate-spin" />
										: <SendHorizontal className="h-3.5 w-3.5" />}
								</button>
							</div>
						) : null}
						<div className="relative">
						{slashMatches.length > 0 && (
							<div
								onMouseDown={(event) => event.preventDefault()}
								className="absolute bottom-full left-0 right-0 max-h-64 overflow-hidden rounded-t-2xl border-x border-t border-[var(--accent)] bg-[var(--surface)] shadow-xl z-40">
								<div className="max-h-64 overflow-y-auto p-1.5">
								<div className="flex flex-col gap-1">
									{slashMatches.map((command, index) => {
										const isSelected = index === slashSelectedIndex;
										const isDisabled = command.requiresConversation && !selectedConversation;
										return (
											<button
												key={command.name}
												type="button"
												disabled={isDisabled}
												onClick={() => selectSlashCommand(command)}
												onMouseEnter={() => setSlashSelectedIndex(index)}
												title={isDisabled ? t("chat.slash_commands.errors.no_conversation", { defaultValue: "Open a chat first" }) : undefined}
												className={`w-full rounded-xl text-left px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-40 ${
													isSelected
														? "bg-[var(--accent)] text-[var(--accent-contrast)]"
														: "bg-[var(--surface-2)] hover:bg-[color-mix(in_srgb,var(--surface-2)_80%,var(--text)_8%)]"
												}`}
											>
												<div className="flex items-center gap-1.5 text-sm font-semibold">
													/{command.name}
													{command.argHint && (
														<span
															className={`inline-flex items-center leading-none rounded-md px-1.5 py-1 text-[10px] font-normal ${
																isSelected
																	? "bg-black/15 text-[var(--accent-contrast)]"
																	: "bg-[var(--surface)] text-[var(--text-muted)]"
															}`}
														>
															{command.argHint}
														</span>
													)}
													{command.aliases && command.aliases.length > 0 && (
														<span className="flex items-center gap-1">
															{command.aliases.map((alias) => (
																<span
																	key={alias}
																	className={`inline-flex items-center leading-none rounded-full px-1.5 py-1 text-[10px] font-medium ${
																		isSelected
																			? "bg-black/15 text-[var(--accent-contrast)]"
																			: "bg-[var(--surface)] text-[var(--text-muted)]"
																	}`}
																>
																	/{alias}
																</span>
															))}
														</span>
													)}
												</div>
												<div
													className={`mt-0.5 text-xs ${isSelected ? "opacity-90" : "text-[var(--text-muted)]"}`}
												>
													{t(command.descriptionKey, { defaultValue: command.defaultDescription })}
												</div>
											</button>
										);
									})}
								</div>
								</div>
								<div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-black/30 to-transparent" />
								<div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[var(--border)]" />
							</div>
						)}
						{!props.pendingAudioBlob && <div className={`flex ${isRecording ? "items-center" : "items-end"} gap-2 ${slashMatches.length > 0 ? "rounded-b-xl border-t-0" : "rounded-xl"} border py-1.5 mb-2 transition-colors ${isRecording ? `pl-1 pr-1 ${recordingMs >= 50_000 ? "border-red-500" : "border-[var(--accent)]"} bg-[var(--surface-2)]` : "pl-3 pr-1 border-[var(--border)] bg-[var(--surface-2)] focus-within:border-[var(--accent)]"}`}>
							{isRecording ? (
								<>
									<button
										type="button"
										onClick={cancelRecording}
										className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg"
										style={{ color: `color-mix(in srgb, var(--accent) ${Math.round((1 - dragProgress) * 100)}%, #ef4444)` }}
										aria-label={t("chat.cancel_recording", { defaultValue: "Cancel" })}
									>
										<span className="relative h-4 w-4">
											<span className="absolute inset-0" style={{ opacity: Math.max(0, 1 - dragProgress * 2) }}>
											<Mic className="h-4 w-4 animate-pulse" />
										</span>
											<Trash2 className={`absolute inset-0 h-4 w-4 ${trashBounce ? "animate-trash-bounce" : ""}`} style={{ opacity: Math.max(0, (dragProgress - 0.3) / 0.7) }} />
										</span>
									</button>
									<span className={`text-sm font-semibold tabular-nums shrink-0 ${recordingMs >= 50_000 ? "text-red-500 animate-pulse" : "text-[var(--accent)]"}`}>
										{`${Math.floor(Math.floor(recordingMs / 1000) / 60)}:${(Math.floor(recordingMs / 1000) % 60).toString().padStart(2, "0")}`}
									</span>
									<div className="flex-1" />
									{!isDesktop && showRecordCircle && (
									<span
										className="text-xs text-[var(--text-muted)] shrink-0 select-none"
										style={{
											transform: `translateX(${recordDragX * 0.4}px)`,
											opacity: 1 - dragProgress * 1.5,
										}}
									>
										{t("chat.cancel_recording", { defaultValue: "Slide left to cancel" })}
									</span>
								)}
								</>
							) : (
								<textarea
									ref={textareaRef}
									value={draft}
									autoComplete="off"
									onChange={(event) => setDraft(event.target.value)}
									onFocus={() => setIsComposerFocused(true)}
									onBlur={() => setIsComposerFocused(false)}
									onKeyDown={(event) => {
										if (slashMatches.length > 0) {
											if (event.key === "ArrowDown") {
												event.preventDefault();
												setSlashSelectedIndex((prev) => (prev + 1) % slashMatches.length);
												return;
											}
											if (event.key === "ArrowUp") {
												event.preventDefault();
												setSlashSelectedIndex((prev) => (prev - 1 + slashMatches.length) % slashMatches.length);
												return;
											}
											if (event.key === "Enter" || event.key === "Tab") {
												event.preventDefault();
												selectSlashCommand(slashMatches[slashSelectedIndex]);
												return;
											}
										}
										if (isDesktop && event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											event.currentTarget.form?.requestSubmit();
										}
									}}
									rows={1}
									maxLength={1000}
									placeholder={
										selectedConversation
											? t("chat.write_message")
											: t("chat.new_conversation.write_first_message")
									}
									className="flex-1 bg-transparent py-1 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none resize-none disabled:opacity-60"
									style={{ fieldSizing: "content", maxHeight: "115px" } as React.CSSProperties}
								/>
							)}
							{isRecording && (isDesktop || !showRecordCircle) ? (
								<button
									type="button"
									onClick={() => stopRecording()}
									className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:opacity-80 transition"
									aria-label={t("chat.stop_recording", { defaultValue: "Stop recording" })}
								>
									<Square className="h-4 w-4 fill-current" />
								</button>
							) : draft.trim().length > 0 || isSending ? (
								<button
									type="submit"
									disabled={isSending || !!pendingLocationShare || draft.trim().length === 0}
									className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] transition hover:opacity-80 disabled:opacity-30"
								>
									{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
								</button>
							) : (
								<button
									type="button"
									onClick={isDesktop ? () => void startRecording() : undefined}
									onPointerDown={!isDesktop ? (e) => {
										e.preventDefault();
										e.currentTarget.setPointerCapture(e.pointerId);
										swipeStartXRef.current = e.clientX;
										isCapturingRef.current = true;
										hasVibratedRef.current = false;
										setRecordDragX(0);
										holdTimerRef.current = setTimeout(() => setShowRecordCircle(true), 150);
										void startRecording();
									} : undefined}
									onPointerMove={!isDesktop ? (e) => {
										if (!isCapturingRef.current) return;
										const dx = e.clientX - swipeStartXRef.current;
										setRecordDragX(Math.min(0, dx));
										if (!hasVibratedRef.current && dx < -CANCEL_THRESHOLD) {
											hasVibratedRef.current = true;
											isCapturingRef.current = false;
											e.currentTarget.releasePointerCapture(e.pointerId);
											if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
											(window as unknown as { FreeGrindBridge?: { vibrate?: (ms: number) => void } }).FreeGrindBridge?.vibrate?.(80) ?? navigator.vibrate?.(80);
											setTrashBounce(true);
											setTimeout(() => {
												setTrashBounce(false);
												setRecordDragX(0);
												setShowRecordCircle(false);
												cancelRecording();
											}, 280);
										}
									} : undefined}
									onPointerUp={!isDesktop ? () => { isCapturingRef.current = false; setRecordDragX(0); if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } setShowRecordCircle(false); stopRecording(true); } : undefined}
									onPointerCancel={!isDesktop ? () => { isCapturingRef.current = false; setRecordDragX(0); if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; } setShowRecordCircle(false); cancelRecording(); } : undefined}
									className={`relative shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg transition select-none touch-none ${isRecording ? "text-red-500" : "text-[var(--accent)] hover:opacity-80"}`}
									style={showRecordCircle ? {
										transform: `translateX(${recordDragX}px)`,
										transition: recordDragX === 0 ? "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)" : "none",
									} : undefined}
									aria-label={t("chat.record_audio", { defaultValue: "Record audio" })}
								>
									{showRecordCircle && (
										<span
											className="pointer-events-none absolute rounded-full"
											style={{
												inset: "-20px",
												background: `color-mix(in srgb, var(--accent) ${Math.round((1 - dragProgress) * 100)}%, #ef4444)`,
												opacity: 0.2,
												boxShadow: `0 0 0 1.5px color-mix(in srgb, var(--accent) ${Math.round((1 - dragProgress) * 100)}%, #ef4444)`,
											}}
										/>
									)}
									<Mic className="relative h-4 w-4" />
								</button>
							)}
						</div>}
						</div>

                        <div className="mb-2 mx-5 flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => {
									setIsGiphyPickerOpen((prev) => !prev);
									if (isDrawerOpen) toggleDrawer();
								}}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
								aria-label={t("chat.giphy.button_label")}
								title={t("chat.giphy.button_label")}
							>
								<Sticker className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={() => {
									attachmentInputRef.current?.click();
									if (isDrawerOpen) toggleDrawer();
									if (pendingLocationShare) handleLocationShareRequest();
								}}
								disabled={isUploadingAttachment}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
								aria-label={t("chat.attach_media")}
								title={t("chat.attach_media")}
							>
								<ImagePlus className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={() => {
									toggleDrawer();
									if (pendingLocationShare) handleLocationShareRequest();
								}}
								disabled={!selectedConversation && !targetProfileId}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40 disabled:cursor-not-allowed"
								aria-label={t("chat.drawer_label")}
								title={t("chat.drawer_label")}
							>
								<SquareStack className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={() => {
									handleLocationShareRequest();
									if (isDrawerOpen) toggleDrawer();
								}}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
								aria-label={t("chat.share_location_label", { defaultValue: "Share Location" })}
								title={t("chat.share_location_label", { defaultValue: "Share Location" })}
							>
								<MapPin className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={() => setIsSavedPhrasesOpen((prev) => !prev)}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
								aria-label={t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
								title={t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
							>
								<BookMarked className="h-5 w-5" />
							</button>

							<input
								type="file"
								ref={attachmentInputRef}
								onChange={onAttachmentInput}
								accept="image/*,video/*"
								className="hidden"
							/>
						</div>


					</form>
					)}

					{pendingAttachmentFile ? (
						<BottomDrawer
							title={
								pendingAttachmentFile.type.startsWith("video/")
									? t("chat.attachments.upload_video", { defaultValue: "Upload Video" })
									: t("chat.attachments.upload_picture", { defaultValue: "Upload Picture" })
							}
							onClose={cancelPendingAttachment}
							onConfirm={() => void handleConfirmAttachment()}
							confirmLabel={
								attachmentMaxViews !== 2147483647
									? t("chat.attachments.send_expiring")
									: t("chat.attachments.send")
							}
							isProcessing={isUploadingAttachment}
							isDesktop={isDesktop}
							footerLeft={(() => {
								const isVideo = pendingAttachmentFile.type.startsWith("video/");
								return (
									<div className="relative inline-flex h-11 items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] min-w-[120px]">
										<Hourglass className="pointer-events-none absolute left-3 h-4 w-4 shrink-0" />
										<select
											value={attachmentMaxViews}
											onChange={(e) => setAttachmentMaxViews(Number(e.target.value))}
											className="h-full w-full appearance-none rounded-xl bg-transparent pl-9 pr-3 text-sm font-semibold text-[var(--text)] focus:outline-none cursor-pointer text-center"
										>
											{isVideo ? (
												<>
													<option value={2147483647}>{t("chat_drawer.expiry.unlimited", { defaultValue: "Unlimited" })}</option>
													<option value={1}>{t("chat_drawer.expiry.once", { defaultValue: "Once" })}</option>
													<option value={2}>{t("chat_drawer.expiry.repeat", { defaultValue: "Repeat" })}</option>
												</>
											) : (
												<>
													<option value={2147483647}>{t("chat_drawer.expiry.unlimited", { defaultValue: "Unlimited" })}</option>
													<option value={1}>{t("chat_drawer.expiry.ten_seconds", { defaultValue: "10s" })}</option>
												</>
											)}
										</select>
									</div>
								);
							})()}
						>
							<div className="flex min-h-0 flex-1 flex-col">
							{/* Scrollable preview area */}
							<div className="min-h-0 flex-1 overflow-y-auto">
							{attachmentPreviewUrl && (
								pendingAttachmentFile.type.startsWith("video/") ? (
									<div className="px-3 pb-3">
										<div className="border border-[var(--border)]" style={{ borderRadius: "0.75rem", clipPath: "inset(0 round 0.75rem)" }}>
											<video src={attachmentPreviewUrl} controls className="w-full object-contain" style={{ maxHeight: "40dvh" }} />
										</div>
									</div>
								) : (
									<div className="px-3 pb-3">
										<div className="flex justify-center">
											<style>{`
												@keyframes attach-logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
												.attach-logo-shine { animation: attach-logo-shine 2.8s ease-in-out infinite; }
												.attach-crop .ReactCrop__crop-mask { display: none !important; } .attach-crop .ReactCrop__crop-selection { background-image: none !important; animation: none !important; outline: none !important; border: 3px solid rgba(255,255,255,0.6) !important; border-radius: 11px !important; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5) !important; }
												.attach-crop .ord-n, .attach-crop .ord-s, .attach-crop .ord-e, .attach-crop .ord-w { display: none !important; }
												.attach-crop .ReactCrop__drag-handle { background: transparent !important; border: none !important; width: 15px !important; height: 15px !important; }
												.attach-crop .ord-nw { transform: translate(4px, 4px) !important; border-top: 2px solid white !important; border-left: 2px solid white !important; border-top-left-radius: 4px !important; }
												.attach-crop .ord-ne { transform: translate(-4px, 4px) !important; border-top: 2px solid white !important; border-right: 2px solid white !important; border-top-right-radius: 4px !important; }
												.attach-crop .ord-sw { transform: translate(4px, -4px) !important; border-bottom: 2px solid white !important; border-left: 2px solid white !important; border-bottom-left-radius: 4px !important; }
												.attach-crop .ord-se { transform: translate(-4px, -4px) !important; border-bottom: 2px solid white !important; border-right: 2px solid white !important; border-bottom-right-radius: 4px !important; }
											`}</style>
											<div className="relative rounded-xl border border-[var(--border)] overflow-hidden">
											<ReactCrop
												crop={attachmentCrop}
												onChange={(c) => { setIsDraggingAttachmentCrop(true); setAttachmentCrop(c); }}
												onComplete={(c) => { setIsDraggingAttachmentCrop(false); setAttachmentCompletedCrop(c); }}
												ruleOfThirds={isDraggingAttachmentCrop}
												minWidth={150}
												minHeight={150}
												className="attach-crop ReactCrop--no-animate"
												style={{ maxHeight: "45dvh", display: "block" }}
											>
												<img ref={attachmentImgRef} src={attachmentPreviewUrl} alt="Preview" className="block" style={{ maxHeight: "45dvh" }} />
											</ReactCrop>
											{attachmentTakenOnGrindr && attachmentCrop && (
												<div
													className="absolute inline-flex items-center gap-1.5 pointer-events-none"
													style={{
														left: `calc(${attachmentCrop.unit === "%" ? attachmentCrop.x + "%" : attachmentCrop.x + "px"} + 10px)`,
														top: `calc(${attachmentCrop.unit === "%" ? (attachmentCrop.y + attachmentCrop.height) + "%" : (attachmentCrop.y + attachmentCrop.height) + "px"} - 10px)`,
														transform: "translateY(-100%)",
													}}
												>
													<img src={freegrindLogo} alt="" className="h-5 w-5 rounded-full attach-logo-shine" />
													<span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
														<span>{t("chat.time.just_now", { defaultValue: "just now" })}</span>
													</span>
												</div>
											)}
											</div>
										</div>
										<div className="mt-3 flex items-center justify-center gap-8">
											<button type="button" onClick={() => void applyAttachmentTransform("flipH")} className="text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Flip horizontal">
												<SquareCenterlineDashedHorizontal className="h-6 w-6" />
											</button>
											<button type="button" onClick={() => void applyAttachmentTransform("rotateCw")} className="text-[var(--text-muted)] transition hover:text-[var(--text)]" aria-label="Rotate clockwise">
												<RotateCw className="h-6 w-6" />
											</button>
										</div>
									</div>
								)
							)}
							</div>
							{/* Sticky toggle row — always pinned to bottom of sheet */}
							<div className="shrink-0 px-3 pb-3 pt-2">
								<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
									{pendingAttachmentFile?.type.startsWith("video/") ? (
										<ToggleRow
											checked={attachmentLooping}
											onChange={setAttachmentLooping}
											label={t("chat.attachments.looping")}
											description={t("chat.attachments.looping_description")}
										/>
									) : (
										<ToggleRow
											checked={attachmentTakenOnGrindr}
											onChange={setAttachmentTakenOnGrindr}
											label={t("chat.attachments.taken_on_grindr")}
											description={t("chat.attachments.taken_on_grindr_description")}
										/>
									)}
								</div>
							</div>
						</div>
						</BottomDrawer>
					) : null}


					{isDrawerOpen ? (
						<ChatDrawerPanel
							media={drawerMedia}
							isLoading={isLoadingDrawer}
							error={drawerError}
							isSending={isSendingDrawerMedia}
							isAdding={isAddingDrawerMedia}
							deletingMediaId={deletingDrawerMediaId}
							onBack={toggleDrawer}
							onLoadMedia={onLoadDrawerMedia}
							onSendMedia={onSendDrawerMedia}
							onAddMedia={onAddDrawerMedia}
							onDeleteMedia={onDeleteDrawerMedia}
							onShareAlbum={onShareAlbumFromDrawer}
							onStopAlbumShare={onStopAlbumShareFromDrawer}
							albums={shareableAlbums}
							isLoadingAlbums={isLoadingAlbums}
							albumCoverMap={albumCoverMap}
							sharedAlbumIds={sharedAlbumIds}
							isSharingAlbum={isSharingAlbum}
							isDesktop={isDesktop}
							noConversation={!selectedConversation && !targetProfileId}
							ownProfilePhotoUrl={ownProfilePhotoUrl}
						/>
					) : null}

                    {pendingLocationShare ? (
						<BottomDrawer
							title={t("chat.share_location_confirm", { defaultValue: "Share this location?" })}
							onClose={() => setPendingLocationShare(null)}
							onConfirm={() => {
								void onSendLocation(pendingLocationShare.lat, pendingLocationShare.lon);
								setPendingLocationShare(null);
							}}
							confirmLabel={t("chat.send")}
							isDesktop={isDesktop}
						>
							<div className="px-3 pb-3">
								<div className="overflow-hidden rounded-xl border border-[var(--border)]" style={{ height: "40dvh" }}>
									<MapLocationPicker
										selectedLocation={pendingLocationShare}
										onPick={(lat, lon) => setPendingLocationShare({ lat, lon })}
										onError={(msg) => toast.error(msg)}
										className="h-full w-full"
										defaultZoom={18}
									/>
								</div>
							</div>
						</BottomDrawer>
                    ) : null}

					{isGiphyPickerOpen ? (
						<GiphyPickerSheet
							onClose={() => setIsGiphyPickerOpen(false)}
							onSelect={(gif) => {
								setIsGiphyPickerOpen(false);
								void onSendGiphy(gif);
							}}
							isDesktop={isDesktop}
							isSending={isSending}
						/>
					) : null}

					{isSavedPhrasesOpen ? (
						<BottomSheet
							onClose={() => {
								setPhrasesExpanded(false);
								setIsSavedPhrasesOpen(false);
							}}
							onExpand={() => setPhrasesExpanded(true)}
							isDesktop={isDesktop}
							bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
						>
							{/* Header */}
							<div className="flex items-center justify-between px-4 pb-3">
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold text-[var(--text)]">
											{t("chat.saved_phrases_label", { defaultValue: "Saved Phrases" })}
										</p>
										{savedPhrases.length > 0 && (
											<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
												{savedPhrases.length}
											</span>
										)}
									</div>
									<div className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => { setIsSavedPhrasesOpen(false); navigate("/settings/saved-phrases"); }}
											className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
											aria-label={t("chat.saved_phrases_manage", { defaultValue: "Manage" })}
											title={t("chat.saved_phrases_manage", { defaultValue: "Manage" })}
										>
											<Settings2 className="h-4 w-4" />
										</button>
										<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
											<X className="h-4 w-4" />
										</SheetClose>
									</div>
								</div>

								{/* Add input */}
								<div className="px-3 pb-3">
									<div className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-1.5">
										<input
											type="text"
											value={newPhraseInput}
											onChange={(e) => setNewPhraseInput(e.target.value)}
											onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddPhrase(); } }}
											placeholder={t("settings_saved_phrases.new_placeholder", { defaultValue: "Add a new phrase..." })}
											className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
										/>
										<button
											type="button"
											onClick={handleAddPhrase}
											disabled={!newPhraseInput.trim()}
											className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-40"
										>
											<Plus className="h-3.5 w-3.5" />
											{t("settings_saved_phrases.add", { defaultValue: "Add" })}
										</button>
									</div>
								</div>

								<div className="border-t border-[var(--border)]" />

								{/* Phrases list */}
								<div data-lenis-prevent className="overflow-y-auto overflow-x-hidden" style={{ maxHeight: phrasesExpanded ? "72dvh" : "40dvh", transition: "max-height 0.25s ease" }}>
									{savedPhrases.length === 0 ? (
										<div className="flex flex-col items-center justify-center gap-2.5 text-center text-[var(--text-muted)]" style={{ minHeight: "40dvh" }}>
											<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
												<BookMarked className="h-5 w-5 opacity-60" />
											</div>
											<p className="text-sm font-medium">
												{t("settings_saved_phrases.empty", { defaultValue: "No saved phrases yet." })}
											</p>
											<p className="text-xs opacity-60">
												{t("settings_saved_phrases.empty_hint", { defaultValue: "Type above to add your first phrase." })}
											</p>
										</div>
									) : (
										<div className="divide-y divide-[var(--border)]">
											{savedPhrases.map((phrase, originalIndex) => (
												<div key={originalIndex} className="group flex items-start gap-3 px-4 py-3">
													<div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)]">
														<MessageSquareQuote className="h-3.5 w-3.5" />
													</div>
													<SheetClose
														onClick={() => handleUsePhrase(phrase)}
														className="min-w-0 flex-1 break-words text-left text-sm leading-relaxed text-[var(--text)] transition hover:text-[var(--accent)]"
													>
														<span className="block break-words">{phrase}</span>
													</SheetClose>
													<button
														type="button"
														onClick={() => handleDeletePhrase(originalIndex)}
														className="mt-0.5 shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
														aria-label={t("settings_saved_phrases.delete", { defaultValue: "Delete phrase" })}
													>
														<Trash2 className="h-3.5 w-3.5" />
													</button>
												</div>
											))}
										</div>
									)}
								</div>
						</BottomSheet>
					) : null}

					{!isDesktop && selectedActionMessage && !isAlbumSheetOpen ? (
						<BottomSheet
							isDesktop={false}
							onClose={() => setOpenMessageActionId(null)}
							bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
						>
							<div className="flex items-center justify-between px-4 pb-3">
								<p className="text-sm font-semibold text-[var(--text)]">
									{t("chat.actions.title")}
								</p>
								<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
									<X className="h-4 w-4" />
								</SheetClose>
							</div>
							<div className="divide-y divide-[var(--border)] pb-1">
								{(() => {
									const message = selectedActionMessage;
									const mine = selectedActionMessageMine;
									const isMutating = isMutatingMessageId === message.messageId;
									const loc = getMessageLocation(message);
									const body = message.body as any;
									const hasText = body && typeof body.text === "string" && body.text.trim().length > 0;
									const imageUrl = getMessageImageUrl(message);
									const videoUrl = getMessageVideoUrl(message);
									const audioUrl = getMessageAudioUrl(message);
									const mediaUrl = imageUrl || videoUrl;
									const albumId = getMessageAlbumId(message);
									const isViewable = (message.body as any)?.isViewable;

									type ActionRow = {
										key: string;
										icon: React.ReactNode;
										label: string;
										onClick: () => void;
										danger?: boolean;
										disabled?: boolean;
									};
									const rows: ActionRow[] = [];

									rows.push({
										key: "reply",
										icon: <Reply className="h-3.5 w-3.5" />,
										label: t("chat.actions.reply", { defaultValue: "Reply" }),
										onClick: () => void handleReply(message),
										disabled: isMutating,
									});

									if (hasText || loc) {
										rows.push({
											key: "copy",
											icon: <Copy className="h-3.5 w-3.5" />,
											label: t("chat.actions.copy", { defaultValue: "Copy" }),
											onClick: () => void handleCopy(message),
										});
									}

									if (hasText) {
										rows.push({
											key: "saved-phrase",
											icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
											label: t("chat.actions.add_to_saved_phrases", { defaultValue: "Add to saved phrases" }),
											onClick: () => void handleAddMessageToSavedPhrases(body.text),
										});
									}

									if (mediaUrl || audioUrl) {
										rows.push({
											key: "download-media",
											icon: <Download className="h-3.5 w-3.5" />,
											label: t("chat.actions.download_media", { defaultValue: "Download Media" }),
											onClick: () => {
												if (mediaUrl) {
													void (async () => {
														try {
															const saved = await saveMediaToDevice(
																mediaUrl,
																videoUrl ? "video" : "image",
																selectedConversation?.data.conversationId ?? null,
															);
															if (saved) {
																toast.success(
																	t(isIos() ? "profile_details.save_to_gallery_success" : "profile_details.save_to_downloads_success"),
																);
															} else {
																toast.error(t("profile_details.save_to_gallery_unsupported"));
															}
														} catch (e) {
															appLog.error("Failed to save media to gallery", e);
															toast.error(
																t(isIos() ? "profile_details.save_to_gallery_error" : "profile_details.save_to_downloads_error"),
															);
														}
													})();
													return;
												}
												if (audioUrl) {
													const a = document.createElement("a");
													a.href = audioUrl;
													a.download = `media-${Date.now()}`;
													a.target = "_blank";
													document.body.appendChild(a);
													a.click();
													document.body.removeChild(a);
												}
											},
										});
									}

									if (hasText && !mine) {
										rows.push({
											key: "ban-word",
											icon: <Ban className="h-3.5 w-3.5" />,
											label: t("chat.actions.ban_word", { defaultValue: "Add forbidden keyword" }),
											onClick: () => {
												setBanWordPrompt({ text: body?.text || "" });
											},
										});
									}

									if (mine && !message.unsent) {
										rows.push({
											key: "unsend",
											icon: <Undo2 className="h-3.5 w-3.5" />,
											label: t("chat.actions.unsend"),
											onClick: () => void handleUnsend(message),
											disabled: isMutating,
										});
									}

									if (mine && albumId && isViewable) {
										rows.push({
											key: "stop-sharing",
											icon: <Album className="h-3.5 w-3.5" />,
											label: t("chat.actions.stop_sharing", { defaultValue: "Stop Sharing" }),
											onClick: () => void handleStopAlbumShare(albumId),
											disabled: isMutating,
										});
									}

									rows.push({
										key: "delete",
										icon: <Trash2 className="h-3.5 w-3.5" />,
										label: t("chat.actions.delete"),
										onClick: () => void handleDelete(message),
										disabled: isMutating,
										danger: true,
									});

									return rows.map((row) => (
										<SheetClose
											key={row.key}
											disabled={row.disabled}
											onClick={row.onClick}
											className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition active:bg-[var(--surface-2)] disabled:opacity-50 ${
												row.danger ? "text-red-400" : "text-[var(--text)]"
											}`}
										>
											<div
												className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
													row.danger ? "bg-red-500/10 text-red-400" : "bg-[var(--surface-2)] text-[var(--accent)]"
												}`}
											>
												{row.icon}
											</div>
											{row.label}
										</SheetClose>
									));
								})()}
							</div>
						</BottomSheet>
					) : null}


		</div>
	) : (
		<div
			className={`flex h-full overflow-hidden items-center justify-center p-6 text-center text-[var(--text-muted)] ${
				isDesktop ? "surface-card" : ""
			}`}
		>
			{t("chat.select_conversation")}
		</div>
	);

	return renderThread;
}