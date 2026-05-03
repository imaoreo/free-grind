import {
	Ellipsis,
	ImagePlus,
	Loader2,
	Pin,
	Share2,
	Volume2,
	VolumeX,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NavigateFunction } from "react-router-dom";
import type { AlbumListItem, AlbumViewerState, UiMessage } from "../../../types/chat-page";
import type { ConversationEntry, Message } from "../../../types/messages";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import {
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
} from "./chatUtils";
import { formatDistance } from "../gridpage/utils";
import { ChatThreadMessages } from "./ChatThreadMessages";

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
	handleSend: (event: React.FormEvent<HTMLFormElement>) => void;
	toggleAlbumPicker: () => void;
	attachmentInputRef: { current: HTMLInputElement | null };
	onAttachmentInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
	isUploadingAttachment: boolean;
	pendingAttachmentFile: File | null;
	attachmentLooping: boolean;
	attachmentTakenOnGrindr: boolean;
	setAttachmentLooping: (value: boolean) => void;
	setAttachmentTakenOnGrindr: (value: boolean) => void;
	confirmPendingAttachment: () => void;
	cancelPendingAttachment: () => void;
	isAlbumPickerOpen: boolean;
	isLoadingAlbums: boolean;
	shareableAlbums: AlbumListItem[];
	isSharingAlbum: boolean;
	shareAlbumToCurrentConversation: (albumId: number) => void | Promise<void>;
	uploadProgress: number;
	draft: string;
	setDraft: (value: string) => void;
	isSending: boolean;
	selectedActionMessage: UiMessage | null;
	selectedActionMessageMine: boolean;
	albumViewer: AlbumViewerState | null;
};

export function ChatThreadPanel(props: ChatThreadPanelProps) {
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
		handleSend,
		toggleAlbumPicker,
		attachmentInputRef,
		onAttachmentInput,
		isUploadingAttachment,
		pendingAttachmentFile,
		attachmentLooping,
		attachmentTakenOnGrindr,
		setAttachmentLooping,
		setAttachmentTakenOnGrindr,
		confirmPendingAttachment,
		cancelPendingAttachment,
		isAlbumPickerOpen,
		isLoadingAlbums,
		shareableAlbums,
		isSharingAlbum,
		shareAlbumToCurrentConversation,
		uploadProgress,
		draft,
		setDraft,
		isSending,
		selectedActionMessage,
		selectedActionMessageMine,
		albumViewer,
	} = props;
	const { t } = useTranslation();
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
				const otherParticipantOnlineMeta = getParticipantOnlineMeta(
					otherParticipant?.lastOnline,
					otherParticipant?.onlineUntil,
					nowTimestamp,
				);
				const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
				const distanceLabel = otherParticipant?.distanceMetres
					? formatDistance(otherParticipant.distanceMetres)
					: null;
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
								title={otherParticipantOnlineMeta.label}
								className={`h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-[var(--surface-2)] transition disabled:cursor-default disabled:opacity-80 ${
									isOtherParticipantOnline
										? "border-emerald-500 shadow-[0_0_0_2px_color-mix(in_srgb,var(--surface)_70%,transparent)] hover:border-emerald-400"
										: "border-[var(--border)] hover:border-[var(--accent)]"
								}`}
							>
								<img
									src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
										alt={selectedConversation.data.name || t("chat.profile")}
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
									{distanceLabel
										? `${otherParticipantOnlineMeta.label} · ${distanceLabel}`
										: otherParticipantOnlineMeta.label}
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
					/>

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
								<Share2 className="mr-1 inline h-3.5 w-3.5" /> {t("chat.share_album")}
							</button>
							<button
								type="button"
								onClick={() => attachmentInputRef.current?.click()}
								disabled={isUploadingAttachment}
								className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> {t("chat.attach_media")}
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
								{t("chat.manage_albums")}
							</button>
						</div>

						{pendingAttachmentFile ? (
							<div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
								<p className="text-xs font-medium text-[var(--text)]">
									{t("chat.attachments.ready_to_send", { file: pendingAttachmentFile.name })}
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
										<span>{t("chat.attachments.looping")}</span>
									</label>
									<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
										<input
											type="checkbox"
											checked={attachmentTakenOnGrindr}
											onChange={(event) =>
												setAttachmentTakenOnGrindr(event.target.checked)
											}
										/>
										<span>{t("chat.attachments.taken_on_grindr")}</span>
									</label>
								</div>
								<div className="mt-3 flex gap-2">
									<button
										type="button"
										onClick={confirmPendingAttachment}
										disabled={isUploadingAttachment}
										className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
									>
										{t("chat.attachments.send_attachment")}
									</button>
									<button
										type="button"
										onClick={cancelPendingAttachment}
										disabled={isUploadingAttachment}
										className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
									>
										{t("chat.actions.cancel")}
									</button>
								</div>
							</div>
						) : null}

						{isAlbumPickerOpen ? (
							<div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-2">
								{isLoadingAlbums ? (
									<div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
										<Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("chat.loading_albums")}
									</div>
								) : shareableAlbums.length === 0 ? (
									<p className="text-xs text-[var(--text-muted)]">
										{t("chat.no_albums_available")}
									</p>
								) : (
									<div className="grid gap-2 sm:grid-cols-2">
										{shareableAlbums.map((album) => (
											<div
												key={album.albumId}
												className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
											>
												<p className="truncate text-xs font-medium">
													{album.albumName || t("chat.album_fallback", { id: album.albumId })}
												</p>
												<button
													type="button"
													onClick={() =>
														void shareAlbumToCurrentConversation(album.albumId)
													}
													disabled={!album.isShareable || isSharingAlbum}
													className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] disabled:opacity-50"
												>
													{t("chat.share")}
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
									<span>{t("chat.attachments.uploading")}</span>
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
								placeholder={t("chat.write_message")}
								className="input-field min-h-[56px] resize-none"
							/>
							<button
								type="submit"
								disabled={isSending || draft.trim().length === 0}
								className="btn-accent h-11 shrink-0 px-4 text-sm"
							>
								{isSending ? t("chat.sending") : t("chat.send")}
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
									{t("chat.actions.title")}
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
											{t("chat.actions.unsend")}
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
				<p className="text-lg font-semibold">{t("chat.new_conversation.title")}</p>
				<p className="text-sm text-[var(--text-muted)]">
					{t("chat.new_conversation.subtitle", { profileId: targetProfileId })}
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
						<ImagePlus className="mr-1 inline h-3.5 w-3.5" /> {t("chat.attach_media")}
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
							{t("chat.attachments.ready_to_send", { file: pendingAttachmentFile.name })}
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
								<span>{t("chat.attachments.looping")}</span>
							</label>
							<label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
								<input
									type="checkbox"
									checked={attachmentTakenOnGrindr}
									onChange={(event) =>
										setAttachmentTakenOnGrindr(event.target.checked)
									}
								/>
								<span>{t("chat.attachments.taken_on_grindr")}</span>
							</label>
						</div>
						<div className="mt-3 flex gap-2">
							<button
								type="button"
								onClick={confirmPendingAttachment}
								disabled={isUploadingAttachment}
								className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
							>
								{t("chat.attachments.send_attachment")}
							</button>
							<button
								type="button"
								onClick={cancelPendingAttachment}
								disabled={isUploadingAttachment}
								className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
							>
								{t("chat.actions.cancel")}
							</button>
						</div>
					</div>
				) : null}

				{isUploadingAttachment || uploadProgress > 0 ? (
					<div className="mb-2">
						<div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
							<span>{t("chat.attachments.uploading")}</span>
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
						placeholder={t("chat.new_conversation.write_first_message")}
						className="input-field min-h-[56px] resize-none"
					/>
					<button
						type="submit"
						disabled={isSending || draft.trim().length === 0}
						className="btn-accent h-11 shrink-0 px-4 text-sm"
					>
						{isSending ? t("chat.sending") : t("chat.send")}
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
			{t("chat.select_conversation")}
		</div>
	);


	return renderThread;
}
