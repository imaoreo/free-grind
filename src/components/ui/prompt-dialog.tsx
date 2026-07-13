import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PromptDialogProps = {
	isOpen: boolean;
	title: string;
	message: string;
	defaultValue?: string;
	placeholder?: string;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: (value: string) => void | Promise<void>;
	onCancel: () => void;
	isProcessing?: boolean;
};

export function PromptDialog({
	isOpen,
	title,
	message,
	defaultValue = "",
	placeholder,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
	isProcessing = false,
}: PromptDialogProps) {
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const [value, setValue] = useState(defaultValue);

	useEffect(() => {
		if (isOpen) {
			setValue(defaultValue);
		}
	}, [isOpen, defaultValue]);

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
					dialog.show();
				}
				requestAnimationFrame(() => {
					textareaRef.current?.focus();
					textareaRef.current?.select();
				});
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

	const trimmed = value.trim();

	const handleSubmit = () => {
		if (!trimmed || isProcessing) {
			return;
		}
		void onConfirm(trimmed);
	};

	return (
		<dialog
			ref={dialogRef}
			className="fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/45"
			onClick={(event) => {
				if (event.target === dialogRef.current && !isProcessing) {
					onCancel();
				}
			}}
		>
			<div className="p-4">
				<p className="text-sm font-semibold text-[var(--text)]">{title}</p>
				<p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{message}</p>

				<textarea
					ref={textareaRef}
					value={value}
					onChange={(event) => setValue(event.target.value)}
					placeholder={placeholder}
					disabled={isProcessing}
					rows={3}
					className="mt-4 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] disabled:opacity-60"
				/>

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
						onClick={handleSubmit}
						disabled={isProcessing || !trimmed}
						className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						<span>{confirmLabel}</span>
					</button>
				</div>
			</div>
		</dialog>
	);
}
