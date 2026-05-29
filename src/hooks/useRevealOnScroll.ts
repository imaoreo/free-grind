import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../contexts/PreferencesContext";

// Standard delay between items in a wave
const STAGGER_MS = 30;

// Internal queue of elements waiting to be shown
let pendingReveals: { offsetTop: number; resolve: () => void }[] = [];
let revealTimer: ReturnType<typeof setTimeout> | null = null;

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
	const [isVisible, setIsVisible] = useState(false);
	const [wasVisibleInitially, setWasVisibleInitially] = useState(false);
	const [animationsEnabled, setAnimationsEnabled] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		// Disable animations for the first 400ms (mount/scroll restoration)
		const timer = setTimeout(() => setAnimationsEnabled(true), 400);

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					if (!animationsEnabled) {
						// Elements visible on mount are shown immediately without any animation logic
						setIsVisible(true);
						setWasVisibleInitially(true);
					} else {
						// Add to queue and sort by actual document position
						pendingReveals.push({
							offsetTop: (entry.target as HTMLElement).offsetTop,
							resolve: () => setIsVisible(true)
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
			clearTimeout(timer);
			if (element) observer.unobserve(element);
		};
	}, [threshold, rootMargin, animationsEnabled]);

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
