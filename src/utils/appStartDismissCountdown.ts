/**
 * Shared "show every N app starts" dismiss mechanism, used by full-page
 * startup gates (outdated-version prompt, HIV test reminder). Each call to
 * `processDismissCountdown` represents one app start: it decrements the
 * stored countdown and reports whether the prompt should stay suppressed.
 */

export function processDismissCountdown(key: string): boolean {
	if (typeof window === "undefined") {
		return false;
	}

	const storedValue = window.localStorage.getItem(key);

	if (!storedValue) {
		return false;
	}

	let reopensRemaining = parseInt(storedValue, 10);
	if (isNaN(reopensRemaining)) {
		return false;
	}

	reopensRemaining -= 1;

	if (reopensRemaining <= 0) {
		// Countdown finished! Remove the flag so the prompt shows again.
		window.localStorage.removeItem(key);
		return false;
	}

	window.localStorage.setItem(key, reopensRemaining.toString());

	return reopensRemaining > 0;
}

export function writeDismissedFlag(key: string, reopens: number): void {
	try {
		if (typeof window !== "undefined") {
			window.localStorage.setItem(key, reopens.toString());
		}
	} catch (error) {
		console.warn("Failed to write to localStorage:", error);
	}
}
