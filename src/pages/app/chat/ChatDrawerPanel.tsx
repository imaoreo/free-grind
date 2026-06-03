import {
	Camera,
	Check,
	SquareCenterlineDashedHorizontal,
	Image as ImageIcon,
	Loader2,
	RotateCw,
	Plus,
	Hourglass,
	RefreshCw,
	Send,
	Upload,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import freegrindLogo from "../../../images/freegrind-logo.webp";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { ToggleRow } from "../../../components/ui/toggle-row";
import { useModalClose } from "../../../hooks/useModalClose";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";

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
	onSendMedia: (mediaIds: number[], isExpiring?: boolean) => void | Promise<void>;
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
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [crop, setCrop] = useState<Crop | undefined>(undefined);
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
	const [completedCrop, setCompletedCrop] = useState<PixelCrop | undefined>(undefined);
	const imgRef = useRef<HTMLImageElement | null>(null);
	const [confirmDeleteMediaId, setConfirmDeleteMediaId] = useState<number | null>(null);
	const [isExpiring, setIsExpiring] = useState(false);
	const [selectAfterUpload, setSelectAfterUpload] = useState(false);
	const prevMediaIdsRef = useRef<Set<number>>(new Set());
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const cameraInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (!pendingAddFile) {
			setPreviewUrl(null);
			setCrop(undefined);
			setCompletedCrop(undefined);
			return;
		}
		const url = URL.createObjectURL(pendingAddFile);
		setPreviewUrl(url);
		setCrop(undefined);
		setCompletedCrop(undefined);
		return () => URL.revokeObjectURL(url);
	}, [pendingAddFile]);

	useEffect(() => {
		if (!previewUrl) return;
		setCrop({ unit: "%", x: 0, y: 0, width: 100, height: 100 });
	}, [previewUrl]);

	const applyTransform = useCallback(async (type: "flipH" | "rotateCw") => {
		const img = imgRef.current;
		if (!img || !img.complete || img.naturalWidth === 0) return;
		const sw = img.naturalWidth;
		const sh = img.naturalHeight;
		const canvas = document.createElement("canvas");
		canvas.width = type === "rotateCw" ? sh : sw;
		canvas.height = type === "rotateCw" ? sw : sh;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.translate(canvas.width / 2, canvas.height / 2);
		if (type === "flipH") ctx.scale(-1, 1);
		if (type === "rotateCw") ctx.rotate(Math.PI / 2);
		ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, "image/jpeg", 0.95),
		);
		if (!blob) return;
		setPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return URL.createObjectURL(blob);
		});
	}, []);

	useModalClose({
		isOpen: true,
		onClose: onBack,
		escapeKey: !isSending && !isAdding,
	});

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
			await onSendMedia(Array.from(selectedIds), isExpiring);
			setSelectedIds(new Set());
			onBack();
		} catch (err) {
			const message = err instanceof Error ? err.message : t("chat_drawer.error_send_failed");
			toast.error(message);
		}
	}, [selectedIds, onSendMedia, onBack, t, isExpiring]);

	const hasSelection = selectedIds.size > 0;

	const onPickDrawerPhoto = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) return;
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
		if (!pendingAddFile) return;

		let fileToUpload = pendingAddFile;
		const isFullImage =
			!completedCrop ||
			!imgRef.current ||
			(completedCrop.x <= 1 &&
				completedCrop.y <= 1 &&
				Math.abs(completedCrop.width - imgRef.current.width) <= 2 &&
				Math.abs(completedCrop.height - imgRef.current.height) <= 2);
		if (!isFullImage && completedCrop?.width && completedCrop.height && imgRef.current) {
			const img = imgRef.current;
			const scaleX = img.naturalWidth / img.width;
			const scaleY = img.naturalHeight / img.height;
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(completedCrop.width * scaleX);
			canvas.height = Math.round(completedCrop.height * scaleY);
			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.drawImage(
					img,
					completedCrop.x * scaleX, completedCrop.y * scaleY,
					completedCrop.width * scaleX, completedCrop.height * scaleY,
					0, 0, canvas.width, canvas.height,
				);
				fileToUpload = await new Promise<File>((resolve) => {
					canvas.toBlob((blob) => {
						if (!blob) { resolve(pendingAddFile); return; }
						resolve(new File([blob], pendingAddFile.name, { type: pendingAddFile.type || "image/jpeg" }));
					}, pendingAddFile.type || "image/jpeg", 0.92);
				});
			}
		}

		prevMediaIdsRef.current = new Set(media.map((m) => m.id));
		await onAddMedia(fileToUpload, pendingTakenOnGrindr);
		setSelectedIds(new Set());
		setSelectAfterUpload(true);
		setPendingAddFile(null);
		setPendingTakenOnGrindr(false);
	}, [onAddMedia, pendingAddFile, pendingTakenOnGrindr, media, completedCrop]);

	useEffect(() => {
		if (!selectAfterUpload) return;
		const newItem = media.find((m) => !prevMediaIdsRef.current.has(m.id));
		if (newItem) {
			setSelectedIds(new Set([newItem.id]));
			setSelectAfterUpload(false);
		}
	}, [media, selectAfterUpload]);

	const cancelAddPhoto = useCallback(() => {
		setPendingAddFile(null);
		setPendingTakenOnGrindr(false);
	}, []);

	const handleDeleteMedia = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>, mediaId: number) => {
			event.stopPropagation();
			setConfirmDeleteMediaId(mediaId);
		},
		[],
	);

	const confirmDeleteMedia = useCallback(async () => {
		if (confirmDeleteMediaId == null) return;
		await onDeleteMedia(confirmDeleteMediaId);
		setSelectedIds((previous) => {
			if (!previous.has(confirmDeleteMediaId)) return previous;
			const next = new Set(previous);
			next.delete(confirmDeleteMediaId);
			return next;
		});
		setConfirmDeleteMediaId(null);
	}, [confirmDeleteMediaId, onDeleteMedia]);

	const cancelDeleteMedia = useCallback(() => {
		if (deletingMediaId != null) return;
		setConfirmDeleteMediaId(null);
	}, [deletingMediaId]);

	return (
		<BottomSheet
			onClose={isSending || isAdding ? () => {} : onBack}
			isProcessing={isSending || isAdding}
			isDesktop={isDesktop}
			bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
			panelClassName="px-4"
		>
			<div className="mb-4 flex items-center justify-between">
					<h3 className="text-sm font-semibold text-[var(--text)]">
						{pendingAddFile
							? t("chat_drawer.add_photo")
							: t("chat_drawer.title", { defaultValue: "Drawer" })}
					</h3>
					{pendingAddFile ? (
						<button type="button" onClick={cancelAddPhoto} className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
							<X className="h-4 w-4" />
						</button>
					) : (
						<SheetClose className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
							<X className="h-4 w-4" />
						</SheetClose>
					)}
				</div>

				<input type="file" ref={uploadInputRef} onChange={onPickDrawerPhoto} accept="image/*" className="hidden" />
				<input type="file" ref={cameraInputRef} onChange={onPickDrawerPhoto} accept="image/*" capture="environment" className="hidden" />

				{pendingAddFile ? (
					<>
						{previewUrl && (
							<>
							<div className="mb-4 flex justify-center">
								<style>{`
									.drawer-crop .ReactCrop__crop-mask { display: none !important; }
									.drawer-crop .ReactCrop__crop-selection {
										background-image: none !important;
										animation: none !important;
										outline: none !important;
										border: 3px solid rgba(255,255,255,0.6) !important;
										border-radius: 11px !important;
										box-shadow: 0 0 0 9999px rgba(0,0,0,0.5) !important;
									}
									.drawer-crop .ord-n,
									.drawer-crop .ord-s,
									.drawer-crop .ord-e,
									.drawer-crop .ord-w { display: none !important; }

									.drawer-crop .ReactCrop__drag-handle {
										background: transparent !important;
										border: none !important;
										width: 15px !important;
										height: 15px !important;
									}
									.drawer-crop .ord-nw { transform: translate(4px, 4px) !important; border-top: 2px solid white !important; border-left: 2px solid white !important; border-top-left-radius: 4px !important; }
									.drawer-crop .ord-ne { transform: translate(-4px, 4px) !important; border-top: 2px solid white !important; border-right: 2px solid white !important; border-top-right-radius: 4px !important; }
									.drawer-crop .ord-sw { transform: translate(4px, -4px) !important; border-bottom: 2px solid white !important; border-left: 2px solid white !important; border-bottom-left-radius: 4px !important; }
									.drawer-crop .ord-se { transform: translate(-4px, -4px) !important; border-bottom: 2px solid white !important; border-right: 2px solid white !important; border-bottom-right-radius: 4px !important; }

									@keyframes logo-shine {
										0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); }
										50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); }
									}
									.logo-shine { animation: logo-shine 2.8s ease-in-out infinite; }
								`}</style>
								<div className="relative rounded-xl border border-[var(--border)] overflow-hidden">
								<ReactCrop
									crop={crop}
                                    onChange={(c) => {
                                        setIsDraggingCrop(true);
                                        setCrop(c);
                                    }}
                                    onComplete={(c) => {
                                        setIsDraggingCrop(false);
                                        setCompletedCrop(c);
                                    }}
                                    ruleOfThirds={isDraggingCrop}
									minWidth={150}
									minHeight={150}
									className="drawer-crop ReactCrop--no-animate"
									style={{ maxHeight: "50dvh", display: "block" }}
								>
									<img
										ref={imgRef}
										src={previewUrl}
										alt="Preview"
										className="block"
										style={{ maxHeight: "50dvh" }}
									/>
								</ReactCrop>
								{pendingTakenOnGrindr && crop && (
									<div
										className="absolute inline-flex items-center gap-1.5 pointer-events-none"
										style={{
											left: `calc(${crop.unit === "%" ? crop.x + "%" : crop.x + "px"} + 10px)`,
											top: `calc(${crop.unit === "%" ? (crop.y + crop.height) + "%" : (crop.y + crop.height) + "px"} - 10px)`,
											transform: "translateY(-100%)",
										}}
									>
										<img src={freegrindLogo} alt={t("chat.thread.taken_on_grindr")} className="h-5 w-5 rounded-full logo-shine" />
										<span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
											<span>{t("chat.time.just_now", { defaultValue: "just now" })}</span>
										</span>
									</div>
								)}
							</div>
							</div>
							<div className="mb-4 flex items-center justify-center gap-8">
								<button
									type="button"
									onClick={() => void applyTransform("flipH")}
									className="flex flex-col items-center gap-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									aria-label="Flip horizontal"
								>
									<SquareCenterlineDashedHorizontal className="h-6 w-6" />
								</button>
								<button
									type="button"
									onClick={() => void applyTransform("rotateCw")}
									className="flex flex-col items-center gap-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									aria-label="Rotate clockwise"
								>
									<RotateCw className="h-6 w-6" />
								</button>
							</div>
							</>
						)}
						<div className="mb-4">
							<ToggleRow
								checked={pendingTakenOnGrindr}
								onChange={setPendingTakenOnGrindr}
								label={t("chat.attachments.taken_on_grindr")}
                                description={t("chat.attachments.taken_on_grindr_description")}
							/>
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={cancelAddPhoto}
								disabled={isAdding}
								className="flex-1 inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
							>
								{t("chat.actions.cancel")}
							</button>
							<button
								type="button"
								onClick={confirmAddPhoto}
								disabled={isAdding}
								className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
							>
								{isAdding ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Plus className="h-4 w-4" />
								)}
								<span>{isAdding ? t("chat_drawer.sending") : t("chat_drawer.add_to_drawer")}</span>
							</button>
						</div>
					</>
				) : (
					<>
						{/* Content Grid */}
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
										onClick={onLoadMedia}
										className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-readable)]"
									>
										<RefreshCw className="h-3 w-3" />
										{t("chat_drawer.retry")}
									</button>
								</div>
							) : (
								<div className={`grid gap-px bg-[var(--border)] ${isDesktop ? "grid-cols-5" : "grid-cols-3"}`}>
									{/* Camera button */}
									<button
										type="button"
										onClick={() => cameraInputRef.current?.click()}
										disabled={isAdding || hasSelection}
										className="relative aspect-square bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:brightness-75"
										aria-label={t("chat_drawer.take_photo")}
										title={t("chat_drawer.take_photo")}
									>
										<div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
											{isAdding ? (
												<Loader2 className="h-5 w-5 animate-spin" />
											) : (
												<span className="relative inline-flex">
													<Camera className="h-5 w-5" />
													{!hasSelection && <span className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--accent)]">
														<Plus className="h-2.5 w-2.5 stroke-[3] text-[var(--accent-contrast)]" />
													</span>}
												</span>
											)}
										</div>
									</button>
									{/* Upload button */}
									<button
										type="button"
										onClick={() => uploadInputRef.current?.click()}
										disabled={isAdding || hasSelection}
										className="relative aspect-square bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:brightness-75"
										aria-label={t("chat_drawer.upload_photo")}
										title={t("chat_drawer.upload_photo")}
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
									{media.map((item) => {
										const isSelected = selectedIds.has(item.id);
										const isImage = item.contentType.startsWith("image/");

										return (
											<div
												key={item.id}
												role="button"
												tabIndex={0}
												onClick={() => toggleSelection(item.id)}
												onKeyDown={(e) => e.key === "Enter" && toggleSelection(item.id)}
												className="relative aspect-square overflow-hidden transition cursor-pointer"
												style={{
													outline: isSelected ? "2px solid var(--accent)" : "none",
													outlineOffset: "-2px",
												}}
											>
												{isImage ? (
													<img
														src={item.url}
														alt={t("chat_drawer.media_alt")}
														className="h-full w-full object-cover"
													/>
												) : (
													<video
														src={item.url}
														className="h-full w-full object-cover"
													/>
												)}

												{item.used && !isSelected ? (
													<div className="absolute inset-0 flex items-center justify-center bg-black/40">
														<span className="text-[11px] font-semibold uppercase tracking-widest text-white/90">
															{t("chat_drawer.sent", { defaultValue: "Sent" })}
														</span>
													</div>
												) : null}

												{isSelected ? (
													<div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
														<Check className="h-5 w-5 text-white drop-shadow" />
													</div>
												) : null}

												{item.takenOnGrindr ? (
													<img
														src={freegrindLogo}
														alt=""
														className="absolute bottom-1 left-1 h-4 w-4 rounded-full logo-shine"
													/>
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
											</div>
										);
									})}
								</div>
							)}
						</div>

						{/* Footer - Send button */}
						{hasSelection ? (
							<div className="mt-3 -mx-4 border-t border-[var(--border)] pt-3 px-4 flex gap-2">
								<div className="flex flex-1 gap-2">
									<button
										type="button"
										onClick={() => setIsExpiring((prev) => !prev)}
										className={`inline-flex h-11 min-w-[64px] items-center justify-center gap-1.5 rounded-xl border transition ${
											isExpiring
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
										style={{ flexBasis: "16.6%" }}
										title={
											isExpiring
												? t("chat_drawer.is_expiring_title_on")
												: t("chat_drawer.is_expiring_title_off")
										}
									>
										<Hourglass className="h-4 w-4" />
										<span className="text-sm font-semibold">
											{isExpiring
												? t("chat_drawer.is_expiring_toggle_on")
												: t("chat_drawer.is_expiring_toggle_off")}
										</span>
									</button>
									<button
										type="button"
										onClick={handleSendSelected}
										disabled={isSending}
										className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
									>
										{isSending ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Send className="h-4 w-4" />
										)}
										<span className="truncate">
											{isSending
												? t("chat_drawer.sending")
												: isExpiring
													? t("chat_drawer.is_expiring_send", { count: selectedIds.size })
													: t("chat_drawer.send", { count: selectedIds.size })}
										</span>
									</button>
								</div>
							</div>
						) : null}
					</>
				)}

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
		</BottomSheet>
	);
}
