import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import z from "zod";
import { useApi } from "../../hooks/useApi";
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
	profileDetailResponseSchema,
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
	const { fetchRest } = useApi();
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(true);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
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
				const [gendersResponse, pronounsResponse] = await Promise.all([
					fetchRest("/public/v2/genders"),
					fetchRest("/v1/pronouns"),
				]);

				if (gendersResponse.status >= 200 && gendersResponse.status < 300) {
					const parsed = z
						.array(
							z.object({
								genderId: z.number(),
								gender: z.string(),
							}),
						)
						.parse(gendersResponse.json());
					const nextGenderOptions = parsed.map((item) => ({
						value: item.genderId,
						label: item.gender,
					}));
					setGenderOptions(nextGenderOptions);
					setCachedGenderOptions(nextGenderOptions);
				}

				if (
					pronounsResponse &&
					pronounsResponse.status >= 200 &&
					pronounsResponse.status < 300
				) {
					const parsed = z
						.array(
							z.object({
								pronounId: z.number(),
								pronoun: z.string(),
							}),
						)
						.parse(pronounsResponse.json());
					const nextPronounOptions = parsed.map((item) => ({
						value: item.pronounId,
						label: item.pronoun,
					}));
					setPronounOptions(nextPronounOptions);
					setCachedPronounOptions(nextPronounOptions);
				}
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
	}, [fetchRest]);

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
				const response = await fetchRest(`/v7/profiles/${profileId}`);

				if (response.status < 200 || response.status >= 300) {
					throw new Error(
						`Failed to load profile details (${response.status})`,
					);
				}

				const parsed = profileDetailResponseSchema.parse(response.json());

				if (!cancelled) {
					setActiveProfile(parsed.profiles[0]);
					setCachedProfileDetail(profileId, parsed.profiles[0]);
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
	}, [fetchRest, profileId]);

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

	return (
		<ProfileDetailsModal
			variant="page"
			isOpen
			onClose={() => {
				if (returnTo && returnTo.startsWith("/chat")) {
					navigate(returnTo, { replace: true });
					return;
				}
				navigate("/chat", { replace: true });
			}}
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
