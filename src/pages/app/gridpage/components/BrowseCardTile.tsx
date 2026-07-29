import type { BrowseCard } from "../../GridPage.types";
import { MapPin, MapPinOff, MessageCircle, Plane, Satellite, Star, Zap } from "lucide-react";
import { RightNowIcon } from "../../../../components/icons/RightNowIcon";
import { useTranslation } from "react-i18next";
import {
	formatDistance,
	getOnlineStatusMeta,
	getDisplayName,
} from "../utils";
import { cn } from "../../../../utils/cn";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { FreeGrindBadge } from "../../../../components/FreeGrindBadge";
import { usePresenceCheck } from "../../../../hooks/usePresenceCheck";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";
import { useRevealOnScroll } from "../../../../hooks/useRevealOnScroll";

type BrowseCardTileProps = {
	card: BrowseCard;
	chatContactStatus?: ChatContactIndexRecord | null;
	localNickname?: string;
	onSelectProfile: (profileId: string) => void;
	onMessageProfile: (profileId: string) => void;
	isDesktop?: boolean;
};

export function BrowseCardTile({
	card,
	chatContactStatus,
	localNickname,
	onSelectProfile,
	onMessageProfile: _onMessageProfile,
	isDesktop = false,
}: BrowseCardTileProps) {
	const { t } = useTranslation();
	const { unitsPreset, showDebugInfo, blurGridProfilePictures } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();
	const name = localNickname?.trim() || getDisplayName(card);
	const onlineStatus = getOnlineStatusMeta(card.lastOnline, card.onlineUntil);
	const age = typeof card.age === "number" && card.age > 0 ? card.age : null;
	const usesFreegrind = usePresenceCheck(card.profileId);
	const isDemoCard = card.profileId.toString().startsWith("demo-");
	const isVisiting = card.isVisiting === true;
	const isRoaming = card.roaming === true;
	const isPopular = card.isPopular === true;
	const isRightNow = card.rightNow === "HOSTING" || card.rightNow === "NOT_HOSTING";
	const isBoosting = card.isBoosting === true;
	const databaseUnread = chatContactStatus?.unreadCount ?? 0;
	const apiUnread = card.unreadCount ?? 0;
	const unreadCount = Math.max(databaseUnread, apiUnread);
	const hasChatted = Boolean(chatContactStatus?.hasChatted) || card.chatted === true || unreadCount > 0;
	const isFavorite = card.favorite === true;


	return (
		<div ref={ref} className={cn(!isDesktop && "bg-black rounded-[4px] overflow-hidden", revealClass)}>
			<button
				type="button"
				key={card.profileId}
				onClick={() => !isDemoCard && onSelectProfile(card.profileId)}
				className={cn(
					"surface-card-grid overflow-hidden text-left transition-transform w-full block relative",
					!isDemoCard && "active:scale-95",
					isDesktop
						? "rounded-xl shadow-sm"
						: "rounded-[4px]",
					isBoosting ? "p-[2.5px] z-20" : isRightNow ? "p-[2px]" : "p-0",
					isDemoCard && "cursor-default"
				)}
			>
				{/* Animated Gradient Border Layer (Enhanced Glow) */}
				{isBoosting ? (
					<div
						className="absolute inset-[-100%] animate-[spin_5s_linear_infinite] z-0 blur-[15px] opacity-100"
						style={{
							background: 'conic-gradient(from 0deg, transparent 0deg, var(--accent) 180deg, transparent 360deg)'
						}}
					/>
				) : isRightNow ? (
					/* Static pulsing border signalling "available right now" — suppressed
						while boosting so the two glows don't compete for attention. */
					<div
						className="absolute inset-0 z-0 rounded-[inherit] animate-pulse"
						style={{
							background: 'var(--right-now)',
							boxShadow: '0 0 8px 1px var(--right-now)',
						}}
					/>
				) : null}

				{/*
					Replace "aspect-[5/5]" with "h-0 pb-[100%]", since "aspect-ratio" collapses tile height to ~0 on
                    pre-iOS-15 WebKit. This triggered an endless pagination loop
                    that crashed the WebView renderer. thank you flo
				*/}
				<div className="relative w-full h-0 pb-[100%] bg-[var(--surface-2)] z-10 rounded-[inherit] overflow-hidden ring-1 ring-inset ring-white/10">
					<div className="absolute inset-0">
					<ProfileImage
						src={card.primaryImageUrl}
						alt={t("browse_page.profile_photo_alt", { name })}
						className={cn(
							(isDemoCard || blurGridProfilePictures) && "blur-md scale-110"
						)}
					/>

					{/* Top vignette — fixed height so it reads as a soft light source
						rather than a flat band clipped to the header content's height */}
					<div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/70 via-black/25 to-transparent pointer-events-none" />

					{/* Top Header: Name, Age & Status Cluster */}
					<div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-2 text-white">
						<div className="min-w-0 flex-1">
							<p className="text-sm sm:text-base font-bold leading-tight truncate drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
								{name}
								{age && <span className="font-semibold text-white/90 ml-1"> {age}</span>}
							</p>
						</div>

						<div className={cn(
							"flex shrink-0 items-center",
							onlineStatus.isOnline ? "gap-1" : "gap-0.5"
						)}>
							{(isRightNow || isPopular) && (
								<div className="flex items-center gap-0.5">
									{isPopular && (
										<span className="inline-flex" title="Popular">
											<Zap
												className="h-4 w-4 text-amber-400 drop-shadow-[0_1px_1.5px_rgba(0,0,0,1)] drop-shadow-[0_0_0.8px_rgba(0,0,0,1)]"
												strokeWidth={2.5}
											/>
										</span>
									)}
									{isRightNow && (
										<span className="inline-flex" title="Right Now">
											<RightNowIcon className="h-4 w-4 text-[var(--right-now)] drop-shadow-[0_1px_1.5px_rgba(0,0,0,1)] drop-shadow-[0_0_0.8px_rgba(0,0,0,1)]" />
										</span>
									)}
								</div>
							)}
							{onlineStatus.isOnline ? (
								isVisiting ? (
									<span className="inline-flex" title={t("profile_details.visiting")}>
										<Plane
											className="h-4 w-4 text-green-500 drop-shadow-[0_1px_1.5px_rgba(0,0,0,1)] drop-shadow-[0_0_0.8px_rgba(0,0,0,1)]"
											strokeWidth={2.5}
										/>
									</span>
								) : isRoaming ? (
									<span className="inline-flex" title={t("profile_details.roaming")}>
										<Satellite
											className="h-4 w-4 text-green-500 drop-shadow-[0_1px_1.5px_rgba(0,0,0,1)] drop-shadow-[0_0_0.8px_rgba(0,0,0,1)]"
											strokeWidth={2.5}
										/>
									</span>
								) : (
									<span className="block h-3 w-3 rounded-full bg-green-500 shadow-lg ring-2 ring-black/30" />
								)
							) : null}
							{!onlineStatus.isOnline && (
								<span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm sm:text-[11px]">
									{t(onlineStatus.labelKey, { count: onlineStatus.count })}
								</span>
							)}
						</div>
					</div>

					{/* Bottom-right: Interaction cluster */}
					<div className="absolute bottom-2 right-2 z-10 flex items-center gap-1">
						{isFavorite && (
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-yellow-500 shadow-lg backdrop-blur-sm">
								<Star className="h-3.5 w-3.5 fill-current" />
							</div>
						)}

						{usesFreegrind && !isFavorite && (
							<FreeGrindBadge size="md" variant="onDark" title={t("profile_details.uses_free_grind")} />
						)}

						{unreadCount > 0 ? (
							<span className="flex h-5 min-w-5 flex-col items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-[var(--accent-contrast)] shadow-lg ring-1 ring-black/20">
								<span>{unreadCount}</span>
								{showDebugInfo && !isDemoCard && (
									<span className="text-[7px] leading-tight opacity-80">
										db:{databaseUnread} a:{apiUnread}
									</span>
								)}
							</span>
						) : hasChatted ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white shadow-lg backdrop-blur-sm">
								<MessageCircle className="h-3.5 w-3.5" />
							</div>
						) : null}
					</div>

					{/* Bottom-left: Distance */}
					<div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/70 via-black/25 to-transparent pointer-events-none" />
					<div className="absolute bottom-2 left-2 z-10 flex h-5 items-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
						{card.distanceMeters == null || !Number.isFinite(card.distanceMeters) ? (
							<MapPinOff className="h-3.5 w-3.5" />
						) : (
							<span className="inline-flex items-center gap-1 text-xs font-semibold">
								<MapPin className="h-3.5 w-3.5" />
								{formatDistance(card.distanceMeters, t, unitsPreset)}
							</span>
						)}
					</div>
					</div>
				</div>
			</button>
		</div>
	);
}
