import { Flame, MapPin, MessageCircle, Shield } from "lucide-react";
import type { BrowseCard } from "../../GridPage.types";
import {
	formatDistance,
	getCardInitials,
	getDisplayName,
	isCurrentlyOnline,
} from "../utils";

type BrowseCardTileProps = {
	card: BrowseCard;
	onSelectProfile: (profileId: string) => void;
};

export function BrowseCardTile({ card, onSelectProfile }: BrowseCardTileProps) {
	const name = getDisplayName(card);
	const online = isCurrentlyOnline(card.onlineUntil);

	return (
		<button
			type="button"
			key={card.profileId}
			onClick={() => onSelectProfile(card.profileId)}
			className="surface-card overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
		>
			<div className="relative aspect-[4/5] bg-[var(--surface-2)]">
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
				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2.5 text-white">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate text-sm font-semibold">{name}</p>
						{online ? (
							<span className="inline-flex items-center rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
								Online
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="grid gap-2 p-3 text-xs text-[var(--text-muted)]">
				<div className="flex items-center justify-between gap-2">
					<span className="inline-flex items-center gap-1">
						<MapPin className="h-3.5 w-3.5" />
						{formatDistance(card.distanceMeters)}
					</span>
					<span className="font-medium text-[var(--text)]">
						{typeof card.age === "number" && card.age > 0 ? `${card.age}` : "-"}
					</span>
				</div>
				<div className="flex items-center justify-between gap-2">
					<span className="inline-flex items-center gap-1">
						<MessageCircle className="h-3.5 w-3.5" />
						{card.unreadCount ?? 0} unread
					</span>
					{card.isPopular ? (
						<span className="inline-flex items-center gap-1 text-[var(--text)]">
							<Flame className="h-3.5 w-3.5" />
							Popular
						</span>
					) : card.rightNow ? (
						<span className="inline-flex items-center gap-1 text-[var(--text)]">
							<Shield className="h-3.5 w-3.5" />
							Right Now
						</span>
					) : null}
				</div>
			</div>
		</button>
	);
}
