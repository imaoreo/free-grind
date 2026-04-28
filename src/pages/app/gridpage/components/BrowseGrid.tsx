import type { BrowseCard } from "../../GridPage.types";
import { BrowseCardTile } from "./BrowseCardTile";
import { usePreferences } from "../../../../contexts/PreferencesContext";
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
	/**
	 * We use percentages (33.4% for 2 cols, 25.1% for 3 cols) instead of fixed pixels
	 * to strictly enforce the column count on mobile devices.
	 *
	 * Since 3 * 33.4% > 100%, it prevents a 3rd column from appearing.
	 * Since 4 * 25.1% > 100%, it prevents a 4th column from appearing.
	 *
	 * This approach is superior to fixed pixels because it remains consistent across
	 * all screen sizes and prevents layout shifts when the grid gap is set to 0.
	 */
	const minmaxValue = mobileGridColumns === "2" ? "33.4%" : "25.1%";

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
			<div className="w-full grid gap-0" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))` }}>
				{cards.map((card) => (
					<BrowseCardTile
						key={card.profileId}
						card={card}
						onSelectProfile={onSelectProfile}
						onMessageProfile={onMessageProfile}
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
