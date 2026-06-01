import { useEffect, useRef, ReactNode } from "react";
import Lenis from "lenis";
import { useLocation } from "react-router-dom";
import { SMOOTH_SCROLL_CONFIG } from "../config/scroll-config";

type SmoothScrollProps = {
	children: ReactNode;
	enabled?: boolean;
	smoothTouch?: boolean;
	duration?: number;
	wheelMultiplier?: number;
	touchMultiplier?: number;
	lerp?: number;
};

/**
 * SmoothScroll component using Lenis.
 */
export function SmoothScroll({
	children,
	enabled = SMOOTH_SCROLL_CONFIG.enabled,
	smoothTouch = SMOOTH_SCROLL_CONFIG.smoothTouch,
	duration = SMOOTH_SCROLL_CONFIG.duration,
	wheelMultiplier = SMOOTH_SCROLL_CONFIG.wheelMultiplier,
	touchMultiplier = SMOOTH_SCROLL_CONFIG.touchMultiplier,
	lerp = SMOOTH_SCROLL_CONFIG.lerp,
}: SmoothScrollProps) {
	const lenisRef = useRef<Lenis | null>(null);
	const location = useLocation();

	useEffect(() => {
		if (!enabled) {
			if (lenisRef.current) {
				lenisRef.current.destroy();
				lenisRef.current = null;
				document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
			}
			return;
		}

		// Initialize Lenis
		const lenis = new Lenis({
			duration: duration,
			lerp: lerp,
			easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
			orientation: "vertical",
			gestureOrientation: "vertical",
			smoothWheel: true,
			wheelMultiplier: wheelMultiplier,
			touchMultiplier: touchMultiplier,
			smoothTouch: smoothTouch,
			autoResize: true,
		});

		lenisRef.current = lenis;
		(window as any).lenis = lenis;

		// Add Lenis classes to HTML element
		document.documentElement.classList.add("lenis");
		document.documentElement.classList.add("lenis-smooth");

		// High-performance RAF loop
		let rafId: number;
		function raf(time: number) {
			lenis.raf(time);
			rafId = requestAnimationFrame(raf);
		}
		rafId = requestAnimationFrame(raf);

		console.log("[Lenis] Initialized on window", {
			smoothTouch,
			duration,
			lerp,
			isTouchDevice: "ontouchstart" in window,
		});

		// Ensure initial size is correct
		setTimeout(() => {
			lenis.resize();
		}, 100);

		return () => {
			lenis.destroy();
			cancelAnimationFrame(rafId);
			delete (window as any).lenis;
			document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-scrolling");
		};
	}, [enabled, smoothTouch, duration, wheelMultiplier, touchMultiplier, lerp]);

	// Global scroll-to-top on route change
	useEffect(() => {
		if (lenisRef.current && enabled) {
			const pagesWithoutTopReset = ["/", "/chat"];
			if (!pagesWithoutTopReset.includes(location.pathname)) {
				lenisRef.current.scrollTo(0, { immediate: true });
			}

			// Small delay to ensure DOM is rendered before resizing
			const timer = setTimeout(() => {
				lenisRef.current?.resize();
			}, 150);
			return () => clearTimeout(timer);
		}
	}, [location.pathname, enabled]);

	return (
		<>
			{enabled && (
				<style dangerouslySetInnerHTML={{ __html: `
					html.lenis, html.lenis body {
						height: auto;
					}
					.lenis.lenis-smooth {
						scroll-behavior: auto !important;
					}
					.lenis.lenis-smooth [data-lenis-prevent] {
						overscroll-behavior: contain;
					}
					.lenis.lenis-stopped {
						overflow: hidden;
					}
					.lenis.lenis-scrolling iframe {
						pointer-events: none;
					}
				`}} />
			)}
			{children}
		</>
	);
}
