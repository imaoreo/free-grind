import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/states";
import type { AlbumViewer } from "../../../types/shared-albums";

type AlbumContent = AlbumViewer["content"][number];

type AlbumViewerPanelProps = {
	viewer: AlbumViewer;
	viewerIndex: number;
	fullScreenIndex: number | null;
	selectedViewerItem: AlbumContent | null;
	closeViewer: () => void;
	openFullScreen: (index: number) => void;
};

export function AlbumViewerPanel({
	viewer,
	viewerIndex,
	fullScreenIndex,
	selectedViewerItem,
	closeViewer,
	openFullScreen,
}: AlbumViewerPanelProps) {
	const { t } = useTranslation();

	return (
		<div
			className="fixed inset-0 z-50 bg-black/75 p-0 backdrop-blur-[2px] sm:p-5"
			onClick={closeViewer}
		>
			<div
				className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden border border-[var(--border)] bg-[var(--surface)] sm:h-full sm:rounded-2xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
					<div className="min-w-0">
						<p className="text-xs uppercase tracking-[0.12em] text-[var(--text-muted)]">
							{t("shared_albums.album_label")}
						</p>
						<p className="truncate text-lg font-semibold">
							{viewer.albumName?.trim() || `Album #${viewer.albumId}`}
						</p>
						<p className="text-xs text-[var(--text-muted)]">
							{t("shared_albums.items_count", { count: viewer.content.length })}
							{selectedViewerItem ? ` · ${viewerIndex + 1}/${viewer.content.length}` : ""}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="icon"
							variant="ghost"
							onClick={closeViewer}
							aria-label={t("shared_albums.close_viewer")}
						>
							<X className="h-4 w-4" />
						</Button>
					</div>
				</div>

				{viewer.content.length === 0 ? (
					<div className="p-4 sm:p-6">
						<EmptyState
							title={t("shared_albums.empty_album_title")}
							description={t("shared_albums.empty_album_desc")}
						/>
					</div>
				) : (
					<div className="min-h-0 flex-1 p-3 sm:p-5">
						<div className="mb-3">
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
								{t("shared_albums.all_media")}
							</p>
						</div>
						<div className="grid max-h-full grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-5">
							{viewer.content.map((item, index) => {
								const mediaUrl = item.thumbUrl || item.url || item.coverUrl;
								const isActive = index === fullScreenIndex;

								return (
									<button
										key={item.contentId}
										type="button"
										onClick={() => openFullScreen(index)}
										className={`relative aspect-square overflow-hidden rounded-lg border transition ${
											isActive
												? "border-[var(--accent)]"
												: "border-[var(--border)] hover:border-[var(--text-muted)]"
										}`}
									>
										{mediaUrl ? (
											item.contentType?.startsWith("video/") ? (
												<video src={mediaUrl} className="h-full w-full object-cover" muted />
											) : (
												<img
													src={mediaUrl}
													alt={t("shared_albums.content_alt", { index: index + 1 })}
													loading="lazy"
													className="h-full w-full object-cover"
												/>
											)
										) : (
											<div className="flex h-full w-full items-center justify-center bg-[var(--surface-2)] text-[10px] text-[var(--text-muted)]">
												{t("shared_albums.unavailable")}
											</div>
										)}
										{isActive ? (
											<div className="absolute inset-x-2 bottom-2 rounded-full bg-black/70 px-2 py-1 text-center text-[10px] font-medium text-white">
												{t("shared_albums.open_action")}
											</div>
										) : null}
									</button>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
