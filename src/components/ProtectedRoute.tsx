import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";
import { LoadingScreen } from "./LoadingScreen";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { userId, isLoading } = useAuth();

	if (isLoading) {
		return <LoadingScreen />;
	}

	if (!userId) {
		return <Navigate to="/auth/sign-in" replace />;
	}

	return children;
}
