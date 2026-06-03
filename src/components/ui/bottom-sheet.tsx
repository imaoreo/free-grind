import { useRef, useState, type ReactNode } from "react";

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
	const dragStartY = useRef<number | null>(null);

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
		if (dragY > 100 && !isProcessing) onClose();
		setDragY(0);
		setIsDragging(false);
		dragStartY.current = null;
	};

	return (
		<div
			className={`fixed inset-0 ${zIndex} flex flex-col justify-end bg-black/45 backdrop-blur-sm no-touch-callout`}
			onClick={isProcessing ? undefined : onClose}
		>
			<div
				className={`flex w-full flex-col rounded-t-2xl border-x border-t border-[var(--border)] ${bg} shadow-2xl overflow-hidden ${isDesktop ? "max-w-[800px] mx-auto" : "mx-3"} ${panelClassName}`}
				style={{
					transform: `translateY(${dragY}px)`,
					transition: isDragging ? "none" : "transform 0.25s ease",
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
	);
}
