import { Ghost, MessageCircle, Pin } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatInboxHeader, type ChatInboxHeaderProps } from "./ChatInboxHeader";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { ProfileImage } from "../../../components/ui/profile-image";
import type { ConversationEntry } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import {
	formatConversationTime,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getPreviewText,
} from "../chat/chatUtils";
import { isChatGhosted } from "../../../utils/privacy";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../../config/design-config";

type ChatInboxPanelProps = ChatInboxHeaderProps & {
	isLoadingInbox: boolean;
	isLoadingMoreInbox: boolean;
	inboxError: string | null;
	filteredConversations: ConversationEntry[];
	nextPage: number | null;
	selectedConversationId: string | null;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	inboxListRef: RefObject<HTMLDivElement | null>;
	showHeader: boolean;
	onRefreshInbox: () => Promise<void>;
	onLoadMoreInbox: () => void;
	onSelectConversation: (conversation: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
	onClearInboxFilters: () => void;
};

type ChatConversationRowProps = {
	conversation: ConversationEntry;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	isSelected: boolean;
	onSelectConversation: (c: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
};

function ChatConversationRow({
	conversation,
	userId,
	localNicknamesByProfileId,
	chatContactIndexByProfileId,
	nowTimestamp,
	presenceResults,
	isSelected,
	onSelectConversation,
	onViewProfile,
}: ChatConversationRowProps) {
	const { t } = useTranslation();
	const { showDebugInfo } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();

	const otherParticipant = getOtherParticipant(conversation, userId);
	const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : null;
	const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
	const displayName = localNickname || conversation.data.name || t("chat.unknown");
	const otherParticipantOnlineMeta = getParticipantOnlineMeta(
		otherParticipant?.lastOnline,
		otherParticipant?.onlineUntil,
		nowTimestamp,
		t,
	);
	const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
	const databaseUnread = otherProfileId ? chatContactIndexByProfileId[otherProfileId]?.unreadCount ?? 0 : 0;
	const apiUnread = conversation.data.unreadCount;
	const isGhosted = isChatGhosted(conversation.data.conversationId);

	return (
		<div
			ref={ref}
			onClick={() => onSelectConversation(conversation)}
			style={isSelected ? { borderLeft: "2px solid var(--accent)", paddingLeft: "14px" } : { paddingLeft: "16px" }}
			className={`flex cursor-pointer items-center gap-4 border-b border-[var(--surface-2)] py-3 pr-4 text-left transition ${revealClass}`}
		>
			<button
				type="button"
				title={displayName}
				aria-label={displayName}
				onClick={(e) => {
					e.stopPropagation();
					if (otherParticipant?.profileId) onViewProfile(otherParticipant.profileId);
				}}
				className="relative shrink-0"
			>
				<div className="h-14 w-14 squircle bg-[var(--surface-2)] drop-shadow-sm">
					<ProfileImage
						src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
						alt={displayName}
					/>
				</div>
				{isOtherParticipantOnline && (
					<span className="absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-[1.5px] border-[var(--bg)] bg-green-500 shadow-sm" />
				)}
				{conversation.data.pinned ? (
					<div className="absolute -top-1 -right-1 rounded-full bg-black/40 p-0.5 text-white backdrop-blur-sm">
						<Pin className="h-2.5 w-2.5 fill-current" />
					</div>
				) : null}
			</button>

			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<p className="truncate text-sm font-semibold text-[var(--text)]">
							{displayName}
						</p>
						{isGhosted && (
							<Ghost className="h-3.5 w-3.5 shrink-0 text-purple-400" />
						)}
						{otherParticipant?.profileId && presenceResults[otherParticipant.profileId] ? (
							<img
								src={freegrindLogo}
								alt="Free Grind user"
								title={t("profile_details.uses_free_grind")}
								className="h-3.5 w-3.5 shrink-0 rounded-full border border-[var(--border)]"
							/>
						) : null}
					</div>
					<span className="shrink-0 text-xs text-[var(--text-muted)]">
						{formatConversationTime(conversation.data.lastActivityTimestamp)}
					</span>
				</div>

				<div className="mt-0.5 flex items-center justify-between gap-2">
					<p className={`truncate text-sm ${
						conversation.data.unreadCount > 0 ? "font-semibold text-[var(--text)]" : "text-[var(--text-muted)]"
					}`}>
						{getPreviewText(conversation, t)}
					</p>
					{conversation.data.unreadCount > 0 ? (
						<span className={`flex min-w-[20px] shrink-0 flex-col items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--accent-contrast)] shadow-sm ${showDebugInfo ? "min-h-[28px]" : ""}`}>
							<span>{conversation.data.unreadCount}</span>
							{showDebugInfo && (
								<span className="text-[7px] leading-tight opacity-80">
									db:{databaseUnread} a:{apiUnread}
								</span>
							)}
						</span>
					) : null}
				</div>

				{conversation.data.muted ? (
					<span className="mt-1 inline-block rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
						{t("chat.muted")}
					</span>
				) : null}
			</div>
		</div>
	);
}

export function ChatInboxPanel({
	isDesktop,
	isLoadingInbox,
	isLoadingMoreInbox,
	inboxError,
	inboxFilters,
	hidePinned,
	hasActiveInboxFilters,
	activeFilterCount,
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
	showHeader,
	isSearchOpen,
	searchQuery,
	searchMode,
	onSetIsSearchOpen,
	onSetSearchQuery,
	onSetSearchMode,
	onSetIsFiltersOpen,
	onSetFiltersDraft,
	onRefreshInbox,
	onLoadMoreInbox,
	onSelectConversation,
	onViewProfile,
	onClearInboxFilters: _onClearInboxFilters,
	onToggleHidePinned,
	onToggleFavoritesOnly,
}: ChatInboxPanelProps) {
	const { t } = useTranslation();
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

	return (
		<PullToRefreshContainer
			className={`flex min-h-0 flex-col overflow-hidden ${
				isDesktop ? "surface-card h-full" : "h-dvh p-0"
			}`}
			contentClassName="flex flex-1 flex-col min-h-0"
			style={
				!isDesktop
					? { paddingTop: "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))" }
					: undefined
			}
			onRefresh={onRefreshInbox}
			isDisabled={isLoadingInbox || isLoadingMoreInbox || isSearchOpen}
			isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("chat.refreshing_inbox")}
		>
			{showHeader && (
				<ChatInboxHeader
					isDesktop={isDesktop}
					realtimeStatusMeta={realtimeStatusMeta}
					inboxFilters={inboxFilters}
					hidePinned={hidePinned}
					hasActiveInboxFilters={hasActiveInboxFilters}
					activeFilterCount={activeFilterCount}
					isSearchOpen={isSearchOpen}
					searchQuery={searchQuery}
					searchMode={searchMode}
					onSetIsSearchOpen={onSetIsSearchOpen}
					onSetSearchQuery={onSetSearchQuery}
					onSetSearchMode={onSetSearchMode}
					onSetIsFiltersOpen={onSetIsFiltersOpen}
					onSetFiltersDraft={onSetFiltersDraft}
					onToggleFavoritesOnly={onToggleFavoritesOnly}
					onToggleHidePinned={onToggleHidePinned}
				/>
			)}

			{isSearchOpen ? (
				<ChatSearchPanel
					isDesktop={isDesktop}
					searchQuery={searchQuery}
					searchMode={searchMode}
					onClose={() => { onSetIsSearchOpen(false); onSetSearchQuery(""); }}
					onViewProfile={onViewProfile}
				/>
			) : (
				<div
					className="relative flex-1 min-h-0"
					style={!isDesktop ? { marginTop: `-${FEED_HEADER_OFFSET}` } : undefined}
				>
					<div
						ref={inboxListRef}
						onScroll={markUserScroll}
						data-lenis-prevent
						className="h-full overflow-y-auto"
						style={!isDesktop ? {
							paddingTop: FEED_HEADER_OFFSET,
							maskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
							WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
						} : undefined}
					>
						<div className={!isDesktop ? "pb-[calc(env(safe-area-inset-bottom,0px)+clamp(92px,10vw,114px)+16px)]" : ""}>
							{isLoadingInbox ? (
								<div className="flex flex-col">
									{Array.from({ length: 12 }).map((_, i) => (
										<div key={i} className="flex items-center gap-4 border-b border-[var(--surface-2)] py-3 px-4">
											<div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
											<div className="flex flex-1 flex-col gap-2">
												<div className="flex items-center justify-between gap-3">
													<div className="h-3 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
													<div className="h-2.5 w-10 animate-pulse rounded-full bg-[var(--border)]" />
												</div>
												<div className="h-2.5 w-40 animate-pulse rounded-full bg-[var(--border)]" />
											</div>
										</div>
									))}
								</div>
							) : inboxError ? (
								<div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
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
								<div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-[var(--text-muted)]">
									<MessageCircle className="h-8 w-8" />
									<p className="text-sm">
										{hasActiveInboxFilters
											? t("chat.no_conversations_match")
											: t("chat.no_conversations")}
									</p>
								</div>
							) : (
								<>
									{filteredConversations.map((conversation) => (
										<ChatConversationRow
											key={conversation.data.conversationId}
											conversation={conversation}
											userId={userId}
											localNicknamesByProfileId={localNicknamesByProfileId}
											chatContactIndexByProfileId={chatContactIndexByProfileId}
											nowTimestamp={nowTimestamp}
											presenceResults={presenceResults}
											isSelected={conversation.data.conversationId === selectedConversationId}
											onSelectConversation={onSelectConversation}
											onViewProfile={onViewProfile}
										/>
									))}

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
								</>
							)}
						</div>
					</div>
				</div>
			)}
		</PullToRefreshContainer>
	);
}
