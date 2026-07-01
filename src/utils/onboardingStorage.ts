export const ONBOARDING_STORAGE_KEY = "fg-onboarding-complete";

export function hasCompletedOnboarding(): boolean {
	if (typeof window === "undefined") {
		return true;
	}

	try {
		return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
	} catch {
		return true;
	}
}

export function markOnboardingComplete(): void {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
	} catch {
		// Ignore storage write failures.
	}
}
