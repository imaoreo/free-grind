import { useAuth } from "../../contexts/useAuth";
import { MapPin, SlidersHorizontal, ListFilter, Star, Plane, Droplet, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
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
	getCachedBlockedProfileIds,
	getCachedOwnProfilePhotoHash,
	setCachedBrowseCards,
	setCachedGenderOptions,
	setCachedProfileDetail,
	setCachedPronounOptions,
	setCachedBlockedProfileIds,
	setCachedOwnProfilePhotoHash,
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
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { useManagedGenders, useManagedPronouns, useBlockedProfileIds, useBlockProfile, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import {
	getChatContactIndexForProfiles,
	indexChatContactRecordsByProfileId,
	upsertChatContactIndexFromGrid,
} from "../../services/chatContactIndex";
import type { ChatContactIndexRecord } from "../../types/chat-contact-index";
import { appLog } from "../../utils/logger";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { LoadingState } from "../../components/ui/states";
import { cn } from "../../utils/cn";
import { DEMO_CARDS, DEMO_CHAT_STATUS, SHOW_DEMO_DATA } from "./gridpage/demoData";

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
const SKIP_UNBLOCK_CONFIRM_KEY = "profile_skip_unblock_confirm";

export function GridPage() {
	const { t } = useTranslation();
	const BROWSE_LOAD_TIMEOUT_MS = 15000;
	const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;

	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const {
		geohash,
		locationName,
		useAutoLocation,
		setPreferences,
		isLoading: isLoadingPreferences,
		showDebugInfo,
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

	const { data: managedGenders } = useManagedGenders();
	const { data: managedPronouns } = useManagedPronouns();
	const { data: blockedProfileIdsData } = useBlockedProfileIds();
	const { mutateAsync: blockProfileMutation, isPending: isBlockingProfile } = useBlockProfile();
	const { mutateAsync: unblockProfileMutation, isPending: isUnblockingProfile } = useUnblockProfile();

	const genderOptions = useMemo(() => {
		return managedGenders?.map((item) => ({
			value: item.genderId,
			label: item.gender,
		})) ?? [];
	}, [managedGenders]);

	const pronounOptions = useMemo(() => {
		return managedPronouns?.map((item) => ({
			value: item.pronounId,
			label: item.pronoun,
		})) ?? [];
	}, [managedPronouns]);

	const [chatContactIndexByProfileId, setChatContactIndexByProfileId] = useState<
		Record<string, ChatContactIndexRecord>
	>({});

	const blockedProfileIds = useMemo(() => new Set(blockedProfileIdsData ?? []), [blockedProfileIdsData]);

	const [mutatingFavoriteProfileId, setMutatingFavoriteProfileId] = useState<string | null>(
		null,
	);
	const [pendingProfileConfirm, setPendingProfileConfirm] = useState<{
		action: "block" | "unblock";
		profileId: string;
	} | null>(null);
	const [dontAskAgainChecked, setDontAskAgainChecked] = useState(false);
	const [skipBlockConfirm, setSkipBlockConfirm] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem(SKIP_BLOCK_CONFIRM_KEY) === "true";
	});
	const [skipUnblockConfirm, setSkipUnblockConfirm] = useState(() => {
		if (typeof window === "undefined") {
			return false;
		}
		return localStorage.getItem(SKIP_UNBLOCK_CONFIRM_KEY) === "true";
	});
	const isMountedRef = useRef(true);
	const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
	const [debugLoadSource, setDebugLoadSource] = useState<"cache" | "network" | null>(null);
	const [initialLocationChecked, setInitialLocationChecked] = useState(false);
	const [isSearchOpen, setIsSearchOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [favoriteNotes, setFavoriteNotes] = useState<Array<{ notes: string; phoneNumber: string; counterpartyId: string }>>([]);
	const [isFetchingNotes, setIsFetchingNotes] = useState(false);
	const [hasAttemptedFetchNotes, setHasAttemptedFetchNotes] = useState(false);

	const isDesktop = useDesktopBreakpoint();
	const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);

	useEffect(() => {
		if (isDesktop) {
			setMobileKeyboardInset(0);
			return;
		}

		if (typeof window === "undefined" || !window.visualViewport) {
			setMobileKeyboardInset(0);
			return;
		}

		const viewport = window.visualViewport;

		const updateKeyboardInset = () => {
			const layoutHeight = window.innerHeight;
			const visibleBottom = viewport.height + viewport.offsetTop;
			const overlap = Math.max(0, Math.round(layoutHeight - visibleBottom));
			// Ignore tiny viewport shifts from browser chrome changes.
			setMobileKeyboardInset(overlap >= 60 ? overlap : 0);
		};

		updateKeyboardInset();
		viewport.addEventListener("resize", updateKeyboardInset);
		viewport.addEventListener("scroll", updateKeyboardInset);

		return () => {
			viewport.removeEventListener("resize", updateKeyboardInset);
			viewport.removeEventListener("scroll", updateKeyboardInset);
		};
	}, [isDesktop]);

	const handleFetchNotes = useCallback(async () => {
		if (isFetchingNotes || hasAttemptedFetchNotes) return;
		setIsFetchingNotes(true);
		try {
			const notes = await apiFunctions.getFavoriteNotes();
			appLog.info("Fetched favorite notes:", notes);
			setFavoriteNotes(notes);
			setHasAttemptedFetchNotes(true);
		} catch (error) {
			appLog.error("Failed to fetch favorite notes:", error);
			toast.error(t("favorites.get_notes_failed"));
		} finally {
			setIsFetchingNotes(false);
		}
	}, [apiFunctions, isFetchingNotes, hasAttemptedFetchNotes, t]);

	useEffect(() => {
		if (isSearchOpen && !hasAttemptedFetchNotes) {
			void handleFetchNotes();
		}
	}, [isSearchOpen, hasAttemptedFetchNotes, handleFetchNotes]);

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
		activeFilterCount,
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
		if (!userId) {
			setProfileImageHash(null);
			return;
		}

		const cachedHash = getCachedOwnProfilePhotoHash();
		if (cachedHash !== undefined) {
			setProfileImageHash(cachedHash);
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
					const nextHash = firstHash ?? null;
					setProfileImageHash(nextHash);
					setCachedOwnProfilePhotoHash(nextHash);
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

	const hasSavedScroll = useMemo(() => {
		if (!browseCacheKey || typeof window === "undefined") {
			return false;
		}
		const saved = sessionStorage.getItem(`grid-scroll-${browseCacheKey}`);
		return !!saved && parseInt(saved, 10) > 0;
	}, [browseCacheKey]);

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

	const refreshLocation = useCallback(async () => {
		if (!useAutoLocation || !("geolocation" in navigator)) {
			return;
		}

		const getPosition = (options: PositionOptions) =>
			new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, options);
			});

		try {
			// First attempt with high accuracy
			const position = await getPosition({
				enableHighAccuracy: true,
				timeout: 15000,
				maximumAge: 10000, // Allow 10s old cached data
			});

			const lat = position.coords.latitude;
			const lon = position.coords.longitude;
			const nextGeohash = encodeGeohash(lat, lon);

			await setPreferences({
				geohash: nextGeohash,
			});

			appLog.info("[grid] auto-location updated", { lat, lon });
			return nextGeohash;
		} catch (error: any) {
			// If HighAccuracy fails, try once without (often more stable in emulator/buildings)
			if (error.code === 3 || error.code === 2) { // Timeout or PositionUnavailable
				try {
					const fallbackPosition = await getPosition({
						enableHighAccuracy: false,
						timeout: 10000,
						maximumAge: 60000,
					});
					const lat = fallbackPosition.coords.latitude;
					const lon = fallbackPosition.coords.longitude;
					const nextGeohash = encodeGeohash(lat, lon);
					await setPreferences({ geohash: nextGeohash });
					appLog.info("[grid] auto-location updated (fallback)", { lat, lon });
					return nextGeohash;
				} catch (fallbackError: any) {
					appLog.error("[grid] auto-location fallback failed", {
						code: fallbackError.code,
						message: fallbackError.message
					});
				}
			} else {
				appLog.error("[grid] auto-location failed", {
					code: error.code,
					message: error.message
				});
			}
			return null;
		}
	}, [useAutoLocation, setPreferences]);

	const loadBrowseCards = useCallback(
		async ({
			page,
			preferCache = true,
			showLoadingState = true,
			overrideGeohash,
		}: {
			page?: number;
			preferCache?: boolean;
			showLoadingState?: boolean;
			overrideGeohash?: string;
		} = {}) => {
			if (isLoadingPreferences) {
				return;
			}

			const activeGeohash = overrideGeohash || geohash;

			if (!activeGeohash) {
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

			// Use the correct cache key for the active geohash
			const activeCacheKey = overrideGeohash
				? `${overrideGeohash}:${JSON.stringify(browseRequestFilters)}`
				: browseCacheKey;

			const cached = preferCache ? getCachedBrowseCards(activeCacheKey) : null;
			if (!isMountedRef.current) {
				return;
			}

			setCardsError(null);

			if (cached) {
				setCards(cached.cards);
				setNextPage(cached.nextPage);
				setIsLoadingCards(false);
				setDebugLoadSource("cache");
				// If we have cached cards and we're on the first page, don't re-fetch from API immediately.
				// This ensures the grid remains stable for 5 minutes as requested.
				if (!page || page === 1) {
					return;
				}
			} else if (showLoadingState) {
				setIsLoadingCards(true);
			}

			try {
				const parsed = await getBrowseCardsWithTimeout({
					geohash: activeGeohash,
					page,
					filters: browseRequestFilters,
				});
				setDebugLoadSource("network");

				void upsertChatContactIndexFromGrid(
					parsed.cards.map((card) => ({
						profileId: card.profileId,
						unreadCount: card.unreadCount ?? 0,
					})),
				).catch((error) => {
					appLog.warn("[chat-index] failed to persist grid metadata", error);
				});

				if (!isMountedRef.current) {
					return;
				}

				setCards(parsed.cards);
				setCachedBrowseCards(
					activeCacheKey,
					parsed.cards,
					parsed.nextPage ?? null,
				);
				setNextPage(parsed.nextPage ?? null);
			} catch (error) {
				if (!isMountedRef.current) {
					return;
				}

				if (!cached) {
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
		const SESSION_REFRESH_KEY = "grid_initial_location_refreshed";
		const hasRefreshedThisSession = sessionStorage.getItem(SESSION_REFRESH_KEY) === "true";

		if (!isLoadingPreferences && useAutoLocation && !initialLocationChecked && !hasRefreshedThisSession) {
			appLog.info("[grid] triggering initial session auto-location refresh");
			void refreshLocation().finally(() => {
				if (isMountedRef.current) {
					setInitialLocationChecked(true);
					sessionStorage.setItem(SESSION_REFRESH_KEY, "true");
				}
			});
		} else if (!isLoadingPreferences && !initialLocationChecked) {
			setInitialLocationChecked(true);
		}
	}, [isLoadingPreferences, useAutoLocation, refreshLocation, initialLocationChecked]);

	useEffect(() => {
		if (geohash || initialLocationChecked) {
			// Only show the loading spinner if we don't have any cards yet.
			// This prevents the spinner from appearing when returning from a profile.
			const shouldShowLoading = cards.length === 0;
			void loadBrowseCards({
				showLoadingState: shouldShowLoading,
				preferCache: true,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loadBrowseCards, initialLocationChecked, geohash]);

	// Reset scroll restoration state when cache key (filters/location) changes
	useEffect(() => {
		setHasRestoredScroll(false);
	}, [browseCacheKey]);

	// Periodically save scroll position for the current grid view
	useEffect(() => {
		const handleScroll = () => {
			if (browseCacheKey && window.scrollY > 0) {
				sessionStorage.setItem(`grid-scroll-${browseCacheKey}`, window.scrollY.toString());
			}
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, [browseCacheKey]);

	// Restore scroll position when cards are loaded and we haven't restored yet
	useLayoutEffect(() => {
		if (
			cards.length > 0 &&
			!hasRestoredScroll &&
			!isLoadingCards &&
			browseCacheKey
		) {
			const saved = sessionStorage.getItem(`grid-scroll-${browseCacheKey}`);
			if (saved) {
				const scrollY = parseInt(saved, 10);
				if (scrollY > 0) {
					window.scrollTo({ top: scrollY, behavior: "instant" });
				}
			}
			setHasRestoredScroll(true);
		}
	}, [cards.length, hasRestoredScroll, isLoadingCards, browseCacheKey]);

	useEffect(() => {
		const profileIds = cards.map((card) => card.profileId);
		if (profileIds.length === 0) {
			setChatContactIndexByProfileId({});
			return;
		}

		let cancelled = false;
		void getChatContactIndexForProfiles(profileIds)
			.then((records) => {
				if (cancelled || !isMountedRef.current) {
					return;
				}
				setChatContactIndexByProfileId(indexChatContactRecordsByProfileId(records));
			})
			.catch((error) => {
				appLog.warn("[chat-index] failed to hydrate grid contact index", error);
			});

		return () => {
			cancelled = true;
		};
	}, [cards]);

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

	const handleAutoRefresh = useCallback(async () => {
		appLog.info("[grid] auto-refresh triggered");
		let activeGeohash = geohash;
		if (browseCacheKey) {
			sessionStorage.removeItem(`grid-scroll-${browseCacheKey}`);
		}
		if (useAutoLocation) {
			const next = await refreshLocation();
			if (next) {
				activeGeohash = next;
			}
		}
		return loadBrowseCards({
			preferCache: false,
			showLoadingState: false,
			overrideGeohash: activeGeohash || undefined,
		});
	}, [browseCacheKey, geohash, loadBrowseCards, refreshLocation, useAutoLocation]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const enabled = localStorage.getItem("fg-auto-refresh-enabled") === "true";
		const intervalMinutes = parseInt(localStorage.getItem("fg-auto-refresh-interval") || "5", 10);

		if (!enabled || isNaN(intervalMinutes) || intervalMinutes <= 0) {
			return;
		}

		const intervalMs = intervalMinutes * 60 * 1000;
		appLog.info(`[grid] auto-refresh scheduled every ${intervalMinutes} minutes`);

		const timer = setInterval(() => {
			void handleAutoRefresh();
		}, intervalMs);

		return () => clearInterval(timer);
	}, [handleAutoRefresh]);

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
			setDebugLoadSource("network");
			void upsertChatContactIndexFromGrid(
				parsed.cards.map((card) => ({
					profileId: card.profileId,
					unreadCount: card.unreadCount ?? 0,
				})),
			).catch((error) => {
				appLog.warn(
					"[chat-index] failed to persist load-more grid metadata",
					error,
				);
			});
			if (!cancelled) {
				setCards((prev) => {
					const next = [...prev, ...parsed.cards];
					setCachedBrowseCards(browseCacheKey, next, parsed.nextPage ?? null);
					return next;
				});
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
		const allCards = (SHOW_DEMO_DATA && showDebugInfo) ? [...DEMO_CARDS, ...cards] : cards;
		let results: BrowseCard[];

		if (sortBy === "default") {
			results = allCards;
		} else {
			results = [...allCards].sort((a, b) => {
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
		}

		if (browseFilters.isVisiting) {
			results = results.filter((card) => card.isVisiting === true);
		}

		if (searchTerm) {
			const lower = searchTerm.toLowerCase();
			results = results.filter((card) => {
				const matchesName = card.displayName?.toLowerCase().includes(lower) ||
					card.profileId.toLowerCase().includes(lower);

				if (matchesName) return true;

				// Check favorite notes
				const noteMatch = favoriteNotes.find(n => String(n.counterpartyId) === String(card.profileId));
				if (noteMatch) {
					return noteMatch.notes.toLowerCase().includes(lower) ||
						noteMatch.phoneNumber.toLowerCase().includes(lower);
				}

				return false;
			});
		}

		return results;
	}, [cards, sortBy, showDebugInfo, browseFilters.isVisiting, searchTerm, favoriteNotes]);

	const selectedBrowseCard = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return cards.find((card) => card.profileId === activeProfileId) ?? null;
	}, [activeProfileId, cards]);

	const selectedProfileChatContact = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return chatContactIndexByProfileId[activeProfileId] ?? null;
	}, [activeProfileId, chatContactIndexByProfileId]);

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
        appLog.info("Profile", profileId);
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

	const performBlockProfile = useCallback(
		async (targetProfileId: string) => {
			try {
				await blockProfileMutation(targetProfileId);
				setCards((prev) => prev.filter((card) => card.profileId !== targetProfileId));
				if (activeProfileId === targetProfileId) {
					setActiveProfileId(null);
				}
				toast.success(t("profile_details.block_success"));
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("profile_details.block_failed"),
				);
			}
		},
		[activeProfileId, blockProfileMutation, t],
	);

	const performUnblockProfile = useCallback(
		async (targetProfileId: string) => {
			try {
				await unblockProfileMutation(targetProfileId);
				toast.success(t("profile_details.unblock_success"));
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("profile_details.unblock_failed"),
				);
			}
		},
		[unblockProfileMutation, t],
	);

	const handleBlockProfile = useCallback(
		async (targetProfileId: string) => {
			if (isBlockingProfile || isUnblockingProfile) {
				return;
			}

			if (skipBlockConfirm) {
				await performBlockProfile(targetProfileId);
				return;
			}

			setDontAskAgainChecked(false);
			setPendingProfileConfirm({ action: "block", profileId: targetProfileId });
		},
		[isBlockingProfile, isUnblockingProfile, performBlockProfile, skipBlockConfirm],
	);

	const handleUnblockProfile = useCallback(
		async (targetProfileId: string) => {
			if (isBlockingProfile || isUnblockingProfile) {
				return;
			}

			if (skipUnblockConfirm) {
				await performUnblockProfile(targetProfileId);
				return;
			}

			setDontAskAgainChecked(false);
			setPendingProfileConfirm({ action: "unblock", profileId: targetProfileId });
		},
		[isBlockingProfile, isUnblockingProfile, performUnblockProfile, skipUnblockConfirm],
	);
		async (targetProfileId: string) => {
			if (mutatingBlockProfileId) {
				return;
			}

			if (skipUnblockConfirm) {
				await performUnblockProfile(targetProfileId);
				return;
			}

			setDontAskAgainChecked(false);
			setPendingProfileConfirm({ action: "unblock", profileId: targetProfileId });
		},
		[mutatingBlockProfileId, performUnblockProfile, skipUnblockConfirm],
	);

	const handleToggleFavoriteProfile = useCallback(
		async (targetProfileId: string, currentlyFavorite: boolean) => {
			if (mutatingFavoriteProfileId) {
				return;
			}

			setMutatingFavoriteProfileId(targetProfileId);
			try {
				if (currentlyFavorite) {
					await apiFunctions.removeFavorite(targetProfileId);
				} else {
					await apiFunctions.addFavorite(targetProfileId);
				}

				setCards((previous) =>
					previous.map((card) => {
						if (card.profileId !== targetProfileId) {
							return card;
						}
						return {
							...card,
							isFavorite: !currentlyFavorite,
						};
					}),
				);

				setActiveProfile((previous) => {
					if (!previous || previous.profileId !== targetProfileId) {
						return previous;
					}
					return {
						...previous,
						isFavorite: !currentlyFavorite,
					};
				});

				toast.success(
					currentlyFavorite ? t("favorites.removed") : t("favorites.added"),
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: currentlyFavorite
							? t("favorites.remove_failed")
							: t("favorites.add_failed"),
				);
			} finally {
				setMutatingFavoriteProfileId(null);
			}
		},
		[apiFunctions, mutatingFavoriteProfileId, t],
	);

	const handleCancelProfileConfirm = useCallback(() => {
		if (isBlockingProfile || isUnblockingProfile) {
			return;
		}
		setPendingProfileConfirm(null);
	}, [isBlockingProfile, isUnblockingProfile]);

	const handleConfirmProfileAction = useCallback(async () => {
		if (!pendingProfileConfirm || isBlockingProfile || isUnblockingProfile) {
			return;
		}

		const { action, profileId } = pendingProfileConfirm;
		if (dontAskAgainChecked && typeof window !== "undefined") {
			if (action === "block") {
				localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
				setSkipBlockConfirm(true);
			} else {
				localStorage.setItem(SKIP_UNBLOCK_CONFIRM_KEY, "true");
				setSkipUnblockConfirm(true);
			}
		}

		setPendingProfileConfirm(null);
		if (action === "block") {
			await performBlockProfile(profileId);
			return;
		}
		await performUnblockProfile(profileId);
	}, [
		dontAskAgainChecked,
		pendingProfileConfirm,
		performBlockProfile,
		performUnblockProfile,
		isBlockingProfile,
		isUnblockingProfile,
	]);

	return (
		<>
			{showDebugInfo && debugLoadSource && !SHOW_DEMO_DATA && (
				<div
					className={cn(
						"fixed bottom-20 left-4 z-[9999] rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest text-white shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4",
						debugLoadSource === "cache" ? "bg-emerald-600" : "bg-blue-600",
					)}
					onClick={() => setDebugLoadSource(null)}
				>
					Source: {debugLoadSource}
				</div>
			)}
			{/* !px-0 removes the default app-screen padding to allow the BrowseGrid to span edge-to-edge */}
			<PullToRefreshContainer
				className="app-screen overflow-x-hidden !px-0"
				style={{ width: "100%" }}
				onRefresh={async () => {
					let activeGeohash = geohash;
					if (browseCacheKey) {
						sessionStorage.removeItem(`grid-scroll-${browseCacheKey}`);
					}
					if (useAutoLocation) {
						const next = await refreshLocation();
						if (next) {
							activeGeohash = next;
						}
					}
					return loadBrowseCards({
						preferCache: false,
						showLoadingState: false,
						overrideGeohash: activeGeohash || undefined
					});
				}}
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
										<span className="flex items-center gap-2">
											<SlidersHorizontal className="h-4 w-4" />
											{hasActiveBrowseFilters ? (
												<span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--accent-contrast)]">
													{activeFilterCount}
												</span>
											) : null}
										</span>
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

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												favorites: !prev.favorites,
											}))
										}
										className={`inline-flex min-h-12 items-center justify-center rounded-full px-5 transition ${browseFilters.favorites ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--text)]"}`}
										aria-label={t("browse_filters.options.favorites")}
										title={t("browse_filters.options.favorites")}
									>
										<Star
											className={`h-4 w-4 ${browseFilters.favorites ? "fill-current" : ""}`}
										/>
									</button>

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												rightNow: !prev.rightNow,
											}))
										}
										className={`inline-flex min-h-12 items-center justify-center rounded-full px-5 transition ${browseFilters.rightNow ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--text)]"}`}
										aria-label={t("browse_filters.options.right_now")}
										title={t("browse_filters.options.right_now")}
									>
										<Droplet
											className={`h-4 w-4 ${browseFilters.rightNow ? "fill-current" : ""}`}
										/>
									</button>

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												isVisiting: !prev.isVisiting,
											}))
										}
										className={`inline-flex min-h-12 items-center justify-center rounded-full px-5 transition ${browseFilters.isVisiting ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-[var(--surface-2)] text-[var(--text)]"}`}
										aria-label={t("profile_details.visiting")}
										title={t("profile_details.visiting")}
									>
										<Plane
											className={`h-4 w-4 ${browseFilters.isVisiting ? "fill-current" : ""}`}
										/>
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

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												favorites: !prev.favorites,
											}))
										}
										className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium transition ${
											browseFilters.favorites
												? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
												: "bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										<Star
											className={`h-3.5 w-3.5 ${browseFilters.favorites ? "fill-current" : ""}`}
										/>
										<span className="hidden lg:inline">
											{t("browse_filters.options.favorites")}
										</span>
									</button>

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												rightNow: !prev.rightNow,
											}))
										}
										className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium transition ${
											browseFilters.rightNow
												? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
												: "bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										<Droplet
											className={`h-3.5 w-3.5 ${browseFilters.rightNow ? "fill-current" : ""}`}
										/>
										<span className="hidden lg:inline">
											{t("browse_filters.options.right_now")}
										</span>
									</button>

									<button
										type="button"
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												isVisiting: !prev.isVisiting,
											}))
										}
										className={`inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium transition ${
											browseFilters.isVisiting
												? "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)]"
												: "bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										<Plane
											className={`h-3.5 w-3.5 ${browseFilters.isVisiting ? "fill-current" : ""}`}
										/>
										<span className="hidden lg:inline">
											{t("profile_details.visiting")}
										</span>
									</button>

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

				<div
					className={cn(
						"transition-opacity duration-0",
						hasSavedScroll && !hasRestoredScroll && cards.length > 0 && !isLoadingCards
							? "opacity-0"
							: "opacity-100",
					)}
				>
					<BrowseGrid
						isLoadingCards={isLoadingCards}
						cardsError={cardsError}
						cards={sortedCards}
						chatContactIndexByProfileId={
							(SHOW_DEMO_DATA && showDebugInfo)
								? { ...DEMO_CHAT_STATUS, ...chatContactIndexByProfileId }
								: chatContactIndexByProfileId
						}
						onSelectProfile={handleSelectProfile}
						onMessageProfile={handleMessageProfile}
						hasMore={nextPage !== null}
						isLoadingMore={isLoadingMoreCards}
						onLoadMore={() => {
							void handleLoadMoreCards();
						}}
					/>
				</div>
			</PullToRefreshContainer>

			<div
				className={cn(
					"fixed inset-x-0 z-[60] pointer-events-none transition-all duration-300 ease-out",
					(browseFilters.favorites && !activeProfileId) ? "opacity-100" : "opacity-0"
				)}
				style={{
					bottom: `calc(${isDesktop ? "9rem" : "7.5rem"} + ${mobileKeyboardInset}px)`
				}}
			>
				<div className="relative mx-auto h-full w-full max-w-4xl px-4 md:px-10">
					<div className="absolute bottom-0 right-4 flex items-end gap-3 translate-x-0 lg:right-[16%] lg:translate-x-1/2 pointer-events-auto">
						{isSearchOpen && (
							<div className="flex flex-col items-end gap-2">
								{favoriteNotes.length > 0 && !isFetchingNotes && (
									<div className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60 backdrop-blur-md animate-badge-in">
										{t("favorites.notes_loaded", { count: favoriteNotes.length })}
									</div>
								)}
								<div className="w-64 sm:w-80 overflow-hidden rounded-full border border-white/10 bg-white/5 p-1 shadow-2xl backdrop-blur-2xl animate-search-in pointer-events-auto max-w-[calc(100vw-5rem)]">
									<div className="flex items-center gap-3 px-4 py-2.5">
										{isFetchingNotes ? (
											<div className="flex h-5 w-5 items-center justify-center">
												<div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
											</div>
										) : (
											<Search className="h-5 w-5 text-white/70" />
										)}
										<input
											type="text"
											autoFocus
											placeholder={isFetchingNotes ? t("favorites.loading_notes") : t("favorites.search_placeholder")}
											className="w-full bg-transparent text-lg font-medium text-white outline-none placeholder:text-white/40"
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Escape") {
													e.stopPropagation();
													e.nativeEvent.stopImmediatePropagation();
													setIsSearchOpen(false);
												}
												if (e.key === "Enter") setIsSearchOpen(false);
											}}
										/>
									</div>
								</div>
							</div>
						)}
						<button
							type="button"
							onClick={() => setIsSearchOpen(!isSearchOpen)}
							className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] shadow-xl transition-all duration-200 ease-out active:scale-95 hover:opacity-90"
							aria-label={t("browse_page.search")}
						>
							<Search className="h-7 w-7 stroke-[2.5]" />
						</button>
					</div>
				</div>
			</div>

			<ProfileDetailsModal
				isOpen={Boolean(activeProfileId)}
				onClose={() => setActiveProfileId(null)}
				onMessageProfile={handleMessageProfile}
				onTriangleProfile={handleTriangleProfile}
				onBlockProfile={handleBlockProfile}
				onUnblockProfile={handleUnblockProfile}
				onToggleFavoriteProfile={handleToggleFavoriteProfile}
				isFavorite={Boolean(activeProfile?.isFavorite)}
				isTogglingFavorite={Boolean(
					activeProfileId && mutatingFavoriteProfileId === activeProfileId,
				)}
				isBlocked={activeProfileId ? blockedProfileIds.has(activeProfileId) : false}
				isBlockingProfile={isBlockingProfile || isUnblockingProfile}
				onTapProfile={handleTapProfile}
				isTappingProfile={Boolean(tappingProfileId && tappingProfileId === activeProfileId)}
				isTapBlocked={hasSentTapRecently}
				tapVisualState={resolvedTapVisualState}
				activeProfile={activeProfile}
				selectedBrowseCard={selectedBrowseCard}
				isLoadingActiveProfile={isLoadingActiveProfile}
				activeProfileError={activeProfileError}
				activeProfilePhotoHashes={activeProfilePhotoHashes}
				chatContactStatus={selectedProfileChatContact}
				genderOptions={genderOptions}
				pronounOptions={pronounOptions}
			/>

			<ConfirmDialog
				isOpen={pendingProfileConfirm !== null}
				title={
					pendingProfileConfirm?.action === "unblock"
						? t("profile_details.unblock")
						: t("profile_details.block")
				}
				message={
					pendingProfileConfirm?.action === "unblock"
						? t("profile_details.unblock_confirm")
						: t("profile_details.block_confirm")
				}
				confirmLabel={
					pendingProfileConfirm?.action === "unblock"
						? t("profile_details.unblock")
						: t("profile_details.block")
				}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={handleConfirmProfileAction}
				onCancel={handleCancelProfileConfirm}
				isProcessing={isBlockingProfile || isUnblockingProfile}
				confirmTone={
					pendingProfileConfirm?.action === "unblock" ? "default" : "danger"
				}
				dontAskAgainLabel={t("profile_details.dont_ask_again")}
				dontAskAgainChecked={dontAskAgainChecked}
				onDontAskAgainChange={setDontAskAgainChecked}
			/>
		</>
	);
}
