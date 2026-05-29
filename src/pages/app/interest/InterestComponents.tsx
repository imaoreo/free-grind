import { Eye, Lock, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getThumbImageUrl } from "../../../utils/media";
import { ProfileImage } from "../../../components/ui/profile-image";
import { type InterestItem, type InterestTab, formatTimestamp, getTapEmoji, PREVIEW_ID_PREFIX } from "./interestUtils";
import { cn } from "../../../utils/cn";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";

export function InterestTabs({
	activeTab,
	onViewsClick,
	onTapsClick,
}: {
	activeTab: InterestTab;
	onViewsClick: () => void;
	onTapsClick: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-10 items-end gap-3">
			<button
				type="button"
				onClick={onViewsClick}
				className={
					activeTab === "views"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "views" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "views"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("interest_page.tabs.views")}
				</span>
			</button>
			<button
				type="button"
				onClick={onTapsClick}
				className={
					activeTab === "taps"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "taps" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "taps"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("interest_page.tabs.taps")}
				</span>
			</button>
		</div>
	);
}

export function InterestRow({
	item,
	mode,
	onOpenProfile,
	now,
}: {
	item: InterestItem;
	mode: InterestTab;
	onOpenProfile: (profileId: string) => void;
	now: number;
}) {
	const { t } = useTranslation();
	const { ref, revealClass } = useRevealOnScroll();
	const imageSrc = item.imageHash ? getThumbImageUrl(item.imageHash, "320x320") : null;

	const isPrivate = !item.canOpenProfile;
	const isRecovered = !!item.isFromCache && !isPrivate && !item.profileId.startsWith(PREVIEW_ID_PREFIX);

	const trailing =
		mode === "views"
			? item.viewCount != null
				? t("interest_page.view_count", { count: item.viewCount })
				: t("interest_page.viewed")
			: null;

	const displayName = item.displayName
		? item.displayName
		: isPrivate
			? t("interest_page.unknown_profile")
			: t("interest_page.profile_fallback", { id: item.profileId });

	return (
		<div
			ref={ref}
			className={cn(
				"flex items-start gap-3 px-5 py-4 transition-colors border-b border-[var(--surface-2)] last:border-0",
				isPrivate ? "opacity-75 grayscale-[0.3]" : "hover:bg-[var(--surface-2)]/40",
				revealClass
			)}
		>
			{/* Avatar */}
			<button
				type="button"
				onClick={() => !isPrivate && onOpenProfile(item.profileId)}
				disabled={isPrivate}
				className="relative mt-0.5 shrink-0"
			>
				<div className="h-14 w-14 overflow-hidden rounded-full">
					<ProfileImage
						src={imageSrc}
						alt={displayName}
					/>
				</div>
				{isPrivate && (
					<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
						<Lock className="h-3 w-3" />
					</div>
				)}
			</button>

			{/* Info */}
			<div className="min-w-0 flex-1">
				<button
					type="button"
					onClick={() => !isPrivate && onOpenProfile(item.profileId)}
					disabled={isPrivate}
					className="w-full text-left"
				>
					<div className="flex items-center gap-1.5">
						<p className={`truncate text-sm font-bold ${isPrivate ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
							{displayName}
						</p>
						{isRecovered && (
							<History className="h-3 w-3 text-[var(--accent)]" title={t("interest_page.recovered_tooltip")} />
						)}
					</div>
					<p className="mt-0.5 truncate text-xs text-[var(--text-muted)] font-medium">
						{formatTimestamp(item.timestamp, t, now)}
					</p>

					{mode === "views" && !isPrivate && trailing && (
						<div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] opacity-80">
							<Eye className="h-3 w-3" />
							{trailing}
						</div>
					)}
				</button>
			</div>

			{/* Action Area (Emoji for Taps) */}
			{mode === "taps" && (
				<div
					className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--accent)]/40 text-[var(--accent)] backdrop-blur-xl"
					style={{
						backgroundColor: "color-mix(in srgb, var(--accent), transparent 88%)",
						boxShadow: "0 4px 10px color-mix(in srgb, var(--accent), transparent 85%)"
					}}
				>
					<span className="text-2xl leading-none select-none">
						{getTapEmoji(item.tapType)}
					</span>
				</div>
			)}
		</div>
	);
}
