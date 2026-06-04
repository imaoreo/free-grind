import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { appLog } from "../utils/logger";

export function LocationPublishBridge() {
	const { userId } = useAuth();
	const { geohash } = usePreferences();
	const apiFunctions = useApiFunctions();
	const lastSyncedGeohash = useRef<string | null>(null);
	const lastUserId = useRef<string | number | null>(null);

	useEffect(() => {
		// Reset tracking if the user logs out or switches accounts
		if (userId !== lastUserId.current) {
			lastSyncedGeohash.current = null;
			lastUserId.current = userId;
		}

		if (!userId || !geohash) {
			return;
		}

		if (lastSyncedGeohash.current === geohash) {
			return;
		}

		// Update the sync marker immediately to prevent race/duplicate updates
		lastSyncedGeohash.current = geohash;

		appLog.info("[LocationPublishBridge] geohash changed, triggering remote profile location sync", { geohash });

		apiFunctions.updateMyProfile({})
			.then(() => {
				appLog.info("[LocationPublishBridge] Remote profile location sync successful", { geohash });
			})
			.catch((err) => {
				appLog.error("[LocationPublishBridge] Remote profile location sync failed", err);
				// Clear the sync ref so we retry on the next update/refresh
				lastSyncedGeohash.current = null;
			});
	}, [userId, geohash, apiFunctions]);

	return null;
}
