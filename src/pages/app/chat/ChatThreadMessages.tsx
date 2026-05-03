import { Album, Ellipsis } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationEntry, Message } from "../../../types/messages";
import type { UiMessage } from "../../../types/chat-page";
import { Avatar } from "../../../components/ui/avatar";
import blankProfileImage from "../../../images/blank-profile.png";
import freegrindLogo from "../../../images/freegrind-logo.webp";
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
	messageElementRefs: { current: Map<string, HTMLDivElement> };
	handleMessageTap: (message: Message) => void | Promise<void>;
	startMessageLongPress: (messageId: string) => void;
	endMessageLongPress: () => void;
	messageLongPressTriggeredRef: { current: boolean };
	openFullScreenImage: (imageUrl: string) => void;
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
	threadBottomRef: { current: HTMLDivElement | null };
};

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
	threadBottomRef,
}: ChatThreadMessagesProps) {
	const { t } = useTranslation();

	return (
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
								const albumId = getMessageAlbumId(message);
								const albumCover = getMessageAlbumCoverUrl(message);
								const messageText = getMessageText(message, t);
								const isExpiringImage = message.type === "ExpiringImage";
								const isAlbumMessage =
									message.type === "Album" ||
									message.type === "ExpiringAlbum" ||
									message.type === "ExpiringAlbumV2";
								const isImageOnlyBubble =
									Boolean(imageUrl) && messageText === t("chat.thread.shared_image");
								const isAlbumOnlyBubble =
									isAlbumMessage && messageText === t("chat.preview.shared_album");
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
									? t("chat.you")
									: selectedConversation.data.name?.trim() || t("chat.unknown");
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
													{t("chat.thread.from_local_history")}
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
														alt={t("chat.thread.shared_alt")}
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
																	    alt={t("chat.thread.taken_on_grindr")}
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
															alt={t("chat.thread.album_cover")}
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
															alt={t("chat.thread.album_cover")}
															className="mb-2 h-36 w-full rounded-lg object-cover"
														/>
													) : null}
													<div className="flex items-center justify-between gap-2">
														<span className="text-xs font-medium">
															{t("chat.thread.album_share")}
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
															{t("chat.open")}
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
															{t("chat.actions.unsend")}
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
													onClick={() => handleRetry(message)}
													className="mt-1 rounded-lg bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] px-2 py-1 text-[11px] font-semibold"
												>
													{t("chat.retry")}
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
	);
}
