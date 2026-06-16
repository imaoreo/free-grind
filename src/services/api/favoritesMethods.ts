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

		async getFavoriteNotes(): Promise<Array<{ notes: string; phoneNumber: string; counterpartyId: string }>> {
			const response = await fetchRest("/v1/favorites/notes", {
				method: "GET",
			});
			await assertSuccess(response, t("favorites.get_notes_failed"));
			return response.json() as Promise<Array<{ notes: string; phoneNumber: string; counterpartyId: string }>>;
		},

		async getProfileNote(targetProfileId: string): Promise<{ notes: string; phoneNumber: string }> {
			const response = await fetchRest(`/v1/favorites/notes/${targetProfileId}`, {
				method: "GET",
			});
			await assertSuccess(response, t("favorites.get_note_failed"));
			return response.json() as Promise<{ notes: string; phoneNumber: string }>;
		},

		async saveProfileNote(targetProfileId: string, body: { notes: string; phoneNumber: string }): Promise<void> {
			const response = await fetchRest(`/v1/favorites/notes/${targetProfileId}`, {
				method: "PUT",
				body,
			});
			await assertSuccess(response, t("favorites.save_note_failed"));
		},

		async deleteProfileNote(targetProfileId: string): Promise<void> {
			const response = await fetchRest(`/v1/favorites/notes/${targetProfileId}`, {
				method: "DELETE",
			});
			await assertSuccess(response, t("favorites.delete_note_failed"));
		},
	};
}
