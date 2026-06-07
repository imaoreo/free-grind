import { Album, Ellipsis, Hourglass, Lock, MapPin, Reply } from "lucide-react";
import { LeafletLocationPreview } from "../gridpage/components/LeafletLocationPreview";
import { AudioMessagePlayer } from "./AudioMessagePlayer";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, useEffect, useState, useMemo, useCallback, useRef } from "react";

import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { appLog } from "../../../utils/logger";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { UiMessage } from "../../../types/chat-page";
import { ProfileImage } from "../../../components/ui/profile-image";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";
import {
	formatDateHeader,
	formatDateTime24,
	formatMessageTime,
	getMessageAlbumCoverUrl,
	getMessageAlbumId,
	getMessageAudioUrl,
	getMessageImageCreatedAt,
	getMessageImageUrl,
	getMessageLocation,
	getMessageTakenOnGrindr,
	getMessageText,
	getMessageVideoUrl,
	isLocalClientMessageId,
} from "./chatUtils";

type ChatThreadMessagesProps = {
	isDesktop: boolean;
	selectedConversation: ConversationEntry;
	userId: number | null;
	nowTimestamp: number;
	messagePageKey: string | null;
	isLoadingOlderMessages: boolean;
	loadThread: (args: { conversationId: string; older: boolean }) => void | Promise<void>;
	threadScrollContainerRef: { current: HTMLDivElement | null };
	handleThreadScroll: (event: React.UIEvent<HTMLDivElement>) => void;
	threadMessages: UiMessage[];
	threadLastReadTimestamp: number | null;
	messageElementRefs: { current: Map<string, HTMLDivElement> };
	handleMessageTap: (message: Message) => void | Promise<void>;
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
};

function AlbumExpirationCountdown({ expiresAt, isOnce, t }: { expiresAt: number; isOnce?: boolean; t: any }) {
	const [timeLeft, setTimeLeft] = useState<number>(expiresAt - Date.now());

	useEffect(() => {
		if (isOnce) return;
		const timer = setInterval(() => {
			const next = expiresAt - Date.now();
			setTimeLeft(next);
			if (next <= 0) clearInterval(timer);
		}, 1000);
		return () => clearInterval(timer);
	}, [expiresAt, isOnce]);

	if (!isOnce && timeLeft <= 0) return null;

	const seconds = Math.floor((timeLeft / 1000) % 60);
	const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
	const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
	const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));

	const parts = [];
	if (days > 0) parts.push(t("right_now.days_short", { count: days }));
	if (hours > 0 || days > 0) parts.push(t("right_now.hours_short", { count: hours }));
	if (minutes > 0 || hours > 0 || days > 0) parts.push(t("right_now.minutes_short", { count: minutes }));
	if (days === 0 && hours === 0) parts.push(t("right_now.seconds_short", { count: seconds }));

	return (
		<>
			<style>
				{`
					@keyframes hourglass-rotate {
						0% { transform: rotate(0deg); }
						40% { transform: rotate(180deg); }
						60% { transform: rotate(180deg); }
						100% { transform: rotate(360deg); }
					}
					.animate-hourglass-rotate {
						animation: hourglass-rotate 2.5s infinite ease-in-out;
					}
				`}
			</style>
			<div className="mt-1 flex items-center">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold tracking-wide text-[var(--accent)] shadow-lg backdrop-blur-sm sm:text-[11px] uppercase">
					<Hourglass className="h-3 w-3 animate-hourglass-rotate" />
					<span>
						{isOnce ? t("chat.expiration.once") : `${parts.join(" ")} ${t("chat.expiration.remaining")}`}
					</span>
				</span>
			</div>
		</>
	);
}

export function ChatThreadMessages({
	isDesktop,
	selectedConversation,
	userId,
	nowTimestamp,
	messagePageKey,
	isLoadingOlderMessages,
	loadThread,
	threadScrollContainerRef,
	handleThreadScroll,
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
}: ChatThreadMessagesProps) {
	const { t } = useTranslation();
	const { blurIncomingMedia } = usePreferences();
	const [revealedMediaMessageIds, setRevealedMediaMessageIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [hoveredMediaMessageId, setHoveredMediaMessageId] = useState<string | null>(null);

	const handleCopy = useCallback(async (message: UiMessage) => {
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
	}, [t, setOpenMessageActionId]);

	useEffect(() => {
		setRevealedMediaMessageIds(new Set());
		setHoveredMediaMessageId(null);
	}, [selectedConversation.data.conversationId]);

	const revealMediaMessage = useCallback((messageId: string) => {
		setRevealedMediaMessageIds((previous) => {
			if (previous.has(messageId)) {
				return previous;
			}
			const next = new Set(previous);
			next.add(messageId);
			return next;
		});
	}, []);

	const handleMediaMouseEnter = useCallback(
		(messageId: string) => {
			if (!isDesktop) {
				return;
			}
			setHoveredMediaMessageId(messageId);
		},
		[isDesktop],
	);

	const handleMediaMouseLeave = useCallback(
		(messageId: string) => {
			if (!isDesktop) {
				return;
			}
			setHoveredMediaMessageId((current) => (current === messageId ? null : current));
		},
		[isDesktop],
	);

	const lastMyMessageId = [...threadMessages]
		.reverse()
		.find((m) => userId != null && Number(m.senderId) === Number(userId))?.messageId;

	const lastMessageId = threadMessages[threadMessages.length - 1]?.messageId;

	const latestMessageIdByAlbum = useMemo(() => {
		const map = new Map<number, string>();
		for (const m of threadMessages) {
			if (m.type !== "Album" && m.type !== "ExpiringAlbum" && m.type !== "ExpiringAlbumV2") continue;
			const aid = getMessageAlbumId(m);
			if (aid) map.set(aid, m.messageId);
		}
		return map;
	}, [threadMessages]);

	const swipeStateRef = useRef<{
		messageId: string;
		startX: number;
		startY: number;
		triggered: boolean;
	} | null>(null);

	const lastTapRef = useRef<{ messageId: string; time: number } | null>(null);
	const pendingTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingTapActionRef = useRef<(() => void) | null>(null);

	const handleMobileTouchStart = useCallback(
		(event: React.TouchEvent<HTMLDivElement>, message: UiMessage) => {
			startMessageLongPress(message.messageId);
			if (isDesktop || event.touches.length !== 1 || isLocalClientMessageId(message.messageId)) {
				swipeStateRef.current = null;
				return;
			}
			const touch = event.touches[0];
			swipeStateRef.current = {
				messageId: message.messageId,
				startX: touch.clientX,
				startY: touch.clientY,
				triggered: false,
			};
		},
		[isDesktop, startMessageLongPress],
	);

	const handleMobileTouchMove = useCallback(
		(event: React.TouchEvent<HTMLDivElement>, message: UiMessage) => {
			endMessageLongPress();
			if (isDesktop || event.touches.length !== 1) {
				return;
			}
			const state = swipeStateRef.current;
			if (!state || state.messageId !== message.messageId || state.triggered) {
				return;
			}
			const touch = event.touches[0];
			const dx = touch.clientX - state.startX;
			const dy = Math.abs(touch.clientY - state.startY);
			if (dx > 72 && dy < 40) {
				state.triggered = true;
				void handleReply(message);
			}
		},
		[endMessageLongPress, handleReply, isDesktop],
	);

	const handleMobileTouchEnd = useCallback(() => {
		swipeStateRef.current = null;
		endMessageLongPress();
	}, [endMessageLongPress]);

	const scheduleMobileTap = useCallback(
		(message: UiMessage, action: (() => void) | null) => {
			if (messageLongPressTriggeredRef.current) {
				messageLongPressTriggeredRef.current = false;
				return;
			}

			if (pendingTapTimerRef.current !== null) {
				clearTimeout(pendingTapTimerRef.current);
				pendingTapTimerRef.current = null;
				pendingTapActionRef.current = null;
			}

			const now = Date.now();
			const last = lastTapRef.current;

			if (last && last.messageId === message.messageId && now - last.time < 300) {
				lastTapRef.current = null;
				void handleReact(message);
				return;
			}

			lastTapRef.current = { messageId: message.messageId, time: now };

			if (action) {
				pendingTapActionRef.current = action;
				pendingTapTimerRef.current = setTimeout(() => {
					const act = pendingTapActionRef.current;
					pendingTapTimerRef.current = null;
					pendingTapActionRef.current = null;
					act?.();
				}, 280);
			}
		},
		[handleReact, messageLongPressTriggeredRef],
	);

	useEffect(() => {
		return () => {
			if (pendingTapTimerRef.current !== null) {
				clearTimeout(pendingTapTimerRef.current);
			}
		};
	}, []);

	return (
		<div
			ref={threadScrollContainerRef}
			onScroll={handleThreadScroll}
			data-lenis-prevent
			className={`flex flex-1 flex-col overflow-x-hidden overflow-y-auto ${!isDesktop ? "pb-[160px] pt-[140px]" : ""}`}
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
								{isLoadingOlderMessages ? t("chat.loading") : t("chat.load_older_messages")}
							</button>
						) : null}

						<div className={`flex flex-col gap-2 ${!isDesktop ? "px-[var(--app-px)] pt-4" : ""}`}>
                        {(() => {
                            // Track the last header label to detect day transitions during rendering
                            let lastHeader = "";
                            return threadMessages.map((message) => {
								const currentHeader = formatDateHeader(
                                    message.timestamp,
                                    nowTimestamp,
									t,
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
								const location = getMessageLocation(message);
								const albumId = getMessageAlbumId(message);
								const albumCover = getMessageAlbumCoverUrl(message);
								const messageText = getMessageText(message, t);
								const replyPreviewRaw = message.replyPreview as {
									text?: string; type?: string; chat1Type?: string;
									url?: string | null; imageHash?: string | null;
									previewMessageId?: string; senderId?: number;
								} | null | undefined;
								const replyText = typeof replyPreviewRaw?.text === "string" && replyPreviewRaw.text.trim().length > 0
									? replyPreviewRaw.text.trim()
									: null;
								const replyToMsgRef = message.replyToMessage as { messageId?: string; senderId?: number; type?: string } | null | undefined;
								const replyToMsgId = replyPreviewRaw?.previewMessageId ?? replyToMsgRef?.messageId;
								const replyToMsg = replyToMsgId
									? threadMessages.find(m => m.messageId === replyToMsgId) ?? null
									: null;
								const albumOwnerProfileId = message.type === "AlbumContentReply"
									? ((message.body as Record<string, unknown> | null | undefined)?.ownerProfileId as number | null | undefined) ?? null
									: null;
								const replySenderId = replyPreviewRaw?.senderId
									?? replyToMsgRef?.senderId
									?? replyToMsg?.senderId
									?? albumOwnerProfileId
									?? null;
								const replyIsImage = replyPreviewRaw?.type === "Image" || replyPreviewRaw?.type === "ExpiringImage"
									|| replyPreviewRaw?.chat1Type === "image" || replyPreviewRaw?.chat1Type === "expiring_image";
								const replyImageUrl = replyToMsg ? getMessageImageUrl(replyToMsg) : null;
								const replyImageHash = typeof replyPreviewRaw?.imageHash === "string" ? replyPreviewRaw.imageHash : null;
								const replyPreviewUrl = replyIsImage && typeof replyPreviewRaw?.url === "string" && replyPreviewRaw.url.startsWith("http") ? replyPreviewRaw.url : null;
								const replyMsgBody = message.body as Record<string, unknown> | null | undefined;
								const albumContentThumbUrl = message.type === "AlbumContentReply" && typeof replyMsgBody?.previewUrl === "string"
									? replyMsgBody.previewUrl
									: null;
								const replyToMsgThumbUrl = (() => {
									const embedded = message.replyToMessage as Record<string, unknown> | null | undefined;
									const src = embedded ?? (replyToMsg as Record<string, unknown> | null | undefined);
									if (!src) return null;
									const b = src.body as Record<string, unknown> | null | undefined;
									const t = src.type as string | undefined;
									if ((t === "AlbumContentReaction" || t === "AlbumContentReply") && typeof b?.previewUrl === "string") return b.previewUrl;
									return null;
								})();
								const replyThumbUrl = replyImageUrl ?? (replyImageHash ? getThumbImageUrl(replyImageHash, "320x320") : null) ?? replyPreviewUrl ?? albumContentThumbUrl ?? replyToMsgThumbUrl;
								const replyLabel = (replyText || replyThumbUrl)
									? replySenderId === userId
										? mine ? "Reply to myself" : "Reply to you"
										: `Reply to "${selectedConversation.data.name || ""}"`
									: null;
								// Strip the "> quoted\n" prefix that gets embedded in body.text on send
								let displayText = messageText;
								if (replyText) {
									const quotedPrefix = `> ${replyText}\n`;
									if (displayText.startsWith(quotedPrefix)) {
										displayText = displayText.slice(quotedPrefix.length);
									} else if (displayText.startsWith("> ")) {
										displayText = displayText.replace(/^>.*\n?/, "").trim();
									}
								}
								const isExpiringImage = message.type === "ExpiringImage";
								const isAlbumMessage =
									message.type === "Album" ||
									message.type === "ExpiringAlbum" ||
									message.type === "ExpiringAlbumV2";
								const isAlbumReactionBubble = message.type === "AlbumContentReaction";
								const isImageOnlyBubble =
									Boolean(imageUrl) && messageText === t("chat.thread.shared_image");
								const isAlbumOnlyBubble =
									isAlbumMessage && messageText === t("chat.preview.shared_album");
								const isLocationOnlyBubble =
									Boolean(location) && messageText === t("chat.preview.sent_location");
								const hasVisualMedia = Boolean(imageUrl) || Boolean(videoUrl) || isAlbumOnlyBubble || isLocationOnlyBubble;
							const isAudioOnlyBubble =
									Boolean(audioUrl) && messageText === t("chat.thread.shared_audio");
								const isMediaOnlyBubble =
									isImageOnlyBubble || isAlbumOnlyBubble || isLocationOnlyBubble || isAlbumReactionBubble;
								const tailCorner = mine ? "rounded-br-[3px]" : "rounded-bl-[3px]";
								const shouldBlurIncomingMedia =
									blurIncomingMedia &&
									!mine &&
									!revealedMediaMessageIds.has(message.messageId) &&
									(!isDesktop || hoveredMediaMessageId !== message.messageId);
								const mediaBlurClassName = shouldBlurIncomingMedia
									? "blur-xl transition"
									: "";
								const senderParticipant =
									selectedConversation.data.participants.find(
										(participant) =>
											Number(participant.profileId) === Number(message.senderId),
									) ?? null;
								const senderAvatarUrl =
									senderParticipant?.primaryMediaHash &&
									validateMediaHash(senderParticipant.primaryMediaHash)
										? getThumbImageUrl(senderParticipant.primaryMediaHash, "320x320")
										: null;
								const senderLabel = mine
									? t("chat.you")
									: selectedConversation.data.name?.trim() || t("chat.unknown");
								const isActiveSearchMatch =
									selectedThreadMessageMatches[activeThreadSearchIndex]
										?.messageId === message.messageId;
								const fireButtonClass = mine
									? "absolute -left-3 -top-2"
									: "absolute -right-3 -top-2";

								const msgBody = message.body as any;
								const expirationType = msgBody?.expirationType;

								const albumViewableUntil = isAlbumMessage ? msgBody?.viewableUntil : null;
								const mediaExpiresAt = !isAlbumMessage ? (msgBody?.expiresAt || msgBody?.expiresat) : null;

								const rawExpiresAt = albumViewableUntil || mediaExpiresAt;
								let expiresAt = Number(rawExpiresAt || 0);
								if (expiresAt > 0 && expiresAt < 100_000_000_000) expiresAt *= 1000;
								const totalLifetimeSec = expiresAt > 0 ? Math.round((expiresAt - message.timestamp) / 1000) : 0;

								const isIndefinite =
									expirationType === "INDEFINITE" ||
									expirationType === 0 ||
									(typeof expirationType === "string" && expirationType.toUpperCase() === "INDEFINITE");

								const isLastMessage = message.messageId === lastMessageId;
								const isLatestShare = albumId ? latestMessageIdByAlbum.get(albumId) === message.messageId : true;

								const isOnce = !isIndefinite && (
									expirationType === "ONCE" ||
									expirationType === 1 ||
									message.type === "ExpiringAlbumV2" ||
									(totalLifetimeSec > 1700 && totalLifetimeSec < 1900)
								);

								const isExpiringMedia = isAlbumMessage && !isIndefinite && isLatestShare && (expiresAt > 0 || isOnce);

								const isLocked = isAlbumMessage && (!isLatestShare || !msgBody?.isViewable);

								return (
								/* Use Fragment to allow rendering the separator and the message as a single map item */
                                <Fragment key={message.messageId}>
                                    {isNewDay && (
                                        <div className={`my-6 flex items-center gap-4 ${!isDesktop ? "" : "px-4"} opacity-80`}>
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
										className={`flex w-full ${mine ? "justify-end" : "justify-start"} ${isLastMessage && !mine ? "pb-6" : ""}`}
									>
										<div className={`flex flex-col ${mine ? "items-end" : "items-start"} max-w-[85%]`}>
											<div
												onDoubleClick={isDesktop ? () => void handleMessageTap(message) : undefined}
												onClick={!isDesktop ? () => scheduleMobileTap(message, null) : undefined}
												onTouchStart={(event) => handleMobileTouchStart(event, message)}
												onTouchEnd={handleMobileTouchEnd}
												onTouchCancel={handleMobileTouchEnd}
												onTouchMove={(event) => handleMobileTouchMove(event, message)}
												onContextMenu={(event) => event.preventDefault()}
												className={`relative group/bubble w-full rounded-2xl text-base no-touch-callout ${
													isMediaOnlyBubble
														? "bg-transparent p-0"
														: `px-3 py-2 ${
															mine
																? "bg-[var(--accent)] text-[var(--accent-contrast)] rounded-br-[3px]"
																: "bg-[var(--surface-2)] text-[var(--text)] rounded-bl-[3px]"
														}`
												} ${isActiveSearchMatch ? "ring-2 ring-[var(--accent)]" : ""} ${localOnly ? "opacity-50" : ""}`}
											>
												{localOnly && !hasVisualMedia ? (
													<span className="mb-1.5 block w-fit rounded-full bg-black/15 px-2 py-0.5 text-[10px] font-semibold">
														{t("chat.thread.from_local_history")}
													</span>
												) : null}
												{imageUrl ? (
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															if (isDesktop) {
																openFullScreenImage(imageUrl, {
																	takenOnGrindr: messageTakenOnGrindr,
																	createdAtLabel: imageCreatedAtLabel,
																	timestamp: message.timestamp,
																});
																return;
															}
															if (messageLongPressTriggeredRef.current) {
																messageLongPressTriggeredRef.current = false;
																return;
															}
															if (shouldBlurIncomingMedia) {
																revealMediaMessage(message.messageId);
																lastTapRef.current = null;
																return;
															}
															scheduleMobileTap(message, () => {
																openFullScreenImage(imageUrl, {
																	takenOnGrindr: messageTakenOnGrindr,
																	createdAtLabel: imageCreatedAtLabel,
																	timestamp: message.timestamp,
																});
															});
														}}
														className={`group/media ${isImageOnlyBubble ? `block w-full overflow-hidden rounded-2xl ${tailCorner}` : "mb-2 block overflow-hidden rounded-xl border border-black/10"}`}
														onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
														onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
													>
														<div className="relative">
														<img
															src={imageUrl}
															alt={t("chat.thread.shared_alt")}
															className={`${isImageOnlyBubble ? "max-h-80 w-full object-cover" : "max-h-64 w-full object-cover"} ${mediaBlurClassName}`}
														/>
														{localOnly && (
															<span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
																{t("chat.thread.from_local_history")}
															</span>
														)}
														{isExpiringImage ? (
															<div className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-semibold text-white ring-1 ring-white/25">
																1
															</div>
														) : null}
														{!mine && (messageTakenOnGrindr || imageCreatedAtLabel) ? (
															<div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
																{messageTakenOnGrindr ? (
																	<img
																		src={freegrindLogo}
																		alt={t("chat.thread.taken_on_grindr")}
																		className="h-3.5 w-3.5 rounded-full"
																	/>
																) : null}
																{imageCreatedAtLabel ? (
																	<span>{` ${imageCreatedAtLabel}`}</span>
																) : null}
															</div>
														) : null}

															{isImageOnlyBubble ? (
																<div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-white">
																	{(expiresAt > Date.now() || isOnce) && isExpiringMedia && (
																		<AlbumExpirationCountdown
																			expiresAt={expiresAt}
																			isOnce={isOnce}
																			t={t}
																		/>
																	)}

																	<div className="flex items-center justify-between gap-2 text-[10px]">
																		<div className="flex items-center gap-2">
																			{pending ? <span>{t("chat.sending")}</span> : null}
																			{failed ? <span>{t("chat.thread.failed")}</span> : null}
																		</div>
																		<div className="flex items-center gap-2">
																			<span>
																				{formatMessageTime(message.timestamp, nowTimestamp, t)}
																			</span>
																			{isDesktop &&
																			!pending &&
																			!isLocalClientMessageId(message.messageId) ? (
																				<button
																					type="button"
																					onClick={(event) => {
																						event.stopPropagation();
																						void handleReply(message);
																					}}
																					className="rounded-md p-1 hover:bg-white/10"
																				>
																					<Reply className="h-3.5 w-3.5" />
																				</button>
																			) : null}
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
															) : null}
														</div>
													</button>
												) : null}

												{isAlbumOnlyBubble ? (
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															if (isDesktop) {
																if (albumId && !isLocked) void openAlbumViewerById(albumId);
																return;
															}
															if (messageLongPressTriggeredRef.current) {
																messageLongPressTriggeredRef.current = false;
																return;
															}
															scheduleMobileTap(message, () => {
																if (albumId && !isLocked) void openAlbumViewerById(albumId);
															});
														}}
														className={`group/media block w-full overflow-hidden rounded-2xl ${tailCorner}`}
														onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
														onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
													>
														<div className="relative h-56 w-64 max-w-full overflow-hidden bg-[var(--surface-2)] sm:w-72">
															<div className="absolute inset-0 flex items-center justify-center text-[var(--text-muted)]">
																<Album className="h-8 w-8" />
															</div>
															{localOnly && (
																<span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
																	{t("chat.thread.from_local_history")}
																</span>
															)}
															{albumCover ? (
																<img
																	src={albumCover}
																alt={t("chat.thread.album_cover")}
																	className={`h-full w-full object-cover ${isLocked ? "scale-110 blur-sm opacity-50" : ""}`}
																	onError={(event) => {
																		event.currentTarget.style.display = "none";
																	}}
																/>
															) : null}

															{isLocked && (
																<div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[15px]">
																	<Lock className="h-10 w-10 text-white/90 drop-shadow-lg" />
																	<span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-white/90 drop-shadow">
																		{t("chat.expiration.expired")}
																	</span>
																</div>
															)}
															<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-white">
																<div className="h-16 w-16 overflow-hidden rounded-full border-white/30 bg-white/15 text-white shadow-lg backdrop-blur-sm">
																	<ProfileImage
																		src={senderAvatarUrl}
																		alt={senderLabel}
																	/>
																</div>
																<p className="max-w-full truncate text-sm font-semibold leading-tight text-white drop-shadow">
																	{senderLabel}
																</p>
															</div>
															<div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-white">
																{!isLocked && isExpiringMedia && (expiresAt > Date.now() || isOnce) && (
																	<AlbumExpirationCountdown
																		expiresAt={expiresAt}
																		isOnce={isOnce}
																		t={t}
																	/>
																)}
																<div className="flex items-center justify-between gap-2 text-[10px]">
																	<div className="flex items-center gap-2">
																		{pending ? <span>{t("chat.sending")}</span> : null}
																		{failed ? <span>{t("chat.thread.failed")}</span> : null}
																	</div>
																	<div className="flex items-center gap-2">
																		<span>
																			{formatMessageTime(message.timestamp, nowTimestamp, t)}
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
														</div>
													</button>
												) : null}

												{videoUrl ? (
														<div
															className="group/media relative mb-2 overflow-hidden rounded-xl border border-black/10 bg-black"
															onMouseEnter={() => handleMediaMouseEnter(message.messageId)}
															onMouseLeave={() => handleMediaMouseLeave(message.messageId)}
															onClick={(event) => {
																event.stopPropagation();
																if (shouldBlurIncomingMedia && !isDesktop) {
																	revealMediaMessage(message.messageId);
																	lastTapRef.current = null;
																}
															}}
														>
														{localOnly && (
															<span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
																{t("chat.thread.from_local_history")}
															</span>
														)}
														<video
															controls
															preload="metadata"
															src={videoUrl}
																className={`max-h-72 w-full ${mediaBlurClassName} ${shouldBlurIncomingMedia ? "cursor-pointer" : ""}`}
														/>
													</div>
												) : null}

												{audioUrl ? (
													<div onClick={(e) => e.stopPropagation()}>
														<AudioMessagePlayer src={audioUrl} messageId={message.messageId} mine={mine} />
													</div>
												) : null}

												{isAlbumReactionBubble ? (() => {
													const rxBody = message.body as Record<string, unknown> | null | undefined;
													const rxPreviewUrl = typeof rxBody?.previewUrl === "string" ? rxBody.previewUrl : null;
													const rxAlbumId = typeof rxBody?.albumId === "number" ? rxBody.albumId : null;
													const rxLabel = mine
														? t("chat.preview.tapped_album_photo_theirs")
														: t("chat.preview.tapped_album_photo_yours");
													return (
														<>
															<button
																type="button"
																className={`group/media relative block w-full overflow-hidden rounded-2xl ${tailCorner}`}
																onClick={(event) => {
																	event.stopPropagation();
																	if (!rxAlbumId) return;
																	if (isDesktop) { void openAlbumViewerById(rxAlbumId); return; }
																	if (messageLongPressTriggeredRef.current) { messageLongPressTriggeredRef.current = false; return; }
																	scheduleMobileTap(message, () => void openAlbumViewerById(rxAlbumId));
																}}
															>
																{rxPreviewUrl ? (
																	<img src={rxPreviewUrl} alt="" className="aspect-square w-full object-cover" />
																) : (
																	<div className="h-48 w-full bg-[var(--surface-2)]" />
																)}
																<div className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 py-2 text-white">
																	<div className="flex items-center justify-between gap-2 text-[10px]">
																		<div className="flex items-center opacity-90">
																			<Album className="h-3 w-3 shrink-0" />
																		</div>
																		<div className="flex items-center gap-2">
																			<span>{formatMessageTime(message.timestamp, nowTimestamp, t)}</span>
																			{isDesktop && !pending && !isLocalClientMessageId(message.messageId) ? (
																				<>
																					<button type="button" onClick={(e) => { e.stopPropagation(); void handleReply(message); }} className="rounded-md p-1 hover:bg-white/10">
																						<Reply className="h-3.5 w-3.5" />
																					</button>
																					<button type="button" onClick={(e) => { e.stopPropagation(); setOpenMessageActionId(c => c === message.messageId ? null : message.messageId); }} className="rounded-md p-1 hover:bg-white/10">
																						<Ellipsis className="h-3.5 w-3.5" />
																					</button>
																				</>
																			) : null}
																		</div>
																	</div>
																</div>
															</button>
															<p className={`mt-1 text-xs opacity-60 ${mine ? "text-right" : "text-left"}`}>{rxLabel}</p>
														</>
													);
												})() : null}

												{location ? (
													<button
														type="button"
														onClick={(event) => {
															event.stopPropagation();
															const url = isDesktop
																? `https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lon}`
																: `geo:${location.lat},${location.lon}?q=${location.lat},${location.lon}`;
															const doOpen = () => {
																openUrl(url).catch((error) => {
																	appLog.error("Failed to open map URL", error);
																	window.open(url, "_blank");
																});
															};
															if (isDesktop) { doOpen(); return; }
															if (messageLongPressTriggeredRef.current) {
																messageLongPressTriggeredRef.current = false;
																return;
															}
															scheduleMobileTap(message, doOpen);
														}}
														className={`mb-2 flex w-full flex-col overflow-hidden rounded-xl border border-black/10 text-left transition hover:brightness-110 ${tailCorner} ${
															mine
																? "bg-white/10 text-white"
																: "bg-[var(--surface-2)] text-[var(--text)]"
														}`}
													>
														<div className="relative">
									<LeafletLocationPreview lat={location.lat} lon={location.lon} className="h-32 w-full pointer-events-none" />
									{localOnly && (
										<span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
											{t("chat.thread.from_local_history")}
										</span>
									)}
								</div>
														<div className="flex items-center gap-3 p-3">
															<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]">
																<MapPin className="h-4 w-4" />
															</div>
															<div className="min-w-0 flex-1">
																<p className="text-[10px] font-bold uppercase tracking-wider opacity-70">
																	{t("chat.thread.location_shared")}
																</p>
																<p className="truncate text-sm font-semibold opacity-90">
																	{location.lat.toFixed(5)}, {location.lon.toFixed(5)}
																</p>
															</div>
														</div>

														{isLocationOnlyBubble && (
															<div className="flex items-center justify-end gap-2 px-3 pb-2 text-[10px] opacity-80">
																{isDesktop &&
																!pending &&
																!isLocalClientMessageId(message.messageId) ? (
																	<>
																		<button
																			type="button"
																			onClick={(event) => {
																				event.stopPropagation();
																				void handleReply(message);
																			}}
																			className={`rounded-md p-1 ${mine ? "hover:bg-white/10" : "hover:bg-black/10"}`}
																		>
																			<Reply className="h-3.5 w-3.5" />
																		</button>
																		<button
																			type="button"
																			onClick={(event) => {
																				event.stopPropagation();
																				setOpenMessageActionId((current) =>
																					current === message.messageId
																						? null
																						: message.messageId,
																				);
																			}}
																			className={`rounded-md p-1 ${mine ? "hover:bg-white/10" : "hover:bg-black/10"}`}
																		>
																			<Ellipsis className="h-3.5 w-3.5" />
																		</button>
																	</>
																) : null}
																<span>
																	{formatMessageTime(message.timestamp, nowTimestamp, t)}
																</span>
															</div>
														)}
													</button>
												) : null}

												{isAlbumMessage && !isAlbumOnlyBubble ? (
													<div className={`mb-2 rounded-xl border border-black/10 p-2 ${isLocked ? "bg-[var(--surface-2)] opacity-60" : "bg-[color-mix(in_srgb,var(--surface)_76%,transparent)]"}`}>
														{albumCover ? (
															<img
																src={albumCover}
																alt={t("chat.thread.album_cover")}
																className={`mb-2 h-36 w-full rounded-lg object-cover ${isLocked ? "blur-[2px] opacity-50" : ""}`}
															/>
														) : null}
														<div className="flex items-center justify-between gap-2">
															<span className="text-xs font-medium">
																{isLocked ? (
																	<div className="flex items-center gap-1.5 text-[var(--text-muted)]">
																		<Lock className="h-3.5 w-3.5" />
																		{t("chat.expiration.expired")}
																	</div>
																) : t("chat.thread.album_share")}
															</span>
															<button
																type="button"
																onClick={(event) => {
																	event.stopPropagation();
																	if (albumId) void openAlbumViewerById(albumId);
																}}
																className="rounded-md border border-black/20 px-2 py-1 text-[11px]"
																disabled={!albumId || isLocked}
															>
																{t("chat.open")}
															</button>
														</div>
														{!isLocked && isExpiringMedia && (expiresAt > Date.now() || isOnce) && (
															<AlbumExpirationCountdown
																expiresAt={expiresAt}
																isOnce={isOnce}
																t={t}
															/>
														)}
													</div>
												) : null}

												{message.type === "ProfilePhotoReply" ? (() => {
													const body = message.body as Record<string, unknown> | null | undefined;
													const hash = typeof body?.imageHash === "string" ? body.imageHash : null;
													const photoUrl = hash ? getThumbImageUrl(hash, "320x320") : null;
													return (
														<div className={`relative mb-2.5 mt-1 flex overflow-hidden rounded-[6px] text-xs ${mine ? "bg-black/20" : "bg-black/[0.08]"}`}>
															<div className={`absolute left-0 top-0 h-full w-[3px] shrink-0 ${mine ? "bg-white/60" : "bg-[var(--accent)]/50"}`} />
															<div className="min-w-0 flex-1 py-2.5 pl-[13px] pr-2.5">
																<p className="mb-0.5 font-semibold opacity-60 truncate">{t("chat.thread.replied_to_photo")}</p>
																<p className="opacity-60">{t("chat.thread.shared_image")}</p>
															</div>
															{photoUrl && (
																<img
																	src={photoUrl}
																	alt=""
																	className="h-14 w-14 shrink-0 object-cover object-top"
																/>
															)}
														</div>
													);
												})() : null}


												{(replyText || replyThumbUrl) && !isMediaOnlyBubble ? (
													<div className={`relative mb-2.5 mt-1 flex overflow-hidden rounded-[6px] text-xs ${
														mine ? "bg-black/20" : "bg-black/[0.08]"
													}`}>
														<div className={`absolute left-0 top-0 h-full w-[3px] shrink-0 ${
															mine ? "bg-white/60" : "bg-[var(--accent)]/50"
														}`} />
														<div className="min-w-0 flex-1 py-2.5 pl-[13px] pr-2.5">
															<p className="mb-0.5 font-semibold opacity-60 truncate">{replyLabel}</p>
															<p className="line-clamp-2 break-words opacity-80">{replyText ?? (message.type === "AlbumContentReply" || replyToMsgRef?.type === "AlbumContentReply" ? t("chat.thread.album_image") : replyToMsgRef?.type === "AlbumContentReaction" ? t("chat.thread.reacted_to_image") : t("chat.thread.shared_image"))}</p>
														</div>
														{replyThumbUrl && (
															<img
																src={replyThumbUrl}
																alt=""
																className="h-14 w-14 shrink-0 object-cover"
															/>
														)}
													</div>
												) : null}

												{!isMediaOnlyBubble && !isAudioOnlyBubble ? (
													<p className="whitespace-pre-wrap break-words">
														{displayText}
													</p>
												) : null}

														{!isLocalClientMessageId(message.messageId) ? (
															<span className={`chat-reaction-flame text-2xl inline-flex pointer-events-none ${fireButtonClass} absolute z-10 transition-opacity ${
																message.reactions.length > 0 || isAlbumReactionBubble ? "opacity-100" : "opacity-0"
															} ${reactionBurstMessageId === message.messageId ? "chat-reaction-flame--burst" : ""}`}>
																🔥
															</span>
														) : null}

												{!isMediaOnlyBubble ? (
												<div className="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-80">
													<div className="flex items-center gap-2">
														{pending ? <span>{t("chat.sending")}</span> : null}
														{failed ? <span>{t("chat.thread.failed")}</span> : null}
													</div>
													<div className="flex items-center gap-2">
														<span>
															{formatMessageTime(message.timestamp, nowTimestamp, t)}
														</span>
														{isDesktop &&
														!pending &&
														!isLocalClientMessageId(message.messageId) ? (
															<button
																type="button"
																onClick={() => void handleReply(message)}
																className="rounded-md p-1 hover:bg-black/10"
															>
																<Reply className="h-3.5 w-3.5" />
															</button>
														) : null}
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
														{(() => {
															const loc = getMessageLocation(message);
															const body = message.body as any;
															const hasText = body && typeof body.text === "string" && body.text.trim().length > 0;
															if (!loc && !hasText) return null;

															return (
																<>
																	<button
																		type="button"
																		onClick={() => void handleCopy(message)}
																		className="rounded-md border border-black/20 px-2 py-1 transition hover:bg-black/10"
																	>
																		{t("chat.actions.copy", { defaultValue: "Copy" })}
																	</button>
																	
																	{!mine ? (
																		<button
																			type="button"
																			onClick={() => {
																				const wordToBan = window.prompt(
																					t("chat.actions.ban_word_prompt", {
																						defaultValue:
																							"Trim this message down to the specific keyword you want to ban:",
																					}),
																					hasText ? body.text : "",
																				);
																				if (wordToBan && wordToBan.trim()) {
																					const currentList = window.localStorage.getItem("fg-forbidden-words") || "";
																					const newList = currentList ? `${currentList}, ${wordToBan.trim()}` : wordToBan.trim();
																					window.localStorage.setItem("fg-forbidden-words", newList);
																					toast.success(
																						t("chat.actions.ban_word_added", {
																							defaultValue:
																								"Added \"{{word}}\" to forbidden keywords!",
																							word: wordToBan.trim(),
																						}),
																					);
																					setOpenMessageActionId(null);
																				}
																			}}
																			className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-500 transition hover:bg-red-500/20"
																		>
																			{t("chat.actions.ban_word", { defaultValue: "Ban word" })}
																		</button>
																	) : null}
																</>
															);
														})()}
                                                        

                                                        {/* --- DOWNLOAD BUTTON (DESKTOP) --- */}
																	{imageUrl || videoUrl || audioUrl ? (
																		<button
																			type="button"
																			onClick={() => {
																				const url = imageUrl || videoUrl || audioUrl;
																				if (!url) return;
																				const a = document.createElement("a");
																				a.href = url;
																				a.download = `media-${Date.now()}`;
																				a.target = "_blank";
																				document.body.appendChild(a);
																				a.click();
																				document.body.removeChild(a);
																				setOpenMessageActionId(null);
																			}}
																			className="rounded-md border border-black/20 px-2 py-1 transition hover:bg-black/10"
																		>
																			{t("chat.actions.download", { defaultValue: "Download" })}
																		</button>
																	) : null}
																	{/* --------------------------------- */}

														{mine && !message.unsent ? (
															<button
																type="button"
																onClick={() => void handleUnsend(message)}
																disabled={
																	isMutatingMessageId === message.messageId
																}
																className="rounded-md border border-black/20 px-2 py-1"
															>
																{t("chat.actions.unsend")}
															</button>
														) : null}
														{mine && isAlbumMessage && albumId && (message.body as any)?.isViewable ? (
															<button
																type="button"
																onClick={() => void handleStopAlbumShare(albumId)}
																disabled={isMutatingMessageId === message.messageId}
																className="rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-orange-400 transition hover:bg-orange-500/20"
															>
																{t("chat.actions.stop_sharing", { defaultValue: "Stop Sharing" })}
															</button>
														) : null}
														<button
															type="button"
															onClick={() => void handleDelete(message)}
															disabled={isMutatingMessageId === message.messageId}
															className="rounded-md border border-black/20 px-2 py-1"
														>
															{t("chat.actions.delete")}
														</button>
													</div>
												) : null}

												{failed ? (
													<button
														type="button"
														onClick={(event) => { event.stopPropagation(); handleRetry(message); }}
														className="mt-1 rounded-lg bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] px-2 py-1 text-[11px] font-semibold"
													>
														{t("chat.retry")}
													</button>
												) : null}
											</div>

											{mine && !pending && !failed && lastMyMessageId === message.messageId && (
												<div className="-mt-1 px-1">
													<span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)] opacity-80">
														{threadLastReadTimestamp != null && message.timestamp <= threadLastReadTimestamp
															? t("chat.read")
															: t("chat.unread")}
													</span>
												</div>
											)}
										</div>
									</div>
						            </Fragment>
                                );
                            });
                        })()}
						</div>
						<div ref={threadBottomRef} className="h-24 shrink-0" />
		</div>
	);
}
