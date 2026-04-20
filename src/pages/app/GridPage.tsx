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
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useEffect, useMemo, useState } from "react";
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
	const [selectedLocation, setSelectedLocation] = useState<{
		lat: number;
		lon: number;
		label: string;
	} | null>(null);

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
	};

	const handleUseCurrentLocation = async () => {
		if (!("geolocation" in navigator)) {
			setCardsError("Geolocation is unavailable on this device.");
			return;
		}

		setIsDetectingLocation(true);

		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, {
					enableHighAccuracy: true,
					timeout: 12000,
					maximumAge: 20000,
				});
			});

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
								<p className="text-sm font-semibold">Set your browse location</p>
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

							<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-xs text-[var(--text-muted)]">
								Map picker is temporarily unavailable. Use location search above,
								or use current location on mobile.
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
								<article
									key={card.profileId}
									className="surface-card overflow-hidden rounded-2xl"
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
								</article>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}
