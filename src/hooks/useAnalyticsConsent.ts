import { useEffect, useState } from "react";
import {
	hasAnalyticsConsent,
	ANALYTICS_CONSENT_EVENT,
} from "../utils/analyticsConsent";

/**
 * Reactively tracks analytics consent state.
 * Re-evaluates whenever consent is granted or denied in the same tab
 * (via the fg-analytics-consent-change custom event) or in another tab
 * (via the native storage event).
 */
export function useAnalyticsConsent(): boolean {
	const [consent, setConsent] = useState(() => hasAnalyticsConsent());

	useEffect(() => {
		const update = () => {
			setConsent(hasAnalyticsConsent());
		};

		window.addEventListener(ANALYTICS_CONSENT_EVENT, update);
		window.addEventListener("storage", update);

		return () => {
			window.removeEventListener(ANALYTICS_CONSENT_EVENT, update);
			window.removeEventListener("storage", update);
		};
	}, []);

	return consent;
}
