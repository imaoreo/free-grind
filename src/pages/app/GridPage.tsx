import { useAuth } from "../../contexts/AuthContext";
import { MapPin, SlidersHorizontal } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import { type BrowseCard, type ManagedOption, type ProfileDetail } from "./GridPage.types";
import { BrowseGrid } from "./gridpage/components/BrowseGrid";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import {
	getCachedBrowseCards,
	getCachedGenderOptions,
	getCachedProfileDetail,
	getCachedPronounOptions,
	setCachedBrowseCards,
	setCachedGenderOptions,
	setCachedProfileDetail,
	setCachedPronounOptions,
} from "./gridpage/cache";
import { isCurrentlyOnline } from "./gridpage/utils";
import { Avatar } from "../../components/ui/avatar";

type BrowseFilters = {
	onlineOnly: boolean;
	hasAlbum: boolean;
	photoOnly: boolean;
	faceOnly: boolean;
	notRecentlyChatted: boolean;
	fresh: boolean;
	rightNow: boolean;
	favorites: boolean;
	shuffle: boolean;
	hot: boolean;
};

const defaultBrowseFilters: BrowseFilters = {
	onlineOnly: false,
	hasAlbum: false,
	photoOnly: false,
	faceOnly: false,
	notRecentlyChatted: false,
	fresh: false,
	rightNow: false,
	favorites: false,
	shuffle: false,
	hot: false,
};

type BrowseFiltersDraft = {
	browseFilters?: Partial<BrowseFilters>;
	ageMin?: string;
	ageMax?: string;
	heightCmMin?: string;
	heightCmMax?: string;
	weightGramsMin?: string;
	weightGramsMax?: string;
	tribes?: number[];
	lookingFor?: number[];
	relationshipStatuses?: number[];
	bodyTypes?: number[];
	sexualPositions?: number[];
	meetAt?: number[];
	nsfwPics?: number[];
	tags?: string[];
};

function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function GridPage() {
	const PULL_REFRESH_THRESHOLD_PX = 72;
	const MAX_PULL_DISTANCE_PX = 120;
	const BROWSE_LOAD_TIMEOUT_MS = 15000;

	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const {
		geohash,
		isLoading: isLoadingPreferences,
	} = usePreferences();
	const navigate = useNavigate();
	const location = useLocation();
	const [cards, setCards] = useState<BrowseCard[]>([]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
	const [isLoadingMoreCards, setIsLoadingMoreCards] = useState(false);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [cardsError, setCardsError] = useState<string | null>(null);
	const [profileImageHash, setProfileImageHash] = useState<string | null>(null);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(false);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);
	const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(
		defaultBrowseFilters,
	);
	const [ageMin, setAgeMin] = useState("");
	const [ageMax, setAgeMax] = useState("");
	const [heightCmMin, setHeightCmMin] = useState("");
	const [heightCmMax, setHeightCmMax] = useState("");
	const [weightGramsMin, setWeightGramsMin] = useState("");
	const [weightGramsMax, setWeightGramsMax] = useState("");
	const [tribes, setTribes] = useState<number[]>([]);
	const [lookingFor, setLookingFor] = useState<number[]>([]);
	const [relationshipStatuses, setRelationshipStatuses] = useState<number[]>([]);
	const [bodyTypes, setBodyTypes] = useState<number[]>([]);
	const [sexualPositions, setSexualPositions] = useState<number[]>([]);
	const [meetAt, setMeetAt] = useState<number[]>([]);
	const [nsfwPics, setNsfwPics] = useState<number[]>([]);
	const [tags, setTags] = useState<string[]>([]);
	const [pullDistance, setPullDistance] = useState(0);
	const [isPullRefreshing, setIsPullRefreshing] = useState(false);
	const touchStartYRef = useRef<number | null>(null);
	const isPullingRef = useRef(false);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

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
		if (!userId) {
			setProfileImageHash(null);
			return;
		}

		let cancelled = false;

		const loadProfilePhoto = async () => {
			try {
				const parsed = await apiFunctions.getBrowseProfileMedia(userId);
				const mediaHashFromList = parsed.medias
					?.map((item) => item.mediaHash ?? "")
					.find((hash) => validateMediaHash(hash));
				const mediaHashFromProfile = parsed.profileImageMediaHash;
				const firstHash =
					mediaHashFromList ??
					(mediaHashFromProfile && validateMediaHash(mediaHashFromProfile)
						? mediaHashFromProfile
						: null);

				if (!cancelled) {
					setProfileImageHash(firstHash ?? null);
				}
			} catch {
				if (!cancelled) {
					setProfileImageHash(null);
				}
			}
		};

		void loadProfilePhoto();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, userId]);

	useEffect(() => {
		const safeState =
			typeof location.state === "object" && location.state !== null
				? (location.state as { browseFiltersDraft?: BrowseFiltersDraft })
				: {};
		const draft = safeState.browseFiltersDraft;
		if (!draft) {
			return;
		}

		setBrowseFilters({ ...defaultBrowseFilters, ...(draft.browseFilters ?? {}) });
		setAgeMin(typeof draft.ageMin === "string" ? draft.ageMin : "");
		setAgeMax(typeof draft.ageMax === "string" ? draft.ageMax : "");
		setHeightCmMin(typeof draft.heightCmMin === "string" ? draft.heightCmMin : "");
		setHeightCmMax(typeof draft.heightCmMax === "string" ? draft.heightCmMax : "");
		setWeightGramsMin(
			typeof draft.weightGramsMin === "string" ? draft.weightGramsMin : "",
		);
		setWeightGramsMax(
			typeof draft.weightGramsMax === "string" ? draft.weightGramsMax : "",
		);
		setTribes(isNumberArray(draft.tribes) ? draft.tribes : []);
		setLookingFor(isNumberArray(draft.lookingFor) ? draft.lookingFor : []);
		setRelationshipStatuses(
			isNumberArray(draft.relationshipStatuses) ? draft.relationshipStatuses : [],
		);
		setBodyTypes(isNumberArray(draft.bodyTypes) ? draft.bodyTypes : []);
		setSexualPositions(
			isNumberArray(draft.sexualPositions) ? draft.sexualPositions : [],
		);
		setMeetAt(isNumberArray(draft.meetAt) ? draft.meetAt : []);
		setNsfwPics(isNumberArray(draft.nsfwPics) ? draft.nsfwPics : []);
		setTags(isStringArray(draft.tags) ? draft.tags : []);
	}, [location.key, location.state]);

	const activeBrowseFilters = useMemo(() => {
		const next: Partial<BrowseFilters> = {};
		for (const [key, value] of Object.entries(browseFilters)) {
			if (value) {
				next[key as keyof BrowseFilters] = true;
			}
		}
		return next;
	}, [browseFilters]);

	const browseRequestFilters = useMemo(() => {
		const next: {
			onlineOnly?: boolean;
			photoOnly?: boolean;
			faceOnly?: boolean;
			hasAlbum?: boolean;
			notRecentlyChatted?: boolean;
			fresh?: boolean;
			rightNow?: boolean;
			favorites?: boolean;
			shuffle?: boolean;
			hot?: boolean;
			ageMin?: number;
			ageMax?: number;
			heightCmMin?: number;
			heightCmMax?: number;
			weightGramsMin?: number;
			weightGramsMax?: number;
			tribes?: string;
			lookingFor?: string;
			relationshipStatuses?: string;
			bodyTypes?: string;
			sexualPositions?: string;
			meetAt?: string;
			nsfwPics?: string;
			tags?: string;
		} = { ...activeBrowseFilters };

		const toOptionalNumber = (value: string): number | undefined => {
			const normalized = value.trim();
			if (!normalized) {
				return undefined;
			}

			const parsed = Number(normalized);
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		const toOptionalNumberCsv = (value: number[]): string | undefined => {
			if (value.length === 0) {
				return undefined;
			}

			const normalized = [...new Set(value)]
				.filter((item) => Number.isFinite(item))
				.join(",");

			return normalized.length > 0 ? normalized : undefined;
		};

		const toOptionalTagCsv = (value: string[]): string | undefined => {
			if (value.length === 0) {
				return undefined;
			}

			const normalized = [...new Set(value.map((item) => item.trim()))]
				.filter((item) => item.length > 0)
				.join(",");
			return normalized.length > 0 ? normalized : undefined;
		};

		const parsedAgeMin = toOptionalNumber(ageMin);
		const parsedAgeMax = toOptionalNumber(ageMax);
		const parsedHeightCmMin = toOptionalNumber(heightCmMin);
		const parsedHeightCmMax = toOptionalNumber(heightCmMax);
		const parsedWeightGramsMin = toOptionalNumber(weightGramsMin);
		const parsedWeightGramsMax = toOptionalNumber(weightGramsMax);

		if (typeof parsedAgeMin === "number" && parsedAgeMin >= 18) {
			next.ageMin = parsedAgeMin;
		}

		if (typeof parsedAgeMax === "number" && parsedAgeMax >= 18) {
			next.ageMax = parsedAgeMax;
		}

		if (typeof parsedHeightCmMin === "number") next.heightCmMin = parsedHeightCmMin;
		if (typeof parsedHeightCmMax === "number") next.heightCmMax = parsedHeightCmMax;
		if (typeof parsedWeightGramsMin === "number") next.weightGramsMin = parsedWeightGramsMin;
		if (typeof parsedWeightGramsMax === "number") next.weightGramsMax = parsedWeightGramsMax;

		const parsedTribes = toOptionalNumberCsv(tribes);
		const parsedLookingFor = toOptionalNumberCsv(lookingFor);
		const parsedRelationshipStatuses = toOptionalNumberCsv(relationshipStatuses);
		const parsedBodyTypes = toOptionalNumberCsv(bodyTypes);
		const parsedSexualPositions = toOptionalNumberCsv(sexualPositions);
		const parsedMeetAt = toOptionalNumberCsv(meetAt);
		const parsedNsfwPics = toOptionalNumberCsv(nsfwPics);
		const parsedTags = toOptionalTagCsv(tags);

		if (parsedTribes) next.tribes = parsedTribes;
		if (parsedLookingFor) next.lookingFor = parsedLookingFor;
		if (parsedRelationshipStatuses)
			next.relationshipStatuses = parsedRelationshipStatuses;
		if (parsedBodyTypes) next.bodyTypes = parsedBodyTypes;
		if (parsedSexualPositions) next.sexualPositions = parsedSexualPositions;
		if (parsedMeetAt) next.meetAt = parsedMeetAt;
		if (parsedNsfwPics) next.nsfwPics = parsedNsfwPics;
		if (parsedTags) next.tags = parsedTags;

		return next;
	}, [
		activeBrowseFilters,
		ageMax,
		ageMin,
		heightCmMax,
		heightCmMin,
		weightGramsMax,
		weightGramsMin,
		tribes,
		lookingFor,
		relationshipStatuses,
		bodyTypes,
		sexualPositions,
		meetAt,
		nsfwPics,
		tags,
	]);

	const hasActiveBrowseFilters = Object.keys(browseRequestFilters).length > 0;

	const browseCacheKey = useMemo(() => {
		if (!geohash) {
			return "";
		}
		const filtersKey = JSON.stringify(browseRequestFilters);
		return `${geohash}:${filtersKey}`;
	}, [browseRequestFilters, geohash]);

	const getBrowseCardsWithTimeout = useCallback(
		async (args: {
			geohash: string;
			page?: number;
			filters?: {
				onlineOnly?: boolean;
				photoOnly?: boolean;
				faceOnly?: boolean;
				hasAlbum?: boolean;
				notRecentlyChatted?: boolean;
				fresh?: boolean;
				rightNow?: boolean;
				favorites?: boolean;
				shuffle?: boolean;
				hot?: boolean;
				ageMin?: number;
				ageMax?: number;
				heightCmMin?: number;
				heightCmMax?: number;
				weightGramsMin?: number;
				weightGramsMax?: number;
				tribes?: string;
				lookingFor?: string;
				relationshipStatuses?: string;
				bodyTypes?: string;
				sexualPositions?: string;
				meetAt?: string;
				nsfwPics?: string;
				tags?: string;
			};
		}) => {
			return await new Promise<
				Awaited<ReturnType<typeof apiFunctions.getBrowseCards>>
			>((resolve, reject) => {
				const timeout = window.setTimeout(() => {
					reject(
						new Error(
							"Browse feed request timed out. Please check your connection and try again.",
						),
					);
				}, BROWSE_LOAD_TIMEOUT_MS);

				void apiFunctions
					.getBrowseCards(args)
					.then((result) => {
						window.clearTimeout(timeout);
						resolve(result);
					})
					.catch((error) => {
						window.clearTimeout(timeout);
						reject(error);
					});
			});
		},
		[apiFunctions, BROWSE_LOAD_TIMEOUT_MS],
	);

	const loadBrowseCards = useCallback(
		async ({
			page,
			preferCache = true,
			showLoadingState = true,
		}: {
			page?: number;
			preferCache?: boolean;
			showLoadingState?: boolean;
		} = {}) => {
			if (isLoadingPreferences) {
				return;
			}

			if (!geohash) {
				if (!isMountedRef.current) {
					return;
				}
				setIsLoadingCards(true);
				setCards([]);
				setCardsError(
					"Tap the location pin (📍) button above to set your location.",
				);
				setIsLoadingCards(false);
				return;
			}

			const cachedCards = preferCache ? getCachedBrowseCards(browseCacheKey) : null;
			if (!isMountedRef.current) {
				return;
			}

			setCardsError(null);

			if (cachedCards) {
				setCards(cachedCards);
				setIsLoadingCards(false);
			} else if (showLoadingState) {
				setIsLoadingCards(true);
			}

			try {
				const parsed = await getBrowseCardsWithTimeout({
					geohash,
					page,
					filters: browseRequestFilters,
				});

				if (!isMountedRef.current) {
					return;
				}

				setCards(parsed.cards);
				setCachedBrowseCards(browseCacheKey, parsed.cards);
				setNextPage(parsed.nextPage ?? null);
			} catch (error) {
				if (!isMountedRef.current) {
					return;
				}

				if (!cachedCards) {
					setCards([]);
					setCardsError(
						error instanceof Error
							? error.message
							: "Failed to load browse profiles",
					);
				}
			} finally {
				if (!isMountedRef.current) {
					return;
				}

				if (showLoadingState) {
					setIsLoadingCards(false);
				}
			}
		},
		[
			geohash,
			isLoadingPreferences,
			browseCacheKey,
			browseRequestFilters,
			getBrowseCardsWithTimeout,
		],
	);

	useEffect(() => {
		void loadBrowseCards();
	}, [loadBrowseCards]);

	const handleLoadMoreCards = async () => {
		if (!geohash || !nextPage || isLoadingMoreCards) return;
		setIsLoadingMoreCards(true);
		let cancelled = false;
		try {
			const parsed = await getBrowseCardsWithTimeout({
				geohash,
				page: nextPage,
				filters: browseRequestFilters,
			});
			if (!cancelled) {
				setCards((prev) => [...prev, ...parsed.cards]);
				setNextPage(parsed.nextPage ?? null);
			}
		} catch {
			// silently fail — existing cards remain
		} finally {
			if (!cancelled) setIsLoadingMoreCards(false);
		}
	};

	const handlePullRefresh = useCallback(() => {
		if (isLoadingCards || isLoadingMoreCards || isPullRefreshing) {
			return;
		}

		setIsPullRefreshing(true);
		void loadBrowseCards({ preferCache: false, showLoadingState: false }).finally(
			() => {
				if (!isMountedRef.current) {
					return;
				}
				setIsPullRefreshing(false);
			},
		);
	}, [isLoadingCards, isLoadingMoreCards, isPullRefreshing, loadBrowseCards]);

	const handlePageTouchStart = useCallback(
		(event: React.TouchEvent<HTMLElement>) => {
			if (window.scrollY > 0 || isLoadingCards || isPullRefreshing) {
				touchStartYRef.current = null;
				isPullingRef.current = false;
				return;
			}

			touchStartYRef.current = event.touches[0]?.clientY ?? null;
			isPullingRef.current = touchStartYRef.current !== null;
		},
		[isLoadingCards, isPullRefreshing],
	);

	const handlePageTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
		if (!isPullingRef.current) {
			return;
		}

		const startY = touchStartYRef.current;
		if (startY == null) {
			return;
		}

		const currentY = event.touches[0]?.clientY ?? startY;
		const delta = currentY - startY;

		if (delta <= 0) {
			setPullDistance(0);
			return;
		}

		event.preventDefault();
		setPullDistance(Math.min(MAX_PULL_DISTANCE_PX, delta * 0.55));
	}, []);

	const handlePageTouchEnd = useCallback(() => {
		if (pullDistance >= PULL_REFRESH_THRESHOLD_PX) {
			handlePullRefresh();
		}

		touchStartYRef.current = null;
		isPullingRef.current = false;
		setPullDistance(0);
	}, [handlePullRefresh, pullDistance]);

	const clearBrowseFilters = () => {
		setBrowseFilters(defaultBrowseFilters);
		setAgeMin("");
		setAgeMax("");
		setHeightCmMin("");
		setHeightCmMax("");
		setWeightGramsMin("");
		setWeightGramsMax("");
		setTribes([]);
		setLookingFor([]);
		setRelationshipStatuses([]);
		setBodyTypes([]);
		setSexualPositions([]);
		setMeetAt([]);
		setNsfwPics([]);
		setTags([]);
	};

	useEffect(() => {
		if (!activeProfileId) {
			setActiveProfile(null);
			setActiveProfileError(null);
			setIsLoadingActiveProfile(false);
			return;
		}

		let cancelled = false;

		const loadProfileDetails = async () => {
			const cachedProfile = getCachedProfileDetail(activeProfileId);

			if (cachedProfile) {
				setActiveProfile(cachedProfile);
				setIsLoadingActiveProfile(false);
			} else {
				setIsLoadingActiveProfile(true);
			}

			setActiveProfileError(null);

			try {
				const parsed = await apiFunctions.getProfileDetail(activeProfileId);

				if (!cancelled) {
					setActiveProfile(parsed);
					setCachedProfileDetail(activeProfileId, parsed);
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
	}, [activeProfileId, apiFunctions]);

	const profilePhotoUrl = useMemo(() => {
		if (!profileImageHash) {
			return null;
		}

		return getThumbImageUrl(profileImageHash, "75x75");
	}, [profileImageHash]);

	const onlineCount = useMemo(
		() => cards.filter((card) => isCurrentlyOnline(card.onlineUntil)).length,
		[cards],
	);

	const selectedBrowseCard = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return cards.find((card) => card.profileId === activeProfileId) ?? null;
	}, [activeProfileId, cards]);

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

	const handleSelectProfile = (profileId: string) => {
		if (window.matchMedia("(max-width: 639px)").matches) {
			navigate(`/profile/${profileId}`, {
				state: { returnTo: `${location.pathname}${location.search}` },
			});
			return;
		}

		setActiveProfileId(profileId);
	};

	const handleMessageProfile = (profileId: string) => {
		const nextParams = new URLSearchParams();
		nextParams.set("targetProfileId", profileId);
		nextParams.set("returnTo", `${location.pathname}${location.search}`);
		navigate(`/chat?${nextParams.toString()}`);
	};

	const activeFilterCount = Object.keys(browseRequestFilters).length;

	return (
		/* !px-0 removes the default app-screen padding to allow the BrowseGrid to span edge-to-edge */
		<section
			className="app-screen overflow-x-hidden !px-0"
			style={{ width: "100%" }}
			onTouchStart={handlePageTouchStart}
			onTouchMove={handlePageTouchMove}
			onTouchEnd={handlePageTouchEnd}
			onTouchCancel={handlePageTouchEnd}
		>
			{(pullDistance > 0 || isPullRefreshing) && (
				<div
					className="w-full flex items-center justify-center overflow-hidden text-xs font-medium text-[var(--text-muted)]"
					style={{ height: `${Math.max(20, pullDistance)}px` }}
				>
					{isPullRefreshing
						? "Refreshing feed..."
						: pullDistance >= PULL_REFRESH_THRESHOLD_PX
							? "Release to refresh"
							: "Pull to refresh"}
				</div>
			)}

			{/* Re-applying the standard app padding via --app-px only to the header container */}
			<div className="w-full px-[var(--app-px)]">
				<header className="mb-6 px-4">
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">Browse Profiles</h1>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
									<span
										className="h-2 w-2 rounded-full bg-zinc-400"
										aria-hidden="true"
									/>
									<span>{cards.length}</span>
								</div>
								<div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
									<span
										className="h-2 w-2 rounded-full bg-emerald-500"
										aria-hidden="true"
									/>
									<span>{onlineCount}</span>
								</div>
								<button
									type="button"
									onClick={() => navigate("/browse/location")}
									className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									<MapPin className="h-3.5 w-3.5" />
									<span className="hidden lg:inline">Location</span>
								</button>
                                <button
									type="button"
									onClick={() =>
										navigate("/browse/filters", {
											state: {
												browseFiltersDraft: {
													browseFilters,
													ageMin,
													ageMax,
													heightCmMin,
													heightCmMax,
													weightGramsMin,
													weightGramsMax,
													tribes,
													lookingFor,
													relationshipStatuses,
													bodyTypes,
													sexualPositions,
													meetAt,
													nsfwPics,
													tags,
												},
											},
										})
									}
									className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									<SlidersHorizontal className="h-3.5 w-3.5" />
									<span className="hidden lg:inline">Filter</span>
									{hasActiveBrowseFilters ? (
										<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
											{activeFilterCount}
										</span>
									) : null}
								</button>
								{hasActiveBrowseFilters ? (
									<button
										type="button"
										onClick={clearBrowseFilters}
										className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										Clear
									</button>
								) : null}
							</div>
						</div>
						<div className="flex flex-col items-end gap-2">
							<button
								type="button"
								onClick={() => navigate("/settings")}
								className="rounded-full transition-all hover:scale-[1.03]"
								aria-label="Open settings"
								title="Settings"
							>
								<Avatar
									src={profilePhotoUrl}
									alt="Your profile photo"
									className="h-11 w-11"
								/>
							</button>
						</div>
					</div>
					<p className="app-subtitle">
						Discover people near you and jump into chats from the main feed.
					</p>
				</header>
			</div>

			<BrowseGrid
				isLoadingCards={isLoadingCards}
				cardsError={cardsError}
				cards={cards}
				onSelectProfile={handleSelectProfile}
				onMessageProfile={handleMessageProfile}
				hasMore={nextPage !== null}
				isLoadingMore={isLoadingMoreCards}
				onLoadMore={() => {
					void handleLoadMoreCards();
				}}
			/>

			<ProfileDetailsModal
				isOpen={Boolean(activeProfileId)}
				onClose={() => setActiveProfileId(null)}
				onMessageProfile={handleMessageProfile}
				activeProfile={activeProfile}
				selectedBrowseCard={selectedBrowseCard}
				isLoadingActiveProfile={isLoadingActiveProfile}
				activeProfileError={activeProfileError}
				activeProfilePhotoHashes={activeProfilePhotoHashes}
				genderOptions={genderOptions}
				pronounOptions={pronounOptions}
			/>
		</section>
	);
}
