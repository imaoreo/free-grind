export type AnalyticsConsentChoice = "granted" | "denied";

export const ANALYTICS_CONSENT_STORAGE_KEY = "fg-analytics-consent";
export const ANALYTICS_CONSENT_EVENT = "fg-analytics-consent-change";

export function readAnalyticsConsentChoice(): AnalyticsConsentChoice | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
		if (value === "granted" || value === "denied") {
			return value;
		}
		return null;
	} catch {
		return null;
	}
}

export function writeAnalyticsConsentChoice(choice: AnalyticsConsentChoice): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
		window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
	} catch {
		// Ignore storage write failures.
	}
}

export function hasAnalyticsConsent(): boolean {
	return readAnalyticsConsentChoice() === "granted";
}
