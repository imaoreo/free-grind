import { useNavigate } from "react-router-dom";
import {
	BadgeInfo,
	Bell,
	ChevronRight,
	Download,
	Images,
	Info,
	LogOut,
	MessageSquareWarning,
	Palette,
	Radar,
	RefreshCcw,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/useAuth";
import { useApi } from "../../hooks/useApi";
import { usePreferences } from "../../contexts/PreferencesContext";
import { exportAllLogs } from "../../services/chatLog";
import {
	checkForHotswapUpdate,
	getCurrentHotswapChannel,
	getHotswapChannels,
	installHotswapUpdate,
	isHotswapAvailable,
	setHotswapChannel,
	type HotswapChannel,
} from "../../services/hotswap";
import { Button } from "../../components/ui/button";

const PUSH_TOKEN_STORAGE_KEY = "fg-fcm-token";
const PUSH_TOKEN_SYNCED_STORAGE_KEY = "fg-fcm-token-synced";

function getErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	if (typeof error === "string") {
		return error;
	}

	try {
		return JSON.stringify(error);
	} catch {
		// ignore
	}

	return fallback;
}

export function SettingsPage() {
	const { t } = useTranslation();
	const { logout } = useAuth();
	const navigate = useNavigate();
	const { callMethod, asAppError } = useApi();
	const { developerMode } = usePreferences();
	const [isExporting, setIsExporting] = useState(false);
	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
	const [isSwitchingChannel, setIsSwitchingChannel] = useState(false);
	const [isSyncingFcm, setIsSyncingFcm] = useState(false);
	const [fcmToken, setFcmToken] = useState<string | null>(() => {
		const stored = window.localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
		if (stored) return stored;
		const win = window as Window & { __FG_FCM_TOKEN?: string };
		return typeof win.__FG_FCM_TOKEN === "string" ? win.__FG_FCM_TOKEN : null;
	});
	const [fcmSyncedToken, setFcmSyncedToken] = useState<string | null>(() => window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY));
	const [fcmEventLog, setFcmEventLog] = useState<{ time: string; token: string }[]>([]);
	const [manualToken, setManualToken] = useState("");
	const fcmLogRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onFcmToken = (event: Event) => {
			const token = (event as CustomEvent<{ token: string }>).detail?.token;
			if (typeof token !== "string") return;
			setFcmToken(token);
			setFcmSyncedToken(window.localStorage.getItem(PUSH_TOKEN_SYNCED_STORAGE_KEY));
			const time = new Date().toLocaleTimeString();
			setFcmEventLog((prev) => [...prev, { time, token }]);
			setTimeout(() => {
				fcmLogRef.current?.scrollTo({ top: fcmLogRef.current.scrollHeight, behavior: "smooth" });
			}, 50);
		};
		window.addEventListener("fg:fcm-token", onFcmToken as EventListener);
		return () => window.removeEventListener("fg:fcm-token", onFcmToken as EventListener);
	}, []);
	const [updateChannel, setUpdateChannel] =
		useState<HotswapChannel>(getCurrentHotswapChannel());
	const visibleChannels = getHotswapChannels({ includeDevChannels: developerMode });

	useEffect(() => {
		if (!developerMode && updateChannel === "testingwjay") {
			void setHotswapChannel("main").then(() => {
				setUpdateChannel("main");
				toast("Developer-only update channel disabled; switched to main.");
			});
		}
	}, [developerMode, updateChannel]);

	const handleForceSyncFcm = useCallback(async (overrideToken?: string) => {
		const tokenToSync = overrideToken ?? fcmToken;
		if (!tokenToSync) {
			toast.error("No FCM token to sync.");
			return;
		}
		setIsSyncingFcm(true);
		try {
			await callMethod("sync_push_token", { token: tokenToSync });
			window.localStorage.setItem(PUSH_TOKEN_SYNCED_STORAGE_KEY, tokenToSync);
			setFcmSyncedToken(tokenToSync);
			toast.success("FCM token synced to Grindr.");
		} catch (error) {
			const appError = asAppError(error);
			toast.error(appError?.prettyMessage ?? (error instanceof Error ? error.message : "Sync failed"));
		} finally {
			setIsSyncingFcm(false);
		}
	}, [fcmToken, callMethod, asAppError]);

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			const message = getErrorMessage(error, "Failed to log out.");
			toast.error(message);
		}
	};

	const handleExport = async () => {
		setIsExporting(true);
		try {
			const data = await exportAllLogs();
			const json = JSON.stringify(data, null, 2);
			const blob = new Blob([json], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `free-grind-export-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			toast.success("Chat export downloaded.");
		} catch (error) {
			const message = getErrorMessage(error, "Failed to export chat data.");
			toast.error(message);
		} finally {
			setIsExporting(false);
		}
	};

	const handleCheckUpdates = async () => {
		if (!isHotswapAvailable()) {
			toast.error(t("settings.ota_available_only_tauri"));
			return;
		}

		setIsCheckingUpdates(true);
		try {
			const result = await checkForHotswapUpdate();
			if (result.requiresBinaryUpdate) {
				toast.error(
					result.notes ??
						"This build is no longer compatible. Please download and install the latest APK.",
				);
				return;
			}

			if (!result.available) {
				toast.success(t("settings.latest_version"));
				return;
			}

			await installHotswapUpdate();
			toast.success(t("settings.update_installed"));
			window.location.reload();
		} catch (error) {
			const msg = getErrorMessage(error, t("settings.failed_update_check"));
			if (import.meta.env.DEV) {
				console.error("Update check failed:", error, "| message:", msg);
			}
			toast.error(msg, { duration: 10000 });
		} finally {
			setIsCheckingUpdates(false);
		}
	};

	const handleSwitchUpdateChannel = async (channel: HotswapChannel) => {
		if (!developerMode && channel === "testingwjay") {
			toast.error("Enable Developer Mode to use this update branch.");
			return;
		}

		if (!isHotswapAvailable()) {
			toast.error(t("settings.ota_available_only_tauri"));
			return;
		}

		if (channel === updateChannel) {
			return;
		}

		setIsSwitchingChannel(true);
		try {
			await setHotswapChannel(channel);
			setUpdateChannel(channel);

			const result = await checkForHotswapUpdate();
			if (!result.requiresBinaryUpdate && result.available) {
				await installHotswapUpdate();
				toast.success(t("settings.switched_and_updated", { channel }));
				window.location.reload();
				return;
			}

			toast.success(t("settings.switched_channel", { channel }));
			window.location.reload();
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error("Switch update environment failed:", error);
			}
			toast.error(t("settings.failed_switch_env"));
		} finally {
			setIsSwitchingChannel(false);
		}
	};

	return (
		<section className="app-screen">
			<header className="mb-6">
				<h1 className="app-title mb-2">{t("settings.title")}</h1>
				<p className="app-subtitle">{t("settings.subtitle")}</p>
				{developerMode ? (
					<p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-readable)]">
						Developer Mode
					</p>
				) : null}
			</header>

			<div className="grid gap-4">

				<button
					type="button"
					onClick={() => navigate("/settings/profile-editor")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<BadgeInfo className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">
								{t("settings.profile_editor")}
							</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.profile_editor_desc")}
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				<button
					type="button"
					onClick={() => navigate("/settings/customizability")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<Palette className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">
								{t("settings.customizability")}
							</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.customizability_desc")}
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				<button
					type="button"
					onClick={() => navigate("/settings/report-issue")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<MessageSquareWarning className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">
								{t("settings.report_issue")}
							</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.report_issue_desc")}
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

                {/*
                    <button
                        type="button"
                        onClick={() => navigate("/settings/age-verification")}
                        className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-xl bg-[var(--surface-2)] p-2.5">
                                <ScanFace className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-base font-semibold">Age Verification</p>
                                <p className="text-sm text-[var(--text-muted)]">
                                    Verify your age to unlock all features.
                                </p>
                            </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
                    </button>
                */}


				<button
					type="button"
					onClick={() => navigate("/settings/about")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<Info className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">{t("settings.about")}</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.about_desc")}
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				{developerMode ? (
					<button
						type="button"
						onClick={() => navigate("/settings/api-inspector")}
						className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
					>
						<div className="flex items-center gap-3">
							<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
								<Radar className="h-5 w-5" />
							</div>
							<div>
								<p className="text-base font-semibold">
									{t("settings.api_inspector")}
								</p>
								<p className="text-sm text-[var(--text-muted)]">
									{t("settings.api_inspector_desc")}
								</p>
							</div>
						</div>
						<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
					</button>
				) : null}

				<button
					type="button"
					onClick={() => navigate("/settings/albums")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<Images className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">{t("settings.my_albums")}</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.my_albums_desc")}
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				<button
					type="button"
					onClick={() => void handleExport()}
					disabled={isExporting}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<Download className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">{t("settings.export_chat")}</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.export_chat_desc")}
							</p>
						</div>
					</div>
					{isExporting ? (
						<span className="text-xs text-[var(--text-muted)]">
							{t("settings.exporting")}
						</span>
					) : (
						<Download className="h-5 w-5 text-[var(--text-muted)]" />
					)}
				</button>

				<div className="surface-card flex w-full items-center justify-between p-4 text-left sm:p-5">
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<RefreshCcw className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">
								{t("settings.check_updates")}
							</p>
							<p className="text-sm text-[var(--text-muted)]">
								{t("settings.environment")}: <strong>{updateChannel}</strong>
							</p>
							<div className="mt-2 flex flex-wrap items-center gap-2">
								{visibleChannels.map((channel) => (
									<button
										key={channel}
										type="button"
										disabled={isSwitchingChannel || isCheckingUpdates}
										onClick={() => void handleSwitchUpdateChannel(channel)}
										className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
											channel === updateChannel
												? "border-[var(--accent)] bg-[var(--accent)] text-black"
												: "border-[var(--surface-2)] bg-[var(--surface-1)] text-[var(--text-muted)]"
										}`}
									>
										{channel}
									</button>
								))}
							</div>
						</div>
					</div>
					{isSwitchingChannel ? (
						<span className="text-xs text-[var(--text-muted)]">
							{t("settings.switching")}
						</span>
					) : isCheckingUpdates ? (
						<span className="text-xs text-[var(--text-muted)]">
							{t("settings.checking")}
						</span>
					) : (
						<Button
							type="button"
							onClick={() => void handleCheckUpdates()}
							disabled={isCheckingUpdates || isSwitchingChannel}
						>
							{t("settings.check_now")}
						</Button>
					)}
				</div>

				{developerMode ? (
					<div className="surface-card p-4 sm:p-5">
					<div className="flex items-start gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5 shrink-0">
							<Bell className="h-5 w-5" />
						</div>
						<div className="grid gap-3 min-w-0 flex-1">
							<p className="text-base font-semibold">Push Token (FCM)</p>

							{/* Current token */}
							{fcmToken ? (
								<div className="grid gap-2">
									<div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
										<p className="text-xs text-[var(--text-muted)] mb-1">Token (tap to select)</p>
										<p className="break-all font-mono text-xs select-all">{fcmToken}</p>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
											fcmSyncedToken === fcmToken
												? "bg-green-500/20 text-green-400"
												: "bg-yellow-500/20 text-yellow-400"
										}`}>
											{fcmSyncedToken === fcmToken ? "✓ Synced to Grindr" : "⚠ Not yet synced"}
										</span>
										<Button type="button" size="sm" disabled={isSyncingFcm} onClick={() => void handleForceSyncFcm()}>
											{isSyncingFcm ? "Syncing..." : "Force re-sync"}
										</Button>
									</div>
								</div>
							) : (
								<div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-400">
									<p className="font-medium mb-0.5">No token received yet</p>
									<p className="text-xs opacity-80">Android delivers the FCM token via the <code>fg:fcm-token</code> event after Firebase initialises on launch. If you see nothing below, Firebase may have failed — check that Google Play Services is working on this device.</p>
								</div>
							)}

							{/* Live event log */}
							<div>
								<p className="text-xs font-medium text-[var(--text-muted)] mb-1">
									Live event log {fcmEventLog.length > 0 ? `(${fcmEventLog.length} received this session)` : "(waiting…)"}
								</p>
								<div
									ref={fcmLogRef}
									className="rounded-lg bg-[var(--surface-2)] px-3 py-2 max-h-32 overflow-y-auto"
								>
									{fcmEventLog.length === 0 ? (
										<p className="font-mono text-xs text-[var(--text-muted)] italic">No fg:fcm-token events fired since this page opened</p>
									) : (
										fcmEventLog.map((entry, i) => (
											<p key={i} className="font-mono text-xs break-all">
												<span className="text-[var(--text-muted)]">[{entry.time}] </span>
												{entry.token.slice(0, 20)}…{entry.token.slice(-8)}
											</p>
										))
									)}
								</div>
							</div>

							{/* Manual token input */}
							<div className="grid gap-1.5">
								<p className="text-xs font-medium text-[var(--text-muted)]">Manual token (paste to force-sync)</p>
								<div className="flex gap-2">
									<input
										type="text"
										value={manualToken}
										onChange={(e) => setManualToken(e.target.value)}
										placeholder="Paste FCM token here…"
										className="input-field min-w-0 flex-1 font-mono text-xs"
									/>
									<Button
										type="button"
										size="sm"
										disabled={isSyncingFcm || !manualToken.trim()}
										onClick={() => void handleForceSyncFcm(manualToken.trim())}
									>
										Sync
									</Button>
								</div>
							</div>
						</div>
					</div>
					</div>
				) : null}

				<div className="mt-2 flex flex-wrap items-center gap-3">
					<Button type="button" onClick={() => navigate("/")}>
						{t("settings.back_to_browse")}
					</Button>
					<Button type="button" variant="primary" onClick={handleLogout}>
						<LogOut className="h-4 w-4" />
						{t("settings.logout")}
					</Button>
				</div>
			</div>
		</section>
	);
}
