import { callMethod, asAppError } from "$lib/api";
import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	let profileId: number | null;
	try {
		profileId = await callMethod("auth_state");
	} catch (e) {
		// NotInitialized means no stored session — treat as unauthenticated
		const appError = asAppError(e);
		if (appError?.kind === "NotInitialized") {
			return redirect(303, "/auth/sign-in");
		}
		throw e;
	}
	if (profileId === null) {
		return redirect(303, "/auth/sign-in");
	}
};
