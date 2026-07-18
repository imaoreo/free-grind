import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Images, LayoutGrid, Loader2, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ProfileImage } from "../../../components/ui/profile-image";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { PhotoViewer, type PhotoViewerMedia } from "../../../components/PhotoViewer";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { isIos, saveMediaBytesBatch } from "../../../services/saveMedia";
import { fetchAndEncode, toDataUri } from "../../../services/mediaStore";
import { captureAlbum, getLocalAlbum } from "../../../services/albumStore";
import * as chatDb from "../../../services/chatDb";
import { extractImageHashFromSignedUrl } from "./chatUtils";
import { appLog } from "../../../utils/logger";

const IMAGE_HASH_KEY_PREFIX = "image:hash:";

/**
 * Content fingerprint for de-duping the local/live merge below. A local
 * image captured via the chat-message flow can end up keyed by mediaId or
 * messageId instead of a hash (whenever getMessageImageHash/
 * extractImageHashFromSignedUrl couldn't derive one at capture time) — so
 * the URL-hash check alone can miss real duplicates. Hashing the actual
 * base64 content is key-scheme-independent and always catches them.
 */
async function hashBase64(base64: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(base64));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

type Tab = "received" | "sent";

type SharedAlbum = {
	albumId: number;
	albumName: string | null;
	coverUrl: string | null;
	contentCount: { imageCount: number; videoCount: number };
};

type LocalMediaItem = {
	mediaKey: string;
	kind: "image" | "video";
	dataUri: string;
	mimeType: string | null;
	base64: string;
	// Null for media with no local message to join against (e.g. the
	// getSharedConversationImages live-merge below) — those are always
	// received (that endpoint only ever returns images shared *with* the
	// signed-in user), so treating null as "not mine" here is correct.
	senderId: number | null;
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
	openFullScreenImage: _openFullScreenImage,
}: Props) {
	const { t } = useTranslation();
	const service = useApiFunctions();
	const [tab, setTab] = useState<Tab>("received");
	const [albums, setAlbums] = useState<SharedAlbum[]>([]);
	const [albumsLoading, setAlbumsLoading] = useState(true);
	const [media, setMedia] = useState<LocalMediaItem[]>([]);
	const [mediaLoading, setMediaLoading] = useState(true);
	const [failedCovers, setFailedCovers] = useState<Set<number>>(new Set());
	const [viewerIndex, setViewerIndex] = useState<number | null>(null);
	const [isSavingAll, setIsSavingAll] = useState(false);

	const isMine = (senderId: number | null) => senderId != null && userId != null && Number(senderId) === Number(userId);
	const sentMedia = media.filter((m) => isMine(m.senderId));
	const receivedMedia = media.filter((m) => !isMine(m.senderId));
	const activeMedia = tab === "sent" ? sentMedia : receivedMedia;

	const handleSaveAll = async () => {
		if (activeMedia.length === 0) {
			toast.error(t("profile_details.save_all_empty"));
			return;
		}

		setIsSavingAll(true);
		const toastId = toast.loading(
			t("profile_details.save_all_progress", { done: 0, total: activeMedia.length }),
		);
		try {
			const result = await saveMediaBytesBatch(
				activeMedia.map((m) => ({ base64: m.base64, mimeType: m.mimeType, type: m.kind })),
				(done, total) => {
					toast.loading(t("profile_details.save_all_progress", { done, total }), {
						id: toastId,
					});
				},
				conversationId,
			);

			if (result.failed === 0) {
				toast.success(
					t(
						isIos() ? "profile_details.save_all_success" : "profile_details.save_all_success_downloads",
						{ count: result.succeeded },
					),
					{ id: toastId },
				);
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
			toast.error(
				t(isIos() ? "profile_details.save_all_error" : "profile_details.save_all_error_downloads"),
				{ id: toastId },
			);
		} finally {
			setIsSavingAll(false);
		}
	};

	// Load this conversation's albums from the local cache first — durable
	// even once a share expires/exhausts server-side — then merge in the
	// live list (exact albumId match, no heuristic needed here) so covers/
	// counts stay fresh when reachable, and so albums surfaced only via this
	// profile-wide endpoint (not necessarily backed by a message in this
	// conversation's own history) still get captured for permanent access.
	useEffect(() => {
		let cancelled = false;
		setAlbumsLoading(true);

		void (async () => {
			let localAlbumIds = new Set<number>();
			try {
				const stored = await chatDb.getAlbumsForConversation(conversationId);
				const withCovers = await Promise.all(
					stored.map(async (a) => {
						const albumId = Number(a.albumId);
						const local = await getLocalAlbum(albumId);
						const first = local?.content[0] ?? null;
						const videoCount =
							local?.content.filter((c) => c.contentType?.startsWith("video/")).length ?? 0;
						return {
							albumId,
							albumName: a.albumName,
							coverUrl: first?.thumbUrl ?? first?.coverUrl ?? first?.url ?? null,
							contentCount: {
								imageCount: (local?.content.length ?? 0) - videoCount,
								videoCount,
							},
						};
					}),
				);
				localAlbumIds = new Set(withCovers.map((a) => a.albumId));
				if (!cancelled) setAlbums(withCovers);
			} catch (error) {
				appLog.warn("[ChatMediaSheet] failed to load local albums", error);
			} finally {
				if (!cancelled) setAlbumsLoading(false);
			}

			if (!senderProfileId) {
				return;
			}

			try {
				const sharedAlbums = await service.getSharedAlbumsForProfile({
					profileId: Number(senderProfileId),
				});
				if (cancelled) return;
				const liveAlbums: SharedAlbum[] = sharedAlbums.map((a) => ({
					albumId: a.albumId,
					albumName: a.albumName ?? a.name ?? null,
					coverUrl: a.content?.thumbUrl ?? a.content?.url ?? a.content?.coverUrl ?? null,
					contentCount: a.contentCount,
				}));
				setAlbums((previous) => {
					const map = new Map(previous.map((a) => [a.albumId, a] as const));
					for (const a of liveAlbums) {
						map.set(a.albumId, a); // live metadata wins when reachable
					}
					return [...map.values()];
				});

				for (const album of liveAlbums) {
					if (localAlbumIds.has(album.albumId)) continue;
					void (async () => {
						try {
							const details = await service.getAlbum(album.albumId);
							await captureAlbum({
								albumId: details.albumId,
								albumName: details.albumName,
								content: details.content,
								ownerProfileId: senderProfileId,
								conversationId,
								sharedViaMessageId: null,
								remainingViews: null,
								isViewable: null,
							});
						} catch (error) {
							appLog.warn(
								`[ChatMediaSheet] failed to eagerly capture album ${album.albumId}`,
								error,
							);
						}
					})();
				}
			} catch (err) {
				console.error("[ChatMediaSheet] getSharedAlbumsForProfile failed", err);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [conversationId, senderProfileId, service]);

	// Load this conversation's media from the local cache (chatDb) first — it
	// stays viewable forever, even after the server no longer serves it
	// (expired signed URLs, view-once exhausted, conversation
	// archived/blocked) — then merge in anything the live API still has that
	// isn't cached yet (e.g. an older conversation predating this cache).
	// The live endpoint exposes no messageId/hash to cross-reference chatDb
	// with directly, so de-duping uses the content hash embedded in
	// Grindr's signed CloudFront URLs instead — a heuristic, not a
	// guaranteed-exact match, but the same hash this codebase already
	// relies on elsewhere to identify images across re-signed URLs.
	useEffect(() => {
		let cancelled = false;
		setMediaLoading(true);

		void (async () => {
			let knownUrlHashes = new Set<string>();
			let knownContentHashes = new Set<string>();
			try {
				const files = await chatDb.getMediaFilesForConversation(conversationId);
				if (cancelled) return;
				setMedia(
					files.map((f) => ({
						mediaKey: f.mediaKey,
						kind: f.kind === "video" ? "video" : "image",
						dataUri: toDataUri(f.mimeType, f.dataBase64),
						mimeType: f.mimeType,
						base64: f.dataBase64,
						senderId: f.senderId,
					})),
				);
				knownUrlHashes = new Set(
					files
						.filter((f) => f.mediaKey.startsWith(IMAGE_HASH_KEY_PREFIX))
						.map((f) => f.mediaKey.slice(IMAGE_HASH_KEY_PREFIX.length)),
				);
				// Robust fallback, independent of which media_key scheme a given
				// local image happened to be captured under (hash/mediaId/
				// messageId) — covers the cases the URL-hash pre-check below
				// would otherwise miss.
				knownContentHashes = new Set(
					await Promise.all(files.map((f) => hashBase64(f.dataBase64))),
				);
			} catch (error) {
				appLog.warn("[ChatMediaSheet] failed to load local media", error);
			} finally {
				if (!cancelled) setMediaLoading(false);
			}

			try {
				const liveImages = await service.getSharedConversationImages(conversationId);

				for (const img of liveImages) {
					if (cancelled) return;
					if (!img.url) continue;

					const urlHash = extractImageHashFromSignedUrl(img.url);
					if (urlHash && knownUrlHashes.has(urlHash)) {
						// Fast path: definitely already local, skip the download.
						continue;
					}

					const fetched = await fetchAndEncode(img.url);
					if (!fetched || cancelled) continue;

					const contentHash = await hashBase64(fetched.base64);
					if (knownContentHashes.has(contentHash)) {
						// Already local under a different media_key scheme — don't
						// add a visible duplicate, but it's still worth recording
						// the URL hash now so a future load can take the fast path.
						if (urlHash) knownUrlHashes.add(urlHash);
						continue;
					}
					knownContentHashes.add(contentHash);
					if (urlHash) knownUrlHashes.add(urlHash);

					const mediaKey = urlHash
						? `${IMAGE_HASH_KEY_PREFIX}${urlHash}`
						: `image:media:${img.mediaId}`;

					await chatDb.upsertMediaFile({
						mediaKey,
						conversationId,
						messageId: null,
						kind: "image",
						mimeType: fetched.mimeType,
						dataBase64: fetched.base64,
						viewOnce: false,
						sizeBytes: fetched.sizeBytes,
						fetchStatus: "ok",
					});

					if (!cancelled) {
						setMedia((previous) => {
							if (previous.some((m) => m.mediaKey === mediaKey)) {
								return previous;
							}
							return [
								...previous,
								{
									mediaKey,
									kind: "image" as const,
									dataUri: toDataUri(fetched.mimeType, fetched.base64),
									mimeType: fetched.mimeType,
									base64: fetched.base64,
									// getSharedConversationImages only ever returns images shared
									// with the signed-in user, so this is always received.
									senderId: null,
								},
							];
						});
					}
				}
			} catch (error) {
				appLog.warn("[ChatMediaSheet] failed to merge live shared images", error);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [conversationId, service]);

	const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number; loading: boolean }[] = [
		{
			id: "received",
			label: t("chat.media_sheet.tab_received"),
			icon: <Images className="h-4 w-4" />,
			count: receivedMedia.length,
			loading: mediaLoading,
		},
		{
			id: "sent",
			label: t("chat.media_sheet.tab_sent"),
			icon: <Images className="h-4 w-4" />,
			count: sentMedia.length,
			loading: mediaLoading,
		},
	];

	const viewerPhotos: PhotoViewerMedia[] = activeMedia.map((m) => ({ url: m.dataUri, type: m.kind }));

	return (
		<>
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[82dvh]">
			<div className="flex flex-col" style={{ minHeight: "60vh" }}>
				{/* Header */}
				<div className="flex items-center justify-between px-4 pb-3">
					<p className="text-sm font-semibold text-[var(--text)]">{t("chat.media_sheet.title")}</p>
					<div className="flex items-center gap-2">
						{activeMedia.length > 0 && (
							<button
								type="button"
								onClick={() => void handleSaveAll()}
								disabled={isSavingAll}
								className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-50"
								aria-label={t("profile_details.save_all")}
								title={t("profile_details.save_all")}
							>
								<Download className="h-4 w-4" />
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
								<span className="min-w-[18px] rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-[var(--accent-contrast)]">
									{tab_item.count}
								</span>
							)}
						</button>
					))}
				</div>

				{/* Content */}
				<div className="flex flex-1 flex-col overflow-y-auto p-4">
					{(tab === "received" && albums.length > 0) || activeMedia.length > 0 ? (
						<div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
							{tab === "received" && albums.map((album) => {
								const coverFailed = failedCovers.has(album.albumId);
								const showCover = !!album.coverUrl && !coverFailed;
								return (
									<button
										key={album.albumId}
										type="button"
										onClick={() => void openAlbumViewerById(album.albumId)}
										className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--surface-2)]"
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
										<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
											<div
												className="h-7 w-7 overflow-hidden rounded-full ring-2 ring-white/60 sm:h-9 sm:w-9"
												style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
											>
												<ProfileImage src={senderPhotoUrl} />
											</div>
											<p className="truncate max-w-full px-1 text-center text-[11px] font-medium leading-tight text-white drop-shadow">
												{album.albumName ?? `#${album.albumId}`}
											</p>
										</div>
									</button>
								);
							})}
							{activeMedia.map((item, idx) => (
								<button
									key={item.mediaKey}
									type="button"
									onClick={() => setViewerIndex(idx)}
									className="group relative aspect-square overflow-hidden rounded-lg bg-[var(--surface-2)]"
								>
									{item.kind === "video" ? (
										<>
											{/* eslint-disable-next-line jsx-a11y/media-has-caption */}
											<video
												src={item.dataUri}
												muted
												playsInline
												className="h-full w-full object-cover transition group-hover:scale-105"
											/>
											<div className="absolute inset-0 flex items-center justify-center bg-black/15">
												<Play className="h-6 w-6 text-white drop-shadow" fill="white" />
											</div>
										</>
									) : (
										<img
											src={item.dataUri}
											alt=""
											className="h-full w-full object-cover transition group-hover:scale-105"
										/>
									)}
								</button>
							))}
						</div>
					) : mediaLoading || (tab === "received" && albumsLoading) ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
						</div>
					) : (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
							<Images className="h-10 w-10 opacity-30" />
							<p className="text-sm font-medium">
								{t(tab === "sent" ? "chat.media_sheet.sent_empty_title" : "chat.media_sheet.received_empty_title")}
							</p>
							<p className="text-xs opacity-60">
								{t(tab === "sent" ? "chat.media_sheet.sent_empty_desc" : "chat.media_sheet.received_empty_desc")}
							</p>
						</div>
					)}
				</div>
			</div>
		</BottomSheet>

		{viewerIndex !== null && createPortal(
			<PhotoViewer
				isOpen
				onClose={() => setViewerIndex(null)}
				photos={viewerPhotos}
				initialIndex={viewerIndex}
				conversationId={conversationId}
			/>,
			document.body,
		)}
		</>
	);
}
