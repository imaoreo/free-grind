import { useLayoutEffect, useRef, useState, memo } from "react";
import { Eye, Lock, History, MoveHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getThumbImageUrl } from "../../../utils/media";
import { ProfileImage } from "../../../components/ui/profile-image";
import { type InterestItem, type InterestTab, formatTimestamp, getTapEmoji, PREVIEW_ID_PREFIX } from "./interestUtils";
import { cn } from "../../../utils/cn";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";

export const InterestTabs = memo(function InterestTabs({
	activeTab,
	onViewsClick,
	onTapsClick,
	firstTab = "taps",
	shouldBounce = false,
	newViewsCount = 0,
	newTapsCount = 0,
}: {
	activeTab: InterestTab;
	onViewsClick: () => void;
	onTapsClick: () => void;
	firstTab?: InterestTab;
	shouldBounce?: boolean;
	newViewsCount?: number;
	newTapsCount?: number;
}) {
	const { t } = useTranslation();
	const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
	const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
	const [isReady, setIsReady] = useState(false);

	const isViewsFirst = firstTab === "views";

	// Determine logical order of labels based on firstTab
	const labels = isViewsFirst
		? [t("interest_page.tabs.views"), t("interest_page.tabs.taps")]
		: [t("interest_page.tabs.taps"), t("interest_page.tabs.views")];

	const handlers = isViewsFirst
		? [onViewsClick, onTapsClick]
		: [onTapsClick, onViewsClick];

	const counts = isViewsFirst
		? [newViewsCount, newTapsCount]
		: [newTapsCount, newViewsCount];

	// Index of the currently active tab in the visual array
	const activeIndex = isViewsFirst
		? (activeTab === "views" ? 0 : 1)
		: (activeTab === "taps" ? 0 : 1);

	// Measure the active tab's width and position
	useLayoutEffect(() => {
		const activeEl = tabsRef.current[activeIndex];
		if (activeEl) {
			setIndicatorStyle({
				left: activeEl.offsetLeft,
				width: activeEl.offsetWidth,
			});
			if (!isReady) {
				// Wait two frames to ensure the width is applied before enabling transition
				requestAnimationFrame(() => {
					requestAnimationFrame(() => setIsReady(true));
				});
			}
		}
	}, [activeIndex, isReady]);

	return (
		<div className="glass-pill relative inline-flex items-center p-1">
			{/*
				The Sliding Pill:
				- Transitions width and position based on the measured active tab.
				- This creates a natural "stretch" look as it moves.
			*/}
			<div
				className={cn(
					"absolute top-1 bottom-1 rounded-full bg-[var(--accent)] shadow-sm",
					isReady ? "transition-all duration-300 ease-out" : "transition-none"
				)}
				style={{
					width: indicatorStyle.width,
					left: indicatorStyle.left,
					transform: shouldBounce ? "translateX(8px)" : "translateX(0)",
				}}
			/>

			{labels.map((label, i) => (
				<button
					key={label}
					ref={(el) => (tabsRef.current[i] = el)}
					type="button"
					onClick={handlers[i]}
					className={cn(
						"relative z-10 flex h-9 items-center justify-center rounded-full px-5 transition-all duration-300 ease-out active:scale-95",
						shouldBounce && "translate-x-2",
						activeIndex === i
							? "text-white text-base font-black tracking-tight"
							: "text-[var(--accent)] hover:opacity-80 text-sm font-bold"
					)}
				>
					<span>{label}</span>
					{counts[i] > 0 && (
						<span
							className={cn(
								"ml-2 flex h-4.5 min-w-[1.125rem] items-center justify-center rounded-full px-1 text-[10px] font-black transition-colors duration-300",
								activeIndex === i
									? "bg-white text-[var(--accent)]"
									: "bg-[var(--accent)] text-white"
							)}
						>
							{counts[i] > 99 ? "99+" : counts[i]}
						</span>
					)}
				</button>
			))}
		</div>
	);
});

const emojiColorMap: Record<number, string> = {
	0: "255, 200, 0", // 👋
	1: "255, 140, 0", // 🔥
	2: "168, 85, 247", // 😈
};

export const InterestRow = memo(function InterestRow({
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
	const isOnline = typeof item.onlineUntil === "number" && item.onlineUntil > now;

	const displayName = item.displayName
		? item.displayName
		: isPrivate
			? t("interest_page.unknown_profile")
			: t("interest_page.profile_fallback", { id: item.profileId });

	return (
		<div
			ref={ref}
			className={cn(
				"relative flex items-center gap-4 pl-5 pr-6 py-4 transition-colors",
				isPrivate ? "opacity-75 grayscale-[0.3]" : "hover:bg-[var(--surface-2)]/40",
				revealClass
			)}
		>
			{/* Avatar */}
			<button
				type="button"
				onClick={() => !isPrivate && onOpenProfile(item.profileId)}
				disabled={isPrivate}
				className="relative shrink-0"
			>
				<div className="h-15 w-15 squircle drop-shadow-sm bg-[var(--surface-2)]">
					<ProfileImage
						src={imageSrc}
						alt={displayName}
					/>
				</div>
				{isOnline && (
					<span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-[1.5px] border-[var(--bg)] bg-green-500 shadow-sm z-10" />
				)}
				{isPrivate && (
					<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-1 ring-[var(--surface)] z-10">
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
				</button>
			</div>

			{/* Action Area (Views or Taps) */}
			{!isPrivate && (
				<div className="shrink-0 flex items-center justify-center h-12 w-12">
					{mode === "taps" ? (
						<div
							className="relative flex h-12 w-12 items-center justify-center rounded-full border"
							style={{
								backgroundColor: `rgba(${emojiColorMap[item.tapType] || "255, 204, 1"}, 0.07)`,
								borderColor: `rgba(${emojiColorMap[item.tapType] || "255, 204, 1"}, 0.45)`,
								boxShadow: `0 2px 8px rgba(${emojiColorMap[item.tapType] || "255, 204, 1"}, 0.05)`,
								color: `rgb(${emojiColorMap[item.tapType] || "255, 204, 1"})`
							}}
						>
							<span className="text-2xl leading-none select-none">
								{getTapEmoji(item.tapType)}
							</span>
							{item.isMutual && (
								<div
									className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-lg ring-0 ring-[var(--surface)]"
									title={t("interest_page.mutual_tap_tooltip")}
								>
									<MoveHorizontal className="h-3 w-3" />
								</div>
							)}
						</div>
					) : (
						<div
							className="flex items-center gap-1.5 h-8 px-3 rounded-full border"
							style={{
								backgroundColor: "color-mix(in srgb, var(--text-muted), transparent 94%)",
								borderColor: "color-mix(in srgb, var(--text-muted), transparent 60%)",
							}}
						>
							<Eye className="h-3.5 w-3.5 text-[var(--text-muted)]" />
							<span className="text-xs font-bold leading-none tabular-nums text-[var(--text)]">
								{item.viewCount || 1}
							</span>
						</div>
					)}
				</div>
			)}

			{/* Full-width Divider */}
			<div className="absolute bottom-0 right-0 left-0 h-px bg-[var(--surface-2)]" />
		</div>
	);
});
