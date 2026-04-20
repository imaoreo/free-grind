import { callMethod } from "$lib/api";
import { redirect } from "@sveltejs/kit";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async () => {
	const profileId = await callMethod("auth_state");
	if (profileId !== null) {
		return redirect(303, "/");
	}
};
