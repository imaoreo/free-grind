import type { RestFetcher } from "../../types/chat-service";
import { assertSuccess, parseJsonSafe } from "../apiHelpers";

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

		async getFavoriteNotes(): Promise<Array<{ notes: string; phoneNumber: string; counterpartyId: string }>> {
			const response = await fetchRest("/v1/favorites/notes", {
				method: "GET",
			});
			await assertSuccess(response, t("favorites.get_notes_failed"));
			const data = await parseJsonSafe(response);
			return data as Array<{ notes: string; phoneNumber: string; counterpartyId: string }>;
		},

		async saveFavoriteNote(profileId: string, notes: string): Promise<void> {
			const response = await fetchRest("/v1/favorites/notes", {
				method: "PUT",
				body: {
					counterpartyId: profileId,
					notes: notes,
					phoneNumber: "",
				},
			});
			await assertSuccess(response, t("favorites.save_note_failed"));
		},

		async deleteFavoriteNote(profileId: string): Promise<void> {
			const response = await fetchRest(`/v1/favorites/notes/${profileId}`, {
				method: "DELETE",
			});
			await assertSuccess(response, t("favorites.delete_note_failed"));
		},
	};
}
