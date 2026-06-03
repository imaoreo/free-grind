import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { BottomSheet, SheetClose } from "./bottom-sheet";

interface BottomDrawerProps {
	title: string;
	onClose: () => void;
	onConfirm: () => void;
	confirmLabel: string;
	cancelLabel?: string;
	isProcessing?: boolean;
	zIndex?: string;
	isDesktop?: boolean;
	children: ReactNode;
}

export function BottomDrawer({
	title,
	onClose,
	onConfirm,
	confirmLabel,
	cancelLabel,
	isProcessing = false,
	zIndex = "z-[60]",
	isDesktop = false,
	children,
}: BottomDrawerProps) {
	return (
		<BottomSheet
			onClose={onClose}
			isDesktop={isDesktop}
			isProcessing={isProcessing}
			zIndex={zIndex}
		>
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">{title}</p>
				<SheetClose
					disabled={isProcessing}
					className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
				>
					<X className="h-4 w-4" />
				</SheetClose>
			</div>
			{children}
			<div className="flex gap-2 px-3">
				{cancelLabel && (
					<SheetClose
						disabled={isProcessing}
						className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
					>
						{cancelLabel}
					</SheetClose>
				)}
				<button
					type="button"
					onClick={onConfirm}
					disabled={isProcessing}
					className="flex-1 rounded-xl border border-[var(--accent)] bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
				>
					{isProcessing ? (
						<Loader2 className="mx-auto h-4 w-4 animate-spin" />
					) : (
						confirmLabel
					)}
				</button>
			</div>
		</BottomSheet>
	);
}
