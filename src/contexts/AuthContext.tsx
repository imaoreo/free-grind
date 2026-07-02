import {
	useReducer,
	useEffect,
	useRef,
	useState,
	ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApi } from "../hooks/useApi";
import { useApiFunctions } from "../hooks/useApiFunctions";
import type { AppError } from "../types/api";
import toast from "react-hot-toast";
import {
	AuthContext,
	type AuthContextType,
	type AuthState,
	type SavedAccountMeta,
} from "./auth-context";
import { appLog } from "../utils/logger";
import { setActiveChatDbUser, migrateLegacySettingsIfNeeded } from "../services/chatDb";
import { clearAllCaches } from "../pages/app/gridpage/cache";
import { loadAutomationCache } from "../utils/autoblock";
import { loadMediaSettingsCache } from "../utils/mediaSettings";
import { loadPrivacyCache } from "../utils/privacy";
import { loadSeenCache } from "../services/seenStore";

const AUTH_USER_ID_STORAGE_KEY = "fg-user-id";
const PUSH_TOKEN_STORAGE_KEY = "fg-fcm-token";
const PUSH_TOKEN_SYNCED_STORAGE_KEY = "fg-fcm-token-synced";

// Grindr's API returns this generic validation error for several rejected-login
// cases (wrong credentials, malformed/expired token) rather than a specific one,
// so its raw "Error 4: invalid input parameters" text is meaningless to users.
const INVALID_INPUT_PARAMETERS_CODE = 4;

function describeLoginError(
	appError: AppError | null,
	fallback: string,
	invalidCredentialsMessage: string,
): string {
	if (
		appError?.kind === "Api" &&
		typeof appError.message === "object" &&
		appError.message.code === INVALID_INPUT_PARAMETERS_CODE
	) {
		return invalidCredentialsMessage;
	}
	return appError?.prettyMessage || fallback;
}

type AuthAction =
	| { type: "SET_USER"; payload: number }
	| { type: "CLEAR_USER" }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null }
	| { type: "SET_SETTINGS_READY"; payload: boolean };

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
		case "SET_SETTINGS_READY":
			return { ...state, settingsReady: action.payload };
		default:
			return state;
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(authReducer, {
		userId: null,
		isLoading: true,
		error: null,
		settingsReady: false,
	});

	const { callMethod, asAppError } = useApi();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const [savedAccounts, setSavedAccounts] = useState<SavedAccountMeta[]>([]);
	// undefined = not yet resolved once; distinguishes "app boot" (nothing to
	// clear, just point the chat db at whatever account is already logged
	// in) from an actual account change (switch/logout) afterwards.
	const previousUserIdRef = useRef<number | null | undefined>(undefined);

	const refreshSavedAccounts = async () => {
		try {
			const accounts = await callMethod("list_saved_accounts");
			setSavedAccounts(accounts);
		} catch (error) {
			appLog.warn("[Auth] refreshSavedAccounts failed", asAppError(error) ?? error);
		}
	};

	const checkAuth = async () => {
		try {
			appLog.debug("[Auth] checkAuth: starting");
			dispatch({ type: "SET_LOADING", payload: true });
			const result = await callMethod("auth_state");
			if (result !== null) {
				appLog.info("[Auth] checkAuth: active session found");
				dispatch({ type: "SET_USER", payload: result });
				void refreshSavedAccounts();
			} else {
				appLog.info("[Auth] checkAuth: no active session");
				dispatch({ type: "CLEAR_USER" });
			}
		} catch (error) {
			const appError = asAppError(error);
			if (appError?.kind === "NotInitialized") {
				appLog.warn("[Auth] checkAuth: client NotInitialized, clearing user");
				dispatch({ type: "CLEAR_USER" });
			} else {
				appLog.error("[Auth] checkAuth failed", appError ?? error);
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
			appLog.info("[Auth] login: attempting email/password login");
			dispatch({ type: "SET_LOADING", payload: true });
			dispatch({ type: "SET_ERROR", payload: null });

			const result = await callMethod("login", { email, password });
			appLog.info("[Auth] login: succeeded");
			dispatch({ type: "SET_USER", payload: result.profileId });
			void refreshSavedAccounts();
			toast.success("Login successful");
		} catch (error) {
			const appError = asAppError(error);
			const message = describeLoginError(
				appError,
				"Login failed",
				"Invalid email or password. Please check your credentials and try again.",
			);
			appLog.error("[Auth] login failed", { kind: appError?.kind, message });
			dispatch({ type: "SET_ERROR", payload: message });
			toast.error(message);
			throw error;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	const loginWithJwt = async (token: string) => {
		try {
			appLog.info("[Auth] loginWithJwt: attempting token login");
			dispatch({ type: "SET_LOADING", payload: true });
			dispatch({ type: "SET_ERROR", payload: null });

			const result = await callMethod("login_with_jwt", { token });
			appLog.info("[Auth] loginWithJwt: succeeded");
			dispatch({ type: "SET_USER", payload: result.profileId });
			void refreshSavedAccounts();
			toast.success("Token login successful");
		} catch (error) {
			const appError = asAppError(error);
			const message = describeLoginError(
				appError,
				"Token login failed",
				"This token is invalid or has expired. Please generate a new one and try again.",
			);
			appLog.error("[Auth] loginWithJwt failed", { kind: appError?.kind, message });
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

	// Makes a previously saved account active without re-entering a
	// password — the account-change effect above (watching state.userId)
	// handles pointing the chat db and clearing caches once this resolves.
	const switchAccount = async (profileId: string) => {
		try {
			appLog.info("[Auth] switchAccount: attempting", { profileId });
			dispatch({ type: "SET_LOADING", payload: true });
			dispatch({ type: "SET_ERROR", payload: null });

			const result = await callMethod("switch_account", { profileId });
			appLog.info("[Auth] switchAccount: succeeded");
			dispatch({ type: "SET_USER", payload: result.profileId });
			void refreshSavedAccounts();
			toast.success("Switched account");
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage || "Failed to switch account";
			appLog.error("[Auth] switchAccount failed", { kind: appError?.kind, message });
			dispatch({ type: "SET_ERROR", payload: message });
			toast.error(message);
			throw error;
		} finally {
			dispatch({ type: "SET_LOADING", payload: false });
		}
	};

	const removeSavedAccount = async (profileId: string) => {
		try {
			await callMethod("remove_saved_account", { profileId });
			setSavedAccounts((accounts) => accounts.filter((account) => account.profileId !== profileId));
		} catch (error) {
			const appError = asAppError(error);
			const message = appError?.prettyMessage || "Failed to remove saved account";
			appLog.error("[Auth] removeSavedAccount failed", { kind: appError?.kind, message });
			toast.error(message);
			throw error;
		}
	};

	// Check auth on mount
	useEffect(() => {
		checkAuth();
	}, []);

	// Points the chat db at the active account's own file, and on an actual
	// account change (not the initial boot resolution) clears every other
	// account-scoped cache — otherwise the previous account's chats/profile
	// data/blocked list would still show through until something happened
	// to overwrite them.
	useEffect(() => {
		if (state.isLoading) {
			return;
		}

		const previousUserId = previousUserIdRef.current;
		previousUserIdRef.current = state.userId;

		if (previousUserId === state.userId) {
			return;
		}

		const isActualAccountChange = previousUserId !== undefined && previousUserId != null;
		if (isActualAccountChange) {
			clearAllCaches();
			queryClient.clear();
		}

		dispatch({ type: "SET_SETTINGS_READY", payload: false });

		void (async () => {
			await setActiveChatDbUser(state.userId);
			if (state.userId != null) {
				await migrateLegacySettingsIfNeeded(state.userId);
			}
			await Promise.all([
				loadAutomationCache(),
				loadMediaSettingsCache(),
				loadPrivacyCache(),
				loadSeenCache(),
			]);
			dispatch({ type: "SET_SETTINGS_READY", payload: true });
		})();
	}, [state.userId, state.isLoading, queryClient]);

	// Register presence with Free Grind backend when a logged-in session is active.
	// This must not depend only on `state.userId`, because consent/discovery settings can
	// change after login while the user id stays the same.
	useEffect(() => {
		if (state.isLoading || !state.userId) {
			return;
		}

		void apiFunctions.registerPresence(state.userId);
	}, [state.userId, state.isLoading, apiFunctions]);

	// Receive Android native FCM token and sync it to Grindr once authenticated.
	useEffect(() => {
		const onFcmToken = (event: Event) => {
			const token =
				typeof (event as CustomEvent).detail?.token === "string"
					? (event as CustomEvent<{ token: string }>).detail.token
					: null;

			if (!token) {
				appLog.debug("[PUSH_SYNC] Received fg:fcm-token event without token payload");
				return;
			}

			appLog.debug(`[PUSH_SYNC] Received native FCM token event (len=${token.length})`);

			window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);

			if (!state.userId || state.isLoading) {
				appLog.debug("[PUSH_SYNC] Token cached; waiting for authenticated session before sync");
				return;
			}

			appLog.debug("[PUSH_SYNC] Syncing FCM token to Grindr");
			void callMethod("sync_push_token", { token }).catch((error) => {
				const appError = asAppError(error);
				appLog.warn(
					"[PUSH_SYNC] Failed to sync push token",
					appError?.prettyMessage || error,
				);
			}).then(() => {
				appLog.debug("[PUSH_SYNC] Push token sync succeeded");
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
				appLog.debug("[PUSH_SYNC] No cached token found while logged in");
				return;
			}

			if (!token && fallbackToken) {
				window.localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, fallbackToken);
			}

			// Keyed by token *and* account: the device's FCM token doesn't change
			// when switching between saved accounts, but the backend association
			// is per-account, so a stale "already synced" marker from the
			// previous account would otherwise skip re-syncing for the new one.
			const syncMarker = `${effectiveToken}::${state.userId}`;
			const lastSyncedMarker = window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY);
			if (lastSyncedMarker === syncMarker) {
				return;
			}

			appLog.debug("[PUSH_SYNC] Syncing cached push token (retry loop)");
			void callMethod("sync_push_token", { token: effectiveToken })
				.then(() => {
					window.localStorage.setItem(PUSH_TOKEN_SYNCED_STORAGE_KEY, syncMarker);
					appLog.debug("[PUSH_SYNC] Cached push token sync succeeded");
				})
				.catch((error) => {
					const appError = asAppError(error);
					appLog.warn(
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
		savedAccounts,
		switchAccount,
		removeSavedAccount,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
