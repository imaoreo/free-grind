import { useEffect, useRef, ReactNode } from "react";
import Lenis from "lenis";
import { useLocation } from "react-router-dom";

/**
 * CENTRAL CONFIGURATION
 * Tune the app's scrolling feel here.
 */
export const SMOOTH_SCROLL_CONFIG = {
	/**
	 * Whether smooth scrolling is active globally.
	 */
	enabled: false,

	/**
	 * Enable smooth scrolling on touch devices (mobile).
	 * RECOMMENDATION: false for native feel, true for cinematic consistency.
	 */
	smoothTouch: false,

	/**
	 * Animation duration in seconds.
	 * RECOMMENDATION: 1.2 is the "sweet spot". > 2.0 feels heavy/premium.
	 */
	duration: 2,

	/**
	 * How much the scroll distance is multiplied for wheel events.
	 */
	wheelMultiplier: 1.0,

	/**
	 * Multiplier for touch events if smoothTouch is true.
	 */
	touchMultiplier: 1.5,
} as const;

type SmoothScrollProps = {
	children: ReactNode;
	enabled?: boolean;
	smoothTouch?: boolean;
	duration?: number;
	wheelMultiplier?: number;
};

/**
 * SmoothScroll component using Lenis.
 * Defaults are pulled from the SMOOTH_SCROLL_CONFIG above.
 */
export function SmoothScroll({
	children,
	enabled = SMOOTH_SCROLL_CONFIG.enabled,
	smoothTouch = SMOOTH_SCROLL_CONFIG.smoothTouch,
	duration = SMOOTH_SCROLL_CONFIG.duration,
	wheelMultiplier = SMOOTH_SCROLL_CONFIG.wheelMultiplier,
}: SmoothScrollProps) {
	const lenisRef = useRef<Lenis | null>(null);
	const location = useLocation();

	useEffect(() => {
		// Clean up previous instance if any
		if (lenisRef.current) {
			lenisRef.current.destroy();
			lenisRef.current = null;
		}

		if (!enabled) return;

		// Initialize Lenis with current config
		const lenis = new Lenis({
			duration: duration,
			// Ease Out Expo: Starts fast, ends very smoothly.
			easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			orientation: "vertical",
			gestureOrientation: "vertical",
			smoothWheel: true,
			wheelMultiplier: wheelMultiplier,
			touchMultiplier: SMOOTH_SCROLL_CONFIG.touchMultiplier,
			smoothTouch: smoothTouch,
		});

		lenisRef.current = lenis;

		let rafId: number;
		function raf(time: number) {
			lenis.raf(time);
			rafId = requestAnimationFrame(raf);
		}

		rafId = requestAnimationFrame(raf);

		// Global access for other components (e.g. to trigger scroll to top)
		(window as any).lenis = lenis;

		return () => {
			lenis.destroy();
			cancelAnimationFrame(rafId);
			delete (window as any).lenis;
		};
	}, [enabled, smoothTouch, duration, wheelMultiplier]);

	// Route transition handling
	useEffect(() => {
		if (lenisRef.current && enabled) {
			// List of paths where we do NOT want to reset scroll to top
			// (e.g. because they have their own restoration logic)
			const pagesWithoutTopReset = ["/", "/chat"];

			if (!pagesWithoutTopReset.includes(location.pathname)) {
				// Immediate scroll to top on page change
				lenisRef.current.scrollTo(0, { immediate: true });
			}
		}
	}, [location.pathname, enabled]);

	return <>{children}</>;
}
