import { Images, Loader2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "./ui/bottom-sheet";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";

export type AlbumMediaSheetItem = {
	contentId: number;
	contentType: string | null;
	thumbUrl: string | null;
	url: string | null;
	coverUrl: string | null;
	processing: boolean;
};

type Props = {
	albumName: string | null;
	content: AlbumMediaSheetItem[];
	onClose: () => void;
	onSelect: (index: number) => void;
	/** True while the full-screen viewer is open on top of this sheet — disables the sheet's own Escape/backdrop/swipe dismissal so those gestures act on the viewer instead of closing the (currently hidden) sheet underneath it. */
	locked?: boolean;
};

/** Browse-first grid for an album's content — mirrors ChatMediaSheet's grid, but for a single album. Tapping an item opens it in the full-screen album viewer at that index. */
export function AlbumMediaSheet({ albumName, content, onClose, onSelect, locked = false }: Props) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} isProcessing={locked} panelClassName="max-h-[82dvh]">
			<div className="flex flex-col" style={{ minHeight: "60vh" }}>
				<div className="flex items-center justify-between px-4 pb-3">
					<p className="truncate text-sm font-semibold text-[var(--text)]">
						{albumName?.trim() || t("shared_albums.album_label")}
					</p>
					<SheetClose
						className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
						aria-label={t("shared_albums.close_viewer")}
					>
						<X className="h-4 w-4" />
					</SheetClose>
				</div>

				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4" data-lenis-prevent>
					{content.length > 0 ? (
						<div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
							{content.map((item, idx) => {
								const isVideo = item.contentType?.startsWith("video/") ?? false;
								// thumbUrl/coverUrl are always static preview images; `url` is
								// the raw media file (the actual video for video items), so it
								// only works as an <img> fallback for images — a <video src>
								// without a poster/seek hack renders blank (see PhotoViewer's
								// currentTime-seek workaround), so the grid always uses a still
								// image + a Play badge for videos instead of a <video> tag.
								const src = item.thumbUrl ?? item.coverUrl ?? (isVideo ? null : item.url);
								return (
									<button
										key={item.contentId}
										type="button"
										disabled={item.processing}
										onClick={() => onSelect(idx)}
										className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--surface-2)] disabled:opacity-50"
									>
										{src ? (
											<img
												src={src}
												alt={t("shared_albums.content_alt", { index: idx + 1 })}
												className="h-full w-full object-cover transition group-hover:scale-105"
											/>
										) : (
											<div className="absolute inset-0 flex items-center justify-center">
												<Images className="h-6 w-6 text-[var(--text-muted)] opacity-40" />
											</div>
										)}
										{isVideo && !item.processing && (
											<div className="absolute inset-0 flex items-center justify-center bg-black/15">
												<Play className="h-6 w-6 text-white drop-shadow" fill="white" />
											</div>
										)}
										{item.processing && (
											<div className="absolute inset-0 flex items-center justify-center bg-black/40">
												<Loader2 className="h-5 w-5 animate-spin text-white" />
											</div>
										)}
									</button>
								);
							})}
						</div>
					) : (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
							<Images className="h-10 w-10 opacity-30" />
							<p className="text-sm font-medium">{t("shared_albums.empty_album_title")}</p>
							<p className="text-xs opacity-60">{t("shared_albums.empty_album_desc")}</p>
						</div>
					)}
				</div>
			</div>
		</BottomSheet>
	);
}
