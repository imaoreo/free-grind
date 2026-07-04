import type { ProfileDetail } from "../pages/app/GridPage.types";

export type ProfileAccessStatus = "accessible" | "not_found" | "blocked";

/**
 * GET /v7/profiles/:id always returns 200, even for a profile that has
 * blocked us or been deleted — it comes back as a stub with every field
 * nulled out except profileId and a displayName that's literally the string
 * "4" (blocked) or "3" (gone), instead of the resolved placeholder text.
 *
 * displayName alone isn't a safe check — a real user could happen to have
 * "3" or "4" as their display name — so this also requires lastUpdatedTime
 * to be null: a server-controlled bookkeeping timestamp that every real,
 * ever-persisted profile has set, and that a display name choice can't fake.
 */
export function classifyProfileAccess(
	profile: Pick<ProfileDetail, "displayName" | "lastUpdatedTime">,
): ProfileAccessStatus {
	if (profile.lastUpdatedTime != null) {
		return "accessible";
	}
	if (profile.displayName === "4") {
		return "blocked";
	}
	if (profile.displayName === "3") {
		return "not_found";
	}
	return "accessible";
}
