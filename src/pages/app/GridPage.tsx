import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash } from "../../utils/geohash";
import {
	geocodeResultSchema,
	type BrowseCard,
	type GeocodeResult,
	type ManagedOption,
	type ProfileDetail,
	type SelectedLocation,
} from "./GridPage.types";
import { BrowseGrid } from "./gridpage/components/BrowseGrid";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";
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
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";

export function GridPage() {
	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const {
		geohash,
		setPreferences,
		isLoading: isLoadingPreferences,
	} = usePreferences();
	const navigate = useNavigate();
	const [cards, setCards] = useState<BrowseCard[]>([]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
	const [isLoadingMoreCards, setIsLoadingMoreCards] = useState(false);
	const [nextPage, setNextPage] = useState<number | null>(null);
	const [cardsError, setCardsError] = useState<string | null>(null);
	const [profileImageHash, setProfileImageHash] = useState<string | null>(null);
	const [isSettingLocation, setIsSettingLocation] = useState(false);
	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(false);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
	const [selectedLocation, setSelectedLocation] =
		useState<SelectedLocation | null>(null);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);

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
		let cancelled = false;

		const loadBrowseCards = async (page?: number) => {
			if (isLoadingPreferences) {
				return;
			}

			if (!geohash) {
				if (!cancelled) {
					setIsLoadingCards(true);
					setCards([]);
					setCardsError(
						"Location is not set yet. Set your location first to load nearby profiles.",
					);
					setIsLoadingCards(false);
				}
				return;
			}

			const cachedCards = getCachedBrowseCards(geohash);
			setCardsError(null);

			if (cachedCards) {
				if (!cancelled) {
					setCards(cachedCards);
					setIsLoadingCards(false);
				}
			} else {
				setIsLoadingCards(true);
			}

			try {
				const parsed = await apiFunctions.getBrowseCards({
					geohash,
					page,
				});

				if (!cancelled) {
					setCards(parsed.cards);
					setCachedBrowseCards(geohash, parsed.cards);
					setNextPage(parsed.nextPage ?? null);
				}
			} catch (error) {
				if (!cancelled) {
					if (!cachedCards) {
						setCards([]);
						setCardsError(
							error instanceof Error
								? error.message
								: "Failed to load browse profiles",
						);
					}
				}
			} finally {
				if (!cancelled) {
					setIsLoadingCards(false);
				}
			}
		};

		void loadBrowseCards();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, geohash, isLoadingPreferences]);

	const handleLoadMoreCards = async () => {
		if (!geohash || !nextPage || isLoadingMoreCards) return;
		setIsLoadingMoreCards(true);
		let cancelled = false;
		try {
			const parsed = await apiFunctions.getBrowseCards({
				geohash,
				page: nextPage,
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

	const updateLocationPreference = async (
		lat: number,
		lon: number,
		label?: string,
	) => {
		const nextGeohash = encodeGeohash(lat, lon);
		await setPreferences({ geohash: nextGeohash });
		setSelectedLocation({
			lat,
			lon,
			label: label ?? `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
		});
		setIsSettingLocation(false);
		setIsMapPickerOpen(false);
		setMapPickerError(null);
	};

	const handleUseCurrentLocation = async () => {
		if (!("geolocation" in navigator)) {
			setCardsError("Geolocation is unavailable on this device.");
			return;
		}

		setIsDetectingLocation(true);

		try {
			const position = await new Promise<GeolocationPosition>(
				(resolve, reject) => {
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						timeout: 12000,
						maximumAge: 20000,
					});
				},
			);

			await updateLocationPreference(
				position.coords.latitude,
				position.coords.longitude,
				"Current location",
			);
			setCardsError(null);
		} catch {
			setCardsError(
				"Could not access your location. Check location permissions and try again.",
			);
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const handleSearchLocation = async (event: React.FormEvent) => {
		event.preventDefault();
		const query = locationQuery.trim();

		if (!query) {
			setLocationResults([]);
			return;
		}

		setIsSearchingLocation(true);

		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
					query,
				)}`,
			);

			if (!response.ok) {
				throw new Error("Failed to search location");
			}

			const parsed = z.array(geocodeResultSchema).parse(await response.json());
			setLocationResults(parsed);
		} catch {
			setCardsError("Location search failed. Try again in a moment.");
		} finally {
			setIsSearchingLocation(false);
		}
	};

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
			navigate(`/profile/${profileId}`);
			return;
		}

		setActiveProfileId(profileId);
	};

	const handleMessageProfile = (profileId: string) => {
		navigate(`/chat?targetProfileId=${encodeURIComponent(profileId)}`);
	};

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-6xl">
				<header className="mb-6">
					<div className="mb-2 flex items-start justify-between gap-4">
						<div>
							<h1 className="app-title">Browse Profiles</h1>
							<p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
								Nearby
							</p>
						</div>
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
					<p className="app-subtitle">
						Discover people near you and jump into chats from the main feed.
					</p>
				</header>

				<div className="mb-4 grid gap-3 sm:grid-cols-3">
					<Card className="rounded-2xl p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
							Profiles in feed
						</p>
						<p className="mt-2 text-2xl font-semibold">{cards.length}</p>
					</Card>
					<Card className="rounded-2xl p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
							Online now
						</p>
						<p className="mt-2 text-2xl font-semibold">{onlineCount}</p>
					</Card>
					<Card className="rounded-2xl p-4">
						<Button
							type="button"
							onClick={() => setIsSettingLocation((current) => !current)}
							className="w-full"
						>
							<MapPin className="h-4 w-4" />
							{geohash ? "Change location" : "Set location"}
						</Button>
					</Card>
				</div>

				<LocationSettingsPanel
					isVisible={isSettingLocation || !geohash}
					hasGeohash={Boolean(geohash)}
					isDetectingLocation={isDetectingLocation}
					onUseCurrentLocation={() => {
						void handleUseCurrentLocation();
					}}
					onDone={() => setIsSettingLocation(false)}
					locationQuery={locationQuery}
					onLocationQueryChange={setLocationQuery}
					isSearchingLocation={isSearchingLocation}
					onSearchLocation={handleSearchLocation}
					locationResults={locationResults}
					onChooseLocation={(lat, lon, label) => {
						void updateLocationPreference(lat, lon, label);
					}}
					selectedLocation={selectedLocation}
					isMapPickerOpen={isMapPickerOpen}
					mapPickerError={mapPickerError}
					onToggleMapPicker={() => {
						setMapPickerError(null);
						setIsMapPickerOpen((current) => !current);
					}}
					onMapPick={(lat, lon) => {
						setSelectedLocation({
							lat,
							lon,
							label: `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
						});
					}}
					onMapPickerError={setMapPickerError}
					onUseSelectedLocation={() => {
						if (!selectedLocation) {
							return;
						}

						void updateLocationPreference(
							selectedLocation.lat,
							selectedLocation.lon,
							selectedLocation.label,
						);
					}}
				/>

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
					activeProfile={activeProfile}
					selectedBrowseCard={selectedBrowseCard}
					isLoadingActiveProfile={isLoadingActiveProfile}
					activeProfileError={activeProfileError}
					activeProfilePhotoHashes={activeProfilePhotoHashes}
					genderOptions={genderOptions}
					pronounOptions={pronounOptions}
				/>
			</div>
		</section>
	);
}
