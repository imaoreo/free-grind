import { Eye, Lock, History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getThumbImageUrl } from "../../../utils/media";
import blankProfileImage from "../../../images/blank-profile.png";
import { type InterestItem, type InterestTab, formatTimestamp, getTapEmoji, PREVIEW_ID_PREFIX } from "./interestUtils";

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
	const imageSrc = item.imageHash ? getThumbImageUrl(item.imageHash, "320x320") : blankProfileImage;

	const isPrivate = !item.canOpenProfile;
	const isRecovered = !!item.isFromCache && !isPrivate && !item.profileId.startsWith(PREVIEW_ID_PREFIX);

	const trailing =
		mode === "views"
			? item.viewCount != null
				? t("interest_page.view_count", { count: item.viewCount })
				: t("interest_page.viewed")
			: null;

	return (
		<button
			type="button"
			onClick={() => {
				if (item.canOpenProfile) {
					onOpenProfile(item.profileId);
				}
			}}
			disabled={isPrivate}
			className={`flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition ${
				isPrivate ? "opacity-75 grayscale-[0.3]" : "hover:bg-[var(--surface-2)]"
			}`}
		>
			<div className="relative h-12 w-12 shrink-0">
				<div className="h-full w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
					<img src={imageSrc} alt={item.displayName === t("interest_page.unknown_profile") ? t("interest_page.unknown_profile") : item.displayName} className="h-full w-full object-cover" />
				</div>
				{isPrivate && (
					<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
						<Lock className="h-3 w-3" />
					</div>
				)}
			</div>

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<p className={`truncate text-sm font-semibold ${isPrivate ? "text-[var(--text-muted)]" : "text-[var(--text)]"}`}>
						{item.displayName
							? item.displayName
							: isPrivate
								? t("interest_page.unknown_profile")
								: t("interest_page.profile_fallback", { id: item.profileId })}
					</p>
					{isRecovered && (
						<History className="h-3 w-3 text-[var(--accent)]" title={t("interest_page.recovered_tooltip")} />
					)}
				</div>
				<p className="truncate text-xs text-[var(--text-muted)]">{formatTimestamp(item.timestamp, t, now)}</p>
			</div>

			<span
				className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] ${
					mode === "views" && !isPrivate ? "bg-[var(--surface-2)]" : ""
				}`}
			>
				{mode === "views" ? (
					!isPrivate && (
						<>
							<Eye className="h-3.5 w-3.5" />
							{trailing}
						</>
					)
				) : (
					<span className="text-2xl leading-none">{getTapEmoji(item.tapType)}</span>
				)}
			</span>
		</button>
	);
}
