import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
	isOpen: boolean;
	title: string;
	message: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void | Promise<void>;
	onCancel: () => void;
	isProcessing?: boolean;
	confirmTone?: "default" | "danger";
	dontAskAgainLabel?: string;
	dontAskAgainChecked?: boolean;
	onDontAskAgainChange?: (checked: boolean) => void;
};

export function ConfirmDialog({
	isOpen,
	title,
	message,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
	isProcessing = false,
	confirmTone = "default",
	dontAskAgainLabel,
	dontAskAgainChecked = false,
	onDontAskAgainChange,
}: ConfirmDialogProps) {
	const dialogRef = useRef<HTMLDialogElement | null>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}

		if (isOpen) {
			if (!dialog.open) {
				try {
					dialog.showModal();
				} catch {
					// Fallback avoids leaving the UI inert if showModal cannot transition state.
					dialog.show();
				}
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	useEffect(() => {
		return () => {
			const dialog = dialogRef.current;
			if (dialog?.open) {
				dialog.close();
			}
		};
	}, []);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}

		const handleCancel = (event: Event) => {
			event.preventDefault();
			if (!isProcessing) {
				onCancel();
			}
		};

		dialog.addEventListener("cancel", handleCancel);
		return () => {
			dialog.removeEventListener("cancel", handleCancel);
		};
	}, [isProcessing, onCancel]);

	const confirmButtonClassName =
		confirmTone === "danger"
			? "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-500/20 px-4 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-60"
			: "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60";

	return (
		<dialog
			ref={dialogRef}
			className="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/45"
			onClick={(event) => {
				if (event.target === dialogRef.current && !isProcessing) {
					onCancel();
				}
			}}
		>
			<div className="p-4">
				<p className="text-sm font-semibold text-[var(--text)]">{title}</p>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{message}</p>

				{dontAskAgainLabel && onDontAskAgainChange ? (
					<label className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
						<input
							type="checkbox"
							checked={dontAskAgainChecked}
							onChange={(event) => onDontAskAgainChange(event.target.checked)}
							disabled={isProcessing}
							className="h-4 w-4"
						/>
						<span>{dontAskAgainLabel}</span>
					</label>
				) : null}

				<div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button
						type="button"
						onClick={onCancel}
						disabled={isProcessing}
						className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={() => void onConfirm()}
						disabled={isProcessing}
						className={confirmButtonClassName}
					>
						{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						<span>{confirmLabel}</span>
					</button>
				</div>
			</div>
		</dialog>
	);
}
