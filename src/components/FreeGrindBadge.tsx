import freegrindLogo from "../images/freegrind-logo.webp";

const SIZE_CLASSES = {
	xs: "h-3.5 w-3.5",
	sm: "h-4 w-4",
	md: "h-5 w-5",
	lg: "h-6 w-6",
} as const;

// The logo artwork is a mask silhouette that reaches close to the edges of its
// square canvas, so it must be inset (not filled edge-to-edge) inside the
// circular badge — otherwise the ears get clipped flat by the circular crop.
export function FreeGrindBadge({
	size = "md",
	variant = "default",
	title,
	className = "",
}: {
	size?: keyof typeof SIZE_CLASSES;
	variant?: "default" | "onDark" | "bare";
	title?: string;
	className?: string;
}) {
	if (variant === "bare") {
		return (
			<div
				title={title}
				className={`flex shrink-0 items-center justify-center ${SIZE_CLASSES[size]} ${className}`}
			>
				<img src={freegrindLogo} alt={title ?? "Free Grind"} className="h-full w-full translate-y-[2%] object-contain" />
			</div>
		);
	}

	return (
		<div
			title={title}
			className={`flex shrink-0 items-center justify-center rounded-full ${SIZE_CLASSES[size]} ${
				variant === "onDark"
					? "border border-black/50 bg-black/50 shadow-lg backdrop-blur-sm"
					: "border border-[var(--border)] bg-[var(--surface)]"
			} ${className}`}
		>
			<img src={freegrindLogo} alt={title ?? "Free Grind"} className="h-[70%] w-[70%] translate-y-[2%] object-contain" />
		</div>
	);
}
