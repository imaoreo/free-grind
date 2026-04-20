import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CircleUserRound, MapPin } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useEffect, useMemo, useState } from "react";
import z from "zod";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash } from "../../utils/geohash";
import {
	browseCardSchema,
	browseProfileSchema,
	cascadeResponseSchema,
	geocodeResultSchema,
	profileDetailResponseSchema,
	type BrowseCard,
	type GeocodeResult,
	type ManagedOption,
	type ProfileDetail,
	type SelectedLocation,
} from "./GridPage.types";
import { BrowseGrid } from "./gridpage/components/BrowseGrid";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";
import { ProfileDetailsModal } from "./gridpage/components/ProfileDetailsModal";
import { isCurrentlyOnline } from "./gridpage/utils";

export function GridPage() {
	const { userId } = useAuth();
	const { fetchRest } = useApi();
	const {
		geohash,
		setPreferences,
		isLoading: isLoadingPreferences,
	} = usePreferences();
	const navigate = useNavigate();
	const [cards, setCards] = useState<BrowseCard[]>([]);
	const [isLoadingCards, setIsLoadingCards] = useState(true);
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
			try {
				const gendersResponse = await fetchRest("/public/v2/genders");
				const pronounsResponse = await fetchRest("/v1/pronouns");

				if (gendersResponse.status >= 200 && gendersResponse.status < 300) {
					const parsed = z
						.array(
							z.object({
								genderId: z.number(),
								gender: z.string(),
							}),
						)
						.parse(gendersResponse.json());
					setGenderOptions(
						parsed.map((item) => ({
							value: item.genderId,
							label: item.gender,
						})),
					);
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
					setPronounOptions(
						parsed.map((item) => ({
							value: item.pronounId,
							label: item.pronoun,
						})),
					);
				}
			} catch {
				setGenderOptions([]);
				setPronounOptions([]);
			}
		};

		void loadManagedOptions();
	}, [fetchRest]);

	useEffect(() => {
		if (!userId) {
			setProfileImageHash(null);
			return;
		}

		let cancelled = false;

		const loadProfilePhoto = async () => {
			try {
				const response = await fetchRest(`/v7/profiles/${userId}`);

				if (response.status < 200 || response.status >= 300) {
					if (!cancelled) {
						setProfileImageHash(null);
					}
					return;
				}

				const parsed = browseProfileSchema.parse(response.json());
				const mediaHashFromList = parsed.profiles[0]?.medias
					?.map((item) => item.mediaHash ?? "")
					.find((hash) => validateMediaHash(hash));
				const mediaHashFromProfile = parsed.profiles[0]?.profileImageMediaHash;
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
	}, [fetchRest, userId]);

	useEffect(() => {
		let cancelled = false;

		const loadBrowseCards = async () => {
			if (isLoadingPreferences) {
				return;
			}

			setIsLoadingCards(true);
			setCardsError(null);

			if (!geohash) {
				if (!cancelled) {
					setCards([]);
					setCardsError(
						"Location is not set yet. Set your location first to load nearby profiles.",
					);
					setIsLoadingCards(false);
				}
				return;
			}

			try {
				const response = await fetchRest(
					`/v4/cascade?nearbyGeoHash=${encodeURIComponent(geohash)}`,
				);

				if (response.status < 200 || response.status >= 300) {
					throw new Error(
						`Failed to load browse profiles (${response.status})`,
					);
				}

				const parsed = cascadeResponseSchema.parse(response.json());
				const nextCards: BrowseCard[] = [];

				for (const item of parsed.items) {
					if (
						item.type !== "full_profile_v1" &&
						item.type !== "partial_profile_v1"
					) {
						continue;
					}

					const candidate = browseCardSchema.safeParse(item.data);
					if (candidate.success) {
						nextCards.push(candidate.data);
					}
				}

				if (!cancelled) {
					setCards(nextCards);
				}
			} catch (error) {
				if (!cancelled) {
					setCards([]);
					setCardsError(
						error instanceof Error
							? error.message
							: "Failed to load browse profiles",
					);
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
	}, [fetchRest, geohash, isLoadingPreferences]);

	useEffect(() => {
		if (!activeProfileId) {
			setActiveProfile(null);
			setActiveProfileError(null);
			setIsLoadingActiveProfile(false);
			return;
		}

		let cancelled = false;

		const loadProfileDetails = async () => {
			setIsLoadingActiveProfile(true);
			setActiveProfileError(null);

			try {
				const response = await fetchRest(`/v7/profiles/${activeProfileId}`);

				if (response.status < 200 || response.status >= 300) {
					throw new Error(
						`Failed to load profile details (${response.status})`,
					);
				}

				const parsed = profileDetailResponseSchema.parse(response.json());

				if (!cancelled) {
					setActiveProfile(parsed.profiles[0]);
				}
			} catch (error) {
				if (!cancelled) {
					setActiveProfile(null);
					setActiveProfileError(
						error instanceof Error
							? error.message
							: "Failed to load profile details",
					);
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
	}, [activeProfileId, fetchRest]);

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
							className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-all hover:scale-[1.03]"
							aria-label="Open settings"
							title="Settings"
						>
							{profilePhotoUrl ? (
								<img
									src={profilePhotoUrl}
									alt="Your profile photo"
									className="h-full w-full rounded-full object-cover"
								/>
							) : (
								<CircleUserRound className="h-6 w-6" />
							)}
						</button>
					</div>
					<p className="app-subtitle">
						Discover people near you and jump into chats from the main feed.
					</p>
				</header>

				<div className="mb-4 grid gap-3 sm:grid-cols-3">
					<div className="surface-card rounded-2xl p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
							Profiles in feed
						</p>
						<p className="mt-2 text-2xl font-semibold">{cards.length}</p>
					</div>
					<div className="surface-card rounded-2xl p-4">
						<p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
							Online now
						</p>
						<p className="mt-2 text-2xl font-semibold">{onlineCount}</p>
					</div>
					<div className="surface-card rounded-2xl p-4">
						<button
							type="button"
							onClick={() => setIsSettingLocation((current) => !current)}
							className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-medium"
						>
							<MapPin className="h-4 w-4" />
							{geohash ? "Change location" : "Set location"}
						</button>
					</div>
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
					onSelectProfile={setActiveProfileId}
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
