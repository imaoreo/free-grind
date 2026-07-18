import { useEffect, useState } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "./contexts/AuthContext";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { ExploreModeProvider } from "./contexts/ExploreModeContext";
import { RootLayout } from "./layouts/RootLayout";
import { ProtectedLayout } from "./layouts/ProtectedLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SignInPage } from "./pages/auth/SignInPage";
import { SignUpPage } from "./pages/auth/SignUpPage";
import { PasswordResetPage } from "./pages/auth/PasswordResetPage";
import { GridPage } from "./pages/app/GridPage.tsx";
import { BrowseLocationPage } from "./pages/app/BrowseLocationPage";
import { RightNowPage } from "./pages/app/RightNowPage";
import { InterestPage } from "./pages/app/InterestPage";
import { ChatPage } from "./pages/app/ChatPage";
import { ChatFiltersPage } from "./pages/app/ChatFiltersPage";
import { SettingsPage } from "./pages/app/SettingsPage.tsx";
import { ProfileEditorPage } from "./pages/app/ProfileEditorPage.tsx";
import { GridProfilePage } from "./pages/app/GridProfilePage.tsx";
import { AboutPage } from "./pages/app/AboutPage.tsx";
import { SettingsAlbumsPage } from "./pages/app/SettingsAlbumsPage.tsx";
import { SettingsBlockedPage } from "./pages/app/SettingsBlockedPage.tsx";
import { SettingsBlockHistoryPage } from "./pages/app/SettingsBlockHistoryPage.tsx";
import { AgeVerificationPage } from "./pages/app/AgeVerificationPage.tsx";
import { SharedAlbumsPage } from "./pages/app/SharedAlbumsPage.tsx";
import { ApiInspectorPage } from "./pages/app/ApiInspectorPage.tsx";
import { CustomizabilityPage } from "./pages/app/CustomizabilityPage.tsx";
import { BehaviorPage } from "./pages/app/BehaviorPage.tsx";
import { NotificationsPage } from "./pages/app/NotificationsPage.tsx";
import { ReportIssuePage } from "./pages/app/ReportIssuePage.tsx";
import { IssueSearchPage } from "./pages/app/IssueSearchPage.tsx";
import { SettingsAutomationPage } from "./pages/app/SettingsAutomationPage.tsx";
import { SettingsDataPage } from "./pages/app/SettingsDataPage.tsx";
import { SettingsPrivacyPage } from "./pages/app/SettingsPrivacyPage.tsx";
import { SettingsSavedPhrasesPage } from "./pages/app/SettingsSavedPhrasesPage.tsx";
import { SexualHealthPage } from "./pages/app/sexual-health/SexualHealthPage.tsx";
import { PermissionsOnboarding } from "./components/PermissionsOnboarding";
import { VersionAnnouncement } from "./components/VersionAnnouncement";
import { OutdatedVersionGate } from "./components/OutdatedVersionPrompt";
import { TestReminderGate } from "./components/TestReminderPrompt";
import { PushNotificationBridge } from "./components/PushNotificationBridge";
import { ChatRealtimeBridge } from "./components/ChatRealtimeBridge";
import { VideoCallManager } from "./components/VideoCallManager";
import { ActiveRouteBridge } from "./components/ActiveRouteBridge";
import { EntitlementsBridge } from "./components/EntitlementsBridge";
import { ManagedOptionsCacheBridge } from "./components/ManagedOptionsCacheBridge";
import { SplashReadyBridge } from "./components/SplashReadyBridge";
import { SmoothScroll } from "./components/SmoothScroll";
import { SinModeUnlockOverlay } from "./components/SinModeUnlockOverlay";
import { usePreferences } from "./contexts/PreferencesContext";
import ManagerApp from "./ManagerApp";
import { getRuntimeContext } from "./services/runtimeContext";
import { hasCompletedOnboarding } from "./utils/onboardingStorage";
import { getLastSeenAnnouncementVersion, markAnnouncementSeen } from "./utils/announcementStorage";
import { VERSION_ANNOUNCEMENTS } from "./data/versionAnnouncements";
import { useRenderPhase } from "./hooks/useRenderPhase";

function ErrorPage() {
	const { t } = useTranslation();

	return (
		<div className="app-screen flex items-center justify-center">
			<div className="surface-card w-full max-w-md p-6 text-center sm:p-8">
				<h1 className="text-4xl font-bold mb-4">{t("errors.title")}</h1>
				<p className="text-[var(--text-muted)]">{t("errors.subtitle")}</p>
				<div className="mt-5">
					<Link
						to="/"
						className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
					>
						{t("errors.action_home")}
					</Link>
				</div>
			</div>
		</div>
	);
}

function DeveloperModeRoute({ children }: { children: React.ReactNode }) {
	const { developerMode } = usePreferences();

	if (!developerMode) {
		return <Navigate to="/settings" replace />;
	}

	return <>{children}</>;
}

function ManagerModeRedirect() {
	const [targetPath, setTargetPath] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const runtime = await getRuntimeContext();
			if (cancelled) {
				return;
			}

			if (runtime.mode === "manager" || runtime.instanceLabel === "manager") {
				setTargetPath("/manager");
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	if (!targetPath) {
		return null;
	}

	return <Navigate to={targetPath} replace />;
}

function ManagerRoutePage() {
	const [currentLabel, setCurrentLabel] = useState("manager");

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			const runtime = await getRuntimeContext();
			if (cancelled) {
				return;
			}

			if (runtime.instanceLabel) {
				setCurrentLabel(runtime.instanceLabel);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return <ManagerApp currentLabel={currentLabel} />;
}

const CURRENT_APP_VERSION = import.meta.env.VITE_APP_VERSION;
const PENDING_ANNOUNCEMENT = VERSION_ANNOUNCEMENTS.find((a) => a.version === CURRENT_APP_VERSION) ?? null;

export default function App() {
	const [showOnboarding, setShowOnboarding] = useState(() => !hasCompletedOnboarding());
	const [showAnnouncement, setShowAnnouncement] = useState(
		() => !showOnboarding && !!PENDING_ANNOUNCEMENT && getLastSeenAnnouncementVersion() !== CURRENT_APP_VERSION,
	);
	// The routed page itself (below) always mounts on the first frame — only
	// these non-visual startup bridges are staggered one per frame, so their
	// setup (websocket connect, native push-notification registration, route
	// tracking, entitlements fetch) doesn't all land in the same first commit
	// as the initial route.
	const renderPhase = useRenderPhase(5);

	const handleOnboardingComplete = () => {
		// A fresh install is already on the current version — it shouldn't
		// immediately see a "what's new" screen for the version it just installed.
		markAnnouncementSeen(CURRENT_APP_VERSION);
		setShowOnboarding(false);
	};

	const handleAnnouncementClose = () => {
		markAnnouncementSeen(CURRENT_APP_VERSION);
		setShowAnnouncement(false);
	};

	return (
		<AuthProvider>
			<SplashReadyBridge />
			<PreferencesProvider>
			<ExploreModeProvider>
				<SinModeUnlockOverlay />
				<SmoothScroll>
					{showOnboarding ? (
						<div className="app-shell">
							<PermissionsOnboarding onComplete={handleOnboardingComplete} />
						</div>
					) : showAnnouncement && PENDING_ANNOUNCEMENT ? (
						<div className="app-shell">
							<VersionAnnouncement announcement={PENDING_ANNOUNCEMENT} onClose={handleAnnouncementClose} />
						</div>
					) : (<OutdatedVersionGate><TestReminderGate>
					{renderPhase >= 1 && <ManagerModeRedirect />}
					{renderPhase >= 2 && <PushNotificationBridge />}
					{renderPhase >= 2 && <ManagedOptionsCacheBridge />}
					{renderPhase >= 3 && <ChatRealtimeBridge />}
					{renderPhase >= 3 && <VideoCallManager />}
					{renderPhase >= 4 && <ActiveRouteBridge />}
					{renderPhase >= 5 && (
						<>
							<EntitlementsBridge />
						</>
					)}
					<Routes>
						<Route element={<RootLayout />}>
							<Route path="/manager" element={<ManagerRoutePage />} />
							{/* Auth Routes */}
							<Route path="/auth/sign-in" element={<SignInPage />} />
							<Route path="/auth/sign-up" element={<SignUpPage />} />
							<Route
								path="/auth/password-reset"
								element={<PasswordResetPage />}
							/>
							<Route path="/report-issue" element={<ReportIssuePage />} />

							{/* Protected Routes */}
							<Route
								element={
									<ProtectedRoute>
										<ProtectedLayout />
									</ProtectedRoute>
								}
							>
								<Route path="/" element={<GridPage />} />
								<Route path="/browse/location" element={<BrowseLocationPage />} />
								<Route path="/right-now" element={<RightNowPage />} />
								<Route path="/interest" element={<InterestPage />} />
								<Route path="/chat/filters" element={<ChatFiltersPage />} />
								<Route path="/chat/albums" element={<SharedAlbumsPage />} />
								<Route path="/chat/:conversationId?" element={<ChatPage />} />
								<Route path="/profile/:profileId" element={<GridProfilePage />} />
								<Route path="/settings" element={<SettingsPage />} />
								<Route path="/settings/automation" element={<SettingsAutomationPage />} />
								<Route path="/settings/data" element={<SettingsDataPage />} />
								<Route path="/settings/privacy" element={<SettingsPrivacyPage />} />
								<Route path="/settings/about" element={<AboutPage />} />
								<Route path="/settings/albums" element={<SettingsAlbumsPage />} />
								<Route path="/settings/blocked" element={<SettingsBlockedPage />} />
								<Route path="/settings/block-history" element={<SettingsBlockHistoryPage />} />
								<Route path="/settings/saved-phrases" element={<SettingsSavedPhrasesPage />} />
								<Route path="/settings/sexual-health" element={<SexualHealthPage />} />
								<Route
									path="/settings/api-inspector"
									element={
										<DeveloperModeRoute>
											<ApiInspectorPage />
										</DeveloperModeRoute>
									}
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
									path="/settings/customizability"
									element={<CustomizabilityPage />}
								/>
								<Route
									path="/settings/behavior"
									element={<BehaviorPage />}
								/>
								<Route
									path="/settings/notifications"
									element={<NotificationsPage />}
								/>
								<Route
									path="/settings/report-issue"
									element={<ReportIssuePage />}
								/>
								<Route
									path="/settings/issues"
									element={<IssueSearchPage />}
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
					</TestReminderGate></OutdatedVersionGate>)}
				</SmoothScroll>
			</ExploreModeProvider>
			</PreferencesProvider>
		</AuthProvider>
	);
}
