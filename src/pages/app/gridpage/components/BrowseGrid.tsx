import type { BrowseCard } from "../../GridPage.types";
import { BrowseCardTile } from "./BrowseCardTile";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { cn } from "../../../../utils/cn";
import { useDesktopBreakpoint } from "../../../../hooks/useDesktopBreakpoint";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	EmptyState,
	ErrorState,
	LoadingState,
} from "../../../../components/ui/states";
import { getAsyncState } from "../../../../hooks/useAsyncViewState";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";

type BrowseGridProps = {
	isLoadingCards: boolean;
	cardsError: string | null;
	cards: BrowseCard[];
	chatContactIndexByProfileId?: Record<string, ChatContactIndexRecord>;
	onSelectProfile: (profileId: string) => void;
	onMessageProfile: (profileId: string) => void;
	hasMore?: boolean;
	isLoadingMore?: boolean;
	onLoadMore?: () => void;
};

export function BrowseGrid({
	isLoadingCards,
	cardsError,
	cards,
	chatContactIndexByProfileId,
	onSelectProfile,
	onMessageProfile,
	hasMore,
	isLoadingMore,
	onLoadMore,
}: BrowseGridProps) {
	const { t } = useTranslation();
	const { mobileGridColumns } = usePreferences();
	const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
	const isDesktop = useDesktopBreakpoint();

	useEffect(() => {
		if (!hasMore || !onLoadMore) {
			return;
		}

		const sentinel = loadMoreSentinelRef.current;
		if (!sentinel) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) {
					return;
				}

				if (isLoadingMore) {
					return;
				}

				onLoadMore();
			},
			{ root: null, rootMargin: "0px 0px 280px 0px", threshold: 0 },
		);

		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [cards.length, hasMore, isLoadingMore, onLoadMore]);

	const viewState = getAsyncState(
		{ isLoading: isLoadingCards, error: cardsError, data: cards },
		cards.length === 0,
	);

	if (viewState === "loading") {
		return (
			/* Padding applied to maintain header alignment for non-grid states */
			<div className="w-full px-[var(--app-px)]">
				<LoadingState
					title={t("browse_page.loading_nearby")}
					description={t("browse_page.fetching_feed")}
				/>
			</div>
		);
	}

	if (viewState === "error") {
		return (
			/* Padding applied to maintain header alignment for non-grid states */
			<div className="w-full px-[var(--app-px)]">
				<ErrorState
					title={t("browse_page.error_load_feed")}
					description={cardsError ?? undefined}
				/>
			</div>
		);
	}

	if (viewState === "empty") {
		return (
			/* Padding applied to maintain header alignment for non-grid states */
			<div className="w-full px-[var(--app-px)]">
				<EmptyState
					title={t("browse_page.empty_title")}
					description={t("browse_page.empty_desc")}
				/>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col gap-4">
			<div
				className={cn(
					"w-full grid",
					isDesktop ? "gap-2 px-[var(--app-px)]" : "gap-0",
				)}
				style={{
					gridTemplateColumns: isDesktop
						? "repeat(6, minmax(0, 1fr))"
						: mobileGridColumns === "2"
							? "repeat(auto-fill,  minmax(clamp(33.4%, 15vw, 250px), 1fr))"
							: "repeat(auto-fill,  minmax(clamp(25.1%, 15vw, 250px), 1fr))",
				}}
			>
				{cards.map((card) => (
					<BrowseCardTile
						key={card.profileId}
						card={card}
						chatContactStatus={chatContactIndexByProfileId?.[card.profileId] ?? null}
						onSelectProfile={onSelectProfile}
						onMessageProfile={onMessageProfile}
						isDesktop={isDesktop}
					/>
				))}
			</div>
			{hasMore && (
				/* Sentinel triggers automatic pagination before the user reaches the end. */
				<div className="px-[var(--app-px)] pb-8">
					<div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden="true" />
					{isLoadingMore ? (
						<p className="text-center text-sm text-[var(--text-muted)]">
							{t("browse_page.loading")}
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}
