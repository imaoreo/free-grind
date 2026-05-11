import { useCallback, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
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
	onTouchStartExtra?: (event: TouchEvent<HTMLDivElement>) => void;
	onTouchMoveExtra?: (event: TouchEvent<HTMLDivElement>) => void;
	onTouchEndExtra?: (event: TouchEvent<HTMLDivElement>) => void;
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
	onTouchStartExtra,
	onTouchMoveExtra,
	onTouchEndExtra,
}: PullToRefreshContainerProps) {
	const { t } = useTranslation();
	const [pullDistance, setPullDistance] = useState(0);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const touchStartYRef = useRef<number | null>(null);
	const touchStartXRef = useRef<number | null>(null);
	const isPullingRef = useRef(false);

	const canStartPull = useCallback(() => {
		if (typeof isAtTop === "function") {
			return isAtTop();
		}
		return window.scrollY <= 0;
	}, [isAtTop]);

	const handleRefresh = useCallback(() => {
		if (isDisabled || isRefreshing) {
			return;
		}

		setIsRefreshing(true);
		void Promise.resolve()
			.then(onRefresh)
			.finally(() => {
				setIsRefreshing(false);
			});
	}, [isDisabled, isRefreshing, onRefresh]);

	const handleTouchStart = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			onTouchStartExtra?.(event);
			if (isDisabled || isRefreshing || !canStartPull()) {
				touchStartYRef.current = null;
				touchStartXRef.current = null;
				isPullingRef.current = false;
				return;
			}

			touchStartYRef.current = event.touches[0]?.clientY ?? null;
			touchStartXRef.current = event.touches[0]?.clientX ?? null;
			isPullingRef.current = touchStartYRef.current !== null;
		},
		[canStartPull, isDisabled, isRefreshing, onTouchStartExtra],
	);

	const handleTouchMove = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			onTouchMoveExtra?.(event);
			if (!isPullingRef.current) {
				return;
			}

			const startY = touchStartYRef.current;
			const startX = touchStartXRef.current;
			if (startY == null) {
				return;
			}

			const currentY = event.touches[0]?.clientY ?? startY;
			const currentX = event.touches[0]?.clientX ?? (startX ?? 0);
			const deltaY = currentY - startY;
			const deltaX = startX == null ? 0 : currentX - startX;

			if (Math.abs(deltaX) > Math.abs(deltaY) + 8) {
				isPullingRef.current = false;
				setPullDistance(0);
				return;
			}

			if (deltaY <= 0) {
				setPullDistance(0);
				return;
			}

			event.preventDefault();

			// Apply resistance
			let pull = deltaY * 0.45;
			if (pull > maxPullPx) {
				touchStartYRef.current = currentY - maxPullPx / 0.45;
				pull = maxPullPx;
			}

			setPullDistance(pull);
		},
		[maxPullPx, onTouchMoveExtra],
	);

	const finishTouch = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			onTouchEndExtra?.(event);
			if (pullDistance >= thresholdPx) {
				handleRefresh();
			}
			touchStartYRef.current = null;
			touchStartXRef.current = null;
			isPullingRef.current = false;
			setPullDistance(0);
		},
		[handleRefresh, onTouchEndExtra, pullDistance, thresholdPx],
	);

	const rotation = !isRefreshing
		? 480 * (1 - Math.pow(1 - pullDistance / maxPullPx, 2))
		: undefined;

	return (
		<div
			className={className}
			style={{ ...style, position: "relative", overflow: "hidden" }}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={finishTouch}
			onTouchCancel={finishTouch}
		>
			{/* Indicator Layer - Matches the pull distance for a tighter look */}
			<div
				className="pointer-events-none absolute inset-x-0 top-0 z-50 flex items-center justify-center overflow-hidden"
				style={{
					height: "64px",
					opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
					transform: `translateY(${isRefreshing ? 0 : pullDistance - 64}px)`,
					transition: isRefreshing || pullDistance === 0 ? "transform 0.3s ease, opacity 0.3s ease" : "none",
					willChange: "transform, opacity",
				}}
			>
				<div className="flex flex-col items-center gap-2">
					<div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-2 shadow-lg shadow-black/5">
						<RefreshCw
							className={`h-5 w-5 text-[var(--accent)] ${isRefreshing ? "animate-spin" : ""}`}
							style={{
								transform: rotation !== undefined ? `rotate(${rotation}deg)` : undefined,
								willChange: "transform",
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
				style={{
					transform: `translateY(${isRefreshing ? 64 : pullDistance}px)`,
					transition: isRefreshing || pullDistance === 0 ? "transform 0.3s ease" : "none",
					willChange: "transform",
				}}
			>
				{children}
			</div>
		</div>
	);
}
