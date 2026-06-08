import {
	Album,
	Ban,
	ChevronLeft,
	Ellipsis,
    Eye,
    EyeOff,
	Hourglass,
	ImagePlus,
	Images,
	Infinity,
	Loader2,
	MapPin,
	Mic,
	Plus,
	Settings2,
	BookMarked,
	MessageCircleOff,
	MessageCircleX,
	PencilLine,
	Pin,
	Reply,
	RotateCw,
	SendHorizontal,
	Share2,
	SquareCenterlineDashedHorizontal,
	SquareStack,
	Star,
	TimerOff,
	Trash2,
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
import {
	useModalClose,
} from "../../../hooks/useModalClose";
import type { AlbumListItem, UiMessage } from "../../../types/chat-page";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { DrawerMedia } from "./ChatDrawerPanel";
import { ChatDrawerPanel } from "./ChatDrawerPanel";
import { decodeGeohash } from "../../../utils/geohash";
import { LeafletLocationPicker } from "../gridpage/components/LeafletLocationPicker";
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
} from "./chatUtils";
import { getThumbImageUrl } from "../../../utils/media";
import { formatDistance } from "../gridpage/utils";
import { ProfileImage } from "../../../components/ui/profile-image";
import { ChatThreadMessages } from "./ChatThreadMessages";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { isChatGhosted, toggleChatGhost } from "../../../utils/privacy";
import { ToggleRow } from "../../../components/ui/toggle-row";
import { BottomDrawer } from "../../../components/ui/bottom-drawer";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
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
	userId: number | null;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	isUpdatingConversationState: boolean;
	isHeaderActionsMenuOpen: boolean;
	setIsHeaderActionsMenuOpen: (value: ((current: boolean) => boolean) | boolean) => void;
	headerActionsMenuRef: { current: HTMLDivElement | null };
	togglePin: () => void | Promise<void>;
	toggleMute: () => void | Promise<void>;
	clearLocalHistory: () => void | Promise<void>;
	onDeleteConversation?: (conversationId: string) => void | Promise<void>;
	isDeletingConversation?: boolean;
	onBlockProfile?: (profileId: number) => void | Promise<void>;
	isBlockingProfile?: boolean;
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
	startMessageLongPress: (messageId: string) => void;
	endMessageLongPress: () => void;
	messageLongPressTriggeredRef: { current: boolean };
	openFullScreenImage: (imageUrl: string, meta?: { takenOnGrindr: boolean; createdAtLabel: string | null; timestamp: number }) => void;
	openAlbumViewerById: (albumId: number) => void | Promise<void>;
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
};

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";

export function ChatThreadPanel(props: ChatThreadPanelProps) {
	const { t } = useTranslation();
    const apiFunctions = useApiFunctions();
	const { unitsPreset, geohash } = usePreferences();
	const [selectedExpirationType, setSelectedExpirationType] = useState("INDEFINITE");
	const [pendingLocationShare, setPendingLocationShare] = useState<{ lat: number; lon: number } | null>(null);
	const [isSavedPhrasesOpen, setIsSavedPhrasesOpen] = useState(false);
	const [phrasesExpanded, setPhrasesExpanded] = useState(false);
	const [newPhraseInput, setNewPhraseInput] = useState("");

	const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
	const [attachmentCrop, setAttachmentCrop] = useState<Crop | undefined>(undefined);
	const [attachmentCompletedCrop, setAttachmentCompletedCrop] = useState<PixelCrop | undefined>(undefined);
	const [isDraggingAttachmentCrop, setIsDraggingAttachmentCrop] = useState(false);
	const attachmentImgRef = useRef<HTMLImageElement | null>(null);
	const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
	const [isBlockConfirmOpen, setIsBlockConfirmOpen] = useState(false);
	const [isDeleteConversationConfirmOpen, setIsDeleteConversationConfirmOpen] =
		useState(false);
	const [dontAskBlockAgain, setDontAskBlockAgain] = useState(false);
	const [skipBlockConfirm, setSkipBlockConfirm] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
	});

	const {
		navigate,
		isDesktop,
		selectedConversation,
		targetProfileId,
		userId,
		nowTimestamp,
		presenceResults,
		isUpdatingConversationState,
		isHeaderActionsMenuOpen,
		setIsHeaderActionsMenuOpen,
		headerActionsMenuRef,
		togglePin,
		toggleMute,
		clearLocalHistory,
		onDeleteConversation,
		isDeletingConversation = false,
		onBlockProfile,
		isBlockingProfile = false,
		onToggleFavorite,
		isFavorite = false,
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
	} = props;

    const [savedPhrases, setSavedPhrases] = useState<string[]>(() => loadSavedPhrases());

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
		setDraft(draft ? `${draft} ${phrase}` : phrase);
	};

	const handleAddPhrase = () => {
		const trimmed = newPhraseInput.trim();
		if (!trimmed) return;
		const updated = saveSavedPhrases([...savedPhrases, trimmed]);
		setSavedPhrases(updated);
		setNewPhraseInput("");
	};

	const handleDeletePhrase = (index: number) => {
		const updated = saveSavedPhrases(savedPhrases.filter((_, i) => i !== index));
		setSavedPhrases(updated);
	};


	useEffect(() => {
		const syncSavedPhrases = (event: Event) => {
			const detail = (event as CustomEvent<string[]>).detail;
			if (Array.isArray(detail)) {
				setSavedPhrases(detail);
				return;
			}
			setSavedPhrases(loadSavedPhrases());
		};

		window.addEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);
		window.addEventListener("storage", syncSavedPhrases);

		return () => {
			window.removeEventListener(SAVED_PHRASES_UPDATED_EVENT, syncSavedPhrases as EventListener);
			window.removeEventListener("storage", syncSavedPhrases);
		};
	}, []);
    
    const filteredPhrases = savedPhrases.filter((phrase) =>
        draft.trim() === "" || phrase.toLowerCase().startsWith(draft.toLowerCase()),
    );

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

    const [showGhostButton] = useState(() => window.localStorage.getItem("fg-show-ghost-btn") !== "false");
    const [isGhosted, setIsGhosted] = useState(true);

    useEffect(() => {
        if (selectedConversation) {
            setIsGhosted(isChatGhosted(selectedConversation.data.conversationId));
        }
    }, [selectedConversation]);

	const closeBlockConfirm = () => {
		if (isBlockingProfile) {
			return;
		}
		setIsBlockConfirmOpen(false);
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
			const layoutHeight = window.innerHeight;
			const visibleBottom = viewport.height + viewport.offsetTop;
			const overlap = Math.max(0, Math.round(layoutHeight - visibleBottom));
			// Ignore tiny viewport shifts from browser chrome changes.
			setMobileKeyboardInset(overlap >= 60 ? overlap : 0);
		};

		updateKeyboardInset();
		viewport.addEventListener("resize", updateKeyboardInset);
		viewport.addEventListener("scroll", updateKeyboardInset);

		return () => {
			viewport.removeEventListener("resize", updateKeyboardInset);
			viewport.removeEventListener("scroll", updateKeyboardInset);
		};
	}, [isDesktop]);

	const renderThread = (selectedConversation || targetProfileId) ? (
		<div
			className={`flex h-full flex-col ${!isDesktop ? "overflow-hidden p-0" : "overflow-hidden p-3 sm:p-4"} ${
				isDesktop ? "surface-card" : ""
			}`}
			style={
				!isDesktop
					? {
						height:
							"calc(100dvh - (env(safe-area-inset-top, 0px) + 16px) - (env(safe-area-inset-bottom, 0px) + 92px))",
					}
					: undefined
			}
		>
			{selectedConversation ? (() => {
				const otherParticipant = getOtherParticipant(
					selectedConversation,
					userId,
				);
				const otherParticipantOnlineMeta = getParticipantOnlineMeta(
					otherParticipant?.lastOnline,
					otherParticipant?.onlineUntil,
					nowTimestamp,
					t,
				);
				const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
				const distanceLabel = otherParticipant?.distanceMetres
					? formatDistance(otherParticipant.distanceMetres, t, unitsPreset)
					: null;
				const displayName =
					localNickname || selectedConversation.data.name || t("chat.conversation");

				const requestBlockProfile = () => {
					if (!otherParticipant || isBlockingProfile || !onBlockProfile) {
						return;
					}

					setIsHeaderActionsMenuOpen(false);
					if (skipBlockConfirm) {
						void onBlockProfile(otherParticipant.profileId);
						return;
					}

					setDontAskBlockAgain(false);
					setIsBlockConfirmOpen(true);
				};

				const confirmBlockProfile = () => {
					if (!otherParticipant || isBlockingProfile || !onBlockProfile) {
						return;
					}

					if (dontAskBlockAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
						setSkipBlockConfirm(true);
					}

					setIsBlockConfirmOpen(false);
					void onBlockProfile(otherParticipant.profileId);
				};

				const requestDeleteConversation = () => {
					if (!onDeleteConversation || isDeletingConversation) {
						return;
					}
					setIsHeaderActionsMenuOpen(false);
					setIsDeleteConversationConfirmOpen(true);
				};

				const confirmDeleteConversation = () => {
					if (!onDeleteConversation || isDeletingConversation) {
						return;
					}
					setIsDeleteConversationConfirmOpen(false);
					void onDeleteConversation(selectedConversation.data.conversationId);
				};

				return (
					<>
						<div
							className={`mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3 ${!isDesktop ? "fixed inset-x-0 top-0 z-20 bg-[var(--surface)] py-3 px-[var(--app-px)]" : "-mx-3 sm:-mx-4 px-3 sm:px-4"}`}
							style={
								!isDesktop
									? {
										top: 0,
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
                                        className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
                                        aria-label={t("browse_location.back_aria")}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                )}
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
									title={otherParticipantOnlineMeta.label}
									className={`h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-[var(--surface-2)] transition disabled:cursor-default disabled:opacity-80 ${
										isOtherParticipantOnline
											? "border-emerald-500 shadow-[0_0_0_2px_color-mix(in_srgb,var(--surface)_70%,transparent)] hover:border-emerald-400"
											: "border-[var(--border)] hover:border-[var(--accent)]"
									}`}
								>
									<ProfileImage
										src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
										alt={displayName}
									/>
								</button>
								<div className="min-w-0">
									<div className="flex items-center gap-1.5 min-w-0">
										<p className="truncate text-lg font-semibold">
											{displayName}
										</p>
										{otherParticipant?.profileId &&
										presenceResults[otherParticipant.profileId] ? (
											<img
												src={freegrindLogo}
												alt="Free Grind user"
												title="Uses Free Grind"
												className="shrink-0 h-5 w-5 rounded-full border border-[var(--border)]"
											/>
										) : null}
									</div>
									<p className="text-sm text-[var(--text-muted)]">
										{distanceLabel
											? `${otherParticipantOnlineMeta.label} · ${distanceLabel}`
											: otherParticipantOnlineMeta.label}
									</p>
								</div>
							</div>
							<div className="flex items-center gap-2">
            {isDesktop && (
                <>
                    {showGhostButton && selectedConversation && (
                        <button
                            type="button"
                            onClick={() => {
 												const newState = toggleChatGhost(selectedConversation.data.conversationId);
 												setIsGhosted(newState);
 												
 												// If turning Ghost Mode OFF, instantly mark the last message as read!
 												if (!newState) {
 													const lastMsg = threadMessages[threadMessages.length - 1];
 													if (lastMsg) {
 														// Tell the server
 														apiFunctions.markRead(selectedConversation.data.conversationId, lastMsg.messageId).catch(() => {});
 														// Refresh the thread to clear the bold text locally
 														loadThread({ conversationId: selectedConversation.data.conversationId, older: false });
 													}
 												}
 												toast.success(newState ? "Ghost Mode ON for this chat." : "Ghost Mode OFF. They will see read receipts.");
 											}}
                            className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                isGhosted
                                    ? "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                    : "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] hover:brightness-110"
                            }`}
                            title={isGhosted ? "Ghost Mode ON (Hidden)" : "Ghost Mode OFF (Visible)"}
                        >
                            {isGhosted ? <EyeOff className="mr-1 inline h-3.5 w-3.5" /> : <Eye className="mr-1 inline h-3.5 w-3.5" />}
                            {isGhosted ? "Ghosting" : "Reading"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            if (!otherParticipant || !onToggleFavorite) return;
                            void onToggleFavorite(otherParticipant.profileId, isFavorite);
											}}
											disabled={isTogglingFavorite || !otherParticipant || !onToggleFavorite}
											className={`rounded-xl border px-3 py-2 text-xs font-medium transition disabled:opacity-60 ${
												isFavorite
													? "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
													: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
											}`}
										>
											{isTogglingFavorite ? (
												<Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
											) : (
												<Star className={`mr-1 inline h-3.5 w-3.5 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
											)}
											{isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
										</button>
										<button
											type="button"
											disabled={isUpdatingConversationState}
											onClick={togglePin}
											className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
										>
											<Pin className="mr-1 inline h-3.5 w-3.5" />
											{selectedConversation.data.pinned ? t("chat.unpin") : t("chat.pin")}
										</button>
										<button
											type="button"
											onClick={requestBlockProfile}
											disabled={isBlockingProfile || !otherParticipant || !onBlockProfile}
											className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-60"
										>
											{isBlockingProfile ? (
												<Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
											) : (
												<Ban className="mr-1 inline h-3.5 w-3.5" />
											)}
											{isBlockingProfile
												? t("profile_details.block_in_progress")
												: t("profile_details.block")}
										</button>
									</>
								)}

								{onOpenMediaSheet && (
									<button
										type="button"
										onClick={onOpenMediaSheet}
										className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
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
										<Ellipsis className="h-4 w-4" />
									</button>
									{isHeaderActionsMenuOpen ? (
										<div className="absolute right-0 top-full z-30 mt-2 flex min-w-[210px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
                                            <button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													if (!otherParticipant) return;
													const returnTo = getProfileReturnToChatPath(otherParticipant.profileId);
													const nextParams = new URLSearchParams();
													nextParams.set("returnTo", returnTo);
													navigate(`/profile/${otherParticipant.profileId}?${nextParams.toString()}`, { state: { returnTo } });
												}}
												disabled={!otherParticipant}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
											>
												<User className="mr-2 h-4 w-4 opacity-70" />
												{t("chat.view_profile")}
											</button>

                                            {/* --- MOBILE GHOST TOGGLE --- */}
											{!isDesktop && showGhostButton && selectedConversation && (
												<button
													type="button"
													onClick={() => {
														setIsHeaderActionsMenuOpen(false);
														const newState = toggleChatGhost(selectedConversation.data.conversationId);
														setIsGhosted(newState);
														toast.success(newState ? "Ghost Mode ON for this chat." : "Ghost Mode OFF.");
													}}
													className={`flex items-center rounded-lg px-2 py-2 text-left text-sm transition ${
														isGhosted ? "text-[var(--accent)] hover:bg-[var(--accent)]/10" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
													}`}
												>
													{isGhosted ? <EyeOff className="mr-2 h-4 w-4 opacity-70" /> : <Eye className="mr-2 h-4 w-4 opacity-70" />}
													{isGhosted ? "Ghosting (Hidden)" : "Reading (Visible)"}
												</button>
											)}
											{/* --------------------------- */}
                                            
                                            {/* --- BAN PROFILE NAME --- */}
											<button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
													const newList = currentList ? `${currentList}, ${displayName}` : displayName;
													window.localStorage.setItem("fg-forbidden-words", newList);
													toast.success(`Added "${displayName}" to Forbidden Keywords!`);
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
											>
												<Ban className="mr-2 h-4 w-4 opacity-70" />
												Ban Name "{displayName}"
											</button>
											{/* ------------------------ */}

                                            {/* --- BAN PROFILE BIO --- */}
											<button
												type="button"
												onClick={async () => {
													setIsHeaderActionsMenuOpen(false);
													if (!otherParticipant) return;
													
													const loadToast = toast.loading("Loading bio...");
													try {
														const profile = await apiFunctions.getProfileDetail(String(otherParticipant.profileId));
														toast.dismiss(loadToast);
														
														const bio = profile.aboutMe || "";
														if (!bio.trim()) {
															toast.error("This user has no bio!");
															return;
														}

														const wordToBan = window.prompt("Trim this bio down to the exact phrase you want to ban:", bio);
														if (wordToBan && wordToBan.trim()) {
															const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
															const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
															window.localStorage.setItem("fg-forbidden-words", newList);
															toast.success(`Added "${wordToBan.trim()}" to Forbidden Keywords!`);
														}
													} catch (e) {
														toast.dismiss(loadToast);
														toast.error("Failed to load bio.");
													}
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
											>
												<Ban className="mr-2 h-4 w-4 opacity-70" />
												Ban Bio Phrase
											</button>
											{/* ----------------------- */}

											<button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													if (!otherParticipant || !onEditLocalNickname) return;
													void onEditLocalNickname(otherParticipant.profileId, displayName);
												}}
												disabled={!otherParticipant || !onEditLocalNickname}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
											>
												<PencilLine className="mr-2 h-4 w-4 opacity-70" />
												{localNickname ? t("chat.nicknames.edit") : t("chat.nicknames.set")}
											</button>

											{!isDesktop && (
												<>
													<button
														type="button"
														onClick={() => {
															setIsHeaderActionsMenuOpen(false);
															if (!otherParticipant || !onToggleFavorite) return;
															void onToggleFavorite(otherParticipant.profileId, isFavorite);
														}}
														disabled={isTogglingFavorite || !otherParticipant || !onToggleFavorite}
														className={`flex items-center rounded-lg px-2 py-2 text-left text-sm transition disabled:opacity-60 ${
															isFavorite ? "text-amber-400 hover:bg-amber-500/10" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
														}`}
													>
														{isTogglingFavorite ? (
															<Loader2 className="mr-2 h-4 w-4 animate-spin" />
														) : (
															<Star className={`mr-2 h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
														)}
														{isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
													</button>
													<button
														type="button"
														disabled={isUpdatingConversationState}
														onClick={() => {
															setIsHeaderActionsMenuOpen(false);
															void togglePin();
														}}
														className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
													>
														<Pin className="mr-2 h-4 w-4 opacity-70" />
														{selectedConversation.data.pinned ? t("chat.unpin") : t("chat.pin")}
													</button>
												</>
											)}

											<button
												type="button"
												disabled={isUpdatingConversationState}
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													void toggleMute();
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-60"
											>
												{selectedConversation.data.muted ? (
													<Volume2 className="mr-2 h-4 w-4 opacity-70" />
												) : (
													<MessageCircleOff className="mr-2 h-4 w-4 opacity-70" />
												)}
												{selectedConversation.data.muted ? t("chat.unmute") : t("chat.mute")}
											</button>

											{!isDesktop && (
												<button
													type="button"
													onClick={requestBlockProfile}
													disabled={isBlockingProfile || !otherParticipant || !onBlockProfile}
													className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
												>
													<Ban className="mr-2 h-4 w-4 opacity-70" />
													{isBlockingProfile
														? t("profile_details.block_in_progress")
														: t("profile_details.block")}
												</button>
											)}

											<button
												type="button"
												onClick={() => {
													setIsHeaderActionsMenuOpen(false);
													void clearLocalHistory();
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
											>
												<Trash2 className="mr-2 h-4 w-4 opacity-70" />
												{t("chat.clear_local_history")}
											</button>
											<button
												type="button"
												onClick={requestDeleteConversation}
												disabled={!onDeleteConversation || isDeletingConversation}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:opacity-60"
											>
												<MessageCircleX className="mr-2 h-4 w-4 opacity-70" />
												{isDeletingConversation
													? t("chat.delete_conversation_in_progress")
													: t("chat.delete_conversation")}
											</button>
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
							isOpen={isDeleteConversationConfirmOpen}
							title={t("chat.delete_conversation")}
							message={t("chat.delete_conversation_confirm")}
							confirmLabel={t("chat.delete_conversation")}
							cancelLabel={t("chat.actions.cancel")}
							onConfirm={confirmDeleteConversation}
							onCancel={closeDeleteConversationConfirm}
							isProcessing={isDeletingConversation}
							confirmTone="danger"
						/>
					</>
				);
			})() : (
			<div
				className={`mb-3 flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3 ${!isDesktop ? "fixed inset-x-0 top-0 z-20 bg-[var(--surface)] py-3 px-[var(--app-px)]" : "-mx-3 sm:-mx-4 px-3 sm:px-4"}`}
				style={!isDesktop ? { top: 0, paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))" } : undefined}
			>
				<div className="min-w-0 flex items-center gap-3">
					{!isDesktop && (
						<button
							type="button"
							onClick={() => navigate("/")}
							className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
							aria-label={t("browse_location.back_aria")}
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
					)}
					<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-[var(--border)] bg-[var(--surface-2)] flex items-center justify-center">
						<User className="h-5 w-5 text-[var(--text-muted)]" />
					</div>
					<div className="min-w-0">
						<p className="truncate text-lg font-semibold text-[var(--text-muted)]">{t("chat.new_conversation.title")}</p>
						<p className="text-sm text-[var(--text-muted)]">{t("chat.new_conversation.subtitle", { profileId: targetProfileId })}</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button type="button" disabled className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] opacity-40 cursor-not-allowed" aria-label="Open conversation actions">
						<Ellipsis className="h-4 w-4" />
					</button>
				</div>
			</div>
			)}

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

					<form
						onSubmit={onFormSubmit}
						className={`${!isDesktop ? "fixed bottom-0 left-0 right-0 z-30 px-[var(--app-px)] py-3" : "mt-3 pt-3 -mx-3 sm:-mx-4 px-3 sm:px-4"} border-t border-[var(--border)] bg-[var(--surface)]`}
						style={
							!isDesktop
								? {
									bottom: `${mobileKeyboardInset}px`,
									paddingBottom: "max(12px, env(safe-area-inset-bottom))",
								}
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
						{filteredPhrases.length > 0 && (
							<div className="mb-2 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								{filteredPhrases.map((phrase, idx) => {
									const isExact = phrase.toLowerCase() === draft.trim().toLowerCase();
									return (
										<button
											key={idx}
											type="button"
											onClick={() => handleUsePhrase(phrase)}
											className={`shrink-0 whitespace-nowrap rounded-2xl rounded-br-[3px] border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
												isExact
													? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
													: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
											}`}
										>
											{phrase}
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
									<div className="flex items-center gap-2 py-2.5 pl-[13px] pr-2">
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

						<div className="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 mb-2 focus-within:border-[var(--accent)] transition-colors">
							<textarea
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								rows={1}
								maxLength={1000}
								placeholder={selectedConversation ? t("chat.write_message") : t("chat.new_conversation.write_first_message")}
								className="flex-1 bg-transparent py-1 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none resize-none disabled:opacity-60"
                                style={{ fieldSizing: "content", maxHeight: "115px" }}
							/>
							<button
								type="submit"
								disabled={isSending || !!pendingLocationShare || draft.trim().length === 0}
								className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--accent)] transition hover:opacity-80 disabled:opacity-30"
							>
								{isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
							</button>
						</div>

                        <div className="mb-2 mx-5 flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={() => {
									if (!selectedConversation) { toast.error(t("chat.errors.no_conversation_yet", { defaultValue: "Send a text message first to unlock media." })); return; }
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
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
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
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:text-[var(--text)]"
								aria-label={t("chat.share_location_label", { defaultValue: "Share Location" })}
								title={t("chat.share_location_label", { defaultValue: "Share Location" })}
							>
								<MapPin className="h-5 w-5" />
							</button>
							<button
								type="button"
								onClick={() => setIsSavedPhrasesOpen((prev) => !prev)}
								className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:text-[var(--text)]"
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

					{pendingAttachmentFile ? (
						<BottomDrawer
							title={t("chat.attachments.ready_to_send", { file: pendingAttachmentFile.name })}
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
								const cycle = isVideo ? [2147483647, 1, 2] as const : [2147483647, 1] as const;
								const idx = cycle.indexOf(attachmentMaxViews as typeof cycle[number]);
								const next = cycle[(idx === -1 ? 0 : idx + 1) % cycle.length];
								const isLimited = attachmentMaxViews !== 2147483647;
								return (
									<button
										type="button"
										onClick={() => setAttachmentMaxViews(next)}
										className={`inline-flex min-w-[64px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 transition ${
											isLimited
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										<Hourglass className="h-4 w-4" />
										{attachmentMaxViews === 2147483647
											? <span className="text-base font-semibold leading-none">∞</span>
											: <span className="text-sm font-semibold">{attachmentMaxViews}×</span>
										}
									</button>
								);
							})()}
						>
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
							<div className="px-3 pb-3 grid gap-3">
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
							noConversation={!selectedConversation}
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
									<LeafletLocationPicker
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
								<div data-lenis-prevent className="overflow-y-auto" style={{ maxHeight: phrasesExpanded ? "72dvh" : "40dvh", transition: "max-height 0.25s ease" }}>
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
										<div>
											{savedPhrases.map((phrase, originalIndex) => (
												<div key={originalIndex} className="group flex items-center px-4">
													<div className="flex flex-1 items-center gap-1 py-3">
														<SheetClose
															onClick={() => handleUsePhrase(phrase)}
															className="min-w-0 flex-1 text-left text-sm text-[var(--text)] transition hover:text-[var(--accent)]"
														>
															{phrase}
														</SheetClose>
														<button
															type="button"
															onClick={() => handleDeletePhrase(originalIndex)}
															className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:text-red-400"
															aria-label={t("settings_saved_phrases.delete", { defaultValue: "Delete phrase" })}
														>
															<Trash2 className="h-3.5 w-3.5" />
														</button>
													</div>
												</div>
											))}
										</div>
									)}
								</div>
						</BottomSheet>
					) : null}

					{!isDesktop && selectedActionMessage && !isAlbumSheetOpen ? (
						<div
							className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm no-touch-callout"
							onClick={() => setOpenMessageActionId(null)}
						>
							<div
								className="w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-3 shadow-2xl"
								onClick={(event) => event.stopPropagation()}
							>
								<p className="px-1 pb-2 text-center text-xs font-medium tracking-wide text-[var(--text-muted)]">
									{t("chat.actions.title")}
								</p>
								<div className="grid gap-2">
									{(() => {
    const loc = getMessageLocation(selectedActionMessage);
    const body = selectedActionMessage.body as any;
    const hasText = body && typeof body.text === "string" && body.text.trim().length > 0;
    if (!loc && !hasText) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => void handleCopy(selectedActionMessage)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)]"
            >
                {t("chat.actions.copy", { defaultValue: "Copy" })}
            </button>

            {hasText && !selectedActionMessageMine ? (
                <button
                    type="button"
                    onClick={() => {
                        const body = selectedActionMessage.body as any;
                        const wordToBan = window.prompt("Trim this message down to the specific keyword you want to ban:", body?.text || "");
                        if (wordToBan && wordToBan.trim()) {
                            const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
                            const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
                            window.localStorage.setItem("fg-forbidden-words", newList);
                            toast.success(`Added "${wordToBan.trim()}" to Forbidden Keywords!`);
                            setOpenMessageActionId(null);
                        }
                    }}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)]"
                >
                    <Ban className="mr-2 h-4 w-4 inline opacity-70" /> Add to Forbidden Keywords
                </button>
            ) : null}
        </>
    );
})()}

                                    {/* --- DOWNLOAD BUTTON (MOBILE) --- */}
									{(() => {
										const imageUrl = getMessageImageUrl(selectedActionMessage);
										const videoUrl = getMessageVideoUrl(selectedActionMessage);
										const audioUrl = getMessageAudioUrl(selectedActionMessage);
										const mediaUrl = imageUrl || videoUrl || audioUrl;
										
										if (!mediaUrl) return null;

										return (
											<button
												type="button"
												onClick={() => {
													const a = document.createElement("a");
													a.href = mediaUrl;
													a.download = `media-${Date.now()}`;
													a.target = "_blank";
													document.body.appendChild(a);
													a.click();
													document.body.removeChild(a);
													setOpenMessageActionId(null);
												}}
												className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)]"
											>
												Download Media
											</button>
										);
									})()}
									{/* -------------------------------- */}

									<button
										type="button"
										onClick={() => void handleReply(selectedActionMessage)}
										disabled={isMutatingMessageId === selectedActionMessage.messageId}
										className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-60"
									>
										{t("chat.actions.reply", { defaultValue: "Reply" })}
									</button>
									{selectedActionMessageMine && !selectedActionMessage.unsent ? (
										<button
											type="button"
											onClick={() => void handleUnsend(selectedActionMessage)}
											disabled={
												isMutatingMessageId === selectedActionMessage.messageId
											}
											className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm font-medium transition hover:border-[var(--accent)] disabled:opacity-60"
										>
											{t("chat.actions.unsend")}
										</button>
									) : null}
									{(() => {
										const albumId = getMessageAlbumId(selectedActionMessage);
										const isViewable = (selectedActionMessage.body as any)?.isViewable;
										if (!selectedActionMessageMine || !albumId || !isViewable) return null;
										return (
											<button
												type="button"
												onClick={() => void handleStopAlbumShare(albumId)}
												disabled={isMutatingMessageId === selectedActionMessage.messageId}
												className="w-full rounded-xl border border-orange-500/35 bg-orange-500/10 px-3 py-3 text-left text-sm font-medium text-orange-300 transition hover:bg-orange-500/15 disabled:opacity-60"
											>
												{t("chat.actions.stop_sharing", { defaultValue: "Stop Sharing" })}
											</button>
										);
									})()}
									<button
										type="button"
										onClick={() => void handleDelete(selectedActionMessage)}
										disabled={
											isMutatingMessageId === selectedActionMessage.messageId
										}
										className="w-full rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/15 disabled:opacity-60"
									>
										{t("chat.actions.delete")}
									</button>
									<button
										type="button"
										onClick={() => setOpenMessageActionId(null)}
										className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										{t("chat.actions.cancel")}
									</button>
								</div>
							</div>
						</div>
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
