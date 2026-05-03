import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AtSign,
	BadgeInfo,
	Camera,
	ImageOff,
	RefreshCw,
	Ruler,
	Save,
	ShieldPlus,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { useAuth } from "../../contexts/useAuth";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { BackToSettings } from "../../components/BackToSettings";
import {
	getBodyTypeLabelMap,
	getBodyTypeOptions,
	getEthnicityOptions,
	getHivStatusOptions,
	getLookingForOptions,
	getMeetAtOptions,
	getNsfwOptions,
	getRelationshipStatusLabelMap,
	getRelationshipStatusOptions,
	getSexualHealthOptions,
	getSexualPositionOptions,
	getTribeOptions,
	getVaccineOptions,
} from "./profile-option-builders";
import {
	CategoryHeader,
	ChipGroup,
	ToggleRow,
} from "./profile-editor/ProfileEditorComponents";
import {
	MAX_PROFILE_PHOTOS,
	type ProfileDraft,
	buildSquareThumbCoords,
	emptyDraft,
	parseDateInput,
	parseNullableInteger,
	parseNullableNumber,
	normalizeTagList,
	profileResponseSchema,
	profileSchema,
	profileToDraft,
} from "./profile-editor/profileEditorUtils";

export function ProfileEditorPage() {
	const { t } = useTranslation();
	const { userId, logout } = useAuth();
	const apiFunctions = useApiFunctions();
	const navigate = useNavigate();
	const [profile, setProfile] = useState<z.infer<typeof profileSchema> | null>(
		null,
	);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
	const [isSaving, setIsSaving] = useState(false);
	const [isSavingPhotos, setIsSavingPhotos] = useState(false);
	const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
	const [genderOptions, setGenderOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);
	const [pronounOptions, setPronounOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);

	const relationshipStatusLabels = useMemo<Record<number, string>>(
		() => getRelationshipStatusLabelMap(t),
		[t],
	);

	const bodyTypeLabels = useMemo<Record<number, string>>(
		() => getBodyTypeLabelMap(t),
		[t],
	);

	const relationshipStatusOptions = useMemo(
		() => getRelationshipStatusOptions(t),
		[t],
	);

	const bodyTypeOptions = useMemo(
		() => getBodyTypeOptions(t),
		[t],
	);

	const ethnicityOptions = useMemo(
		() => getEthnicityOptions(t),
		[t],
	);

	const positionOptions = useMemo(
		() => getSexualPositionOptions(t),
		[t],
	);

	const lookingForOptions = useMemo(
		() => getLookingForOptions(t),
		[t],
	);

	const meetAtOptions = useMemo(
		() => getMeetAtOptions(t),
		[t],
	);

	const hivStatusOptions = useMemo(
		() => getHivStatusOptions(t),
		[t],
	);

	const nsfwOptions = useMemo(
		() => getNsfwOptions(t),
		[t],
	);

	const sexualHealthOptions = useMemo(
		() => getSexualHealthOptions(t),
		[t],
	);

	const vaccineOptions = useMemo(
		() => getVaccineOptions(t),
		[t],
	);

	const tribeOptions = useMemo(
		() => getTribeOptions(t),
		[t],
	);

	const loadProfile = useCallback(async () => {
		if (!userId) {
			setProfile(null);
			setIsLoadingProfile(false);
			return;
		}

		try {
			setIsLoadingProfile(true);
			setProfileError(null);
			const parsed = profileResponseSchema.parse(
				await apiFunctions.getRawProfile(userId),
			);
			setProfile(parsed.profiles[0]);
		} catch (error) {
			setProfile(null);
			setProfileError(
				error instanceof Error ? error.message : t("profile_editor.error_load"),
			);
		} finally {
			setIsLoadingProfile(false);
		}
	}, [apiFunctions, userId, t]);

	const loadManagedOptions = useCallback(async () => {
		try {
			const genders = await apiFunctions.getManagedGenders();
			setGenderOptions(
				genders.map((item) => ({ value: item.genderId, label: item.gender })),
			);

			if (userId) {
				const pronouns = await apiFunctions.getManagedPronouns();
				setPronounOptions(
					pronouns.map((item) => ({
						value: item.pronounId,
						label: item.pronoun,
					})),
				);
			} else {
				setPronounOptions([]);
			}
		} catch {
			setGenderOptions([]);
			setPronounOptions([]);
		}
	}, [apiFunctions, userId]);

	useEffect(() => {
		void loadProfile();
		void loadManagedOptions();
	}, [loadManagedOptions, loadProfile]);

	useEffect(() => {
		setDraft(profileToDraft(profile));
	}, [profile]);

	const displayName = useMemo(() => {
		if (profile?.displayName?.trim()) {
			return profile.displayName.trim();
		}

		return userId ? `Profile ${userId}` : "Your profile";
	}, [profile?.displayName, userId]);

	const draftDisplayName = useMemo(() => {
		return draft.displayName.trim() || displayName;
	}, [displayName, draft.displayName]);

	const draftInitials = useMemo(() => {
		const parts = draftDisplayName.split(/\s+/).filter(Boolean).slice(0, 2);
		return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
	}, [draftDisplayName]);

	const savedDraft = useMemo(() => profileToDraft(profile), [profile]);

	const hasChanges = useMemo(
		() => JSON.stringify(draft) !== JSON.stringify(savedDraft),
		[draft, savedDraft],
	);

	const tagList = useMemo(
		() => normalizeTagList(draft.profileTagsText),
		[draft.profileTagsText],
	);

	const profilePhotoHashes = useMemo(() => {
		const fromMedias = (profile?.medias ?? [])
			.map((item) => item.mediaHash ?? "")
			.filter((hash): hash is string => validateMediaHash(hash));

		const hashes = [...fromMedias];

		if (
			profile?.profileImageMediaHash &&
			validateMediaHash(profile.profileImageMediaHash) &&
			!hashes.includes(profile.profileImageMediaHash)
		) {
			hashes.unshift(profile.profileImageMediaHash);
		}

		return hashes.slice(0, MAX_PROFILE_PHOTOS);
	}, [profile?.medias, profile?.profileImageMediaHash]);

	const photoSlots = useMemo(
		() =>
			Array.from(
				{ length: MAX_PROFILE_PHOTOS },
				(_, index) => profilePhotoHashes[index] ?? null,
			),
		[profilePhotoHashes],
	);

	const selectedRelationshipLabel = useMemo(() => {
		if (!draft.relationshipStatus) {
			return t("profile_editor.sections.states.relationship_not_set");
		}

		return (
			relationshipStatusLabels[Number(draft.relationshipStatus)] ??
			`Status ${draft.relationshipStatus}`
		);
	}, [draft.relationshipStatus, relationshipStatusLabels, t]);

	const selectedBodyTypeLabel = useMemo(() => {
		if (!draft.bodyType) {
			return t("profile_editor.sections.states.body_type_not_set");
		}

		return bodyTypeLabels[Number(draft.bodyType)] ?? `Type ${draft.bodyType}`;
	}, [draft.bodyType, bodyTypeLabels, t]);

	const completionChecklist = useMemo(
		() => [
			Boolean(draft.displayName.trim()),
			Boolean(draft.aboutMe.trim()),
			Boolean(draft.profileTagsText.trim()),
			Boolean(draft.age.trim()),
			Boolean(draft.height.trim()),
			Boolean(draft.weight.trim()),
			Boolean(draft.relationshipStatus),
			Boolean(draft.nsfw),
			Boolean(draft.hivStatus),
		],
		[
			draft.aboutMe,
			draft.age,
			draft.displayName,
			draft.height,
			draft.hivStatus,
			draft.nsfw,
			draft.profileTagsText,
			draft.relationshipStatus,
			draft.weight,
		],
	);

	const completionCount = useMemo(
		() => completionChecklist.filter(Boolean).length,
		[completionChecklist],
	);

	const completionPercent = useMemo(
		() => Math.round((completionCount / completionChecklist.length) * 100),
		[completionChecklist.length, completionCount],
	);

	const displayNameError = useMemo(() => {
		const value = draft.displayName.trim();
		if (!value) {
			return null;
		}

		if (value.length < 3 || value.length > 15) {
			return t("profile_editor.errors.display_name_length");
		}

		return null;
	}, [draft.displayName, t]);

	const aboutMeError = useMemo(() => {
		if (draft.aboutMe.length > 255) {
			return t("profile_editor.errors.about_me_length");
		}

		return null;
	}, [draft.aboutMe, t]);

	const canSave = hasChanges && !isSaving && !displayNameError && !aboutMeError;

	const handleDraftChange = <K extends keyof ProfileDraft>(
		key: K,
		value: ProfileDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
	};

	const toggleMultiValue = (
		key:
			| "lookingFor"
			| "meetAt"
			| "grindrTribes"
			| "genders"
			| "pronouns"
			| "sexualHealth"
			| "vaccines",
		value: number,
	) => {
		setDraft((current) => ({
			...current,
			[key]: (current[key] as number[]).includes(value)
				? (current[key] as number[]).filter((item) => item !== value)
				: [...(current[key] as number[]), value].sort((left, right) => left - right),
		}));
	};

	const handleSaveProfile = async () => {
		if (!userId || !canSave) {
			return;
		}

		setIsSaving(true);

		try {
			await apiFunctions.updateMyProfile({
				displayName: draft.displayName.trim() || null,
				aboutMe: draft.aboutMe.trim() || null,
				profileTags: tagList,
				showAge: draft.showAge,
				age: parseNullableInteger(draft.age),
				height: parseNullableNumber(draft.height),
				weight: parseNullableNumber(draft.weight),
				ethnicity: parseNullableInteger(draft.ethnicity),
				bodyType: parseNullableInteger(draft.bodyType),
				showPosition: draft.showPosition,
				sexualPosition: parseNullableInteger(draft.sexualPosition),
				showTribes: draft.showTribes,
				grindrTribes: draft.grindrTribes,
				relationshipStatus: parseNullableInteger(draft.relationshipStatus),
				lookingFor: draft.lookingFor,
				meetAt: draft.meetAt,
				nsfw: parseNullableInteger(draft.nsfw),
				genders: draft.genders,
				pronouns: draft.pronouns,
				hivStatus: parseNullableInteger(draft.hivStatus),
				lastTestedDate: parseDateInput(draft.lastTestedDate),
				sexualHealth: draft.sexualHealth,
				vaccines: draft.vaccines,
				socialNetworks: {
					instagram: { userId: draft.instagram.trim() || null },
					twitter: { userId: draft.twitter.trim() || null },
					facebook: { userId: draft.facebook.trim() || null },
				},
			});

			toast.success(t("profile_editor.toasts.updated"));
			await loadProfile();
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: t("profile_editor.toasts.error_update");
			toast.error(message);
		} finally {
			setIsSaving(false);
		}
	};

	const persistProfilePhotos = useCallback(
		async (
			nextHashes: string[],
			options?: {
				deletedHashes?: string[];
				successMessage?: string;
			},
		) => {
			if (!userId) {
				return;
			}

			const sanitized = Array.from(
				new Set(nextHashes.filter((hash) => validateMediaHash(hash))),
			).slice(0, MAX_PROFILE_PHOTOS);

			const [primaryImageHash, ...secondaryImageHashes] = sanitized;

			setIsSavingPhotos(true);

			try {
				await apiFunctions.updateMyProfileImages({
					primaryImageHash: primaryImageHash ?? null,
					secondaryImageHashes,
				});

				const deletedHashes =
					options?.deletedHashes?.filter((hash) => validateMediaHash(hash)) ??
					[];

				if (deletedHashes.length > 0) {
					await apiFunctions.deleteMyProfileImages(deletedHashes);
				}

				await loadProfile();
				toast.success(
					options?.successMessage ?? t("profile_editor.toasts.photos_updated"),
				);
			} catch (error) {
				const message =
					error instanceof Error
						? error.message
						: t("profile_editor.toasts.error_photos");
				toast.error(message);
			} finally {
				setIsSavingPhotos(false);
			}
		},
		[apiFunctions, loadProfile, userId, t],
	);

	const handleUploadPhoto = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = "";

		if (!file) {
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error(t("profile_editor.toasts.error_upload_type"));
			return;
		}

		if (profilePhotoHashes.length >= MAX_PROFILE_PHOTOS) {
			toast.error(t("profile_editor.toasts.error_photo_limit"));
			return;
		}

		setIsUploadingPhoto(true);

		try {
			const body = new Uint8Array(await file.arrayBuffer());
			const thumbCoords = await buildSquareThumbCoords(file);

			const uploadPaths = [
				`/v4/media/upload?thumbCoords=${encodeURIComponent(thumbCoords)}&takenOnGrindr=false`,
				"/v3/me/profile/images",
			];

			let uploadedHash: string | null = null;
			const failedMessages: string[] = [];

			for (const path of uploadPaths) {
				try {
					const uploaded = await apiFunctions.uploadProfileImage({
						path,
						body,
						contentType: file.type || "application/octet-stream",
					});
					uploadedHash =
						uploaded.hash ??
						uploaded.mediaHash ??
						uploaded.imageSizes?.find((item) => item.mediaHash)?.mediaHash ??
						null;
					if (uploadedHash) {
						break;
					}
				} catch (error) {
					failedMessages.push(
						error instanceof Error ? error.message : "upload failed",
					);
				}
			}

			if (!uploadedHash) {
				throw new Error(
					`Failed to upload image (${failedMessages.join(" -> ")})`,
				);
			}

			if (!uploadedHash || !validateMediaHash(uploadedHash)) {
				throw new Error(
					"Upload completed but no valid media hash was returned",
				);
			}

			await persistProfilePhotos([...profilePhotoHashes, uploadedHash], {
				successMessage: t("profile_editor.toasts.photo_uploaded"),
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: t("profile_editor.toasts.error_upload");
			toast.error(message);
		} finally {
			setIsUploadingPhoto(false);
		}
	};

	const handleSetPrimaryPhoto = async (hash: string) => {
		if (!validateMediaHash(hash) || isSavingPhotos || isUploadingPhoto) {
			return;
		}

		if (profilePhotoHashes[0] === hash) {
			return;
		}

		const reordered = [
			hash,
			...profilePhotoHashes.filter((currentHash) => currentHash !== hash),
		];

		await persistProfilePhotos(reordered, {
			successMessage: t("profile_editor.toasts.primary_updated"),
		});
	};

	const handleRemovePhoto = async (hash: string) => {
		if (!validateMediaHash(hash) || isSavingPhotos || isUploadingPhoto) {
			return;
		}

		await persistProfilePhotos(
			profilePhotoHashes.filter((currentHash) => currentHash !== hash),
			{
				deletedHashes: [hash],
				successMessage: t("profile_editor.toasts.photo_removed"),
			},
		);
	};

	const handleResetDraft = () => {
		setDraft(savedDraft);
	};

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
		}
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-[1180px] gap-6">
				<header className="space-y-3">
					<p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
						{t("profile_editor.management")}
					</p>
					<h1 className="app-title">{t("profile_editor.title")}</h1>
					<p className="max-w-[65ch] text-sm leading-relaxed text-[var(--text-muted)] sm:text-base">
						{t("profile_editor.subtitle")}
					</p>
				</header>

				{isLoadingProfile ? (
					<div className="surface-card rounded-3xl p-5 sm:p-6">
						<p className="text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.loading")}
						</p>
					</div>
				) : profileError ? (
					<div className="surface-card rounded-3xl p-5 sm:p-6">
						<p className="text-sm font-semibold">
							{t("profile_editor.error_load")}
						</p>
						<p className="mt-2 text-sm text-[var(--text-muted)]">
							{profileError}
						</p>
					</div>
				) : (
					<div className="grid gap-6">
						<div className="surface-card rounded-[28px] p-5 sm:p-6">
							<div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
								<div className="flex items-center gap-4 sm:gap-5">
									<div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-[var(--accent-contrast)] shadow-sm sm:h-20 sm:w-20 sm:text-2xl">
										{draftInitials}
									</div>
									<div>
										<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">
											{t("profile_editor.summary")}
										</p>
										<h2 className="mt-1 text-2xl font-semibold leading-tight sm:text-[2rem]">
											{draftDisplayName}
										</h2>
										<div className="mt-3 flex flex-wrap gap-2">
											<span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
												{selectedRelationshipLabel}
											</span>
											<span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
												{selectedBodyTypeLabel}
											</span>
											<span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium text-[var(--text-muted)]">
												{tagList.length > 0
													? t("profile_editor.tags_count", {
															count: tagList.length,
														})
													: t("profile_editor.no_tags")}
											</span>
										</div>
									</div>
								</div>

								<div className="flex w-full flex-col items-start gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 lg:w-auto lg:min-w-[260px]">
									<p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
										{t("profile_editor.completion_title")}
									</p>
									<p className="text-3xl font-semibold leading-none">
										{completionPercent}%
									</p>
									<div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
										<div
											className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
											style={{ width: `${completionPercent}%` }}
										/>
									</div>
									<p className="text-xs text-[var(--text-muted)]">
										{t("profile_editor.completion_signals", {
											count: completionCount,
											total: completionChecklist.length,
										})}
									</p>
								</div>
							</div>
						</div>

						<div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)] lg:items-start">
							<div className="grid gap-5">
								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.pictures.title")}
										description={t(
											"profile_editor.sections.pictures.description",
										)}
										icon={ImageOff}
									/>
									<div className="grid gap-4">
										<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 sm:p-4">
											<p className="text-sm text-[var(--text-muted)]">
												{t("profile_editor.sections.pictures.usage", {
													count: profilePhotoHashes.length,
													total: MAX_PROFILE_PHOTOS,
												})}
											</p>
											<label
												htmlFor="profile-photo-upload"
												className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium transition-colors hover:border-[var(--text-muted)]"
											>
												<Camera className="h-4 w-4" />
												{isUploadingPhoto
													? t("profile_editor.sections.pictures.uploading")
													: t("profile_editor.sections.pictures.add")}
											</label>
											<input
												id="profile-photo-upload"
												type="file"
												accept="image/*"
												onChange={handleUploadPhoto}
												disabled={isUploadingPhoto || isSavingPhotos}
												className="hidden"
											/>
										</div>

										<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
											{photoSlots.map((hash, index) => {
												const isPrimary = index === 0;

												return (
													<div
														key={`${hash ?? "empty"}-${index}`}
														className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2"
													>
														<div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--surface)]">
															{hash ? (
																<img
																	src={getThumbImageUrl(hash, "320x320")}
																	alt={`Profile photo ${index + 1}`}
																	className="h-full w-full object-cover"
																/>
															) : (
																<div className="flex h-full items-center justify-center text-[var(--text-muted)]">
																	<ImageOff className="h-5 w-5" />
																</div>
															)}
														</div>

														<div className="mt-2 space-y-2">
															<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
																{isPrimary
																	? t("profile_editor.sections.pictures.primary")
																	: t("profile_editor.sections.pictures.slot", {
																			index: index + 1,
																		})}
															</p>

															{hash ? (
																<div className="grid gap-1.5">
																	<button
																		type="button"
																		onClick={() =>
																			void handleSetPrimaryPhoto(hash)
																		}
																		disabled={
																			isPrimary ||
																			isSavingPhotos ||
																			isUploadingPhoto
																		}
																		className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
																	>
																		<Star className="h-3.5 w-3.5" />
																		{t(
																			"profile_editor.sections.pictures.set_primary",
																		)}
																	</button>
																	<button
																		type="button"
																		onClick={() => void handleRemovePhoto(hash)}
																		disabled={
																			isSavingPhotos || isUploadingPhoto
																		}
																		className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
																	>
																		<Trash2 className="h-3.5 w-3.5" />
																		{t("profile_editor.sections.pictures.remove")}
																	</button>
																</div>
															) : (
																<label
																	htmlFor="profile-photo-upload"
																	className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-muted)]"
																>
																	{t("profile_editor.sections.pictures.add")}
																</label>
															)}
														</div>
													</div>
												);
											})}
										</div>

										{isSavingPhotos ? (
											<p className="text-xs text-[var(--text-muted)]">
												{t("profile_editor.sections.pictures.saving")}
											</p>
										) : null}
										<p className="text-xs leading-relaxed text-[var(--text-muted)]">
											{t("profile_editor.sections.pictures.footer")}
										</p>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.profile.title")}
										description={t(
											"profile_editor.sections.profile.description",
										)}
										icon={Sparkles}
									/>
									<div className="grid gap-5">
										<div>
											<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												{t("profile_editor.sections.profile.display_name")}
											</label>
											<input
												type="text"
												maxLength={15}
												value={draft.displayName}
												onChange={(event) =>
													handleDraftChange("displayName", event.target.value)
												}
												className="input-field"
												placeholder={t(
													"profile_editor.sections.profile.display_name_placeholder",
												)}
											/>
											<p className="mt-2 text-xs text-[var(--text-muted)] sm:text-sm">
												{displayNameError ??
													t("profile_editor.sections.profile.char_count", {
														count: draft.displayName.trim().length || 0,
														total: 15,
													})}
											</p>
										</div>

										<div>
											<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												{t("profile_editor.sections.profile.about_me")}
											</label>
											<textarea
												value={draft.aboutMe}
												maxLength={255}
												onChange={(event) =>
													handleDraftChange("aboutMe", event.target.value)
												}
												className="input-field min-h-32 resize-y"
												placeholder={t(
													"profile_editor.sections.profile.about_me_placeholder",
												)}
											/>
											<p className="mt-2 text-xs text-[var(--text-muted)] sm:text-sm">
												{aboutMeError ??
													t("profile_editor.sections.profile.char_count", {
														count: draft.aboutMe.length,
														total: 255,
													})}
											</p>
										</div>

										<div>
											<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												{t("profile_editor.sections.profile.my_tags")}
											</label>
											<input
												type="text"
												value={draft.profileTagsText}
												onChange={(event) =>
													handleDraftChange(
														"profileTagsText",
														event.target.value,
													)
												}
												className="input-field"
												placeholder={t(
													"profile_editor.sections.profile.my_tags_placeholder",
												)}
											/>
											<div className="mt-3 flex flex-wrap gap-2.5">
												{tagList.length > 0 ? (
													tagList.map((tag) => (
														<span
															key={tag}
															className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium"
														>
															{tag}
														</span>
													))
												) : (
													<p className="text-sm text-[var(--text-muted)]">
														{t(
															"profile_editor.sections.profile.no_tags_added",
														)}
													</p>
												)}
											</div>
										</div>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.states.title")}
										description={t(
											"profile_editor.sections.states.description",
										)}
										icon={Ruler}
									/>
									<div className="grid gap-4">
										<div className="grid gap-4 md:grid-cols-2">
											<ToggleRow
												checked={draft.showAge}
												onChange={(checked) =>
													handleDraftChange("showAge", checked)
												}
												label={t("profile_editor.sections.states.show_age")}
												description={t(
													"profile_editor.sections.states.show_age_desc",
												)}
											/>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.age")}
												</label>
												<input
													type="number"
													inputMode="numeric"
													value={draft.age}
													onChange={(event) =>
														handleDraftChange("age", event.target.value)
													}
													className="input-field"
													placeholder={t(
														"profile_editor.sections.states.age",
													)}
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.height")}
												</label>
												<input
													type="number"
													inputMode="numeric"
													value={draft.height}
													onChange={(event) =>
														handleDraftChange("height", event.target.value)
													}
													className="input-field"
													placeholder={t(
														"profile_editor.sections.states.height_placeholder",
													)}
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.weight")}
												</label>
												<input
													type="number"
													inputMode="numeric"
													value={draft.weight}
													onChange={(event) =>
														handleDraftChange("weight", event.target.value)
													}
													className="input-field"
													placeholder={t(
														"profile_editor.sections.states.weight_placeholder",
													)}
												/>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.ethnicity")}
												</label>
												<select
													value={draft.ethnicity}
													onChange={(event) =>
														handleDraftChange("ethnicity", event.target.value)
													}
													className="input-field"
												>
													<option value="">
														{t("profile_editor.sections.states.not_set")}
													</option>
													{ethnicityOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.body_type")}
												</label>
												<select
													value={draft.bodyType}
													onChange={(event) =>
														handleDraftChange("bodyType", event.target.value)
													}
													className="input-field"
												>
													<option value="">
														{t("profile_editor.sections.states.not_set")}
													</option>
													{bodyTypeOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
											<ToggleRow
												checked={draft.showPosition}
												onChange={(checked) =>
													handleDraftChange("showPosition", checked)
												}
												label={t("profile_editor.sections.states.show_position")}
												description={t(
													"profile_editor.sections.states.show_position_desc",
												)}
											/>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.states.position")}
												</label>
												<select
													value={draft.sexualPosition}
													onChange={(event) =>
														handleDraftChange(
															"sexualPosition",
															event.target.value,
														)
													}
													className="input-field"
												>
													<option value="">
														{t("profile_editor.sections.states.not_set")}
													</option>
													{positionOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
											<ToggleRow
												checked={draft.showTribes}
												onChange={(checked) =>
													handleDraftChange("showTribes", checked)
												}
												label={t("profile_editor.sections.states.show_tribes")}
												description={t(
													"profile_editor.sections.states.show_tribes_desc",
												)}
											/>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t(
														"profile_editor.sections.states.relationship_status",
													)}
												</label>
												<select
													value={draft.relationshipStatus}
													onChange={(event) =>
														handleDraftChange(
															"relationshipStatus",
															event.target.value,
														)
													}
													className="input-field"
												>
													<option value="">
														{t("profile_editor.sections.states.not_set")}
													</option>
													{relationshipStatusOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
										</div>

										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.states.tribes")}
											</p>
											<ChipGroup
												options={tribeOptions}
												selected={draft.grindrTribes}
												onToggle={(value) =>
													toggleMultiValue("grindrTribes", value)
												}
											/>
										</div>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.expectations.title")}
										description={t(
											"profile_editor.sections.expectations.description",
										)}
										icon={Sparkles}
									/>
									<div className="grid gap-4">
										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.expectations.looking_for")}
											</p>
											<ChipGroup
												options={lookingForOptions}
												selected={draft.lookingFor}
												onToggle={(value) =>
													toggleMultiValue("lookingFor", value)
												}
											/>
										</div>
										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.expectations.meet_at")}
											</p>
											<ChipGroup
												options={meetAtOptions}
												selected={draft.meetAt}
												onToggle={(value) => toggleMultiValue("meetAt", value)}
											/>
										</div>
										<div>
											<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.expectations.accept_nsfw")}
											</label>
											<select
												value={draft.nsfw}
												onChange={(event) =>
													handleDraftChange("nsfw", event.target.value)
												}
												className="input-field"
											>
												<option value="">
													{t("profile_editor.sections.states.not_set")}
												</option>
												{nsfwOptions.map((option) => (
													<option key={option.value} value={option.value}>
														{option.label}
													</option>
												))}
											</select>
										</div>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.identity.title")}
										description={t(
											"profile_editor.sections.identity.description",
										)}
										icon={BadgeInfo}
									/>
									<div className="grid gap-4">
										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.identity.gender")}
											</p>
											{genderOptions.length > 0 ? (
												<ChipGroup
													options={genderOptions}
													selected={draft.genders}
													onToggle={(value) =>
														toggleMultiValue("genders", value)
													}
												/>
											) : (
												<p className="text-sm text-[var(--text-muted)]">
													{t(
														"profile_editor.sections.identity.gender_unavailable",
													)}
												</p>
											)}
										</div>
										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.identity.pronouns")}
											</p>
											{pronounOptions.length > 0 ? (
												<ChipGroup
													options={pronounOptions}
													selected={draft.pronouns}
													onToggle={(value) =>
														toggleMultiValue("pronouns", value)
													}
												/>
											) : (
												<p className="text-sm text-[var(--text-muted)]">
													{t(
														"profile_editor.sections.identity.pronouns_unavailable",
													)}
												</p>
											)}
										</div>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.health.title")}
										description={t(
											"profile_editor.sections.health.description",
										)}
										icon={ShieldPlus}
									/>
									<div className="grid gap-4">
										<div className="grid gap-4 md:grid-cols-2">
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.health.hiv_status")}
												</label>
												<select
													value={draft.hivStatus}
													onChange={(event) =>
														handleDraftChange("hivStatus", event.target.value)
													}
													className="input-field"
												>
													<option value="">
														{t("profile_editor.sections.states.not_set")}
													</option>
													{hivStatusOptions.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</div>
											<div>
												<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
													{t("profile_editor.sections.health.last_tested")}
												</label>
												<input
													type="date"
													value={draft.lastTestedDate}
													onChange={(event) =>
														handleDraftChange(
															"lastTestedDate",
															event.target.value,
														)
													}
													className="input-field"
												/>
											</div>
										</div>

										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.health.health_practices")}
											</p>
											<ChipGroup
												options={sexualHealthOptions}
												selected={draft.sexualHealth}
												onToggle={(value) =>
													toggleMultiValue("sexualHealth", value)
												}
											/>
										</div>
										<div>
											<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.health.vaccinations")}
											</p>
											<ChipGroup
												options={vaccineOptions}
												selected={draft.vaccines}
												onToggle={(value) =>
													toggleMultiValue("vaccines", value)
												}
											/>
										</div>
									</div>
								</div>

								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<CategoryHeader
										title={t("profile_editor.sections.social.title")}
										description={t(
											"profile_editor.sections.social.description",
										)}
										icon={AtSign}
									/>
									<div className="grid gap-4 md:grid-cols-3">
										<div>
											<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.social.instagram")}
											</label>
											<input
												type="text"
												value={draft.instagram}
												onChange={(event) =>
													handleDraftChange("instagram", event.target.value)
												}
												className="input-field"
												placeholder={t(
													"profile_editor.sections.social.placeholder",
												)}
											/>
										</div>
										<div>
											<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.social.twitter")}
											</label>
											<input
												type="text"
												value={draft.twitter}
												onChange={(event) =>
													handleDraftChange("twitter", event.target.value)
												}
												className="input-field"
												placeholder={t(
													"profile_editor.sections.social.placeholder",
												)}
											/>
										</div>
										<div>
											<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
												{t("profile_editor.sections.social.facebook")}
											</label>
											<input
												type="text"
												value={draft.facebook}
												onChange={(event) =>
													handleDraftChange("facebook", event.target.value)
												}
												className="input-field"
												placeholder={t(
													"profile_editor.sections.social.placeholder",
												)}
											/>
										</div>
									</div>
								</div>
								<div className="grid gap-4">
									<div className="surface-card rounded-3xl p-4 sm:p-5">
										<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
											{t("profile_editor.sections.other.title")}
										</p>
										<div className="mt-4 grid gap-3">
											<div className="flex items-center justify-between gap-3">
												<span className="text-sm text-[var(--text-muted)]">
													{t("profile_editor.sections.other.user_id")}
												</span>
												<span className="text-sm font-semibold">
													{profile?.profileId ?? userId ?? "Unknown"}
												</span>
											</div>
										</div>
									</div>
								</div>
							</div>

							<aside className="grid gap-4 lg:sticky lg:top-4">
								<div className="surface-card rounded-3xl p-4 sm:p-5">
									<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										{t("profile_editor.actions.title")}
									</p>
									<div className="mt-3 grid gap-2.5">
										<button
											type="button"
											onClick={handleSaveProfile}
											disabled={!canSave}
											className="btn-accent inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold disabled:cursor-not-allowed"
										>
											<Save className="h-4 w-4" />
											{isSaving
												? t("profile_editor.actions.saving")
												: t("profile_editor.actions.save")}
										</button>
										<button
											type="button"
											onClick={handleResetDraft}
											disabled={!hasChanges || isSaving}
											className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
										>
											<RefreshCw className="h-4 w-4" />
											{t("profile_editor.actions.reset")}
										</button>
									</div>
									<p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
										{t("profile_editor.actions.footer")}
									</p>
								</div>{" "}
							</aside>
						</div>
					</div>
				)}

				<div className="mt-1 flex flex-wrap items-center gap-3">
					<BackToSettings />
					<button
						onClick={handleLogout}
						className="btn-accent min-h-11 px-4 py-2.5 font-semibold"
					>
						{t("settings.logout")}
					</button>
				</div>
			</div>
		</section>
	);
}
