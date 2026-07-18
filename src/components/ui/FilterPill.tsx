import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../utils/cn";

type FilterPillProps = {
	icon?: ReactNode;
	label: string;
	active: boolean;
	onClick: () => void;
	/** Which brand color this pill tints as — defaults to the app's generic
	 * accent. "right-now" reads in Right Now's own brand color instead (see
	 * RightNowPage.tsx's --right-now), for filters tied to that feature.
	 * "explore" reads in Grid's explore-mode brand color instead (see
	 * LocationOverlay.tsx's EXPLORE_COLOR / --explore), for the Grid filter
	 * row while browsing a non-home location.
	 * Kept as a fixed set (not an arbitrary CSS color) rather than computing
	 * shadow/border colors dynamically — Tailwind's shadow-[...] utilities
	 * only exist for class strings that appear literally in source, and
	 * these already do (GridPage.tsx, RightNowPage.tsx), so reusing them
	 * verbatim guarantees this matches the same shadow those already use
	 * instead of a hand-rolled approximation. */
	color?: "accent" | "right-now" | "explore";
	/** "label" (default): icon + visible text, sized to content.
	 * "icon": icon-only square button (aria-label/title carry the label). */
	variant?: "label" | "icon";
	/** Optional trailing badge (e.g. an active-filter count or a status
	 * icon), rendered after the label the same way the inbox/grid "Filters"
	 * button shows its active-count badge. */
	badge?: ReactNode;
};

/** Shared quick-filter pill used by both GridPage's and the chat inbox's
 * header filter rows, so the same toggle-pill look/behavior (including a
 * per-filter brand color override) isn't reimplemented in each screen. */
export function FilterPill({
	icon,
	label,
	active,
	onClick,
	color = "accent",
	variant = "label",
	badge,
}: FilterPillProps) {
	const isIconOnly = variant === "icon";
	const isRightNow = color === "right-now";
	const isExplore = color === "explore";

	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={isIconOnly ? label : undefined}
			title={isIconOnly ? label : undefined}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 text-sm font-bold transition-all active:scale-95 outline-none focus:outline-none focus-visible:outline-none",
				isIconOnly ? "size-9 justify-center" : "px-4 py-2",
				active
					? isRightNow
						? "rounded-full border border-[var(--right-now)] bg-[var(--right-now)] text-white shadow-lg shadow-[var(--right-now)]/40 hover:brightness-110"
						: isExplore
							? "rounded-full border border-[var(--explore)] bg-[var(--explore)] text-white shadow-lg shadow-[var(--explore)]/40 hover:brightness-110"
							: "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40 hover:brightness-110"
					: isRightNow
						? "glass-pill text-[var(--right-now)] hover:border-[var(--right-now)]/60 hover:bg-[var(--right-now)]/20"
						: isExplore
							? "glass-pill text-[var(--explore)] hover:border-[var(--explore)]/60 hover:bg-[var(--explore)]/20"
							: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
			)}
			style={
				!active
					? ({
							"--pill-color": isRightNow ? "var(--right-now)" : isExplore ? "var(--explore)" : "var(--accent)",
						} as CSSProperties)
					: undefined
			}
		>
			{icon}
			{!isIconOnly && label}
			{badge}
		</button>
	);
}
