import {
	useReducer,
	useEffect,
	ReactNode,
} from "react";
import { useApi } from "../hooks/useApi";
import { useApiFunctions } from "../hooks/useApiFunctions";
import toast from "react-hot-toast";
import {
	AuthContext,
	type AuthContextType,
	type AuthState,
} from "./auth-context";

const AUTH_USER_ID_STORAGE_KEY = "fg-user-id";
const PUSH_TOKEN_STORAGE_KEY = "fg-fcm-token";
const PUSH_TOKEN_SYNCED_STORAGE_KEY = "fg-fcm-token-synced";

type AuthAction =
	| { type: "SET_USER"; payload: number }
	| { type: "CLEAR_USER" }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null };

function authReducer(state: AuthState, action: AuthAction): AuthState {
	switch (action.type) {
		case "SET_USER":
			return { ...state, userId: action.payload, error: null };
		case "CLEAR_USER":
			return { ...state, userId: null };
		case "SET_LOADING":
			return { ...state, isLoading: action.payload };
		case "SET_ERROR":
			return { ...state, error: action.payload };
		default:
			return state;
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(authReducer, {
		userId: null,
		isLoading: true,
		error: null,
	});

	const { callMethod, asAppError } = useApi();
	const apiFunctions = useApiFunctions();

	const checkAuth = async () => {
		try {
			dispatch({ type: "SET_LOADING", payload: true });
			const result = await callMethod("auth_state");
			if (result !== null) {
				dispatch({ type: "SET_USER", payload: result });
			} else {
				dispatch({ type: "CLEAR_USER" });
			}
		} catch (error) {
			const appError = asAppError(error);
			if (appError?.kind === "NotInitialized") {
				dispatch({ type: "CLEAR_USER" });
			} else {
				dispatch({
					type: "SET_ERROR",
					payload: appError?.prettyMessage || "Failed to check auth status",
				});
			}
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	const login = async (email: string, password: string) => {
		try {
			dispatch({ type: "SET_LOADING", payload: true });
			dispatch({ type: "SET_ERROR", payload: null });

			const result = await callMethod("login", { email, password });
			dispatch({ type: "SET_USER", payload: result.profileId });
			toast.success("Login successful");
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage || "Login failed";
			dispatch({ type: "SET_ERROR", payload: message });
			toast.error(message);
			throw error;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	const loginWithJwt = async (token: string) => {
		try {
			dispatch({ type: "SET_LOADING", payload: true });
			dispatch({ type: "SET_ERROR", payload: null });

			const result = await callMethod("login_with_jwt", { token });
			dispatch({ type: "SET_USER", payload: result.profileId });
			toast.success("Token login successful");
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage || "Token login failed";
			dispatch({ type: "SET_ERROR", payload: message });
			toast.error(message);
			throw error;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	const logout = async () => {
		try {
			dispatch({ type: "SET_LOADING", payload: true });
			await callMethod("logout");
			dispatch({ type: "CLEAR_USER" });
			toast.success("Logged out");
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage || "Logout failed";
			toast.error(message);
			throw error;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	// Check auth on mount
	useEffect(() => {
		checkAuth();
	}, []);

	// Register presence with Free Grind backend when a logged-in session is active.
	// This must not depend only on `state.userId`, because consent/discovery settings can
	// change after login while the user id stays the same.
	useEffect(() => {
		if (state.isLoading || !state.userId) {
			return;
		}

		void apiFunctions.registerPresence(state.userId);
	});

	// Receive Android native FCM token and sync it to Grindr once authenticated.
	useEffect(() => {
		const onFcmToken = (event: Event) => {
			const token =
				typeof (event as CustomEvent).detail?.token === "string"
					? (event as CustomEvent<{ token: string }>).detail.token
					: null;

			if (!token) {
				console.debug("[PUSH_SYNC] Received fg:fcm-token event without token payload");
				return;
			}

			console.debug(`[PUSH_SYNC] Received native FCM token event (len=${token.length})`);

			window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);

			if (!state.userId || state.isLoading) {
				console.debug("[PUSH_SYNC] Token cached; waiting for authenticated session before sync");
				return;
			}

			console.debug("[PUSH_SYNC] Syncing FCM token to Grindr");
			void callMethod("sync_push_token", { token }).catch((error) => {
				const appError = asAppError(error);
				console.warn(
					"[PUSH_SYNC] Failed to sync push token",
					appError?.prettyMessage || error,
				);
			}).then(() => {
				console.debug("[PUSH_SYNC] Push token sync succeeded");
			});
		};

		window.addEventListener("fg:fcm-token", onFcmToken as EventListener);
		return () => {
			window.removeEventListener("fg:fcm-token", onFcmToken as EventListener);
		};
	}, [callMethod, asAppError, state.userId, state.isLoading]);

	// Retry sync after login if we already captured a token from native code.
	useEffect(() => {
		if (state.isLoading || !state.userId) {
			return;
		}

		let cancelled = false;

		const trySync = () => {
			if (cancelled) {
				return;
			}

			const token = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
			const fallbackToken =
				typeof (window as Window & { __FG_FCM_TOKEN?: unknown }).__FG_FCM_TOKEN ===
				"string"
					? ((window as Window & { __FG_FCM_TOKEN?: string }).__FG_FCM_TOKEN ?? null)
					: null;
			const effectiveToken = token || fallbackToken;

			if (!effectiveToken) {
				console.debug("[PUSH_SYNC] No cached token found while logged in");
				return;
			}

			if (!token && fallbackToken) {
				window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, fallbackToken);
			}

			const lastSyncedToken = window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY);
			if (lastSyncedToken === effectiveToken) {
				return;
			}

			console.debug("[PUSH_SYNC] Syncing cached push token (retry loop)");
			void callMethod("sync_push_token", { token: effectiveToken })
				.then(() => {
					window.localStorage.setItem(PUSH_TOKEN_SYNCED_STORAGE_KEY, effectiveToken);
					console.debug("[PUSH_SYNC] Cached push token sync succeeded");
				})
				.catch((error) => {
					const appError = asAppError(error);
					console.warn(
						"[PUSH_SYNC] Failed to sync push token in retry loop",
						appError?.prettyMessage || error,
					);
				});
		};

		trySync();
		const interval = window.setInterval(trySync, 5000);
		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, [callMethod, asAppError, state.userId, state.isLoading]);

	// Persist current user id so non-React services (e.g. hotswap) can re-register after updates.
	useEffect(() => {
		if (state.isLoading) {
			return;
		}

		if (state.userId) {
			window.localStorage.setItem(AUTH_USER_ID_STORAGE_KEY, String(state.userId));
		} else {
			window.localStorage.removeItem(AUTH_USER_ID_STORAGE_KEY);
		}
	}, [state.userId, state.isLoading]);

	const value: AuthContextType = {
		...state,
		login,
		loginWithJwt,
		logout,
		checkAuth,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
