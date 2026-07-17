import { AlertTriangle, Check, ImageIcon, Loader2, Plus, RefreshCw, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { getThumbImageUrl } from "../../../utils/media";
import { MEDIA_MODERATION_STATE } from "./profileEditorUtils";

export type ProfilePoolImage = {
	mediaHash: string;
	type: number;
	state: number | null;
};

interface ProfilePictureDrawerProps {
	images: ProfilePoolImage[];
	isLoading: boolean;
	error: string | null;
	onRetry: () => void;
	usedHashes: string[];
	remainingSlots: number;
	isSelecting: boolean;
	onAddSelectedImages: (hashes: string[]) => void | Promise<void>;
	deletingHash: string | null;
	onDeleteImage: (hash: string) => void | Promise<void>;
	onUploadFile: (file: File) => void;
	onClose: () => void;
	isDesktop: boolean;
}

export function ProfilePictureDrawer({
	images,
	isLoading,
	error,
	onRetry,
	usedHashes,
	remainingSlots,
	isSelecting,
	onAddSelectedImages,
	deletingHash,
	onDeleteImage,
	onUploadFile,
	onClose,
	isDesktop,
}: ProfilePictureDrawerProps) {
	const { t } = useTranslation();
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const [confirmDeleteHash, setConfirmDeleteHash] = useState<string | null>(null);
	const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

	const onPickFile = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) return;
			onUploadFile(file);
		},
		[onUploadFile],
	);

	const toggleSelection = useCallback(
		(hash: string) => {
			setSelectedHashes((prev) => {
				const next = new Set(prev);
				if (next.has(hash)) {
					next.delete(hash);
				} else {
					if (next.size >= remainingSlots) return prev;
					next.add(hash);
				}
				return next;
			});
		},
		[remainingSlots],
	);

	const handleAddSelected = useCallback(async () => {
		if (selectedHashes.size === 0) return;
		await onAddSelectedImages(Array.from(selectedHashes));
		setSelectedHashes(new Set());
	}, [selectedHashes, onAddSelectedImages]);

	const handleDeleteClick = useCallback((event: React.MouseEvent<HTMLButtonElement>, hash: string) => {
		event.stopPropagation();
		setConfirmDeleteHash(hash);
	}, []);

	const confirmDelete = useCallback(async () => {
		if (!confirmDeleteHash) return;
		await onDeleteImage(confirmDeleteHash);
		setSelectedHashes((prev) => {
			if (!prev.has(confirmDeleteHash)) return prev;
			const next = new Set(prev);
			next.delete(confirmDeleteHash);
			return next;
		});
		setConfirmDeleteHash(null);
	}, [confirmDeleteHash, onDeleteImage]);

	const cancelDelete = useCallback(() => {
		if (deletingHash != null) return;
		setConfirmDeleteHash(null);
	}, [deletingHash]);

	const usedSet = new Set(usedHashes);
	const visibleImages = images.filter((image) => !usedSet.has(image.mediaHash));
	const hasSelection = selectedHashes.size > 0;

	return (
		<BottomSheet
			onClose={isSelecting ? () => {} : onClose}
			isProcessing={isSelecting}
			isDesktop={isDesktop}
			bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
			panelClassName="px-4"
		>
			<div className="mb-1 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-[var(--text)]">
					{t("profile_photo_drawer.title")}
				</h3>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			<input type="file" ref={uploadInputRef} onChange={onPickFile} accept="image/*" className="hidden" />

			<p className="mb-3 text-xs text-[var(--text-muted)]">
				{t("profile_photo_drawer.description")}
			</p>

			<div className="mb-3 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-3">
				<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
				<p className="text-xs leading-relaxed text-amber-400">
					{t("profile_photo_drawer.nudity_notice")}
				</p>
			</div>

			<div
				data-lenis-prevent
				className="flex-1 overflow-y-auto max-h-[60vh] rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
			>
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
							onClick={onRetry}
							className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-readable)]"
						>
							<RefreshCw className="h-3 w-3" />
							{t("profile_photo_drawer.retry")}
						</button>
					</div>
				) : (
					<div className={`grid gap-px bg-[var(--border)] ${isDesktop ? "grid-cols-5" : "grid-cols-3"}`}>
						<button
							type="button"
							onClick={() => uploadInputRef.current?.click()}
							disabled={isSelecting || hasSelection}
							className="relative aspect-square bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:brightness-75"
							aria-label={t("profile_photo_drawer.upload")}
							title={t("profile_photo_drawer.upload")}
						>
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
								<span className="relative inline-flex">
									<Upload className="h-5 w-5" />
									{!hasSelection && <span className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--accent)]">
										<Plus className="h-2.5 w-2.5 stroke-[3] text-[var(--accent-contrast)]" />
									</span>}
								</span>
							</div>
						</button>

						{visibleImages.length === 0 && (
							<div
								className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--text-muted)]"
								style={{ gridColumn: "2 / -1" }}
							>
								<ImageIcon className="h-8 w-8 opacity-30" />
								<p className="text-xs">{t("profile_photo_drawer.empty")}</p>
							</div>
						)}

						{visibleImages.map((image) => {
							const isPending = image.state === MEDIA_MODERATION_STATE.PENDING;
							const isRejected = image.state === MEDIA_MODERATION_STATE.REJECTED;
							const isDeleting = deletingHash === image.mediaHash;
							const isSelected = selectedHashes.has(image.mediaHash);
							// Once the selection has hit the number of free profile slots,
							// picking anything else would just be rejected by toggleSelection
							// — mute those tiles the same way the chat drawer dims media that
							// can't be added to the current selection (e.g. image/video mix).
							const isMutedByCapacity = !isSelected && selectedHashes.size >= remainingSlots;
							const isClickable = !isSelecting && !isDeleting && !isMutedByCapacity;

							return (
								<div
									key={image.mediaHash}
									role="button"
									tabIndex={isClickable ? 0 : -1}
									onClick={() => { if (isClickable) toggleSelection(image.mediaHash); }}
									onKeyDown={(e) => {
										if (e.key === "Enter" && isClickable) toggleSelection(image.mediaHash);
									}}
									className={`relative aspect-square overflow-hidden transition ${isClickable ? "cursor-pointer" : "cursor-default"} ${isSelecting || isDeleting ? "opacity-60" : ""} ${isMutedByCapacity ? "opacity-30 pointer-events-none" : ""}`}
								>
									<img
										src={getThumbImageUrl(image.mediaHash, "320x320")}
										alt={t("profile_photo_drawer.image_alt")}
										className={`h-full w-full object-cover ${isRejected ? "opacity-50 grayscale" : ""}`}
									/>

									{isSelected ? (
										<div
											className="absolute inset-0 flex items-center justify-center"
											style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
										>
											<Check className="h-5 w-5 text-white drop-shadow" />
										</div>
									) : null}

									{isPending ? (
										<span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
											{t("profile_editor.sections.pictures.pending_moderation")}
										</span>
									) : null}
									{isRejected ? (
										<span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
											{t("profile_editor.sections.pictures.rejected")}
										</span>
									) : null}

									<button
										type="button"
										onClick={(event) => handleDeleteClick(event, image.mediaHash)}
										disabled={isDeleting}
										className="absolute top-0.5 left-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-60"
										aria-label={t("profile_photo_drawer.delete_image")}
										title={t("profile_photo_drawer.delete_image")}
									>
										{isDeleting ? (
											<Loader2 className="h-3 w-3 animate-spin" />
										) : (
											<X className="h-3 w-3" />
										)}
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{hasSelection ? (
				<div className="mt-3 -mx-4 border-t border-[var(--border)] pt-3 px-4 flex gap-2">
					<button
						type="button"
						onClick={() => void handleAddSelected()}
						disabled={isSelecting}
						className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isSelecting ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Plus className="h-4 w-4" />
						)}
						<span>
							{isSelecting
								? t("profile_photo_drawer.adding")
								: t("profile_photo_drawer.add_selected", { count: selectedHashes.size })}
						</span>
					</button>
				</div>
			) : null}

			<ConfirmDialog
				isOpen={confirmDeleteHash != null}
				title={t("profile_photo_drawer.delete_confirm_title")}
				message={t("profile_photo_drawer.delete_confirm_message")}
				confirmLabel={t("profile_photo_drawer.delete_confirm_label")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={confirmDelete}
				onCancel={cancelDelete}
				isProcessing={confirmDeleteHash != null && deletingHash === confirmDeleteHash}
				confirmTone="danger"
			/>
		</BottomSheet>
	);
}
