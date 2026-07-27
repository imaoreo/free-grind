import { Archive, BellOff, Eye, EyeOff, Home, Loader2, MessageCircle, Pin, PinOff, Star, Trash2, Zap } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatSearchPanel } from "./ChatSearchPanel";
import { ChatInboxHeader, type ChatInboxHeaderProps } from "./ChatInboxHeader";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { ProfileImage } from "../../../components/ui/profile-image";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import type { ConversationEntry } from "../../../types/messages";
import type { ChatContactIndexRecord } from "../../../types/chat-contact-index";
import { FreeGrindBadge } from "../../../components/FreeGrindBadge";
import { PullToRefreshContainer } from "../components/PullToRefreshContainer";
import {
	formatConversationTime,
	getOtherParticipant,
	getParticipantAvatarUrl,
	getParticipantOnlineMeta,
	getPreviewText,
} from "../chat/chatUtils";
import { isReadReceiptsHidden, useReadReceiptsChanged } from "../../../utils/privacy";
import {
	SKIP_DELETE_CONVERSATION_CONFIRM_KEY,
	isDeleteConversationConfirmSkipped,
} from "../../../utils/blockConfirm";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { useAvatarCache } from "../../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { useInboxSyncStatus } from "../../../hooks/useInboxSyncStatus";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../../config/design-config";

/** Footer bar below the chat list's scroll area (not inside it) — reads as
 * part of the list (same border/background as a conversation row) rather
 * than a floating pill, and lives outside the scrolling region entirely so
 * conversation rows never scroll behind/through it. Desktop-only: there's no
 * fixed bottom nav to clear here, so a plain footer row works; on mobile the
 * fixed bottom nav bar leaves no clean spot for it, so that gets a minimal
 * caption in the header instead (ChatSyncHeaderCaption in ChatInboxHeader).
 * Only rendered while a sync is actually in flight; idle/done/error states
 * show nothing here (Settings > Data has those). */
function ChatSyncFooterRow({ userId }: { userId: number | null }) {
	const { t } = useTranslation();
	const status = useInboxSyncStatus(userId);

	if (status.phase !== "syncing_list" && status.phase !== "syncing_messages") {
		return null;
	}

	const progressPercent =
		status.phase === "syncing_messages" && status.total > 0
			? Math.round((status.completed / status.total) * 100)
			: null;

	const label =
		status.phase === "syncing_list"
			? t("chat.sync_progress.syncing_list", {
					defaultValue: "Syncing chats… {{count}} checked",
					count: status.conversationsSoFar,
				})
			: t("chat.sync_progress.syncing_messages_percent", {
					defaultValue: "Syncing messages… {{percent}}%",
					percent: progressPercent ?? 0,
				});

	return (
		<div className="z-20 flex shrink-0 items-center gap-3 border-t border-[var(--surface-2)] bg-[var(--surface)] px-4 py-3">
			<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-xs font-medium text-[var(--text-muted)]">{label}</p>
				<div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
					<div
						className={
							progressPercent == null
								? "h-full w-2/5 animate-progress-indeterminate rounded-full bg-[var(--accent)]"
								: "h-full rounded-full bg-[var(--accent)] transition-all duration-300"
						}
						style={progressPercent != null ? { width: `${progressPercent}%` } : undefined}
					/>
				</div>
			</div>
		</div>
	);
}

type ChatInboxPanelProps = ChatInboxHeaderProps & {
	isLoadingInbox: boolean;
	isLoadingMoreInbox: boolean;
	inboxError: string | null;
	filteredConversations: ConversationEntry[];
	archivedConversationIds: Set<string>;
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
	onOpenConversationById: (conversationId: string) => void;
	onViewProfile: (profileId: number) => void;
	typingConversationIds?: Set<string>;
	onTogglePinConversation: (conversationId: string, isPinned: boolean) => void | Promise<void>;
	hiddenConversationIds: Set<string>;
	onToggleHideConversation: (conversationId: string, isHidden: boolean) => void;
	onDeleteConversation: (conversationId: string) => void | Promise<void>;
	onDeleteConversationLocal: (conversationId: string) => void | Promise<void>;
	isDeletingConversationId: string | null;
};

type ChatConversationRowProps = {
	conversation: ConversationEntry;
	userId: number | null;
	localNicknamesByProfileId: Record<string, string>;
	chatContactIndexByProfileId: Record<string, ChatContactIndexRecord>;
	nowTimestamp: number;
	presenceResults: Record<string, boolean>;
	isSelected: boolean;
	isTyping: boolean;
	isArchived: boolean;
	isDesktop: boolean;
	onSelectConversation: (c: ConversationEntry) => void;
	onViewProfile: (profileId: number) => void;
	onOpenContextMenu: (conversation: ConversationEntry, isArchived: boolean, x: number, y: number) => void;
	onSwipePin: (conversation: ConversationEntry) => void;
	onSwipeDeleteRequest: (conversation: ConversationEntry, isArchived: boolean) => void;
};

// Pinning is a server-side flag on a live conversation — it doesn't make
// sense (and the API has nothing to target) once we've locally archived a
// conversation the server can no longer produce.
function ConversationContextMenu({
	conversation,
	isArchived,
	isHidden,
	x,
	y,
	onClose,
	onTogglePin,
	onToggleHide,
	onDelete,
}: {
	conversation: ConversationEntry;
	isArchived: boolean;
	isHidden: boolean;
	x: number;
	y: number;
	onClose: () => void;
	onTogglePin: () => void;
	onToggleHide: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ top: y, left: x });

	useLayoutEffect(() => {
		const menu = menuRef.current;
		if (!menu) return;
		const rect = menu.getBoundingClientRect();
		const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
		const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
		setPosition({ left: Math.min(x, maxLeft), top: Math.min(y, maxTop) });
	}, [x, y]);

	useEffect(() => {
		const handlePointerDown = (event: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
				onClose();
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("mousedown", handlePointerDown, true);
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("scroll", onClose, true);
		window.addEventListener("resize", onClose);
		return () => {
			window.removeEventListener("mousedown", handlePointerDown, true);
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("scroll", onClose, true);
			window.removeEventListener("resize", onClose);
		};
	}, [onClose]);

	const isPinned = conversation.data.pinned;

	// Portal to <body> — the list sits inside PullToRefreshContainer, which
	// applies a `transform` to its content wrapper (even at rest, translateY(0)
	// counts). That establishes a new containing block for `position: fixed`
	// descendants, so without the portal this menu would be positioned and
	// clipped relative to that wrapper instead of the viewport.
	return createPortal(
		<div
			ref={menuRef}
			style={{ top: position.top, left: position.left }}
			className="fixed z-[70] min-w-[190px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-2xl"
		>
			{!isArchived && (
				<button
					type="button"
					onClick={onTogglePin}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
				>
					{isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
					{isPinned ? t("chat.unpin") : t("chat.pin")}
				</button>
			)}
			<button
				type="button"
				onClick={onToggleHide}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
			>
				{isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
				{isHidden
					? t("chat.unhide_conversation", { defaultValue: "Unhide" })
					: t("chat.hide_conversation", { defaultValue: "Hide" })}
			</button>
			<button
				type="button"
				onClick={onDelete}
				className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition hover:bg-[var(--surface-2)]"
			>
				<Trash2 className="h-4 w-4" />
				{t("chat.delete_conversation")}
			</button>
		</div>,
		document.body,
	);
}

function ChatConversationRow({
	conversation,
	userId,
	localNicknamesByProfileId,
	chatContactIndexByProfileId,
	nowTimestamp,
	presenceResults,
	isSelected,
	isTyping,
	isArchived,
	isDesktop,
	onSelectConversation,
	onViewProfile,
	onOpenContextMenu,
	onSwipePin,
	onSwipeDeleteRequest,
}: ChatConversationRowProps) {
	const { t } = useTranslation();
	const { showDebugInfo } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();
	useAvatarCache();

	const contentRef = useRef<HTMLDivElement | null>(null);
	const pinIconRef = useRef<HTMLDivElement | null>(null);
	const deleteIconRef = useRef<HTMLDivElement | null>(null);
	const swipeStateRef = useRef<{
		startX: number;
		startY: number;
		dx: number;
		armed: boolean;
		lock: "pending" | "horizontal" | "vertical";
	} | null>(null);
	const suppressClickRef = useRef(false);

	const SWIPE_THRESHOLD = 60;
	const SWIPE_MAX_DRAG = 96;
	const DIRECTION_LOCK_DISTANCE = 8;

	const resetSwipeVisual = () => {
		const content = contentRef.current;
		if (content) {
			content.style.transition = "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease";
			content.style.transform = "translateX(0px)";
			content.style.boxShadow = "none";
		}
		for (const icon of [pinIconRef.current, deleteIconRef.current]) {
			if (!icon) continue;
			icon.style.transition = "opacity 0.2s, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)";
			icon.style.opacity = "0";
			icon.style.transform = "scale(0.5)";
		}
	};

	const handleTouchStart = (event: React.TouchEvent) => {
		if (isDesktop || event.touches.length !== 1) {
			swipeStateRef.current = null;
			return;
		}
		const touch = event.touches[0];
		swipeStateRef.current = { startX: touch.clientX, startY: touch.clientY, dx: 0, armed: false, lock: "pending" };
	};

	const handleTouchMove = (event: React.TouchEvent) => {
		if (isDesktop || event.touches.length !== 1) return;
		const state = swipeStateRef.current;
		if (!state || state.lock === "vertical") return;

		const touch = event.touches[0];
		const rawDx = touch.clientX - state.startX;
		const rawDy = touch.clientY - state.startY;

		if (state.lock === "pending") {
			if (Math.max(Math.abs(rawDx), Math.abs(rawDy)) < DIRECTION_LOCK_DISTANCE) return;
			// Whichever axis moved further decides the gesture — once it's a
			// vertical scroll we stop touching the row entirely so scrolling
			// the list can never leave a swipe "armed" for the next touchend.
			state.lock = Math.abs(rawDy) > Math.abs(rawDx) ? "vertical" : "horizontal";
			if (state.lock === "vertical") return;
		}
		// Pinning isn't available for archived conversations, so don't let a
		// right-swipe reveal an action that would silently do nothing.
		if (rawDx > 0 && isArchived) return;

		const dx = Math.max(-SWIPE_MAX_DRAG, Math.min(SWIPE_MAX_DRAG, rawDx));
		state.dx = dx;

		const content = contentRef.current;
		if (content && dx !== 0) {
			content.style.transition = "none";
			content.style.transform = `translateX(${dx}px)`;
			content.style.boxShadow =
				"-8px 0 16px -4px rgba(0, 0, 0, 0.35), 8px 0 16px -4px rgba(0, 0, 0, 0.35)";
		}
		const activeIcon = dx > 0 ? pinIconRef.current : deleteIconRef.current;
		const inactiveIcon = dx > 0 ? deleteIconRef.current : pinIconRef.current;
		if (inactiveIcon) inactiveIcon.style.opacity = "0";
		if (activeIcon) {
			const progress = Math.min(Math.abs(dx) / 40, 1);
			activeIcon.style.transition = "none";
			activeIcon.style.opacity = String(progress);
			activeIcon.style.transform = `scale(${0.5 + progress * 0.5})`;
		}

		const isArmed = Math.abs(dx) > SWIPE_THRESHOLD;
		if (isArmed !== state.armed) {
			state.armed = isArmed;
			if (isArmed) {
				(window as unknown as { FreeGrindBridge?: { vibrate?: (ms: number) => void } }).FreeGrindBridge
					?.vibrate?.(15) ?? navigator.vibrate?.(15);
			}
		}
	};

	const handleTouchEnd = () => {
		const state = swipeStateRef.current;
		swipeStateRef.current = null;
		if (!state) return;

		if (Math.abs(state.dx) > 8) {
			suppressClickRef.current = true;
		}
		resetSwipeVisual();
		if (!state.armed) return;

		if (state.dx > 0) {
			onSwipePin(conversation);
		} else {
			onSwipeDeleteRequest(conversation, isArchived);
		}
	};

	const handleTouchCancel = () => {
		swipeStateRef.current = null;
		resetSwipeVisual();
	};

	const handleClick = () => {
		if (suppressClickRef.current) {
			suppressClickRef.current = false;
			return;
		}
		onSelectConversation(conversation);
	};

	const handleContextMenu = (event: React.MouseEvent) => {
		if (!isDesktop) return;
		event.preventDefault();
		onOpenContextMenu(conversation, isArchived, event.clientX, event.clientY);
	};

	const otherParticipant = getOtherParticipant(conversation, userId);
	const otherProfileId = otherParticipant?.profileId ? String(otherParticipant.profileId) : null;
	const localNickname = otherProfileId ? localNicknamesByProfileId[otherProfileId] : null;
	const displayName = localNickname || conversation.data.name || t("common.unknown_display_name");
	const otherParticipantOnlineMeta = getParticipantOnlineMeta(
		otherParticipant?.lastOnline,
		otherParticipant?.onlineUntil,
		nowTimestamp,
		t,
	);
	const isOtherParticipantOnline = otherParticipantOnlineMeta.isOnline;
	const databaseUnread = otherProfileId ? chatContactIndexByProfileId[otherProfileId]?.unreadCount ?? 0 : 0;
	const apiUnread = conversation.data.unreadCount;
	const readReceiptsHidden = isReadReceiptsHidden(conversation.data.conversationId);

	return (
		<div ref={ref} className={`relative overflow-hidden ${revealClass}`}>
			<div className="pointer-events-none absolute inset-0 flex items-center justify-between px-6">
				<div
					ref={pinIconRef}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-3)]"
					style={{ opacity: 0, transform: "scale(0.5)" }}
				>
					<Pin className="h-4 w-4 text-[var(--accent)]" />
				</div>
				<div
					ref={deleteIconRef}
					className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-3)]"
					style={{ opacity: 0, transform: "scale(0.5)" }}
				>
					<Trash2 className="h-4 w-4 text-red-500" />
				</div>
			</div>
			<div
				ref={contentRef}
				onClick={handleClick}
				onContextMenu={handleContextMenu}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
				onTouchMove={handleTouchMove}
				onTouchCancel={handleTouchCancel}
				style={{
					touchAction: "pan-y",
					...(isSelected
						? { borderLeft: "2px solid var(--accent)", paddingLeft: "14px" }
						: { paddingLeft: "16px" }),
				}}
				className="no-touch-callout relative flex cursor-pointer items-center gap-4 border-b border-[var(--surface-2)] py-3 pr-4 text-left transition"
			>
					<button
						type="button"
						title={displayName}
						aria-label={displayName}
						onClick={(e) => {
							e.stopPropagation();
							if (isArchived) return;
							if (otherParticipant?.profileId) onViewProfile(otherParticipant.profileId);
						}}
						disabled={isArchived}
						className="relative shrink-0 disabled:cursor-default disabled:opacity-80"
					>
						<div className="h-14 w-14 squircle bg-[var(--surface-2)] drop-shadow-sm">
							<ProfileImage
								src={resolveAvatarSrc(
									otherParticipant?.primaryMediaHash,
									getParticipantAvatarUrl(otherParticipant?.primaryMediaHash),
								)}
								alt={displayName}
								className={isArchived ? "grayscale" : undefined}
							/>
						</div>
						{isArchived ? (
							<span
								title={t("chat.archived.badge", { defaultValue: "Archived" })}
								className="absolute -bottom-0.5 -right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] border-[var(--bg)] bg-[var(--surface-2)] shadow-sm"
							>
								<Archive className="h-2.5 w-2.5 text-[var(--text-muted)]" />
							</span>
						) : (
							isOtherParticipantOnline && (
								<span className="absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-[1.5px] border-[var(--bg)] bg-green-500 shadow-sm" />
							)
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
								{conversation.data.muted && (
									<span title={t("chat.muted")}>
										<BellOff className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
									</span>
								)}
								{conversation.data.favorite && (
									<span title={t("chat.favorite")}>
										<Star className="h-3.5 w-3.5 shrink-0 fill-current text-[var(--accent)]" />
									</span>
								)}
								{conversation.data.rightNow === "HOSTING" && (
									<span title={t("right_now.hosting")}>
										<Home className="h-3.5 w-3.5 shrink-0 text-[var(--right-now)]" />
									</span>
								)}
								{conversation.data.rightNow === "NOT_HOSTING" && (
									<span title={t("right_now.not_hosting", { defaultValue: "Right Now" })}>
										<Zap className="h-3.5 w-3.5 shrink-0 text-[var(--right-now)]" />
									</span>
								)}
								{readReceiptsHidden && (
									<span title={t("privacy.read_receipts_hidden_badge")}>
										<EyeOff className="h-3.5 w-3.5 shrink-0 text-purple-400" />
									</span>
								)}
								{otherParticipant?.profileId && presenceResults[otherParticipant.profileId] ? (
									<FreeGrindBadge size="sm" variant="bare" title={t("profile_details.uses_free_grind")} />
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
								{isTyping ? (
									<span className="italic text-[var(--accent)]">{t("chat.typing")}</span>
								) : (
									getPreviewText(conversation, t)
								)}
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
					</div>
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
	pinnedFilter,
	hasActiveInboxFilters,
	activeFilterCount,
	filteredConversations,
	archivedConversationIds,
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
	onSetIsSearchOpen,
	onSetSearchQuery,
	onSetIsFiltersOpen,
	onSetFiltersDraft,
	onRefreshInbox,
	onLoadMoreInbox,
	onSelectConversation,
	onOpenConversationById,
	onViewProfile,
	onClearInboxFilters,
	onToggleFavoritesOnly,
	onToggleUnreadOnly,
	onToggleRightNowOnly,
	onToggleOnlineNowOnly,
	archivedFilter,
	hiddenFilter,
	needsReplyOnly,
	typingConversationIds,
	onTogglePinConversation,
	hiddenConversationIds,
	onToggleHideConversation,
	onDeleteConversation,
	onDeleteConversationLocal,
	isDeletingConversationId,
}: ChatInboxPanelProps) {
	const { t } = useTranslation();
	useReadReceiptsChanged();
	const lastScrollAtRef = useRef(0);
	const lastRequestedPageRef = useRef<number | null>(null);
	const [contextMenuState, setContextMenuState] = useState<{
		conversation: ConversationEntry;
		isArchived: boolean;
		x: number;
		y: number;
	} | null>(null);
	const [deleteConfirmState, setDeleteConfirmState] = useState<{
		conversation: ConversationEntry;
		isArchived: boolean;
	} | null>(null);
	const [dontAskDeleteAgain, setDontAskDeleteAgain] = useState(false);

	const requestDeleteConversation = (conversation: ConversationEntry, isArchived: boolean) => {
		if (isDeleteConversationConfirmSkipped()) {
			if (isArchived) {
				void onDeleteConversationLocal(conversation.data.conversationId);
			} else {
				void onDeleteConversation(conversation.data.conversationId);
			}
			return;
		}
		setDontAskDeleteAgain(false);
		setDeleteConfirmState({ conversation, isArchived });
	};

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

	// Virtualized rows — the list can hold the user's entire local chat
	// history (see inboxSync.ts's background sync), potentially thousands of
	// conversations, so only what's actually in view (plus a small overscan
	// buffer) is ever mounted. estimateSize is a rough guess at a row's
	// resting height; measureElement (wired below, on each row's wrapper)
	// corrects it once a row's real height is known, so variable-height rows
	// (wrapping preview text, badges, etc.) still lay out correctly.
	const rowVirtualizer = useVirtualizer({
		count: filteredConversations.length,
		getScrollElement: () => inboxListRef.current,
		estimateSize: () => 78,
		overscan: 8,
		getItemKey: (index) => filteredConversations[index]?.data.conversationId ?? index,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	const lastVirtualItemIndex = virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;

	// Load-more trigger — fires once virtualization has actually rendered a
	// row at (or past) the end of what's currently loaded, i.e. the user has
	// scrolled to the bottom, replacing the old IntersectionObserver+sentinel
	// approach (a sentinel row's ref would otherwise only ever attach once
	// virtualization decided to mount that row in the first place).
	useEffect(() => {
		if (!nextPage || isLoadingMoreInbox) {
			return;
		}
		if (lastVirtualItemIndex < filteredConversations.length - 1) {
			return;
		}
		if (lastRequestedPageRef.current === nextPage) {
			return;
		}
		lastRequestedPageRef.current = nextPage;
		onLoadMoreInbox();
	}, [lastVirtualItemIndex, filteredConversations.length, isLoadingMoreInbox, nextPage, onLoadMoreInbox]);

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
					userId={userId}
					realtimeStatusMeta={realtimeStatusMeta}
					inboxFilters={inboxFilters}
					pinnedFilter={pinnedFilter}
					hasActiveInboxFilters={hasActiveInboxFilters}
					activeFilterCount={activeFilterCount}
					isSearchOpen={isSearchOpen}
					searchQuery={searchQuery}
					onSetIsSearchOpen={onSetIsSearchOpen}
					onSetSearchQuery={onSetSearchQuery}
					onSetIsFiltersOpen={onSetIsFiltersOpen}
					onSetFiltersDraft={onSetFiltersDraft}
					onToggleFavoritesOnly={onToggleFavoritesOnly}
					onToggleUnreadOnly={onToggleUnreadOnly}
					onToggleRightNowOnly={onToggleRightNowOnly}
					onToggleOnlineNowOnly={onToggleOnlineNowOnly}
					onClearInboxFilters={onClearInboxFilters}
					archivedFilter={archivedFilter}
					hiddenFilter={hiddenFilter}
					needsReplyOnly={needsReplyOnly}
				/>
			)}

			{isSearchOpen ? (
				<ChatSearchPanel
					isDesktop={isDesktop}
					searchQuery={searchQuery}
					onClose={() => { onSetIsSearchOpen(false); onSetSearchQuery(""); }}
					onOpenConversationById={onOpenConversationById}
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
											<div className="h-14 w-14 shrink-0 squircle animate-pulse bg-[var(--surface-2)]" />
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
									<div
										style={{
											position: "relative",
											width: "100%",
											height: rowVirtualizer.getTotalSize(),
										}}
									>
										{virtualItems.map((virtualRow) => {
											const conversation = filteredConversations[virtualRow.index];
											if (!conversation) {
												return null;
											}
											return (
												<div
													key={virtualRow.key}
													data-index={virtualRow.index}
													ref={rowVirtualizer.measureElement}
													style={{
														position: "absolute",
														top: 0,
														left: 0,
														width: "100%",
														transform: `translateY(${virtualRow.start}px)`,
													}}
												>
													<ChatConversationRow
														conversation={conversation}
														userId={userId}
														localNicknamesByProfileId={localNicknamesByProfileId}
														chatContactIndexByProfileId={chatContactIndexByProfileId}
														nowTimestamp={nowTimestamp}
														presenceResults={presenceResults}
														isSelected={conversation.data.conversationId === selectedConversationId}
														isTyping={typingConversationIds?.has(conversation.data.conversationId) ?? false}
														isArchived={archivedConversationIds.has(conversation.data.conversationId)}
														isDesktop={isDesktop}
														onSelectConversation={onSelectConversation}
														onViewProfile={onViewProfile}
														onOpenContextMenu={(c, isArchived, x, y) =>
															setContextMenuState({ conversation: c, isArchived, x, y })
														}
														onSwipePin={(c) => void onTogglePinConversation(c.data.conversationId, c.data.pinned)}
														onSwipeDeleteRequest={requestDeleteConversation}
													/>
												</div>
											);
										})}
									</div>

									{nextPage && isLoadingMoreInbox ? (
										<p className="px-3 py-2 text-center text-xs text-[var(--text-muted)]">
											{t("chat.loading")}
										</p>
									) : null}
								</>
							)}
						</div>
					</div>
				</div>
			)}

			{isDesktop && !isSearchOpen && <ChatSyncFooterRow userId={userId} />}

			{contextMenuState ? (
				<ConversationContextMenu
					conversation={contextMenuState.conversation}
					isArchived={contextMenuState.isArchived}
					isHidden={hiddenConversationIds.has(contextMenuState.conversation.data.conversationId)}
					x={contextMenuState.x}
					y={contextMenuState.y}
					onClose={() => setContextMenuState(null)}
					onTogglePin={() => {
						const { conversation } = contextMenuState;
						setContextMenuState(null);
						void onTogglePinConversation(conversation.data.conversationId, conversation.data.pinned);
					}}
					onToggleHide={() => {
						const { conversation } = contextMenuState;
						setContextMenuState(null);
						onToggleHideConversation(
							conversation.data.conversationId,
							hiddenConversationIds.has(conversation.data.conversationId),
						);
					}}
					onDelete={() => {
						setContextMenuState(null);
						requestDeleteConversation(contextMenuState.conversation, contextMenuState.isArchived);
					}}
				/>
			) : null}

			<ConfirmDialog
				isOpen={deleteConfirmState !== null}
				title={t("chat.delete_conversation")}
				message={t("chat.delete_conversation_confirm")}
				confirmLabel={t("chat.delete_conversation")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={() => {
					if (!deleteConfirmState) return;
					const { conversation, isArchived } = deleteConfirmState;
					if (dontAskDeleteAgain && typeof window !== "undefined") {
						localStorage.setItem(SKIP_DELETE_CONVERSATION_CONFIRM_KEY, "true");
					}
					setDeleteConfirmState(null);
					if (isArchived) {
						void onDeleteConversationLocal(conversation.data.conversationId);
					} else {
						void onDeleteConversation(conversation.data.conversationId);
					}
				}}
				onCancel={() => setDeleteConfirmState(null)}
				isProcessing={
					deleteConfirmState != null &&
					isDeletingConversationId === deleteConfirmState.conversation.data.conversationId
				}
				confirmTone="danger"
				dontAskAgainLabel={t("profile_details.dont_ask_again")}
				dontAskAgainChecked={dontAskDeleteAgain}
				onDontAskAgainChange={setDontAskDeleteAgain}
			/>
		</PullToRefreshContainer>
	);
}
