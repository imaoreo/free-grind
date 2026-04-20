import type { ClientInit, HandleClientError } from "@sveltejs/kit";

export const init: ClientInit = async () => {
	// TODO: authorize user?
};

export const handleError: HandleClientError = async ({ error, event }) => {
	console.error("Error during request to", event.url.pathname, ":", error);
	console.log(JSON.stringify(error, Object.getOwnPropertyNames(error)));
};
