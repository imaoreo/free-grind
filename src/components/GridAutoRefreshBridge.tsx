/**
 * GridAutoRefreshBridge — keeps the grid's automatic refresh alive while the
 * user is on any page other than the Grid.
 *
 * GridPage only runs its own auto-refresh interval while mounted, so it stops
 * firing the moment the user navigates elsewhere (chat, settings, ...). Since
 * that refresh is also what's pinging the server and keeping the account
 * showing as online, leaving the Grid for a while would eventually make the
 * account look offline even though the app is still open. This bridge is
 * mounted once for the whole app session (see App.tsx) and takes over the
 * heartbeat call whenever GridPage isn't the one doing it.
 *
 * This is a fixed, always-on part of the app (not a Settings > Automation
 * toggle) — it always refreshes every REFRESH_INTERVAL_MS, unless incognito
 * mode is on.
 *
 * It intentionally doesn't touch GridPage's card list/cache — it only needs
 * to hit the browse endpoint, not to keep a perfectly fresh grid ready for
 * when the user comes back (that already happens via GridPage's own load).
 */

import { useEffect } from "react";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { getIncognitoMode } from "../utils/privacy";
import { isGridPageActive } from "../pages/app/gridpage/activeState";
import { appLog } from "../utils/logger";
import { GRID_REFRESH_INTERVAL_MS } from "./gridRefreshInterval";

export function GridAutoRefreshBridge() {
	const { userId, settingsReady } = useAuth();
	const { geohash } = usePreferences();
	const apiFunctions = useApiFunctions();

	useEffect(() => {
		if (typeof window === "undefined" || !userId || !settingsReady) {
			return;
		}

		const timer = window.setInterval(() => {
			// GridPage runs its own (richer) refresh while it's mounted — don't
			// double up on the same heartbeat call while it's already visible.
			if (isGridPageActive() || getIncognitoMode() || !geohash) {
				return;
			}

			appLog.info("[grid] background keep-online refresh triggered");
			void apiFunctions.getBrowseCards({ geohash }).catch((error) => {
				appLog.warn("[grid] background keep-online refresh failed", error);
			});
		}, GRID_REFRESH_INTERVAL_MS);

		return () => window.clearInterval(timer);
	}, [userId, settingsReady, geohash, apiFunctions]);

	return null;
}
