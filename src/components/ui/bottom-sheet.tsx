import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const BottomSheetContext = createContext<() => void>(() => {});
export const useBottomSheetClose = () => useContext(BottomSheetContext);

interface SheetCloseProps {
	children: ReactNode;
	className?: string;
	disabled?: boolean;
	onClick?: () => void;
}

export function SheetClose({ children, className, disabled, onClick }: SheetCloseProps) {
	const close = useBottomSheetClose();
	return (
		<button
			type="button"
			disabled={disabled}
			className={className}
			onClick={() => { onClick?.(); close(); }}
		>
			{children}
		</button>
	);
}

interface BottomSheetProps {
	onClose: () => void;
	onExpand?: () => void;
	isDesktop?: boolean;
	isProcessing?: boolean;
	zIndex?: string;
	bg?: string;
	panelClassName?: string;
	children: ReactNode;
}

export function BottomSheet({
	onClose,
	onExpand,
	isDesktop = false,
	isProcessing = false,
	zIndex = "z-[60]",
	bg = "bg-[var(--surface)]",
	panelClassName = "",
	children,
}: BottomSheetProps) {
	const [dragY, setDragY] = useState(0);
	const [isDragging, setIsDragging] = useState(false);
	const [isVisible, setIsVisible] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const dragStartY = useRef<number | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closingRef = useRef(false);
	const closedByBackRef = useRef(false);
	const animateCloseRef = useRef<() => void>(() => {});

	// useEffect fires after browser has painted — double RAF ensures initial
	// translateY(120%) is committed before we transition to translateY(0)
	useEffect(() => {
		let r1: number, r2: number;
		r1 = requestAnimationFrame(() => {
			r2 = requestAnimationFrame(() => setIsVisible(true));
		});
		return () => {
			cancelAnimationFrame(r1);
			cancelAnimationFrame(r2);
			if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
		};
	}, []);

	const animateClose = useCallback(() => {
		if (isProcessing || closingRef.current) return;
		closingRef.current = true;
		setIsClosing(true);
		closeTimerRef.current = setTimeout(onClose, 320);
	}, [isProcessing, onClose]);

	useEffect(() => { animateCloseRef.current = animateClose; }, [animateClose]);

	useEffect(() => {
		const prevState = history.state;
		history.pushState({ bottomSheet: true }, "");
		const onPopState = () => {
			closedByBackRef.current = true;
			animateCloseRef.current();
		};
		window.addEventListener("popstate", onPopState);
		return () => {
			window.removeEventListener("popstate", onPopState);
			if (!closedByBackRef.current) history.replaceState(prevState, "");
		};
	}, []);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isProcessing) {
				e.stopImmediatePropagation();
				animateClose();
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [isProcessing, animateClose]);

	const onTouchStart = (e: React.TouchEvent) => {
		dragStartY.current = e.touches[0].clientY;
		setIsDragging(true);
	};

	const onTouchMove = (e: React.TouchEvent) => {
		if (dragStartY.current === null) return;
		const delta = e.touches[0].clientY - dragStartY.current;
		if (delta < -60 && onExpand) {
			onExpand();
			dragStartY.current = e.touches[0].clientY;
			return;
		}
		setDragY(Math.max(0, delta));
	};

	const onTouchEnd = () => {
		if (dragY > 100) animateClose();
		setDragY(0);
		setIsDragging(false);
		dragStartY.current = null;
	};

	const isAnimating = isVisible && !isDragging;
	const transform = (!isVisible || isClosing)
		? "translateY(120%)"
		: `translateY(${dragY}px)`;

	return (
		<BottomSheetContext.Provider value={animateClose}>
			<div
				className={`fixed inset-0 ${zIndex} flex flex-col justify-end bg-black/45 backdrop-blur-sm no-touch-callout`}
				style={{
					opacity: (!isVisible || isClosing) ? 0 : 1,
					transition: isVisible ? "opacity 0.3s ease" : "none",
				}}
				onClick={isProcessing ? undefined : animateClose}
			>
				<div
					className={`flex flex-col rounded-t-2xl border-x border-t border-[var(--border)] ${bg} shadow-2xl overflow-hidden ${isDesktop ? "w-full max-w-[800px] mx-auto" : "mx-3"} ${panelClassName}`}
					style={{
						transform,
						transition: isAnimating ? "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)" : "none",
						willChange: "transform",
						paddingBottom: "max(16px, env(safe-area-inset-bottom))",
					}}
					onClick={(e) => e.stopPropagation()}
				>
					{!isDesktop && (
						<div
							className="flex justify-center pt-2.5 pb-1 cursor-grab touch-none"
							onTouchStart={onTouchStart}
							onTouchMove={onTouchMove}
							onTouchEnd={onTouchEnd}
						>
							<div className="h-1 w-10 rounded-full bg-[var(--border)]" />
						</div>
					)}
					{isDesktop && <div className="pt-4" />}
					{children}
				</div>
			</div>
		</BottomSheetContext.Provider>
	);
}
