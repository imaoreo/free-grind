import { AlertTriangle, ChevronLeft, ChevronRight, Download, EllipsisVertical, Pause, Play, Volume2, VolumeX } from "lucide-react";
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { isIos, saveMediaToDevice } from "../services/saveMedia";
import { appLog } from "../utils/logger";
import { ProfileImage } from "./ui/profile-image";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";

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
	/** Full-width bar anchored to the bottom (e.g. a reply/react bar) — pushes the page-count pill and renderExtraInfo up out of its way when present. */
	renderFooter?: (index: number) => React.ReactNode;
	/** Chat conversation this media belongs to, if any — saved media is filed under a matching device subfolder instead of a flat Downloads folder. */
	conversationId?: string | null;
	/** When provided (non-empty), the default left/right corner buttons are replaced by a single top header bar — back button, optional albumHeader, and a "more options" menu (save-to-device plus these extra actions). */
	menuActions?: PhotoViewerMenuAction[];
	/** Avatar + name shown next to the back button in the header bar (only used together with menuActions) — mirrors the chat thread header. */
	albumHeader?: {
		avatarUrl: string | null;
		name: string;
		/** Online/distance line shown under the name, e.g. "Online · 3 km" — omitted when not available. */
		subtitle?: string | null;
		isOnline?: boolean;
		/** Tapping the avatar/name opens the profile — omitted (non-interactive) when not provided. */
		onClick?: () => void;
	};
	/** When true, a "could contain sensitive content" gate screen is shown first — the actual media only reveals after the user confirms. Re-shown every time the viewer opens. */
	contentWarning?: boolean;
};

export type PhotoViewerMenuAction = {
	key: string;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	onClick: () => void | Promise<void>;
	disabled?: boolean;
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
	renderFooter,
	conversationId,
	menuActions,
	albumHeader,
	contentWarning,
}: PhotoViewerProps) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const N = photos.length;
	// Fixed header/back-button offset — identical everywhere (sensitive-content
	// gate, default chrome, album header) so switching between them never
	// shifts the back button. The position indicator sits below this, it
	// never pushes the header itself down.
	const chromeTopOffset = "calc(env(safe-area-inset-top, 0px) + clamp(14px, 2.2vw, 28px))";
	// The real chat header vertically centers its back button (items-center)
	// against a taller h-10 avatar, which visually shifts the button ~4px
	// below the row's own top edge. The album header here reproduces that
	// centering naturally; buttons rendered standalone (gate screen,
	// non-album chrome) need this offset added explicitly to land on the
	// exact same pixel as the chat header's back button.
	const chromeButtonTop = `calc(${chromeTopOffset} + 7px)`;

	const [centerIdx, setCenterIdx] = useState(initialIndex);
	const [trackPos, setTrackPos] = useState(1);
	const [noTransition, setNoTransition] = useState(true);
	const [dragOffset, setDragOffset] = useState(0);
	const [zoomScale, setZoomScale] = useState(1);
	const [zoomOffset, setZoomOffset] = useState({ x: 0, y: 0 });
	const [isSaving, setIsSaving] = useState(false);
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [hasAcknowledgedWarning, setHasAcknowledgedWarning] = useState(false);

	const [isVideoPlaying, setIsVideoPlaying] = useState(false);
	const [isVideoMuted, setIsVideoMuted] = useState(false);
	const [showCenterPlayButton, setShowCenterPlayButton] = useState(true);

	const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);

	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
	const lastDistRef = useRef<number | null>(null);
	const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
	const decidedAxisRef = useRef<"h" | "v" | null>(null);
	const isDraggingRef = useRef(false);
	const gestureMovedRef = useRef(false);
	const onIndexChangeRef = useRef(onIndexChange);
	onIndexChangeRef.current = onIndexChange;

	const zoomScaleRef = useRef(zoomScale);
	const zoomOffsetRef = useRef(zoomOffset);
	useEffect(() => { zoomScaleRef.current = zoomScale; }, [zoomScale]);
	useEffect(() => { zoomOffsetRef.current = zoomOffset; }, [zoomOffset]);

	const prevIdx = N > 1 ? (centerIdx - 1 + N) % N : centerIdx;
	const nextIdx = N > 1 ? (centerIdx + 1) % N : centerIdx;

	useLayoutEffect(() => {
		if (!isOpen) return;
		setCenterIdx(initialIndex);
		setTrackPos(1);
		setNoTransition(true);
		setDragOffset(0);
		setZoomScale(1);
		setZoomOffset({ x: 0, y: 0 });
		setIsMenuOpen(false);
		setHasAcknowledgedWarning(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		setIsMenuOpen(false);
		setIsVideoPlaying(false);
		setIsVideoMuted(false);
		setShowCenterPlayButton(true);
	}, [centerIdx]);

	// Auto-hide the big center play/pause button shortly after playback
	// starts — reappears immediately on pause (or on tap, since tapping the
	// video toggles play/pause and re-runs this effect).
	useEffect(() => {
		if (!isVideoPlaying) {
			setShowCenterPlayButton(true);
			return;
		}
		setShowCenterPlayButton(true);
		const timer = setTimeout(() => setShowCenterPlayButton(false), 1200);
		return () => clearTimeout(timer);
	}, [isVideoPlaying]);

	useEffect(() => {
		if (!isMenuOpen) return;
		const handleOutside = (e: Event) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setIsMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handleOutside);
		document.addEventListener("touchstart", handleOutside);
		return () => {
			document.removeEventListener("mousedown", handleOutside);
			document.removeEventListener("touchstart", handleOutside);
		};
	}, [isMenuOpen]);

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

	const clampOffset = useCallback((offset: { x: number; y: number }, scale: number) => {
		const el = mediaRef.current;
		const renderedW = el ? el.clientWidth : window.innerWidth;
		const renderedH = el ? el.clientHeight : window.innerHeight;
		const maxX = (renderedW * (scale - 1)) / 2;
		const maxY = (renderedH * (scale - 1)) / 2;
		return {
			x: Math.min(maxX, Math.max(-maxX, offset.x)),
			y: Math.min(maxY, Math.max(-maxY, offset.y)),
		};
	}, []);

	const handleTouchStart = useCallback((e: React.TouchEvent) => {
		gestureMovedRef.current = false;
		if (e.touches.length === 1) {
			const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
			touchStartRef.current = pt;
			lastTouchRef.current = pt;
			decidedAxisRef.current = null;
			isDraggingRef.current = false;
			lastDistRef.current = null;
			pinchCenterRef.current = null;
		} else if (e.touches.length === 2) {
			const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			lastDistRef.current = Math.hypot(
				e.touches[0].clientX - e.touches[1].clientX,
				e.touches[0].clientY - e.touches[1].clientY,
			);
			pinchCenterRef.current = { x: midX, y: midY };
			decidedAxisRef.current = null;
			isDraggingRef.current = false;
			setDragOffset(0);
		}
	}, []);

	const handleTouchMove = useCallback(
		(e: React.TouchEvent) => {
			// ── 2-finger pinch ──────────────────────────────────────────────────
			if (e.touches.length === 2 && lastDistRef.current !== null) {
				gestureMovedRef.current = true;
				const dist = Math.hypot(
					e.touches[0].clientX - e.touches[1].clientX,
					e.touches[0].clientY - e.touches[1].clientY,
				);
				const ratio = lastDistRef.current > 0 ? dist / lastDistRef.current : 1;
				lastDistRef.current = dist;

				setZoomScale((prev) => {
					const next = Math.min(Math.max(1, prev * ratio), 4);
					if (pinchCenterRef.current && next !== prev) {
						const cx = pinchCenterRef.current.x - window.innerWidth / 2;
						const cy = pinchCenterRef.current.y - window.innerHeight / 2;
						setZoomOffset((prevOffset) =>
							clampOffset(
								{
									x: prevOffset.x - cx * (ratio - 1),
									y: prevOffset.y - cy * (ratio - 1),
								},
								next,
							),
						);
					}
					return next;
				});
				return;
			}

			// ── 1-finger pan ─────────────────────────────────────────────────
			if (e.touches.length !== 1) return;

			const touch = e.touches[0];

			if (!touchStartRef.current) {
				const pt = { x: touch.clientX, y: touch.clientY };
				touchStartRef.current = pt;
				lastTouchRef.current = pt;
				decidedAxisRef.current = null;
				isDraggingRef.current = false;
				return;
			}

			const dx = touch.clientX - touchStartRef.current.x;
			const dy = touch.clientY - touchStartRef.current.y;
			if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
				gestureMovedRef.current = true;
			}

			// When zoomed: always pan in both axes, ignore axis lock entirely
			if (zoomScaleRef.current > 1) {
				const last = lastTouchRef.current ?? { x: touch.clientX, y: touch.clientY };
				const moveDx = touch.clientX - last.x;
				const moveDy = touch.clientY - last.y;
				lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
				setZoomOffset((prev) =>
					clampOffset(
						{ x: prev.x + moveDx, y: prev.y + moveDy },
						zoomScaleRef.current,
					),
				);
				return;
			}

			// Not zoomed: lock axis, swipe left/right to navigate (only when multiple photos)
			if (N < 2) return;
			if (!decidedAxisRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
				decidedAxisRef.current = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
			}

			if (decidedAxisRef.current === "h") {
				isDraggingRef.current = true;
				setDragOffset(dx);
			}

			lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
		},
		[clampOffset, N],
	);

	const handleTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			if (e.touches.length === 1) {
				const pt = { x: e.touches[0].clientX, y: e.touches[0].clientY };
				touchStartRef.current = pt;
				lastTouchRef.current = pt;
				decidedAxisRef.current = null;
				isDraggingRef.current = false;
				lastDistRef.current = null;
				pinchCenterRef.current = null;
				return;
			}

			if (N >= 2 && decidedAxisRef.current === "h" && zoomScaleRef.current === 1 && isDraggingRef.current) {
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
			pinchCenterRef.current = null;
			decidedAxisRef.current = null;
			isDraggingRef.current = false;

			if (zoomScaleRef.current <= 1.05) {
				setZoomScale(1);
				setZoomOffset({ x: 0, y: 0 });
			}
		},
		[dragOffset, showNext, showPrev, N],
	);

	const handleButtonTouchEnd = useCallback(
		(e: React.TouchEvent, action: () => void) => {
			e.stopPropagation();
			e.preventDefault(); // prevent ghost click after touch
			if (!gestureMovedRef.current) {
				action();
			}
		},
		[],
	);

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

	const handleSave = async () => {
		const photo = photos[centerIdx];
		if (!photo || isSaving) return;
		const { url, type } = getMediaInfo(photo);

		setIsSaving(true);
		try {
			const saved = await saveMediaToDevice(url, type, conversationId);
			if (saved) {
				toast.success(
					t(isIos() ? "profile_details.save_to_gallery_success" : "profile_details.save_to_downloads_success"),
				);
			} else {
				toast.error(t("profile_details.save_to_gallery_unsupported"));
			}
		} catch (e) {
			appLog.error("Failed to save media to gallery", e);
			toast.error(
				t(isIos() ? "profile_details.save_to_gallery_error" : "profile_details.save_to_downloads_error"),
			);
		} finally {
			setIsSaving(false);
		}
	};

	const toggleVideoPlay = () => {
		const el = mediaRef.current;
		if (!el || !(el instanceof HTMLVideoElement)) return;
		if (el.paused) void el.play();
		else el.pause();
	};

	const toggleVideoMute = () => {
		setIsVideoMuted((prev) => !prev);
	};

	if (!isOpen || N === 0) return null;

	if (contentWarning && !hasAcknowledgedWarning) {
		return createPortal(
			<div
				className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-6 bg-black px-8 text-center"
				onClick={onClose}
			>
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); onClose(); }}
					className="absolute left-3 inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90 sm:left-5"
					style={{ top: chromeButtonTop }}
					aria-label={t("profile_details.close_photo_viewer")}
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)]">
					<AlertTriangle className="h-8 w-8 text-[var(--accent-contrast)]" />
				</div>
				<div className="space-y-2" onClick={(e) => e.stopPropagation()}>
					<p className="text-lg font-semibold text-white">
						{t("shared_albums.sensitive_content_title", { defaultValue: "Sensitive content" })}
					</p>
					<p className="max-w-xs text-sm text-white/70">
						{t("shared_albums.sensitive_content_description", {
							defaultValue: "This album could contain sensitive content.",
						})}
					</p>
				</div>
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); setHasAcknowledgedWarning(true); }}
					className="rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition active:scale-95"
				>
					{t("shared_albums.sensitive_content_confirm", { defaultValue: "View album" })}
				</button>
			</div>,
			document.body,
		);
	}

	const slots: Array<{ photoIndex: number; slotIndex: number }> =
		N <= 1
			? [{ photoIndex: centerIdx, slotIndex: 0 }]
			: [
					{ photoIndex: prevIdx, slotIndex: 0 },
					{ photoIndex: centerIdx, slotIndex: 1 },
					{ photoIndex: nextIdx, slotIndex: 2 },
				];

	const activeSlot = N <= 1 ? 0 : trackPos;
	const canAnimate = dragOffset === 0 && !noTransition;
	const footerContent = renderFooter ? renderFooter(centerIdx) : null;
	// centerIdx can briefly point past the end of `photos` if a caller
	// mutates the array (e.g. album content reloading with fewer items)
	// without also re-clamping the index it's driving — fall back to the
	// last valid photo instead of crashing on `.url` of undefined.
	const safeCenterIdx = centerIdx >= 0 && centerIdx < N ? centerIdx : N - 1;
	const currentMedia = getMediaInfo(photos[safeCenterIdx]);
	const isCurrentVideo = currentMedia.type === "video";

	return createPortal(
		<div className="fixed inset-0 z-[80] bg-black" onClick={onClose}>
			{menuActions && menuActions.length > 0 ? (
				<>
					<div
						className="pointer-events-none absolute inset-x-0 top-0 z-[82]"
						style={{ height: "14rem", background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
						aria-hidden="true"
					/>
					<div
						className="pointer-events-none absolute inset-x-0 bottom-0 z-[82]"
						style={{ height: "16rem", background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)" }}
						aria-hidden="true"
					/>
					<div
						className="pointer-events-none absolute inset-x-0 top-0 z-[83] px-3 sm:px-5"
						style={{ paddingTop: chromeTopOffset }}
					>
						<div
							className="pointer-events-auto flex w-full items-center justify-between gap-3"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex min-w-0 items-center gap-3">
							<button
								type="button"
								onClick={onClose}
								onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
								onTouchEnd={(e) => handleButtonTouchEnd(e, onClose)}
								className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90"
								aria-label={t("profile_details.close_photo_viewer")}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>

							{albumHeader && (
								<button
									type="button"
									onClick={albumHeader.onClick}
									disabled={!albumHeader.onClick}
									className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
								>
									<div
										className={`h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 bg-white/10 ${
											albumHeader.isOnline ? "border-emerald-500" : "border-white/30"
										}`}
									>
										<ProfileImage src={albumHeader.avatarUrl} alt={albumHeader.name} />
									</div>
									<div className="min-w-0">
										<p className="truncate text-lg font-semibold text-white">{albumHeader.name}</p>
										{albumHeader.subtitle && (
											<p className="truncate text-sm text-white/70">{albumHeader.subtitle}</p>
										)}
									</div>
								</button>
							)}
						</div>

						<div ref={menuRef} className="relative shrink-0">
							<button
								type="button"
								onClick={() => setIsMenuOpen((v) => !v)}
								onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
								onTouchEnd={(e) => handleButtonTouchEnd(e, () => setIsMenuOpen((v) => !v))}
								aria-label="More options"
								aria-expanded={isMenuOpen}
								className="inline-flex shrink-0 items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90"
							>
								<EllipsisVertical className="h-4 w-4" />
							</button>
							{isMenuOpen && (
								<div className="absolute right-0 top-[calc(100%+0.5rem)] min-w-[200px] overflow-hidden rounded-xl border border-white/15 bg-black/90 py-1.5 shadow-xl backdrop-blur-md">
									<button
										type="button"
										onClick={() => { setIsMenuOpen(false); void handleSave(); }}
										disabled={isSaving}
										className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
									>
										<Download className="h-4 w-4 opacity-80" />
										{t("profile_details.save")}
									</button>
									{menuActions.map((action) => (
										<button
											key={action.key}
											type="button"
											onClick={() => { setIsMenuOpen(false); void action.onClick(); }}
											disabled={action.disabled}
											className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
										>
											<action.icon className="h-4 w-4 opacity-80" />
											{action.label}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				</div>
				</>
			) : (
				<>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); onClose(); }}
						onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
						onTouchEnd={(e) => handleButtonTouchEnd(e, onClose)}
						className="absolute left-3 z-[83] inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90 sm:left-5"
						style={{ top: chromeButtonTop }}
						aria-label={t("profile_details.close_photo_viewer")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>

					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); void handleSave(); }}
						onTouchEnd={(e) => handleButtonTouchEnd(e, () => void handleSave())}
						disabled={isSaving}
						className="absolute right-3 z-[83] inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90 disabled:opacity-50 sm:right-5"
						style={{ top: chromeButtonTop }}
						aria-label={t("profile_details.save")}
					>
						<Download className="h-4 w-4" />
					</button>
				</>
			)}

			{N > 1 && isDesktop && (
				<>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); showPrev(); }}
						onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
						onTouchEnd={(e) => handleButtonTouchEnd(e, showPrev)}
						className="absolute left-4 top-1/2 z-[83] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md transition active:scale-90"
						aria-label={t("profile_details.previous_photo")}
					>
						<ChevronLeft className="h-5 w-5" />
					</button>
					<button
						type="button"
						onClick={(e) => { e.stopPropagation(); showNext(); }}
						onTouchStart={(e) => { e.stopPropagation(); gestureMovedRef.current = false; }}
						onTouchEnd={(e) => handleButtonTouchEnd(e, showNext)}
						className="absolute right-4 top-1/2 z-[83] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md transition active:scale-90"
						aria-label={t("profile_details.next_photo")}
					>
						<ChevronRight className="h-5 w-5" />
					</button>
				</>
			)}

			{N > 1 && (
				<p
					className={`absolute left-1/2 z-[83] -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-md ${
						footerContent
							? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
							: "bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
					}`}
				>
					{centerIdx + 1} / {N}
				</p>
			)}

			{isCurrentVideo && (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); toggleVideoPlay(); }}
					aria-label={isVideoPlaying ? t("profile_details.pause_video", { defaultValue: "Pause" }) : t("profile_details.play_video", { defaultValue: "Play" })}
					className={`absolute left-1/2 top-1/2 z-[84] flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-opacity duration-300 active:scale-90 ${
						showCenterPlayButton ? "opacity-100" : "pointer-events-none opacity-0"
					}`}
					style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.55))" }}
				>
					{isVideoPlaying ? <Pause className="h-9 w-9 fill-current" /> : <Play className="h-9 w-9 fill-current" />}
				</button>
			)}

			{isCurrentVideo && (
				<div
					className={`absolute right-3 z-[84] flex items-center gap-2 sm:right-5 ${
						footerContent
							? "bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
							: "bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						onClick={toggleVideoMute}
						aria-label={isVideoMuted ? t("profile_details.unmute_video", { defaultValue: "Unmute" }) : t("profile_details.mute_video", { defaultValue: "Mute" })}
						className="inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90"
					>
						{isVideoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
					</button>
				</div>
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

						const zoomStyle =
							isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0)
								? {
										transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
										touchAction: "none" as const,
									}
								: { touchAction: "none" as const };

						return (
							<div
								key={slotIndex}
								className="flex h-full w-screen flex-shrink-0 items-center justify-center"
								onClick={onClose}
							>
								<div
									className="relative flex h-full w-full items-center justify-center overflow-hidden"
									onClick={(e) => {
										// This div now spans the full slide (including the
										// letterboxed black area around non-full-height
										// images/videos, so zoom isn't clipped to the media's
										// own small box) — only swallow the click when the
										// media itself was tapped, so tapping the black area
										// still bubbles up to the outer onClose handler.
										if (e.target !== e.currentTarget) {
											e.stopPropagation();
											if (isCurrent && type === "video") toggleVideoPlay();
										}
									}}
								>
									{type === "video" ? (
										<video
											ref={isCurrent ? (mediaRef as React.RefObject<HTMLVideoElement>) : undefined}
											src={url}
											autoPlay={isCurrent}
											playsInline
											muted={isCurrent ? isVideoMuted : true}
											className="h-auto max-h-[100dvh] w-full object-contain"
											style={zoomStyle}
											onPlay={isCurrent ? () => setIsVideoPlaying(true) : undefined}
											onPause={isCurrent ? () => setIsVideoPlaying(false) : undefined}
											onEnded={isCurrent ? () => setIsVideoPlaying(false) : undefined}
										/>
									) : (
										<img
											ref={isCurrent ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
											src={url}
											alt={alt}
											loading="eager"
											draggable={false}
											className="h-auto max-h-[100dvh] w-full select-none object-contain"
											style={zoomStyle}
										/>
									)}
								</div>
							</div>
						);
					})}
				</div>

			</div>

			{renderExtraInfo && (
				// Positioned against the viewer's full-width root rather than nested inside
				// the per-slide image box — that box shrinks to the rendered image's width,
				// which for narrow/portrait images is often narrower than this pill's natural
				// width and was forcing the text to wrap.
				<div
					className="absolute left-1/2 z-[83] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2"
					style={{ top: `calc(${chromeButtonTop} + 1rem)` }}
					onClick={(e) => e.stopPropagation()}
				>
					{renderExtraInfo(centerIdx)}
				</div>
			)}

			{footerContent && (
				<div
					className="absolute inset-x-0 bottom-0 z-[83]"
					onClick={(e) => e.stopPropagation()}
				>
					{footerContent}
				</div>
			)}
		</div>,
		document.body,
	);
}