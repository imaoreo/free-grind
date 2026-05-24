export const SAVED_PHRASES_STORAGE_KEY = "fg-saved-phrases";
export const SAVED_PHRASES_UPDATED_EVENT = "fg:saved-phrases-updated";

const DEFAULT_SAVED_PHRASES = ["Hey, how are you?", "Looking for?", "I can host!"];

export function normalizeSavedPhrases(input: string[]): string[] {
	const unique = new Set<string>();
	for (const phrase of input) {
		const normalized = phrase.trim();
		if (normalized.length > 0) {
			unique.add(normalized);
		}
	}
	return Array.from(unique);
}

export function loadSavedPhrases(): string[] {
	if (typeof window === "undefined") {
		return DEFAULT_SAVED_PHRASES;
	}

	try {
		const stored = window.localStorage.getItem(SAVED_PHRASES_STORAGE_KEY);
		if (!stored) {
			return DEFAULT_SAVED_PHRASES;
		}
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) {
			return DEFAULT_SAVED_PHRASES;
		}
		const normalized = normalizeSavedPhrases(
			parsed.filter((value): value is string => typeof value === "string"),
		);
		return normalized.length > 0 ? normalized : DEFAULT_SAVED_PHRASES;
	} catch {
		return DEFAULT_SAVED_PHRASES;
	}
}

export function saveSavedPhrases(nextPhrases: string[]): string[] {
	const normalized = normalizeSavedPhrases(nextPhrases);
	if (typeof window === "undefined") {
		return normalized;
	}
	window.localStorage.setItem(SAVED_PHRASES_STORAGE_KEY, JSON.stringify(normalized));
	window.dispatchEvent(
		new CustomEvent<string[]>(SAVED_PHRASES_UPDATED_EVENT, {
			detail: normalized,
		}),
	);
	return normalized;
}

export function phrasesToTxt(phrases: string[]): string {
	return normalizeSavedPhrases(phrases).join("\n");
}

export function parsePhrasesFromTxt(content: string): string[] {
	return normalizeSavedPhrases(content.split(/\r?\n/g));
}
