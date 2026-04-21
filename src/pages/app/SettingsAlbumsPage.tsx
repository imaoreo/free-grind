import {
	ArrowDown,
	ArrowLeft,
	ArrowUp,
	FolderOpen,
	Images,
	Pencil,
	Plus,
	Trash2,
	Upload,
} from "lucide-react";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ChangeEvent,
} from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { useApi } from "../../hooks/useApi";
import { Button } from "../../components/ui/button";
import {
	EmptyState,
	ErrorState,
	LoadingState,
} from "../../components/ui/states";

const albumSchema = z.object({
	albumId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	albumName: z.string().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	isShareable: z.boolean().optional(),
});

const albumsResponseSchema = z.object({
	albums: z.array(albumSchema).optional().default([]),
});

const albumLimitsSchema = z.object({
	subscriptionType: z.string().optional(),
	maxAlbums: z.number().int().positive().optional(),
});

const albumMediaSchema = z.object({
	contentId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	contentType: z.string().optional(),
	thumbUrl: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
	processing: z.boolean().optional(),
});

const albumDetailSchema = z.object({
	albumId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	albumName: z.string().nullable().optional(),
	content: z.array(albumMediaSchema).optional().default([]),
});

type Album = z.infer<typeof albumSchema>;
type AlbumDetail = z.infer<typeof albumDetailSchema>;
type AlbumMedia = z.infer<typeof albumMediaSchema>;

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
	const navigate = useNavigate();
	const { fetchRest } = useApi();
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
			const [albumsResponse, limitsResponse] = await Promise.all([
				fetchRest("/v1/albums"),
				fetchRest("/v1/albums/storage"),
			]);

			if (albumsResponse.status < 200 || albumsResponse.status >= 300) {
				throw new Error(`Failed to load albums (${albumsResponse.status})`);
			}

			const parsedAlbums = albumsResponseSchema.parse(albumsResponse.json());
			setAlbums(parsedAlbums.albums);

			if (limitsResponse.status >= 200 && limitsResponse.status < 300) {
				const parsedLimits = albumLimitsSchema.parse(limitsResponse.json());
				setMaxAlbums(parsedLimits.maxAlbums ?? 1);
				setSubscriptionType(parsedLimits.subscriptionType ?? null);
			} else {
				setMaxAlbums(1);
				setSubscriptionType(null);
			}
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: "Failed to load albums",
			);
		} finally {
			setIsLoading(false);
		}
	}, [fetchRest]);

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
			return "Free tier supports 1 album.";
		}

		return "Album capacity depends on your current subscription.";
	}, [maxAlbums, subscriptionType]);

	const handleCreateAlbum = async () => {
		if (!canCreateAlbum || isCreating) {
			return;
		}

		setIsCreating(true);
		const albumName = createName.trim() || `Album ${albums.length + 1}`;

		try {
			const response = await fetchRest("/v2/albums", {
				method: "POST",
				body: { albumName },
			});

			if (response.status === 402) {
				toast.error(
					"You reached your current album limit. Upgrade to create more albums.",
				);
				return;
			}

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to create album (${response.status})`);
			}

			setCreateName("");
			toast.success("Album created");
			await loadAlbumsAndLimits();
		} catch (createError) {
			toast.error(
				createError instanceof Error
					? createError.message
					: "Failed to create album",
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
			const response = await fetchRest(`/v2/albums/${albumId}`, {
				method: "PUT",
				body: { albumName: editingName.trim() },
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to rename album (${response.status})`);
			}

			setAlbums((previous) =>
				previous.map((album) =>
					album.albumId === albumId
						? { ...album, albumName: editingName.trim() }
						: album,
				),
			);
			toast.success("Album renamed");
			cancelEditing();
		} catch (saveError) {
			toast.error(
				saveError instanceof Error
					? saveError.message
					: "Failed to rename album",
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
			const response = await fetchRest(`/v1/albums/${albumId}`, {
				method: "DELETE",
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to delete album (${response.status})`);
			}

			setAlbums((previous) =>
				previous.filter((album) => album.albumId !== albumId),
			);
			setConfirmDeleteAlbumId((previous) =>
				previous === albumId ? null : previous,
			);
			toast.success("Album deleted");
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: "Failed to delete album",
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
				const response = await fetchRest(`/v2/albums/${albumId}`);

				if (response.status < 200 || response.status >= 300) {
					throw new Error(`Failed to load album details (${response.status})`);
				}

				const parsed = albumDetailSchema.parse(response.json());
				setAlbumDetails((previous) => ({
					...previous,
					[albumId]: parsed,
				}));
			} catch (loadError) {
				toast.error(
					loadError instanceof Error
						? loadError.message
						: "Failed to load album details",
				);
			} finally {
				setLoadingAlbumDetailsId((previous) =>
					previous === albumId ? null : previous,
				);
			}
		},
		[albumDetails, fetchRest],
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
				const response = await fetchRest(`/v1/albums/${albumId}/content`, {
					method: "POST",
					rawBody: multipart.body,
					contentType: multipart.contentType,
				});

				if (response.status < 200 || response.status >= 300) {
					throw new Error(`Failed to upload image (${response.status})`);
				}
			}

			toast.success(files.length === 1 ? "Picture added" : "Pictures added");
			await loadAlbumDetails(albumId, true);
		} catch (uploadError) {
			toast.error(
				uploadError instanceof Error
					? uploadError.message
					: "Failed to upload picture",
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
			toast.error("Cannot reorder this album due to unsupported media IDs");
			return;
		}

		setReorderingAlbumId(albumId);

		try {
			const response = await fetchRest(`/v1/albums/${albumId}/content/order`, {
				method: "POST",
				body: { contentIds },
			});

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to reorder pictures (${response.status})`);
			}

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
					: "Failed to reorder media",
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
			const response = await fetchRest(
				`/v1/albums/${albumId}/content/${contentId}`,
				{
					method: "DELETE",
				},
			);

			if (response.status < 200 || response.status >= 300) {
				throw new Error(`Failed to delete picture (${response.status})`);
			}

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
			toast.success("Picture removed");
		} catch (deleteError) {
			toast.error(
				deleteError instanceof Error
					? deleteError.message
					: "Failed to delete media",
			);
		} finally {
			setDeletingContentKey(null);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-4xl gap-6">
				<header className="grid gap-4">
					<button
						type="button"
						onClick={() => navigate("/settings")}
						className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Settings
					</button>

					<div className="surface-card p-5 sm:p-6">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
									Albums
								</p>
								<h1 className="app-title mt-2">Manage your private albums</h1>
								<p className="app-subtitle mt-2">
									{freePlanHint} You are using {albums.length} / {maxAlbums}.
								</p>
							</div>
							<div className="rounded-2xl bg-[var(--surface-2)] p-3 text-sm font-medium">
								{subscriptionType ?? "Unknown plan"}
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
							placeholder="New album name"
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
							{isCreating ? "Creating..." : "Create album"}
						</Button>
					</div>

					{!canCreateAlbum && (
						<p className="mt-3 text-sm text-[var(--text-muted)]">
							You reached your album limit for the current plan.
						</p>
					)}
				</section>

				<section className="surface-card p-5 sm:p-6">
					<div className="mb-4 flex items-center gap-2">
						<Images className="h-5 w-5" />
						<h2 className="text-lg font-semibold">Your albums</h2>
					</div>

					{isLoading ? (
						<LoadingState
							title="Loading albums"
							description="Fetching your album collection and plan limits."
							compact
						/>
					) : error ? (
						<ErrorState
							title="Could not load albums"
							description={error}
							onRetry={() => {
								void loadAlbumsAndLimits();
							}}
						/>
					) : albums.length === 0 ? (
						<EmptyState
							title="No albums yet"
							description="Create your first private album using the form above."
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
														{album.albumName?.trim() || "Untitled album"}
													</p>
													<p className="text-xs text-[var(--text-muted)]">
														Album ID: {album.albumId}
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
															{isSavingEdit ? "Saving..." : "Save"}
														</button>
														<button
															type="button"
															onClick={cancelEditing}
															className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															Cancel
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
															{isOpen ? "Close" : "Open"}
														</button>
														<button
															type="button"
															onClick={() => startEditingAlbum(album)}
															className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															<Pencil className="h-3.5 w-3.5" /> Rename
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
																? "Deleting..."
																: isConfirmingAlbumDelete
																	? "Confirm delete"
																	: "Delete"}
														</button>
														{isConfirmingAlbumDelete && (
															<button
																type="button"
																onClick={() => setConfirmDeleteAlbumId(null)}
																className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
															>
																Cancel
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
														<p className="text-sm font-semibold">Album media</p>
														<p className="text-xs text-[var(--text-muted)]">
															{mediaCounts.images} images
															{mediaCounts.nonImages > 0
																? ` · ${mediaCounts.total} total media`
																: ""}
															. Add images, remove them, or reorder display
															order.
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
																? "Uploading..."
																: "Add images"}
														</label>
														<button
															type="button"
															onClick={() =>
																void loadAlbumDetails(album.albumId, true)
															}
															className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm"
														>
															Refresh
														</button>
													</div>
												</div>

												{isLoadingDetails ? (
													<p className="text-sm text-[var(--text-muted)]">
														Loading album media...
													</p>
												) : !detail || detail.content.length === 0 ? (
													<p className="text-sm text-[var(--text-muted)]">
														No media in this album yet.
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
																			alt={`Album media ${index + 1}`}
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
																				Cancel delete
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
