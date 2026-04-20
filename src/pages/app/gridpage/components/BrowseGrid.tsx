import type { BrowseCard } from "../../GridPage.types";
import { BrowseCardTile } from "./BrowseCardTile";

type BrowseGridProps = {
	isLoadingCards: boolean;
	cardsError: string | null;
	cards: BrowseCard[];
	onSelectProfile: (profileId: string) => void;
};

export function BrowseGrid({
	isLoadingCards,
	cardsError,
	cards,
	onSelectProfile,
}: BrowseGridProps) {
	if (isLoadingCards) {
		return (
			<div className="surface-card rounded-2xl p-5 sm:p-6">
				<p className="text-sm text-[var(--text-muted)]">
					Loading nearby profiles...
				</p>
			</div>
		);
	}

	if (cardsError) {
		return (
			<div className="surface-card rounded-2xl p-5 sm:p-6">
				<p className="text-sm font-semibold">Could not load browse feed.</p>
				<p className="mt-2 text-sm text-[var(--text-muted)]">{cardsError}</p>
			</div>
		);
	}

	if (cards.length === 0) {
		return (
			<div className="surface-card rounded-2xl p-5 sm:p-6">
				<p className="text-sm font-semibold">No nearby profiles returned.</p>
				<p className="mt-2 text-sm text-[var(--text-muted)]">
					Try refreshing the feed after updating location in your account.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{cards.map((card) => (
				<BrowseCardTile
					key={card.profileId}
					card={card}
					onSelectProfile={onSelectProfile}
				/>
			))}
		</div>
	);
}
