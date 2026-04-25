import {
	createContext,
	useContext,
	useReducer,
	useEffect,
	ReactNode,
} from "react";
import { useApi } from "../hooks/useApi";
import toast from "react-hot-toast";

interface AuthState {
	userId: number | null;
	isLoading: boolean;
	error: string | null;
}

type AuthAction =
	| { type: "SET_USER"; payload: number }
	| { type: "CLEAR_USER" }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_ERROR"; payload: string | null };

interface AuthContextType extends AuthState {
	login: (email: string, password: string) => Promise<void>;
	loginWithJwt: (token: string) => Promise<void>;
	logout: () => Promise<void>;
	checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

	const value: AuthContextType = {
		...state,
		login,
		loginWithJwt,
		logout,
		checkAuth,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
}
