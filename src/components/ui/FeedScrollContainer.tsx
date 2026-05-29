import React, { forwardRef } from "react";
import { cn } from "../../utils/cn";
import { FEED_HEADER_OFFSET, FEED_MASK_GRADIENT_STOP } from "../../config/design-config";

interface FeedScrollContainerProps extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
}

export const FeedScrollContainer = forwardRef<HTMLDivElement, FeedScrollContainerProps>(
	({ children, className, ...props }, ref) => {
		return (
			<div
				className="relative flex-1 min-h-0"
				style={{ marginTop: `-${FEED_HEADER_OFFSET}` }}
			>
				<div
					ref={ref}
					className={cn("h-full overflow-y-auto", className)}
					style={{
						paddingTop: FEED_HEADER_OFFSET,
						maskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
						WebkitMaskImage: `linear-gradient(to bottom, transparent, black ${FEED_MASK_GRADIENT_STOP})`,
					}}
					{...props}
				>
					{children}
				</div>
			</div>
		);
	}
);

FeedScrollContainer.displayName = "FeedScrollContainer";
