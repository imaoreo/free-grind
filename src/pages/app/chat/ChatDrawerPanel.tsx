import {
	Check,
	Image as ImageIcon,
	Loader2,
	RefreshCw,
	Send,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

export interface DrawerMedia {
	id: number;
	url: string;
	contentType: string;
	createdTs: number;
	used: boolean;
	takenOnGrindr: boolean;
}

interface ChatDrawerPanelProps {
	isLoading: boolean;
	error: string | null;
	media: DrawerMedia[];
	onBack: () => void;
	onLoadMedia: () => void;
	onSendMedia: (mediaIds: number[]) => void | Promise<void>;
	isSending: boolean;
}

export function ChatDrawerPanel({
	isLoading,
	error,
	media,
	onBack,
	onLoadMedia,
	onSendMedia,
	isSending,
}: ChatDrawerPanelProps) {
	const { t } = useTranslation();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	const toggleSelection = useCallback((id: number) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}, []);

	const handleSendSelected = useCallback(async () => {
		if (selectedIds.size === 0) {
			toast.error(t("chat_drawer.error_no_selection"));
			return;
		}

		try {
			await onSendMedia(Array.from(selectedIds));
			setSelectedIds(new Set());
			onBack();
		} catch (err) {
			const message =
				err instanceof Error
					? err.message
					: t("chat_drawer.error_send_failed");
			toast.error(message);
		}
	}, [selectedIds, onSendMedia, onBack, t]);

	const hasSelection = selectedIds.size > 0;

	return (
		<div className="mb-2 flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
			{/* Content Grid */}
			<div className="flex-1 overflow-y-auto max-h-48">
				{isLoading ? (
					<div className="flex h-full items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
					</div>
				) : error ? (
					<div className="flex flex-col items-center justify-center gap-3 p-6 text-center py-8">
						<ImageIcon className="h-8 w-8 text-[var(--text-muted)]" />
						<p className="text-xs text-[var(--text-muted)]">{error}</p>
						<button
							type="button"
							onClick={onLoadMedia}
							className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-readable)]"
						>
							<RefreshCw className="h-3 w-3" />
								{t("chat_drawer.retry")}
						</button>
					</div>
				) : media.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 p-6 text-center py-8">
						<ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
						<p className="text-xs text-[var(--text-muted)]">
							{t("chat_drawer.empty")}
						</p>
					</div>
				) : (
					<div className="grid grid-cols-3 gap-0">
						{media.map((item) => {
							const isSelected = selectedIds.has(item.id);
							const isImage = item.contentType.startsWith("image/");

							return (
								<button
									key={item.id}
									type="button"
									onClick={() => toggleSelection(item.id)}
									className="relative aspect-square overflow-hidden border-0 transition"
									style={{
										borderColor: isSelected
											? "var(--accent)"
											: "transparent",
										background: isSelected
											? "color-mix(in srgb, var(--accent) 16%, var(--surface-2))"
											: "var(--surface-2)",
										borderWidth: isSelected ? "2px" : "0px",
									}}
								>
									{/* Thumbnail */}
									{isImage ? (
										<img
											src={item.url}
											alt="drawer media"
											className="h-full w-full object-cover"
										/>
									) : (
										<video
											src={item.url}
											className="h-full w-full object-cover"
										/>
									)}

									{/* Overlay */}
									{isSelected ? (
										<div className="absolute inset-0 flex items-center justify-center bg-black/40">
											<Check className="h-4 w-4 text-white" />
										</div>
									) : null}

									{/* Used indicator */}
									{item.used ? (
										<div className="absolute top-0.5 right-0.5 inline-flex items-center rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white">
											✓
										</div>
									) : null}
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Footer - Send button */}
			{hasSelection ? (
				<div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
					<button
						type="button"
						onClick={handleSendSelected}
						disabled={isSending}
						className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isSending ? (
							<Loader2 className="h-3 w-3 animate-spin" />
						) : (
							<Send className="h-3 w-3" />
						)}
						<span>
							{isSending
								? t("chat_drawer.sending")
								: t("chat_drawer.send", {
										count: selectedIds.size,
									})}
						</span>
					</button>
				</div>
			) : null}
		</div>
	);
}
