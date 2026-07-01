import { useEffect, useState } from "react";
import { subscribeToAvatarCache } from "../services/avatarStore";

/**
 * Re-renders the calling component whenever avatarStore's in-memory cache
 * gains an entry, so avatar images (resolved via avatarStore.resolveAvatarSrc)
 * pick up a freshly-cached local copy without needing to await a DB read
 * during render. Call once per component, not per list item.
 */
export function useAvatarCache(): void {
	const [, setTick] = useState(0);
	useEffect(() => {
		return subscribeToAvatarCache(() => setTick((tick) => tick + 1));
	}, []);
}
