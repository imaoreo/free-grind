import { useAuth } from "../../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
	CircleUserRound,
	Crosshair,
	Flame,
	Loader2,
	MapPin,
	MessageCircle,
	Search,
	Shield,
	X,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useEffect, useMemo, useRef, useState } from "react";
import z from "zod";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash } from "../../utils/geohash";

const browseProfileSchema = z.object({
	profiles: z
		.array(
			z.object({
				profileImageMediaHash: z.string().nullable().optional(),
				medias: z
					.array(z.object({ mediaHash: z.string().optional() }))
					.optional()
					.default([]),
			}),
		)
		.length(1),
});

const cascadeItemSchema = z.object({
	type: z.string(),
	data: z.unknown(),
});

const cascadeResponseSchema = z.object({
	items: z.array(cascadeItemSchema).optional().default([]),
	nextPage: z.number().nullable().optional(),
});

const browseCardSchema = z.object({
	profileId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	displayName: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	distanceMeters: z.number().nullable().optional(),
	primaryImageUrl: z.string().nullable().optional(),
	onlineUntil: z.number().nullable().optional(),
	isPopular: z.boolean().optional(),
	unreadCount: z.number().optional(),
	rightNow: z.unknown().optional(),
});

type BrowseCard = z.infer<typeof browseCardSchema>;

const geocodeResultSchema = z.object({
	display_name: z.string(),
	lat: z.string(),
	lon: z.string(),
});

type GeocodeResult = z.infer<typeof geocodeResultSchema>;

const lookingForLabels: Record<number, string> = {
	2: "Chat",
	3: "Dates",
	4: "Friends",
	5: "Networking",
	6: "Relationship",
	7: "Hookups",
};

const relationshipStatusLabels: Record<number, string> = {
	1: "Single",
	2: "Dating",
	3: "Exclusive",
	4: "Committed",
	5: "Partnered",
	6: "Engaged",
	7: "Married",
	8: "Open Relationship",
};

const bodyTypeLabels: Record<number, string> = {
	1: "Toned",
	2: "Average",
	3: "Large",
	4: "Muscular",
	5: "Slim",
	6: "Stocky",
};

const ethnicityLabels: Record<number, string> = {
	1: "Asian",
	2: "Black",
	3: "Latino",
	4: "Middle Eastern",
	5: "Mixed",
	6: "Native American",
	7: "White",
	8: "Other",
	9: "South Asian",
};

const sexualPositionLabels: Record<number, string> = {
	1: "Top",
	2: "Bottom",
	3: "Versatile",
	4: "Vers Bottom",
	5: "Vers Top",
	6: "Side",
};

const meetAtLabels: Record<number, string> = {
	1: "My Place",
	2: "Your Place",
	3: "Bar",
	4: "Coffee Shop",
	5: "Restaurant",
};

const hivStatusLabels: Record<number, string> = {
	1: "Negative",
	2: "Negative, on PrEP",
	3: "Positive",
	4: "Positive, undetectable",
};

const sexualHealthLabels: Record<number, string> = {
	1: "Condoms",
	2: "I'm on doxyPEP",
	3: "I'm on PrEP",
	4: "I'm HIV undetectable",
	5: "Prefer to discuss",
};

const vaccineLabels: Record<number, string> = {
	1: "COVID-19",
	2: "Monkeypox",
	3: "Meningitis",
};

const tribeLabels: Record<number, string> = {
	1: "Bear",
	2: "Clean-Cut",
	3: "Daddy",
	4: "Discreet",
	5: "Geek",
	6: "Jock",
	7: "Leather",
	8: "Otter",
	9: "Poz",
	10: "Rugged",
	11: "Sober",
	12: "Trans",
	13: "Twink",
};

const profileDetailItemSchema = z.object({
	profileId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	displayName: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	onlineUntil: z.number().nullable().optional(),
	lastSeen: z.number().nullable().optional(),
	distanceMeters: z.number().nullable().optional(),
	aboutMe: z.string().nullable().optional(),
	profileTags: z.array(z.string()).optional().default([]),
	medias: z
		.array(z.object({ mediaHash: z.string().optional() }))
		.optional()
		.default([]),
	profileImageMediaHash: z.string().nullable().optional(),
	relationshipStatus: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	position: z.number().nullable().optional(),
	positions: z.array(z.number()).optional().default([]),
	hivStatus: z.number().nullable().optional(),
	lastTestedDate: z.number().nullable().optional(),
	rightNowText: z.string().nullable().optional(),
	lookingFor: z.array(z.number()).optional().default([]),
	meetAt: z.array(z.number()).optional().default([]),
	grindrTribes: z.array(z.number()).optional().default([]),
	genders: z.array(z.number()).optional().default([]),
	pronouns: z.array(z.number()).optional().default([]),
	sexualHealth: z.array(z.number()).optional().default([]),
	vaccines: z.array(z.number()).optional().default([]),
	socialNetworks: z
		.object({
			instagram: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			twitter: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			facebook: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
		})
		.optional(),
});

const profileDetailResponseSchema = z.object({
	profiles: z.array(profileDetailItemSchema).length(1),
});

type ProfileDetail = z.infer<typeof profileDetailItemSchema>;

function LeafletLocationPicker({
	selectedLocation,
	onPick,
	onError,
}: {
	selectedLocation: { lat: number; lon: number } | null;
	onPick: (lat: number, lon: number) => void;
	onError: (message: string) => void;
}) {
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const leafletRef = useRef<any>(null);

	useEffect(() => {
		let mounted = true;

		const initMap = async () => {
			try {
				const L = await import("leaflet");
				await import("leaflet/dist/leaflet.css");

				if (!mounted || !mapContainerRef.current || mapRef.current) {
					return;
				}

				leafletRef.current = L;

				const map = L.map(mapContainerRef.current, {
					zoomControl: true,
				}).setView(
					selectedLocation
						? [selectedLocation.lat, selectedLocation.lon]
						: [20, 0],
					selectedLocation ? 11 : 2,
				);

				L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				}).addTo(map);

				map.on("click", (event: any) => {
					onPick(event.latlng.lat, event.latlng.lng);
				});

				mapRef.current = map;

				if (selectedLocation) {
					markerRef.current = L.circleMarker(
						[selectedLocation.lat, selectedLocation.lon],
						{
							radius: 9,
							color: "#131821",
							fillColor: "#ffcc01",
							fillOpacity: 0.95,
						},
					).addTo(map);
				}
			} catch {
				onError(
					"Map picker failed to load on this device. Use location search or current location.",
				);
			}
		};

		void initMap();

		return () => {
			mounted = false;
			if (mapRef.current) {
				mapRef.current.off();
				mapRef.current.remove();
				mapRef.current = null;
				markerRef.current = null;
			}
		};
	}, [onError, onPick, selectedLocation]);

	useEffect(() => {
		const map = mapRef.current;
		const L = leafletRef.current;

		if (!map || !L || !selectedLocation) {
			return;
		}

		if (markerRef.current) {
			markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lon]);
		} else {
			markerRef.current = L.circleMarker(
				[selectedLocation.lat, selectedLocation.lon],
				{
					radius: 9,
					color: "#131821",
					fillColor: "#ffcc01",
					fillOpacity: 0.95,
				},
			).addTo(map);
		}

		map.setView(
			[selectedLocation.lat, selectedLocation.lon],
			Math.max(11, map.getZoom()),
		);
	}, [selectedLocation]);

	return <div ref={mapContainerRef} className="h-72 w-full" />;
}

function formatDistance(distanceMeters: number | null | undefined): string {
	if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
		return "Distance hidden";
	}

	if (distanceMeters < 1000) {
		return `${Math.max(0, Math.round(distanceMeters))} m away`;
	}

	return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

function isCurrentlyOnline(onlineUntil: number | null | undefined): boolean {
	if (!onlineUntil || !Number.isFinite(onlineUntil)) {
		return false;
	}

	return onlineUntil > Date.now();
}

function getDisplayName(card: BrowseCard): string {
	const value = card.displayName?.trim();
	if (value) {
		return value;
	}

	return `Profile ${card.profileId}`;
}

function getCardInitials(name: string): string {
	const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);

	if (parts.length === 0) {
		return "?";
	}

	return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function formatTimeAgo(timestamp: number | null | undefined): string {
	if (!timestamp || !Number.isFinite(timestamp)) {
		return "Unknown";
	}

	const diffMs = Date.now() - timestamp;
	if (diffMs <= 0) {
		return "Just now";
	}

	const minute = 60 * 1000;
	const hour = 60 * minute;
	const day = 24 * hour;

	if (diffMs < hour) {
		const minutes = Math.max(1, Math.floor(diffMs / minute));
		return `${minutes}m ago`;
	}

	if (diffMs < day) {
		const hours = Math.max(1, Math.floor(diffMs / hour));
		return `${hours}h ago`;
	}

	const days = Math.max(1, Math.floor(diffMs / day));
	return `${days}d ago`;
}

function formatOptionalNumber(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return String(value);
}

function formatEnumValue(
	value: number | null | undefined,
	labels: Record<number, string>,
): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return labels[value] ?? String(value);
}

function formatEnumArray(
	values: number[],
	labels: Record<number, string>,
): string {
	if (values.length === 0) {
		return "Not set";
	}

	return values.map((value) => labels[value] ?? String(value)).join(", ");
}

function formatHeightCm(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return `${value}cm`;
}

function formatWeightKg(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) {
		return "Not set";
	}

	return `${(value / 1000).toFixed(0)}kg`;
}

function shouldHideField(formattedValue: string | undefined): boolean {
	return !formattedValue || formattedValue === "Not set";
}

function getEnumLabel(
	value: number,
	options: Array<{ value: number; label: string }>,
): string {
	return options.find((opt) => opt.value === value)?.label ?? String(value);
}

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
	const [selectedLocation, setSelectedLocation] = useState<{
		lat: number;
		lon: number;
		label: string;
	} | null>(null);
	const [genderOptions, setGenderOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);
	const [pronounOptions, setPronounOptions] = useState<
		Array<{ value: number; label: string }>
	>([]);

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

	const activeProfileName = useMemo(() => {
		if (!activeProfile) {
			return "Profile details";
		}

		const value = activeProfile.displayName?.trim();
		if (value) {
			return value;
		}

		return `Profile ${activeProfile.profileId}`;
	}, [activeProfile]);

	const profileDistance =
		activeProfile?.distanceMeters ?? selectedBrowseCard?.distanceMeters ?? null;
	const profileOnlineUntil =
		activeProfile?.onlineUntil ?? selectedBrowseCard?.onlineUntil ?? null;
	const profileLastSeen = activeProfile?.lastSeen ?? null;

	const formattedActiveGenders = useMemo(() => {
		if (!activeProfile?.genders.length) {
			return "Not set";
		}

		return activeProfile.genders
			.map((genderId) => getEnumLabel(genderId, genderOptions))
			.join(", ");
	}, [activeProfile?.genders, genderOptions]);

	const formattedActivePronouns = useMemo(() => {
		if (!activeProfile?.pronouns.length) {
			return "Not set";
		}

		return activeProfile.pronouns
			.map((pronounId) => getEnumLabel(pronounId, pronounOptions))
			.join(", ");
	}, [activeProfile?.pronouns, pronounOptions]);

	const hasExpectationsFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumArray(activeProfile.lookingFor, lookingForLabels),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.meetAt, meetAtLabels)) ||
			!shouldHideField(
				formatEnumArray(activeProfile.grindrTribes, tribeLabels),
			) ||
			!shouldHideField(formattedActiveGenders) ||
			!shouldHideField(formattedActivePronouns) ||
			!shouldHideField(activeProfile.rightNowText?.trim())
		);
	}, [activeProfile, formattedActiveGenders, formattedActivePronouns]);

	const hasHealthFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumValue(activeProfile.hivStatus, hivStatusLabels),
			) ||
			Boolean(activeProfile.lastTestedDate) ||
			!shouldHideField(
				formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.vaccines, vaccineLabels))
		);
	}, [activeProfile]);

	const hasStatsFields = useMemo(() => {
		if (!activeProfile) return false;
		const positionFormatted =
			activeProfile.positions.length > 0
				? formatEnumArray(activeProfile.positions, sexualPositionLabels)
				: formatEnumValue(activeProfile.position, sexualPositionLabels);
		return (
			!shouldHideField(positionFormatted) ||
			!shouldHideField(formatHeightCm(activeProfile.height)) ||
			!shouldHideField(formatWeightKg(activeProfile.weight)) ||
			!shouldHideField(
				formatEnumValue(activeProfile.bodyType, bodyTypeLabels),
			) ||
			!shouldHideField(
				formatEnumValue(activeProfile.ethnicity, ethnicityLabels),
			) ||
			!shouldHideField(
				formatEnumValue(
					activeProfile.relationshipStatus,
					relationshipStatusLabels,
				),
			)
		);
	}, [activeProfile]);

	const hasSocialFields = useMemo(() => {
		if (!activeProfile) return false;
		return Boolean(
			activeProfile.socialNetworks?.instagram?.userId ||
			activeProfile.socialNetworks?.twitter?.userId ||
			activeProfile.socialNetworks?.facebook?.userId,
		);
	}, [activeProfile]);

	const hasTagsContent = useMemo(() => {
		if (!activeProfile) return false;
		return activeProfile.profileTags.length > 0;
	}, [activeProfile?.profileTags.length]);

	const hasAboutContent = useMemo(() => {
		if (!activeProfile) return false;
		return Boolean(activeProfile.aboutMe?.trim());
	}, [activeProfile?.aboutMe]);

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

				{(isSettingLocation || !geohash) && (
					<div className="surface-card mb-4 rounded-2xl p-4 sm:p-5">
						<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
							<div>
								<p className="text-sm font-semibold">
									Set your browse location
								</p>
								<p className="text-xs text-[var(--text-muted)]">
									Search a place, or use GPS on mobile devices.
								</p>
							</div>
							{geohash ? (
								<button
									type="button"
									onClick={() => setIsSettingLocation(false)}
									className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium"
								>
									Done
								</button>
							) : null}
						</div>

						<div className="grid gap-3">
							<button
								type="button"
								onClick={handleUseCurrentLocation}
								disabled={isDetectingLocation}
								className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 md:hidden"
							>
								{isDetectingLocation ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Crosshair className="h-4 w-4" />
								)}
								{isDetectingLocation
									? "Detecting location..."
									: "Use current location"}
							</button>

							<form onSubmit={handleSearchLocation} className="grid gap-2">
								<label className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
									Search by city or area
								</label>
								<div className="flex gap-2">
									<input
										type="text"
										value={locationQuery}
										onChange={(event) => setLocationQuery(event.target.value)}
										placeholder="e.g. Berlin, London, Manila"
										className="input-field"
									/>
									<button
										type="submit"
										disabled={isSearchingLocation}
										className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 disabled:cursor-not-allowed disabled:opacity-60"
									>
										{isSearchingLocation ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Search className="h-4 w-4" />
										)}
									</button>
								</div>
							</form>

							{locationResults.length > 0 && (
								<div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
									{locationResults.map((result) => (
										<button
											key={`${result.lat}:${result.lon}:${result.display_name}`}
											type="button"
											onClick={() =>
												void updateLocationPreference(
													Number(result.lat),
													Number(result.lon),
													result.display_name,
												)
											}
											className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-left text-xs text-[var(--text-muted)]"
										>
											{result.display_name}
										</button>
									))}
								</div>
							)}

							{selectedLocation ? (
								<p className="text-xs text-[var(--text-muted)]">
									Selected: {selectedLocation.label}
								</p>
							) : null}

							<div className="overflow-hidden rounded-xl border border-[var(--border)]">
								<div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] p-2.5">
									<p className="text-xs font-semibold text-[var(--text-muted)]">
										Map picker
									</p>
									<button
										type="button"
										onClick={() => {
											setMapPickerError(null);
											setIsMapPickerOpen((current) => !current);
										}}
										className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium"
									>
										{isMapPickerOpen ? "Hide" : "Open"}
									</button>
								</div>

								{isMapPickerOpen ? (
									mapPickerError ? (
										<div className="p-3 text-xs text-[var(--text-muted)]">
											{mapPickerError}
										</div>
									) : (
										<LeafletLocationPicker
											selectedLocation={selectedLocation}
											onPick={(lat, lon) => {
												setSelectedLocation({
													lat,
													lon,
													label: `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
												});
											}}
											onError={setMapPickerError}
										/>
									)
								) : (
									<div className="p-3 text-xs text-[var(--text-muted)]">
										Open the map to drop a pin and then save that location.
									</div>
								)}

								<div className="flex items-center justify-between gap-2 border-t border-[var(--border)] bg-[var(--surface)] p-2.5">
									<p className="text-xs text-[var(--text-muted)]">
										Tap map to place pin.
									</p>
									<button
										type="button"
										disabled={!selectedLocation}
										onClick={() =>
											selectedLocation &&
											void updateLocationPreference(
												selectedLocation.lat,
												selectedLocation.lon,
												selectedLocation.label,
											)
										}
										className="btn-accent rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
									>
										Use this location
									</button>
								</div>
							</div>
						</div>
					</div>
				)}

				{isLoadingCards ? (
					<div className="surface-card rounded-2xl p-5 sm:p-6">
						<p className="text-sm text-[var(--text-muted)]">
							Loading nearby profiles...
						</p>
					</div>
				) : cardsError ? (
					<div className="surface-card rounded-2xl p-5 sm:p-6">
						<p className="text-sm font-semibold">Could not load browse feed.</p>
						<p className="mt-2 text-sm text-[var(--text-muted)]">
							{cardsError}
						</p>
					</div>
				) : cards.length === 0 ? (
					<div className="surface-card rounded-2xl p-5 sm:p-6">
						<p className="text-sm font-semibold">
							No nearby profiles returned.
						</p>
						<p className="mt-2 text-sm text-[var(--text-muted)]">
							Try refreshing the feed after updating location in your account.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{cards.map((card) => {
							const name = getDisplayName(card);
							const online = isCurrentlyOnline(card.onlineUntil);

							return (
								<button
									type="button"
									key={card.profileId}
									onClick={() => setActiveProfileId(card.profileId)}
									className="surface-card overflow-hidden rounded-2xl text-left transition-transform hover:-translate-y-0.5"
								>
									<div className="relative aspect-[4/5] bg-[var(--surface-2)]">
										{card.primaryImageUrl ? (
											<img
												src={card.primaryImageUrl}
												alt={name}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full items-center justify-center bg-[var(--surface)] text-2xl font-semibold text-[var(--text-muted)]">
												{getCardInitials(name)}
											</div>
										)}
										<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2.5 text-white">
											<div className="flex items-center justify-between gap-2">
												<p className="truncate text-sm font-semibold">{name}</p>
												{online ? (
													<span className="inline-flex items-center rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
														Online
													</span>
												) : null}
											</div>
										</div>
									</div>

									<div className="grid gap-2 p-3 text-xs text-[var(--text-muted)]">
										<div className="flex items-center justify-between gap-2">
											<span className="inline-flex items-center gap-1">
												<MapPin className="h-3.5 w-3.5" />
												{formatDistance(card.distanceMeters)}
											</span>
											<span className="font-medium text-[var(--text)]">
												{typeof card.age === "number" && card.age > 0
													? `${card.age}`
													: "-"}
											</span>
										</div>
										<div className="flex items-center justify-between gap-2">
											<span className="inline-flex items-center gap-1">
												<MessageCircle className="h-3.5 w-3.5" />
												{card.unreadCount ?? 0} unread
											</span>
											{card.isPopular ? (
												<span className="inline-flex items-center gap-1 text-[var(--text)]">
													<Flame className="h-3.5 w-3.5" />
													Popular
												</span>
											) : card.rightNow ? (
												<span className="inline-flex items-center gap-1 text-[var(--text)]">
													<Shield className="h-3.5 w-3.5" />
													Right Now
												</span>
											) : null}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}

				{activeProfileId ? (
					<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6">
						<div className="surface-card max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl">
							<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
								<div>
									<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										Profile details
									</p>
									<p className="text-base font-semibold">{activeProfileName}</p>
								</div>
								<button
									type="button"
									onClick={() => setActiveProfileId(null)}
									className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
									aria-label="Close profile details"
								>
									<X className="h-4 w-4" />
								</button>
							</div>

							<div className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">
								{isLoadingActiveProfile ? (
									<p className="text-sm text-[var(--text-muted)]">
										Loading profile details...
									</p>
								) : activeProfileError ? (
									<p className="text-sm text-[var(--text-muted)]">
										{activeProfileError}
									</p>
								) : activeProfile ? (
									<div className="grid gap-6">
										<div>
											<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												Pictures ({activeProfilePhotoHashes.length})
											</p>
											{activeProfilePhotoHashes.length > 0 ? (
												<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
													{activeProfilePhotoHashes.map((hash) => (
														<img
															key={hash}
															src={getThumbImageUrl(hash, "320x320")}
															alt={`${activeProfileName} photo`}
															className="aspect-square w-full rounded-xl border border-[var(--border)] object-cover"
														/>
													))}
												</div>
											) : (
												<p className="text-sm text-[var(--text-muted)]">
													No profile photos available.
												</p>
											)}
										</div>

										<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
											<div className="flex flex-wrap items-end justify-between gap-3">
												<div>
													<p className="text-lg font-semibold sm:text-xl">
														{activeProfileName}
														<span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
															({formatOptionalNumber(activeProfile.age)})
														</span>
													</p>
													<p className="mt-1 text-xs text-[var(--text-muted)]">
														User ID: {activeProfile.profileId}
													</p>
												</div>
												<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
													<p>
														Status:{" "}
														{isCurrentlyOnline(profileOnlineUntil)
															? "Online"
															: `Last online ${formatTimeAgo(profileLastSeen ?? profileOnlineUntil)}`}
													</p>
													<p>Distance: {formatDistance(profileDistance)}</p>
												</div>
											</div>
										</div>

										<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
											<div className="grid gap-4">
												{hasTagsContent && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Tags
														</p>
														<div className="mt-2 flex flex-wrap gap-2">
															{activeProfile.profileTags.map((tag) => (
																<span
																	key={tag}
																	className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs"
																>
																	{tag}
																</span>
															))}
														</div>
													</div>
												)}

												{hasAboutContent && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															About
														</p>
														<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
															{activeProfile.aboutMe?.trim()}
														</p>
													</div>
												)}

												{hasExpectationsFields && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Expectations
														</p>
														<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
															{!shouldHideField(
																formatEnumArray(
																	activeProfile.lookingFor,
																	lookingForLabels,
																),
															) && (
																<p>
																	Looking for:{" "}
																	{formatEnumArray(
																		activeProfile.lookingFor,
																		lookingForLabels,
																	)}
																</p>
															)}
															{!shouldHideField(
																formatEnumArray(
																	activeProfile.meetAt,
																	meetAtLabels,
																),
															) && (
																<p>
																	Meet at:{" "}
																	{formatEnumArray(
																		activeProfile.meetAt,
																		meetAtLabels,
																	)}
																</p>
															)}
															{!shouldHideField(
																formatEnumArray(
																	activeProfile.grindrTribes,
																	tribeLabels,
																),
															) && (
																<p>
																	Tribes:{" "}
																	{formatEnumArray(
																		activeProfile.grindrTribes,
																		tribeLabels,
																	)}
																</p>
															)}
															{!shouldHideField(formattedActiveGenders) && (
																<p>Genders: {formattedActiveGenders}</p>
															)}
															{!shouldHideField(formattedActivePronouns) && (
																<p>Pronouns: {formattedActivePronouns}</p>
															)}
															{!shouldHideField(
																activeProfile.rightNowText?.trim(),
															) && (
																<p>
																	Right now:{" "}
																	{activeProfile.rightNowText?.trim()}
																</p>
															)}
														</div>
													</div>
												)}

												{hasHealthFields && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Health
														</p>
														<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
															{!shouldHideField(
																formatEnumValue(
																	activeProfile.hivStatus,
																	hivStatusLabels,
																),
															) && (
																<p>
																	HIV status:{" "}
																	{formatEnumValue(
																		activeProfile.hivStatus,
																		hivStatusLabels,
																	)}
																</p>
															)}
															{activeProfile.lastTestedDate && (
																<p>
																	Last tested:{" "}
																	{formatTimeAgo(activeProfile.lastTestedDate)}
																</p>
															)}
															{!shouldHideField(
																formatEnumArray(
																	activeProfile.sexualHealth,
																	sexualHealthLabels,
																),
															) && (
																<p>
																	Sexual health:{" "}
																	{formatEnumArray(
																		activeProfile.sexualHealth,
																		sexualHealthLabels,
																	)}
																</p>
															)}
															{!shouldHideField(
																formatEnumArray(
																	activeProfile.vaccines,
																	vaccineLabels,
																),
															) && (
																<p>
																	Vaccines:{" "}
																	{formatEnumArray(
																		activeProfile.vaccines,
																		vaccineLabels,
																	)}
																</p>
															)}
														</div>
													</div>
												)}
											</div>

											<div className="grid gap-4">
												{hasStatsFields && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Stats
														</p>
														<div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--text-muted)]">
															{!shouldHideField(
																activeProfile.positions.length > 0
																	? formatEnumArray(
																			activeProfile.positions,
																			sexualPositionLabels,
																		)
																	: formatEnumValue(
																			activeProfile.position,
																			sexualPositionLabels,
																		),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Position
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{activeProfile.positions.length > 0
																			? formatEnumArray(
																					activeProfile.positions,
																					sexualPositionLabels,
																				)
																			: formatEnumValue(
																					activeProfile.position,
																					sexualPositionLabels,
																				)}
																	</p>
																</div>
															)}
															{!shouldHideField(
																formatHeightCm(activeProfile.height),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Height
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{formatHeightCm(activeProfile.height)}
																	</p>
																</div>
															)}
															{!shouldHideField(
																formatWeightKg(activeProfile.weight),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Weight
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{formatWeightKg(activeProfile.weight)}
																	</p>
																</div>
															)}
															{!shouldHideField(
																formatEnumValue(
																	activeProfile.bodyType,
																	bodyTypeLabels,
																),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Body type
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{formatEnumValue(
																			activeProfile.bodyType,
																			bodyTypeLabels,
																		)}
																	</p>
																</div>
															)}
															{!shouldHideField(
																formatEnumValue(
																	activeProfile.ethnicity,
																	ethnicityLabels,
																),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Ethnicity
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{formatEnumValue(
																			activeProfile.ethnicity,
																			ethnicityLabels,
																		)}
																	</p>
																</div>
															)}
															{!shouldHideField(
																formatEnumValue(
																	activeProfile.relationshipStatus,
																	relationshipStatusLabels,
																),
															) && (
																<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
																	<p className="text-[10px] uppercase tracking-[0.08em]">
																		Relationship
																	</p>
																	<p className="mt-1 font-medium text-[var(--text)]">
																		{formatEnumValue(
																			activeProfile.relationshipStatus,
																			relationshipStatusLabels,
																		)}
																	</p>
																</div>
															)}
														</div>
													</div>
												)}

												{hasSocialFields && (
													<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
														<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
															Social
														</p>
														<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
															{activeProfile.socialNetworks?.instagram
																?.userId && (
																<p>
																	Instagram:{" "}
																	{
																		activeProfile.socialNetworks.instagram
																			.userId
																	}
																</p>
															)}
															{activeProfile.socialNetworks?.twitter
																?.userId && (
																<p>
																	X:{" "}
																	{activeProfile.socialNetworks.twitter.userId}
																</p>
															)}
															{activeProfile.socialNetworks?.facebook
																?.userId && (
																<p>
																	Facebook:{" "}
																	{activeProfile.socialNetworks.facebook.userId}
																</p>
															)}
														</div>
													</div>
												)}
											</div>
										</div>
									</div>
								) : null}
							</div>
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
}
