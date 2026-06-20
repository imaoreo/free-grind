import { Ban, Images, Pin, PinOff, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import { buildChatFiltersDraft, type ChatFiltersDraft } from "./chatUtils";
import { cn } from "../../../utils/cn";
import type { InboxFilters } from "../../../types/messages";
import type { SearchMode } from "../../../types/chat-page";

type RealtimeStatusMeta = { className: string; symbol: string; label: string };

export type ChatInboxHeaderProps = {
	isDesktop: boolean;
	realtimeStatusMeta: RealtimeStatusMeta;
	inboxFilters: InboxFilters;
	hidePinned: boolean;
	hasActiveInboxFilters: boolean;
	activeFilterCount: number;
	isSearchOpen: boolean;
	searchQuery: string;
	searchMode: SearchMode;
	onSetIsSearchOpen: (v: boolean) => void;
	onSetSearchQuery: (v: string) => void;
	onSetSearchMode: (v: SearchMode) => void;
	onSetIsFiltersOpen: (v: boolean) => void;
	onSetFiltersDraft: (v: ChatFiltersDraft) => void;
	onToggleFavoritesOnly: () => void;
	onToggleHidePinned: () => void;
	blockedMeCount?: number;
};

export function ChatInboxHeader({
	isDesktop,
	realtimeStatusMeta,
	inboxFilters,
	hidePinned,
	hasActiveInboxFilters,
	activeFilterCount,
	isSearchOpen,
	searchQuery,
	searchMode,
	onSetIsSearchOpen,
	onSetSearchQuery,
	onSetSearchMode,
	onSetIsFiltersOpen,
	onSetFiltersDraft,
	onToggleFavoritesOnly,
	onToggleHidePinned,
	blockedMeCount = 0,
}: ChatInboxHeaderProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();

	return (
		<header className="relative z-20 shrink-0 pointer-events-none">
				<PageHeaderBackground color="var(--accent)" />

				<div className={`pointer-events-auto flex flex-col gap-3 mx-auto w-full px-[var(--app-px)] ${isDesktop ? "max-w-6xl" : ""}`}>

					{/* Row 1: title + icon buttons */}
					<div className="flex items-center justify-between gap-2">
						<h1 className="app-title relative">
							{t("nav.inbox")}
							<span
								className="absolute -top-0.5 -right-2.5 h-2 w-2 rounded-full transition-colors duration-500"
								style={{
									backgroundColor:
										realtimeStatusMeta.symbol === "✓"
											? "oklch(0.72 0.18 142)"
											: realtimeStatusMeta.className.includes("red")
												? "oklch(0.65 0.22 25)"
												: "oklch(0.75 0.17 75)",
								}}
							/>
						</h1>

						<div className="flex shrink-0 items-center gap-0.5">
							{!isSearchOpen && (
								<button
									type="button"
									onClick={() => navigate("/chat/blocked-me")}
									className="relative rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									aria-label={t("chat.blocked_me.title", { defaultValue: "Blocked you" })}
								>
									<Ban className="h-5 w-5" />
									{blockedMeCount > 0 && (
										<span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold leading-none text-white">
											{blockedMeCount > 9 ? "9+" : blockedMeCount}
										</span>
									)}
								</button>
							)}
							{!isSearchOpen && (
								<button
									type="button"
									onClick={() => navigate("/chat/albums")}
									className="-mr-1 rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									aria-label={t("chat.tabs.albums")}
								>
									<Images className="h-5 w-5" />
								</button>
							)}
							<button
								type="button"
								onClick={() => {
									if (isSearchOpen) { onSetIsSearchOpen(false); onSetSearchQuery(""); }
									else onSetIsSearchOpen(true);
								}}
								className="rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--text)]"
								aria-label={isSearchOpen ? t("common.close") : t("chat.open_search")}
							>
								{isSearchOpen ? <X className="h-5 w-5" /> : <Search className="h-5 w-5" />}
							</button>
						</div>
					</div>

					{/* Row 2: filter pills */}
					{!isSearchOpen && (
						<div className="flex flex-wrap items-center gap-2 pb-4">
							<button
								type="button"
								onClick={onToggleFavoritesOnly}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95",
									inboxFilters.favoritesOnly
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!inboxFilters.favoritesOnly ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								<Star className="h-3.5 w-3.5" />
								{t("browse_filters.options.favorites")}
							</button>

							<button
								type="button"
								onClick={onToggleHidePinned}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95",
									hidePinned
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!hidePinned ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								{hidePinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
								{t("chat.pinned")}
							</button>

							<button
								type="button"
								onClick={() => { onSetFiltersDraft(buildChatFiltersDraft(inboxFilters)); onSetIsFiltersOpen(true); }}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95",
									hasActiveInboxFilters
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!hasActiveInboxFilters ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								<SlidersHorizontal className="h-3.5 w-3.5" />
								{t("right_now.filters")}
								{hasActiveInboxFilters && activeFilterCount > 0 && (
									<span className="ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/25 px-1 text-[9px] font-bold">
										{activeFilterCount}
									</span>
								)}
							</button>
						</div>
					)}

					{/* Row 2: search input */}
					{isSearchOpen && (
						<div className="flex flex-col gap-2 pb-4">
							<div className="relative">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
								<input
									autoFocus
									value={searchQuery}
									onChange={(e) => onSetSearchQuery(e.target.value)}
									placeholder={t("chat_search.placeholder")}
									className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--surface-2)] pl-9 pr-8 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)]"
								/>
								{searchQuery && (
									<button
										type="button"
										onClick={() => onSetSearchQuery("")}
										className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
							<div className="flex gap-1.5">
								{(["messages", "conversations", "profiles"] as const).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => onSetSearchMode(mode)}
										className={cn(
											"rounded-full border px-3 py-1 text-xs font-bold transition",
											searchMode === mode
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]",
										)}
									>
										{t(`chat_search.modes.${mode}`)}
									</button>
								))}
							</div>
						</div>
					)}


				</div>
		</header>
	);
}
