import { useCallback, useRef, useState, type CSSProperties, type ReactNode, type TouchEvent } from "react";
import { RefreshCw } from "lucide-react";

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
	refreshingLabel = "Refreshing...",
	pullLabel = "Pull to refresh",
	releaseLabel = "Release to refresh",
	thresholdPx = 72,
	maxPullPx = 120,
	onTouchStartExtra,
	onTouchMoveExtra,
	onTouchEndExtra,
}: PullToRefreshContainerProps) {
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

			let pull = deltaY * 0.55;
			if (pull > maxPullPx) {
				touchStartYRef.current = currentY - maxPullPx / 0.55;
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

	return (
		<div
			className={className}
			style={style}
			onTouchStart={handleTouchStart}
			onTouchMove={handleTouchMove}
			onTouchEnd={finishTouch}
			onTouchCancel={finishTouch}
		>
			<div
				className="flex w-full items-center justify-center overflow-hidden transition-all duration-300 ease-out"
				style={{
					height: isRefreshing ? "84px" : `${pullDistance}px`,
					opacity: pullDistance > 0 || isRefreshing ? 1 : 0,
					transition:
						isRefreshing || pullDistance === 0
							? "height 0.3s ease, opacity 0.3s ease"
							: "none",
				}}
			>
				<div
					className="flex flex-col items-center gap-2"
					style={{
						transform: `translateY(${isRefreshing ? 0 : Math.min(0, (pullDistance - 84) / 2)}px)`,
					}}
				>
					<div className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-2.5 shadow-lg shadow-black/5">
						<RefreshCw
							className={`h-5 w-5 text-[var(--accent)] ${isRefreshing ? "animate-spin" : ""}`}
							style={{
								transform: !isRefreshing ? `rotate(${pullDistance * 5}deg)` : undefined,
								willChange: "transform",
							}}
						/>
					</div>
					<span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text)]">
						{isRefreshing
							? refreshingLabel
							: pullDistance >= thresholdPx
								? releaseLabel
								: pullLabel}
					</span>
				</div>
			</div>
			{children}
		</div>
	);
}
