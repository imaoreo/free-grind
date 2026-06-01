import React, { forwardRef, useEffect, useRef } from "react";
import Lenis from "lenis";
import { cn } from "../../utils/cn";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../config/design-config";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { SMOOTH_SCROLL_CONFIG } from "../../config/scroll-config";

interface FeedScrollContainerProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

export const FeedScrollContainer = forwardRef<HTMLDivElement, FeedScrollContainerProps>(
	({ children, className, ...props }, ref) => {
		const isDesktop = useDesktopBreakpoint();
		const innerRef = useRef<HTMLDivElement | null>(null);

		useEffect(() => {
			if (!isDesktop || !innerRef.current || !SMOOTH_SCROLL_CONFIG.enabled) {
				console.log("[FeedScroll] Skipping init:", { isDesktop, hasRef: !!innerRef.current, enabled: SMOOTH_SCROLL_CONFIG.enabled });
				return;
			}

			console.log("[FeedScroll] Initializing inner Lenis", {
				lerp: SMOOTH_SCROLL_CONFIG.lerp,
				multiplier: SMOOTH_SCROLL_CONFIG.wheelMultiplier
			});

			const lenis = new Lenis({
				wrapper: innerRef.current,
				content: innerRef.current.firstElementChild as HTMLElement,
				lerp: SMOOTH_SCROLL_CONFIG.lerp,
				duration: SMOOTH_SCROLL_CONFIG.duration,
				wheelMultiplier: SMOOTH_SCROLL_CONFIG.wheelMultiplier,
				touchMultiplier: SMOOTH_SCROLL_CONFIG.touchMultiplier,
				smoothWheel: true,
			});

			let rafId: number;
			function raf(time: number) {
				lenis.raf(time);
				rafId = requestAnimationFrame(raf);
			}
			rafId = requestAnimationFrame(raf);

			return () => {
				lenis.destroy();
				cancelAnimationFrame(rafId);
			};
		}, [isDesktop]);

		return (
			<div
				className="relative flex-1 min-h-0"
				style={{ marginTop: `-${FEED_HEADER_OFFSET}` }}
			>
				<div
					ref={(node) => {
						innerRef.current = node;
						if (typeof ref === "function") {
							ref(node);
						} else if (ref) {
							ref.current = node;
						}
					}}
					data-lenis-prevent
					className={cn("h-full overflow-y-auto", className)}
					style={{
						paddingTop: FEED_HEADER_OFFSET,
						maskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
						WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
					}}
					{...props}
				>
					<div>
						{children}
					</div>
				</div>
			</div>
		);
	}
);

FeedScrollContainer.displayName = "FeedScrollContainer";
