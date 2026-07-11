import { Album, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../contexts/useAuth";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { ProfileImage } from "../../../components/ui/profile-image";
import { EmptyState, ErrorState, LoadingState } from "../../../components/ui/states";
import type { ConversationEntry } from "../../../types/chat";
import { albumViewerFolderKey, type AlbumViewer, type SharedAlbumItem } from "../../../types/shared-albums";
import { getThumbImageUrl, validateMediaHash } from "../../../utils/media";
import { useAvatarCache } from "../../../hooks/useAvatarCache";
import { resolveAvatarSrc } from "../../../services/avatarStore";
import { AlbumViewerPanel } from "../shared-albums/AlbumViewerPanel";
import { PhotoViewer, type PhotoViewerMedia } from "../../../components/PhotoViewer";
import { getAllAlbums, getConversation } from "../../../services/chatDb";
import { cacheAlbumFromSharedPage, captureAlbum, getCachedAlbumCoverUri, getLocalAlbum } from "../../../services/albumStore";
import { toDataUri } from "../../../services/mediaStore";

function getCounterparty(
	entry: ConversationEntry,
	userId: number | null,
): { profileId: number; mediaHash: string | null } | null {
	const participants = entry.data.participants ?? [];
	if (!participants.length) return null;
	const other =
		userId == null
			? participants[0]
			: (participants.find((p) => p.profileId !== userId) ?? participants[0]);
	if (!other) return null;
	return { profileId: other.profileId, mediaHash: other.primaryMediaHash ?? null };
}

type Props = {
	isDesktop: boolean;
};

export function SharedAlbumsPanel({ isDesktop }: Props) {
	const { t } = useTranslation();
	useAvatarCache();
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

	const viewerHistoryPushedRef = useRef(false);
	const fullScreenHistoryPushedRef = useRef(false);

	const minmaxValue = mobileGridColumns === "2" ? "130px" : "100px";

	const loadSharedAlbums = useCallback(async () => {
		setError(null);

		// Show cached albums immediately while the API loads
		const cachedStoredAlbums = await getAllAlbums().catch(() => []);
		if (cachedStoredAlbums.length > 0) {
			const cachedItems = await Promise.all(
				cachedStoredAlbums.map(async (stored): Promise<SharedAlbumItem | null> => {
					const profileId = stored.ownerProfileId ? Number(stored.ownerProfileId) : null;
					if (profileId == null) return null;
					let profileName = t("shared_albums.name_fallback");
					let profileMediaHash: string | null = null;
					if (stored.conversationId) {
						const conv = await getConversation(stored.conversationId).catch(() => null);
						if (conv) {
							profileName = conv.entry.data.name?.trim() || profileName;
							const cp = getCounterparty(conv.entry, userId);
							if (cp?.mediaHash && validateMediaHash(cp.mediaHash)) {
								profileMediaHash = cp.mediaHash;
							}
						}
					}
					const cachedCover = getCachedAlbumCoverUri(Number(stored.albumId)) ??
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
							content: cachedCover ? { thumbUrl: cachedCover, url: cachedCover, coverUrl: cachedCover } : null,
							contentCount: { imageCount: 0, videoCount: 0 },
						},
						albumNumber: Number.MAX_SAFE_INTEGER,
						localOnly: true,
					};
				}),
			);
			const validCached = cachedItems.filter((x): x is SharedAlbumItem => x !== null);
			if (validCached.length > 0) {
				setItems(validCached);
			}
		}

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
					const cp = getCounterparty(entry, userId);
					if (!cp) continue;
					profileMap.set(cp.profileId, {
						profileName: entry.data.name?.trim() || t("shared_albums.name_fallback"),
						conversationId: entry.data.conversationId ?? null,
						profileMediaHash: cp.mediaHash,
					});
				}
				nextPage = inbox.nextPage ?? null;
				if (!nextPage) break;
				page = nextPage;
			}

			const feed = await apiFunctions.getSharedAlbums({});
			const liveAlbumIds = new Set(feed.sharedAlbums.map((sa) => sa.albumId));

			const nextItems: SharedAlbumItem[] = feed.sharedAlbums.map((sa) => {
				const meta = profileMap.get(sa.ownerProfileId);
				const conversationId = meta?.conversationId ?? null;
				// Fire-and-forget: cache cover into chatDb for offline access
				void cacheAlbumFromSharedPage({
					albumId: sa.albumId,
					albumName: sa.name,
					ownerProfileId: sa.ownerProfileId,
					conversationId,
					coverUrl: sa.coverContent.location,
				});
				return {
					profileId: sa.ownerProfileId,
					profileName: meta?.profileName || sa.profile.name?.trim() || t("shared_albums.name_fallback"),
					profileMediaHash:
						meta?.profileMediaHash && validateMediaHash(meta.profileMediaHash)
							? meta.profileMediaHash
							: null,
					conversationId,
					album: {
						albumId: sa.albumId,
						albumName: sa.name,
						content: {
							thumbUrl: sa.coverContent.location,
							url: sa.coverContent.location,
							coverUrl: sa.coverContent.location,
						},
						contentCount: { imageCount: sa.imageCount, videoCount: sa.videoCount },
					},
					albumNumber: sa.albumNumber,
				};
			});
			nextItems.sort((a, b) => a.albumNumber - b.albumNumber);

			// Append cached-only albums (no longer in live feed) at the end
			const cachedOnlyItems = (await getAllAlbums().catch(() => [])).filter(
				(s) => !liveAlbumIds.has(Number(s.albumId)),
			);
			const extraItems = await Promise.all(
				cachedOnlyItems.map(async (stored): Promise<SharedAlbumItem | null> => {
					const profileId = stored.ownerProfileId ? Number(stored.ownerProfileId) : null;
					if (profileId == null) return null;
					let profileName = t("shared_albums.name_fallback");
					let profileMediaHash: string | null = null;
					if (stored.conversationId) {
						const conv = await getConversation(stored.conversationId).catch(() => null);
						if (conv) {
							profileName = conv.entry.data.name?.trim() || profileName;
							const cp = getCounterparty(conv.entry, userId);
							if (cp?.mediaHash && validateMediaHash(cp.mediaHash)) {
								profileMediaHash = cp.mediaHash;
							}
						}
					}
					const cachedCover = getCachedAlbumCoverUri(Number(stored.albumId)) ??
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
							content: cachedCover ? { thumbUrl: cachedCover, url: cachedCover, coverUrl: cachedCover } : null,
							contentCount: { imageCount: 0, videoCount: 0 },
						},
						albumNumber: Number.MAX_SAFE_INTEGER,
						localOnly: true,
					};
				}),
			);

			const cachedOnlyValidItems = extraItems.filter((x): x is SharedAlbumItem => x !== null);

			// Batch-fetch full profile details for every distinct album owner in
			// this load — the shared-albums feed itself never returns a media
			// hash, and the conversation-derived fallback above only covers
			// profiles you have a conversation with among the first 6 inbox
			// pages. Same cascade endpoint the blocked-profiles page uses to get
			// real display names/avatars for profiles the single-profile
			// endpoint won't serve.
			const allOwnerIds = new Set<number>();
			for (const item of nextItems) allOwnerIds.add(item.profileId);
			for (const item of cachedOnlyValidItems) allOwnerIds.add(item.profileId);

			if (allOwnerIds.size > 0) {
				const ids = [...allOwnerIds];
				const CHUNK_SIZE = 50;
				const chunks: number[][] = [];
				for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
					chunks.push(ids.slice(i, i + CHUNK_SIZE));
				}

				const detailsById = new Map<
					number,
					{ displayName: string | null; profileMediaHash: string | null }
				>();
				await Promise.all(
					chunks.map(async (chunk) => {
						try {
							const raw = await apiFunctions.getProfilesByIds(chunk);
							const profiles =
								raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
									? (raw as { profiles: unknown[] }).profiles
									: [];
							for (const p of profiles) {
								if (!p || typeof p !== "object") continue;
								const idRaw = (p as { profileId?: unknown }).profileId;
								if (idRaw == null) continue;
								const nameRaw = (p as { displayName?: unknown }).displayName;
								const hashRaw = (p as { profileImageMediaHash?: unknown }).profileImageMediaHash;
								detailsById.set(Number(idRaw), {
									displayName:
										typeof nameRaw === "string" && nameRaw.trim().length > 0
											? nameRaw.trim()
											: null,
									profileMediaHash:
										typeof hashRaw === "string" && validateMediaHash(hashRaw) ? hashRaw : null,
								});
							}
						} catch {
							// Chunk failed — those profiles keep whatever they already had.
						}
					}),
				);

				const nameFallback = t("shared_albums.name_fallback");
				const applyDetails = (item: SharedAlbumItem): SharedAlbumItem => {
					const details = detailsById.get(item.profileId);
					if (!details) return item;
					return {
						...item,
						profileName:
							item.profileName === nameFallback
								? details.displayName ?? item.profileName
								: item.profileName,
						profileMediaHash: item.profileMediaHash ?? details.profileMediaHash,
					};
				};
				for (let i = 0; i < nextItems.length; i++) nextItems[i] = applyDetails(nextItems[i]);
				for (let i = 0; i < cachedOnlyValidItems.length; i++) cachedOnlyValidItems[i] = applyDetails(cachedOnlyValidItems[i]);
			}

			setItems([...nextItems, ...cachedOnlyValidItems]);
		} catch (e) {
			setError(e instanceof Error ? e.message : t("shared_albums.error_load_fallback"));
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [apiFunctions, userId]);

	useEffect(() => { void loadSharedAlbums(); }, [loadSharedAlbums]);

	const handleRefresh = () => {
		if (isRefreshing || isLoading) return;
		setIsRefreshing(true);
		void loadSharedAlbums();
	};

	const openViewer = useCallback(
		async (item: SharedAlbumItem) => {
			if (isOpeningAlbum) return;
			setOpenAlbumError(null);
			setIsOpeningAlbum(true);
			try {
				if (item.localOnly) {
					const local = await getLocalAlbum(item.album.albumId);
					if (!local || local.content.length === 0) {
						setOpenAlbumError(t("shared_albums.error_open_fallback"));
						return;
					}
					setViewer({
						albumId: local.albumId,
						albumName: local.albumName ?? item.album.albumName ?? null,
						profileId: item.profileId,
						profileName: item.profileName,
						conversationId: item.conversationId,
						content: local.content,
					});
				} else {
					await apiFunctions.openSharedAlbum({ albumId: item.album.albumId });
					const details = await apiFunctions.getAlbum(item.album.albumId);
					setViewer({
						albumId: details.albumId,
						albumName: details.albumName,
						profileId: item.profileId,
						profileName: item.profileName,
						conversationId: item.conversationId,
						content: details.content,
					});

					// Fully cache every content item's bytes, same as albums
					// shared in a chat thread — so it survives the share expiring.
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
				}
				setViewerIndex(0);
				if (!viewerHistoryPushedRef.current) {
					window.history.pushState({ sharedAlbumsOverlay: "viewer" }, "");
					viewerHistoryPushedRef.current = true;
				}
			} catch (e) {
				setOpenAlbumError(e instanceof Error ? e.message : t("shared_albums.error_open_fallback"));
			} finally {
				setIsOpeningAlbum(false);
			}
		},
		[apiFunctions, isOpeningAlbum, t],
	);

	const handleMessageProfile = useCallback(
		(profileId: number) => {
			const params = new URLSearchParams();
			params.set("targetProfileId", String(profileId));
			navigate(`/chat?${params.toString()}`);
		},
		[navigate],
	);

	const handleViewProfile = useCallback(
		(profileId: number) => { navigate(`/profile/${profileId}`); },
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
		if (fullScreenHistoryPushedRef.current) { window.history.back(); return; }
		if (viewerHistoryPushedRef.current) { window.history.back(); return; }
		closeViewerState();
	}, [closeViewerState]);

	const openFullScreen = useCallback(
		(index: number) => {
			if (!viewer || index < 0 || index >= viewer.content.length) return;
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
		if (fullScreenHistoryPushedRef.current) { window.history.back(); return; }
		closeFullScreenState();
	}, [closeFullScreenState]);

	const handleIndexChange = useCallback((index: number) => {
		setFullScreenIndex((prev) => (prev === index ? prev : index));
		setViewerIndex((prev) => (prev === index ? prev : index));
	}, []);

	useEffect(() => {
		const handlePopState = () => {
			if (fullScreenHistoryPushedRef.current) { closeFullScreenState(); return; }
			if (viewerHistoryPushedRef.current) { closeViewerState(); }
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [closeFullScreenState, closeViewerState]);

	useEffect(() => {
		if (!viewer) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				if (fullScreenIndex != null) closeFullScreen();
				else closeViewer();
			}
		};
		window.addEventListener("keydown", onKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
	}, [closeFullScreen, closeViewer, fullScreenIndex, viewer]);

	const px = isDesktop ? "px-4" : "px-[var(--app-px)]";

	return (
		<div
			className="flex min-h-0 flex-1 flex-col overflow-y-auto"
			data-lenis-prevent
		>
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between px-4 pb-3">
				<div className="flex items-center gap-2">
					<p className="text-sm font-semibold text-[var(--text)]">
						{t("shared_albums.title")}
					</p>
					{!isLoading && (
						<span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text-muted)]">
							{items.length}
						</span>
					)}
				</div>
				<button
					type="button"
					onClick={handleRefresh}
					disabled={isRefreshing || isLoading}
					className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
				>
					<RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
				</button>
			</div>

			{/* Content */}
			<div className={`${px} py-4`}>
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
							const avatarUrl = resolveAvatarSrc(
								item.profileMediaHash,
								item.profileMediaHash
									? getThumbImageUrl(item.profileMediaHash, "320x320")
									: null,
							);

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
										{item.localOnly && (
											<div className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[9px] font-semibold text-white/80 backdrop-blur-sm">
												{t("shared_albums.cached_label", { defaultValue: "cached" })}
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
					conversationId={albumViewerFolderKey(viewer)}
				/>
			)}
		</div>
	);
}
