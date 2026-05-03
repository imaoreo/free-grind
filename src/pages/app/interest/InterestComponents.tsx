import { Eye, Hand } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getThumbImageUrl } from "../../../utils/media";
import blankProfileImage from "../../../images/blank-profile.png";
import { type InterestItem, type InterestTab, formatTimestamp, tapLabel } from "./interestUtils";

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
	const trailing =
		mode === "views"
			? item.viewCount != null
				? t("interest_page.view_count", { count: item.viewCount })
				: t("interest_page.viewed")
			: tapLabel(item.tapType, t);

	return (
		<button
			type="button"
			onClick={() => {
				if (item.canOpenProfile) {
					onOpenProfile(item.profileId);
				}
			}}
			disabled={!item.canOpenProfile}
			className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
		>
			<div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)]">
				<img src={imageSrc} alt={item.displayName} className="h-full w-full object-cover" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-[var(--text)]">{item.displayName}</p>
				<p className="truncate text-xs text-[var(--text-muted)]">{formatTimestamp(item.timestamp, t, now)}</p>
			</div>
			<span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
				{mode === "views" ? <Eye className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
				{mode === "views" && !item.canOpenProfile ? t("interest_page.preview") : trailing}
			</span>
		</button>
	);
}
