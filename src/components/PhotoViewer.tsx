import { AlertTriangle, ChevronLeft, ChevronRight, Download, EllipsisVertical, Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
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

/**
 * `object-fit: contain` doesn't shrink the <img>/<video> element's own box to
 * match the picture's aspect ratio — it letterboxes the content *inside*
 * whatever box the element ends up with (here, one that often ends up
 * full-screen-sized). That means the element itself, not some separate
 * wrapper, is what gets hit-tested over the "black" letterboxed area too.
 * This reproduces the object-contain layout math to find where the content
 * is actually drawn, so callers can tell a real tap-on-the-picture apart from
 * a tap on the empty letterboxed space around it. Returns null if the
 * element's intrinsic size isn't known yet (e.g. video metadata not loaded).
 */
function getObjectContainRect(el: HTMLImageElement | HTMLVideoElement): DOMRect | null {
	const box = el.getBoundingClientRect();
	const naturalW = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
	const naturalH = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;
	if (!naturalW || !naturalH || !box.width || !box.height) return null;

	const boxRatio = box.width / box.height;
	const mediaRatio = naturalW / naturalH;
	const contentW = mediaRatio > boxRatio ? box.width : box.height * mediaRatio;
	const contentH = mediaRatio > boxRatio ? box.width / mediaRatio : box.height;
	const left = box.left + (box.width - contentW) / 2;
	const top = box.top + (box.height - contentH) / 2;

	return new DOMRect(left, top, contentW, contentH);
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
	const [isVideoMuted, setIsVideoMuted] = useState(true);
	// Drives the fade of every chrome element (header, buttons, page-count
	// pill, video controls, footer) on mobile — a tap on the media toggles
	// this. Always treated as visible on desktop (see `chromeVisible` below),
	// since this is a mobile-only gesture.
	const [showChrome, setShowChrome] = useState(true);
	const [videoCurrentTime, setVideoCurrentTime] = useState(0);
	const [videoDuration, setVideoDuration] = useState(0);
	const [isScrubbing, setIsScrubbing] = useState(false);
	// Mirrors isScrubbing but read from the high-frequency pointermove/timeupdate
	// handlers below — a ref avoids re-rendering the whole viewer on every move.
	const isScrubbingRef = useRef(false);
	const trackBarRef = useRef<HTMLDivElement | null>(null);

	const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
	// Video elements are torn down and recreated whenever a carousel slot's
	// underlying photo/type changes (e.g. swiping past an image and back to a
	// video) — the browser still has the bytes cached, but a fresh element has
	// to decode a frame again regardless. Tracking which URLs have already
	// shown a frame once lets a revisit skip the spinner/fade entirely, since
	// the decode is effectively instant from cache — without this, every
	// revisit replayed the full "loading" animation for no real reason.
	const readyVideoUrlsRef = useRef<Set<string>>(new Set());

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

	// Desktop-only mouse equivalents of the touch pinch-zoom/pan above: wheel
	// to zoom (centered on the cursor), click-and-drag to pan once zoomed.
	const trackContainerRef = useRef<HTMLDivElement | null>(null);
	const isMousePanningRef = useRef(false);
	const mouseLastPosRef = useRef<{ x: number; y: number } | null>(null);
	const hasPannedRef = useRef(false);

	const prevIdx = N > 1 ? (centerIdx - 1 + N) % N : centerIdx;
	const nextIdx = N > 1 ? (centerIdx + 1) % N : centerIdx;

	// centerIdx can briefly point past the end of `photos` if a caller
	// mutates the array (e.g. album content reloading with fewer items)
	// without also re-clamping the index it's driving — fall back to the
	// last valid photo instead of crashing on `.url` of undefined. Computed
	// early (not just before the JSX return) since the chrome auto-hide
	// effect below needs to know the current media type too.
	const safeCenterIdx = N > 0 && centerIdx >= 0 && centerIdx < N ? centerIdx : N - 1;
	const currentMedia = N > 0 ? getMediaInfo(photos[safeCenterIdx]) : null;
	const isCurrentVideo = currentMedia?.type === "video";

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
		setShowChrome(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isOpen]);

	useEffect(() => {
		setIsMenuOpen(false);
		setIsVideoPlaying(false);
		setIsVideoMuted(true);
		// showChrome is deliberately left alone here — swiping to another
		// slide must not re-reveal chrome that a tap had hidden. Pausing a
		// video (including reaching its end) forces it back on explicitly via
		// the onPause/onEnded handlers below instead.
		setVideoCurrentTime(0);
		setVideoDuration(0);
		// preload="metadata" starts loading every carousel slot immediately, so
		// a slide swiped into view has often already fired its loadedmetadata/
		// durationchange events while it was still an off-screen prev/next
		// preview — back when its onLoadedMetadata/onDurationChange handlers
		// were unwired (isCurrent was false). Those native events don't fire
		// again just because a re-render attaches handlers now, so the seek
		// bar was stuck reading a duration of 0 forever. React has already
		// re-pointed mediaRef at this slide by the time this effect runs, so
		// read whatever the element already knows directly instead.
		const el = mediaRef.current;
		if (el instanceof HTMLVideoElement && Number.isFinite(el.duration)) {
			setVideoDuration(el.duration);
			setVideoCurrentTime(el.currentTime);
		}
	}, [centerIdx]);

	// Native-player-style chrome auto-hide for videos: once playback starts,
	// fade everything out shortly after — a tap while hidden brings it back
	// (see the media click handler below) without pausing, which re-arms this
	// same timer.
	useEffect(() => {
		if (!isCurrentVideo || !isVideoPlaying || !showChrome) return;
		const timer = setTimeout(() => setShowChrome(false), 2500);
		return () => clearTimeout(timer);
	}, [isCurrentVideo, isVideoPlaying, showChrome]);

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

	// Mouse wheel zoom, centered on the cursor — desktop's equivalent of the
	// touch pinch gesture. Attached as a native listener (not React's onWheel)
	// because React registers wheel listeners as passive, which silently
	// ignores preventDefault().
	useEffect(() => {
		if (!isOpen || !isDesktop) return;
		const el = trackContainerRef.current;
		if (!el) return;

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const factor = Math.exp(-e.deltaY * 0.0015);
			setZoomScale((prev) => {
				const next = Math.min(Math.max(1, prev * factor), 4);
				if (next === prev) return prev;
				if (next <= 1) {
					setZoomOffset({ x: 0, y: 0 });
					return 1;
				}
				const cx = e.clientX - window.innerWidth / 2;
				const cy = e.clientY - window.innerHeight / 2;
				const ratio = next / prev;
				setZoomOffset((prevOffset) =>
					clampOffset(
						{ x: prevOffset.x - cx * (ratio - 1), y: prevOffset.y - cy * (ratio - 1) },
						next,
					),
				);
				return next;
			});
		};

		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
		// hasAcknowledgedWarning: the sensitive-content gate renders a totally
		// different tree (trackContainerRef never mounts there), so this needs
		// to re-run once the real viewer mounts after the gate is dismissed.
	}, [isOpen, isDesktop, clampOffset, hasAcknowledgedWarning]);

	// Click-and-drag panning once zoomed in — mouse equivalent of the touch
	// 1-finger pan. Listens on window (not the media element) so dragging
	// past the media's edge doesn't drop the gesture.
	const handleMediaMouseDown = useCallback((e: React.MouseEvent) => {
		if (!isDesktop || zoomScaleRef.current <= 1) return;
		e.preventDefault();
		isMousePanningRef.current = true;
		hasPannedRef.current = false;
		mouseLastPosRef.current = { x: e.clientX, y: e.clientY };
	}, [isDesktop]);

	useEffect(() => {
		if (!isDesktop) return;

		const onMouseMove = (e: MouseEvent) => {
			if (!isMousePanningRef.current || !mouseLastPosRef.current) return;
			// The button can be released outside the window/webview (e.g.
			// dragged off the app) without ever firing our window "mouseup"
			// listener — without this check panning (and the click-swallowing
			// it triggers, see hasPannedRef below) would get stuck on
			// permanently, silently breaking every future click in the viewer,
			// including tap-to-close on the black background.
			if (e.buttons === 0) {
				isMousePanningRef.current = false;
				mouseLastPosRef.current = null;
				return;
			}
			const dx = e.clientX - mouseLastPosRef.current.x;
			const dy = e.clientY - mouseLastPosRef.current.y;
			if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasPannedRef.current = true;
			mouseLastPosRef.current = { x: e.clientX, y: e.clientY };
			setZoomOffset((prev) => clampOffset({ x: prev.x + dx, y: prev.y + dy }, zoomScaleRef.current));
		};
		const onMouseUp = () => {
			isMousePanningRef.current = false;
			mouseLastPosRef.current = null;
		};

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [isDesktop, clampOffset]);

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
			// A real tap's finger position drifts a few px even when the user
			// means to hold still — 4px was tight enough that an ordinary tap
			// routinely got misread as a gesture, which (via the chrome-toggle
			// tap handler below) silently swallowed the tap instead of either
			// toggling chrome or closing the viewer. 10px matches standard
			// touch-slop conventions and still fires well before the 6px axis
			// lock or the swipe/pan thresholds elsewhere in this file.
			if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
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

	const handleSeek = useCallback((clientX: number) => {
		const el = mediaRef.current;
		const bar = trackBarRef.current;
		if (!el || !bar || !(el instanceof HTMLVideoElement) || !videoDuration) return;
		const rect = bar.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
		el.currentTime = ratio * videoDuration;
		setVideoCurrentTime(el.currentTime);
	}, [videoDuration]);

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
	// The tap-to-hide-chrome gesture is mobile-only — desktop keeps chrome on
	// permanently (showChrome still exists in state there, it's just never
	// toggled since the click handler below only flips it off-desktop).
	const chromeVisible = isDesktop || showChrome;
	const chromeFadeClass = `transition-opacity duration-300 ${chromeVisible ? "opacity-100" : "pointer-events-none opacity-0"}`;

	return createPortal(
		<div className="fixed inset-0 z-[80] bg-black" onClick={onClose}>
			{isCurrentVideo && !(menuActions && menuActions.length > 0) && (
				// Same darkening treatment as the album header's top gradient —
				// the seek bar/mute button dropped their own chip backgrounds, so
				// this is what keeps them legible over bright video content instead.
				<div
					className={`pointer-events-none absolute inset-x-0 bottom-0 z-[82] ${chromeFadeClass}`}
					style={{ height: "16rem", background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)" }}
					aria-hidden="true"
				/>
			)}
			{menuActions && menuActions.length > 0 ? (
				<>
					<div
						className={`pointer-events-none absolute inset-x-0 top-0 z-[82] ${chromeFadeClass}`}
						style={{ height: "14rem", background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
						aria-hidden="true"
					/>
					<div
						className={`pointer-events-none absolute inset-x-0 bottom-0 z-[82] ${chromeFadeClass}`}
						style={{ height: "16rem", background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)" }}
						aria-hidden="true"
					/>
					<div
						className={`pointer-events-none absolute inset-x-0 top-0 z-[83] px-3 sm:px-5 ${chromeFadeClass}`}
						style={{ paddingTop: chromeTopOffset }}
					>
						<div
							className={`flex w-full items-center justify-between gap-3 ${chromeVisible ? "pointer-events-auto" : "pointer-events-none"}`}
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
						className={`absolute left-3 z-[83] inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90 sm:left-5 ${chromeFadeClass}`}
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
						className={`absolute right-3 z-[83] inline-flex items-center justify-center rounded-xl border border-white/45 bg-black/40 p-2 text-white backdrop-blur-md transition active:scale-90 disabled:opacity-50 sm:right-5 ${chromeFadeClass}`}
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
				// Pushed further up whenever the video seek bar/mute row is also on
				// screen — that row is full-width, so this pill (which otherwise sits
				// right where it does) would sit right underneath/against it instead
				// of clearing it.
				<p
					className={`absolute left-1/2 z-[83] -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs font-medium text-white shadow-lg backdrop-blur-md ${chromeFadeClass} ${
						isCurrentVideo
							? footerContent
								? "bottom-[calc(env(safe-area-inset-bottom,0px)+9.25rem)]"
								: "bottom-[calc(env(safe-area-inset-bottom,0px)+4.75rem)]"
							: footerContent
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
					className={`absolute left-1/2 top-1/2 z-[84] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-lg backdrop-blur-md active:scale-90 ${chromeFadeClass}`}
				>
					{isVideoPlaying ? <Pause className="h-7 w-7 fill-current" /> : <Play className="h-7 w-7 fill-current pl-0.5" />}
				</button>
			)}

			{isCurrentVideo && (
				// Seek bar + mute toggle share one control row (rather than the mute
				// button floating alone bottom-right) — sits above the page-count
				// pill (1.25rem/5.5rem above the safe area), clearing both it and the
				// footer/reply bar underneath instead of overlapping.
				<div
					className={`absolute inset-x-0 z-[84] flex items-center gap-3 px-6 sm:px-8 ${chromeFadeClass} ${
						footerContent
							? "bottom-[calc(env(safe-area-inset-bottom,0px)+6.75rem)]"
							: "bottom-[calc(env(safe-area-inset-bottom,0px)+2.25rem)]"
					}`}
					onClick={(e) => e.stopPropagation()}
				>
					<div
						ref={trackBarRef}
						className="flex h-4 flex-1 cursor-pointer items-center touch-none"
						onClick={(e) => handleSeek(e.clientX)}
						onPointerDown={(e) => {
							e.currentTarget.setPointerCapture(e.pointerId);
							isScrubbingRef.current = true;
							setIsScrubbing(true);
							handleSeek(e.clientX);
						}}
						onPointerMove={(e) => {
							if (isScrubbingRef.current) handleSeek(e.clientX);
						}}
						onPointerUp={() => {
							isScrubbingRef.current = false;
							setIsScrubbing(false);
						}}
					>
						<div className={`w-full overflow-hidden rounded-full bg-white/35 transition-[height] ${isScrubbing ? "h-1.5" : "h-1"}`}>
							<div
								className="h-full rounded-full bg-[var(--accent)]"
								style={{
									// A min-width floor (rather than a literal 0-100%) keeps a
									// small visible nub at the current position even at 0:00 —
									// without it, the bar reads as empty/inert until you've
									// already played or scrubbed some way into the video.
									width: videoDuration
										? `max(6px, ${Math.min(100, (videoCurrentTime / videoDuration) * 100)}%)`
										: "0px",
								}}
							/>
						</div>
					</div>
					<button
						type="button"
						onClick={toggleVideoMute}
						aria-label={isVideoMuted ? t("profile_details.unmute_video", { defaultValue: "Unmute" }) : t("profile_details.mute_video", { defaultValue: "Mute" })}
						className="inline-flex shrink-0 items-center justify-center p-1 text-white transition active:scale-90"
						style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.7))" }}
					>
						{isVideoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
					</button>
				</div>
			)}

			<div
				ref={trackContainerRef}
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

						// Only hint at the drag-to-pan affordance once actually zoomed —
						// a "zoom-in" cursor beforehand reads as "click to zoom", but
						// zooming here is wheel/scroll-driven, not click-driven.
						const desktopCursor = isDesktop && isCurrent && zoomScale > 1
							? ("grab" as const)
							: undefined;

						const zoomStyle =
							isCurrent && (zoomScale !== 1 || zoomOffset.x !== 0 || zoomOffset.y !== 0)
								? {
										transform: `translate(${zoomOffset.x}px, ${zoomOffset.y}px) scale(${zoomScale})`,
										touchAction: "none" as const,
									}
								: { touchAction: "none" as const };

						return (
							<div
								// Keyed by photoIndex (not slotIndex) so that when a swipe
								// promotes the already-loaded "next"/"prev" preview into the
								// center position, React moves that same DOM node instead of
								// tearing it down and remounting a fresh one in its place —
								// otherwise a video that had *just* finished decoding its
								// preview frame would reload from scratch and flash black
								// again the moment it becomes the active slide. Falls back to
								// slotIndex for N<=2, where prevIdx and nextIdx are the same
								// photo and would otherwise collide on one key.
								key={N <= 2 ? slotIndex : photoIndex}
								// overflow-hidden lives here so the clip boundary for a
								// zoomed image/video is the full slide, not some smaller box.
								className="flex h-full w-screen flex-shrink-0 items-center justify-center overflow-hidden"
								onClick={onClose}
							>
								<div
									className="relative w-full"
									onClick={(e) => {
										// A desktop drag-to-pan ends with a click firing on
										// mouseup (unlike touch, where a moved gesture doesn't
										// produce one) — swallow that one click so it doesn't
										// also close the viewer or toggle video playback.
										if (hasPannedRef.current) {
											hasPannedRef.current = false;
											e.stopPropagation();
											return;
										}
										// The <img>/<video> element's own box is *not* shrunk to
										// the picture's aspect ratio — object-contain instead
										// letterboxes the content *inside* that (often
										// full-screen-sized) box, so the element itself covers
										// the "black" letterboxed area too and is always what
										// gets click-targeted there. Compute where the content
										// is actually drawn and only treat it as a media click
										// if the click landed inside that computed rect —
										// otherwise let it bubble up to onClose.
										const mediaEl = isCurrent ? mediaRef.current : null;
										const rect = mediaEl ? getObjectContainRect(mediaEl) : null;
										const clickedMedia = !!rect &&
											e.clientX >= rect.left && e.clientX <= rect.right &&
											e.clientY >= rect.top && e.clientY <= rect.bottom;
										if (clickedMedia) {
											e.stopPropagation();
											if (isDesktop) {
												// Desktop has no tap-to-hide chrome — a click on the
												// video keeps its old direct play/pause behavior.
												if (isCurrent && type === "video") toggleVideoPlay();
											} else if (!gestureMovedRef.current) {
												// A pinch/pan already sets gestureMovedRef — this
												// only fires for a clean tap, so zooming never toggles
												// chrome. Videos toggle chrome here too (not
												// play/pause) — playback is only ever driven by the
												// explicit center button now. Always toggles (even
												// paused/freshly-swiped-to video) — nothing else forces
												// chrome back on except an actual pause/end event, so a
												// hidden-then-swiped-to video must stay tap-revealable.
												setShowChrome((prev) => !prev);
											}
										}
									}}
								>
									{type === "video" ? (() => {
										const wasReady = readyVideoUrlsRef.current.has(url);
										return (
											<>
												{/* Positioned elements always paint above static in-flow content
												    (the video below isn't positioned, so its opacity fade alone
												    never covers this) — explicitly hidden in onSeeked once the
												    preview frame is ready, so it doesn't linger over playback.
												    Opacity always starts at 0, even for a URL seen before this
												    session — decode isn't guaranteed instant just because the
												    bytes may be cache-warm, and revealing early risks exposing
												    Android's native "buffering" chrome for however long it takes.
												    A shorter transition is used for a revisit only to make the
												    (normally-fast) reveal feel snappier, never to skip the wait. */}
												<div className="js-video-spinner pointer-events-none absolute inset-0 flex items-center justify-center">
													<Loader2 className="h-6 w-6 animate-spin text-white/60" />
												</div>
												<video
													ref={isCurrent ? (mediaRef as React.RefObject<HTMLVideoElement>) : undefined}
													src={url}
													preload="metadata"
													playsInline
													muted={isCurrent ? isVideoMuted : true}
													className={`h-auto max-h-[100dvh] w-full object-contain opacity-0 transition-opacity ${wasReady ? "duration-100" : "duration-300"}`}
													style={{ ...zoomStyle, cursor: desktopCursor }}
													onMouseDown={isCurrent ? handleMediaMouseDown : undefined}
													onPlay={isCurrent ? () => setIsVideoPlaying(true) : undefined}
													onPause={isCurrent ? () => { setIsVideoPlaying(false); setShowChrome(true); } : undefined}
													onEnded={isCurrent ? () => { setIsVideoPlaying(false); setShowChrome(true); } : undefined}
													onTimeUpdate={isCurrent ? (e) => {
														if (!isScrubbingRef.current) setVideoCurrentTime(e.currentTarget.currentTime);
													} : undefined}
													onLoadedMetadata={(e) => {
														if (isCurrent) setVideoDuration(e.currentTarget.duration);
														// Seeking to a hair past 0 forces the browser to decode and
														// display a real frame instead of playback not having started
														// yet — this is the "preview" frame shown while paused.
														e.currentTarget.currentTime = 0.001;
													}}
													onDurationChange={isCurrent ? (e) => setVideoDuration(e.currentTarget.duration) : undefined}
													onLoadStart={(e) => {
														// The DOM node for a given slot is reused as the carousel
														// advances (only its `src` changes) — reset back to hidden
														// so a spinner/opacity left over from the previous video
														// doesn't leak into this one's load.
														const el = e.currentTarget;
														el.style.opacity = "0";
														const spinner = el.parentElement?.querySelector<HTMLElement>(".js-video-spinner");
														if (spinner) spinner.style.display = "";
													}}
													onSeeked={(e) => {
														const el = e.currentTarget;
														el.style.opacity = "1";
														readyVideoUrlsRef.current.add(url);
														const spinner = el.parentElement?.querySelector<HTMLElement>(".js-video-spinner");
														if (spinner) spinner.style.display = "none";
													}}
												/>
											</>
										);
									})() : (
										<img
											ref={isCurrent ? (mediaRef as React.RefObject<HTMLImageElement>) : undefined}
											src={url}
											alt={alt}
											loading="eager"
											draggable={false}
											className="h-auto max-h-[100dvh] w-full select-none object-contain"
											style={{ ...zoomStyle, cursor: desktopCursor }}
											onMouseDown={isCurrent ? handleMediaMouseDown : undefined}
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
					className={`absolute left-1/2 z-[83] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 ${chromeFadeClass}`}
					style={{ top: `calc(${chromeButtonTop} + 1rem)` }}
					onClick={(e) => e.stopPropagation()}
				>
					{renderExtraInfo(centerIdx)}
				</div>
			)}

			{footerContent && (
				// No stopPropagation here — this wrapper spans the footer's full
				// (often padded/gradient) bounding box, not just its visible
				// controls, so blanket-swallowing clicks on it made tapping the
				// "black" gap above the reply bar silently do nothing instead of
				// closing the viewer. Callers of renderFooter (PhotoActionBar) are
				// responsible for stopping propagation on their own actual
				// interactive row instead.
				<div className={`absolute inset-x-0 bottom-0 z-[83] ${chromeFadeClass}`}>
					{footerContent}
				</div>
			)}
		</div>,
		document.body,
	);
}