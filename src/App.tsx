import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { RootLayout } from "./layouts/RootLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SignInPage } from "./pages/auth/SignInPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { PasswordResetPage } from "./pages/auth/PasswordResetPage";
import { GridPage } from "./pages/app/GridPage";
import { RightNowPage } from "./pages/app/RightNowPage";
import { InterestPage } from "./pages/app/InterestPage";
import { ChatPage } from "./pages/app/ChatPage";

function ErrorPage() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<h1 className="text-4xl font-bold mb-4">Error</h1>
				<p className="text-gray-500">Something went wrong</p>
			</div>
		</div>
	);
}

export default function App() {
	return (
		<AuthProvider>
			<PreferencesProvider>
				<Routes>
					<Route element={<RootLayout />}>
						{/* Auth Routes */}
						<Route path="/auth/sign-in" element={<SignInPage />} />
						<Route path="/auth/sign-up" element={<SignUpPage />} />
						<Route
							path="/auth/password-reset"
							element={<PasswordResetPage />}
						/>

						{/* Protected Routes */}
						<Route
							element={
								<ProtectedRoute>
									<ProtectedLayout />
								</ProtectedRoute>
							}
						>
							<Route path="/" element={<GridPage />} />
							<Route path="/right-now" element={<RightNowPage />} />
							<Route path="/interest" element={<InterestPage />} />
							<Route path="/chat" element={<ChatPage />} />
						</Route>

						{/* Error Route */}
						<Route path="*" element={<ErrorPage />} />
					</Route>
				</Routes>
			</PreferencesProvider>
		</AuthProvider>
	);
}
