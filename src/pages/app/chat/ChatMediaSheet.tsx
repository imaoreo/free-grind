import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Images, LayoutGrid, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ProfileImage } from "../../../components/ui/profile-image";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { PhotoViewer } from "../../../components/PhotoViewer";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { saveMediaBatch } from "../../../services/saveMedia";
import { appLog } from "../../../utils/logger";
import type { SharedConversationImage } from "../../../types/chat-service";

type Tab = "albums" | "media";

type SharedAlbum = {
	albumId: number;
	albumName: string | null;
	coverUrl: string | null;
	contentCount: { imageCount: number; videoCount: number };
};

type Props = {
	conversationId: string;
	senderProfileId: string | null;
	userId: number | null;
	isDesktop: boolean;
	senderPhotoUrl?: string | null;
	onClose: () => void;
	openAlbumViewerById: (albumId: number) => void | Promise<void>;
	openFullScreenImage: (imageUrl: string) => void;
};

export function ChatMediaSheet({
	conversationId,
	senderProfileId,
	userId,
	isDesktop,
	senderPhotoUrl,
	onClose,
	openAlbumViewerById,
	openFullScreenImage,
}: Props) {
	const { t } = useTranslation();
	const service = useApiFunctions();
	const [tab, setTab] = useState<Tab>("media");
	const [albums, setAlbums] = useState<SharedAlbum[]>([]);
	const [albumsLoading, setAlbumsLoading] = useState(true);
	const [images, setImages] = useState<SharedConversationImage[]>([]);
	const [mediaLoading, setMediaLoading] = useState(true);
	const [failedCovers, setFailedCovers] = useState<Set<number>>(new Set());
	const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
	const [viewerIndex, setViewerIndex] = useState<number | null>(null);
	const [isSavingAll, setIsSavingAll] = useState(false);

	const handleSaveAll = async () => {
		const urls = images.filter((i) => i.url).map((i) => i.url!);
		if (urls.length === 0) {
			toast.error(t("profile_details.save_all_empty"));
			return;
		}

		setIsSavingAll(true);
		const toastId = toast.loading(
			t("profile_details.save_all_progress", { done: 0, total: urls.length }),
		);
		try {
			const result = await saveMediaBatch(
				urls.map((url) => ({ url, type: "image" as const })),
				(done, total) => {
					toast.loading(t("profile_details.save_all_progress", { done, total }), {
						id: toastId,
					});
				},
			);

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
			appLog.error("[ChatMediaSheet] Save all failed", error);
			toast.error(t("profile_details.save_all_error"), { id: toastId });
		} finally {
			setIsSavingAll(false);
		}
	};

	// Load shared albums from API
	useEffect(() => {
		if (!senderProfileId) { setAlbumsLoading(false); return; }
		setAlbumsLoading(true);
		service.getSharedAlbumsForProfile({ profileId: Number(senderProfileId) })
			.then((sharedAlbums) => {
				setAlbums(sharedAlbums.map((a) => ({
					albumId: a.albumId,
					albumName: a.albumName ?? a.name ?? null,
					coverUrl: a.content?.thumbUrl ?? a.content?.url ?? a.content?.coverUrl ?? null,
					contentCount: a.contentCount,
				})));
			})
			.catch((err) => console.error("[ChatMediaSheet] getSharedAlbumsForProfile failed", err))
			.finally(() => setAlbumsLoading(false));
	}, [senderProfileId, service]);

	// Load shared images from API
	useEffect(() => {
		setMediaLoading(true);
		service.getSharedConversationImages(conversationId)
			.then((imgs) => setImages(imgs.filter((i) => i.url)))
			.catch(() => {})
			.finally(() => setMediaLoading(false));
	}, [conversationId, service]);

	const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number; loading: boolean }[] = [
		{
			id: "media",
			label: t("chat.media_sheet.tab_media"),
			icon: <Images className="h-4 w-4" />,
			count: images.length,
			loading: mediaLoading,
		},
		{
			id: "albums",
			label: t("chat.media_sheet.tab_albums"),
			icon: <LayoutGrid className="h-4 w-4" />,
			count: albums.length,
			loading: albumsLoading,
		},
	];

	return (
		<>
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[82dvh]">
			<div className="flex flex-col" style={{ minHeight: "60vh" }}>
				{/* Header */}
				<div className="flex items-center justify-between px-4 pb-3">
					<p className="text-sm font-semibold text-[var(--text)]">{t("chat.media_sheet.title")}</p>
					<div className="flex items-center gap-2">
						{tab === "media" && images.length > 0 && (
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
						<SheetClose className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
							<X className="h-4 w-4" />
						</SheetClose>
					</div>
				</div>

				{/* Tab bar */}
				<div className="flex border-b border-[var(--border)] px-2 pb-0 pt-1">
					{tabs.map((tab_item) => (
						<button
							key={tab_item.id}
							type="button"
							onClick={() => setTab(tab_item.id)}
							className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
								tab === tab_item.id
									? "border-[var(--accent)] text-[var(--accent)]"
									: "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
							}`}
						>
							{tab_item.icon}
							{tab_item.label}
							{!tab_item.loading && tab_item.count > 0 && (
								<span className="min-w-[18px] rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white">
									{tab_item.count}
								</span>
							)}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex flex-1 flex-col overflow-y-auto p-4">
					{tab === "albums" ? (
						albumsLoading ? (
							<div className="flex items-center justify-center py-16">
								<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
							</div>
						) : albums.length === 0 ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
								<LayoutGrid className="h-10 w-10 opacity-30" />
								<p className="text-sm font-medium">{t("chat.media_sheet.albums_empty_title")}</p>
								<p className="text-xs opacity-60">{t("chat.media_sheet.albums_empty_desc")}</p>
							</div>
						) : (
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{albums.map((album) => {
									const coverFailed = failedCovers.has(album.albumId);
									const showCover = !!album.coverUrl && !coverFailed;
									return (
										<button
											key={album.albumId}
											type="button"
											onClick={() => void openAlbumViewerById(album.albumId)}
											className="group relative aspect-square overflow-hidden rounded-xl bg-[var(--surface-2)]"
										>
											{showCover ? (
												<img
													src={album.coverUrl!}
													alt=""
													className="absolute inset-0 h-full w-full object-cover scale-110"
													style={{ filter: "blur(3px)" }}
													onError={() => setFailedCovers((p) => new Set([...p, album.albumId]))}
												/>
											) : (
												<div className="absolute inset-0 flex items-center justify-center">
													<LayoutGrid className="h-8 w-8 text-[var(--text-muted)] opacity-40" />
												</div>
											)}
											<div className="absolute inset-0 bg-black/20" />
											<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
												<div
													className="h-10 w-10 overflow-hidden rounded-full ring-2 ring-white/60"
													style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
												>
													<ProfileImage src={senderPhotoUrl} />
												</div>
												<p className="line-clamp-2 max-w-full text-center text-[11px] font-medium leading-tight text-white drop-shadow">
													{album.albumName ?? `#${album.albumId}`}
												</p>
											</div>
										</button>
									);
								})}
							</div>
						)
					) : mediaLoading ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
						</div>
					) : images.length === 0 ? (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
							<Images className="h-10 w-10 opacity-30" />
							<p className="text-sm font-medium">{t("chat.media_sheet.media_empty_title")}</p>
							<p className="text-xs opacity-60">{t("chat.media_sheet.media_empty_desc")}</p>
						</div>
					) : (
						<div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
							{images.map((img, idx) => {
								if (!img.url || failedImages.has(img.mediaId)) return null;
								return (
									<button
										key={img.mediaId}
										type="button"
										onClick={() => setViewerIndex(idx)}
										className="group aspect-square overflow-hidden rounded-lg bg-[var(--surface-2)]"
									>
										<img
											src={img.url}
											alt=""
											className="h-full w-full object-cover transition group-hover:scale-105"
											onError={() =>
												setFailedImages((prev) => new Set([...prev, img.mediaId]))
											}
										/>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</BottomSheet>

		{viewerIndex !== null && createPortal(
			<PhotoViewer
				isOpen
				onClose={() => setViewerIndex(null)}
				photos={images.filter((i) => i.url).map((i) => i.url!)}
				initialIndex={viewerIndex}
			/>,
			document.body,
		)}
		</>
	);
}
