import { createChatService } from "./chatService";
import type { RestFetcher } from "../types/chat-service";
import {
	ApiFunctionError,
	submitIssueReport,
	trackUpdateCheck,
	registerPresence,
} from "./apiHelpers";
import { createAlbumMethods } from "./api/albumMethods";
import { createProfileMethods } from "./api/profileMethods";
import { createInterestMethods } from "./api/interestMethods";
import { createAgeVerificationMethods } from "./api/ageVerificationMethods";
import { createFeedMethods, type RightNowFeedItem } from "./api/feedMethods";
import { createPresenceMethods } from "./api/presenceMethods";

export {
	ApiFunctionError,
	submitIssueReport,
	trackUpdateCheck,
	registerPresence,
};

export type { RightNowFeedItem };

export function createApiFunctions(fetchRest: RestFetcher, t: (key: string) => string) {
	const chatService = createChatService(fetchRest, t);

	return {
		...chatService,
		...createInterestMethods(fetchRest, t),
		...createAlbumMethods(fetchRest, t),
		...createProfileMethods(fetchRest, t),
		...createAgeVerificationMethods(fetchRest, t),
		...createFeedMethods(fetchRest, t),
		...createPresenceMethods(),

		async request(
			path: string,
			options?: {
				method?: string;
				body?: unknown;
				rawBody?: Uint8Array;
				contentType?: string;
				abortController?: AbortController;
			},
		) {
			return fetchRest(path, options);
		},
	};
}
