import { Flame } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

type TapSelectorProps = {
	profileId: string;
	onTapProfile?: (profileId: string, tapId: number) => void;
	isTapDisabled?: boolean;
	isTapBlocked?: boolean;
	isTapActive: boolean;
	tapId: number;
	tapButtonClassName: string;
	onInternalTap?: (profileId: string, tapId: number) => Promise<any>;
};

const emojiColors: Record<number, string> = {
	0: "rgba(255, 200, 0, 0.8)", // 👋
	1: "rgba(255, 140, 0, 0.8)", // 🔥
	2: "rgba(168, 85, 247, 0.8)", // 😈
};

export function TapSelector({
	profileId,
	onTapProfile,
	isTapDisabled = false,
	isTapBlocked = false,
	isTapActive,
	tapId,
	tapButtonClassName,
	onInternalTap,
}: TapSelectorProps) {
	const { t } = useTranslation();
	const [isIgniting, setIsIgniting] = useState(false);
	const [isRippling, setIsRippling] = useState(false);
	const [showTapPicker, setShowTapPicker] = useState(false);
	const [previewId, setPreviewId] = useState<number | null>(null);
	const [hoveredId, setHoveredId] = useState<number | null>(null);
	const [isEmojiHidden, setIsEmojiHidden] = useState(false);
	const [isTappingInternal, setIsTappingInternal] = useState(false);
	const longPressTimer = useRef<NodeJS.Timeout | null>(null);
	const switchTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastSwitchedId = useRef<number | null>(null);
	const lastSeenTapId = useRef<number | null>(isTapActive ? tapId : null);

	// Calculate current halo color based on active tap or preview
	const activeId = previewId !== null ? previewId : tapId;
	const currentHaloColor = emojiColors[activeId] || "#ffcc01";

	// Visual Feedback Effect
	useEffect(() => {
		if (isTapActive) {
			const isNewTap = lastSeenTapId.current !== tapId;
			const isManuallyTriggered = previewId === tapId;

			if (isNewTap && !isManuallyTriggered) {
				setIsIgniting(true);
				setIsRippling(true);
			}

			lastSeenTapId.current = tapId;

			const igniteTimer = setTimeout(() => setIsIgniting(false), 700);
			const rippleTimer = setTimeout(() => setIsRippling(false), 800);
			const previewTimer = setTimeout(() => setPreviewId(null), 2000);

			return () => {
				clearTimeout(igniteTimer);
				clearTimeout(rippleTimer);
				clearTimeout(previewTimer);
			};
		} else {
			const timer = setTimeout(() => {
				lastSeenTapId.current = null;
			}, 500);
			return () => clearTimeout(timer);
		}
	}, [isTapActive, tapId, previewId]);

	const switchEmoji = (newId: number | null) => {
		if (newId === lastSwitchedId.current) return;
		lastSwitchedId.current = newId;

		// Cancel any pending switch to prevent jitter
		if (switchTimerRef.current) {
			clearTimeout(switchTimerRef.current);
		}

		setIsEmojiHidden(true);

		// Minimal timeout to allow CSS transition to reset or trigger
		switchTimerRef.current = setTimeout(() => {
			setPreviewId(newId);
			setIsEmojiHidden(false);
			switchTimerRef.current = null;
		}, 40); // Slightly increased for stability
	};

	const performTap = useCallback(async (id: number) => {
		if (isTappingInternal || isTapDisabled || isTapBlocked) return;

		// Local feedback
		setIsIgniting(true);
		setIsRippling(true);
		setPreviewId(id);

		// Vibrate
		if (navigator.vibrate) navigator.vibrate([10, 20]);

		if (onTapProfile) {
			onTapProfile(profileId, id);
		} else if (onInternalTap) {
			setIsTappingInternal(true);
			try {
				await onInternalTap(profileId, id);
			} finally {
				setIsTappingInternal(false);
			}
		}

		// Cleanup local anim state
		setTimeout(() => {
			setIsIgniting(false);
			setIsRippling(false);
		}, 800);
	}, [profileId, onTapProfile, onInternalTap, isTappingInternal, isTapDisabled, isTapBlocked]);

	const selectTap = (id: number) => {
		performTap(id);
		setShowTapPicker(false);
		setHoveredId(null);
		lastSwitchedId.current = null;
	};

	const handlePointerDown = (e: React.PointerEvent) => {
		if (isTapDisabled || isTappingInternal) return;

		// Clear animations to allow re-trigger on release
		setIsIgniting(false);
		setIsRippling(false);

		longPressTimer.current = setTimeout(() => {
			setShowTapPicker(true);
			if (navigator.vibrate) navigator.vibrate(10);
		}, 300);

		const btn = e.currentTarget as HTMLButtonElement;
		btn.setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (!showTapPicker) return;

		const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
		if (!hoveredEl) return;

		const emojiItem = hoveredEl.closest(".tab-menu-emoji");
		if (emojiItem) {
			const id = Number(emojiItem.getAttribute("data-id"));
			if (hoveredId !== id) {
				setHoveredId(id);
				switchEmoji(id);
			}
		} else {
			// Check if we are still inside the tap-menu container
			const isInMenu = hoveredEl.closest(".tab-menu");
			if (!isInMenu) {
				setHoveredId(null);
				switchEmoji(null);
			}
		}
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		if (longPressTimer.current) {
			clearTimeout(longPressTimer.current);
			longPressTimer.current = null;
		}

		if (showTapPicker) {
			const hoveredEl = document.elementFromPoint(e.clientX, e.clientY);
			const emojiItem = hoveredEl?.closest(".tab-menu-emoji");

			if (emojiItem) {
				const selectedId = Number(emojiItem.getAttribute("data-id"));
				selectTap(selectedId);
			} else {
				// Released elsewhere: Keep menu open for click selection,
				// but release capture so regular clicks/hovers work.
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		} else {
			// Simple tap logic
			if (!isTapActive && !isTapBlocked) {
				performTap(1); // Default Flame
			} else if (isTapActive) {
				toast(t("browse_page.toasts.tap_limit"));
			}
		}
	};

	const getTapEmoji = (id: number) => {
		switch (id) {
			case 0: return "👋";
			case 1: return "🔥";
			case 2: return "😈";
			default: return "🔥";
		}
	};

	const displayId = previewId !== null ? previewId : tapId;

	return (
		<div
			className="relative"
			onContextMenu={(e) => e.preventDefault()}
			style={{ "--halo-color": currentHaloColor } as CSSProperties}
		>
			{/* Backdrop to close picker on tap outside */}
			{showTapPicker && (
				<div
					className="fixed inset-0 z-[55] bg-transparent"
					onPointerDown={() => {
						setShowTapPicker(false);
						setHoveredId(null);
						setPreviewId(null);
						lastSwitchedId.current = null;
					}}
				/>
			)}

			<div
				className={`tab-menu absolute bottom-4 left-32 z-[60] flex -translate-x-1/2 items-center gap-8 rounded-full border border-white/10 px-10 py-6 shadow-xl ${showTapPicker ? "active" : ""}`}
			>
				{[1, 2, 0].map((id) => (
					<div
						key={id}
						data-id={id}
						onPointerEnter={() => {
							if (showTapPicker) {
								setHoveredId(id);
								switchEmoji(id);
							}
						}}
						onPointerLeave={() => {
							if (showTapPicker) {
								setHoveredId(null);
								switchEmoji(null);
							}
						}}
						onClick={() => selectTap(id)}
						className={`tab-menu-emoji cursor-pointer text-4xl ${hoveredId === id ? "highlight" : ""}`}
					>
						{getTapEmoji(id)}
					</div>
				))}
			</div>

			<div className="flex flex-col items-center gap-6">
				<button
					type="button"
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onPointerCancel={handlePointerUp}
					disabled={isTapDisabled || isTappingInternal}
					style={{
						borderColor:
							isTapActive || isIgniting
								? "var(--halo-color)"
								: undefined,
					}}
					className={`${tapButtonClassName} tap-btn-base relative flex h-16 w-16 items-center justify-center overflow-visible rounded-full border-2 bg-[var(--surface)] transition-all duration-300 active:scale-95 ${showTapPicker ? "scale-105" : ""}`}
					aria-label={t("profile_details.tap_profile", "Tap profile")}
					title={
						isTapBlocked
							? t("browse_page.toasts.tap_limit")
							: isTapActive
								? t("profile_details.tap_active", "Tap active")
								: t("profile_details.tap_hold_hint", "Hold for more options")
					}
				>
					{(isTapActive || isIgniting) && (
						<div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
							<div
								className={`h-full w-full rounded-full tap-btn-outer-halo ${isIgniting ? "animate-flash" : "animate-halo-loop"}`}
							/>
						</div>
					)}
					{isRippling && (
						<div className="animate-ripple tap-btn-ripple" />
					)}
					<div
						className={`relative z-10 flex h-7 w-7 items-center justify-center transition-all duration-300 tap-btn-emoji-container ${isTapActive || previewId !== null ? `tap-btn-emoji-active ${isIgniting ? "animate-ignite" : (displayId === 1 && isTapActive ? "animate-living-flame-loop" : "animate-living-loop")}` : "text-[var(--text-muted)]"} ${isEmojiHidden ? "tap-btn-emoji-hidden" : ""}`}
					>
						<span className="flex items-center justify-center text-2xl">
							{isTapActive || previewId !== null ? (
								getTapEmoji(displayId)
							) : (
								<Flame className="h-7 w-7" strokeWidth={1.8} />
							)}
						</span>
					</div>
				</button>
			</div>
		</div>
	);
}
