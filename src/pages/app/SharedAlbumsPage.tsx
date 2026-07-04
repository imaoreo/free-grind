import { Album, ChevronLeft, Film, Layers, RefreshCw, Star, Trash2, Wifi } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { FeedScrollContainer } from "../../components/ui/FeedScrollContainer";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { useAuth } from "../../contexts/useAuth";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { ProfileImage } from "../../components/ui/profile-image";
import type { ConversationEntry } from "../../types/chat";
import type { AlbumViewer, SharedAlbumItem } from "../../types/shared-albums";
import type { GetSharedAlbumsInput } from "../../types/api-functions";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { cn } from "../../utils/cn";
import { captureAlbum, deleteLocalAlbum, getCachedAlbumCoverUri, getLocalAlbum } from "../../services/albumStore";
import { getAllAlbums, getConversation } from "../../services/chatDb";
import { toDataUri } from "../../services/mediaStore";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { AlbumViewerPanel } from "./shared-albums/AlbumViewerPanel";
import { PhotoViewer, type PhotoViewerMedia } from "../../components/PhotoViewer";
import { useRevealOnScroll } from "../../hooks/useRevealOnScroll";

function getCounterparty(
	entry: ConversationEntry,
	userId: number | null,
): { profileId: number; mediaHash: string | null } | null {
	const participants = entry.data.participants ?? [];
	if (!participants.length) {
		return null;
	}

	const otherParticipant =
		userId == null
			? participants[0]
			: participants.find((participant) => participant.profileId !== userId) ??
				participants[0];

	if (!otherParticipant) {
		return null;
	}

	return {
		profileId: otherParticipant.profileId,
		mediaHash: otherParticipant.primaryMediaHash ?? null,
	};
}

function AlbumCard({
	item,
	onClick,
	onDelete,
	isDeleting,
	showAlbumCounter,
	t,
}: {
	item: SharedAlbumItem;
	onClick: () => void;
	onDelete: () => void;
	isDeleting: boolean;
	showAlbumCounter: boolean;
	t: (key: string) => string;
}) {
	const { ref, revealClass } = useRevealOnScroll();
	const previewUrl =
		item.album.content?.thumbUrl ||
		item.album.content?.url ||
		item.album.content?.coverUrl ||
		null;
	const avatarUrl = item.profileMediaHash
		? getThumbImageUrl(item.profileMediaHash, "320x320")
		: null;

	return (
		<div ref={ref} className={revealClass}>
			<div className="surface-card relative w-full overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5">
				<button
					type="button"
					onClick={onClick}
					className="block w-full text-left"
				>
					<div className="relative aspect-[4/6] w-full bg-[var(--surface-2)]">
						{previewUrl ? (
							<>
								<img
									src={previewUrl}
									alt={item.album.albumName ?? t("shared_albums.preview_alt")}
									className="h-full w-full scale-110 object-cover blur-xl"
								/>
								<div className="absolute inset-0 bg-black/25" />
							</>
						) : (
							<div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
								<Album className="h-8 w-8" />
							</div>
						)}
						<div className="absolute left-2 top-2 flex items-center gap-1">
							{item.album.contentCount.videoCount > 0 ? (
								<div
									className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/85 backdrop-blur-sm"
									title={t("shared_albums.video_label")}
									aria-label={t("shared_albums.video_label")}
								>
									<Film className="h-3 w-3" />
								</div>
							) : null}
						</div>
						{showAlbumCounter && !item.localOnly && item.totalAlbumsShared != null ? (
							<div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold tabular-nums text-white/85 backdrop-blur-sm">
								<Layers className="h-3 w-3" />
								{item.albumNumber}/{item.totalAlbumsShared}
							</div>
						) : null}
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 text-center text-white">
							<div className="h-20 w-20 overflow-hidden rounded-full border-white/25 bg-white/15 text-white shadow-lg backdrop-blur-sm">
								<ProfileImage src={avatarUrl} alt={item.profileName} />
							</div>
							<div className="min-w-0">
								<p className="truncate text-base font-semibold leading-tight text-white drop-shadow">
									{item.profileName}
								</p>
								{item.album.albumName ? (
									<p className="mt-0.5 truncate text-xs font-medium leading-tight text-white/75 drop-shadow">
										{item.album.albumName}
									</p>
								) : null}
							</div>
						</div>
					</div>
				</button>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation();
						onDelete();
					}}
					disabled={isDeleting}
					title={t("shared_albums.delete")}
					className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-red-500/80 disabled:opacity-50"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	);
}

export function SharedAlbumsPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { userId } = useAuth();
	const { mobileGridColumns } = usePreferences();
	const apiFunctions = useApiFunctions();

	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [items, setItems] = useState<SharedAlbumItem[]>([]);
	const [isOpeningAlbum, setIsOpeningAlbum] = useState(false);
	const [openAlbumError, setOpenAlbumError] = useState<string | null>(null);
	const [viewer, setViewer] = useState<AlbumViewer | null>(null);
	const [viewerIndex, setViewerIndex] = useState(0);
	const [fullScreenIndex, setFullScreenIndex] = useState<number | null>(null);
	const feedContainerRef = useRef<HTMLDivElement>(null);
	const viewerHistoryPushedRef = useRef(false);
	const fullScreenHistoryPushedRef = useRef(false);
	const minmaxValue = mobileGridColumns === "2" ? "130px" : "100px";

	const [filters, setFilters] = useState({ isFavorite: false, isOnline: false, onlyVideo: false });

	const loadSharedAlbums = useCallback(async () => {
		setError(null);

		try {
			const profileMap = new Map<
				number,
				{ profileName: string; conversationId: string | null; profileMediaHash: string | null }
			>();
			let page = 1;
			let nextPage: number | null = 1;

			while (nextPage != null && page <= 6) {
				const inbox = await apiFunctions.listConversations({ page });

				for (const entry of inbox.entries) {
					const counterparty = getCounterparty(entry, userId);
					if (!counterparty) {
						continue;
					}

					profileMap.set(counterparty.profileId, {
						profileName:
							entry.data.name?.trim() || `Profile ${counterparty.profileId}`,
						conversationId: entry.data.conversationId ?? null,
						profileMediaHash: counterparty.mediaHash,
					});
				}

				nextPage = inbox.nextPage ?? null;
				if (!nextPage) {
					break;
				}
				page = nextPage;
			}

			const feedFilters: GetSharedAlbumsInput = {
				...(filters.isFavorite ? { isFavorite: true } : {}),
				...(filters.isOnline ? { isOnline: true } : {}),
				...(filters.onlyVideo ? { onlyVideo: true } : {}),
			};
			const feed = await apiFunctions.getSharedAlbums(feedFilters);
			const nextItems: SharedAlbumItem[] = feed.sharedAlbums.map((sharedAlbum) => {
				const profileMeta = profileMap.get(sharedAlbum.ownerProfileId);
				const profileName =
					profileMeta?.profileName ||
					sharedAlbum.profile.name?.trim() ||
					`Profile ${sharedAlbum.ownerProfileId}`;

				return {
					profileId: sharedAlbum.ownerProfileId,
					profileName,
					profileMediaHash:
						profileMeta?.profileMediaHash &&
						validateMediaHash(profileMeta.profileMediaHash)
							? profileMeta.profileMediaHash
							: null,
					conversationId: profileMeta?.conversationId ?? null,
					album: {
						albumId: sharedAlbum.albumId,
						albumName: sharedAlbum.name,
						content: {
							thumbUrl: sharedAlbum.coverContent.location,
							url: sharedAlbum.coverContent.location,
							coverUrl: sharedAlbum.coverContent.location,
						},
						contentCount: {
							imageCount: sharedAlbum.imageCount,
							videoCount: sharedAlbum.videoCount,
						},
					},
                    albumNumber: sharedAlbum.albumNumber,
					totalAlbumsShared: sharedAlbum.totalAlbumsShared,
				};
			});

			nextItems.sort((a, b) => {
				return a.albumNumber - b.albumNumber;
			});

			// Albums we've cached locally but that are no longer in the live
			// share feed (e.g. the owner removed the share) still get listed,
			// marked localOnly, so the user can clear them from this page.
			// Only computed with no filters active — a filtered feed excludes
			// albums that are still shared but don't match the filter, which
			// would otherwise get mislabeled as "no longer shared".
			const hasActiveFilter = filters.isFavorite || filters.isOnline || filters.onlyVideo;
			const liveAlbumIds = new Set(feed.sharedAlbums.map((sharedAlbum) => sharedAlbum.albumId));
			const cachedOnlyAlbums = hasActiveFilter
				? []
				: (await getAllAlbums().catch(() => [])).filter(
					(stored) => !liveAlbumIds.has(Number(stored.albumId)),
				);
			const cachedOnlyItems = (
				await Promise.all(
					cachedOnlyAlbums.map(async (stored): Promise<SharedAlbumItem | null> => {
						const profileId = stored.ownerProfileId ? Number(stored.ownerProfileId) : null;
						if (profileId == null) {
							return null;
						}
						let profileName = `Profile ${profileId}`;
						let profileMediaHash: string | null = null;
						if (stored.conversationId) {
							const conversation = await getConversation(stored.conversationId).catch(() => null);
							if (conversation) {
								profileName = conversation.entry.data.name?.trim() || profileName;
								const counterparty = getCounterparty(conversation.entry, userId);
								if (counterparty?.mediaHash && validateMediaHash(counterparty.mediaHash)) {
									profileMediaHash = counterparty.mediaHash;
								}
							}
						}
						const cachedCover =
							getCachedAlbumCoverUri(Number(stored.albumId)) ??
							(stored.previewCoverBase64 && stored.previewCoverMimeType
								? toDataUri(stored.previewCoverMimeType, stored.previewCoverBase64)
								: null);
						return {
							profileId,
							profileName,
							profileMediaHash,
							conversationId: stored.conversationId,
							album: {
								albumId: Number(stored.albumId),
								albumName: stored.albumName,
								content: cachedCover
									? { thumbUrl: cachedCover, url: cachedCover, coverUrl: cachedCover }
									: null,
								contentCount: { imageCount: 0, videoCount: 0 },
							},
							albumNumber: Number.MAX_SAFE_INTEGER,
							localOnly: true,
						};
					}),
				)
			).filter((entry): entry is SharedAlbumItem => entry !== null);

			setItems([...nextItems, ...cachedOnlyItems]);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: t("shared_albums.error_load_fallback"),
			);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [apiFunctions, userId, filters]);

	useEffect(() => {
		void loadSharedAlbums();
	}, [loadSharedAlbums]);

	const liveItems = useMemo(() => items.filter((item) => !item.localOnly), [items]);
	const cachedItems = useMemo(() => items.filter((item) => item.localOnly), [items]);

	// The counter pill is only worth showing on the larger mobile tile size —
	// at the denser "100px" setting the corner badges already crowd the tile.
	const showAlbumCounter = mobileGridColumns === "2";

	const profileCount = useMemo(
		() => new Set(items.map((item) => item.profileId)).size,
		[items],
	);

	const handleRefresh = () => {
		if (isRefreshing || isLoading) return;
		setIsRefreshing(true);
		return loadSharedAlbums();
	};

	const toggleFilter = (key: keyof typeof filters) => {
		if (isRefreshing || isLoading) return;
		setIsRefreshing(true);
		setFilters((previous) => ({ ...previous, [key]: !previous[key] }));
	};

	const [confirmDeleteItem, setConfirmDeleteItem] = useState<SharedAlbumItem | null>(null);
	const [deletingAlbumId, setDeletingAlbumId] = useState<number | null>(null);

	const handleDeleteAlbum = useCallback(async (item: SharedAlbumItem) => {
		if (deletingAlbumId != null) return;
		setDeletingAlbumId(item.album.albumId);
		try {
			if (!item.localOnly) {
				await apiFunctions.removeAlbumShare({ albumId: item.album.albumId });
			}
			await deleteLocalAlbum(item.album.albumId);
			setItems((previous) => previous.filter((entry) => entry.album.albumId !== item.album.albumId));
			toast.success(t("shared_albums.toast_deleted"));
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error ? deleteError.message : t("shared_albums.error_delete_fallback"),
			);
		} finally {
			setDeletingAlbumId(null);
			setConfirmDeleteItem((previous) => (previous?.album.albumId === item.album.albumId ? null : previous));
		}
	}, [apiFunctions, deletingAlbumId, t]);

	const openViewer = useCallback(
		async (item: SharedAlbumItem) => {
			if (isOpeningAlbum) {
				return;
			}

			setOpenAlbumError(null);
			setIsOpeningAlbum(true);
			try {
				const albumId = item.album.albumId;

				if (item.localOnly) {
					const local = await getLocalAlbum(albumId);
					if (!local || local.content.length === 0) {
						setOpenAlbumError(t("shared_albums.error_open_fallback"));
						return;
					}
					setViewer({
						albumId: local.albumId,
						albumName: local.albumName ?? item.album.albumName ?? null,
						profileId: item.profileId,
						profileName: item.profileName,
						content: local.content,
					});
					setViewerIndex(0);
					if (!viewerHistoryPushedRef.current) {
						window.history.pushState({ sharedAlbumsOverlay: "viewer" }, "");
						viewerHistoryPushedRef.current = true;
					}
					return;
				}

				await apiFunctions.openSharedAlbum({ albumId });

				const details = await apiFunctions.getAlbum(albumId);
				setViewer({
					albumId: details.albumId,
					albumName: details.albumName,
					profileId: item.profileId,
					profileName: item.profileName,
					content: details.content,
				});
				setViewerIndex(0);
				if (!viewerHistoryPushedRef.current) {
					window.history.pushState({ sharedAlbumsOverlay: "viewer" }, "");
					viewerHistoryPushedRef.current = true;
				}

				// Fully cache every content item's bytes, same as albums shared
				// in a chat thread — so the album survives the share expiring.
				void captureAlbum({
					albumId: details.albumId,
					albumName: details.albumName,
					content: details.content,
					ownerProfileId: String(item.profileId),
					conversationId: item.conversationId,
					sharedViaMessageId: null,
					remainingViews: null,
					isViewable: true,
				});
			} catch (openError) {
				setOpenAlbumError(
					openError instanceof Error
						? openError.message
						: t("shared_albums.error_open_fallback"),
				);
			} finally {
				setIsOpeningAlbum(false);
			}
		},
		[apiFunctions, isOpeningAlbum],
	);

	const handleMessageProfile = useCallback(
		(profileId: number) => {
			const nextParams = new URLSearchParams();
			nextParams.set("targetProfileId", String(profileId));
			nextParams.set("returnTo", "/chat/albums");
			navigate(`/chat?${nextParams.toString()}`);
		},
		[navigate],
	);

	const handleViewProfile = useCallback(
		(profileId: number) => {
			navigate(`/profile/${profileId}`, {
				state: { returnTo: "/chat/albums" },
			});
		},
		[navigate],
	);

	const viewerPhotos = useMemo<PhotoViewerMedia[]>(() => {
		if (!viewer) return [];
		return viewer.content.map((item) => ({
			url: item.url || item.thumbUrl || item.coverUrl || "",
			type: item.contentType?.startsWith("video/") ? "video" : "image",
		}));
	}, [viewer]);

	const selectedViewerItem =
		viewer && viewer.content.length > 0
			? viewer.content[Math.min(viewerIndex, viewer.content.length - 1)]
			: null;

	const closeViewerState = useCallback(() => {
		setFullScreenIndex(null);
		setViewer(null);
		setViewerIndex(0);
		fullScreenHistoryPushedRef.current = false;
		viewerHistoryPushedRef.current = false;
	}, []);

	const closeFullScreenState = useCallback(() => {
		setFullScreenIndex(null);
		fullScreenHistoryPushedRef.current = false;
	}, []);

	const closeViewer = useCallback(() => {
		if (fullScreenHistoryPushedRef.current) {
			window.history.back();
			return;
		}

		if (viewerHistoryPushedRef.current) {
			window.history.back();
			return;
		}

		closeViewerState();
	}, [closeViewerState]);

	const openFullScreen = useCallback(
		(index: number) => {
			if (!viewer || index < 0 || index >= viewer.content.length) {
				return;
			}

			setViewerIndex(index);
			setFullScreenIndex(index);
			if (!fullScreenHistoryPushedRef.current) {
				window.history.pushState({ sharedAlbumsOverlay: "full-screen" }, "");
				fullScreenHistoryPushedRef.current = true;
			}
		},
		[viewer],
	);

	const closeFullScreen = useCallback(() => {
		if (fullScreenHistoryPushedRef.current) {
			window.history.back();
			return;
		}

		closeFullScreenState();
	}, [closeFullScreenState]);

	const handleIndexChange = useCallback((index: number) => {
		setFullScreenIndex((prev) => (prev === index ? prev : index));
		setViewerIndex((prev) => (prev === index ? prev : index));
	}, []);

	useEffect(() => {
		const handlePopState = () => {
			if (fullScreenHistoryPushedRef.current) {
				closeFullScreenState();
				return;
			}

			if (viewerHistoryPushedRef.current) {
				closeViewerState();
			}
		};

		window.addEventListener("popstate", handlePopState);
		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	}, [closeFullScreenState, closeViewerState]);

	useEffect(() => {
		if (!viewer) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (fullScreenIndex != null) {
					closeFullScreen();
				} else {
					closeViewer();
				}
				return;
			}
		};

		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", onKeyDown, { capture: true });
		};
	}, [
		closeFullScreen,
		closeViewer,
		fullScreenIndex,
		viewer,
	]);

	return (
		<>
			<PullToRefreshContainer
				className="app-screen flex h-dvh flex-col w-full !px-0 !pb-0 overflow-x-hidden"
				contentClassName="flex flex-1 flex-col min-h-0"
				style={{ overflow: "visible", overflowX: "hidden" }}
				onRefresh={handleRefresh}
				isDisabled={isLoading || isRefreshing}
				isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 0}
				refreshingLabel={t("shared_albums.loading_title")}
				spinnerColor="var(--accent)"
			>
				{/* Header */}
				<header className="relative z-20 shrink-0 pointer-events-none">
					<PageHeaderBackground color="var(--accent)" />
					<div className="pointer-events-auto flex flex-col gap-3 mx-auto w-full max-w-6xl px-[var(--app-px)]">
						<button
							type="button"
							onClick={() => navigate("/chat")}
							className="mt-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
						>
							<ChevronLeft className="h-4 w-4" />
							{t("nav.inbox")}
						</button>

						{/* Row 1: title + count subtitle + refresh */}
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0">
								<h1 className="app-title">{t("shared_albums.title")}</h1>
								<p className="app-subtitle">
									{isLoading
										? t("shared_albums.loading_title")
										: [
											t("shared_albums.albums_count", { count: items.length }),
											t("shared_albums.people_count", { count: profileCount }),
										].join(" · ")}
								</p>
							</div>
							<button
								type="button"
								onClick={handleRefresh}
								disabled={isRefreshing || isLoading}
								className="shrink-0 rounded-xl p-2 text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-50"
								aria-label={t("shared_albums.refresh")}
							>
								<RefreshCw className={`h-5 w-5 ${isRefreshing || isLoading ? "animate-spin" : ""}`} />
							</button>
						</div>

						{/* Row 2: filter pills */}
						<div className="flex flex-wrap items-center gap-2 pb-4">
							<button
								type="button"
								onClick={() => toggleFilter("isFavorite")}
								disabled={isRefreshing || isLoading}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50",
									filters.isFavorite
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!filters.isFavorite ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								<Star className={`h-3.5 w-3.5 ${filters.isFavorite ? "fill-current" : ""}`} />
								{t("shared_albums.filter_favorites")}
							</button>
							<button
								type="button"
								onClick={() => toggleFilter("isOnline")}
								disabled={isRefreshing || isLoading}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50",
									filters.isOnline
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!filters.isOnline ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								<Wifi className="h-3.5 w-3.5" />
								{t("shared_albums.filter_online")}
							</button>
							<button
								type="button"
								onClick={() => toggleFilter("onlyVideo")}
								disabled={isRefreshing || isLoading}
								className={cn(
									"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95 disabled:opacity-50",
									filters.onlyVideo
										? "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
										: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
								)}
								style={!filters.onlyVideo ? { "--pill-color": "var(--accent)" } as CSSProperties : undefined}
							>
								<Film className="h-3.5 w-3.5" />
								{t("shared_albums.filter_video")}
							</button>
						</div>
					</div>
				</header>

				<FeedScrollContainer ref={feedContainerRef}>
					<div className="mx-auto w-full max-w-6xl px-[var(--app-px)] pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
						{openAlbumError ? (
							<ErrorState
								title={t("shared_albums.error_open_title")}
								description={openAlbumError}
								onRetry={() => setOpenAlbumError(null)}
							/>
						) : null}

						{isLoading ? (
							<div
								className="grid gap-4"
								style={{
									gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))`,
								}}
							>
								{Array.from({ length: 12 }).map((_, i) => (
									<div key={i} className="surface-card overflow-hidden rounded-2xl">
										<div className="relative aspect-[4/6] w-full animate-pulse bg-[var(--surface-2)]">
											<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3">
												<div className="h-20 w-20 rounded-full bg-[var(--border)]" />
												<div className="h-3 w-24 rounded-full bg-[var(--border)]" />
											</div>
										</div>
									</div>
								))}
							</div>
						) : error ? (
							<ErrorState
								title={t("shared_albums.error_load_title")}
								description={error}
								onRetry={() => { setIsLoading(true); void loadSharedAlbums(); }}
							/>
						) : items.length === 0 ? (
							<EmptyState
								title={t("shared_albums.empty_title")}
								description={t("shared_albums.empty_desc")}
							/>
						) : (
							<>
								{liveItems.length > 0 ? (
									<div
										className="grid gap-4"
										style={{
											gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))`,
										}}
									>
										{liveItems.map((item) => (
											<AlbumCard
												key={`${item.profileId}:${item.album.albumId}`}
												item={item}
												onClick={() => void openViewer(item)}
												onDelete={() => setConfirmDeleteItem(item)}
												isDeleting={deletingAlbumId === item.album.albumId}
												showAlbumCounter={showAlbumCounter}
												t={t}
											/>
										))}
									</div>
								) : null}

								{cachedItems.length > 0 ? (
									<div className={liveItems.length > 0 ? "mt-6" : undefined}>
										<div className="mb-3 flex items-center gap-2 px-1">
											<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
												{t("shared_albums.cached_section_title")}
											</p>
											<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
												{cachedItems.length}
											</span>
										</div>
										<div
											className="grid gap-4"
											style={{
												gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))`,
											}}
										>
											{cachedItems.map((item) => (
												<AlbumCard
													key={`${item.profileId}:${item.album.albumId}`}
													item={item}
													onClick={() => void openViewer(item)}
													onDelete={() => setConfirmDeleteItem(item)}
													isDeleting={deletingAlbumId === item.album.albumId}
													showAlbumCounter={showAlbumCounter}
													t={t}
												/>
											))}
										</div>
									</div>
								) : null}
							</>
						)}
					</div>
				</FeedScrollContainer>
			</PullToRefreshContainer>

			{/*
			 * Rendered as siblings of PullToRefreshContainer, not children — its
			 * Content Layer always has an active `transform` (even translateY(0)),
			 * which makes it the containing block for `position: fixed`
			 * descendants. Nesting these overlays inside it would clip them to
			 * app-screen's padding (a gap at the top) and trap them under the
			 * bottom NavBar's stacking context instead of covering it.
			 */}
			{isOpeningAlbum ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
					<div className="surface-card p-4 text-sm text-[var(--text-muted)]">
						{t("shared_albums.opening")}
					</div>
				</div>
			) : null}

			{viewer ? (
				<AlbumViewerPanel
					viewer={viewer}
					viewerIndex={viewerIndex}
					fullScreenIndex={fullScreenIndex}
					selectedViewerItem={selectedViewerItem}
					closeViewer={closeViewer}
					openFullScreen={openFullScreen}
					onMessageProfile={handleMessageProfile}
					onViewProfile={handleViewProfile}
				/>
			) : null}

			{viewer !== null && fullScreenIndex !== null && (
				<PhotoViewer
					isOpen={true}
					onClose={closeFullScreen}
					photos={viewerPhotos}
					initialIndex={fullScreenIndex}
					onIndexChange={handleIndexChange}
				/>
			)}

			<ConfirmDialog
				isOpen={confirmDeleteItem !== null}
				title={t("shared_albums.confirm_delete_title")}
				message={t("shared_albums.confirm_delete_message")}
				confirmLabel={deletingAlbumId != null ? t("shared_albums.deleting") : t("shared_albums.delete")}
				cancelLabel={t("shared_albums.cancel")}
				onConfirm={() => confirmDeleteItem ? void handleDeleteAlbum(confirmDeleteItem) : undefined}
				onCancel={() => setConfirmDeleteItem(null)}
				isProcessing={deletingAlbumId != null}
				confirmTone="danger"
			/>
		</>
	);
}
