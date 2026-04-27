import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { RootLayout } from "./layouts/RootLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SignInPage } from "./pages/auth/SignInPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { PasswordResetPage } from "./pages/auth/PasswordResetPage";
import { GridPage } from "./pages/app/GridPage.tsx";
import { BrowseFiltersPage } from "./pages/app/BrowseFiltersPage.tsx";
import { BrowseLocationPage } from "./pages/app/BrowseLocationPage";
import { RightNowPage } from "./pages/app/RightNowPage";import { InterestPage } from "./pages/app/InterestPage";
import { ChatPage } from "./pages/app/ChatPage";
import { ChatFiltersPage } from "./pages/app/ChatFiltersPage";
import { ChatSearchPage } from "./pages/app/ChatSearchPage";
import { SettingsPage } from "./pages/app/SettingsPage.tsx";
import { ProfileEditorPage } from "./pages/app/ProfileEditorPage.tsx";
import { GridProfilePage } from "./pages/app/GridProfilePage.tsx";
import { AboutPage } from "./pages/app/AboutPage.tsx";
import { SettingsAlbumsPage } from "./pages/app/SettingsAlbumsPage.tsx";
import { AgeVerificationPage } from "./pages/app/AgeVerificationPage.tsx";
import { SharedAlbumsPage } from "./pages/app/SharedAlbumsPage.tsx";
import { ApiInspectorPage } from "./pages/app/ApiInspectorPage.tsx";

function ErrorPage() {
	return (
		<div className="app-screen flex items-center justify-center">
			<div className="surface-card w-full max-w-md p-6 text-center sm:p-8">
				<h1 className="text-4xl font-bold mb-4">Error</h1>
				<p className="text-[var(--text-muted)]">Something went wrong</p>
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
							<Route path="/browse/filters" element={<BrowseFiltersPage />} />
							<Route path="/browse/location" element={<BrowseLocationPage />} />
							<Route path="/right-now" element={<RightNowPage />} />							<Route path="/interest" element={<InterestPage />} />
							<Route path="/chat" element={<ChatPage />} />
							<Route path="/chat/filters" element={<ChatFiltersPage />} />
							<Route path="/chat/search" element={<ChatSearchPage />} />
							<Route path="/chat/:conversationId" element={<ChatPage />} />
							<Route path="/profile/:profileId" element={<GridProfilePage />} />
							<Route path="/settings" element={<SettingsPage />} />
							<Route path="/settings/about" element={<AboutPage />} />
							<Route path="/settings/albums" element={<SettingsAlbumsPage />} />
							<Route
								path="/settings/api-inspector"
								element={<ApiInspectorPage />}
							/>
							<Route
								path="/settings/shared-albums"
								element={<SharedAlbumsPage />}
							/>
							<Route
								path="/settings/age-verification"
								element={<AgeVerificationPage />}
							/>
							<Route
								path="/settings/profile-editor"
								element={<ProfileEditorPage />}
							/>
						</Route>

						{/* Error Route */}
						<Route path="*" element={<ErrorPage />} />
					</Route>
				</Routes>
			</PreferencesProvider>
		</AuthProvider>
	);
}
