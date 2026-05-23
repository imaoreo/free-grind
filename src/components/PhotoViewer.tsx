import { ChevronLeft, ChevronRight, X } from "lucide-react";
import React, { useEffect, useRef, useState, useCallback } from "react";
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
	const [zoomScale, setZoomScale] = useState(1);
	const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const lastDistRef = useRef<number | null>(null);
	const swipeStartXRef = useRef<number | null>(null);

	const isInternalChangeRef = useRef(false);

	// Sync currentIndex with initialIndex when it changes from outside
	useEffect(() => {
		if (initialIndex !== currentIndex) {
			setCurrentIndex(initialIndex);
			setZoomScale(1);
			setZoomOffset({ x: 0, y: 0 });
		}
	}, [initialIndex]);

	const handleIndexChangeInternal = useCallback(
		(nextIndex: number) => {
			if (nextIndex === currentIndex) return;
			setCurrentIndex(nextIndex);
			setZoomScale(1);
			setZoomOffset({ x: 0, y: 0 });
			onIndexChange?.(nextIndex);
		},
		[currentIndex, onIndexChange],
	);

	const showPreviousPhoto = useCallback(() => {
		if (!photos.length) return;
		const nextIndex = (currentIndex - 1 + photos.length) % photos.length;
		handleIndexChangeInternal(nextIndex);
	}, [currentIndex, photos.length, handleIndexChangeInternal]);

	const showNextPhoto = useCallback(() => {
		if (!photos.length) return;
		const nextIndex = (currentIndex + 1) % photos.length;
		handleIndexChangeInternal(nextIndex);
	}, [currentIndex, photos.length, handleIndexChangeInternal]);

	const handlePhotoTouchStart = (e: React.TouchEvent) => {
		if (e.touches.length === 1) {
			lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			swipeStartXRef.current = e.touches[0].clientX;
		} else if (e.touches.length === 2) {
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			lastDistRef.current = dist;
		}
	};

	const handlePhotoTouchMove = (e: React.TouchEvent) => {
		if (e.touches.length === 1 && zoomScale > 1 && lastTouchRef.current) {
			const dx = e.touches[0].clientX - lastTouchRef.current.x;
			const dy = e.touches[0].clientY - lastTouchRef.current.y;
			setZoomOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
			lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
		} else if (e.touches.length === 2 && lastDistRef.current) {
			const dist = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			const delta = dist / lastDistRef.current;
			setZoomScale((prev) => Math.min(Math.max(1, prev * delta), 4));
			lastDistRef.current = dist;
		}
	};

	const handlePhotoTouchEnd = (e: React.TouchEvent) => {
		if (zoomScale === 1 && swipeStartXRef.current !== null) {
			const endX = e.changedTouches[0].clientX;
			const deltaX = endX - swipeStartXRef.current;
			if (Math.abs(deltaX) > 50) {
				if (deltaX > 0) {
					showPreviousPhoto();
				} else {
					showNextPhoto();
				}
			}
		}

		lastTouchRef.current = null;
		lastDistRef.current = null;
		swipeStartXRef.current = null;

		if (zoomScale <= 1.05) {
			setZoomScale(1);
			setZoomOffset({ x: 0, y: 0 });
		}
	};

	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
				return;
			}
			if (event.key === "ArrowLeft") {
				showPreviousPhoto();
				return;
			}
			if (event.key === "ArrowRight") {
				showNextPhoto();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose, showPreviousPhoto, showNextPhoto]);

	if (!isOpen || photos.length === 0) return null;

	const safeIndex = Math.min(Math.max(0, currentIndex), photos.length - 1);
	const currentMedia = photos[safeIndex];
	if (!currentMedia) return null;

	const isString = typeof currentMedia === "string";
	const url = isString ? currentMedia : currentMedia.url;
	const type = isString ? "image" : currentMedia.type;
	const alt = isString ? "" : currentMedia.alt;

	return (
		<div
			className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6"
			onClick={onClose}
		>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					onClose();
				}}
				className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+2rem)] z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5"
				aria-label={t("profile_details.close_photo_viewer")}
			>
				<X className="h-5 w-5" />
			</button>

			<div
				className="relative z-[82] flex max-h-full w-full max-w-5xl flex-col items-center justify-center gap-3"
				onClick={(event) => event.stopPropagation()}
				onTouchStart={handlePhotoTouchStart}
				onTouchMove={handlePhotoTouchMove}
				onTouchEnd={handlePhotoTouchEnd}
			>
				{photos.length > 1 && (
					<>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								showPreviousPhoto();
							}}
							className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11"
							aria-label={t("profile_details.previous_photo")}
						>
							<ChevronLeft className="h-5 w-5" />
						</button>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								showNextPhoto();
							}}
							className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11"
							aria-label={t("profile_details.next_photo")}
						>
							<ChevronRight className="h-5 w-5" />
						</button>
					</>
				)}

				<div className="relative flex h-full w-full items-center justify-center overflow-hidden">
					<div className="relative overflow-hidden rounded-xl">
						{type === "video" ? (
							<video
								src={url}
								controls
								autoPlay
								className="max-h-[82vh] w-auto max-w-full object-contain transition-transform duration-200 ease-out will-change-transform"
								style={{
									transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
									transition: lastDistRef.current || lastTouchRef.current ? "none" : undefined,
									touchAction: "none",
								}}
							/>
						) : (
							<img
								src={url}
								alt={alt}
								className="max-h-[82vh] w-auto max-w-full object-contain transition-transform duration-200 ease-out will-change-transform"
								style={{
									transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
									transition: lastDistRef.current || lastTouchRef.current ? "none" : undefined,
									touchAction: "none",
								}}
							/>
						)}
					</div>
				</div>

				{photos.length > 1 && (
					<p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
						{safeIndex + 1} / {photos.length}
					</p>
				)}

				{renderExtraInfo && (
					<div className="flex items-center gap-2">
						{renderExtraInfo(safeIndex)}
					</div>
				)}
			</div>
		</div>
	);
}
