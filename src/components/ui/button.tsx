import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	leftIcon?: React.ReactNode;
	rightIcon?: React.ReactNode;
}

const variantClassMap: Record<ButtonVariant, string> = {
	primary:
		"bg-[var(--accent)] text-[var(--accent-contrast)] border-transparent hover:brightness-[1.03] active:brightness-[0.97]",
	secondary:
		"bg-[var(--surface-2)] text-[var(--text)] border-[var(--border)] hover:border-[var(--text-muted)]",
	ghost:
		"bg-transparent text-[var(--text)] border-transparent hover:bg-[var(--surface-2)]",
	danger:
		"bg-[color-mix(in_srgb,var(--surface)_72%,#f87171_28%)] text-[var(--text)] border-[color-mix(in_srgb,var(--border)_72%,#f87171_28%)] hover:brightness-[1.03]",
};

const sizeClassMap: Record<ButtonSize, string> = {
	sm: "min-h-10 px-3 py-2 text-sm",
	md: "min-h-11 px-4 py-2.5 text-sm",
	lg: "min-h-12 px-5 py-3 text-base",
	icon: "h-11 w-11 p-0",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	(
		{
			className,
			variant = "secondary",
			size = "md",
			loading = false,
			disabled,
			leftIcon,
			rightIcon,
			children,
			...props
		},
		ref,
	) => {
		const isDisabled = disabled || loading;

		return (
			<button
				ref={ref}
				disabled={isDisabled}
				className={cn(
					"inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-60",
					variantClassMap[variant],
					sizeClassMap[size],
					className,
				)}
				{...props}
			>
				{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
				{children}
				{!loading ? rightIcon : null}
			</button>
		);
	},
);

Button.displayName = "Button";
