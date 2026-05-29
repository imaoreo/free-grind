import { useCallback, useRef, useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

type PullToRefreshContainerProps = {
	children: ReactNode;
	onRefresh: () => Promise<unknown> | void;
	isDisabled?: boolean;
	isAtTop?: () => boolean;
	className?: string;
	style?: CSSProperties;
	refreshingLabel?: string;
	pullLabel?: string;
	releaseLabel?: string;
	thresholdPx?: number;
	maxPullPx?: number;
	spinnerColor?: string;
	contentClassName?: string;
};

export function PullToRefreshContainer({
	children,
	onRefresh,
	isDisabled = false,
	isAtTop,
	className,
	style,
	refreshingLabel,
	pullLabel,
	releaseLabel,
	thresholdPx = 64,
	maxPullPx = 96,
	spinnerColor,
	contentClassName,
}: PullToRefreshContainerProps) {
	const { t } = useTranslation();
	const [pullDistance, setPullDistance] = useState(0);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const containerRef = useRef<HTMLDivElement>(null);
	const touchStartYRef = useRef<number | null>(null);
	const touchStartXRef = useRef<number | null>(null);
	const isPullingRef = useRef(false);

	const canStartPull = useCallback(() => {
		if (isDisabled || isRefreshing) return false;
		const isAtTopValue = typeof isAtTop === "function" ? isAtTop() : true;
		// Check scrollY to ensure we are at the absolute top of the viewport
		return isAtTopValue && window.scrollY <= 1;
	}, [isAtTop, isDisabled, isRefreshing]);

	const handleRefresh = useCallback(async () => {
		if (isDisabled || isRefreshing) return;
		setIsRefreshing(true);
		try {
			await onRefresh();
		} finally {
			setIsRefreshing(false);
			setPullDistance(0);
		}
	}, [isDisabled, isRefreshing, onRefresh]);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		const onTouchStart = (e: TouchEvent) => {
			if (!canStartPull()) {
				touchStartYRef.current = null;
				isPullingRef.current = false;
				return;
			}
			touchStartYRef.current = e.touches[0].clientY;
			touchStartXRef.current = e.touches[0].clientX;
			isPullingRef.current = true;
		};

		const onTouchMove = (e: TouchEvent) => {
			if (!isPullingRef.current || touchStartYRef.current === null) return;

			const currentY = e.touches[0].clientY;
			const currentX = e.touches[0].clientX;
			const deltaY = currentY - touchStartYRef.current;
			const deltaX = currentX - (touchStartXRef.current ?? currentX);

			// If the user swipes more horizontally than vertically, abort Pull-to-Refresh
			// to allow for native horizontal gestures (like swiping cards/menus)
			if (Math.abs(deltaX) > Math.abs(deltaY) && pullDistance === 0) {
				isPullingRef.current = false;
				return;
			}

			if (deltaY > 0 && window.scrollY <= 1) {
				// IMPORTANT: Only preventDefault if we are at the top and pulling down.
				// This fixes the "Unable to preventDefault inside passive event listener" error.
				if (e.cancelable) {
					e.preventDefault();
				}

				// Calculate pull with resistance (0.4 multiplier)
				const pull = Math.min(deltaY * 0.4, maxPullPx);
				setPullDistance(pull);
			} else if (deltaY < 0 && pullDistance > 0) {
				// Allow sliding back up to cancel the pull
				setPullDistance(Math.max(0, deltaY * 0.4));
			} else {
				// Let native scrolling take over if we aren't pulling from the top
				isPullingRef.current = false;
			}
		};

		const onTouchEnd = () => {
			if (isPullingRef.current && pullDistance >= thresholdPx) {
				void handleRefresh();
			} else {
				setPullDistance(0);
			}
			isPullingRef.current = false;
			touchStartYRef.current = null;
		};

		// Register listeners with passive: false to allow preventDefault() for the pull effect
		element.addEventListener("touchstart", onTouchStart, { passive: true });
		element.addEventListener("touchmove", onTouchMove, { passive: false });
		element.addEventListener("touchend", onTouchEnd, { passive: true });
		element.addEventListener("touchcancel", onTouchEnd, { passive: true });

		return () => {
			element.removeEventListener("touchstart", onTouchStart);
			element.removeEventListener("touchmove", onTouchMove);
			element.removeEventListener("touchend", onTouchEnd);
			element.removeEventListener("touchcancel", onTouchEnd);
		};
	}, [canStartPull, handleRefresh, maxPullPx, pullDistance, thresholdPx]);

	const rotation = !isRefreshing
		? 480 * (1 - Math.pow(1 - pullDistance / maxPullPx, 2))
		: undefined;

	return (
		<div
			ref={containerRef}
			className={className}
			style={{
				position: "relative",
				// touchAction: pan-y allows the browser to handle native 120Hz scrolling
				touchAction: "pan-y",
				...style
			}}
		>
			{/* Indicator Layer */}
			<div
				className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-center overflow-hidden"
				style={{
					height: "64px",
					opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
					transform: `translateY(${isRefreshing ? 0 : pullDistance - 64}px)`,
					transition: isRefreshing || pullDistance === 0 ? "transform 0.3s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.2s" : "none",
					willChange: "transform, opacity",
				}}
			>
				<div className="flex flex-col items-center gap-2">
					<div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-lg">
						<RefreshCw
							className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`}
							style={{
								color: spinnerColor ?? "var(--accent)",
								transform: rotation !== undefined ? `rotate(${rotation}deg)` : undefined,
							}}
						/>
					</div>
					<span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">
						{isRefreshing
							? (refreshingLabel ?? t("pull_to_refresh.refreshing"))
							: pullDistance >= thresholdPx
								? (releaseLabel ?? t("pull_to_refresh.release"))
								: (pullLabel ?? t("pull_to_refresh.pull"))}
					</span>
				</div>
			</div>

			{/* Content Layer */}
			<div
				className={contentClassName}
				style={{
					transform: `translateY(${isRefreshing ? 64 : pullDistance}px)`,
					transition: isRefreshing || pullDistance === 0 ? "transform 0.3s cubic-bezier(0.2, 1, 0.3, 1)" : "none",
					willChange: "transform",
				}}
			>
				{children}
			</div>
		</div>
	);
}
