import { useEffect, useState } from "react";
import { subscribeToMediaCache } from "../services/mediaStore";

/**
 * Re-renders the calling component whenever mediaStore's in-memory cache
 * gains an entry, so message lists can prefer a freshly-cached local copy
 * over the remote URL without needing to await a DB read during render.
 */
export function useLocalMediaCache(): void {
	const [, setTick] = useState(0);
	useEffect(() => {
		return subscribeToMediaCache(() => setTick((tick) => tick + 1));
	}, []);
}
