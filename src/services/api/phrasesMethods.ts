import type { RestFetcher } from "../../types/chat-service";
import { appLog } from "../../utils/logger";

export interface ServerSavedPhrase {
	id: string;
	text: string;
	type: string;
}

export function createPhrasesMethods(fetchRest: RestFetcher) {
	return {
		async getSavedPhrases(): Promise<ServerSavedPhrase[]> {
			try {
				const response = await fetchRest("/v1/chat/phrases", { method: "GET" });
				if (response.status !== 200) {
					appLog.warn(`[phrases] getSavedPhrases: unexpected status ${response.status}`);
					return [];
				}
				const data = (await response.json()) as { phrases?: ServerSavedPhrase[] };
				return data.phrases ?? [];
			} catch (error) {
				appLog.error("[phrases] getSavedPhrases failed", error);
				return [];
			}
		},
	};
}
