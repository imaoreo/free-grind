import { Loader2, MessageCircle, Search, SlidersHorizontal } from "lucide-react";
import type { RefObject, TouchEventHandler } from "react";
import { useTranslation } from "react-i18next";
import type { ConversationEntry, InboxFilters } from "../../../types/messages";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { InboxAlbumsTabs } from "../components/InboxAlbumsTabs";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import {
	buildChatFiltersDraft,
	formatConversationTime,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getPreviewText,
} from "../chat/chatUtils";

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
	hasActiveInboxFilters: boolean;
	filteredConversations: ConversationEntry[];
	nextPage: number | null;
	realtimeStatusMeta: RealtimeStatusMeta;
	selectedConversationId: string | null;
	userId: number | null;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	inboxListRef: RefObject<HTMLDivElement | null>;
	onRefreshInbox: () => void;
	onLoadMoreInbox: () => void;
	onInboxTouchStart: TouchEventHandler<HTMLDivElement>;
	onInboxTouchEnd: TouchEventHandler<HTMLDivElement>;
	onSelectConversation: (conversation: ConversationEntry) => void;
	onClearInboxFilters: () => void;
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
	hasActiveInboxFilters,
	filteredConversations,
	nextPage,
	realtimeStatusMeta,
	selectedConversationId,
	userId,
	nowTimestamp,
	presenceResults,
	inboxListRef,
	onRefreshInbox,
	onLoadMoreInbox,
	onInboxTouchStart,
	onInboxTouchEnd,
	onSelectConversation,
	onClearInboxFilters,
	onOpenFilters,
	onOpenSearch,
	onOpenInbox,
	onOpenAlbums,
}: ChatInboxPanelProps) {
	const { t, i18n } = useTranslation();

	return (
		<PullToRefreshContainer
			className={`flex h-full flex-col overflow-hidden p-3 sm:p-4 ${
				isDesktop ? "surface-card" : ""
			}`}
			onRefresh={onRefreshInbox}
			isDisabled={isLoadingInbox || isLoadingMoreInbox}
			isAtTop={() => (inboxListRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("chat.refreshing_inbox")}
			onTouchStartExtra={onInboxTouchStart}
			onTouchEndExtra={onInboxTouchEnd}
		>
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<InboxAlbumsTabs
						activeTab="inbox"
						onInboxClick={onOpenInbox}
						onAlbumsClick={onOpenAlbums}
						trailing={
							<span
								className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${realtimeStatusMeta.className}`}
							>
								<span className="leading-none">{realtimeStatusMeta.symbol}</span>
								<span>{realtimeStatusMeta.label}</span>
							</span>
						}
					/>
					<p className="app-subtitle mt-1">{t("chat.your_conversations")}</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => onOpenFilters(buildChatFiltersDraft(inboxFilters))}
						className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						aria-label={t("chat.open_filters")}
					>
						<SlidersHorizontal className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={onOpenSearch}
						className="rounded-xl border border-[var(--border)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						aria-label={t("chat.open_search")}
					>
						<Search className="h-4 w-4" />
					</button>
					{hasActiveInboxFilters ? (
						<button
							type="button"
							onClick={onClearInboxFilters}
							className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						>
							{t("chat.clear_filters")}
						</button>
					) : null}
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
				<div ref={inboxListRef} className="flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
					{filteredConversations.map((conversation) => {
						const otherParticipant = getOtherParticipant(conversation, userId);
						const otherParticipantOnlineMeta = getParticipantOnlineMeta(
							otherParticipant?.lastOnline,
							otherParticipant?.onlineUntil,
							nowTimestamp,
						);
						const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
						const isSelected =
							conversation.data.conversationId === selectedConversationId;

						return (
							<button
								type="button"
								key={conversation.data.conversationId}
								onClick={() => onSelectConversation(conversation)}
								className={`w-full rounded-2xl border p-3 text-left transition ${
									isSelected
										? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))]"
										: "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]"
								}`}
							>
								<div className="flex items-start gap-3">
									<div
										title={otherParticipantOnlineMeta.label}
										className={`h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 bg-[var(--surface-2)] ${
											isOtherParticipantOnline
												? "border-emerald-500 shadow-[0_0_0_2px_color-mix(in_srgb,var(--surface)_70%,transparent)]"
												: "border-[var(--border)]"
										}`}
									>
										<img
											src={getParticipantAvatarUrl(otherParticipant?.primaryMediaHash)}
											alt={conversation.data.name || t("chat.profile")}
											className="h-full w-full object-cover"
										/>
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center justify-between gap-2">
											<div className="flex min-w-0 items-center gap-1">
												<p className="truncate font-semibold">
													{conversation.data.name || t("chat.unknown")}
												</p>
												{otherParticipant?.profileId &&
												presenceResults[otherParticipant.profileId] ? (
													<img
														src={freegrindLogo}
														alt="Free Grind user"
														title={t("profile_details.uses_free_grind")}
														className="h-4 w-4 shrink-0 rounded-full border border-[var(--border)]"
													/>
												) : null}
											</div>
											<span className="text-xs text-[var(--text-muted)]">
												{formatConversationTime(
													conversation.data.lastActivityTimestamp,
													i18n.language,
												)}
											</span>
										</div>
										<p className="mt-1 truncate text-sm text-[var(--text-muted)]">
											{getPreviewText(conversation, t)}
										</p>
										<div className="mt-2 flex items-center gap-2">
											{conversation.data.pinned ? (
												<span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">
													{t("chat.pinned")}
												</span>
											) : null}
											{conversation.data.muted ? (
												<span className="rounded-lg bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">
													{t("chat.muted")}
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
							onClick={onLoadMoreInbox}
							disabled={isLoadingMoreInbox}
							className="mt-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)] transition hover:border-[var(--accent)] disabled:opacity-60"
						>
							{isLoadingMoreInbox ? t("chat.loading") : t("chat.load_more")}
						</button>
					) : null}
				</div>
			)}
		</PullToRefreshContainer>
	);
}
