import { useState } from "react";
import { Download, Loader2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { EmptyState } from "../../../components/ui/states";
import { saveMediaBatch } from "../../../services/saveMedia";
import { appLog } from "../../../utils/logger";
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
	const [isSavingAll, setIsSavingAll] = useState(false);

	const handleSaveAll = async () => {
		const items = (viewer?.content ?? [])
			.map((item) => ({
				url: item.url || item.coverUrl,
				type: (item.contentType?.startsWith("video/") ? "video" : "image") as "image" | "video",
			}))
			.filter((item): item is { url: string; type: "image" | "video" } => !!item.url);

		if (items.length === 0) {
			toast.error(t("profile_details.save_all_empty"));
			return;
		}

		setIsSavingAll(true);
		const toastId = toast.loading(
			t("profile_details.save_all_progress", { done: 0, total: items.length }),
		);
		try {
			const result = await saveMediaBatch(items, (done, total) => {
				toast.loading(t("profile_details.save_all_progress", { done, total }), { id: toastId });
			});

			if (result.failed === 0) {
				toast.success(t("profile_details.save_all_success", { count: result.succeeded }), {
					id: toastId,
				});
			} else {
				toast.error(
					t("profile_details.save_all_partial", {
						succeeded: result.succeeded,
						total: result.total,
						failed: result.failed,
					}),
					{ id: toastId },
				);
			}
		} catch (error) {
			appLog.error("[ChatAlbumSheet] Save all failed", error);
			toast.error(t("profile_details.save_all_error"), { id: toastId });
		} finally {
			setIsSavingAll(false);
		}
	};

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[82dvh]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 pb-3">
				<div className="flex min-w-0 items-center gap-2">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<p className="text-sm font-semibold text-[var(--text)]">
								{t("shared_albums.album_label")}
							</p>
							{viewer && (
								<span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
									{viewer.content.length}
								</span>
							)}
						</div>
						<p className="truncate text-xs text-[var(--text-muted)]">
							{viewer?.albumName?.trim() || `#${viewer?.albumId}`}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2 self-start">
					{viewer && viewer.content.length > 0 && (
						<button
							type="button"
							onClick={() => void handleSaveAll()}
							disabled={isSavingAll}
							className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)] disabled:opacity-50"
						>
							<Download className="h-3.5 w-3.5" />
							{t("profile_details.save_all")}
						</button>
					)}
					<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
						<X className="h-4 w-4" />
					</SheetClose>
				</div>
			</div>

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
				<div className="min-h-0 flex-1 overflow-y-auto">
					<div className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-4 sm:gap-1.5 sm:p-4">
						{viewer.content.map((item, index) => {
							const isVideo = item.contentType?.startsWith("video/");
							const mediaUrl = isVideo
								? (item.thumbUrl || item.coverUrl || item.url)
								: (item.thumbUrl || item.url || item.coverUrl);
							const isActive = index === fullScreenIndex;

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
											<img
											src={mediaUrl ?? undefined}
											alt={t("shared_albums.content_alt", { index: index + 1 })}
											loading="lazy"
											className="h-full w-full object-cover"
										/>
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
