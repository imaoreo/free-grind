import { useEffect, useMemo, useState } from "react";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import z from "zod";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { validateMediaHash } from "../../utils/media";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import {
	getCachedGenderOptions,
	getCachedProfileDetail,
	getCachedPronounOptions,
	setCachedGenderOptions,
	setCachedProfileDetail,
	setCachedPronounOptions,
} from "./gridpage/cache";
import {
	type ManagedOption,
	type ProfileDetail,
} from "./GridPage.types";

const profileRouteParamsSchema = z.object({
	profileId: z.string().min(1),
});

export function GridProfilePage() {
	const navigate = useNavigate();
	const location = useLocation();
	const params = useParams();
	const [searchParams] = useSearchParams();
	const apiFunctions = useApiFunctions();
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(true);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
	const [isTappingProfile, setIsTappingProfile] = useState(false);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);

	const parsedParams = profileRouteParamsSchema.safeParse(params);
	const profileId = parsedParams.success ? parsedParams.data.profileId : null;
	const returnToFromState =
		typeof (location.state as { returnTo?: unknown } | null)?.returnTo ===
		"string"
			? ((location.state as { returnTo?: string }).returnTo ?? null)
			: null;
	const returnToFromQuery = searchParams.get("returnTo");
	const returnTo = returnToFromState ?? returnToFromQuery;
	const safeReturnTo =
		typeof returnTo === "string" &&
		returnTo.startsWith("/") &&
		!returnTo.startsWith("//")
			? returnTo
			: "/browse";

	useEffect(() => {
		const loadManagedOptions = async () => {
			const cachedGenders = getCachedGenderOptions();
			const cachedPronouns = getCachedPronounOptions();

			if (cachedGenders) {
				setGenderOptions(cachedGenders);
			}

			if (cachedPronouns) {
				setPronounOptions(cachedPronouns);
			}

			if (cachedGenders && cachedPronouns) {
				return;
			}

			try {
				const [genders, pronouns] = await Promise.all([
					apiFunctions.getManagedGenders(),
					apiFunctions.getManagedPronouns(),
				]);

				const nextGenderOptions = genders.map((item) => ({
					value: item.genderId,
					label: item.gender,
				}));
				setGenderOptions(nextGenderOptions);
				setCachedGenderOptions(nextGenderOptions);

				const nextPronounOptions = pronouns.map((item) => ({
					value: item.pronounId,
					label: item.pronoun,
				}));
				setPronounOptions(nextPronounOptions);
				setCachedPronounOptions(nextPronounOptions);
			} catch {
				if (!cachedGenders) {
					setGenderOptions([]);
				}
				if (!cachedPronouns) {
					setPronounOptions([]);
				}
			}
		};

		void loadManagedOptions();
	}, [apiFunctions]);

	useEffect(() => {
		if (!profileId) {
			setActiveProfile(null);
			setActiveProfileError("Invalid profile ID");
			setIsLoadingActiveProfile(false);
			return;
		}

		let cancelled = false;

		const loadProfileDetails = async () => {
			const cachedProfile = getCachedProfileDetail(profileId);

			if (cachedProfile) {
				setActiveProfile(cachedProfile);
				setIsLoadingActiveProfile(false);
			} else {
				setIsLoadingActiveProfile(true);
			}

			setActiveProfileError(null);

			try {
				const parsed = await apiFunctions.getProfileDetail(profileId);

				if (!cancelled) {
					setActiveProfile(parsed);
					setCachedProfileDetail(profileId, parsed);
				}
			} catch (error) {
				if (!cancelled) {
					if (!cachedProfile) {
						setActiveProfile(null);
						setActiveProfileError(
							error instanceof Error
								? error.message
								: "Failed to load profile details",
						);
					}
				}
			} finally {
				if (!cancelled) {
					setIsLoadingActiveProfile(false);
				}
			}
		};

		void loadProfileDetails();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, profileId]);

	const activeProfilePhotoHashes = useMemo(() => {
		if (!activeProfile) {
			return [];
		}

		const fromList = activeProfile.medias
			.map((item) => item.mediaHash ?? "")
			.filter((hash): hash is string => validateMediaHash(hash));

		const hashes = [...fromList];

		if (
			activeProfile.profileImageMediaHash &&
			validateMediaHash(activeProfile.profileImageMediaHash) &&
			!hashes.includes(activeProfile.profileImageMediaHash)
		) {
			hashes.unshift(activeProfile.profileImageMediaHash);
		}

		return hashes;
	}, [activeProfile]);

	const handleMessageProfile = (targetProfileId: string) => {
		const nextParams = new URLSearchParams();
		nextParams.set("targetProfileId", targetProfileId);
		nextParams.set("returnTo", safeReturnTo);
		navigate(`/chat?${nextParams.toString()}`);
	};

	const handleTapProfile = async (targetProfileId: string) => {
		if (isTappingProfile) {
			return;
		}

		setIsTappingProfile(true);
		try {
			const result = await apiFunctions.tap(targetProfileId);
			toast.success(result.isMutual ? "Tap sent. It's mutual." : "Tap sent");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to send tap");
		} finally {
			setIsTappingProfile(false);
		}
	};

	return (
		<ProfileDetailsModal
			variant="page"
			isOpen
			onClose={() => {
				navigate(safeReturnTo, { replace: true });
			}}
			onMessageProfile={handleMessageProfile}
			onTapProfile={handleTapProfile}
			isTappingProfile={isTappingProfile}
			activeProfile={activeProfile}
			selectedBrowseCard={null}
			isLoadingActiveProfile={isLoadingActiveProfile}
			activeProfileError={activeProfileError}
			activeProfilePhotoHashes={activeProfilePhotoHashes}
			genderOptions={genderOptions}
			pronounOptions={pronounOptions}
		/>
	);
}
