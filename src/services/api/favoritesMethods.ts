import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess } from "../apiHelpers";

export function createFavoritesMethods(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async addFavorite(profileId: string): Promise<void> {
			const response = await fetchRest(`/v3/me/favorites/${profileId}`, {
				method: "POST",
			});
			await assertSuccess(response, t("favorites.add_failed"));
		},

		async removeFavorite(profileId: string): Promise<void> {
			const response = await fetchRest(`/v3/me/favorites/${profileId}`, {
				method: "DELETE",
			});
			await assertSuccess(response, t("favorites.remove_failed"));
		},
	};
}
