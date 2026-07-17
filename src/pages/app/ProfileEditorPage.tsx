import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	RefreshCw,
	Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import z from "zod";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useAuth } from "../../contexts/useAuth";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { useManagedGenders, useManagedPronouns, useManagedTagCategories } from "../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { buildTagLabelMap } from "../../utils/tags";
import { BackToSettings } from "../../components/BackToSettings";
import { BottomDrawer } from "../../components/ui/bottom-drawer";
import { ToggleRow } from "../../components/ui/toggle-row";
import freegrindLogo from "../../images/freegrind-logo.webp";
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
import { ProfileEditorFormSections, type ToggleMultiValueKey } from "./profile-editor/ProfileEditorFormSections";
import { ProfilePictureDrawer, type ProfilePoolImage } from "./profile-editor/ProfilePictureDrawer";
import {
	MAX_GENDERS,
	MAX_PROFILE_PHOTOS,
	MAX_PROFILE_TAGS,
	MEDIA_MODERATION_STATE,
	type ProfileDraft,
	buildSquareThumbCoords,
	emptyDraft,
	parseMonthInput,
	parseNullableInteger,
	parseNullableHeightToCm,
	parseNullableWeightToGrams,
	normalizeTagList,
	profileSchema,
	profileToDraft,
} from "./profile-editor/profileEditorUtils";

// Grindr caps how many of each of these a profile can carry — enforced
// client-side here since the multi-select toggle is the only way to add one.
const MULTI_VALUE_MAX: Partial<Record<ToggleMultiValueKey, number>> = {
	genders: MAX_GENDERS,
	pronouns: 3,
	grindrTribes: 3,
	tribesImInto: 3,
};

// The curated inline quick-pick order (man, cis man, trans man, woman, cis
// woman, trans woman, non-binary) — genderId is stable across the API, unlike
// displayGroup ordering, which the server doesn't otherwise rank.
const DEFAULT_GENDER_ORDER = [1, 4, 5, 2, 6, 7, 3];

export function ProfileEditorPage() {
	const { t, i18n } = useTranslation();
	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const { unitsPreset } = usePreferences();
	const [profile, setProfile] = useState<z.infer<typeof profileSchema> | null>(
		null,
	);
	// Raw, un-stripped profile JSON as returned by the server. Used as the base
	// for full-profile-replace saves so fields our local schema doesn't know
	// about (travel plans, right-now status, etc.) aren't lost on save.
	const [rawProfile, setRawProfile] = useState<Record<string, any> | null>(
		null,
	);
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
	const [isSaving, setIsSaving] = useState(false);
	const [isSavingPhotos, setIsSavingPhotos] = useState(false);
	const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
	const [isPhotoDrawerOpen, setIsPhotoDrawerOpen] = useState(false);
	const [poolImages, setPoolImages] = useState<ProfilePoolImage[]>([]);
	const [isPoolLoading, setIsPoolLoading] = useState(false);
	const [poolError, setPoolError] = useState<string | null>(null);
	const [deletingPoolHash, setDeletingPoolHash] = useState<string | null>(null);
	const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
	const [pendingPhotoTakenOnGrindr, setPendingPhotoTakenOnGrindr] = useState(false);
	const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
	const [photoCrop, setPhotoCrop] = useState<Crop | undefined>(undefined);
	const [photoCompletedCrop, setPhotoCompletedCrop] = useState<PixelCrop | undefined>(undefined);
	const [isDraggingPhotoCrop, setIsDraggingPhotoCrop] = useState(false);
	const photoImgRef = useRef<HTMLImageElement | null>(null);
	const isDesktop = useDesktopBreakpoint();

	useEffect(() => {
		if (!pendingPhotoFile) {
			setPhotoPreviewUrl(null);
			setPhotoCrop(undefined);
			setPhotoCompletedCrop(undefined);
			return;
		}
		const url = URL.createObjectURL(pendingPhotoFile);
		setPhotoPreviewUrl(url);
		setPhotoCrop(undefined);
		setPhotoCompletedCrop(undefined);
		return () => URL.revokeObjectURL(url);
	}, [pendingPhotoFile]);

	// Square-only — this crop no longer produces the uploaded file (see
	// confirmPendingPhotoUpload), it only picks the thumbnail region, which the
	// server always renders as a square. Seeds photoCompletedCrop immediately
	// (not just photoCrop) so confirming without dragging still has a valid
	// pixel rect to derive thumbCoords from — react-image-crop only fires its
	// own onComplete after a user-driven drag.
	const handlePhotoImageLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
		const { width, height } = event.currentTarget;
		const percentCrop = centerCrop(
			makeAspectCrop({ unit: "%", width: 90 }, 1, width, height),
			width,
			height,
		);
		setPhotoCrop(percentCrop);
		setPhotoCompletedCrop({
			unit: "px",
			x: (percentCrop.x / 100) * width,
			y: (percentCrop.y / 100) * height,
			width: (percentCrop.width / 100) * width,
			height: (percentCrop.height / 100) * height,
		});
	}, []);

	// Tracks each photo's last-seen moderation state across reloads, so a
	// background poll can toast when one changes (e.g. pending -> approved)
	// instead of just silently updating the UI. Null until the first load.
	const previousModerationByHashRef = useRef<Map<string, number | null> | null>(null);

	const { data: managedGenders } = useManagedGenders();
	const { data: managedPronouns } = useManagedPronouns();
	const { data: managedTagCategories } = useManagedTagCategories(i18n.language);
	// The picker selects/stores tags by their catalog `key` (what the server
	// expects on save) — this resolves a key back to display text wherever a
	// tag needs to render as a chip (the "my tags" preview below).
	const tagLabelByKey = useMemo(
		() => buildTagLabelMap((managedTagCategories ?? []).flatMap((category) => category.tags)),
		[managedTagCategories],
	);

	// sortFilter ranks most genders (ascending = intended order); the rest
	// (sortFilter === null) just sort to the end, no special grouping.
	const genderOptions = useMemo(() => {
		const sorted = [...(managedGenders ?? [])].sort((a, b) => {
			const left = a.sortFilter ?? Number.POSITIVE_INFINITY;
			const right = b.sortFilter ?? Number.POSITIVE_INFINITY;
			return left - right;
		});
		return sorted.map((item) => ({ value: item.genderId, label: item.gender }));
	}, [managedGenders]);

	const defaultGenderIds = useMemo(() => {
		const groupOneIds = new Set(
			(managedGenders ?? [])
				.filter((item) => item.displayGroup === 1)
				.map((item) => item.genderId),
		);
		const ordered = DEFAULT_GENDER_ORDER.filter((id) => groupOneIds.has(id));
		const extra = [...groupOneIds].filter((id) => !DEFAULT_GENDER_ORDER.includes(id));
		return [...ordered, ...extra];
	}, [managedGenders]);

	const pronounOptions = useMemo(() => {
		if (!userId) return [];
		return managedPronouns?.map((item) => ({ value: item.pronounId, label: item.pronoun })) ?? [];
	}, [managedPronouns, userId]);

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

	const loadProfile = useCallback(async (options?: { silent?: boolean }) => {
		if (!userId) {
			setProfile(null);
			setIsLoadingProfile(false);
			return;
		}

		try {
			if (!options?.silent) {
				setIsLoadingProfile(true);
			}
			setProfileError(null);
			// Read through /v4/me/profile (the counterpart of the /v4 + /v3
			// "me/profile*" endpoints used to save edits below) rather than
			// /v7/profiles/:id — that's a different read path used for viewing
			// other people's profiles, and can lag behind writes made here.
			const raw = await apiFunctions.getMyOwnProfile();
			const rawProfileObject =
				raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
					? ((raw as { profiles: Record<string, any>[] }).profiles[0] ?? null)
					: (raw as Record<string, any> | null);
			const parsed = profileSchema.parse(rawProfileObject);
			setProfile(parsed);
			setRawProfile(rawProfileObject);

			const nextModerationByHash = new Map<string, number | null>();
			for (const item of parsed.medias ?? []) {
				if (item.mediaHash) {
					nextModerationByHash.set(item.mediaHash, item.state ?? null);
				}
			}
			const previous = previousModerationByHashRef.current;
			if (previous) {
				for (const [hash, prevState] of previous) {
					const nextState = nextModerationByHash.get(hash);
					if (nextState === undefined || nextState === prevState) {
						continue;
					}
					if (nextState === MEDIA_MODERATION_STATE.APPROVED) {
						toast.success(t("profile_editor.toasts.photo_approved", { defaultValue: "One of your photos was approved." }));
					} else if (nextState === MEDIA_MODERATION_STATE.REJECTED) {
						toast.error(t("profile_editor.toasts.photo_rejected", { defaultValue: "One of your photos was rejected." }));
					} else if (nextState === MEDIA_MODERATION_STATE.PENDING) {
						toast(t("profile_editor.toasts.photo_pending_again", { defaultValue: "One of your photos is pending review again." }));
					}
				}
			}
			previousModerationByHashRef.current = nextModerationByHash;
		} catch (error) {
			setProfile(null);
			setRawProfile(null);
			setProfileError(
				error instanceof Error ? error.message : t("profile_editor.error_load"),
			);
		} finally {
			setIsLoadingProfile(false);
		}
	}, [apiFunctions, userId, t]);

	useEffect(() => {
		void loadProfile();
	}, [loadProfile]);

	const hasPendingPhotoModeration = useMemo(
		() => (profile?.medias ?? []).some((item) => item.state === MEDIA_MODERATION_STATE.PENDING),
		[profile?.medias],
	);

	// Periodically re-check moderation status while this page stays open and
	// at least one photo is still pending review — reviews can land while
	// the user is sitting here, and a silent reload (no loading spinner) is
	// the only way to surface that without a manual refresh. Once nothing is
	// pending anymore there's nothing left to learn from polling, so it
	// stops. Slower while the tab is hidden since there's nothing to show.
	useEffect(() => {
		if (!userId || !hasPendingPhotoModeration) {
			return;
		}
		const intervalId = window.setInterval(() => {
			void loadProfile({ silent: true });
		}, document.hidden ? 60_000 : 20_000);
		return () => window.clearInterval(intervalId);
	}, [userId, hasPendingPhotoModeration, loadProfile]);

	useEffect(() => {
		setDraft(profileToDraft(profile, unitsPreset));
	}, [profile, unitsPreset]);

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

	const savedDraft = useMemo(() => profileToDraft(profile, unitsPreset), [profile, unitsPreset]);

	const hasProfileChanges = useMemo(
		() => JSON.stringify(draft) !== JSON.stringify(savedDraft),
		[draft, savedDraft],
	);

	const hasChanges = hasProfileChanges;

	const tagList = useMemo(
		() => normalizeTagList(draft.profileTagsText),
		[draft.profileTagsText],
	);

	const tagsError = useMemo(() => {
		if (tagList.length > MAX_PROFILE_TAGS) {
			return t("profile_editor.errors.max_selection", { count: MAX_PROFILE_TAGS });
		}
		return null;
	}, [tagList, t]);

	const profilePhotoHashes = useMemo(() => {
		const fromMedias = (profile?.medias ?? [])
			.map((item) => item.mediaHash ?? "")
			.filter((hash): hash is string => validateMediaHash(hash));

		const hashes = [...fromMedias];

		// profileImageMediaHash can lag behind medias after deleting every
		// photo — the server doesn't always clear it once medias is empty —
		// so only trust it as a primary-photo fallback when at least one real
		// media entry backs it up. Otherwise a deleted photo keeps reappearing
		// here even though medias correctly reports none left.
		if (
			hashes.length > 0 &&
			profile?.profileImageMediaHash &&
			validateMediaHash(profile.profileImageMediaHash) &&
			!hashes.includes(profile.profileImageMediaHash)
		) {
			hashes.unshift(profile.profileImageMediaHash);
		}

		return hashes.slice(0, MAX_PROFILE_PHOTOS);
	}, [profile?.medias, profile?.profileImageMediaHash]);

	const photoModerationByHash = useMemo(() => {
		const map = new Map<string, { state: number | null; reason: string | null }>();
		for (const item of profile?.medias ?? []) {
			if (item.mediaHash) {
				map.set(item.mediaHash, { state: item.state ?? null, reason: item.reason ?? null });
			}
		}
		return map;
	}, [profile?.medias]);

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

		if (value.length > 15) {
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

	const canSave = hasChanges && !isSaving && !displayNameError && !aboutMeError && !tagsError;

	const handleDraftChange = <K extends keyof ProfileDraft>(
		key: K,
		value: ProfileDraft[K],
	) => {
		setDraft((current) => ({ ...current, [key]: value }));
	};

	const toggleMultiValue = (key: ToggleMultiValueKey, value: number) => {
		setDraft((current) => {
			const currentValues = current[key] as number[];
			const isSelected = currentValues.includes(value);
			const max = MULTI_VALUE_MAX[key];
			if (!isSelected && max != null && currentValues.length >= max) {
				toast.error(t("profile_editor.errors.max_selection", { count: max }));
				return current;
			}
			return {
				...current,
				[key]: isSelected
					? currentValues.filter((item) => item !== value)
					: [...currentValues, value].sort((left, right) => left - right),
			};
		});
	};

	const handleSaveProfile = async () => {
		if (!userId || !canSave) {
			return;
		}

		setIsSaving(true);

		try {
			if (hasProfileChanges) {
				const payload: Record<string, any> = {};

				// Helper to compare and add simple values
				const addIfChanged = (key: keyof ProfileDraft, payloadKey: string, transform: (v: any) => any = (v) => v) => {
					const draftValue = transform(draft[key]);
					const savedValue = transform(savedDraft[key]);
					if (JSON.stringify(draftValue) !== JSON.stringify(savedValue)) {
						payload[payloadKey] = draftValue;
					}
				};

				addIfChanged("displayName", "displayName", (v) => v.trim());
				addIfChanged("aboutMe", "aboutMe", (v) => v.trim() || null);
				addIfChanged("showAge", "showAge");
				addIfChanged("showDistance", "showDistance");
				addIfChanged("age", "age", parseNullableInteger);
				addIfChanged("height", "height", (v) => parseNullableHeightToCm(v, unitsPreset));
				addIfChanged("weight", "weight", (v) => parseNullableWeightToGrams(v, unitsPreset));
				addIfChanged("ethnicity", "ethnicity", parseNullableInteger);
				addIfChanged("bodyType", "bodyType", parseNullableInteger);
				addIfChanged("showPosition", "showPosition");
				addIfChanged("sexualPosition", "sexualPosition", parseNullableInteger);
				addIfChanged("showTribes", "showTribes");
				addIfChanged("grindrTribes", "grindrTribes");
				addIfChanged("tribesImInto", "tribesImInto");
				addIfChanged("relationshipStatus", "relationshipStatus", parseNullableInteger);
				addIfChanged("lookingFor", "lookingFor");
				addIfChanged("meetAt", "meetAt");
				addIfChanged("nsfw", "nsfw", parseNullableInteger);
				addIfChanged("genders", "genders");
				addIfChanged("pronouns", "pronouns");
				addIfChanged("hivStatus", "hivStatus", parseNullableInteger);
				addIfChanged("lastTestedDate", "lastTestedDate", parseMonthInput);
				addIfChanged("sexualHealth", "sexualHealth");
				addIfChanged("vaccines", "vaccines");

				// Handle tags separately due to different structure — tagList
				// already holds catalog keys (see TagsPickerDialog), which is what
				// the server expects here too.
				const savedTags = profile?.profileTags ?? [];
				if (JSON.stringify(tagList) !== JSON.stringify(savedTags)) {
					payload.profileTags = tagList;
				}

				// Handle social networks selectively
				const social: Record<string, any> = {};
				if (draft.instagram.trim() !== (profile?.socialNetworks?.instagram?.userId ?? "")) {
					social.instagram = { userId: draft.instagram.trim() || null };
				}
				if (draft.twitter.trim() !== (profile?.socialNetworks?.twitter?.userId ?? "")) {
					social.twitter = { userId: draft.twitter.trim() || null };
				}
				if (draft.facebook.trim() !== (profile?.socialNetworks?.facebook?.userId ?? "")) {
					social.facebook = { userId: draft.facebook.trim() || null };
				}

				if (Object.keys(social).length > 0) {
					payload.socialNetworks = social;
				}

				if (Object.keys(payload).length > 0) {
					// Full replace instead of PATCH: the server silently ignores
					// explicit nulls meant to clear a field (e.g. bodyType/ethnicity
					// back to "not set") on the partial-update endpoint. Merging
					// onto the last-fetched raw profile keeps fields we don't model
					// (travel plans, right-now status, etc.) intact.
					const mergedProfile: Record<string, any> = {
						...rawProfile,
						...payload,
					};
					if (payload.socialNetworks) {
						mergedProfile.socialNetworks = {
							...rawProfile?.socialNetworks,
							...payload.socialNetworks,
						};
					}

					await apiFunctions.replaceMyProfile(mergedProfile);

					setRawProfile(mergedProfile);
					// Update local profile state immediately
					setProfile((current) => {
						if (!current) return null;
						return {
							...current,
							...payload,
						};
					});
				}
			}

			// Keeps the grid/chat header avatar, account switcher, and the HIV
			// test reminder in sync with whatever just changed here, instead of
			// waiting out useMyOwnProfile's 5-minute staleTime.
			void queryClient.invalidateQueries({ queryKey: ["my-own-profile"] });

			toast.success(t("profile_editor.toasts.updated"));
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

				// The grid/chat header avatar and account switcher read
				// useMyOwnProfile's shared cache — without invalidating it here
				// they'd keep showing a deleted/old photo until its 5-minute
				// staleTime lapses.
				void queryClient.invalidateQueries({ queryKey: ["my-own-profile"] });

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

	// Picking a file always happens from inside the picture drawer now — it
	// only adds the upload to the server-side pool, it doesn't select it into
	// the profile's photo slots (see uploadPhotoFile), so there's no need to
	// gate this on the slot count the way the old direct-upload flow did.
	const handleDrawerUploadFile = (file: File) => {
		if (!file.type.startsWith("image/")) {
			toast.error(t("profile_editor.toasts.error_upload_type"));
			return;
		}

		setPendingPhotoTakenOnGrindr(false);
		setPendingPhotoFile(file);
	};

	const loadPoolImages = useCallback(async () => {
		setIsPoolLoading(true);
		setPoolError(null);
		try {
			const images = await apiFunctions.getProfileImages();
			setPoolImages(images);
		} catch (error) {
			setPoolError(
				error instanceof Error ? error.message : t("profile_editor.toasts.error_photos"),
			);
		} finally {
			setIsPoolLoading(false);
		}
	}, [apiFunctions, t]);

	useEffect(() => {
		if (isPhotoDrawerOpen) {
			void loadPoolImages();
		}
	}, [isPhotoDrawerOpen, loadPoolImages]);

	const handleAddSelectedImages = useCallback(
		async (hashes: string[]) => {
			const newHashes = hashes.filter(
				(hash) => validateMediaHash(hash) && !profilePhotoHashes.includes(hash),
			);
			if (newHashes.length === 0) {
				return;
			}
			const remainingSlots = MAX_PROFILE_PHOTOS - profilePhotoHashes.length;
			if (remainingSlots <= 0) {
				toast.error(t("profile_editor.toasts.error_photo_limit"));
				return;
			}
			await persistProfilePhotos(
				[...profilePhotoHashes, ...newHashes.slice(0, remainingSlots)],
				{ successMessage: t("profile_editor.toasts.photo_added") },
			);
			setIsPhotoDrawerOpen(false);
		},
		[profilePhotoHashes, persistProfilePhotos, t],
	);

	// Deleting from the drawer is a real server-side delete (unlike removing a
	// photo from the grid below, which only unlinks it) — if the image being
	// deleted also happens to be one of the profile's active slots, it has to
	// be unlinked from there in the same step so the profile doesn't keep
	// pointing at a now-nonexistent hash.
	const handleDeletePoolImage = useCallback(
		async (hash: string) => {
			setDeletingPoolHash(hash);
			try {
				if (profilePhotoHashes.includes(hash)) {
					await persistProfilePhotos(
						profilePhotoHashes.filter((currentHash) => currentHash !== hash),
						{ deletedHashes: [hash], successMessage: t("profile_photo_drawer.deleted") },
					);
				} else {
					await apiFunctions.deleteMyProfileImages([hash]);
					toast.success(t("profile_photo_drawer.deleted"));
				}
				// The pool endpoint only ever returns up to 10 images, so deleting
				// one can bring an older image that was previously cut off back
				// into view — a local filter of the current list can't reveal
				// that, only a full reload can.
				await loadPoolImages();
			} catch (error) {
				const message =
					error instanceof Error ? error.message : t("profile_editor.toasts.error_photos");
				toast.error(message);
			} finally {
				setDeletingPoolHash(null);
			}
		},
		[apiFunctions, persistProfilePhotos, profilePhotoHashes, t, loadPoolImages],
	);

	const cancelPendingPhotoUpload = () => {
		if (isUploadingPhoto) {
			return;
		}
		setPendingPhotoFile(null);
	};

	const uploadPhotoFile = async (file: File, thumbCoordsOverride?: string) => {
		setIsUploadingPhoto(true);

		try {
			const body = new Uint8Array(await file.arrayBuffer());
			const thumbCoords = thumbCoordsOverride ?? (await buildSquareThumbCoords(file));

			const uploadPaths = [
				`/v4/media/upload?thumbCoords=${encodeURIComponent(thumbCoords)}&takenOnGrindr=${pendingPhotoTakenOnGrindr}`,
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

			// Uploading only lands the image in the server-side pool — it doesn't
			// select it into a profile slot. The drawer reappears (isPhotoDrawerOpen
			// stays true) once pendingPhotoFile clears below, showing the new image
			// as a pickable, not-yet-used tile.
			setPoolImages((prev) => [
				{ mediaHash: uploadedHash, type: 0, state: MEDIA_MODERATION_STATE.PENDING },
				...prev.filter((image) => image.mediaHash !== uploadedHash),
			]);
			toast.success(t("profile_editor.toasts.photo_uploaded"));
			setPendingPhotoFile(null);
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

	// The crop selection is only used to tell the server which square region
	// to render the thumbnail from (thumbCoords) — the uploaded file itself is
	// always the original, unmodified image, never client-side cropped.
	const confirmPendingPhotoUpload = async () => {
		if (!pendingPhotoFile) return;

		let thumbCoords: string | undefined;
		if (photoCompletedCrop?.width && photoCompletedCrop.height && photoImgRef.current) {
			const img = photoImgRef.current;
			const scaleX = img.naturalWidth / img.width;
			const scaleY = img.naturalHeight / img.height;
			const left = Math.round(photoCompletedCrop.x * scaleX);
			const top = Math.round(photoCompletedCrop.y * scaleY);
			const right = Math.round((photoCompletedCrop.x + photoCompletedCrop.width) * scaleX);
			const bottom = Math.round((photoCompletedCrop.y + photoCompletedCrop.height) * scaleY);
			thumbCoords = `${bottom},${left},${right},${top}`;
		}

		await uploadPhotoFile(pendingPhotoFile, thumbCoords);
	};

	// Removing a photo here only unlinks it from the profile's active slots
	// (plain PUT) — the underlying upload stays on the server and can still be
	// picked again from the picture drawer. Permanently deleting it from the
	// server is a separate, explicit action there (handleDeletePoolImage).
	const handleRemovePhoto = async (hash: string) => {
		if (!validateMediaHash(hash) || isSavingPhotos || isUploadingPhoto) {
			return;
		}

		await persistProfilePhotos(
			profilePhotoHashes.filter((currentHash) => currentHash !== hash),
			{
				successMessage: t("profile_editor.toasts.photo_removed"),
			},
		);
	};

	const handleReorderPhotos = async (newHashes: string[]) => {
		if (isSavingPhotos || isUploadingPhoto) return;
		await persistProfilePhotos(newHashes, {
			successMessage: t("profile_editor.toasts.photos_reordered"),
		});
	};

	const handleResetDraft = () => {
		setDraft(savedDraft);
	};

	return (
		<section className="app-screen">
			<div className="mx-auto grid w-full max-w-[1180px] gap-6">
				<header>
					<BackToSettings />
					<h1 className="app-title mb-1">{t("profile_editor.title")}</h1>
					<p className="app-subtitle">{t("profile_editor.subtitle")}</p>
				</header>

				{isLoadingProfile && !profile ? (
					<div className="surface-card p-5 sm:p-6">
						<p className="text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.loading")}
						</p>
					</div>
				) : profileError && !profile ? (
					<div className="surface-card p-5 sm:p-6">
						<p className="text-sm font-semibold">
							{t("profile_editor.error_load")}
						</p>
						<p className="mt-2 text-sm text-[var(--text-muted)]">
							{profileError}
						</p>
					</div>
				) : (
					<div className="grid gap-6">
						<div className="surface-card overflow-hidden">
							<div className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
								<div className="relative h-16 w-16 shrink-0 sm:h-20 sm:w-20">
									{profilePhotoHashes[0] ? (
										<img
											src={getThumbImageUrl(profilePhotoHashes[0], "320x320")}
											alt={draftDisplayName}
											className="h-full w-full rounded-full object-cover shadow-sm"
										/>
									) : (
										<div className="flex h-full w-full items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-[var(--accent-contrast)] shadow-sm sm:text-2xl">
											{draftInitials}
										</div>
									)}
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

							<div className="border-t border-[var(--border)] px-4 pt-3 pb-4 sm:px-5 sm:pb-5">
								<div className="mb-1.5 flex items-center justify-between gap-3">
									<p className="text-xs text-[var(--text-muted)]">
										{t("profile_editor.completion_signals", {
											count: completionCount,
											total: completionChecklist.length,
										})}
									</p>
									<p className="text-xs font-bold">{completionPercent}%</p>
								</div>
								<div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
									<div
										className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
										style={{ width: `${completionPercent}%` }}
									/>
								</div>
							</div>
						</div>

						<div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)] lg:items-start">
							<ProfileEditorFormSections
								draft={draft}
								unitsPreset={unitsPreset}
								onDraftChange={handleDraftChange}
								onToggleMultiValue={toggleMultiValue}
								displayNameError={displayNameError}
								aboutMeError={aboutMeError}
								tagsError={tagsError}
								tagList={tagList}
								tagLabelByKey={tagLabelByKey}
								profilePhotoHashes={profilePhotoHashes}
								photoModerationByHash={photoModerationByHash}
								isSavingPhotos={isSavingPhotos}
								isUploadingPhoto={isUploadingPhoto}
								isDesktop={isDesktop}
								onOpenPhotoDrawer={() => setIsPhotoDrawerOpen(true)}
								onRemovePhoto={handleRemovePhoto}
								onReorderPhotos={handleReorderPhotos}
								profileId={profile?.profileId ?? userId}
								ethnicityOptions={ethnicityOptions}
								bodyTypeOptions={bodyTypeOptions}
								positionOptions={positionOptions}
								relationshipStatusOptions={relationshipStatusOptions}
								tribeOptions={tribeOptions}
								lookingForOptions={lookingForOptions}
								meetAtOptions={meetAtOptions}
								nsfwOptions={nsfwOptions}
								genderOptions={genderOptions}
								defaultGenderIds={defaultGenderIds}
								pronounOptions={pronounOptions}
								hivStatusOptions={hivStatusOptions}
								sexualHealthOptions={sexualHealthOptions}
								vaccineOptions={vaccineOptions}
							/>

							<aside className="grid gap-3 lg:sticky lg:top-4">
								<div className="surface-card p-4">
									<p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
										{t("profile_editor.actions.title")}
									</p>
									<div className="grid gap-2">
										<button
											type="button"
											onClick={handleSaveProfile}
											disabled={!canSave}
											className="btn-accent inline-flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
											className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
										>
											<RefreshCw className="h-4 w-4" />
											{t("profile_editor.actions.reset")}
										</button>
									</div>
									{hasChanges && (
										<p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
											{t("profile_editor.actions.footer")}
										</p>
									)}
								</div>
							</aside>
						</div>
					</div>
				)}
			</div>
			{pendingPhotoFile ? (
				<BottomDrawer
					title={t("profile_editor.photo_upload.title")}
					onClose={cancelPendingPhotoUpload}
					onConfirm={() => void confirmPendingPhotoUpload()}
					confirmLabel={t("profile_editor.photo_upload.confirm")}
					isProcessing={isUploadingPhoto}
					isDesktop={isDesktop}
				>
					<div className="flex min-h-0 flex-1 flex-col">
						<div className="min-h-0 flex-1 overflow-y-auto">
							{photoPreviewUrl && (
								<div className="px-3 pb-3">
									<div className="flex justify-center">
										<style>{`
											@keyframes photo-logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
											.photo-logo-shine { animation: photo-logo-shine 2.8s ease-in-out infinite; }
											.photo-crop .ReactCrop__crop-mask { display: none !important; } .photo-crop .ReactCrop__crop-selection { background-image: none !important; animation: none !important; outline: none !important; border: 3px solid rgba(255,255,255,0.6) !important; border-radius: 11px !important; box-shadow: 0 0 0 9999px rgba(0,0,0,0.5) !important; }
											.photo-crop .ord-n, .photo-crop .ord-s, .photo-crop .ord-e, .photo-crop .ord-w { display: none !important; }
											.photo-crop .ReactCrop__drag-handle { background: transparent !important; border: none !important; width: 15px !important; height: 15px !important; }
											.photo-crop .ord-nw { transform: translate(4px, 4px) !important; border-top: 2px solid white !important; border-left: 2px solid white !important; border-top-left-radius: 4px !important; }
											.photo-crop .ord-ne { transform: translate(-4px, 4px) !important; border-top: 2px solid white !important; border-right: 2px solid white !important; border-top-right-radius: 4px !important; }
											.photo-crop .ord-sw { transform: translate(4px, -4px) !important; border-bottom: 2px solid white !important; border-left: 2px solid white !important; border-bottom-left-radius: 4px !important; }
											.photo-crop .ord-se { transform: translate(-4px, -4px) !important; border-bottom: 2px solid white !important; border-right: 2px solid white !important; border-bottom-right-radius: 4px !important; }
										`}</style>
										<div className="relative rounded-xl border border-[var(--border)] overflow-hidden">
											<ReactCrop
												crop={photoCrop}
												aspect={1}
												onChange={(c) => { setIsDraggingPhotoCrop(true); setPhotoCrop(c); }}
												onComplete={(c) => { setIsDraggingPhotoCrop(false); setPhotoCompletedCrop(c); }}
												ruleOfThirds={isDraggingPhotoCrop}
												minWidth={150}
												minHeight={150}
												className="photo-crop ReactCrop--no-animate"
												style={{ maxHeight: "45dvh", display: "block" }}
											>
												<img
													ref={photoImgRef}
													src={photoPreviewUrl}
													alt="Preview"
													className="block"
													style={{ maxHeight: "45dvh" }}
													onLoad={handlePhotoImageLoad}
												/>
											</ReactCrop>
											{pendingPhotoTakenOnGrindr && photoCrop && (
												<div
													className="absolute inline-flex items-center gap-1.5 pointer-events-none"
													style={{
														left: `calc(${photoCrop.unit === "%" ? photoCrop.x + "%" : photoCrop.x + "px"} + 10px)`,
														top: `calc(${photoCrop.unit === "%" ? (photoCrop.y + photoCrop.height) + "%" : (photoCrop.y + photoCrop.height) + "px"} - 10px)`,
														transform: "translateY(-100%)",
													}}
												>
													<img src={freegrindLogo} alt="" className="h-5 w-5 rounded-full photo-logo-shine" />
													<span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
														<span>{t("chat.time.just_now", { defaultValue: "just now" })}</span>
													</span>
												</div>
											)}
										</div>
									</div>
								</div>
							)}
						</div>
						<div className="shrink-0 px-3 pb-3 pt-2">
							<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
								<ToggleRow
									checked={pendingPhotoTakenOnGrindr}
									onChange={setPendingPhotoTakenOnGrindr}
									label={t("profile_editor.photo_upload.taken_on_grindr")}
									description={t("profile_editor.photo_upload.taken_on_grindr_description")}
								/>
							</div>
						</div>
					</div>
				</BottomDrawer>
			) : null}
			{isPhotoDrawerOpen && !pendingPhotoFile ? (
				<ProfilePictureDrawer
					images={poolImages}
					isLoading={isPoolLoading}
					error={poolError}
					onRetry={() => void loadPoolImages()}
					usedHashes={profilePhotoHashes}
					remainingSlots={Math.max(0, MAX_PROFILE_PHOTOS - profilePhotoHashes.length)}
					isSelecting={isSavingPhotos}
					onAddSelectedImages={handleAddSelectedImages}
					deletingHash={deletingPoolHash}
					onDeleteImage={handleDeletePoolImage}
					onUploadFile={handleDrawerUploadFile}
					onClose={() => setIsPhotoDrawerOpen(false)}
					isDesktop={isDesktop}
				/>
			) : null}
		</section>
	);
}
