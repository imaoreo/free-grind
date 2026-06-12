import { Album, ChevronLeft, RefreshCw, Users } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { FeedScrollContainer } from "../../components/ui/FeedScrollContainer";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { useAuth } from "../../contexts/useAuth";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { ProfileImage } from "../../components/ui/profile-image";
import type { ConversationEntry } from "../../types/chat";
import type { AlbumViewer, SharedAlbumItem } from "../../types/shared-albums";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { AlbumViewerPanel } from "./shared-albums/AlbumViewerPanel";
import { PhotoViewer, type PhotoViewerMedia } from "../../components/PhotoViewer";

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

			const feed = await apiFunctions.getSharedAlbums({});
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
				};
			});

			nextItems.sort((a, b) => {
				return a.albumNumber - b.albumNumber;
			});

			setItems(nextItems);
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
	}, [apiFunctions, userId]);

	useEffect(() => {
		void loadSharedAlbums();
	}, [loadSharedAlbums]);

	const profileCount = useMemo(
		() => new Set(items.map((item) => item.profileId)).size,
		[items],
	);

	const handleRefresh = () => {
		if (isRefreshing || isLoading) return;
		setIsRefreshing(true);
		return loadSharedAlbums();
	};

	const openViewer = useCallback(
		async (item: SharedAlbumItem) => {
			if (isOpeningAlbum) {
				return;
			}

			setOpenAlbumError(null);
			setIsOpeningAlbum(true);
			try {
				const albumId = item.album.albumId;
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
			<header className="relative z-20 shrink-0 flex flex-col pointer-events-none">
				<PageHeaderBackground color="var(--accent)" />
				<div className="pointer-events-auto flex flex-col mx-auto w-full max-w-6xl px-[var(--app-px)]">
					<button
						type="button"
						onClick={() => navigate("/chat")}
						className="mb-3 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
					>
						<ChevronLeft className="h-4 w-4" />
						{t("nav.inbox")}
					</button>
					<h1 className="app-title">{t("shared_albums.title")}</h1>

					<div className="mt-3 flex flex-wrap items-center gap-2 pb-4">
						<div
							className="glass-pill inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold text-[var(--accent)]"
							style={{ "--pill-color": "var(--accent)" } as CSSProperties}
						>
							<Album className="h-3.5 w-3.5" />
							{isLoading
								? <span className="h-3 w-5 animate-pulse rounded-full bg-[var(--accent)]/30" />
								: items.length}
						</div>
						<div
							className="glass-pill inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold text-[var(--accent)]"
							style={{ "--pill-color": "var(--accent)" } as CSSProperties}
						>
							<Users className="h-3.5 w-3.5" />
							{isLoading
								? <span className="h-3 w-4 animate-pulse rounded-full bg-[var(--accent)]/30" />
								: profileCount}
						</div>
						<button
							type="button"
							onClick={handleRefresh}
							disabled={isRefreshing || isLoading}
							className="glass-pill inline-flex h-9 shrink-0 items-center justify-center px-4 text-[var(--accent)] transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20 disabled:opacity-50"
							style={{ "--pill-color": "var(--accent)" } as CSSProperties}
							aria-label={t("shared_albums.refresh")}
						>
							<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
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
							className="grid gap-1"
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
						<div
							className="grid gap-1"
							style={{
								gridTemplateColumns: `repeat(auto-fill, minmax(clamp(${minmaxValue}, 15vw, 250px), 1fr))`,
							}}
						>
							{items.map((item) => {
								const previewUrl =
									item.album.content?.thumbUrl ||
									item.album.content?.url ||
									item.album.content?.coverUrl ||
									null;
								const avatarUrl = item.profileMediaHash
									? getThumbImageUrl(item.profileMediaHash, "320x320")
									: null;

								return (
									<button
										key={`${item.profileId}:${item.album.albumId}`}
										type="button"
										onClick={() => void openViewer(item)}
										className="surface-card relative overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
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
											<div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-3 text-center text-white">
												<div className="h-20 w-20 overflow-hidden rounded-full border-white/25 bg-white/15 text-white shadow-lg backdrop-blur-sm">
													<ProfileImage src={avatarUrl} alt={item.profileName} />
												</div>
												<p className="truncate text-base font-semibold leading-tight text-white drop-shadow">
													{item.profileName}
												</p>
											</div>
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>
			</FeedScrollContainer>

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
		</PullToRefreshContainer>
	);
}
