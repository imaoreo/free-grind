import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../contexts/PreferencesContext";

// Delay between items during normal (slow) scrolling
const STAGGER_MS = 30;
// Delay between items when scrolling fast or queue has built up
const FAST_STAGGER_MS = 5;
// Items in queue before switching to fast stagger
const FAST_FLUSH_THRESHOLD = 4;
// Scroll velocity (px/ms) above which we use fast stagger
const FAST_SCROLL_VELOCITY = 1.5;

// Internal queue of elements waiting to be shown
let pendingReveals: { offsetTop: number; resolve: () => void }[] = [];
let revealTimer: ReturnType<typeof setTimeout> | null = null;

// Scroll direction + velocity tracking
let lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
let scrollDirection: "up" | "down" = "down";
let scrollVelocity = 0;
let lastScrollTime = typeof performance !== "undefined" ? performance.now() : 0;
let velocityDecayTimer: ReturnType<typeof setTimeout> | null = null;

if (typeof window !== "undefined") {
	window.addEventListener(
		"scroll",
		(e) => {
			const target = e.target;
			const currentScrollY =
				target === document || target === window
					? window.scrollY
					: target instanceof Element
						? target.scrollTop
						: lastScrollY;

			const now = performance.now();
			const dt = now - lastScrollTime;
			if (dt > 0) {
				scrollVelocity = Math.abs(currentScrollY - lastScrollY) / dt;
			}
			lastScrollTime = now;

			// Decay velocity after 150ms without scroll events
			if (velocityDecayTimer) clearTimeout(velocityDecayTimer);
			velocityDecayTimer = setTimeout(() => {
				scrollVelocity = 0;
			}, 150);

			if (currentScrollY > lastScrollY) {
				scrollDirection = "down";
			} else if (currentScrollY < lastScrollY) {
				scrollDirection = "up";
			}
			lastScrollY = currentScrollY;
		},
		{ capture: true, passive: true },
	);
}

// Global state to track if the initial reveal period has passed for the current "view"
let globalAnimationsEnabled = false;
let lastUrl = "";
let activeHooksCount = 0;

function processNext() {
	if (pendingReveals.length === 0) {
		revealTimer = null;
		return;
	}

	// Always sort by document position to guarantee top-to-bottom order (if scrolling down)
	// or bottom-to-top order (if scrolling up)
	if (scrollDirection === "down") {
		pendingReveals.sort((a, b) => a.offsetTop - b.offsetTop);
	} else {
		pendingReveals.sort((a, b) => b.offsetTop - a.offsetTop);
	}

	const next = pendingReveals.shift();
	if (next) {
		next.resolve();
	}

	// Use faster stagger when scrolling quickly or there's a backlog — animation still plays
	const isFast = scrollVelocity > FAST_SCROLL_VELOCITY || pendingReveals.length > FAST_FLUSH_THRESHOLD;
	revealTimer = setTimeout(processNext, isFast ? FAST_STAGGER_MS : STAGGER_MS);
}

/**
 * Hook to detect when an element enters the viewport with a guaranteed staggered wave.
 */
export function useRevealOnScroll(threshold = 0.05, rootMargin = "0px 0px -20px 0px") {
	const { revealEffectEnabled } = usePreferences();
	const currentUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";

	const isEnabled = !!revealEffectEnabled;
	const [isVisible, setIsVisible] = useState(!isEnabled);
	const [wasVisibleInitially, setWasVisibleInitially] = useState(!isEnabled);
	const ref = useRef<HTMLDivElement>(null);

	// URL-based reset for global animation state (resets when navigating to a new page or tab)
	if (currentUrl !== lastUrl) {
		lastUrl = currentUrl;
		globalAnimationsEnabled = false;

		// Reset scroll tracking
		lastScrollY = typeof window !== "undefined" ? window.scrollY : 0;
		scrollDirection = "down";

		// Clear the queue and timer when navigating to a new page to prevent ghost animations
		pendingReveals = [];
		if (revealTimer) {
			clearTimeout(revealTimer);
			revealTimer = null;
		}
	}

	// Track the number of active hooks to reset global state when navigating away to a page without reveal effects
	useEffect(() => {
		activeHooksCount++;
		return () => {
			activeHooksCount--;
			if (activeHooksCount === 0) {
				globalAnimationsEnabled = false;
				lastUrl = "";
			}
		};
	}, []);

	useEffect(() => {
		if (!isEnabled) return;

		const element = ref.current;
		if (!element) return;

		// If this is a new page/view, we wait a bit before enabling animations
		// (this avoids a wave of animations during initial mount/scroll restoration)
		let timer: ReturnType<typeof setTimeout> | null = null;
		if (!globalAnimationsEnabled) {
			timer = setTimeout(() => {
				globalAnimationsEnabled = true;
			}, 400);
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					if (!globalAnimationsEnabled) {
						// Show initially visible elements immediately without delay/animation
						setIsVisible(true);
						setWasVisibleInitially(true);
					} else {
						// ALWAYS use the queue to guarantee top-to-bottom order
						pendingReveals.push({
							offsetTop: (entry.target as HTMLElement).offsetTop,
							resolve: () => {
								setIsVisible(true);
							},
						});

						if (!revealTimer) {
							revealTimer = setTimeout(processNext, 0);
						}
					}
					observer.unobserve(element);
				}
			},
			{ threshold, rootMargin }
		);

		observer.observe(element);

		return () => {
			if (timer) clearTimeout(timer);
			if (element) observer.unobserve(element);
		};
	}, [threshold, rootMargin, isEnabled, currentUrl]);

	let revealClass = "opacity-0";
	if (!revealEffectEnabled) {
		revealClass = "opacity-100";
	} else if (isVisible) {
		if (wasVisibleInitially) {
			revealClass = "opacity-100";
		} else {
			revealClass = "animate-reveal-row";
		}
	}

	return { ref, isVisible: !revealEffectEnabled || isVisible, revealClass };
}
