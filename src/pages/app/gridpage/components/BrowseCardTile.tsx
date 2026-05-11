import type { BrowseCard } from "../../GridPage.types";
import { MapPin, MessageCircleCheck, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	formatDistance,
	getOnlineStatusMeta,
	getDisplayName,
} from "../utils";
import { cn } from "../../../../utils/cn";
import blankProfileImage from "../../../../images/blank-profile.png";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import { usePresenceCheck } from "../../../../hooks/usePresenceCheck";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";

type BrowseCardTileProps = {
	card: BrowseCard;
	chatContactStatus?: ChatContactIndexRecord | null;
	onSelectProfile: (profileId: string) => void;
	onMessageProfile: (profileId: string) => void;
	isDesktop?: boolean;
};

export function BrowseCardTile({
	card,
	chatContactStatus,
	onSelectProfile,
	onMessageProfile,
	isDesktop = false,
}: BrowseCardTileProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const name = getDisplayName(card);
	const onlineStatus = getOnlineStatusMeta(card.lastOnline, card.onlineUntil);
	const age = typeof card.age === "number" && card.age > 0 ? card.age : null;
	const usesFreegrind = usePresenceCheck(card.profileId);
	const unreadCount = Math.max(
		chatContactStatus?.unreadCount ?? 0,
		card.unreadCount ?? 0,
	);
	const hasChatted = Boolean(chatContactStatus?.hasChatted) || unreadCount > 0;

	return (
		<div className={cn(!isDesktop && "bg-black flex")}>
			<button
				type="button"
				key={card.profileId}
				onClick={() => onSelectProfile(card.profileId)}
				className={cn(
					"surface-card-grid overflow-hidden text-left transition-transform active:scale-95 w-full block",
					isDesktop
						? "rounded-xl shadow-sm"
						: "rounded-[4px] border-[0.5px] border-black",
				)}
			>
				{/* Note: Switched from aspect-[4/5] to aspect-[5/5] because square images look more pleasant in the grid */}
				<div className="relative aspect-[5/5] bg-[var(--surface-2)]">
					<img
						src={card.primaryImageUrl ?? blankProfileImage}
						alt={t("browse_page.profile_photo_alt", { name })}
						className="h-full w-full object-cover"
					/>

					{/* Top-left: Name & Age */}
					<div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 via-black/20 to-transparent p-2 text-white">
						<p className="text-sm sm:text-base font-bold leading-tight">
							{name}
							{age && <span className="font-semibold text-white/90"> {age}</span>}
						</p>
					</div>

					{/* Top-right: Online / last seen status */}
					<div className="absolute right-2 top-2">
						{onlineStatus.isOnline ? (
							<span className="block h-3 w-3 rounded-full bg-green-500 shadow-lg ring-2 ring-black/30" />
						) : (
							<span className="inline-flex items-center rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold tracking-wide text-white shadow-lg backdrop-blur-sm sm:text-[11px]">
								{t(onlineStatus.labelKey, { count: onlineStatus.count })}
							</span>
						)}
					</div>

					{/* Bottom-right: Badges */}
					<div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">

						{card.favorite ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-yellow-500 shadow-lg backdrop-blur-sm">
								<Star className="h-3.5 w-3.5 fill-current" />
							</div>
						) : usesFreegrind ? (
							<img
								src={freegrindLogo}
								alt={t("browse_page.uses_free_grind")}
								title={t("browse_page.uses_free_grind")}
								className="h-5 w-5 rounded-full border-2 border-black/50 shadow-lg"
							/>
						) : null}

						{unreadCount > 0 ? (
							<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--accent-contrast)] shadow-lg ring-1 ring-black/20">
								{unreadCount}
							</span>
						) : hasChatted ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-sm">
								<MessageCircleCheck className="h-3.5 w-3.5" />
							</div>
						) : null}

					</div>

					{/* Bottom-left: Distance */}
					<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent px-2 py-0 text-white">
						<span className="inline-flex items-center gap-1 text-xs font-semibold">
							<MapPin className="h-3.5 w-3.5" />
							{formatDistance(card.distanceMeters, t, unitsPreset)}
						</span>
					</div>
				</div>
			</button>
		</div>
	);
}
