import React from "react";
import { HEADER_GLOW_MASK_STOP_1, HEADER_GLOW_MASK_STOP_2 } from "../../config/design-config";

interface PageHeaderBackgroundProps {
	color: string;
}

export function PageHeaderBackground({ color }: PageHeaderBackgroundProps) {
	return (
		<div
			className="absolute -top-64 left-1/2 h-[600px] w-[200vw] -translate-x-1/2 pointer-events-none"
			style={{
				zIndex: -1,
				background: `radial-gradient(ellipse 100% 100% at 50% 0% in oklab,
					${color} 0%,
					color-mix(in oklab, ${color}, transparent 10%) 15%,
					color-mix(in oklab, ${color}, transparent 40%) 30%,
					color-mix(in oklab, ${color}, transparent 75%) 55%,
					transparent 100%)`,
				maskImage: `radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black ${HEADER_GLOW_MASK_STOP_1}, transparent ${HEADER_GLOW_MASK_STOP_2})`,
				WebkitMaskImage: `radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black ${HEADER_GLOW_MASK_STOP_1}, transparent ${HEADER_GLOW_MASK_STOP_2})`,
				backdropFilter: "blur(12px)",
				WebkitBackdropFilter: "blur(12px)",
			}}
		>
			<div
				className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
				}}
			/>
		</div>
	);
}
