import { createContext } from "react";

export interface AuthState {
	userId: number | null;
	isLoading: boolean;
	error: string | null;
}

export interface AuthContextType extends AuthState {
	login: (email: string, password: string) => Promise<void>;
	loginWithJwt: (token: string) => Promise<void>;
	logout: () => Promise<void>;
	checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);