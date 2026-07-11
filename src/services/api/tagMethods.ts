import type { ManagedTagCategory } from "../../types/api-functions";
import type { RestFetcher } from "../../types/chat-service";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "../apiHelpers";

function parseCategoryCollection(value: unknown): ManagedTagCategory[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.map((category) => {
			if (typeof category !== "object" || category === null) {
				return null;
			}
			const { text, possessiveText, tags } = category as {
				text?: unknown;
				possessiveText?: unknown;
				tags?: unknown;
			};
			if (typeof text !== "string" || !Array.isArray(tags)) {
				return null;
			}

			const parsedTags = tags
				.map((tag) => {
					if (typeof tag !== "object" || tag === null) {
						return null;
					}
					const { tagId, text: tagText, key } = tag as {
						tagId?: unknown;
						text?: unknown;
						key?: unknown;
					};
					if (
						typeof tagId !== "number" ||
						typeof tagText !== "string" ||
						typeof key !== "string"
					) {
						return null;
					}
					return { tagId, text: tagText, key };
				})
				.filter((tag): tag is ManagedTagCategory["tags"][number] => tag !== null);

			return {
				text,
				possessiveText: typeof possessiveText === "string" ? possessiveText : null,
				tags: parsedTags,
			};
		})
		.filter((category): category is ManagedTagCategory => category !== null);
}

export function createTagMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		/**
		 * GET /v1/tags returns one categoryCollection per supported language —
		 * pick the entry closest to the requested locale (exact match, then
		 * 2-letter prefix match, then English, then whatever's first) since the
		 * response isn't scoped to a single locale via headers/query.
		 */
		async getManagedTagCategories(locale: string): Promise<ManagedTagCategory[]> {
			const response = await fetchRest("/v1/tags");
			await assertSuccess(response, t("api.errors.load_tags"));
			const payload = await parseJsonSafe(response);
			if (!Array.isArray(payload)) {
				throw new ApiFunctionError(t("api.errors.invalid_tags_response"), response.status, payload);
			}

			const entries = payload.filter(
				(entry): entry is { language: string; categoryCollection: unknown } =>
					typeof entry === "object" &&
					entry !== null &&
					typeof (entry as { language?: unknown }).language === "string",
			);

			const normalizedLocale = locale.toLowerCase();
			const localePrefix = normalizedLocale.slice(0, 2);

			const chosen =
				entries.find((entry) => entry.language.toLowerCase() === normalizedLocale) ??
				entries.find((entry) => entry.language.toLowerCase().startsWith(localePrefix)) ??
				entries.find((entry) => entry.language.toLowerCase().startsWith("en")) ??
				entries[0];

			return chosen ? parseCategoryCollection(chosen.categoryCollection) : [];
		},
	};
}
