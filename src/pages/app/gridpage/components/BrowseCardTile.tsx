import type { BrowseCard } from "../../GridPage.types";
import { MapPin } from "lucide-react";
import {
	formatDistance,
	getCardInitials,
	getDisplayName,
	isCurrentlyOnline,
} from "../utils";
import { cn } from "../../../../utils/cn";

type BrowseCardTileProps = {
	card: BrowseCard;
	onSelectProfile: (profileId: string) => void;
	onMessageProfile: (profileId: string) => void;
	isDesktop?: boolean;
};

export function BrowseCardTile({
	card,
	onSelectProfile,
	onMessageProfile,
	isDesktop = false,
}: BrowseCardTileProps) {
	const name = getDisplayName(card);
	const online = isCurrentlyOnline(card.onlineUntil);
	const age = typeof card.age === "number" && card.age > 0 ? card.age : null;

	return (
		<button
			type="button"
			key={card.profileId}
			onClick={() => onSelectProfile(card.profileId)}
			className={cn(
				"surface-card-grid overflow-hidden text-left transition-transform hover:-translate-y-1 active:scale-95",
				// Keep mobile square, round only on desktop-like devices.
				isDesktop && "rounded-xl shadow-sm",
			)}
		>
			{/* Note: Switched from aspect-[4/5] to aspect-[5/5] because square images look more pleasant in the grid */}
			<div className="relative aspect-[5/5] bg-[var(--surface-2)]">
				{card.primaryImageUrl ? (
					<img
						src={card.primaryImageUrl}
						alt={name}
						className="h-full w-full object-cover"
					/>
				) : (
					<div className="flex h-full items-center justify-center bg-[var(--surface)] text-2xl font-semibold text-[var(--text-muted)]">
						{getCardInitials(name)}
					</div>
				)}
				
				{/* Top-left: Name & Age */}
				<div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 via-black/20 to-transparent p-2 text-white">
				<p className="text-sm sm:text-base font-bold leading-tight">
					{name}
					{age && <span className="font-semibold text-white/90"> {age}</span>}
				</p>
			</div>

			{/* Top-right: Online Status */}
			{online && (
				<div className="absolute right-2 top-1">
					{/* Dot on mobile */}
					<span className="inline-flex sm:hidden h-3 w-3 rounded-full bg-green-500 shadow-lg" />
					{/* Badge on larger screens */}
					<span className="hidden sm:inline-flex items-center rounded-full bg-green-500/90 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
						Online
					</span>
				</div>
			)}

				{/* Bottom-left: Distance */}
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-2 py-0 text-white">
					<span className="inline-flex items-center gap-1 text-xs font-semibold">
						<MapPin className="h-3.5 w-3.5" />
						{formatDistance(card.distanceMeters)}
					</span>
				</div>
			</div>
		</button>
	);
}
