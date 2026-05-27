import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/useAuth";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { usePreferences } from "../contexts/PreferencesContext";
import { appLog } from "../utils/logger";

/**
 * Bridge component that fetches user entitlements (like Right Now remaining sessions)
 * when a session is active.
 */
export function EntitlementsBridge() {
	const { userId, isLoading: isAuthLoading } = useAuth();
	const { setPreferences } = usePreferences();
	const apiFunctions = useApiFunctions();

	// Tracks the userId for which we have already triggered a fetch
	// to prevent duplicate calls during re-renders or state fluctuations.
	const lastFetchedId = useRef<number | null>(null);

	useEffect(() => {
		if (isAuthLoading || !userId) {
			// If logged out, reset the tracker so we can fetch again on next login
			if (!userId) {
				lastFetchedId.current = null;
			}
			return;
		}

		// Guard: if we already started/finished fetching for this specific userId, skip.
		if (lastFetchedId.current === userId) {
			return;
		}

		const fetchEntitlements = async () => {
			try {
				lastFetchedId.current = userId;
				appLog.debug(`[Entitlements] Fetching entitlements for user ${userId}...`);
				const entitlements = await apiFunctions.getEntitlements();
				appLog.info("[Entitlements] Fetched successfully:", entitlements);

				await setPreferences({
					rightNowRemaining: entitlements.rightNow,
				});
			} catch (error) {
				appLog.error("[Entitlements] Failed to fetch entitlements", error);
				// On error, we reset so it can be retried if the component re-triggers
				lastFetchedId.current = null;
			}
		};

		void fetchEntitlements();
		// Entitlements should only be fetched once per session.
	}, [userId, isAuthLoading, apiFunctions, setPreferences]);

	return null;
}
