import { Check, Image as ImageIcon, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import type { DrawerMedia } from "../chat/ChatDrawerPanel";

interface AlbumDrawerPickerSheetProps {
	media: DrawerMedia[];
	isLoading: boolean;
	error: string | null;
	onLoadMedia: () => void;
	onClose: () => void;
	onConfirm: (mediaIds: number[]) => void | Promise<void>;
	isSubmitting: boolean;
	remainingSlots: number;
	isDesktop: boolean;
}

export function AlbumDrawerPickerSheet({
	media,
	isLoading,
	error,
	onLoadMedia,
	onClose,
	onConfirm,
	isSubmitting,
	remainingSlots,
	isDesktop,
}: AlbumDrawerPickerSheetProps) {
	const { t } = useTranslation();
	const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

	// The album-content-by-id endpoint only accepts images — adding a
	// drawer video fails server-side, so videos aren't offered here at all.
	const imageMedia = useMemo(
		() => media.filter((item) => item.contentType.startsWith("image/")),
		[media],
	);

	const toggleSelection = useCallback((id: number) => {
		setSelectedIds((prev) => {
			if (prev.has(id)) {
				const next = new Set(prev);
				next.delete(id);
				return next;
			}
			if (prev.size >= remainingSlots) {
				toast.error(t("settings_albums.error_album_full", {
					defaultValue: "Album is full (max {{max}} items).",
					max: remainingSlots + prev.size,
				}));
				return prev;
			}
			const next = new Set(prev);
			next.add(id);
			return next;
		});
	}, [remainingSlots, t]);

	const handleConfirm = useCallback(async () => {
		if (selectedIds.size === 0) return;
		await onConfirm([...selectedIds]);
	}, [selectedIds, onConfirm]);

	return (
		<BottomSheet
			onClose={isSubmitting ? () => {} : onClose}
			isProcessing={isSubmitting}
			isDesktop={isDesktop}
			bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]"
			panelClassName="px-4"
		>
			<div className="mb-4 flex items-center justify-between">
				<h3 className="text-sm font-semibold text-[var(--text)]">
					{t("settings_albums.drawer_picker_title", { defaultValue: "Select media" })}
				</h3>
				<SheetClose className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
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
							onClick={onLoadMedia}
							className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-readable)]"
						>
							<RefreshCw className="h-3 w-3" />
							{t("chat_drawer.retry")}
						</button>
					</div>
				) : imageMedia.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-[var(--text-muted)]">
						<ImageIcon className="h-8 w-8 opacity-30" />
						<p className="text-xs">{t("settings_albums.drawer_empty", { defaultValue: "No media in your drawer yet." })}</p>
					</div>
				) : (
					<div className={`grid gap-px bg-[var(--border)] ${isDesktop ? "grid-cols-5" : "grid-cols-3"}`}>
						{imageMedia.map((item) => {
							const isSelected = selectedIds.has(item.id);

							return (
								<div
									key={item.id}
									role="button"
									tabIndex={0}
									onClick={() => toggleSelection(item.id)}
									onKeyDown={(e) => e.key === "Enter" && toggleSelection(item.id)}
									className="relative aspect-square overflow-hidden cursor-pointer transition"
									style={{
										outline: isSelected ? "2px solid var(--accent)" : "none",
										outlineOffset: "-2px",
									}}
								>
									<img
										src={item.url}
										alt={t("chat_drawer.media_alt")}
										className="h-full w-full object-cover"
									/>

									{isSelected ? (
										<div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
											<Check className="h-5 w-5 text-white drop-shadow" />
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				)}
			</div>

			{selectedIds.size > 0 ? (
				<div className="mt-3 -mx-4 border-t border-[var(--border)] pt-3 px-4">
					<button
						type="button"
						onClick={() => void handleConfirm()}
						disabled={isSubmitting}
						className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isSubmitting ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Plus className="h-4 w-4" />
						)}
						<span>
							{isSubmitting
								? t("settings_albums.uploading")
								: `${t("settings_albums.add_to_album_button", { defaultValue: "Add to Album" })} (${selectedIds.size})`}
						</span>
					</button>
				</div>
			) : null}
		</BottomSheet>
	);
}
