import { ChevronLeft, ChevronRight, X } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export type PhotoViewerMedia = {
	url: string;
	type: "image" | "video";
	alt?: string;
};

export type PhotoViewerProps = {
	isOpen: boolean;
	onClose: () => void;
	photos: (string | PhotoViewerMedia)[];
	initialIndex?: number;
	onIndexChange?: (index: number) => void;
	renderExtraInfo?: (index: number) => React.ReactNode;
};

function getMediaInfo(photo: string | PhotoViewerMedia) {
	if (typeof photo === "string") return { url: photo, type: "image" as const, alt: "" };
	return { url: photo.url, type: photo.type, alt: photo.alt ?? "" };
}

export function PhotoViewer({
	isOpen,
	onClose,
	photos,
	initialIndex = 0,
	onIndexChange,
	renderExtraInfo,
}: PhotoViewerProps) {
	const { t } = useTranslation();
	const N = photos.length;

	// centerIdx: which photo is logically current (0..N-1)
	// trackPos: 0=left slot visible, 1=center slot visible, 2=right slot visible
	// We always render [prev, center, next] in 3 slots.
	// On navigate: animate trackPos to 0 or 2, then onTransitionEnd updates centerIdx
	// and teleports trackPos back to 1. The teleport is always 1 slot and shows the
	// same photo just promoted to center, so it is always visually invisible.
	const [centerIdx, setCenterIdx] = useState(initialIndex);
	const [trackPos, setTrackPos] = useState(1);
	const [noTransition, setNoTransition] = useState(true);
	const [dragOffset, setDragOffset] = useState(0);
	const [zoomScale, setZoomScale] = useState(1);
	const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const lastDistRef = useRef<number | null>(null);
	const decidedAxisRef = useRef<"h" | "v" | null>(null);
	const isDraggingRef = useRef(false);
	const onIndexChangeRef = useRef(onIndexChange);
	onIndexChangeRef.current = onIndexChange;

	const prevIdx = N > 1 ? (centerIdx - 1 + N) % N : centerIdx;
	const nextIdx = N > 1 ? (centerIdx + 1) % N : centerIdx;

	// Reset position synchronously before paint so opening never animates.
	// Depends only on isOpen — initialIndex is intentionally excluded because the parent
	// may update initialIndex via onIndexChange while we are already open (tracking our
	// current position), and we must not re-initialize the carousel in that case.
	useLayoutEffect(() => {
		if (!isOpen) return;
		setCenterIdx(initialIndex);
		setTrackPos(1);
		setNoTransition(true);
		setDragOffset(0);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const id = requestAnimationFrame(() =>
			requestAnimationFrame(() => setNoTransition(false)),
		);
		return () => cancelAnimationFrame(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		onIndexChangeRef.current?.(centerIdx);
	}, [centerIdx]);

	const teleportToCenter = useCallback((newCenter: number) => {
		setCenterIdx(newCenter);
		setNoTransition(true);
		setTrackPos(1);
		requestAnimationFrame(() =>
			requestAnimationFrame(() => setNoTransition(false)),
		);
	}, []);

	const handleTransitionEnd = useCallback(() => {
		if (trackPos === 2) teleportToCenter((centerIdx + 1) % N);
		else if (trackPos === 0) teleportToCenter((centerIdx - 1 + N) % N);
	}, [trackPos, centerIdx, N, teleportToCenter]);

	const showNext = useCallback(() => {
		if (N < 2) return;
		setTrackPos(2);
		setDragOffset(0);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
	}, [N]);

	const showPrev = useCallback(() => {
		if (N < 2) return;
		setTrackPos(0);
		setDragOffset(0);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
	}, [N]);

	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		if (e.touches.length === 1) {
			const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			touchStartRef.current = pt;
			lastTouchRef.current = pt;
			decidedAxisRef.current = null;
			isDraggingRef.current = false;
		} else if (e.touches.length === 2) {
			lastDistRef.current = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			touchStartRef.current = null;
			lastTouchRef.current = null;
			decidedAxisRef.current = null;
			isDraggingRef.current = false;
			setDragOffset(0);
		}
	}, []);

	const handleTouchMove = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length === 2 && lastDistRef.current !== null) {
				const dist = Math.hypot(
					e.touches[0].clientX - e.touches[1].clientX,
					e.touches[0].clientY - e.touches[1].clientY,
				);
				setZoomScale((prev) => Math.min(Math.max(1, prev * (dist / lastDistRef.current!)), 4));
				lastDistRef.current = dist;
				return;
			}

			if (e.touches.length !== 1 || !touchStartRef.current) return;

			const dx = e.touches[0].clientX - touchStartRef.current.x;
			const dy = e.touches[0].clientY - touchStartRef.current.y;

			if (!decidedAxisRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
				decidedAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
			}

			if (decidedAxisRef.current === "h") {
				if (zoomScale > 1) {
					if (lastTouchRef.current) {
						setZoomOffset((prev) => ({
							x: prev.x + (e.touches[0].clientX - lastTouchRef.current!.x),
							y: prev.y + (e.touches[0].clientY - lastTouchRef.current!.y),
						}));
					}
				} else {
					isDraggingRef.current = true;
					setDragOffset(dx);
				}
			}

			lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		},
		[zoomScale],
	);

	const handleTouchEnd = useCallback(() => {
		if (decidedAxisRef.current === "h" && zoomScale === 1 && isDraggingRef.current) {
			const threshold = Math.min(70, window.innerWidth * 0.22);
			if (dragOffset < -threshold) showNext();
			else if (dragOffset > threshold) showPrev();
			else setDragOffset(0);
		} else {
			setDragOffset(0);
		}

		touchStartRef.current = null;
		lastTouchRef.current = null;
		lastDistRef.current = null;
		decidedAxisRef.current = null;
		isDraggingRef.current = false;

		if (zoomScale <= 1.05) {
			setZoomScale(1);
			setZoomOffset({ x: 0, y: 0 });
		}
	}, [zoomScale, dragOffset, showNext, showPrev]);

	useEffect(() => {
		if (!isOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
			if (e.key === "ArrowLeft") showPrev();
			if (e.key === "ArrowRight") showNext();
		};
		window.addEventListener("keydown", onKey, { capture: true });
		return () => window.removeEventListener("keydown", onKey, { capture: true });
	}, [isOpen, onClose, showPrev, showNext]);

	if (!isOpen || N === 0) return null;

	// For N>=2: render [prevSlot, centerSlot, nextSlot].
	// trackPos controls which is visible: transform = -trackPos * 100vw + dragOffset.
	// For N==1: single slot, no navigation.
	const slots: Array<{ photoIndex: number; slotIndex: number }> =
		N <= 1
			? [{ photoIndex: centerIdx, slotIndex: 1 }]
			: [
					{ photoIndex: prevIdx, slotIndex: 0 },
					{ photoIndex: centerIdx, slotIndex: 1 },
					{ photoIndex: nextIdx, slotIndex: 2 },
				];

	const activeSlot = trackPos; // which slotIndex is currently being shown
	const canAnimate = dragOffset === 0 && !noTransition;

	return createPortal(
		<div className="fixed inset-0 z-[80] bg-black" onClick={onClose}>
			<button
				type="button"
				onClick={(e) => { e.stopPropagation(); onClose(); }}
				className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5"
				aria-label={t("profile_details.close_photo_viewer")}
			>
				<X className="h-5 w-5" />
			</button>

			{N > 1 && (
				<>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); showPrev(); }}
						className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11"
						aria-label={t("profile_details.previous_photo")}
					>
						<ChevronLeft className="h-5 w-5" />
					</button>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); showNext(); }}
						className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11"
						aria-label={t("profile_details.next_photo")}
					>
						<ChevronRight className="h-5 w-5" />
					</button>
				</>
			)}

			{N > 1 && (
				<p className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] left-1/2 z-[83] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
					{centerIdx + 1} / {N}
				</p>
			)}

			<div
				className="h-full w-full overflow-hidden"
				onClick={(e) => e.stopPropagation()}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
			>
				<div
					className="flex h-full"
					style={{
						transform: `translateX(calc(${-activeSlot} * 100vw + ${dragOffset}px))`,
						transition: canAnimate
							? "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"
							: "none",
						willChange: "transform",
					}}
					onTransitionEnd={handleTransitionEnd}
				>
					{slots.map(({ photoIndex, slotIndex }) => {
						const photo = photos[photoIndex];
						if (!photo) return null;
						const { url, type, alt } = getMediaInfo(photo);
						const isCurrent = slotIndex === activeSlot;

						return (
							<div
								key={slotIndex}
								className="flex h-full w-screen flex-shrink-0 items-center justify-center p-3 sm:p-8"
								onClick={onClose}
							>
								<div
									className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-xl"
									onClick={(e) => e.stopPropagation()}
								>
									{type === "video" ? (
										<video
											src={url}
											controls
											autoPlay={isCurrent}
											className="max-h-[88vh] w-auto max-w-full object-contain"
											style={
												isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0)
													? { transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`, touchAction: "none" }
													: { touchAction: "none" }
											}
										/>
									) : (
										<img
											src={url}
											alt={alt}
											loading="eager"
											draggable={false}
											className="max-h-[88vh] w-auto max-w-full select-none object-contain"
											style={
												isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0)
													? { transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`, touchAction: "none" }
													: { touchAction: "none" }
											}
										/>
									)}
									{isCurrent && renderExtraInfo && (
										<div className="absolute bottom-3 left-3 flex items-center gap-2">
											{renderExtraInfo(centerIdx)}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>,
		document.body,
	);
}
