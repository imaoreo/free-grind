import React from "react";
import { HEADER_GLOW_MASK_STOP_1, HEADER_GLOW_MASK_STOP_2 } from "../../config/design-config";

interface PageHeaderBackgroundProps {
	color: string;
}

export function PageHeaderBackground({ color }: PageHeaderBackgroundProps) {
	return (
		<div
			className="absolute -top-64 left-1/2 h-[600px] w-[200vw] -translate-x-1/2"
			style={{
				zIndex: -1,
				background: `radial-gradient(ellipse 100% 100% at 50% 0%, ${color} 0%, color-mix(in srgb, ${color}, transparent 40%) 15%, color-mix(in srgb, ${color}, transparent 85%) 60%, transparent 100%)`,
				maskImage: `radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black ${HEADER_GLOW_MASK_STOP_1}, transparent ${HEADER_GLOW_MASK_STOP_2})`,
				WebkitMaskImage: `radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black ${HEADER_GLOW_MASK_STOP_1}, transparent ${HEADER_GLOW_MASK_STOP_2})`,
				backdropFilter: "blur(12px)",
				WebkitBackdropFilter: "blur(12px)",
			}}
		/>
	);
}
