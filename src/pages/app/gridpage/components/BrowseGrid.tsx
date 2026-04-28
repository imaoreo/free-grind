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
	const minmaxValue = mobileGridColumns === "2" ? "130px" : "100px";

	const viewState = getAsyncState(
		{ isLoading: isLoadingCards, error: cardsError, data: cards },
		cards.length === 0,
	);

	if (viewState === "loading") {
		return (
			<LoadingState
				title="Loading nearby profiles"
				description="Fetching your local browse feed."
			/>
		);
	}

	if (viewState === "error") {
		return (
			<ErrorState
				title="Could not load browse feed"
				description={cardsError ?? undefined}
			/>
		);
	}

	if (viewState === "empty") {
		return (
			<EmptyState
				title="No nearby profiles returned"
				description="Try refreshing the feed after updating your location."
			/>
		);
	}

	return (
		<div className="w-full flex flex-col gap-4">
			<div className="w-full grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))` }}>
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
				<div className="flex justify-center">
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
