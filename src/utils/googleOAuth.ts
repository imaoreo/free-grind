const FALLBACK_GOOGLE_CLIENT_ID =
	"1036042917246-68g7siev1clho9lhqevahao9hlbpvssf.apps.googleusercontent.com";

const FALLBACK_GOOGLE_REDIRECT_URI = "http://localhost:1420/auth/google/callback";

const GOOGLE_AUTH_STATE_KEY = "open-grind.google-oauth-state";

export const googleClientId =
	import.meta.env.VITE_GOOGLE_CLIENT_ID ?? FALLBACK_GOOGLE_CLIENT_ID;

export const googleRedirectPath = "/auth/google/callback";

export function getGoogleRedirectUri() {
	return (
		import.meta.env.VITE_GOOGLE_REDIRECT_URI ??
		new URL(googleRedirectPath, window.location.origin).toString() ??
		FALLBACK_GOOGLE_REDIRECT_URI
	);
}

function createState() {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function startGoogleOAuthRedirect() {
	const state = createState();
	sessionStorage.setItem(GOOGLE_AUTH_STATE_KEY, state);

	const redirectUri = getGoogleRedirectUri();
	const params = new URLSearchParams({
		client_id: googleClientId,
		redirect_uri: redirectUri,
		response_type: "token",
		scope: "openid email profile",
		state,
		include_granted_scopes: "true",
		prompt: "select_account",
	});

	window.location.assign(
		`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
	);
}

export function consumeGoogleOAuthState(receivedState: string | null) {
	const expectedState = sessionStorage.getItem(GOOGLE_AUTH_STATE_KEY);
	sessionStorage.removeItem(GOOGLE_AUTH_STATE_KEY);
	return Boolean(expectedState && receivedState && expectedState === receivedState);
}

export function parseGoogleOAuthHash(hash: string) {
	const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
	return {
		accessToken: params.get("access_token"),
		error: params.get("error"),
		state: params.get("state"),
	};
}