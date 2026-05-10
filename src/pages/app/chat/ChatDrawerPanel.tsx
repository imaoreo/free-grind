import {
	Check,
	Image as ImageIcon,
	Loader2,
	Plus,
	RefreshCw,
	Send,
	X,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";

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
	isAdding: boolean;
	onAddMedia: (file: File, takenOnGrindr: boolean) => void | Promise<void>;
	deletingMediaId: number | null;
	onDeleteMedia: (mediaId: number) => void | Promise<void>;
	isDesktop: boolean;
}

export function ChatDrawerPanel({
	isLoading,
	error,
	media,
	onBack,
	onLoadMedia,
	onSendMedia,
	isSending,
	isAdding,
	onAddMedia,
	deletingMediaId,
	onDeleteMedia,
	isDesktop,
}: ChatDrawerPanelProps) {
	const { t } = useTranslation();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
	const [pendingAddFile, setPendingAddFile] = useState<File | null>(null);
	const [pendingTakenOnGrindr, setPendingTakenOnGrindr] = useState(false);
	const [isAddChooserOpen, setIsAddChooserOpen] = useState(false);
	const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<number | null>(null);
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const cameraInputRef = useRef<HTMLInputElement | null>(null);

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

	const onPickDrawerPhoto = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) {
				return;
			}
			if (!file.type.startsWith("image/")) {
				toast.error(t("chat_drawer.invalid_file_type"));
				return;
			}
			setPendingAddFile(file);
			setPendingTakenOnGrindr(false);
		},
		[],
	);

	const confirmAddPhoto = useCallback(async () => {
		if (!pendingAddFile) {
			return;
		}
		await onAddMedia(pendingAddFile, pendingTakenOnGrindr);
		setPendingAddFile(null);
		setPendingTakenOnGrindr(false);
	}, [onAddMedia, pendingAddFile, pendingTakenOnGrindr]);

	const cancelAddPhoto = useCallback(() => {
		setPendingAddFile(null);
		setPendingTakenOnGrindr(false);
	}, []);

	const openAddChooser = useCallback(() => {
		if (isAdding) {
			return;
		}
		if (isDesktop) {
			uploadInputRef.current?.click();
			return;
		}
		setIsAddChooserOpen(true);
	}, [isAdding, isDesktop]);

	const pickFromUpload = useCallback(() => {
		setIsAddChooserOpen(false);
		uploadInputRef.current?.click();
	}, []);

	const pickFromCamera = useCallback(() => {
		setIsAddChooserOpen(false);
		cameraInputRef.current?.click();
	}, []);

	const handleDeleteMedia = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>, mediaId: number) => {
			event.stopPropagation();
			setConfirmDeleteMediaId(mediaId);
		},
		[],
	);

	const confirmDeleteMedia = useCallback(async () => {
		if (confirmDeleteMediaId == null) {
			return;
		}

		await onDeleteMedia(confirmDeleteMediaId);
		setSelectedIds((previous) => {
			if (!previous.has(confirmDeleteMediaId)) {
				return previous;
			}
			const next = new Set(previous);
			next.delete(confirmDeleteMediaId);
			return next;
		});
		setConfirmDeleteMediaId(null);
	}, [confirmDeleteMediaId, onDeleteMedia]);

	const cancelDeleteMedia = useCallback(() => {
		if (deletingMediaId != null) {
			return;
		}
		setConfirmDeleteMediaId(null);
	}, [deletingMediaId]);

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
				) : (
					<div className="grid grid-cols-3 gap-0">
						<button
							type="button"
							onClick={openAddChooser}
							disabled={isAdding}
						className="relative aspect-square border-0 bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
						aria-label={t("chat_drawer.add_photo")}
						title={t("chat_drawer.add_photo")}
						>
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
								{isAdding ? (
									<Loader2 className="h-5 w-5 animate-spin" />
								) : (
									<Plus className="h-5 w-5" />
								)}
							</div>
						</button>
						<input
							type="file"
							ref={uploadInputRef}
							onChange={onPickDrawerPhoto}
							accept="image/*"
							className="hidden"
						/>
						<input
							type="file"
							ref={cameraInputRef}
							onChange={onPickDrawerPhoto}
							accept="image/*"
							capture="environment"
							className="hidden"
						/>
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

									<button
										type="button"
										onClick={(event) => void handleDeleteMedia(event, item.id)}
										disabled={deletingMediaId === item.id}
										className="absolute top-0.5 left-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-60"
								aria-label={t("chat_drawer.delete_media")}
								title={t("chat_drawer.delete_media")}
									>
										{deletingMediaId === item.id ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<X className="h-3 w-3" />
										)}
									</button>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{isAddChooserOpen ? (
				<div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
					<div className="grid grid-cols-2 gap-2">
						<button
							type="button"
							onClick={pickFromCamera}
							className="rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]"
						>
							Take photo
						</button>
						<button
							type="button"
							onClick={pickFromUpload}
							className="rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]"
						>
							Upload photo
						</button>
					</div>
					<button
						type="button"
						onClick={() => setIsAddChooserOpen(false)}
						className="mt-2 w-full rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
					>
						{t("chat.actions.cancel")}
					</button>
				</div>
			) : null}

			{pendingAddFile ? (
				<div className="border-t border-[var(--border)] bg-[var(--surface)] p-2">
					<p className="text-xs font-medium text-[var(--text)]">
						{pendingAddFile.name}
					</p>
					<label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-muted)]">
						<input
							type="checkbox"
							checked={pendingTakenOnGrindr}
							onChange={(event) => setPendingTakenOnGrindr(event.target.checked)}
							disabled={isAdding}
						/>
						<span>{t("chat.attachments.taken_on_grindr")}</span>
					</label>
					<div className="mt-2 flex gap-2">
						<button
							type="button"
							onClick={confirmAddPhoto}
							disabled={isAdding}
							className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
						>
							{isAdding ? t("chat_drawer.sending") : t("chat_drawer.add_to_drawer")}
						</button>
						<button
							type="button"
							onClick={cancelAddPhoto}
							disabled={isAdding}
							className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)]"
						>
							{t("chat.actions.cancel")}
						</button>
					</div>
				</div>
			) : null}

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

			<ConfirmDialog
				isOpen={confirmDeleteMediaId != null}
				title={t("chat_drawer.delete_confirm_title")}
				message={t("chat_drawer.delete_confirm_message")}
				confirmLabel={t("chat_drawer.delete_confirm_label")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={confirmDeleteMedia}
				onCancel={cancelDeleteMedia}
				isProcessing={confirmDeleteMediaId != null && deletingMediaId === confirmDeleteMediaId}
				confirmTone="danger"
			/>
		</div>
	);
}
