import { useEffect, useState } from "react";
import { subscribeToAlbumCache } from "../services/albumStore";

/**
 * Re-renders the calling component whenever albumStore's in-memory cache
 * gains an entry, so message lists can show a locally-captured album as
 * open-able without needing to await a DB read during render.
 */
export function useAlbumCache(): void {
	const [, setTick] = useState(0);
	useEffect(() => {
		return subscribeToAlbumCache(() => setTick((tick) => tick + 1));
	}, []);
}
