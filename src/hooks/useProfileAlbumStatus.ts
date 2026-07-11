import { useEffect, useRef, useState } from "react";
import { useApiFunctions } from "./useApiFunctions";
import {
	cacheAlbumFromSharedPage,
	ensureProfileAlbumCacheChecked,
	getCachedAlbumCoverUri,
	getCachedAlbumIdForProfile,
	isAlbumCachedForProfile,
	subscribeToAlbumCache,
} from "../services/albumStore";
import { appLog } from "../utils/logger";

export type ProfileAlbumStatus = {
	/** Sticky — true if the live check just said so, or we've ever locally cached an album for this profile. */
	hasAlbum: boolean;
	/** Always the latest live result — drives the lock-vs-cover decision on the album slide. */
	hasSharedWithMe: boolean;
	albumId: number | null;
	coverUrl: string | null;
};

const emptyStatus: ProfileAlbumStatus = {
	hasAlbum: false,
	hasSharedWithMe: false,
	albumId: null,
	coverUrl: null,
};

type LiveResult = {
	hasAlbum: boolean;
	hasSharedWithMe: boolean;
	albumId: number | null;
	coverUrl: string | null;
};

// De-dupes concurrent checks for the same profile across hook instances.
const inFlightChecks = new Map<string, Promise<void>>();

/**
 * Checks (lazily, once per profile-open) whether a profile has an album
 * shared with the current user, and eagerly caches the cover into chatDb via
 * albumStore so the "has an album" indicator survives the share later being
 * revoked/expired. Fired from ProfileDetailsModal when a profile's detail
 * view opens — not from the grid, to avoid a call per visible card.
 */
export function useProfileAlbumStatus(
	profileId: string | null,
	enabled: boolean,
): ProfileAlbumStatus {
	const apiFunctions = useApiFunctions();
	const [, setTick] = useState(0);
	const [live, setLive] = useState<LiveResult | null>(null);
	const liveProfileIdRef = useRef<string | null>(null);

	useEffect(() => subscribeToAlbumCache(() => setTick((tick) => tick + 1)), []);

	useEffect(() => {
		if (!enabled || !profileId) {
			return;
		}

		ensureProfileAlbumCacheChecked(profileId);

		if (liveProfileIdRef.current === profileId || inFlightChecks.has(profileId)) {
			return;
		}

		const run = (async () => {
			try {
				const status = await apiFunctions.checkProfileAlbumShare({ profileId: Number(profileId) });
				let albumId: number | null = null;
				let coverUrl: string | null = null;

				if (status.hasSharedWithMe) {
					const albums = await apiFunctions.getSharedAlbumsForProfile({ profileId: Number(profileId) });
					const preview = albums[0];
					if (preview) {
						albumId = preview.albumId;
						coverUrl =
							preview.content?.coverUrl || preview.content?.url || preview.content?.thumbUrl || null;
						void cacheAlbumFromSharedPage({
							albumId: preview.albumId,
							albumName: preview.albumName ?? preview.name ?? null,
							ownerProfileId: Number(profileId),
							conversationId: null,
							coverUrl,
						});
					}
				}

				liveProfileIdRef.current = profileId;
				setLive({ hasAlbum: status.hasAlbum, hasSharedWithMe: status.hasSharedWithMe, albumId, coverUrl });
			} catch (error) {
				appLog.warn(`[profile-album-status] failed to check album share for profile ${profileId}`, error);
			} finally {
				inFlightChecks.delete(profileId);
			}
		})();
		inFlightChecks.set(profileId, run);
	}, [apiFunctions, enabled, profileId]);

	if (!profileId) {
		return emptyStatus;
	}

	const liveForThisProfile = liveProfileIdRef.current === profileId ? live : null;
	const cachedAlbumId = getCachedAlbumIdForProfile(profileId);

	return {
		hasAlbum: (liveForThisProfile?.hasAlbum ?? false) || isAlbumCachedForProfile(profileId),
		hasSharedWithMe: liveForThisProfile?.hasSharedWithMe ?? false,
		albumId: liveForThisProfile?.albumId ?? cachedAlbumId,
		coverUrl: liveForThisProfile?.coverUrl ?? (cachedAlbumId != null ? getCachedAlbumCoverUri(cachedAlbumId) : null),
	};
}
