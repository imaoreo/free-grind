import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	selected?: boolean;
}

export function Chip({
	selected = false,
	className,
	type = "button",
	...props
}: ChipProps) {
	return (
		<button
			type={type}
			className={cn(
				"min-h-10 rounded-full border px-3.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
				selected
					? "border-transparent bg-[var(--accent)] font-semibold text-[var(--accent-contrast)]"
					: "border-[var(--border)] bg-[var(--surface-2)] font-medium text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text)]",
				className,
			)}
			{...props}
		/>
	);
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: "default" | "subtle";
}

export function Badge({
	variant = "default",
	className,
	...props
}: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.1em]",
				variant === "default"
					? "bg-[var(--accent)]/90 text-[var(--accent-contrast)]"
					: "bg-[var(--surface-2)] text-[var(--text-muted)]",
				className,
			)}
			{...props}
		/>
	);
}
