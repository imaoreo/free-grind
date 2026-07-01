import { useRef, useState } from "react";
import { Download, Images, MessageCircle, Play, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/states";
import { PageHeaderBackground } from "../../../components/ui/PageHeaderBackground";
import { saveMediaBatch } from "../../../services/saveMedia";
import { appLog } from "../../../utils/logger";
import type { AlbumViewer } from "../../../types/shared-albums";

type AlbumContent = AlbumViewer["content"][number];

type AlbumViewerPanelProps = {
	viewer: AlbumViewer;
	viewerIndex: number;
	fullScreenIndex: number | null;
	selectedViewerItem: AlbumContent | null;
	closeViewer: () => void;
	openFullScreen: (index: number) => void;
	onMessageProfile: (profileId: number) => void;
	onViewProfile: (profileId: number) => void;
	hideProfileActions?: boolean;
};

export function AlbumViewerPanel({
	viewer,
	viewerIndex,
	fullScreenIndex,
	selectedViewerItem,
	closeViewer,
	openFullScreen,
	onMessageProfile,
	onViewProfile,
	hideProfileActions = false,
}: AlbumViewerPanelProps) {
	const { t } = useTranslation();
	const [isSavingAll, setIsSavingAll] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);

	const handleClose = () => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);
		setTimeout(() => closeViewer(), 280);
	};

	const handleSaveAll = async () => {
		const items = viewer.content
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
			appLog.error("[AlbumViewerPanel] Save all failed", error);
			toast.error(t("profile_details.save_all_error"), { id: toastId });
		} finally {
			setIsSavingAll(false);
		}
	};

	return (
		<div className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${isClosing ? "pointer-events-none" : ""}`}>
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
				onClick={handleClose}
			/>

			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-top-out" : "animate-modal-top-in"
				} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative shrink-0 overflow-hidden px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color="var(--accent)" />
					<div className="flex items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
								<Images className="h-5 w-5" />
							</div>
							<div className="min-w-0">
								<h2 className="truncate text-xl font-bold tracking-tight text-[var(--text)]">
									{viewer.albumName?.trim() || `Album #${viewer.albumId}`}
								</h2>
								<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
										<UserRound className="h-3 w-3 shrink-0" />
										<span className="truncate max-w-[160px]">{viewer.profileName}</span>
									</span>
									<span className="h-1 w-1 shrink-0 rounded-full bg-[var(--border)]" />
									<span className="text-xs text-[var(--text-muted)]">
										{t("shared_albums.items_count", { count: viewer.content.length })}
										{fullScreenIndex !== null && selectedViewerItem
											? ` · ${viewerIndex + 1}/${viewer.content.length}`
											: ""}
									</span>
								</div>
							</div>
						</div>

						<div className="flex shrink-0 items-center gap-2">
							{viewer.content.length > 0 && (
								<button
									type="button"
									onClick={() => void handleSaveAll()}
									disabled={isSavingAll}
									aria-label={t("profile_details.save_all")}
									className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90 disabled:opacity-50"
								>
									<Download className="h-3.5 w-3.5" />
									{t("profile_details.save_all")}
								</button>
							)}
							<button
								type="button"
								onClick={handleClose}
								aria-label={t("shared_albums.close_viewer")}
								className="shrink-0 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
							>
								<X className="h-5 w-5" />
							</button>
						</div>
					</div>
				</header>

				<div className="shrink-0 border-t border-[var(--border)]" />

				{viewer.content.length === 0 ? (
					<div className="flex-1 p-4 sm:p-6">
						<EmptyState
							title={t("shared_albums.empty_album_title")}
							description={t("shared_albums.empty_album_desc")}
						/>
					</div>
				) : (
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div
							className="grid grid-cols-3 gap-1 p-3 sm:grid-cols-4 sm:gap-1.5 sm:p-4 lg:grid-cols-5"
							style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}
						>
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
										onClick={() => openFullScreen(index)}
										className={`group relative aspect-square overflow-hidden rounded-xl transition-all duration-150 ${
											isActive
												? "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)] scale-[0.97]"
												: "hover:scale-[1.02] hover:shadow-lg active:scale-[0.97]"
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

				{!hideProfileActions && (
					<div
						className="relative z-10 shrink-0 border-t border-[var(--border)] px-[var(--app-px)] pt-3 flex gap-2"
						style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
					>
						<Button
							type="button"
							variant="secondary"
							onClick={() => onMessageProfile(viewer.profileId)}
							className="flex-1 gap-1.5"
						>
							<MessageCircle className="h-4 w-4" />
							{t("profile_details.message")}
						</Button>
						<Button
							type="button"
							variant="secondary"
							onClick={() => onViewProfile(viewer.profileId)}
							className="flex-1 gap-1.5"
						>
							<UserRound className="h-4 w-4" />
							{t("chat.view_profile")}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
