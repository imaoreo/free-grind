import { ArrowLeft, Eye, Images, MessageSquare, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/states";
import { useAuth } from "../../contexts/AuthContext";
import { useApi } from "../../hooks/useApi";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { createChatService } from "../../services/chatService";
import type { ConversationEntry } from "../../types/chat";
import type { AlbumViewer, SharedAlbumItem } from "../../types/shared-albums";

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
	const navigate = useNavigate();
	const { userId } = useAuth();
	const { fetchRest } = useApi();
	const apiFunctions = useApiFunctions();
	const service = useMemo(() => createChatService(fetchRest), [fetchRest]);

	const [isLoading, setIsLoading] = useState(true);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [items, setItems] = useState<SharedAlbumItem[]>([]);
	const [isOpeningAlbum, setIsOpeningAlbum] = useState(false);
	const [openAlbumError, setOpenAlbumError] = useState<string | null>(null);
	const [viewer, setViewer] = useState<AlbumViewer | null>(null);

	const loadSharedAlbums = useCallback(async () => {
		setError(null);

		try {
			const profileMap = new Map<
				number,
				{ profileName: string; conversationId: string | null }
			>();
			let page = 1;
			let nextPage: number | null = 1;

			while (nextPage != null && page <= 6) {
				const inbox = await service.listConversations({ page });

				for (const entry of inbox.entries) {
					const counterparty = getCounterparty(entry, userId);
					if (!counterparty) {
						continue;
					}

					profileMap.set(counterparty.profileId, {
						profileName:
							entry.data.name?.trim() || `Profile ${counterparty.profileId}`,
						conversationId: entry.data.conversationId ?? null,
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
				};
			});

			nextItems.sort((a, b) => {
				const profileCompare = a.profileName.localeCompare(b.profileName);
				if (profileCompare !== 0) {
					return profileCompare;
				}
				return (a.album.albumName ?? "").localeCompare(b.album.albumName ?? "");
			});

			setItems(nextItems);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: "Failed to load shared albums",
			);
		} finally {
			setIsLoading(false);
			setIsRefreshing(false);
		}
	}, [apiFunctions, service, userId]);

	useEffect(() => {
		void loadSharedAlbums();
	}, [loadSharedAlbums]);

	const profileCount = useMemo(() => {
		return new Set(items.map((item) => item.profileId)).size;
	}, [items]);

	const handleRefresh = () => {
		if (isRefreshing || isLoading) {
			return;
		}
		setIsRefreshing(true);
		void loadSharedAlbums();
	};

	const openViewer = useCallback(
		async (albumId: number) => {
			if (isOpeningAlbum) {
				return;
			}

			setOpenAlbumError(null);
			setIsOpeningAlbum(true);
			try {
				await apiFunctions.openSharedAlbum({ albumId });

				const details = await service.getAlbum(albumId);
				setViewer({
					albumId: details.albumId,
					albumName: details.albumName,
					content: details.content,
				});
			} catch (openError) {
				setOpenAlbumError(
					openError instanceof Error
						? openError.message
						: "Failed to open shared album",
				);
			} finally {
				setIsOpeningAlbum(false);
			}
		},
		[apiFunctions, isOpeningAlbum, service],
	);

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-6xl gap-5">
				<header className="grid gap-4 sm:flex sm:items-end sm:justify-between">
					<div className="grid gap-2">
						<Button type="button" onClick={() => navigate("/settings")} className="w-fit">
							<ArrowLeft className="h-4 w-4" />
							Back to Settings
						</Button>
						<h1 className="app-title">Albums Shared With You</h1>
						<p className="app-subtitle max-w-[68ch]">
							Browse all albums shared by people in your chats.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button type="button" onClick={handleRefresh} disabled={isRefreshing || isLoading}>
							<RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
							Refresh
						</Button>
					</div>
				</header>

				<Card className="p-5 sm:p-6">
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
								Total shared albums
							</p>
							<p className="mt-2 text-2xl font-semibold">{items.length}</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
								Profiles sharing albums
							</p>
							<p className="mt-2 text-2xl font-semibold">{profileCount}</p>
						</div>
					</div>
				</Card>

				{openAlbumError ? (
					<ErrorState
						title="Could not open album"
						description={openAlbumError}
						onRetry={() => setOpenAlbumError(null)}
					/>
				) : null}

				{isLoading ? (
					<LoadingState
						title="Loading shared albums"
						description="Collecting album shares from your conversations."
					/>
				) : null}

				{!isLoading && error ? (
					<ErrorState
						title="Could not load shared albums"
						description={error}
						onRetry={() => {
							setIsLoading(true);
							void loadSharedAlbums();
						}}
					/>
				) : null}

				{!isLoading && !error && items.length === 0 ? (
					<EmptyState
						title="No shared albums yet"
						description="When someone shares an album with you, it will appear here."
					/>
				) : null}

				{!isLoading && !error && items.length > 0 ? (
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{items.map((item) => {
							const previewUrl =
								item.album.content?.thumbUrl ||
								item.album.content?.url ||
								item.album.content?.coverUrl ||
								null;
							const imageCount = item.album.contentCount.imageCount;
							const videoCount = item.album.contentCount.videoCount;

							return (
								<Card key={`${item.profileId}:${item.album.albumId}`} className="overflow-hidden p-0">
									<div className="relative aspect-[16/9] w-full bg-[var(--surface-2)]">
										{previewUrl ? (
											<img
												src={previewUrl}
												alt={item.album.albumName ?? "Shared album preview"}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
												<Images className="h-8 w-8" />
											</div>
										)}
									</div>

									<div className="grid gap-3 p-4">
										<div>
											<p className="text-base font-semibold">
												{item.album.albumName?.trim() || "Untitled album"}
											</p>
											<p className="mt-1 text-sm text-[var(--text-muted)]">
												Shared by {item.profileName}
											</p>
										</div>

										<p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
											{imageCount} image{imageCount === 1 ? "" : "s"} · {videoCount} video
											{videoCount === 1 ? "" : "s"}
										</p>

										<div className="grid gap-2 sm:grid-cols-2">
											<Button
												type="button"
												onClick={() => void openViewer(item.album.albumId)}
												disabled={isOpeningAlbum}
												className="w-full"
											>
												<Eye className="h-4 w-4" />
												View Album
											</Button>
											{item.conversationId ? (
												<Button
													type="button"
													onClick={() => navigate(`/chat/${item.conversationId}`)}
													className="w-full"
												>
													<MessageSquare className="h-4 w-4" />
													Open Chat
												</Button>
											) : null}
										</div>
									</div>
								</Card>
							);
						})}
					</div>
				) : null}
			</div>

			{isOpeningAlbum ? (
				<div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
					<div className="surface-card p-4 text-sm text-[var(--text-muted)]">
						Opening album...
					</div>
				</div>
			) : null}

			{viewer ? (
				<div
					className="fixed inset-0 z-50 bg-black/70 p-4"
					onClick={() => setViewer(null)}
				>
					<div
						className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="mb-3 flex items-center justify-between gap-3">
							<div>
								<p className="text-sm text-[var(--text-muted)]">Album</p>
								<p className="text-lg font-semibold">
									{viewer.albumName?.trim() || `Album #${viewer.albumId}`}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setViewer(null)}
								className="rounded-lg border border-[var(--border)] p-2"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{viewer.content.length === 0 ? (
							<EmptyState
								title="No media in this album"
								description="This shared album currently has no viewable media."
							/>
						) : (
							<div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
								{viewer.content.map((item) => {
									const mediaUrl = item.url || item.thumbUrl || item.coverUrl;
									if (!mediaUrl) {
										return (
											<div
												key={item.contentId}
												className="flex min-h-24 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--text-muted)]"
											>
												Unavailable
											</div>
										);
									}

									return (
										<div key={item.contentId} className="relative overflow-hidden rounded-lg bg-[var(--surface-2)]">
											{item.contentType?.startsWith("video/") ? (
												<video src={mediaUrl} controls className="h-40 w-full object-cover" />
											) : (
												<img src={mediaUrl} alt="Album content" className="h-40 w-full object-cover" />
											)}
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			) : null}
		</section>
	);
}
