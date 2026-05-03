import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
	const { userId, isLoading } = useAuth();

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-primary"></div>
			</div>
		);
	}

	if (!userId) {
		return <Navigate to="/auth/sign-in" replace />;
	}

	return children;
}
