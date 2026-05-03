import {
	Album,
	RefreshCw,
	Users,
} from "lucide-react";
import {
	type TouchEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Avatar } from "../../components/ui/avatar";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/states";
import { useAuth } from "../../contexts/useAuth";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import blankProfileImage from "../../images/blank-profile.png";
import type { ConversationEntry } from "../../types/chat";
import type { AlbumViewer, SharedAlbumItem } from "../../types/shared-albums";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { InboxAlbumsTabs } from "./components/InboxAlbumsTabs";
import { AlbumViewerPanel } from "./shared-albums/AlbumViewerPanel";
import { AlbumFullscreenOverlay } from "./shared-albums/AlbumFullscreenOverlay";

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
	const viewerTouchStartX = useRef<number | null>(null);
	const pageTouchStartXRef = useRef<number | null>(null);
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
		if (isRefreshing || isLoading) {
			return;
		}
		setIsRefreshing(true);
		void loadSharedAlbums();
	};

	const handlePageTouchStart = useCallback(
		(event: TouchEvent<HTMLElement>) => {
			if (viewer || fullScreenIndex != null) {
				pageTouchStartXRef.current = null;
				return;
			}
			pageTouchStartXRef.current = event.touches[0]?.clientX ?? null;
		},
		[fullScreenIndex, viewer],
	);

	const handlePageTouchEnd = useCallback(
		(event: TouchEvent<HTMLElement>) => {
			if (viewer || fullScreenIndex != null) {
				pageTouchStartXRef.current = null;
				return;
			}

			const startX = pageTouchStartXRef.current;
			if (startX == null) {
				return;
			}

			const endX = event.changedTouches[0]?.clientX ?? startX;
			const deltaX = startX - endX;

			if (deltaX < -70) {
				navigate("/chat");
			}

			pageTouchStartXRef.current = null;
		},
		[fullScreenIndex, navigate, viewer],
	);

	const openViewer = useCallback(
		async (albumId: number) => {
			if (isOpeningAlbum) {
				return;
			}

			setOpenAlbumError(null);
			setIsOpeningAlbum(true);
			try {
				await apiFunctions.openSharedAlbum({ albumId });

				const details = await apiFunctions.getAlbum(albumId);
				setViewer({
					albumId: details.albumId,
					albumName: details.albumName,
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

	const showPreviousFullScreenItem = useCallback(() => {
		setFullScreenIndex((index) => {
			if (index == null) {
				return index;
			}
			const next = Math.max(0, index - 1);
			setViewerIndex(next);
			return next;
		});
	}, []);

	const showNextFullScreenItem = useCallback(() => {
		setFullScreenIndex((index) => {
			if (index == null || !viewer) {
				return index;
			}
			const next = Math.min(viewer.content.length - 1, index + 1);
			setViewerIndex(next);
			return next;
		});
	}, [viewer]);

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

	const canViewPrevious = fullScreenIndex != null && fullScreenIndex > 0;
	const canViewNext =
		fullScreenIndex != null && viewer
			? fullScreenIndex < viewer.content.length - 1
			: false;

	const fullScreenItem =
		viewer && fullScreenIndex != null && fullScreenIndex >= 0
			? viewer.content[Math.min(fullScreenIndex, viewer.content.length - 1)]
			: null;

	const onViewerTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
		viewerTouchStartX.current = event.changedTouches[0]?.clientX ?? null;
	};

	const onViewerTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
		const startX = viewerTouchStartX.current;
		if (startX == null) {
			return;
		}

		const endX = event.changedTouches[0]?.clientX ?? startX;
		const deltaX = endX - startX;
		viewerTouchStartX.current = null;

		if (Math.abs(deltaX) < 48) {
			return;
		}

		if (deltaX > 0) {
			showPreviousFullScreenItem();
		} else {
			showNextFullScreenItem();
		}
	};

	useEffect(() => {
		if (!viewer) {
			return;
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				if (fullScreenIndex != null) {
					closeFullScreen();
				} else {
					closeViewer();
				}
				return;
			}

			if (fullScreenIndex == null) {
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				showPreviousFullScreenItem();
				return;
			}

			if (event.key === "ArrowRight") {
				event.preventDefault();
				showNextFullScreenItem();
				return;
			}

			if (event.key === "Home") {
				event.preventDefault();
				setFullScreenIndex(0);
				setViewerIndex(0);
				return;
			}

			if (event.key === "End") {
				event.preventDefault();
				const next = Math.max(0, viewer.content.length - 1);
				setFullScreenIndex(next);
				setViewerIndex(next);
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [
		closeFullScreen,
		fullScreenIndex,
		showNextFullScreenItem,
		showPreviousFullScreenItem,
		viewer,
	]);

	return (
		<section
			className="app-screen"
			onTouchStart={handlePageTouchStart}
			onTouchEnd={handlePageTouchEnd}
		>
			<div className="mx-auto grid w-full max-w-6xl gap-5">
				<header className="mb-3">
					<div>
						<InboxAlbumsTabs
							activeTab="albums"
							onInboxClick={() => navigate("/chat")}
							onAlbumsClick={() => navigate("/settings/shared-albums")}
						/>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
								<span
									className="h-2 w-2 rounded-full bg-zinc-400"
									aria-hidden="true"
								/>
								<Album className="h-3.5 w-3.5" />
								<span>{t("shared_albums.albums_count", { count: items.length })}</span>
							</div>
							<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
								<span
									className="h-2 w-2 rounded-full bg-emerald-500"
									aria-hidden="true"
								/>
								<Users className="h-3.5 w-3.5" />
								<span>{t("shared_albums.people_count", { count: profileCount })}</span>
							</div>
							<button
								type="button"
								onClick={handleRefresh}
								disabled={isRefreshing || isLoading}
								className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-60"
								aria-label={t("shared_albums.refresh")}
								title={t("shared_albums.refresh")}
							>
								<RefreshCw
									className={
										isRefreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"
									}
								/>
							</button>
						</div>
						<p className="app-subtitle mt-1 max-w-[68ch]">
							{t("shared_albums.subtitle")}
						</p>
					</div>
				</header>

				{openAlbumError ? (
					<ErrorState
						title={t("shared_albums.error_open_title")}
						description={openAlbumError}
						onRetry={() => setOpenAlbumError(null)}
					/>
				) : null}

				{isLoading ? (
					<LoadingState
						title={t("shared_albums.loading_title")}
						description={t("shared_albums.loading_desc")}
					/>
				) : null}

				{!isLoading && error ? (
					<ErrorState
						title={t("shared_albums.error_load_title")}
						description={error}
						onRetry={() => {
							setIsLoading(true);
							void loadSharedAlbums();
						}}
					/>
				) : null}

				{!isLoading && !error && items.length === 0 ? (
					<EmptyState
						title={t("shared_albums.empty_title")}
						description={t("shared_albums.empty_desc")}
					/>
				) : null}

				{!isLoading && !error && items.length > 0 ? (
					<div
						className="w-full grid gap-1"
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
								: blankProfileImage;

							return (
								<button
									key={`${item.profileId}:${item.album.albumId}`}
									type="button"
									onClick={() => void openViewer(item.album.albumId)}
									className="surface-card relative overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
								>
									<div className="relative aspect-[4/6] w-full bg-[var(--surface-2)]">
										{previewUrl ? (
											<>
												<img
													src={previewUrl}
													alt={
														item.album.albumName ?? t("shared_albums.preview_alt")
													}
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
											<Avatar
												src={avatarUrl}
												alt={item.profileName}
												fallback={item.profileName}
												className="h-20 w-20 border-white/25 bg-white/15 text-white shadow-lg backdrop-blur-sm"
											/>
											<div className="max-w-full">
												<p className="truncate text-base font-semibold leading-tight text-white drop-shadow">
													{item.profileName}
												</p>
											</div>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				) : null}
			</div>

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
				/>
			) : null}

			{viewer && fullScreenItem ? (
				<AlbumFullscreenOverlay
					viewer={viewer}
					fullScreenIndex={fullScreenIndex}
					fullScreenItem={fullScreenItem}
					canViewPrevious={canViewPrevious}
					canViewNext={canViewNext}
					closeFullScreen={closeFullScreen}
					showPreviousFullScreenItem={showPreviousFullScreenItem}
					showNextFullScreenItem={showNextFullScreenItem}
					onViewerTouchStart={onViewerTouchStart}
					onViewerTouchEnd={onViewerTouchEnd}
				/>
			) : null}
		</section>
	);
}
