import { appLog } from "../utils/logger";
import {
	getAllSavedPhrases,
	getSetting,
	setSavedPhrases as setSavedPhrasesInDb,
	setSetting,
} from "./chatDb";
import type { ServerSavedPhrase } from "./api/phrasesMethods";

export const SAVED_PHRASES_UPDATED_EVENT = "fg:saved-phrases-updated";

const SAVED_PHRASES_SYNC_DONE_SETTING_KEY = "savedPhrasesSyncCompletedV1";

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

/**
 * Merges server-saved phrases into the local list, but only the first time
 * this ever runs for a given profile (gated by a per-profile chatDb setting,
 * same pattern as inboxSync's INBOX_SYNC_DONE_SETTING_KEY). Server is the
 * account's phrase list on Grindr itself; local can hold phrases added while
 * offline or before this sync existed, so this unions rather than replacing
 * either side.
 *
 * This can only ever run once per profile because the union has no way to
 * tell "deleted locally" apart from "never synced": if it reran on every
 * load, a phrase the user deleted locally but that still exists on the
 * server would just get silently re-added, making it undeletable.
 *
 * `isStillActive` is re-checked right before the write: chatDb is a single
 * shared connection repointed in place on account switch, so if the caller's
 * profile stopped being the active one while the network fetch was in
 * flight, writing here would merge this profile's server phrases into
 * whichever other profile's db is now open.
 */
export async function syncSavedPhrasesFromServer(
	getServerPhrases: () => Promise<ServerSavedPhrase[]>,
	isStillActive: () => boolean = () => true,
): Promise<string[] | null> {
	try {
		const alreadySynced = await getSetting<boolean>(SAVED_PHRASES_SYNC_DONE_SETTING_KEY);
		if (alreadySynced || !isStillActive()) {
			return null;
		}
		const [local, server] = await Promise.all([loadSavedPhrases(), getServerPhrases()]);
		if (!isStillActive()) {
			return null;
		}
		const serverTexts = server
			.filter((phrase) => phrase.type === "SAVED_PHRASE")
			.map((phrase) => phrase.text);
		const merged = await saveSavedPhrases([...local, ...serverTexts]);
		await setSetting(SAVED_PHRASES_SYNC_DONE_SETTING_KEY, true);
		return merged;
	} catch (error) {
		appLog.error("[savedPhrases] syncSavedPhrasesFromServer failed", error);
		return null;
	}
}

export function phrasesToTxt(phrases: string[]): string {
	return normalizeSavedPhrases(phrases).join("\n");
}

export function parsePhrasesFromTxt(content: string): string[] {
	return normalizeSavedPhrases(content.split(/\r?\n/g));
}
