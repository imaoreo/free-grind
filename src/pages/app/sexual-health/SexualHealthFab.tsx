import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface SexualHealthFabProps {
	slotEl: HTMLDivElement | null;
	onClick: () => void;
	icon: ReactNode;
	label: string;
	disabled?: boolean;
}

/** Floating "add/log" action shared by every list tab — matches
 * RightNowPostFAB's button styling exactly (see RightNowPage.tsx), minus
 * its session-countdown-specific canvas/ring animation.
 *
 * Portals into a slot rendered by SexualHealthPage *outside*
 * FeedScrollContainer, the same way RightNowPage renders its own FAB as a
 * sibling of (not nested inside) its FeedScrollContainer — that scroll
 * container sets an inline mask-image, which creates a new containing
 * block for position:fixed descendants, so a FAB rendered inside it would
 * be confined to the scroll container's box and end up stuck behind the
 * app's fixed bottom nav bar instead of floating above it. */
export function SexualHealthFab({ slotEl, onClick, icon, label, disabled }: SexualHealthFabProps) {
	if (!slotEl) {
		return null;
	}
	return createPortal(
		<div className="flex h-20 w-20 select-none items-center justify-center">
			<svg className="absolute inset-0 z-10 h-full w-full -rotate-90" viewBox="0 0 120 120">
				<circle cx="60" cy="60" r="53.5" className="fill-transparent" stroke="var(--accent)" strokeWidth="3" opacity="0.7" />
			</svg>
			<button
				type="button"
				disabled={disabled}
				onClick={onClick}
				className="z-20 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xl transition-all duration-100 ease-out focus:outline-none active:scale-95 active:shadow-none hover:opacity-90 disabled:opacity-60"
				style={{ boxShadow: "0 10px 25px -5px color-mix(in srgb, var(--accent), transparent 60%)" }}
				aria-label={label}
			>
				{icon}
			</button>
		</div>,
		slotEl,
	);
}
