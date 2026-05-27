import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useTapProfile } from "./gridpage/hooks/useTapProfile";
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
import { getChatContactIndexForProfiles } from "../../services/chatContactIndex";
import type { ChatContactIndexRecord } from "../../types/chat-contact-index";
import { appLog } from "../../utils/logger";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { AlbumViewerPanel } from "./shared-albums/AlbumViewerPanel";
import { PhotoViewer, type PhotoViewerMedia } from "../../components/PhotoViewer";
import type { AlbumViewer } from "../../types/shared-albums";
import type { SharedAlbum } from "../../types/albums";
import { getMessageAlbumCoverUrl, getMessageAlbumId, getMessageImageUrl, getMessageVideoUrl } from "./chat/chatUtils";
import type { Message } from "../../types/messages";

const SKIP_BLOCK_CONFIRM_KEY = "profile_skip_block_confirm";
const SKIP_UNBLOCK_CONFIRM_KEY = "profile_skip_unblock_confirm";

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
	const [genderOptions, setGenderOptions] = useState<ManagedOption[]>([]);
	const [pronounOptions, setPronounOptions] = useState<ManagedOption[]>([]);
	const [chatContactStatus, setChatContactStatus] = useState<ChatContactIndexRecord | null>(null);
	const [profileSharedAlbums, setProfileSharedAlbums] = useState<SharedAlbum[]>([]);
	const [profileSharedMedia, setProfileSharedMedia] = useState<
		Array<{ id: string; url: string; type: "image" | "video"; timestamp: number; albumId: number | null }>
	>([]);
	const [isLoadingSharedMedia, setIsLoadingSharedMedia] = useState(false);
	const [albumViewer, setAlbumViewer] = useState<AlbumViewer | null>(null);
	const [albumViewerIndex, setAlbumViewerIndex] = useState(0);
	const [albumFullScreenIndex, setAlbumFullScreenIndex] = useState<number | null>(null);
	const [isOpeningAlbum, setIsOpeningAlbum] = useState(false);
	const albumViewerHistoryPushedRef = useRef(false);
	const albumFullScreenHistoryPushedRef = useRef(false);
	const [blockedProfileIds, setBlockedProfileIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [mutatingBlockProfileId, setMutatingBlockProfileId] = useState<string | null>(
		null,
	);
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

	const parsedParams = profileRouteParamsSchema.safeParse(params);
	const profileId = parsedParams.success ? parsedParams.data.profileId : null;

	useEffect(() => {
		let cancelled = false;
		void apiFunctions
			.getBlockedProfileIds()
			.then((profileIds) => {
				if (cancelled) {
					return;
				}
				setBlockedProfileIds(new Set(profileIds));
			})
			.catch(() => {
				if (!cancelled) {
					setBlockedProfileIds(new Set());
				}
			});

		return () => {
			cancelled = true;
		};
	}, [apiFunctions]);

	useEffect(() => {
		if (!profileId) {
			setChatContactStatus(null);
			return;
		}

		setChatContactStatus(null);
		let cancelled = false;
		void getChatContactIndexForProfiles([profileId])
			.then((records) => {
				if (cancelled) {
					return;
				}
				setChatContactStatus(records[0] ?? null);
			})
			.catch((error) => {
				if (!cancelled) {
					setChatContactStatus(null);
				}
				appLog.warn("[chat-index] failed to hydrate profile chat metadata", error);
			});

		return () => {
			cancelled = true;
		};
	}, [profileId]);

	useEffect(() => {
		if (!profileId) {
			setProfileSharedAlbums([]);
			setProfileSharedMedia([]);
			setIsLoadingSharedMedia(false);
			return;
		}

		let cancelled = false;

		const loadSharedContext = async () => {
			setIsLoadingSharedMedia(true);

			try {
				const albums = await apiFunctions.getSharedAlbumsForProfile({
					profileId: Number(profileId),
				});
				if (!cancelled) {
					setProfileSharedAlbums(albums);
				}
			} catch {
				if (!cancelled) {
					setProfileSharedAlbums([]);
				}
			}

			try {
				let foundConversationId: string | null = null;
				let page = 1;
				let nextPage: number | null = 1;

				while (nextPage != null && page <= 6 && !foundConversationId) {
					const inbox = await apiFunctions.listConversations({ page });
					const match = inbox.entries.find((entry) =>
						(entry.data.participants ?? []).some(
							(participant) => String(participant.profileId) === profileId,
						),
					);

					if (match?.data.conversationId) {
						foundConversationId = match.data.conversationId;
						break;
					}

					nextPage = inbox.nextPage ?? null;
					if (!nextPage) {
						break;
					}
					page = nextPage;
				}

				if (!foundConversationId) {
					if (!cancelled) {
						setProfileSharedMedia([]);
					}
					return;
				}

				const media: Array<{ id: string; url: string; type: "image" | "video"; timestamp: number; albumId: number | null }> = [];
				let oldestMessageId: string | undefined;

				for (let batch = 0; batch < 3 && media.length < 24; batch += 1) {
					const response = await apiFunctions.listMessages({
						conversationId: foundConversationId,
						pageKey: batch > 0 ? oldestMessageId : undefined,
					});

					if (!response.messages.length) {
						break;
					}

					for (const message of response.messages as Message[]) {
						if (String(message.senderId) !== profileId) {
							continue;
						}

						const imageUrl = getMessageImageUrl(message as never);
						const videoUrl = getMessageVideoUrl(message as never);
						const albumCoverUrl = getMessageAlbumCoverUrl(message as never);
						const albumId = getMessageAlbumId(message as never);

						if (imageUrl) {
							media.push({
								id: message.messageId,
								url: imageUrl,
								type: "image",
								timestamp: message.timestamp,
								albumId: null,
							});
							continue;
						}

						if (videoUrl) {
							media.push({
								id: message.messageId,
								url: videoUrl,
								type: "video",
								timestamp: message.timestamp,
								albumId: null,
							});
							continue;
						}

						if (albumCoverUrl && albumId) {
							media.push({
								id: `album-${albumId}-${message.messageId}`,
								url: albumCoverUrl,
								type: "image",
								timestamp: message.timestamp,
								albumId,
							});
						}
					}

					oldestMessageId = response.messages[0]?.messageId;
					if (!oldestMessageId) {
						break;
					}
				}

				if (!cancelled) {
					const deduped = media.filter(
						(item, index, array) =>
							array.findIndex((candidate) => candidate.id === item.id) === index,
					);
					deduped.sort((a, b) => b.timestamp - a.timestamp);
					setProfileSharedMedia(deduped.slice(0, 24));
				}
			} catch (sharedMediaError) {
				if (!cancelled) {
					setProfileSharedMedia([]);
				}
				appLog.warn("[profile] failed to load shared media context", sharedMediaError);
			} finally {
				if (!cancelled) {
					setIsLoadingSharedMedia(false);
				}
			}
		};

		void loadSharedContext();

		return () => {
			cancelled = true;
		};
	}, [apiFunctions, profileId]);

	const {
		tappingProfileId,
		resolvedTapVisualState,
		hasSentTapRecently,
		handleTapProfile,
	} = useTapProfile({
		activeProfile,
		setActiveProfile,
		activeProfileId: profileId,
		tap: apiFunctions.tap,
		TAP_WINDOW_MS,
	});

	const isTappingProfile = tappingProfileId === profileId;

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

	const handleMessageProfile = (targetProfileId: string) => {
		const nextParams = new URLSearchParams();
		nextParams.set("targetProfileId", targetProfileId);
		nextParams.set("returnTo", safeReturnTo);
        appLog.info("Profile", targetProfileId);
		navigate(`/chat?${nextParams.toString()}`);
	};

	const performBlockProfile = async (targetProfileId: string) => {
		setMutatingBlockProfileId(targetProfileId);
		try {
			await apiFunctions.blockProfile(targetProfileId);
			setBlockedProfileIds((prev) => {
				const next = new Set(prev);
				next.add(targetProfileId);
				return next;
			});
			toast.success(t("profile_details.block_success"));
			navigate(safeReturnTo, { replace: true });
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : t("profile_details.block_failed"),
			);
		} finally {
			setMutatingBlockProfileId(null);
		}
	};

	const performUnblockProfile = async (targetProfileId: string) => {
		setMutatingBlockProfileId(targetProfileId);
		try {
			await apiFunctions.unblockProfile(targetProfileId);
			setBlockedProfileIds((prev) => {
				const next = new Set(prev);
				next.delete(targetProfileId);
				return next;
			});
			toast.success(t("profile_details.unblock_success"));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("profile_details.unblock_failed"),
			);
		} finally {
			setMutatingBlockProfileId(null);
		}
	};

	const handleBlockProfile = async (targetProfileId: string) => {
		if (mutatingBlockProfileId) {
			return;
		}
		if (skipBlockConfirm) {
			await performBlockProfile(targetProfileId);
			return;
		}
		setDontAskAgainChecked(false);
		setPendingProfileConfirm({ action: "block", profileId: targetProfileId });
	};

	const handleUnblockProfile = async (targetProfileId: string) => {
		if (mutatingBlockProfileId) {
			return;
		}
		if (skipUnblockConfirm) {
			await performUnblockProfile(targetProfileId);
			return;
		}
		setDontAskAgainChecked(false);
		setPendingProfileConfirm({ action: "unblock", profileId: targetProfileId });
	};

	const handleToggleFavoriteProfile = async (
		targetProfileId: string,
		currentlyFavorite: boolean,
	) => {
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
	};

	const handleCancelProfileConfirm = () => {
		if (mutatingBlockProfileId) {
			return;
		}
		setPendingProfileConfirm(null);
	};

	const handleConfirmProfileAction = async () => {
		if (!pendingProfileConfirm || mutatingBlockProfileId) {
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

            const finalCoords = `${currentLat.toFixed(6)}, ${currentLon.toFixed(6)}`;
            toast.success(t("profile_details.location_finder_final_location", {
                lat: currentLat.toFixed(6),
                lon: currentLon.toFixed(6),
                error: Math.round(offset * 111320)
            }));

            try {
                await navigator.clipboard.writeText(finalCoords);
                toast.success(t("profile_details.location_finder_location_copied"));
            } catch (err) {
                appLog.error("Failed to copy location to clipboard", err);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("profile_details.location_finder_error_general"));
        } finally {
            await waitMs(10000);
            await putServerLocation(originalLat, originalLon, geohash);
            setIsLocatingProfile(false);
        }
    };

	const closeAlbumViewerState = useCallback(() => {
		setAlbumFullScreenIndex(null);
		setAlbumViewer(null);
		setAlbumViewerIndex(0);
		albumFullScreenHistoryPushedRef.current = false;
		albumViewerHistoryPushedRef.current = false;
	}, []);

	const closeAlbumFullScreenState = useCallback(() => {
		setAlbumFullScreenIndex(null);
		albumFullScreenHistoryPushedRef.current = false;
	}, []);

	const closeAlbumViewer = useCallback(() => {
		if (albumFullScreenHistoryPushedRef.current) {
			window.history.back();
			return;
		}
		if (albumViewerHistoryPushedRef.current) {
			window.history.back();
			return;
		}
		closeAlbumViewerState();
	}, [closeAlbumViewerState]);

	const openAlbumFullScreen = useCallback((index: number) => {
		if (!albumViewer || index < 0 || index >= albumViewer.content.length) return;
		setAlbumViewerIndex(index);
		setAlbumFullScreenIndex(index);
		if (!albumFullScreenHistoryPushedRef.current) {
			window.history.pushState({ profileAlbumOverlay: "full-screen" }, "");
			albumFullScreenHistoryPushedRef.current = true;
		}
	}, [albumViewer]);

	const closeAlbumFullScreen = useCallback(() => {
		if (albumFullScreenHistoryPushedRef.current) {
			window.history.back();
			return;
		}
		closeAlbumFullScreenState();
	}, [closeAlbumFullScreenState]);

	const handleAlbumViewerIndexChange = useCallback((index: number) => {
		setAlbumFullScreenIndex((prev) => (prev === index ? prev : index));
		setAlbumViewerIndex((prev) => (prev === index ? prev : index));
	}, []);

	useEffect(() => {
		const handlePopState = () => {
			if (albumFullScreenHistoryPushedRef.current) {
				closeAlbumFullScreenState();
				return;
			}
			if (albumViewerHistoryPushedRef.current) {
				closeAlbumViewerState();
			}
		};
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [closeAlbumFullScreenState, closeAlbumViewerState]);

	const handleOpenSharedAlbum = useCallback(async (albumId: string) => {
		if (isOpeningAlbum) return;
		setIsOpeningAlbum(true);
		try {
			const numericId = Number(albumId);
			await apiFunctions.openSharedAlbum({ albumId: numericId });
			const details = await apiFunctions.getAlbum(numericId);
			const albumName = profileSharedAlbums.find(
				(a) => String(a.albumId) === albumId,
			)?.albumName ?? details.albumName ?? null;
			setAlbumViewer({
				albumId: numericId,
				albumName,
				profileId: Number(profileId),
				profileName: activeProfile?.displayName?.trim() ?? `Profile ${profileId}`,
				content: details.content,
			});
			setAlbumViewerIndex(0);
			if (!albumViewerHistoryPushedRef.current) {
				window.history.pushState({ profileAlbumOverlay: "viewer" }, "");
				albumViewerHistoryPushedRef.current = true;
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("shared_albums.error_open_fallback"));
		} finally {
			setIsOpeningAlbum(false);
		}
	}, [activeProfile?.displayName, apiFunctions, isOpeningAlbum, profileId, profileSharedAlbums, t]);

	return (
		<>
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
				onBlockProfile={handleBlockProfile}
				onUnblockProfile={handleUnblockProfile}
				onToggleFavoriteProfile={handleToggleFavoriteProfile}
				isFavorite={Boolean(activeProfile?.isFavorite)}
				isTogglingFavorite={Boolean(
					profileId && mutatingFavoriteProfileId === profileId,
				)}
				isBlocked={profileId ? blockedProfileIds.has(profileId) : false}
				isBlockingProfile={Boolean(
					profileId && mutatingBlockProfileId === profileId,
				)}
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
				chatContactStatus={chatContactStatus}
				genderOptions={genderOptions}
				pronounOptions={pronounOptions}
				profileSharedAlbums={profileSharedAlbums}
				profileSharedMedia={profileSharedMedia}
				isLoadingSharedMedia={isLoadingSharedMedia}
				onOpenSharedAlbum={handleOpenSharedAlbum}
			/>

			{isOpeningAlbum ? (
				<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
					<div className="surface-card p-4 text-sm text-[var(--text-muted)]">
						{t("shared_albums.opening")}
					</div>
				</div>
			) : null}

			{albumViewer ? (
				<div className="relative z-[60]">
					<AlbumViewerPanel
						viewer={albumViewer}
						viewerIndex={albumViewerIndex}
						fullScreenIndex={albumFullScreenIndex}
						selectedViewerItem={
							albumViewer.content.length > 0
								? albumViewer.content[Math.min(albumViewerIndex, albumViewer.content.length - 1)]
								: null
						}
						closeViewer={closeAlbumViewer}
						openFullScreen={openAlbumFullScreen}
						onMessageProfile={(pid) => handleMessageProfile(String(pid))}
						onViewProfile={() => { /* already on profile */ }}
					/>
				</div>
			) : null}

			{albumViewer !== null && albumFullScreenIndex !== null ? (
				<PhotoViewer
					isOpen
					onClose={closeAlbumFullScreen}
					photos={albumViewer.content.map<PhotoViewerMedia>((item) => ({
						url: item.url ?? item.thumbUrl ?? item.coverUrl ?? "",
						type: item.contentType?.startsWith("video/") ? "video" : "image",
					}))}
					initialIndex={albumFullScreenIndex}
					onIndexChange={handleAlbumViewerIndexChange}
				/>
			) : null}

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
				isProcessing={Boolean(mutatingBlockProfileId)}
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
