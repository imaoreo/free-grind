import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../contexts/PreferencesContext";

// Standard delay between items in a wave
const STAGGER_MS = 30;

// Internal queue of elements waiting to be shown
let pendingReveals: { offsetTop: number; resolve: () => void }[] = [];
let revealTimer: ReturnType<typeof setTimeout> | null = null;

// Global state to track if the initial reveal period has passed for the current "view"
let globalAnimationsEnabled = false;
let lastUrl = "";
let activeHooksCount = 0;

function processNext() {
	if (pendingReveals.length === 0) {
		revealTimer = null;
		return;
	}

	// Always sort by document position to guarantee top-to-bottom order
	pendingReveals.sort((a, b) => a.offsetTop - b.offsetTop);

	const next = pendingReveals.shift();
	if (next) {
		next.resolve();
	}

	revealTimer = setTimeout(processNext, STAGGER_MS);
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