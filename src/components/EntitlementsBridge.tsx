import { useEffect } from "react";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { appLog } from "../utils/logger";
import { useEntitlements } from "../hooks/queries/useEntitlementQueries";

/**
 * Bridge component that fetches user entitlements (like Right Now remaining sessions)
 * when a session is active.
 */
export function EntitlementsBridge() {
	const { userId, isLoading: isAuthLoading } = useAuth();
	const { setPreferences } = usePreferences();

	const { data: entitlements, isSuccess } = useEntitlements(userId, !isAuthLoading);

	useEffect(() => {
		if (isSuccess && entitlements) {
			appLog.info("[HTTP] Entitlements fetched successfully:", entitlements);
			void setPreferences({
				rightNowRemaining: entitlements.rightNow,
			});
		}
	}, [isSuccess, entitlements, setPreferences]);

	return null;
}
