import { ChevronLeft, ChevronRight, X } from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
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
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const [dragOffset, setDragOffset] = useState(0);
	const [noTransition, setNoTransition] = useState(false);
	const [zoomScale, setZoomScale] = useState(1);
	const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const lastDistRef = useRef<number | null>(null);
	const decidedAxisRef = useRef<"h" | "v" | null>(null);
	const isDraggingRef = useRef(false);

	useEffect(() => {
		if (!isOpen) return;
		setCurrentIndex(initialIndex);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
		setDragOffset(0);
		setNoTransition(false);
	}, [isOpen, initialIndex]);

	const goTo = useCallback(
		(idx: number) => {
			if (photos.length === 0) return;
			const wrapped = ((idx % photos.length) + photos.length) % photos.length;
			const isWrap = idx < 0 || idx >= photos.length;

			setDragOffset(0);
			setZoomScale(1);
			setZoomOffset({ x: 0, y: 0 });

			if (isWrap) {
				// Teleport instantly to the wrapped position, then re-enable transition
				setNoTransition(true);
				setCurrentIndex(wrapped);
				requestAnimationFrame(() =>
					requestAnimationFrame(() => setNoTransition(false)),
				);
			} else {
				setCurrentIndex(wrapped);
			}

			onIndexChange?.(wrapped);
		},
		[photos.length, onIndexChange],
	);

	const showPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);
	const showNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);

	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		if (e.touches.length === 1) {
			const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			touchStartRef.current = pt;
			lastTouchRef.current = pt;
			decidedAxisRef.current = null;
			isDraggingRef.current = false;
		} else if (e.touches.length === 2) {
			// Two fingers: enter zoom mode, cancel any in-progress swipe
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
			// Pinch zoom
			if (e.touches.length === 2 && lastDistRef.current !== null) {
				const dist = Math.hypot(
					e.touches[0].clientX - e.touches[1].clientX,
					e.touches[0].clientY - e.touches[1].clientY,
				);
				const delta = dist / lastDistRef.current;
				setZoomScale((prev) => Math.min(Math.max(1, prev * delta), 4));
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
					// Pan zoomed image
					if (lastTouchRef.current) {
						const pdx = e.touches[0].clientX - lastTouchRef.current.x;
						const pdy = e.touches[0].clientY - lastTouchRef.current.y;
						setZoomOffset((prev) => ({ x: prev.x + pdx, y: prev.y + pdy }));
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
			if (dragOffset < -threshold) {
				showNext();
			} else if (dragOffset > threshold) {
				showPrev();
			} else {
				setDragOffset(0);
			}
		} else if (decidedAxisRef.current !== "h") {
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

	if (!isOpen || photos.length === 0) return null;

	const safeIndex = ((currentIndex % photos.length) + photos.length) % photos.length;
	const canAnimate = dragOffset === 0 && !noTransition;

	return createPortal(
		<div className="fixed inset-0 z-[80] bg-black" onClick={onClose}>
			{/* Close */}
			<button
				type="button"
				onClick={(e) => { e.stopPropagation(); onClose(); }}
				className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5"
				aria-label={t("profile_details.close_photo_viewer")}
			>
				<X className="h-5 w-5" />
			</button>

			{/* Prev / Next */}
			{photos.length > 1 && (
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

			{/* Counter */}
			{photos.length > 1 && (
				<p className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] left-1/2 z-[83] -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
					{safeIndex + 1} / {photos.length}
				</p>
			)}

			{/* Carousel */}
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
						transform: `translateX(calc(${-safeIndex} * 100vw + ${dragOffset}px))`,
						transition: canAnimate
							? "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)"
							: "none",
						willChange: "transform",
					}}
				>
					{photos.map((photo, i) => {
						const { url, type, alt } = getMediaInfo(photo);
						const isCurrent = i === safeIndex;
						const inRange = Math.abs(i - safeIndex) <= 2;

						return (
							<div
								key={i}
								className="flex h-full w-screen flex-shrink-0 items-center justify-center p-3 sm:p-8"
								onClick={onClose}
							>
								{inRange ? (
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
												style={isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0) ? {
													transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
													touchAction: "none",
												} : { touchAction: "none" }}
											/>
										) : (
											<img
												src={url}
												alt={alt}
												loading="eager"
												draggable={false}
												className="max-h-[88vh] w-auto max-w-full object-contain select-none"
												style={isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0) ? {
													transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
													touchAction: "none",
												} : { touchAction: "none" }}
											/>
										)}
										{isCurrent && renderExtraInfo && (
											<div className="absolute bottom-3 left-3 flex items-center gap-2">
												{renderExtraInfo(safeIndex)}
											</div>
										)}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</div>,
		document.body,
	);
}
