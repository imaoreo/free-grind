import { useEffect } from "react";
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

	useEffect(() => {
		if (isAuthLoading || !userId) {
			return;
		}

		const fetchEntitlements = async () => {
			try {
				appLog.debug("[Entitlements] Fetching entitlements...");
				const entitlements = await apiFunctions.getEntitlements();
				appLog.info("[Entitlements] Fetched successfully:", entitlements);

				await setPreferences({
					rightNowRemaining: entitlements.rightNow,
				});
			} catch (error) {
				appLog.error("[Entitlements] Failed to fetch entitlements", error);
			}
		};

		void fetchEntitlements();
		// Entitlements should only be fetched once per session.
	}, [userId, isAuthLoading]);

	return null;
}
