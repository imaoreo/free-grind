import { useAuth } from "../../contexts/useAuth";
import { MapPin, SlidersHorizontal, ListFilter } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decodeGeohash } from "../../utils/geohash";
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
import {
	type BrowseSortOption,
	loadBrowseFiltersDraft,
} from "./browse-filters-storage";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useBrowseFilters } from "./gridpage/hooks/useBrowseFilters";
import { useTapProfile } from "./gridpage/hooks/useTapProfile";

export function GridPage() {
	const { t } = useTranslation();
	const BROWSE_LOAD_TIMEOUT_MS = 15000;
	const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;

	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const {
		geohash,
		locationName,
		isLoading: isLoadingPreferences,
	} = usePreferences();
	const navigate = useNavigate();
	const location = useLocation();
	const persistedBrowseFilters = useMemo(() => loadBrowseFiltersDraft(), []);
	const [cards, setCards] = useState<BrowseCard[]>([]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
	const [isLoadingMoreCards, setIsLoadingMoreCards] = useState(false);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [cardsError, setCardsError] = useState<string | null>(null);
	const [profileImageHash, setProfileImageHash] = useState<string | null>(null);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(null);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(false);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(null);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);
	const isMountedRef = useRef(true);

	const {
		browseFilters,
		setBrowseFilters,
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
		sortBy,
		setSortBy,
		browseRequestFilters,
		hasActiveBrowseFilters,
		clearBrowseFilters,
	} = useBrowseFilters(persistedBrowseFilters);

	const {
		tappingProfileId,
		resolvedTapVisualState,
		hasSentTapRecently,
		handleTapProfile,
	} = useTapProfile({
		activeProfile,
		setActiveProfile,
		activeProfileId,
		tap: apiFunctions.tap,
		TAP_WINDOW_MS,
	});

	useEffect(() => {
		isMountedRef.current = true;
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

	const browseCacheKey = useMemo(() => {
		if (!geohash) {
			return "";
		}
		const filtersKey = JSON.stringify(browseRequestFilters);
		return `${geohash}:${filtersKey}`;
	}, [browseRequestFilters, geohash]);

	const getBrowseCardsWithTimeout = useCallback(
		async (args: Parameters<typeof apiFunctions.getBrowseCards>[0]) => {
			return await new Promise<
				Awaited<ReturnType<typeof apiFunctions.getBrowseCards>>
			>((resolve, reject) => {
				const timeout = window.setTimeout(() => {
					reject(
						new Error(
							t("browse_page.errors.load_timeout"),
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
					t("browse_page.errors.set_location"),
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
							: t("browse_page.errors.load_profiles"),
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

	useEffect(() => {
		if (!isLoadingCards || cardsError || isLoadingPreferences) {
			return;
		}

		const timeout = window.setTimeout(() => {
			if (!isMountedRef.current) {
				return;
			}
			setIsLoadingCards(false);
			setCardsError(
				t("browse_page.errors.loading_slow"),
			);
		}, BROWSE_LOAD_TIMEOUT_MS + 3000);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isLoadingCards, cardsError, isLoadingPreferences, BROWSE_LOAD_TIMEOUT_MS]);

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
								: t("browse_page.errors.load_profile_details"),
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

	const sortedCards = useMemo(() => {
		if (sortBy === "default") return cards;
		return [...cards].sort((a, b) => {
			if (sortBy === "distance") {
				const distA = a.distanceMeters ?? Infinity;
				const distB = b.distanceMeters ?? Infinity;
				return distA - distB;
			}
			if (sortBy === "age-asc") {
				const ageA = a.age ?? Infinity;
				const ageB = b.age ?? Infinity;
				return ageA - ageB;
			}
			if (sortBy === "age-desc") {
				const ageA = a.age ?? -Infinity;
				const ageB = b.age ?? -Infinity;
				return ageB - ageA;
			}
			if (sortBy === "popular") {
				const popA = a.isPopular ? 1 : 0;
				const popB = b.isPopular ? 1 : 0;
				if (popA !== popB) return popB - popA;
				const distA = a.distanceMeters ?? Infinity;
				const distB = b.distanceMeters ?? Infinity;
				return distA - distB;
			}
			if (sortBy === "name") {
				const nameA = a.displayName ?? "";
				const nameB = b.displayName ?? "";
				return nameA.localeCompare(nameB);
			}
			return 0;
		});
	}, [cards, sortBy]);

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
				state: {
					returnTo: `${location.pathname}${location.search}`,
					profileIds: sortedCards.map((c) => c.profileId),
				},
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

	const handleTriangleProfile = (targetProfileId: string) => {
		if (!geohash) {
			toast.error(t("browse_page.errors.location_required"));
			return;
		}

		try {
			const decoded = decodeGeohash(geohash);
			const latitude = (decoded.lat[0] + decoded.lat[1]) / 2;
			const longitude = (decoded.lon[0] + decoded.lon[1]) / 2;
			const distanceMeters =
				typeof activeProfile?.distance === "number" &&
				Number.isFinite(activeProfile.distance)
					? Math.round(activeProfile.distance)
					: null;

			if (distanceMeters !== null) {
				toast.success(
					t("browse_page.toasts.distance_info", {
						lat: latitude.toFixed(5),
						lon: longitude.toFixed(5),
						id: targetProfileId,
						distance: distanceMeters,
					}),
				);
				return;
			}

			toast.success(
				t("browse_page.toasts.distance_unavailable", {
					lat: latitude.toFixed(5),
					lon: longitude.toFixed(5),
					id: targetProfileId,
				}),
			);
		} catch {
			toast.error(t("browse_page.errors.location_read_failed"));
		}
	};

	const activeFilterCount = Object.keys(browseRequestFilters).length;

	return (
		/* !px-0 removes the default app-screen padding to allow the BrowseGrid to span edge-to-edge */
		<PullToRefreshContainer
			className="app-screen overflow-x-hidden !px-0"
			style={{ width: "100%" }}
			onRefresh={() =>
				loadBrowseCards({ preferCache: false, showLoadingState: false })
			}
			isDisabled={isLoadingCards || isLoadingMoreCards}
			refreshingLabel={t("browse_page.refreshing_feed")}
		>
			<header className="mb-2 px-[var(--app-px)] sm:px-4">
				<div className="sm:hidden">
					<div>
						<div className="mb-1 flex items-center gap-2">
							<button
								type="button"
								onClick={() => navigate("/settings")}
								className="shrink-0 rounded-full transition-all active:scale-95"
								aria-label={t("browse_page.open_settings")}
								title={t("browse_page.settings")}
							>
								<Avatar
									src={profilePhotoUrl}
									alt={t("browse_page.your_profile_photo")}
									className="h-11 w-11"
								/>
							</button>

							<button
								type="button"
								onClick={() => navigate("/browse/location")}
								className="inline-flex min-h-12 w-full items-center justify-start gap-2 rounded-2xl bg-[color-mix(in_srgb,var(--surface-2)_84%,transparent)] px-4 text-left text-base font-medium text-[var(--text-muted)] transition active:scale-[0.99] overflow-hidden"
							>
								<MapPin className="h-4 w-4 shrink-0" />
								<span className="truncate">
									{locationName || t("browse_page.current_location")}
								</span>
							</button>
						</div>

						<div className="-mx-[var(--app-px)] overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<div className="flex min-w-max items-center gap-3 px-[var(--app-px)] ml-auto">
								<button
									type="button"
									onClick={() =>
										navigate("/browse/filters", {
											state: {
												browseFiltersDraft: {
													sortBy,
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
									className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--surface-2)] px-5 text-sm font-semibold text-[var(--text)]"
								>
									<SlidersHorizontal className="h-4 w-4" />
									{hasActiveBrowseFilters ? (
										<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
											{activeFilterCount}
										</span>
									) : null}
								</button>

								<div className="relative inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--surface-2)] pl-4 pr-2 text-sm font-semibold text-[var(--text)]">
									<ListFilter className="mr-1.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
									<select
										value={sortBy}
										onChange={(e) => setSortBy(e.target.value as BrowseSortOption)}
										className="appearance-none bg-transparent cursor-pointer outline-none w-full h-full pr-3 py-3"
									>
										<option value="default">{t("browse_filters.sort.default")}</option>
										<option value="distance">{t("browse_filters.sort.distance")}</option>
										<option value="age-asc">{t("browse_filters.sort.youngest")}</option>
										<option value="age-desc">{t("browse_filters.sort.oldest")}</option>
										<option value="popular">{t("browse_filters.sort.popular")}</option>
										<option value="name">{t("browse_filters.sort.name_az")}</option>
									</select>
								</div>

								<button
									type="button"
									onClick={() =>
										setBrowseFilters((prev: typeof browseFilters) => ({
											...prev,
											onlineOnly: !prev.onlineOnly,
										}))
									}
									className={`inline-flex min-h-12 items-center justify-center rounded-full px-5 text-sm font-semibold transition ${browseFilters.onlineOnly ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--text)]"}`}
								>
									{t("browse_filters.options.online")}
								</button>

								{hasActiveBrowseFilters ? (
									<button
										type="button"
										onClick={clearBrowseFilters}
										className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--surface-2)] px-5 text-sm font-semibold text-[var(--text-muted)]"
									>
										{t("browse_filters.clear_all")}
									</button>
								) : null}
							</div>
						</div>
					</div>
				</div>

				<div className="hidden sm:block">
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">{t("browse_page.title")}</h1>
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
									className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] max-w-[200px]"
								>
									<MapPin className="h-3.5 w-3.5 shrink-0" />
									<span className="hidden lg:inline truncate">
										{locationName || t("browse_page.location")}
									</span>
								</button>
								<button
									type="button"
									onClick={() =>
										navigate("/browse/filters", {
											state: {
												browseFiltersDraft: {
													sortBy,
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
									<span className="hidden lg:inline">
										{t("browse_page.filter")}
									</span>
									{hasActiveBrowseFilters ? (
										<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
											{activeFilterCount}
										</span>
									) : null}
								</button>

								<div className="relative inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] pl-2.5 pr-1.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] focus-within:border-[var(--accent)] focus-within:text-[var(--text)]">
									<ListFilter className="mr-1 h-3.5 w-3.5 shrink-0" />
									<select
										value={sortBy}
										onChange={(e) => setSortBy(e.target.value as BrowseSortOption)}
										className="appearance-none bg-transparent cursor-pointer outline-none pr-3"
									>
										<option value="default">{t("browse_page.sort")}</option>
										<option value="distance">{t("browse_filters.sort.distance")}</option>
										<option value="age-asc">{t("browse_filters.sort.youngest")}</option>
										<option value="age-desc">{t("browse_filters.sort.oldest")}</option>
										<option value="popular">{t("browse_filters.sort.popular")}</option>
										<option value="name">{t("browse_filters.sort.name_az")}</option>
									</select>
								</div>

								{hasActiveBrowseFilters ? (
									<button
										type="button"
										onClick={clearBrowseFilters}
										className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										{t("browse_filters.clear_all")}
									</button>
								) : null}
							</div>
						</div>
						<div className="flex flex-col items-end gap-2">
							<button
								type="button"
								onClick={() => navigate("/settings")}
								className="rounded-full transition-all hover:scale-[1.03]"
								aria-label={t("browse_page.open_settings")}
								title={t("browse_page.settings")}
							>
								<Avatar
									src={profilePhotoUrl}
									alt={t("browse_page.your_profile_photo")}
									className="h-11 w-11"
								/>
							</button>
						</div>
					</div>
					<p className="app-subtitle">{t("browse_page.subtitle")}</p>
				</div>
			</header>

			<BrowseGrid
				isLoadingCards={isLoadingCards}
				cardsError={cardsError}
				cards={sortedCards}
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
				onTriangleProfile={handleTriangleProfile}
				onTapProfile={handleTapProfile}
				isTappingProfile={Boolean(tappingProfileId && tappingProfileId === activeProfileId)}
				isTapBlocked={hasSentTapRecently}
				tapVisualState={resolvedTapVisualState}
				activeProfile={activeProfile}
				selectedBrowseCard={selectedBrowseCard}
				isLoadingActiveProfile={isLoadingActiveProfile}
				activeProfileError={activeProfileError}
				activeProfilePhotoHashes={activeProfilePhotoHashes}
				genderOptions={genderOptions}
				pronounOptions={pronounOptions}
			/>
		</PullToRefreshContainer>
	);
}
