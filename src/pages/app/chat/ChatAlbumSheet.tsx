import { Loader2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { EmptyState } from "../../../components/ui/states";
import type { AlbumViewerState } from "../../../types/chat-page";

type ChatAlbumSheetProps = {
	viewer: AlbumViewerState | null;
	isLoading: boolean;
	fullScreenIndex: number | null;
	onClose: () => void;
	onOpenFullScreen: (index: number) => void;
	isDesktop: boolean;
};

export function ChatAlbumSheet({
	viewer,
	isLoading,
	fullScreenIndex,
	onClose,
	onOpenFullScreen,
	isDesktop,
}: ChatAlbumSheetProps) {
	const { t } = useTranslation();

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} zIndex="z-50">
			{/* Header */}
			<div className="flex items-center justify-between px-4 pb-3">
				<div className="flex min-w-0 items-center gap-2">
					<p className="truncate text-sm font-semibold text-[var(--text)]">
						{viewer?.albumName?.trim() || (viewer ? `Album #${viewer.albumId}` : "Album")}
					</p>
					{viewer && (
						<span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
							{viewer.content.length}
						</span>
					)}
				</div>
				<SheetClose className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			<div className="mx-4 border-t border-[var(--border)]" />

			{/* Body */}
			{isLoading ? (
				<div className="flex items-center justify-center py-10">
					<Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
				</div>
			) : !viewer || viewer.content.length === 0 ? (
				<div className="p-4">
					<EmptyState
						title={t("shared_albums.empty_album_title")}
						description={t("shared_albums.empty_album_desc")}
					/>
				</div>
			) : (
				<div className="overflow-y-auto" style={{ maxHeight: "55dvh" }}>
					<div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-4 sm:gap-1.5 sm:p-4">
						{viewer.content.map((item, index) => {
							const mediaUrl = item.thumbUrl || item.url || item.coverUrl;
							const isActive = index === fullScreenIndex;
							const isVideo = item.contentType?.startsWith("video/");

							return (
								<button
									key={item.contentId}
									type="button"
									onClick={() => onOpenFullScreen(index)}
									className={`group relative aspect-square overflow-hidden rounded-xl transition-all duration-150 ${
										isActive
											? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--surface)] scale-[0.97]"
											: "hover:scale-[1.02] hover:shadow-md active:scale-[0.97]"
									}`}
								>
									{mediaUrl ? (
										<>
											{isVideo ? (
												<video src={mediaUrl} className="h-full w-full object-cover" muted />
											) : (
												<img
													src={mediaUrl}
													alt={t("shared_albums.content_alt", { index: index + 1 })}
													loading="lazy"
													className="h-full w-full object-cover"
												/>
											)}
											{isVideo && (
												<div className="absolute inset-0 flex items-center justify-center bg-black/30">
													<div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm">
														<Play className="h-4 w-4 fill-white text-white" />
													</div>
												</div>
											)}
											{!isVideo && (
												<div className={`absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/10 ${isActive ? "bg-black/20" : ""}`} />
											)}
										</>
									) : (
										<div className="flex h-full w-full items-center justify-center bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]">
											{t("shared_albums.unavailable")}
										</div>
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</BottomSheet>
	);
}
