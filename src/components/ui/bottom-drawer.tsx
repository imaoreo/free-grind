import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

interface BottomDrawerProps {
	title: string;
	onClose: () => void;
	onConfirm: () => void;
	confirmLabel: string;
	cancelLabel: string;
	isProcessing?: boolean;
	zIndex?: string;
	children: ReactNode;
}

export function BottomDrawer({
	title,
	onClose,
	onConfirm,
	confirmLabel,
	cancelLabel,
	isProcessing = false,
	zIndex = "z-40",
	children,
}: BottomDrawerProps) {
	return (
		<div
			className={`fixed inset-0 ${zIndex} flex flex-col justify-end bg-black/45 backdrop-blur-sm no-touch-callout`}
			onClick={isProcessing ? undefined : onClose}
		>
			<div
				className="flex flex-col rounded-t-2xl border-x border-t border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden mx-3"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center justify-between px-4 py-3">
					<p className="text-sm font-semibold text-[var(--text)]">{title}</p>
					<button
						type="button"
						onClick={onClose}
						disabled={isProcessing}
						className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				{children}
				<div
					className="flex gap-2 px-3 pb-3"
					style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
				>
					<button
						type="button"
						onClick={onClose}
						disabled={isProcessing}
						className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2.5 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
					>
						{cancelLabel}
					</button>
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
			</div>
		</div>
	);
}
