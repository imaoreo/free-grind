import type { BrowseCard } from "../../GridPage.types";
import { BrowseCardTile } from "./BrowseCardTile";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { cn } from "../../../../utils/cn";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	EmptyState,
	ErrorState,
} from "../../../../components/ui/states";
import { getAsyncState } from "../../../../hooks/useAsyncViewState";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";

function BrowseGridSkeleton({ isDesktop, mobileColumns }: { isDesktop: boolean; mobileColumns: "2" | "3" }) {
	const count = isDesktop ? 30 : mobileColumns === "2" ? 16 : 24;
	return (
		<div
			className={cn("w-full grid", isDesktop ? "gap-2 px-[var(--app-px)]" : "gap-px")}
			style={{
				gridTemplateColumns: isDesktop
					? "repeat(6, minmax(0, 1fr))"
					: mobileColumns === "2"
						? "repeat(auto-fill, minmax(clamp(33.4%, 15vw, 250px), 1fr))"
						: "repeat(auto-fill, minmax(clamp(25.1%, 15vw, 250px), 1fr))",
			}}
		>
			{Array.from({ length: count }).map((_, i) => (
				<div
					key={i}
					className={cn(
						"animate-pulse bg-[var(--surface-2)] relative aspect-[5/5] overflow-hidden",
						!isDesktop && "rounded-[4px]",
						isDesktop && "rounded-xl",
					)}
				>
					<div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/30 to-transparent p-2 flex flex-col gap-1.5">
						<div className="h-2.5 w-16 rounded-full bg-white/20" />
					</div>
					<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/30 to-transparent p-2 flex gap-1">
						<div className="h-2 w-8 rounded-full bg-white/20" />
					</div>
				</div>
			))}
		</div>
	);
}

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
	const [isDesktop, setIsDesktop] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	});

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const query = window.matchMedia("(hover: hover) and (pointer: fine)");
		const update = () => setIsDesktop(query.matches);

		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

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
			<BrowseGridSkeleton isDesktop={isDesktop} mobileColumns={mobileGridColumns as "2" | "3"} />
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
					isDesktop ? "gap-2 px-[var(--app-px)]" : "gap-px",
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
