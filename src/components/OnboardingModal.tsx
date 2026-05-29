import { X, type LucideIcon } from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { Button } from "./ui/button";

interface OnboardingModalProps {
	title: string;
	onClose: () => void;
	onConfirm?: () => void;
	headerIcon: LucideIcon;
	children: ReactNode;
	buttonLabel: string;
}

export function OnboardingModal({
	title,
	onClose,
	onConfirm,
	headerIcon: HeaderIcon,
	children,
	buttonLabel,
}: OnboardingModalProps) {
	const [isClosing, setIsClosing] = useState(false);

	// Prevent background scrolling while the modal is open
	useEffect(() => {
		const originalStyle = window.getComputedStyle(document.body).overflow;
		document.body.style.overflow = "hidden";

		// For iOS/Touchscreen consistency
		const handleTouchMove = (e: TouchEvent) => {
			if ((e.target as HTMLElement).closest('[role="dialog"]')) return;
			e.preventDefault();
		};
		document.addEventListener("touchmove", handleTouchMove, { passive: false });

		return () => {
			document.body.style.overflow = originalStyle;
			document.removeEventListener("touchmove", handleTouchMove);
		};
	}, []);

	const handleClose = () => {
		setIsClosing(true);
		setTimeout(() => {
			onClose();
		}, 300); // Match transition duration
	};

	const handleConfirm = () => {
		if (onConfirm) {
			setIsClosing(true);
			setTimeout(() => {
				onConfirm();
			}, 300);
		} else {
			handleClose();
		}
	};

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center p-4 no-touch-callout isolate">
			{/* Backdrop - Separate to prevent blur flicker during modal animation */}
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${
					isClosing ? "animate-backdrop-out" : "animate-backdrop-in"
				}`}
				onClick={handleClose}
			/>

			{/* Modal Content */}
			<div
				role="dialog"
				aria-modal="true"
				className={`relative w-full max-w-lg overflow-hidden rounded-[2.5rem] border border-[var(--border)] bg-[var(--surface)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-out" : "animate-modal-in"
				}`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Decorative Header */}
				<div className="bg-gradient-to-br from-[var(--accent)] to-[color-mix(in_srgb,var(--accent)_80%,black)] p-8 text-center relative text-[var(--accent-contrast)]">
					<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)] shadow-xl">
						<HeaderIcon className="h-8 w-8" />
					</div>
					<h2 className="text-2xl font-bold tracking-tight">
						{title}
					</h2>

					<button
						onClick={handleClose}
						className="absolute right-4 top-4 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text)] transition hover:opacity-90 shadow-sm"
						aria-label="Close"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				<div className="p-8 pb-10 space-y-6">
					{children}

					<div className="pt-2">
						<Button
							variant="primary"
							className="w-full py-4 text-base font-bold rounded-2xl shadow-lg shadow-[var(--accent)]/20"
							onClick={handleConfirm}
						>
							{buttonLabel}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

interface OnboardingItemProps {
	icon: LucideIcon;
	title: string;
	description: string;
	children?: ReactNode;
	iconClassName?: string;
}

export function OnboardingItem({
	icon: Icon,
	title,
	description,
	children,
	iconClassName = "bg-[var(--surface-2)] text-[var(--accent)]",
}: OnboardingItemProps) {
	return (
		<div className="flex gap-4">
			<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
				<Icon className="h-5 w-5" />
			</div>
			<div className="space-y-1">
				<p className="font-semibold text-[var(--text)]">{title}</p>
				<p className="text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
				{children}
			</div>
		</div>
	);
}
