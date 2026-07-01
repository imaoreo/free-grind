import { appLog } from "../utils/logger";
import { getAllSavedPhrases, setSavedPhrases as setSavedPhrasesInDb } from "./chatDb";

export const SAVED_PHRASES_UPDATED_EVENT = "fg:saved-phrases-updated";

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

export async function loadSavedPhrases(): Promise<string[]> {
	try {
		return await getAllSavedPhrases();
	} catch (error) {
		appLog.error("[savedPhrases] loadSavedPhrases failed", error);
		return [];
	}
}

export async function saveSavedPhrases(nextPhrases: string[]): Promise<string[]> {
	const normalized = normalizeSavedPhrases(nextPhrases);
	const stored = await setSavedPhrasesInDb(normalized);
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent<string[]>(SAVED_PHRASES_UPDATED_EVENT, {
				detail: stored,
			}),
		);
	}
	return stored;
}

export function phrasesToTxt(phrases: string[]): string {
	return normalizeSavedPhrases(phrases).join("\n");
}

export function parsePhrasesFromTxt(content: string): string[] {
	return normalizeSavedPhrases(content.split(/\r?\n/g));
}
