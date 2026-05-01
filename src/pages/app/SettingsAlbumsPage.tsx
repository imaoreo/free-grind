import {
	ArrowDown,
	ArrowUp,
	FolderOpen,
	Images,
	Pencil,
	Plus,
	Trash2,
	Upload,
} from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { Button } from "../../components/ui/button";
import {
	EmptyState,
	ErrorState,
	LoadingState,
} from "../../components/ui/states";
import { ApiFunctionError } from "../../services/apiFunctions";
import {
	type Album,
	type AlbumDetail,
	type AlbumMedia,
} from "../../types/albums";

function countAlbumMedia(detail: AlbumDetail | undefined): {
	total: number;
	images: number;
	nonImages: number;
} {
	const content = detail?.content ?? [];
	const images = content.filter((item) =>
		(item.contentType ?? "").toLowerCase().startsWith("image/"),
	).length;
	const total = content.length;
	return {
		total,
		images,
		nonImages: Math.max(0, total - images),
	};
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
	const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const output = new Uint8Array(totalBytes);
	let offset = 0;

	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}

	return output;
}

async function buildMultipartBody(file: File): Promise<{
	body: Uint8Array;
	contentType: string;
}> {
	const encoder = new TextEncoder();
	const boundary = `----opengrind-${crypto.randomUUID?.() ?? Date.now().toString(16)}`;
	const safeFilename = file.name.replace(/"/g, "_");
	const header =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="content"; filename="${safeFilename}"\r\n` +
		`Content-Type: ${file.type || "application/octet-stream"}\r\n\r\n`;
	const footer = `\r\n--${boundary}--\r\n`;

	const fileBytes = new Uint8Array(await file.arrayBuffer());
	const body = concatUint8Arrays([
		encoder.encode(header),
		fileBytes,
		encoder.encode(footer),
	]);

	return {
		body,
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

export function SettingsAlbumsPage() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const [albums, setAlbums] = useState<Album[]>([]);
	const [maxAlbums, setMaxAlbums] = useState<number>(1);
	const [subscriptionType, setSubscriptionType] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [createName, setCreateName] = useState("");
	const [isCreating, setIsCreating] = useState(false);
	const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [isSavingEdit, setIsSavingEdit] = useState(false);
	const [deletingAlbumId, setDeletingAlbumId] = useState<string | null>(null);
	const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
	const [albumDetails, setAlbumDetails] = useState<Record<string, AlbumDetail>>(
		{},
	);
	const [loadingAlbumDetailsId, setLoadingAlbumDetailsId] = useState<
		string | null
	>(null);
	const [uploadingAlbumId, setUploadingAlbumId] = useState<string | null>(null);
	const [reorderingAlbumId, setReorderingAlbumId] = useState<string | null>(
		null,
	);
	const [deletingContentKey, setDeletingContentKey] = useState<string | null>(
		null,
	);
	const [confirmDeleteAlbumId, setConfirmDeleteAlbumId] = useState<
		string | null
	>(null);
	const [confirmDeleteContentKey, setConfirmDeleteContentKey] = useState<
		string | null
	>(null);

	const loadAlbumsAndLimits = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const [ownAlbums, ownStorage] = await Promise.all([
				apiFunctions.getOwnAlbums(),
				apiFunctions.getOwnAlbumStorage(),
			]);

			setAlbums(ownAlbums);
			setMaxAlbums(ownStorage.maxAlbums ?? 1);
			setSubscriptionType(ownStorage.subscriptionType ?? null);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: t("settings_albums.error_load_fallback"),
			);
		} finally {
			setIsLoading(false);
		}
	}, [apiFunctions]);

	useEffect(() => {
		void loadAlbumsAndLimits();
	}, [loadAlbumsAndLimits]);

	const canCreateAlbum = useMemo(() => {
		return albums.length < maxAlbums;
	}, [albums.length, maxAlbums]);

	const freePlanHint = useMemo(() => {
		const lowered = subscriptionType?.toLowerCase() ?? "";
		const isFreeLikePlan = lowered.includes("free") || maxAlbums <= 1;

		if (isFreeLikePlan) {
			return t("settings_albums.subtitle_free");
		}

		return t("settings_albums.subtitle_paid");
	}, [maxAlbums, subscriptionType, t]);

	const handleCreateAlbum = async () => {
		if (!canCreateAlbum || isCreating) {
			return;
		}

		setIsCreating(true);
		const albumName = createName.trim() || `Album ${albums.length + 1}`;

		try {
			await apiFunctions.createOwnAlbum({ albumName });

			setCreateName("");
			toast.success(t("settings_albums.toast_created"));
			await loadAlbumsAndLimits();
		} catch (createError) {
			if (createError instanceof ApiFunctionError && createError.status === 402) {
				toast.error(t("settings_albums.limit_reached_toast"));
				return;
			}

			toast.error(
				createError instanceof Error
					? createError.message
					: t("settings_albums.error_create_fallback"),
			);
		} finally {
			setIsCreating(false);
		}
	};

	const startEditingAlbum = (album: Album) => {
		setEditingAlbumId(album.albumId);
		setEditingName(album.albumName?.trim() ?? "");
	};

	const cancelEditing = () => {
		setEditingAlbumId(null);
		setEditingName("");
	};

	const saveEditingAlbum = async (albumId: string) => {
		if (isSavingEdit) {
			return;
		}

		setIsSavingEdit(true);

		try {
			await apiFunctions.renameOwnAlbum({
				albumId,
				albumName: editingName.trim(),
			});

			setAlbums((previous) =>
				previous.map((album) =>
					album.albumId === albumId
						? { ...album, albumName: editingName.trim() }
						: album,
				),
			);
			toast.success(t("settings_albums.toast_renamed"));
			cancelEditing();
		} catch (saveError) {
			toast.error(
				saveError instanceof Error
					? saveError.message
					: t("settings_albums.error_rename_fallback"),
			);
		} finally {
			setIsSavingEdit(false);
		}
	};

	const deleteAlbum = async (albumId: string) => {
		if (deletingAlbumId) {
			return;
		}

		setDeletingAlbumId(albumId);

		try {
			await apiFunctions.deleteOwnAlbum({ albumId });

			setAlbums((previous) =>
				previous.filter((album) => album.albumId !== albumId),
			);
			setConfirmDeleteAlbumId((previous) =>
				previous === albumId ? null : previous,
			);
			toast.success(t("settings_albums.toast_deleted"));
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: t("settings_albums.error_delete_fallback"),
			);
		} finally {
			setDeletingAlbumId(null);
		}
	};

	const loadAlbumDetails = useCallback(
		async (albumId: string, forceRefresh = false) => {
			if (!forceRefresh && albumDetails[albumId]) {
				return;
			}

			setLoadingAlbumDetailsId(albumId);

			try {
				const parsed = await apiFunctions.getOwnAlbumDetails(albumId);
				setAlbumDetails((previous) => ({
					...previous,
					[albumId]: parsed,
				}));
			} catch (loadError) {
				toast.error(
					loadError instanceof Error
						? loadError.message
						: t("settings_albums.error_load_details_fallback"),
				);
			} finally {
				setLoadingAlbumDetailsId((previous) =>
					previous === albumId ? null : previous,
				);
			}
		},
			[albumDetails, apiFunctions],
	);

	const toggleAlbumOpen = (albumId: string) => {
		if (openAlbumId === albumId) {
			setOpenAlbumId(null);
			return;
		}

		setOpenAlbumId(albumId);
		void loadAlbumDetails(albumId);
	};

	const uploadPictures = async (albumId: string, files: File[]) => {
		if (!files.length || uploadingAlbumId) {
			return;
		}

		setUploadingAlbumId(albumId);

		try {
			for (const file of files) {
				const multipart = await buildMultipartBody(file);
				await apiFunctions.uploadOwnAlbumContent({ albumId, multipart });
			}

			toast.success(
				t("settings_albums.toast_picture_added", { count: files.length }),
			);
			await loadAlbumDetails(albumId, true);
		} catch (uploadError) {
			toast.error(
				uploadError instanceof Error
					? uploadError.message
					: t("settings_albums.error_upload_fallback"),
			);
		} finally {
			setUploadingAlbumId(null);
		}
	};

	const handleUploadInputChange = async (
		albumId: string,
		event: ChangeEvent<HTMLInputElement>,
	) => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		await uploadPictures(albumId, files);
	};

	const reorderAlbumContent = async (
		albumId: string,
		content: AlbumMedia[],
		fromIndex: number,
		toIndex: number,
	) => {
		if (reorderingAlbumId || fromIndex < 0 || toIndex < 0) {
			return;
		}

		if (toIndex >= content.length || fromIndex >= content.length) {
			return;
		}

		const reordered = [...content];
		const [movedItem] = reordered.splice(fromIndex, 1);
		reordered.splice(toIndex, 0, movedItem);

		const contentIds = reordered.map((item) =>
			Number.parseInt(item.contentId, 10),
		);
		if (contentIds.some((value) => Number.isNaN(value))) {
			toast.error(t("settings_albums.error_reorder_unsupported"));
			return;
		}

		setReorderingAlbumId(albumId);

		try {
			await apiFunctions.reorderOwnAlbumContent({ albumId, contentIds });

			setAlbumDetails((previous) => {
				const detail = previous[albumId];
				if (!detail) {
					return previous;
				}

				return {
					...previous,
					[albumId]: {
						...detail,
						content: reordered,
					},
				};
			});
		} catch (reorderError) {
			toast.error(
				reorderError instanceof Error
					? reorderError.message
					: t("settings_albums.error_reorder_fallback"),
			);
		} finally {
			setReorderingAlbumId(null);
		}
	};

	const deleteAlbumPicture = async (albumId: string, contentId: string) => {
		if (deletingContentKey) {
			return;
		}

		const deleteKey = `${albumId}:${contentId}`;
		setDeletingContentKey(deleteKey);

		try {
			await apiFunctions.deleteOwnAlbumContent({ albumId, contentId });

			setAlbumDetails((previous) => {
				const detail = previous[albumId];
				if (!detail) {
					return previous;
				}

				return {
					...previous,
					[albumId]: {
						...detail,
						content: detail.content.filter(
							(item) => item.contentId !== contentId,
						),
					},
				};
			});
			setConfirmDeleteContentKey((previous) =>
				previous === deleteKey ? null : previous,
			);
			toast.success(t("settings_albums.toast_picture_removed"));
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: t("settings_albums.error_delete_content_fallback"),
			);
		} finally {
			setDeletingContentKey(null);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-4xl gap-6">
				<header className="grid gap-4">
					<BackToSettings />

					<div className="surface-card p-5 sm:p-6">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
									{t("settings_albums.label")}
								</p>
								<h1 className="app-title mt-2">{t("settings_albums.title")}</h1>
								<p className="app-subtitle mt-2">
									{freePlanHint} {t("settings_albums.usage", { count: albums.length, max: maxAlbums })}
								</p>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm font-medium">
								{subscriptionType ?? t("settings_albums.unknown_plan")}
							</div>
						</div>
					</div>
				</header>

				<section className="surface-card p-5 sm:p-6">
					<div className="flex flex-wrap items-center gap-3">
						<input
							type="text"
							value={createName}
							onChange={(event) => setCreateName(event.target.value)}
							placeholder={t("settings_albums.new_album_placeholder")}
							className="input-field max-w-md"
							maxLength={255}
						/>
						<Button
							type="button"
							onClick={handleCreateAlbum}
							disabled={!canCreateAlbum || isCreating}
							variant="primary"
						>
							<Plus className="h-4 w-4" />
							{isCreating ? t("settings_albums.creating") : t("settings_albums.create")}
						</Button>
					</div>

					{!canCreateAlbum && (
						<p className="mt-3 text-sm text-[var(--text-muted)]">
							{t("settings_albums.limit_reached")}
						</p>
					)}
				</section>

				<section className="surface-card p-5 sm:p-6">
					<div className="mb-4 flex items-center gap-2">
						<Images className="h-5 w-5" />
						<h2 className="text-lg font-semibold">{t("settings_albums.your_albums")}</h2>
					</div>

					{isLoading ? (
						<LoadingState
							title={t("settings_albums.loading")}
							description={t("settings_albums.loading_desc")}
							compact
						/>
					) : error ? (
						<ErrorState
							title={t("settings_albums.error_load")}
							description={error}
							onRetry={() => {
								void loadAlbumsAndLimits();
							}}
						/>
					) : albums.length === 0 ? (
						<EmptyState
							title={t("settings_albums.empty")}
							description={t("settings_albums.empty_desc")}
						/>
					) : (
						<div className="grid gap-3">
							{albums.map((album) => {
								const isEditing = editingAlbumId === album.albumId;
								const isOpen = openAlbumId === album.albumId;
								const detail = albumDetails[album.albumId];
								const isLoadingDetails =
									loadingAlbumDetailsId === album.albumId;
								const uploadInputId = `album-upload-${album.albumId}`;
								const mediaCounts = countAlbumMedia(detail);
								const isConfirmingAlbumDelete =
									confirmDeleteAlbumId === album.albumId;

								return (
									<div
										key={album.albumId}
										className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:p-4"
									>
										<div className="flex flex-wrap items-center justify-between gap-3">
											{isEditing ? (
												<input
													type="text"
													value={editingName}
													onChange={(event) =>
														setEditingName(event.target.value)
													}
													className="input-field max-w-md"
													maxLength={255}
												/>
											) : (
												<div className="grid gap-1">
													<p className="text-base font-semibold">
														{album.albumName?.trim() || t("settings_albums.untitled")}
													</p>
													<p className="text-xs text-[var(--text-muted)]">
														{t("settings_albums.album_id", { id: album.albumId })}
													</p>
												</div>
											)}

											<div className="flex items-center gap-2">
												{isEditing ? (
													<>
														<button
															type="button"
															onClick={() =>
																void saveEditingAlbum(album.albumId)
															}
															disabled={isSavingEdit}
															className="btn-accent rounded-xl px-3 py-2 text-sm"
														>
															{isSavingEdit ? t("settings_albums.saving") : t("settings_albums.save")}
														</button>
														<button
															type="button"
															onClick={cancelEditing}
															className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															{t("settings_albums.cancel")}
														</button>
													</>
												) : (
													<>
														<button
															type="button"
															onClick={() => toggleAlbumOpen(album.albumId)}
															className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															<FolderOpen className="h-3.5 w-3.5" />
															{isOpen ? t("settings_albums.close") : t("settings_albums.open")}
														</button>
														<button
															type="button"
															onClick={() => startEditingAlbum(album)}
															className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															<Pencil className="h-3.5 w-3.5" /> {t("settings_albums.rename")}
														</button>
														<button
															type="button"
															onClick={() => {
																if (isConfirmingAlbumDelete) {
																	void deleteAlbum(album.albumId);
																	return;
																}

																setConfirmDeleteAlbumId(album.albumId);
															}}
															disabled={deletingAlbumId === album.albumId}
															className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															<Trash2 className="h-3.5 w-3.5" />
															{deletingAlbumId === album.albumId
																? t("settings_albums.deleting")
																: isConfirmingAlbumDelete
																	? t("settings_albums.confirm_delete")
																	: t("settings_albums.delete")}
														</button>
														{isConfirmingAlbumDelete && (
															<button
																type="button"
																onClick={() => setConfirmDeleteAlbumId(null)}
																className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
															>
																{t("settings_albums.cancel")}
															</button>
														)}
													</>
												)}
											</div>
										</div>

										{isOpen && (
											<div className="mt-4 grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
												<div className="flex flex-wrap items-center justify-between gap-3">
													<div>
														<p className="text-sm font-semibold">{t("settings_albums.media_title")}</p>
														<p className="text-xs text-[var(--text-muted)]">
															{t("settings_albums.media_counts_images", { count: mediaCounts.images })}
															{mediaCounts.nonImages > 0
																? t("settings_albums.media_counts_total", { count: mediaCounts.total })
																: ""}
															{t("settings_albums.media_desc")}
														</p>
													</div>

													<div className="flex items-center gap-2">
														<input
															id={uploadInputId}
															type="file"
															accept="image/*"
															multiple
															onChange={(event) =>
																void handleUploadInputChange(
																	album.albumId,
																	event,
																)
															}
															className="hidden"
														/>
														<label
															htmlFor={uploadInputId}
															className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															<Upload className="h-3.5 w-3.5" />
															{uploadingAlbumId === album.albumId
																? t("settings_albums.uploading")
																: t("settings_albums.upload")}
														</label>
														<button
															type="button"
															onClick={() =>
																void loadAlbumDetails(album.albumId, true)
															}
															className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															{t("settings_albums.refresh")}
														</button>
													</div>
												</div>

												{isLoadingDetails ? (
													<p className="text-sm text-[var(--text-muted)]">
														{t("settings_albums.loading_media")}
													</p>
												) : !detail || detail.content.length === 0 ? (
													<p className="text-sm text-[var(--text-muted)]">
														{t("settings_albums.no_media")}
													</p>
												) : (
													<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
														{detail.content.map((item, index) => {
															const imageUrl =
																item.thumbUrl ||
																item.url ||
																item.coverUrl ||
																"";
															const canMoveUp = index > 0;
															const canMoveDown =
																index < detail.content.length - 1;
															const deleteKey = `${album.albumId}:${item.contentId}`;
															const isConfirmingContentDelete =
																confirmDeleteContentKey === deleteKey;

															return (
																<div
																	key={`${album.albumId}-${item.contentId}`}
																	className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
																>
																	{imageUrl ? (
																		<img
																			src={imageUrl}
																			alt={t("settings_albums.media_alt", { index: index + 1 })}
																			className="aspect-square w-full object-cover"
																		/>
																	) : (
																		<div className="aspect-square w-full bg-[var(--surface)]" />
																	)}

																	<div className="grid grid-cols-3 gap-1 p-2">
																		<button
																			type="button"
																			onClick={() =>
																				void reorderAlbumContent(
																					album.albumId,
																					detail.content,
																					index,
																					index - 1,
																				)
																			}
																			disabled={
																				!canMoveUp ||
																				reorderingAlbumId === album.albumId
																			}
																			className="inline-flex items-center justify-center rounded-md border border-[var(--border)] py-1"
																		>
																			<ArrowUp className="h-3.5 w-3.5" />
																		</button>
																		<button
																			type="button"
																			onClick={() =>
																				void reorderAlbumContent(
																					album.albumId,
																					detail.content,
																					index,
																					index + 1,
																				)
																			}
																			disabled={
																				!canMoveDown ||
																				reorderingAlbumId === album.albumId
																			}
																			className="inline-flex items-center justify-center rounded-md border border-[var(--border)] py-1"
																		>
																			<ArrowDown className="h-3.5 w-3.5" />
																		</button>
																		<button
																			type="button"
																			onClick={() => {
																				if (isConfirmingContentDelete) {
																					void deleteAlbumPicture(
																						album.albumId,
																						item.contentId,
																					);
																					return;
																				}

																				setConfirmDeleteContentKey(deleteKey);
																			}}
																			disabled={
																				deletingContentKey === deleteKey
																			}
																			className="inline-flex items-center justify-center rounded-md border border-[var(--border)] py-1"
																		>
																			<Trash2 className="h-3.5 w-3.5" />
																		</button>
																		{isConfirmingContentDelete && (
																			<button
																				type="button"
																				onClick={() =>
																					setConfirmDeleteContentKey(null)
																				}
																				className="col-span-3 rounded-md border border-[var(--border)] py-1 text-xs"
																			>
																				{t("settings_albums.cancel_delete_content")}
																			</button>
																		)}
																	</div>
																</div>
															);
														})}
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</section>
			</div>
		</section>
	);
}
