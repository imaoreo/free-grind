import { useEffect, useMemo, useState } from "react";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import z from "zod";
import toast from "react-hot-toast";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { usePreferences } from "../../contexts/PreferencesContext";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
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
	const { t } = useTranslation();
	const TAP_WINDOW_MS = 24 * 60 * 60 * 1000;
	const navigate = useNavigate();
	const location = useLocation();
	const params = useParams();
	const [searchParams] = useSearchParams();
	const apiFunctions = useApiFunctions();
	const { geohash } = usePreferences();
	const [activeProfile, setActiveProfile] = useState<ProfileDetail | null>(
		null,
	);
	const [isLoadingActiveProfile, setIsLoadingActiveProfile] = useState(true);
	const [activeProfileError, setActiveProfileError] = useState<string | null>(
		null,
	);
	const [isLocatingProfile, setIsLocatingProfile] = useState(false);
	const [isTappingProfile, setIsTappingProfile] = useState(false);
	const [tapVisualState, setTapVisualState] = useState<"none" | "single" | "mutual">("none");
	const [lastLocalTapSentAt, setLastLocalTapSentAt] = useState<number | null>(null);
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);

	const parsedParams = profileRouteParamsSchema.safeParse(params);
	const profileId = parsedParams.success ? parsedParams.data.profileId : null;
	const locationState = (location.state as { returnTo?: unknown; profileIds?: unknown } | null) ?? {};
	const returnToFromState =
		typeof locationState.returnTo === "string" ? locationState.returnTo : null;
	const profileIds: string[] = Array.isArray(locationState.profileIds)
		? (locationState.profileIds as unknown[]).filter((x): x is string => typeof x === "string")
		: [];
	const returnToFromQuery = searchParams.get("returnTo");
	const returnTo = returnToFromState ?? returnToFromQuery;
	const safeReturnTo =
		typeof returnTo === "string" &&
		returnTo.startsWith("/") &&
		!returnTo.startsWith("//")
			? returnTo
			: "/browse";

	const currentIndex = profileId ? profileIds.indexOf(profileId) : -1;
	const prevProfileId = currentIndex > 0 ? profileIds[currentIndex - 1] : null;
	const nextProfileId = currentIndex >= 0 && currentIndex < profileIds.length - 1 ? profileIds[currentIndex + 1] : null;

	const handlePrevProfile = prevProfileId
		? () => navigate(`/profile/${prevProfileId}`, { replace: true, state: { returnTo: safeReturnTo, profileIds } })
		: undefined;
	const handleNextProfile = nextProfileId
		? () => navigate(`/profile/${nextProfileId}`, { replace: true, state: { returnTo: safeReturnTo, profileIds } })
		: undefined;

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
			setActiveProfileError(t("api.errors.invalid_profile_id"));
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

	const resolvedTapVisualState = useMemo(() => {
		const toEpochMs = (timestamp: number | null | undefined) => {
			if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
				return null;
			}

			return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
		};

		const isWithinTapWindow = (timestamp: number | null | undefined) => {
			const normalizedTimestamp = toEpochMs(timestamp);
			if (normalizedTimestamp === null) {
				return false;
			}

			const ageMs = Date.now() - normalizedTimestamp;
			return ageMs >= 0 && ageMs < TAP_WINDOW_MS;
		};

		const hasSentTap =
			activeProfile?.tapped === true ||
			(tapVisualState !== "none" && isWithinTapWindow(lastLocalTapSentAt));
		const hasReceivedTap =
			typeof activeProfile?.lastReceivedTapTimestamp === "number" &&
			isWithinTapWindow(activeProfile.lastReceivedTapTimestamp);

		if (hasSentTap || hasReceivedTap) {
			return "single" as const;
		}

		return "none" as const;
	}, [activeProfile, lastLocalTapSentAt, tapVisualState, TAP_WINDOW_MS]);

	const hasSentTapRecently = useMemo(() => {
		const toEpochMs = (timestamp: number | null | undefined) => {
			if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
				return null;
			}

			return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
		};

		const isWithinTapWindow = (timestamp: number | null | undefined) => {
			const normalizedTimestamp = toEpochMs(timestamp);
			if (normalizedTimestamp === null) {
				return false;
			}

			const ageMs = Date.now() - normalizedTimestamp;
			return ageMs >= 0 && ageMs < TAP_WINDOW_MS;
		};

		return (
			activeProfile?.tapped === true ||
			(tapVisualState !== "none" && isWithinTapWindow(lastLocalTapSentAt))
		);
	}, [activeProfile, lastLocalTapSentAt, tapVisualState, TAP_WINDOW_MS]);

	const handleMessageProfile = (targetProfileId: string) => {
		const nextParams = new URLSearchParams();
		nextParams.set("targetProfileId", targetProfileId);
		nextParams.set("returnTo", safeReturnTo);
		navigate(`/chat?${nextParams.toString()}`);
	};

    const solveTrilateration = (points: { lat: number, lon: number, dist: number }[]) => {
        // 1. Convert Lat/Lon to a simple XY grid (meters) relative to the first point
        // This avoids floating point errors with large coordinate numbers
        const p1 = points[0];
        const p2 = points[1];
        const p3 = points[2];

        // Rough conversion: 1 degree lat = 111320m
        const latToM = 111320;
        const lonToM = 111320 * Math.cos(p1.lat * (Math.PI / 180));

        const x2 = (p2.lon - p1.lon) * lonToM;
        const y2 = (p2.lat - p1.lat) * latToM;
        const x3 = (p3.lon - p1.lon) * lonToM;
        const y3 = (p3.lat - p1.lat) * latToM;

        const r1 = p1.dist;
        const r2 = p2.dist;
        const r3 = p3.dist;

        // 2. Standard Trilateration Formula for 2D intersection
        // Derived from (x-x1)^2 + (y-y1)^2 = r1^2 ... etc
        const A = 2 * x2;
        const B = 2 * y2;
        const C = Math.pow(r1, 2) - Math.pow(r2, 2) + Math.pow(x2, 2) + Math.pow(y2, 2);
        const D = 2 * x3;
        const E = 2 * y3;
        const F = Math.pow(r1, 2) - Math.pow(r3, 2) + Math.pow(x3, 2) + Math.pow(y3, 2);

        const denom = A * E - D * B;
        if (Math.abs(denom) < 1e-10) {
            throw new Error("Trilateration failed: measurement points are collinear or too close together. Try again with a larger initial offset.");
        }
        const x = (C * E - F * B) / denom;
        const y = (A * F - D * C) / denom;

        // 3. Convert XY back to Lat/Lon
        return {
            lat: p1.lat + (y / latToM),
            lon: p1.lon + (x / lonToM)
        };
    };

    const handleTriangleProfile = async (targetProfileId: string) => {
        if (!geohash) {
            toast.error(t("browse_page.errors.location_required"));
            return;
        }

        if (isLocatingProfile) {
            return;
        }

        const confirmed = window.confirm(t("profile_details.location_finder_confirm"));
        if (!confirmed) {
            return;
        }

        setIsLocatingProfile(true);

        let originalLat: number;
        let originalLon: number;

        try {
            // Decode starting position
            const decoded = decodeGeohash(geohash);
            originalLat = (decoded.lat[0] + decoded.lat[1]) / 2;
            originalLon = (decoded.lon[0] + decoded.lon[1]) / 2;
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : t("browse_page.errors.location_read_failed"),
            );
            setIsLocatingProfile(false);
            return;
        }

        const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        const putServerLocation = async (lat: number, lon: number, targetGeohash: string) => {
            const payloads = [
                { lat, lon },
                { latitude: lat, longitude: lon },
                { geohash: targetGeohash },
                { nearbyGeoHash: targetGeohash },
            ];

            for (const payload of payloads) {
                try {
                    const response = await apiFunctions.request("/v4/location", {
                        method: "PUT",
                        body: payload,
                    });
                    if (response.status >= 200 && response.status < 300) return;
                } catch (e) {
                    continue; 
                }
            }
            throw new Error("Failed to update server location across all payload types.");
        };

        const getDistanceFromProfile = async (): Promise<number | null> => {
            try {
                const profile = await apiFunctions.getProfileDetail(targetProfileId);
                return typeof profile.distance === "number" && Number.isFinite(profile.distance)
                    ? profile.distance
                    : null;
            } catch {
                return null;
            }
        };

        try {
            const initialDist = await getDistanceFromProfile();
            if (initialDist === null) {
                toast.error(t("profile_details.location_finder_error_distance"));
                return;
            }

            let currentLat = originalLat;
            let currentLon = originalLon;
            const targetPrecision = 15; 
            let rounds = Math.ceil(Math.log(initialDist / targetPrecision) / Math.log(3));
            rounds = Math.max(2, Math.min(rounds, 6));

            // Degrees per meter (approximate)
            let offset = (initialDist*1.5) / 111320;

            toast.success(t("profile_details.location_finder_start", { distance: Math.round(initialDist), rounds }));

            for (let i = 0; i < rounds; i++) {
                const points = [
                    { lat: currentLat + offset, lon: currentLon }, // Top
                    { lat: currentLat - (offset / 2), lon: currentLon + (offset * 0.866) }, // Bottom Right
                    { lat: currentLat - (offset / 2), lon: currentLon - (offset * 0.866) }, // Bottom Left
                ];

                const results: { lat: number, lon: number, dist: number }[] = [];
                
                for (const p of points) {
                    await putServerLocation(p.lat, p.lon, encodeGeohash(p.lat, p.lon));
                    await waitMs(5000); // Wait for distance calculation to propagate on server
                    const d = await getDistanceFromProfile();
                    if (d !== null) results.push({ lat: p.lat, lon: p.lon, dist: d });
                }

                if (results.length === 3) {
                    const estimate = solveTrilateration(results);
                    currentLat = estimate.lat;
                    currentLon = estimate.lon;
                    offset /= 3; // Zoom in for the next round

                    toast.success(t("profile_details.location_finder_round_complete", {
                        round: i + 1,
                        lat: currentLat.toFixed(6),
                        lon: currentLon.toFixed(6),
                        distance: Math.round(results[0].dist)
                    }));
                    
                    toast.success(t("profile_details.location_finder_error_estimate", {
                        round: i + 1,
                        error: Math.round(offset * 111320)
                    }));
                }
            }

            toast.success(t("profile_details.location_finder_final_location", {
                lat: currentLat.toFixed(6),
                lon: currentLon.toFixed(6),
                error: Math.round(offset * 111320)
            }));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("profile_details.location_finder_error_general"));
        } finally {
            await waitMs(10000);
            await putServerLocation(originalLat, originalLon, geohash);
            setIsLocatingProfile(false);
        }
    };

	const handleTapProfile = async (targetProfileId: string) => {
		if (isTappingProfile) {
			return;
		}

		if (hasSentTapRecently) {
			toast(t("browse_page.toasts.tap_limit"));
			return;
		}

		setIsTappingProfile(true);
		try {
			const result = await apiFunctions.tap(targetProfileId);
			setActiveProfile((current) =>
				current && current.profileId === targetProfileId
					? { ...current, tapped: true }
					: current,
			);
			setTapVisualState(result.isMutual ? "mutual" : "single");
			setLastLocalTapSentAt(Date.now());
			toast.success(result.isMutual ? t("browse_page.toasts.tap_mutual") : t("browse_page.toasts.tap_sent"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("browse_page.toasts.tap_failed"));
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
			onPrevProfile={handlePrevProfile}
			onNextProfile={handleNextProfile}
			onMessageProfile={handleMessageProfile}
			onTriangleProfile={handleTriangleProfile}
			isLocatingProfile={isLocatingProfile}
			onTapProfile={handleTapProfile}
			isTappingProfile={isTappingProfile}
			isTapBlocked={hasSentTapRecently}
			tapVisualState={resolvedTapVisualState}
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
