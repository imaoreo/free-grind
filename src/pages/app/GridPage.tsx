import { useAuth } from "../../contexts/useAuth";
import { MapPin, Navigation, SlidersHorizontal, ListFilter, Star, Plane, Search, Eye, EyeOff, Check, Loader2, RefreshCw, Settings, X } from "lucide-react";
import { RightNowIcon } from "../../components/icons/RightNowIcon";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
import { reverseGeocodeGeohash } from "./gridpage/geocoding";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useExploreMode } from "../../contexts/ExploreModeContext";
import { type BrowseCard, type ProfileDetail } from "./GridPage.types";
import { BrowseGrid } from "./gridpage/components/BrowseGrid";
import { mergeBrowseCardImages } from "./gridpage/utils";
import { FeedScrollContainer } from "../../components/ui/FeedScrollContainer";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import {
	getCachedBrowseCards,
	getCachedProfileDetail,
	removeProfileFromBrowseCache,
	setCachedBrowseCards,
	setCachedProfileDetail,
} from "./gridpage/cache";
import { setSavedAccountDisplayName, setSavedAccountPhotoHash, getSavedAccountProfile } from "../../services/savedAccountProfiles";
import { Avatar } from "../../components/ui/avatar";
import {
	type BrowseSortOption,
	getCachedBrowseFiltersDraft,
	getDefaultBrowseFiltersDraft,
	loadBrowseFiltersDraft,
} from "./browse-filters-storage";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { FilterPill } from "../../components/ui/FilterPill";
import { useBrowseFilters } from "./gridpage/hooks/useBrowseFilters";
import { useTapProfile } from "./gridpage/hooks/useTapProfile";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { useManagedGenders, useManagedPronouns, useBlockedProfileIds, useBlockProfile, useUnblockProfile, useMyOwnProfile } from "../../hooks/queries/useProfileQueries";
import { useQueryClient } from "@tanstack/react-query";
import { getProfilePhotoHash } from "./profile-editor/profileEditorUtils";
import {
	getChatContactIndexForProfiles,
	getLocalNicknamesForProfiles,
	indexChatContactRecordsByProfileId,
	upsertChatContactIndexFromGrid,
} from "../../services/chatContactIndex";
import type { ChatContactIndexRecord } from "../../types/chat-contact-index";
import { appLog } from "../../utils/logger";
import { getIncognitoMode } from "../../utils/privacy";
import { setGridPageActive } from "./gridpage/activeState";
import { GRID_REFRESH_INTERVAL_MS } from "../../components/gridRefreshInterval";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { cn } from "../../utils/cn";
import { DEMO_CARDS, DEMO_CHAT_STATUS, SHOW_DEMO_DATA } from "./gridpage/demoData";
import { BrowseFiltersOverlay } from "./BrowseFiltersOverlay";
import { LocationOverlay, type ExploreLocation, EXPLORE_COLOR } from "./LocationOverlay";
import type { BrowseFiltersDraft } from "./browse-filters-storage";
import { SKIP_BLOCK_CONFIRM_KEY, isBlockConfirmSkipped } from "../../utils/blockConfirm";
import * as chatDb from "../../services/chatDb";
import { hideProfile as hideProfileLocally, unhideProfile as unhideProfileLocally, GRID_HIDE_STATE_EVENT, type GridHideStateChangeDetail } from "../../services/profileHide";

const EXPLORE_LOCATION_STORAGE_KEY = "grid_explore_location_v1";
// The local displayname filter ("Lokale Filter" > nicknameFilter) matches
// only against already-loaded cards, so a narrow/rare name would otherwise
// keep auto-pagination running indefinitely trying to find more matches.
const NICKNAME_FILTER_MAX_PAGES = 7;

// Guards the initial auto-location refresh below to once per actual app
// launch. This has to be a module-level variable, not sessionStorage — the
// embedded webview (Tauri) persists Web Storage across full app restarts
// just like localStorage, so a sessionStorage-backed flag would only ever
// fire once per install instead of once per launch, silently disabling the
// startup location/geocode refresh (though not later ones — the periodic
// timer and pull-to-refresh call refreshLocation() unconditionally). A
// plain module variable is reliably reset on every fresh process start.
let hasRefreshedLocationThisAppLaunch = false;

export function GridPage() {
	const { t } = useTranslation();
	const BROWSE_LOAD_TIMEOUT_MS = 15000;
	const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;

	const { userId, savedAccounts, switchAccount, settingsReady } = useAuth();
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
	const [cards, setCards] = useState<BrowseCard[]>([]);
	// loadBrowseCards intentionally doesn't depend on `cards` (see its useCallback
	// deps), so it reads the current list through this ref instead of a stale
	// closure — used to carry last-known photos across a refresh, see mergeBrowseCardImages.
	const cardsRef = useRef<BrowseCard[]>([]);
	useEffect(() => {
		cardsRef.current = cards;
	}, [cards]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
	const [isLoadingMoreCards, setIsLoadingMoreCards] = useState(false);
	const [isManualRefreshing, setIsManualRefreshing] = useState(false);
	// Cascade encodes this as a page number, explore (/v7/search) as a
	// (distance, profileId) cursor — see encodeSearchCursor/decodeSearchCursor.
	const [nextPage, setNextPage] = useState<string | null>(null);
	// Counts grid pages loaded since the last fresh load (reset to 1 by
	// loadBrowseCards, incremented by handleLoadMoreCards) — used to cap
	// auto-pagination while the local displayname filter is narrowing the
	// grid down to little/nothing, which would otherwise keep fetching page
	// after page indefinitely trying to find a match. See NICKNAME_FILTER_MAX_PAGES.
	const [loadedPageCount, setLoadedPageCount] = useState(1);
	const [cardsError, setCardsError] = useState<string | null>(null);
	// Explore mode: browse a different area via /v7/search's exploreGeoHash
	// without touching the real geohash (preferences.geohash / nearbyGeoHash).
	// Kept out of PreferencesContext and out of localStorage on purpose —
	// this is meant to be temporary, so it only survives sessionStorage
	// (same tab, until the app fully restarts), not a real preference.
	const [exploreLocation, setExploreLocationRaw] = useState<ExploreLocation>(() => {
		if (typeof window === "undefined") return null;
		try {
			const raw = sessionStorage.getItem(EXPLORE_LOCATION_STORAGE_KEY);
			return raw ? (JSON.parse(raw) as ExploreLocation) : null;
		} catch {
			return null;
		}
	});
	const setExploreLocation = useCallback((next: ExploreLocation) => {
		setExploreLocationRaw(next);
		if (typeof window === "undefined") return;
		try {
			if (next) {
				sessionStorage.setItem(EXPLORE_LOCATION_STORAGE_KEY, JSON.stringify(next));
			} else {
				sessionStorage.removeItem(EXPLORE_LOCATION_STORAGE_KEY);
			}
		} catch {
			// ignore — worst case explore resets on next load
		}
	}, []);
	// Mirror explore mode into the app-wide context so RootLayout/NavBar can
	// swap the whole app's accent to EXPLORE_COLOR while it's active, the same
	// way isRightNow does for --right-now. Reset on unmount so navigating away
	// from Grid reverts the accent even though exploreLocation itself persists.
	const { setIsExploreActive } = useExploreMode();
	useEffect(() => {
		setIsExploreActive(exploreLocation !== null);
		return () => setIsExploreActive(false);
	}, [exploreLocation, setIsExploreActive]);
	// Lets GridAutoRefreshBridge (mounted for the whole app session) know it
	// should stay out of the way while GridPage itself is visible and running
	// its own auto-refresh — see gridpage/activeState.ts.
	useEffect(() => {
		setGridPageActive(true);
		return () => setGridPageActive(false);
	}, []);
	const [isLocationMissing, setIsLocationMissing] = useState(false);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(null);
	const [isActiveProfileBlockedByOther, setIsActiveProfileBlockedByOther] = useState(false);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(false);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(null);
	const [isProfileSearchOpen, setIsProfileSearchOpen] = useState(false);
	const [profileSearchInput, setProfileSearchInput] = useState("");
	const profileSearchDialogRef = useRef<HTMLDialogElement | null>(null);
	useEffect(() => {
		const dialog = profileSearchDialogRef.current;
		if (!dialog) return;
		if (isProfileSearchOpen) {
			if (!dialog.open) dialog.showModal();
		} else if (dialog.open) {
			dialog.close();
		}
	}, [isProfileSearchOpen]);

	const { data: managedGenders } = useManagedGenders();
	const { data: managedPronouns } = useManagedPronouns();
	const { data: blockedProfileIdsData } = useBlockedProfileIds();
	const { mutateAsync: blockProfileMutation, isPending: isBlockingProfile } = useBlockProfile();
	const { mutateAsync: unblockProfileMutation, isPending: isUnblockingProfile } = useUnblockProfile();
	const { data: myProfile } = useMyOwnProfile();
	const queryClient = useQueryClient();

	const profileImageHash = useMemo(() => getProfilePhotoHash(myProfile), [myProfile]);
	const ownDisplayName = myProfile?.displayName ?? null;
	const showDistance = myProfile?.showDistance ?? true;

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
	const [localNicknamesByProfileId, setLocalNicknamesByProfileId] = useState<
		Record<string, string>
	>({});

	const blockedProfileIds = useMemo(() => new Set(blockedProfileIdsData ?? []), [blockedProfileIdsData]);

	// Local-only, like the chat inbox's hidden-conversation flag — reloaded
	// whenever the active account's chatDb becomes ready (settingsReady), so
	// switching accounts also switches which profiles are hidden instead of
	// leaking the previous account's hidden set into the newly active one.
	const [hiddenProfileIds, setHiddenProfileIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (!settingsReady) return;
		void chatDb.listHiddenProfileIds().then((ids) => {
			setHiddenProfileIds(new Set(ids));
		});
	}, [userId, settingsReady]);

	useEffect(() => {
		const onHideStateChange = (event: Event) => {
			const detail = (event as CustomEvent<GridHideStateChangeDetail>).detail;
			if (!detail) return;
			setHiddenProfileIds((previous) => {
				const alreadyMatches = previous.has(detail.profileId) === detail.hidden;
				if (alreadyMatches) return previous;
				const next = new Set(previous);
				if (detail.hidden) {
					next.add(detail.profileId);
				} else {
					next.delete(detail.profileId);
				}
				return next;
			});
		};
		window.addEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
		return () => window.removeEventListener(GRID_HIDE_STATE_EVENT, onHideStateChange as EventListener);
	}, []);

	const [mutatingFavoriteProfileId, setMutatingFavoriteProfileId] = useState<string | null>(
		null,
	);
	const [pendingProfileConfirm, setPendingProfileConfirm] = useState<{
		action: "block";
		profileId: string;
	} | null>(null);
	const [dontAskAgainChecked, setDontAskAgainChecked] = useState(false);
	const isMountedRef = useRef(true);
	const feedContainerRef = useRef<HTMLDivElement | null>(null);
	const headerRef = useRef<HTMLElement | null>(null);
	const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
	const [debugLoadSource, setDebugLoadSource] = useState<"cache" | "network" | null>(null);
	const [initialLocationChecked, setInitialLocationChecked] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [favoriteNotes, setFavoriteNotes] = useState<Array<{ notes: string; phoneNumber: string; counterpartyId: string }>>([]);
	const [isFetchingNotes, setIsFetchingNotes] = useState(false);
	const [hasAttemptedFetchNotes, setHasAttemptedFetchNotes] = useState(false);
	const [isTogglingDistance, setIsTogglingDistance] = useState(false);

	const isDesktop = useDesktopBreakpoint();

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
		setTags,
		sortBy,
		setSortBy,
		browseRequestFilters,
		activeFilterCount,
		hasActiveBrowseFilters,
		clearBrowseFilters,
		nicknameFilter,
		applyDraft,
	} = useBrowseFilters(getCachedBrowseFiltersDraft() ?? getDefaultBrowseFiltersDraft());

	// Favorites/Right Now filters and distance/age/popular sorts all rely on
	// the real location (or real-time presence), neither of which apply to a
	// browsed-away explore location — hide their pills/options (above) and
	// clear the underlying state here so they don't keep silently filtering
	// the grid once the toggle disappears.
	useEffect(() => {
		if (!exploreLocation) return;
		setBrowseFilters((prev: typeof browseFilters) =>
			prev.favorites || prev.rightNow ? { ...prev, favorites: false, rightNow: false } : prev,
		);
		setSortBy((prev) => (prev === "distance" || prev === "age-asc" || prev === "age-desc" || prev === "popular" ? "default" : prev));
	}, [exploreLocation, setBrowseFilters, setSortBy]);

	useEffect(() => {
		if (browseFilters.favorites && !hasAttemptedFetchNotes) {
			void handleFetchNotes();
		}
	}, [browseFilters.favorites, hasAttemptedFetchNotes, handleFetchNotes]);

	// Reload whenever the active account's chatDb is ready (settingsReady),
	// so switching accounts from GridPage's own account switcher also
	// switches filters instead of leaking the previous account's browse
	// filters into the newly active one (mirrors the per-profile location
	// reload in PreferencesContext.tsx).
	useEffect(() => {
		if (!settingsReady) {
			return;
		}
		// Skip if we just navigated in with an explicit filter draft (e.g. tag-click
		// from a profile) — otherwise this clobbers it with the stale persisted draft
		// once the async load resolves, right after it was applied.
		const hasPendingDraft = Boolean(
			typeof location.state === "object" &&
				location.state !== null &&
				(location.state as { browseFiltersDraft?: unknown }).browseFiltersDraft,
		);
		if (hasPendingDraft) {
			return;
		}
		void loadBrowseFiltersDraft().then(applyDraft);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [userId, settingsReady]);

	const [isFiltersOpen, setIsFiltersOpen] = useState(false);
	const [isLocationOpen, setIsLocationOpen] = useState(false);
	const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
	const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
	const accountSwitcherRef = useRef<HTMLDivElement>(null);

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

	// Keeps the account switcher's per-account avatar/name in sync with
	// whatever useMyOwnProfile currently holds — runs on every change (initial
	// load, a photo edit elsewhere, or the optimistic update below), not just
	// once on first fetch, so the switcher can't go stale after an edit.
	useEffect(() => {
		if (!userId || !myProfile) return;
		setSavedAccountPhotoHash(String(userId), profileImageHash);
		setSavedAccountDisplayName(String(userId), ownDisplayName);
	}, [userId, myProfile, profileImageHash, ownDisplayName]);

	const handleToggleDistance = useCallback(async () => {
		if (isTogglingDistance) return;
		const next = !showDistance;
		queryClient.setQueryData(["my-own-profile"], (current: typeof myProfile) =>
			current ? { ...current, showDistance: next } : current,
		);
		setIsTogglingDistance(true);
		try {
			await apiFunctions.updateMyProfile({ showDistance: next });
		} catch {
			queryClient.setQueryData(["my-own-profile"], (current: typeof myProfile) =>
				current ? { ...current, showDistance: !next } : current,
			);
			toast.error(t("browse_page.errors.toggle_distance_failed", { defaultValue: "Could not update distance setting." }));
		} finally {
			setIsTogglingDistance(false);
		}
	}, [apiFunctions, isTogglingDistance, showDistance, queryClient, t]);

	useEffect(() => {
		if (!isAccountSwitcherOpen) return;
		const handler = (e: MouseEvent) => {
			if (accountSwitcherRef.current && !accountSwitcherRef.current.contains(e.target as Node)) {
				setIsAccountSwitcherOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [isAccountSwitcherOpen]);

	const handleSwitchAccount = async (profileId: string) => {
		setSwitchingProfileId(profileId);
		try {
			await switchAccount(profileId);
			setIsAccountSwitcherOpen(false);
			navigate("/");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to switch account.");
		} finally {
			setSwitchingProfileId(null);
		}
	};

	const browseCacheKey = useMemo(() => {
		if (!geohash) {
			return "";
		}
		const filtersKey = JSON.stringify(browseRequestFilters);
		const modeKey = exploreLocation ? `explore:${exploreLocation.geohash}` : "set";
		return `${geohash}:${modeKey}:${filtersKey}`;
	}, [browseRequestFilters, geohash, exploreLocation]);

	const hasSavedScroll = useMemo(() => {
		if (!browseCacheKey || typeof window === "undefined") {
			return false;
		}
		const saved = sessionStorage.getItem(`grid-scroll-${browseCacheKey}`);
		return !!saved && parseInt(saved, 10) > 0;
	}, [browseCacheKey]);

	const withLoadTimeout = useCallback(
		async <T,>(run: () => Promise<T>): Promise<T> => {
			return await new Promise<T>((resolve, reject) => {
				const timeout = window.setTimeout(() => {
					reject(new Error(t("browse_page.errors.load_timeout")));
				}, BROWSE_LOAD_TIMEOUT_MS);

				void run()
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
		[BROWSE_LOAD_TIMEOUT_MS, t],
	);

	const getBrowseCardsWithTimeout = useCallback(
		(args: Parameters<typeof apiFunctions.getBrowseCards>[0]) =>
			withLoadTimeout(() => apiFunctions.getBrowseCards(args)),
		[apiFunctions, withLoadTimeout],
	);

	// /v4/cascade accepts exploreGeoHash alongside nearbyGeoHash (it's the
	// same field cascade's own "🌎 Explore" widget uses), so explore mode
	// just adds that param — nearbyGeoHash stays the real, reported location.
	// (/v7/search's exploreGeoHash looked equivalent per docs but 500s in
	// practice — see chat history — so cascade is the only mode this uses.)
	const fetchGridCards = useCallback(
		async ({
			activeGeohash,
			cursor,
			explore,
		}: {
			activeGeohash: string;
			cursor?: string | null;
			explore: ExploreLocation;
		}): Promise<{ cards: BrowseCard[]; nextPage: string | null }> => {
			const parsed = await getBrowseCardsWithTimeout({
				geohash: activeGeohash,
				exploreGeohash: explore?.geohash,
				page: cursor ? Number(cursor) : undefined,
				filters: browseRequestFilters,
			});
			return {
				cards: parsed.cards,
				nextPage: parsed.nextPage != null ? String(parsed.nextPage) : null,
			};
		},
		[browseRequestFilters, getBrowseCardsWithTimeout],
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
			// Re-resolve the display name too, otherwise the header pill and the
			// location overlay's title keep showing whatever place was last
			// geocoded (e.g. where auto-location was first turned on) even
			// though the grid/map have already moved on to the new geohash.
			const nextLocationName = await reverseGeocodeGeohash(nextGeohash).catch(() => null);

			await setPreferences({
				geohash: nextGeohash,
				...(nextLocationName ? { locationName: nextLocationName } : {}),
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
					const nextLocationName = await reverseGeocodeGeohash(nextGeohash).catch(() => null);
					await setPreferences({
						geohash: nextGeohash,
						...(nextLocationName ? { locationName: nextLocationName } : {}),
					});
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
			page?: string;
			preferCache?: boolean;
			showLoadingState?: boolean;
			overrideGeohash?: string;
		} = {}) => {
			if (isLoadingPreferences) {
				return;
			}

			if (getIncognitoMode()) {
				if (!isMountedRef.current) {
					return;
				}
				setCards([]);
				setCardsError(null);
				setIsLocationMissing(false);
				setIsLoadingCards(false);
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
				setIsLocationMissing(true);
				setIsLoadingCards(false);
				return;
			}

			// Use the correct cache key for the active geohash
			const activeCacheKey = overrideGeohash
				? `${overrideGeohash}:${exploreLocation ? `explore:${exploreLocation.geohash}` : "set"}:${JSON.stringify(browseRequestFilters)}`
				: browseCacheKey;

			const cached = preferCache ? getCachedBrowseCards(activeCacheKey) : null;
			if (!isMountedRef.current) {
				return;
			}

			setIsLocationMissing(false);
			setCardsError(null);

			if (cached) {
				setCards(cached.cards);
				setNextPage(cached.nextPage);
				setLoadedPageCount(1);
				setIsLoadingCards(false);
				setDebugLoadSource("cache");
				// If we have cached cards and we're on the first page, don't re-fetch from API immediately.
				// This ensures the grid remains stable for 5 minutes as requested.
				if (!page) {
					return;
				}
			} else if (showLoadingState) {
				setIsLoadingCards(true);
			}

			try {
				const parsed = await fetchGridCards({
					activeGeohash,
					cursor: page,
					explore: exploreLocation,
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

				const mergedCards = mergeBrowseCardImages(cardsRef.current, parsed.cards);
				setCards(mergedCards);
				setCachedBrowseCards(
					activeCacheKey,
					mergedCards,
					parsed.nextPage ?? null,
				);
				setNextPage(parsed.nextPage ?? null);
				setLoadedPageCount(1);
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
			exploreLocation,
			fetchGridCards,
		],
	);

	useEffect(() => {
		if (!isLoadingPreferences && useAutoLocation && !initialLocationChecked && !hasRefreshedLocationThisAppLaunch) {
			appLog.info("[grid] triggering initial session auto-location refresh");
			void refreshLocation().finally(() => {
				if (isMountedRef.current) {
					setInitialLocationChecked(true);
					hasRefreshedLocationThisAppLaunch = true;
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

	// Scroll restore + header-snap now lives inside BrowseGrid (see its
	// hasRestoredScroll/onRestoredScrollChange props) — with the grid
	// virtualized, only BrowseGrid knows the real (measured) row size needed
	// to do that math without querying the DOM for a tile that may not be
	// mounted yet at the restored position.

	useEffect(() => {
		if (!browseCacheKey) return;
		const container = feedContainerRef.current;
		if (!container) return;
		const key = `grid-scroll-${browseCacheKey}`;
		const handleScroll = () => {
			sessionStorage.setItem(key, container.scrollTop.toString());
		};
		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, [browseCacheKey]);

	useEffect(() => {
		const handleScrollTop = () => {
			feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
		};
		window.addEventListener("browse-scroll-top", handleScrollTop);
		return () => window.removeEventListener("browse-scroll-top", handleScrollTop);
	}, []);

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
		const profileIds = cards.map((card) => card.profileId);
		if (profileIds.length === 0) {
			setLocalNicknamesByProfileId({});
			return;
		}

		let cancelled = false;
		void getLocalNicknamesForProfiles(profileIds)
			.then((nicknames) => {
				if (cancelled || !isMountedRef.current) {
					return;
				}
				setLocalNicknamesByProfileId(nicknames);
			})
			.catch((error) => {
				appLog.warn("[chat-index] failed to hydrate grid local nicknames", error);
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
		if (getIncognitoMode()) {
			return;
		}
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

	// Desktop has no pull-to-refresh gesture (PullToRefreshContainer only
	// listens for touch events), so this button is the desktop equivalent —
	// same refresh logic as the mobile pull gesture, with its own loading
	// flag since it runs with showLoadingState: false.
	const handleManualRefresh = useCallback(async () => {
		if (isManualRefreshing || isLoadingCards || isLoadingMoreCards) return;
		setIsManualRefreshing(true);
		try {
			await handleAutoRefresh();
		} finally {
			setIsManualRefreshing(false);
		}
	}, [handleAutoRefresh, isManualRefreshing, isLoadingCards, isLoadingMoreCards]);

	useEffect(() => {
		if (typeof window === "undefined") return;

		const timer = setInterval(() => {
			void handleAutoRefresh();
		}, GRID_REFRESH_INTERVAL_MS);

		return () => clearInterval(timer);
	}, [handleAutoRefresh]);

	const handleLoadMoreCards = async () => {
		if (!geohash || !nextPage || isLoadingMoreCards) return;
		if (nicknameFilter && loadedPageCount >= NICKNAME_FILTER_MAX_PAGES) return;
		setIsLoadingMoreCards(true);
		let cancelled = false;
		try {
			const parsed = await fetchGridCards({
				activeGeohash: geohash,
				cursor: nextPage,
				explore: exploreLocation,
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
				setLoadedPageCount((prev) => prev + 1);
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

	useEffect(() => {
		if (!activeProfileId) {
			setIsActiveProfileBlockedByOther(false);
			return;
		}
		let cancelled = false;
		void chatDb.getBlockStatesByProfileIds([activeProfileId]).then((blockStates) => {
			if (!cancelled) setIsActiveProfileBlockedByOther(blockStates.get(activeProfileId) === "blocked_by_other");
		});
		return () => {
			cancelled = true;
		};
	}, [activeProfileId]);

	const profilePhotoUrl = useMemo(() => {
		if (!profileImageHash) {
			return null;
		}

		return getThumbImageUrl(profileImageHash, "75x75");
	}, [profileImageHash]);

	const selfCardImageUrl = useMemo(
		() => profileImageHash ? getThumbImageUrl(profileImageHash, "320x320") : null,
		[profileImageHash],
	);

	const selfCard = useMemo((): BrowseCard | null => {
		if (!userId) return null;
		return {
			profileId: String(userId),
			displayName: ownDisplayName ?? undefined,
			primaryImageUrl: selfCardImageUrl ?? undefined,
			onlineUntil: Date.now() + 60 * 60 * 1000,
			distanceMeters: 0,
		};
	}, [userId, ownDisplayName, selfCardImageUrl]);

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

		if (hiddenProfileIds.size > 0) {
			results = results.filter((card) => !hiddenProfileIds.has(card.profileId));
		}

		if (browseFilters.isVisiting) {
			results = results.filter((card) => card.isVisiting === true);
		}

		if (nicknameFilter) {
			const lower = nicknameFilter.toLowerCase();
			results = results.filter((card) =>
				card.displayName?.toLowerCase().includes(lower),
			);
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

		if (selfCard) {
			results = [selfCard, ...results.filter((c) => c.profileId !== selfCard.profileId)];
		}

		return results;
	}, [cards, sortBy, showDebugInfo, hiddenProfileIds, browseFilters.isVisiting, nicknameFilter, searchTerm, favoriteNotes, selfCard]);

	const selectedBrowseCard = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}
		if (selfCard && activeProfileId === selfCard.profileId) {
			return selfCard;
		}
		return cards.find((card) => card.profileId === activeProfileId) ?? null;
	}, [activeProfileId, cards, selfCard]);

	const selectedProfileChatContact = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return chatContactIndexByProfileId[activeProfileId] ?? null;
	}, [activeProfileId, chatContactIndexByProfileId]);

	const selectedProfileLocalNickname = useMemo(() => {
		if (!activeProfileId) {
			return null;
		}

		return localNicknamesByProfileId[activeProfileId] ?? null;
	}, [activeProfileId, localNicknamesByProfileId]);

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

	const handleTagClick = (tag: string) => {
		setTags([tag]);
		setActiveProfileId(null);
		toast.success(t("browse_page.toasts.tag_filter_applied", { tag }));
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
				removeProfileFromBrowseCache(targetProfileId);
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

			if (isBlockConfirmSkipped()) {
				await performBlockProfile(targetProfileId);
				return;
			}

			setDontAskAgainChecked(false);
			setPendingProfileConfirm({ action: "block", profileId: targetProfileId });
		},
		[isBlockingProfile, isUnblockingProfile, performBlockProfile],
	);

	const handleUnblockProfile = useCallback(
		async (targetProfileId: string) => {
			if (isBlockingProfile || isUnblockingProfile) {
				return;
			}

			// Unblocking isn't destructive, so it never needs a confirmation prompt.
			await performUnblockProfile(targetProfileId);
		},
		[isBlockingProfile, isUnblockingProfile, performUnblockProfile],
	);

	const handleHideProfile = useCallback(
		(targetProfileId: string) => {
			const card = cards.find((c) => c.profileId === targetProfileId);
			const isActive = String(activeProfile?.profileId) === targetProfileId;
			const displayName = (isActive ? activeProfile?.displayName : null) ?? card?.displayName ?? null;
			const avatarMediaHash = (isActive ? activeProfile?.profileImageMediaHash : null) ?? null;
			void hideProfileLocally(targetProfileId, displayName, avatarMediaHash);
			toast.success(t("profile_details.hide_success"));
		},
		[activeProfile, cards, t],
	);

	const handleUnhideProfile = useCallback(
		(targetProfileId: string) => {
			void unhideProfileLocally(targetProfileId);
			toast.success(t("profile_details.unhide_success"));
		},
		[t],
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

		const { profileId } = pendingProfileConfirm;
		if (dontAskAgainChecked && typeof window !== "undefined") {
			localStorage.setItem(SKIP_BLOCK_CONFIRM_KEY, "true");
		}

		setPendingProfileConfirm(null);
		await performBlockProfile(profileId);
	}, [
		dontAskAgainChecked,
		pendingProfileConfirm,
		performBlockProfile,
		isBlockingProfile,
		isUnblockingProfile,
	]);

	const isIncognitoActive = getIncognitoMode();

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
				className="app-screen flex h-dvh flex-col w-full !px-0 !pb-0 overflow-x-hidden"
				contentClassName="flex flex-1 flex-col min-h-0"
				style={{ overflow: "visible", overflowX: "hidden" }}
				isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 5}
				onRefresh={async () => {
					if (isIncognitoActive) {
						return;
					}
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
				isDisabled={isLoadingCards || isLoadingMoreCards || isIncognitoActive}
				refreshingLabel={t("browse_page.refreshing_feed")}
			>
				<header ref={headerRef} className="relative z-20 flex shrink-0 flex-col pb-2 pointer-events-none">
					<PageHeaderBackground color={exploreLocation ? EXPLORE_COLOR : "var(--accent)"} />
					<div className="pointer-events-auto px-[var(--app-px)] sm:px-4">
					<div>
						<div>
							<div className="mb-1 flex items-center gap-2">
								<div ref={accountSwitcherRef} className="relative shrink-0">
									<button
										type="button"
										onClick={() => {
											if (savedAccounts.length <= 1) {
												navigate("/settings");
											} else {
												setIsAccountSwitcherOpen((v) => !v);
											}
										}}
										className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2 ring-transparent transition-all hover:ring-[var(--border)] hover:brightness-110 active:scale-95"
										aria-label={t("browse_page.open_settings")}
										aria-expanded={isAccountSwitcherOpen}
										title={t("browse_page.settings")}
									>
										<Avatar
											src={profilePhotoUrl}
											alt={t("browse_page.your_profile_photo")}
											className="h-full w-full"
										/>
									</button>
									{isAccountSwitcherOpen && (
									<div className="absolute left-0 top-full z-50 mt-2 w-max min-w-[14rem] max-w-[calc(100vw-2*var(--app-px))] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
										<div className="flex flex-col gap-1">
											{savedAccounts.map((account) => {
												const isActive = userId != null && String(userId) === account.profileId;
												const isSwitching = switchingProfileId === account.profileId;
												const savedProfile = getSavedAccountProfile(account.profileId);
												return (
													<button
														key={account.profileId}
														type="button"
														onClick={() => void handleSwitchAccount(account.profileId)}
														disabled={isActive || isSwitching}
														className="flex min-w-0 items-center gap-2.5 rounded-sm px-1.5 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:cursor-default"
													>
														<div className="relative h-10 w-10 shrink-0">
															<Avatar
																src={savedProfile.photoHash ? getThumbImageUrl(savedProfile.photoHash, "75x75") : null}
																alt=""
																className="h-full w-full rounded-full border-0"
															/>
															{isSwitching && (
																<div className="absolute inset-0 flex items-center justify-center rounded-full bg-[var(--surface)]/80">
																	<Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
																</div>
															)}
															{isActive && (
																<div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)] text-white ring-2 ring-[var(--surface)]">
																	<Check className="h-2.5 w-2.5" strokeWidth={3} />
																</div>
															)}
														</div>
														<div className="min-w-0 flex-1">
															<p className="truncate text-sm font-semibold leading-snug text-[var(--text)]">
																{savedProfile.displayName || t("settings.account_unnamed", { defaultValue: "Someone" })}
															</p>
															{account.email && (
																<p className="truncate text-xs text-[var(--text-muted)] leading-snug mt-0.5">
																	{account.email}
																</p>
															)}
														</div>
													</button>
												);
											})}
										</div>
										<div className="-mx-3 mt-2 border-t border-[var(--border)] px-3 pt-2">
											<button
												type="button"
												onClick={() => { setIsAccountSwitcherOpen(false); navigate("/settings"); }}
												className="flex w-full items-center justify-center gap-1.5 rounded-sm py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
											>
												<Settings className="h-3.5 w-3.5" />
												{t("browse_page.settings")}
											</button>
										</div>
									</div>
								)}
								</div>

								<div
									className="glass-pill inline-flex h-12 w-full items-center overflow-hidden transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--pill-color,var(--accent))_26%,transparent)] has-[button:active]:bg-[color-mix(in_srgb,var(--pill-color,var(--accent))_38%,transparent)]"
									style={{ "--pill-color": exploreLocation ? EXPLORE_COLOR : "var(--accent)" } as React.CSSProperties}
								>
									<button
										type="button"
										onClick={() => setIsLocationOpen(true)}
										className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-2 pr-3 text-left"
									>
										<div
											className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
											style={{
												backgroundColor: exploreLocation ? EXPLORE_COLOR : "var(--accent)",
												boxShadow: `0 1px 8px 0 ${exploreLocation ? EXPLORE_COLOR : "var(--accent)"}4d`,
											}}
										>
											{exploreLocation ? (
												<Search className="h-3.5 w-3.5" />
											) : useAutoLocation ? (
												<Navigation className="h-3.5 w-3.5" />
											) : (
												<MapPin className="h-3.5 w-3.5" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-semibold leading-tight text-[var(--text)]">
												{exploreLocation
													? t("browse_location.exploring_badge")
													: useAutoLocation
														? t("browse_location.mode_gps")
														: t("browse_location.mode_manual")}
											</p>
											<p className="truncate text-[10px] font-medium leading-tight text-[var(--text-muted)]">
												{exploreLocation ? exploreLocation.label : locationName || t("browse_page.current_location")}
											</p>
										</div>
									</button>
									{exploreLocation && (
										<button
											type="button"
											onClick={(e) => { e.stopPropagation(); setExploreLocation(null); }}
											title={t("browse_location.stop_explore")}
											className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
											aria-label={t("browse_location.stop_explore")}
										>
											<X className="h-3.5 w-3.5" />
										</button>
									)}
									<div className="mx-1 h-6 w-px bg-[var(--border)] opacity-40" />
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); void handleToggleDistance(); }}
										disabled={isTogglingDistance}
										title={showDistance ? t("browse_page.distance_visible", { defaultValue: "Distance visible to others" }) : t("browse_page.distance_hidden", { defaultValue: "Distance hidden from others" })}
										className="group flex h-12 shrink-0 flex-col items-center justify-center gap-[3px] pl-3 pr-4 transition active:scale-90 disabled:opacity-50"
									>
										{showDistance
											? <Eye className={`h-3.5 w-3.5 transition-colors ${exploreLocation ? "text-[var(--explore)]" : "text-[var(--accent)]"}`} />
											: <EyeOff
													className={cn(
														"h-3.5 w-3.5 transition-colors text-[var(--text-muted)]",
														exploreLocation ? "group-hover:text-[var(--explore)]" : "group-hover:text-[var(--accent)]",
													)}
												/>
										}
										<span
											className={cn(
												"block text-center text-[7px] font-bold uppercase leading-none transition-colors",
												showDistance
													? exploreLocation ? "text-[var(--explore)]" : "text-[var(--accent)]"
													: exploreLocation
														? "text-[var(--text-muted)] group-hover:text-[var(--explore)]"
														: "text-[var(--text-muted)] group-hover:text-[var(--accent)]",
											)}
										>
											dist
										</span>
									</button>
								</div>
							</div>

							<div className="-mx-[var(--app-px)] overflow-x-auto pb-1 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<div className="flex min-w-max items-center gap-2 px-[var(--app-px)] ml-auto">
									<button
										type="button"
										onClick={() => setIsFiltersOpen(true)}
										className={cn(
											"inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95",
											hasActiveBrowseFilters
												? exploreLocation
													? "rounded-full border border-[var(--explore)] bg-[var(--explore)] text-white shadow-lg shadow-[var(--explore)]/40"
													: "rounded-full border border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-lg shadow-[var(--accent)]/40"
												: exploreLocation
													? "glass-pill text-[var(--explore)] hover:border-[var(--explore)]/60 hover:bg-[var(--explore)]/20"
													: "glass-pill text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
										)}
										style={
											!hasActiveBrowseFilters
												? ({ "--pill-color": exploreLocation ? "var(--explore)" : "var(--accent)" } as React.CSSProperties)
												: undefined
										}
									>
										<SlidersHorizontal className="h-3.5 w-3.5" />
										{t("right_now.filters")}
										{hasActiveBrowseFilters ? (
											<span
												className={cn(
													"ml-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold",
													exploreLocation ? "bg-white text-[var(--explore)]" : "bg-[var(--accent-contrast)] text-[var(--accent)]",
												)}
											>
												{activeFilterCount}
											</span>
										) : null}
									</button>

									<div
										className={cn(
											"glass-pill relative inline-flex items-center justify-center py-2 pl-4 pr-2 text-sm font-bold transition-colors",
											exploreLocation
												? "text-[var(--explore)] hover:border-[var(--explore)]/60 hover:bg-[var(--explore)]/20"
												: "text-[var(--accent)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/20",
										)}
										style={{ "--pill-color": exploreLocation ? "var(--explore)" : "var(--accent)" } as React.CSSProperties}
									>
										<ListFilter className="mr-1.5 h-4 w-4 shrink-0" />
										<select
											value={sortBy}
											onChange={(e) => setSortBy(e.target.value as BrowseSortOption)}
											className="appearance-none bg-transparent cursor-pointer outline-none w-full h-full pr-3 pl-2"
										>
											<option value="default">{t("browse_filters.sort.default")}</option>
											{!exploreLocation && <option value="distance">{t("browse_filters.sort.distance")}</option>}
											{!exploreLocation && <option value="age-asc">{t("browse_filters.sort.youngest")}</option>}
											{!exploreLocation && <option value="age-desc">{t("browse_filters.sort.oldest")}</option>}
											{!exploreLocation && <option value="popular">{t("browse_filters.sort.popular")}</option>}
											<option value="name">{t("browse_filters.sort.name_az")}</option>
										</select>
									</div>

									{!exploreLocation && (
										<FilterPill
											icon={<Star className={`h-3.5 w-3.5 ${browseFilters.favorites ? "fill-current" : ""}`} />}
											label={t("browse_filters.options.favorites")}
											active={Boolean(browseFilters.favorites)}
											onClick={() =>
												setBrowseFilters((prev: typeof browseFilters) => ({
													...prev,
													favorites: !prev.favorites,
												}))
											}
											color="accent"
										/>
									)}

									<FilterPill
										icon={<span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500 shadow-sm" />}
										label={t("browse_filters.options.online")}
										active={Boolean(browseFilters.onlineOnly)}
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												onlineOnly: !prev.onlineOnly,
											}))
										}
										color={exploreLocation ? "explore" : "accent"}
									/>

									<FilterPill
										icon={<Plane className={`h-3.5 w-3.5 ${browseFilters.isVisiting ? "fill-current" : ""}`} />}
										label={t("profile_details.visiting")}
										active={Boolean(browseFilters.isVisiting)}
										onClick={() =>
											setBrowseFilters((prev: typeof browseFilters) => ({
												...prev,
												isVisiting: !prev.isVisiting,
											}))
										}
										color={exploreLocation ? "explore" : "accent"}
									/>

									{!exploreLocation && (
										<FilterPill
											icon={<RightNowIcon className="h-3.5 w-3.5" />}
											label={t("browse_filters.options.right_now")}
											active={Boolean(browseFilters.rightNow)}
											onClick={() =>
												setBrowseFilters((prev: typeof browseFilters) => ({
													...prev,
													rightNow: !prev.rightNow,
												}))
											}
											color="right-now"
										/>
									)}

									{hasActiveBrowseFilters ? (
										<button
											type="button"
											onClick={clearBrowseFilters}
											className={cn(
												"glass-pill inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm font-bold transition-all active:scale-95",
												exploreLocation ? "text-[var(--explore)]" : "text-[var(--accent)]",
											)}
											style={{ "--pill-color": exploreLocation ? "var(--explore)" : "var(--accent)" } as React.CSSProperties}
										>
											{t("browse_filters.clear_all")}
										</button>
									) : null}

									<FilterPill
										icon={<Search className="h-3.5 w-3.5" />}
										label={t("grid.open_profile_by_id", { defaultValue: "Open Profile by ID" })}
										active={false}
										onClick={() => { setProfileSearchInput(""); setIsProfileSearchOpen(true); }}
										color={exploreLocation ? "explore" : "accent"}
									/>

									{isDesktop && (
										<FilterPill
											variant="icon"
											icon={
												<RefreshCw
													className={cn("h-3.5 w-3.5", isManualRefreshing && "animate-spin")}
												/>
											}
											label={t("grid.refresh", { defaultValue: "Refresh grid" })}
											active={false}
											onClick={() => void handleManualRefresh()}
											color={exploreLocation ? "explore" : "accent"}
										/>
									)}
								</div>
							</div>

							{!exploreLocation && browseFilters.favorites && (
								<div className="pt-2">
									<div
										className="glass-pill relative flex h-10 items-center"
										style={{ "--pill-color": "var(--accent)" } as React.CSSProperties}
									>
										{isFetchingNotes ? (
											<div className="pointer-events-none absolute left-3 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
												<div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
											</div>
										) : (
											<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
										)}
										<input
											type="text"
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
											placeholder={isFetchingNotes ? t("favorites.loading_notes") : t("favorites.search_placeholder")}
											className="h-full w-full bg-transparent pl-9 pr-8 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
											onKeyDown={(e) => {
												if (e.key === "Escape" || e.key === "Enter") {
													e.currentTarget.blur();
												}
											}}
										/>
										{searchTerm && (
											<button
												type="button"
												onClick={() => setSearchTerm("")}
												className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										)}
									</div>
								</div>
							)}
						</div>
					</div>
					</div>
				</header>

				<FeedScrollContainer ref={feedContainerRef}>
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
							isLocationMissing={isLocationMissing}
							isIncognitoActive={isIncognitoActive}
							onOpenLocation={() => setIsLocationOpen(true)}
							onManagePrivacy={() => navigate("/settings/privacy")}
							cards={sortedCards}
							chatContactIndexByProfileId={
								(SHOW_DEMO_DATA && showDebugInfo)
									? { ...DEMO_CHAT_STATUS, ...chatContactIndexByProfileId }
									: chatContactIndexByProfileId
							}
							localNicknamesByProfileId={localNicknamesByProfileId}
							onSelectProfile={handleSelectProfile}
							onMessageProfile={handleMessageProfile}
							hasMore={nextPage !== null && !(nicknameFilter && loadedPageCount >= NICKNAME_FILTER_MAX_PAGES)}
							isLoadingMore={isLoadingMoreCards}
							onLoadMore={() => {
								void handleLoadMoreCards();
							}}
							scrollContainerRef={feedContainerRef}
							headerRef={headerRef}
							browseCacheKey={browseCacheKey}
							hasRestoredScroll={hasRestoredScroll}
							onRestoredScrollChange={setHasRestoredScroll}
						/>
					</div>
				</FeedScrollContainer>
			</PullToRefreshContainer>

			<ProfileDetailsModal
				isOpen={Boolean(activeProfileId)}
				onClose={() => setActiveProfileId(null)}
				onMessageProfile={handleMessageProfile}
				onTagClick={handleTagClick}
				onTriangleProfile={handleTriangleProfile}
				onBlockProfile={handleBlockProfile}
				onUnblockProfile={handleUnblockProfile}
				onHideProfile={handleHideProfile}
				onUnhideProfile={handleUnhideProfile}
				isHidden={activeProfileId ? hiddenProfileIds.has(activeProfileId) : false}
				onToggleFavoriteProfile={handleToggleFavoriteProfile}
				isFavorite={Boolean(activeProfile?.isFavorite)}
				isTogglingFavorite={Boolean(
					activeProfileId && mutatingFavoriteProfileId === activeProfileId,
				)}
				isBlocked={activeProfileId ? blockedProfileIds.has(activeProfileId) : false}
				isBlockedByOther={isActiveProfileBlockedByOther}
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
				localNickname={selectedProfileLocalNickname}
				genderOptions={genderOptions}
				pronounOptions={pronounOptions}
			/>

			<ConfirmDialog
				isOpen={pendingProfileConfirm !== null}
				title={t("profile_details.block")}
				message={t("profile_details.block_confirm")}
				confirmLabel={t("profile_details.block")}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={handleConfirmProfileAction}
				onCancel={handleCancelProfileConfirm}
				isProcessing={isBlockingProfile || isUnblockingProfile}
				confirmTone="danger"
				dontAskAgainLabel={t("profile_details.dont_ask_again")}
				dontAskAgainChecked={dontAskAgainChecked}
				onDontAskAgainChange={setDontAskAgainChecked}
			/>

			{isLocationOpen && (
				<LocationOverlay
					onClose={() => setIsLocationOpen(false)}
					exploreLocation={exploreLocation}
					onSetExploreLocation={setExploreLocation}
				/>
			)}

			{isFiltersOpen && (
				<BrowseFiltersOverlay
					initialDraft={{
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
						nicknameFilter,
					} satisfies BrowseFiltersDraft}
					onClose={() => setIsFiltersOpen(false)}
					onApply={(draft) => {
						applyDraft(draft);
						setIsFiltersOpen(false);
					}}
					isExploreActive={Boolean(exploreLocation)}
				/>
			)}

			<dialog
				ref={profileSearchDialogRef}
				className="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/45"
				onClick={(e) => { if (e.target === profileSearchDialogRef.current) setIsProfileSearchOpen(false); }}
				onKeyDown={(e) => { if (e.key === "Escape") setIsProfileSearchOpen(false); }}
			>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						const id = profileSearchInput.trim();
						if (!id) return;
						setIsProfileSearchOpen(false);
						handleSelectProfile(id);
					}}
					className="p-4"
				>
					<p className="text-sm font-semibold text-[var(--text)]">Open Profile by ID</p>
					<p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">
						Got a profile ID from a link? Paste it here to jump straight to that profile.
					</p>
					<input
						autoFocus
						type="number"
						inputMode="numeric"
						value={profileSearchInput}
						onChange={(e) => setProfileSearchInput(e.target.value)}
						placeholder="123456789"
						className="input-field mt-4"
					/>
					<div className="mt-4 flex gap-2">
						<button
							type="button"
							onClick={() => setIsProfileSearchOpen(false)}
							className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={!profileSearchInput.trim()}
							className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
						>
							<Search className="h-4 w-4" />
							Open Profile
						</button>
					</div>
				</form>
			</dialog>
		</>
	);
}
