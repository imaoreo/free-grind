import { Heart, Loader2, MessageCircle, Pin, PinOff, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, type RefObject, type TouchEventHandler } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { ProfileImage } from "../../../components/ui/profile-image";
import type { ConversationEntry, InboxFilters } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { InboxAlbumsTabs } from "../components/InboxAlbumsTabs";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import {
	buildChatFiltersDraft,
	formatConversationTime,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getPreviewText,
} from "../chat/chatUtils";
import { isChatGhosted } from "../../../utils/privacy";

type RealtimeStatusMeta = {
	className: string;
	symbol: string;
	label: string;
};

type ChatInboxPanelProps = {
	isDesktop: boolean;
	isLoadingInbox: boolean;
	isLoadingMoreInbox: boolean;
	inboxError: string | null;
	inboxFilters: InboxFilters;
	hidePinned: boolean;
	hasActiveInboxFilters: boolean;
	filteredConversations: ConversationEntry[];
	nextPage: number | null;
	realtimeStatusMeta: RealtimeStatusMeta;
	selectedConversationId: string | null;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	inboxListRef: RefObject<HTMLDivElement | null>;
	onRefreshInbox: () => void;
	onLoadMoreInbox: () => void;
	onInboxTouchStart: TouchEventHandler<HTMLDivElement>;
	onInboxTouchEnd: TouchEventHandler<HTMLDivElement>;
	onSelectConversation: (conversation: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
	onClearInboxFilters: () => void;
	onToggleHidePinned: () => void;
	onToggleFavoritesOnly: () => void;
	onOpenFilters: (filtersDraft: ReturnType<typeof buildChatFiltersDraft>) => void;
	onOpenSearch: () => void;
	onOpenInbox: () => void;
	onOpenAlbums: () => void;
};

export function ChatInboxPanel({
	isDesktop,
	isLoadingInbox,
	isLoadingMoreInbox,
	inboxError,
	inboxFilters,
	hidePinned,
	hasActiveInboxFilters,
	filteredConversations,
	nextPage,
	realtimeStatusMeta,
	selectedConversationId,
	userId,
	localNicknamesByProfileId,
	chatContactIndexByProfileId,
	nowTimestamp,
	presenceResults,
	inboxListRef,
	onRefreshInbox,
	onLoadMoreInbox,
	onInboxTouchStart,
	onInboxTouchEnd,
	onSelectConversation,
	onViewProfile,
	onToggleHidePinned,
	onToggleFavoritesOnly,
	onOpenFilters,
	onOpenSearch,
	onOpenInbox,
	onOpenAlbums,
}: ChatInboxPanelProps) {
	const { t, i18n } = useTranslation();
	const { showDebugInfo } = usePreferences();
	const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
	const lastScrollAtRef = useRef(0);
	const lastRequestedPageRef = useRef<number | null>(null);

	const markUserScroll = () => {
		lastScrollAtRef.current = Date.now();
	};

	useEffect(() => {
		const handleWindowScroll = () => {
			lastScrollAtRef.current = Date.now();
		};

		window.addEventListener("scroll", handleWindowScroll, { passive: true });
		window.addEventListener("touchmove", handleWindowScroll, { passive: true });

		return () => {
			window.removeEventListener("scroll", handleWindowScroll);
			window.removeEventListener("touchmove", handleWindowScroll);
		};
	}, []);

	useEffect(() => {
		const sentinel = loadMoreSentinelRef.current;
		if (!sentinel || !nextPage) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (!entry?.isIntersecting) {
					return;
				}

				if (isLoadingMoreInbox) {
					return;
				}

				if (lastRequestedPageRef.current === nextPage) {
					return;
				}

				lastRequestedPageRef.current = nextPage;
				onLoadMoreInbox();
			},
			{ root: null, rootMargin: "0px 0px 400px 0px", threshold: 0 },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [filteredConversations.length, isLoadingMoreInbox, nextPage, onLoadMoreInbox]);

	const activeFilterCount = [
		inboxFilters.unreadOnly,
		inboxFilters.chemistryOnly,
		inboxFilters.favoritesOnly,
		inboxFilters.rightNowOnly,
		inboxFilters.onlineNowOnly,
		inboxFilters.distanceMeters !== null && inboxFilters.distanceMeters !== undefined,
		(inboxFilters.positions?.length ?? 0) > 0,
	].filter(Boolean).length;

	return (
		<PullToRefreshContainer
			className={`flex h-full min-h-0 flex-col overflow-hidden ${
				isDesktop ? "surface-card" : "p-0"
			}`}
			contentClassName="flex flex-1 flex-col min-h-0"
			style={
				!isDesktop
					? { paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))" }
					: undefined
			}
			onRefresh={onRefreshInbox}
			isDisabled={isLoadingInbox || isLoadingMoreInbox}
			isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("chat.refreshing_inbox")}
			onTouchStartExtra={onInboxTouchStart}
			onTouchEndExtra={onInboxTouchEnd}
		>
			<div
				className={`relative flex shrink-0 flex-col ${isDesktop ? "p-4 border-b border-[var(--border)]" : "px-[var(--app-px)] pb-3"}`}
			>
				{!isDesktop && <PageHeaderBackground color="var(--accent)" />}
				<div className="flex items-center justify-between gap-2">
					<InboxAlbumsTabs
						activeTab="inbox"
						onInboxClick={onOpenInbox}
						onAlbumsClick={onOpenAlbums}
						inboxDotColor={
							realtimeStatusMeta.symbol === "✓"
								? "oklch(0.72 0.18 142)"
								: realtimeStatusMeta.className.includes("red")
									? "oklch(0.65 0.22 25)"
									: "oklch(0.75 0.17 75)"
						}
					/>
					<div className="flex shrink-0 items-center gap-1">
						<button
							type="button"
							onClick={onToggleFavoritesOnly}
							className={`rounded-xl border p-2 transition ${inboxFilters.favoritesOnly ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"}`}
							aria-label={t("browse_filters.options.favorites")}
							title={t("browse_filters.options.favorites")}
						>
							<Heart className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={onToggleHidePinned}
							className={`rounded-xl border border-[var(--border)] p-2 transition hover:border-[var(--accent)] ${
								hidePinned
									? "bg-[var(--surface-2)] text-[var(--text)]"
									: "text-[var(--text-muted)] hover:text-[var(--text)]"
							}`}
							aria-label={hidePinned ? t("chat.show_pinned") : t("chat.hide_pinned")}
						>
							{hidePinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
						</button>
						<button
							type="button"
							onClick={() => onOpenFilters(buildChatFiltersDraft(inboxFilters))}
							className="relative rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							aria-label={t("chat.open_filters")}
						>
							<SlidersHorizontal className="h-4 w-4" />
							{hasActiveInboxFilters && activeFilterCount > 0 ? (
								<span className="absolute -bottom-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-contrast)] shadow-sm ring-2 ring-[var(--surface)]">
									{activeFilterCount}
								</span>
							) : null}
						</button>
						<button
							type="button"
							onClick={onOpenSearch}
							className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							aria-label={t("chat.open_search")}
						>
							<Search className="h-4 w-4" />
						</button>
					</div>
				</div>
			</div>

			{isLoadingInbox ? (
				<div className="flex flex-1 items-center justify-center text-[var(--text-muted)]">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("chat.loading_inbox")}
				</div>
			) : inboxError ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
					<p className="text-sm text-[var(--text-muted)]">{inboxError}</p>
					<button
						type="button"
						onClick={onRefreshInbox}
						className="btn-accent px-4 py-2 text-sm"
					>
						{t("chat.retry")}
					</button>
				</div>
			) : filteredConversations.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-[var(--text-muted)]">
					<MessageCircle className="h-8 w-8" />
					<p className="text-sm">
						{hasActiveInboxFilters
							? t("chat.no_conversations_match")
							: t("chat.no_conversations")}
					</p>
				</div>
			) : (
				<div
					ref={inboxListRef}
					onScroll={markUserScroll}
					data-lenis-prevent
					className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${!isDesktop ? "pb-4" : "gap-0"}`}
				>
					{filteredConversations.map((conversation) => {
						const otherParticipant = getOtherParticipant(conversation, userId);
						const otherProfileId = otherParticipant?.profileId
							? String(otherParticipant.profileId)
							: null;
						const localNickname = otherProfileId
							? localNicknamesByProfileId[otherProfileId]
							: null;
						const displayName =
							localNickname || conversation.data.name || t("chat.unknown");
						const otherParticipantOnlineMeta = getParticipantOnlineMeta(
							otherParticipant?.lastOnline,
							otherParticipant?.onlineUntil,
							nowTimestamp,
							t,
						);
						const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
						const isSelected =
							conversation.data.conversationId === selectedConversationId;

										const databaseUnread = otherProfileId ? chatContactIndexByProfileId[otherProfileId]?.unreadCount ?? 0 : 0;
										const apiUnread = conversation.data.unreadCount;

										return (
											<div
												key={conversation.data.conversationId}
												onClick={() => onSelectConversation(conversation)}
												className={`flex h-24 w-full shrink-0 cursor-pointer items-stretch overflow-hidden text-left transition ${
													isSelected
														? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md"
														: isChatGhosted(conversation.data.conversationId)
															? "bg-[color-mix(in_srgb,var(--surface-2)_40%,transparent)] shadow-[inset_4px_0_0_0_rgba(168,85,247,0.5)]" 
															: "bg-[var(--surface)]"
												} border-b border-[var(--border)] ${
													isSelected && isDesktop ? "border-b-[var(--accent-contrast)]/20" : ""
												}`}
											>
												<button
													type="button"
													title={displayName}
													aria-label={displayName}
													onClick={(event) => {
														event.stopPropagation();
														if (otherParticipant?.profileId) {
															onViewProfile(otherParticipant.profileId);
														}
													}}
													className={`relative w-24 shrink-0 transition-all ${
														isSelected
															? "bg-[color-mix(in_srgb,var(--accent-contrast)_10%,transparent)]"
															: "bg-[var(--surface-2)]"
													} ${
														isOtherParticipantOnline
															? "border-r-4 border-emerald-500"
															: `border-r ${isSelected ? "border-[var(--accent-contrast)]/10" : "border-[var(--border)]"}`
													}`}
												>
													<ProfileImage
														src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
														alt={displayName}
													/>
													{conversation.data.pinned ? (
														<div className="absolute right-0.5 top-1 rounded-full bg-black/40 p-1 text-white backdrop-blur-sm">
															<Pin className="h-3 w-3 fill-current" />
														</div>
													) : null}
												</button>
												<div className="min-w-0 flex-1 p-3">
													<div className="flex items-center justify-between gap-2">
														<div className="flex min-w-0 items-center gap-1">
															<p className="truncate font-semibold">{displayName}</p>
															{otherParticipant?.profileId &&
															presenceResults[otherParticipant.profileId] ? (
																<img
																	src={freegrindLogo}
																	alt="Free Grind user"
																	title={t("profile_details.uses_free_grind")}
																	className={`h-4 w-4 shrink-0 rounded-full border ${
																		isSelected
																			? "border-[var(--accent-contrast)]/20"
																			: "border-[var(--border)]"
																	}`}
																/>
															) : null}
														</div>
														<span
															className={`text-xs ${
																isSelected
																	? "text-[var(--accent-contrast)]/70"
																	: "text-[var(--text-muted)]"
															}`}
														>
															{formatConversationTime(
																conversation.data.lastActivityTimestamp,
																i18n.language,
															)}
														</span>
													</div>
													<div className="flex items-center justify-between gap-2">
														<p
															className={`mt-0.5 truncate ${
																conversation.data.unreadCount > 0
																	? isSelected
																		? "font-bold text-[var(--accent-contrast)]"
																		: "font-bold text-[var(--text)]"
																	: isSelected
																		? "text-[var(--accent-contrast)]/80"
																		: "text-[var(--text-muted)]"
															}`}
														>
															{getPreviewText(conversation, t)}
														</p>
														{conversation.data.unreadCount > 0 ? (
															<span
																className={`flex min-w-[20px] flex-col items-center justify-center rounded-full px-1 py-0.5 font-bold shadow-sm ${
																	isSelected
																		? "bg-[var(--accent-contrast)] text-[var(--accent)]"
																		: "bg-[var(--accent)] text-[var(--accent-contrast)]"
																} ${showDebugInfo ? "min-h-[28px]" : "h-5"}`}
															>
																<span className={showDebugInfo ? "text-[12px] leading-tight" : "text-[12px]"}>
																	{conversation.data.unreadCount}
																</span>
																{showDebugInfo && (
																	<span className="text-[7px] leading-tight opacity-80">
																		db:{databaseUnread} a:{apiUnread}
																	</span>
																)}
															</span>
														) : null}
													</div>
									<div className="mt-2 flex items-center gap-2">
										{conversation.data.muted ? (
											<span
												className={`rounded-lg px-2 py-1 text-xs ${
													isSelected
														? "bg-[var(--accent-contrast)]/10 text-[var(--accent-contrast)]"
														: "bg-[var(--surface-2)] text-[var(--text-muted)]"
												}`}
											>
												{t("chat.muted")}
											</span>
										) : null}
									</div>
								</div>
											</div>
						);
					})}

					{nextPage ? (
						<div className="px-3 py-2">
							<div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden="true" />
							{isLoadingMoreInbox ? (
								<p className="text-center text-xs text-[var(--text-muted)]">
									{t("chat.loading")}
								</p>
							) : null}
						</div>
					) : null}
				</div>
			)}
		</PullToRefreshContainer>
	);
}
