import type { BrowseCard } from "../../GridPage.types";
import { BrowseCardTile } from "./BrowseCardTile";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { cn } from "../../../../utils/cn";
import { useEffect, useState } from "react";
import {
	EmptyState,
	ErrorState,
	LoadingState,
} from "../../../../components/ui/states";
import { LoadMoreButton } from "../../../../components/ui/load-more-button";
import { getAsyncState } from "../../../../hooks/useAsyncViewState";

type BrowseGridProps = {
	isLoadingCards: boolean;
	cardsError: string | null;
	cards: BrowseCard[];
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
	onSelectProfile,
	onMessageProfile,
	hasMore,
	isLoadingMore,
	onLoadMore,
}: BrowseGridProps) {
	const { mobileGridColumns } = usePreferences();
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

	const viewState = getAsyncState(
		{ isLoading: isLoadingCards, error: cardsError, data: cards },
		cards.length === 0,
	);

	if (viewState === "loading") {
		return (
			/* Padding applied to maintain header alignment for non-grid states */
			<div className="w-full px-[var(--app-px)]">
				<LoadingState
					title="Loading nearby profiles"
					description="Fetching your local browse feed."
				/>
			</div>
		);
	}

	if (viewState === "error") {
		return (
			/* Padding applied to maintain header alignment for non-grid states */
			<div className="w-full px-[var(--app-px)]">
				<ErrorState
					title="Could not load browse feed"
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
					title="No nearby profiles returned"
					description="Try refreshing the feed after updating your location."
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
						onSelectProfile={onSelectProfile}
						onMessageProfile={onMessageProfile}
						isDesktop={isDesktop}
					/>
				))}
			</div>
			{hasMore && (
				/* Padding applied to prevent the button from touching the screen edges */
				<div className="flex justify-center px-[var(--app-px)] pb-8">
					<LoadMoreButton
						onClick={onLoadMore}
						loading={isLoadingMore}
						loadingLabel="Loading"
					/>
				</div>
			)}
		</div>
	);
}
