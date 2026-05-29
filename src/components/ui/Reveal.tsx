import { ReactNode } from "react";
import { useRevealOnScroll } from "../../hooks/useRevealOnScroll";
import { cn } from "../../utils/cn";

type RevealProps = {
	children: ReactNode;
	className?: string;
	threshold?: number;
	rootMargin?: string;
};

/**
 * A simple wrapper component to reveal content as it scrolls into view.
 * Uses the animate-reveal-row animation from index.css
 */
export function Reveal({ children, className, threshold, rootMargin }: RevealProps) {
	const { ref, isVisible } = useRevealOnScroll(threshold, rootMargin);

	return (
		<div
			ref={ref}
			className={cn(
				"transition-opacity",
				isVisible ? "animate-reveal-row" : "opacity-0",
				className
			)}
		>
			{children}
		</div>
	);
}
