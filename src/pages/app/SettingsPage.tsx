import { useNavigate } from "react-router-dom";
import {
	BadgeInfo,
	Bell,
	Bookmark,
	Bug,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	Download,
	GitBranch,
	Images,
	Info,
	LogOut,
	MessageSquareWarning,
	Palette,
	Radar,
	RefreshCcw,
	Shield,
    Workflow,
	UserX,
} from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { appLog } from "../../utils/logger";
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
	clearContributorChannel,
	isContributorChannel,
	getContributorHandle,
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
	const { developerMode, showDebugInfo, setPreferences } = usePreferences();
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
    const [forbiddenWords, setForbiddenWords] = useState(() => window.localStorage.getItem("fg-forbidden-words") || "");
    const [blockOnGrid, setBlockOnGrid] = useState(() => window.localStorage.getItem("fg-block-grid") === "true");
	const [blockOnChat, setBlockOnChat] = useState(() => window.localStorage.getItem("fg-block-chat") !== "false"); // Default to true
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
	const [contributorCodeInput, setContributorCodeInput] = useState("");
	const [isActivatingContributor, setIsActivatingContributor] = useState(false);

	useEffect(() => {
		if (!developerMode && updateChannel === "testingwjay") {
			void setHotswapChannel("main").then(() => {
				setUpdateChannel("main");
				toast("Developer-only update channel disabled; switched to main.");
			});
		}
		// Contributor channels are always allowed regardless of developer mode
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
				appLog.error("Update check failed:", error, "| message:", msg);
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
				appLog.error("Switch update environment failed:", error);
			}
			toast.error(t("settings.failed_switch_env"));
		} finally {
			setIsSwitchingChannel(false);
		}
	};

	const handleActivateContributorChannel = async () => {
		const handle = contributorCodeInput.trim().toLowerCase();
		if (!handle || !/^[a-z0-9_-]{1,32}$/.test(handle)) {
			toast.error("Enter a valid contributor code (letters, numbers, _ or -).");
			return;
		}

		if (!isHotswapAvailable()) {
			toast.error(t("settings.ota_available_only_tauri"));
			return;
		}

		const channel: HotswapChannel = `contrib-${handle}`;
		setIsActivatingContributor(true);
		try {
			await setHotswapChannel(channel);
			setUpdateChannel(channel);
			setContributorCodeInput("");

			const result = await checkForHotswapUpdate();
			if (!result.available) {
				toast.success(`Switched to ${handle}'s channel. No update available yet.`);
				window.location.reload();
				return;
			}
			if (result.requiresBinaryUpdate) {
				toast.error(result.notes ?? "Binary update required.");
				return;
			}
			await installHotswapUpdate();
			toast.success(`Switched to ${handle}'s channel and updated!`);
			window.location.reload();
		} catch (error) {
			if (import.meta.env.DEV) {
				appLog.error("Contributor channel switch failed:", error);
			}
			toast.error("Failed to switch to contributor channel.");
		} finally {
			setIsActivatingContributor(false);
		}
	};

	const handleLeaveContributorChannel = async () => {
		if (!isHotswapAvailable()) {
			toast.error(t("settings.ota_available_only_tauri"));
			return;
		}

		setIsSwitchingChannel(true);
		try {
			await clearContributorChannel();
			setUpdateChannel("main");
			toast.success("Left contributor channel, switched back to main.");
			window.location.reload();
		} catch (error) {
			if (import.meta.env.DEV) {
				appLog.error("Leave contributor channel failed:", error);
			}
			toast.error("Failed to leave contributor channel.");
		} finally {
			setIsSwitchingChannel(false);
		}
	};

	const navRow = (
		onClick: (() => void) | null,
		icon: React.ReactNode,
		iconClass: string,
		label: string,
		desc: string,
		right?: React.ReactNode,
		disabled?: boolean,
	) => {
		const inner = (
			<>
				<div className={`rounded-2xl p-2.5 shrink-0 ${iconClass}`}>
					{icon}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold leading-snug">{label}</p>
					<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">{desc}</p>
				</div>
				{right ?? <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />}
			</>
		);
		const cls = `flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"}`;
		return onClick ? (
			<button type="button" onClick={onClick} disabled={disabled} className={cls}>
				{inner}
			</button>
		) : (
			<div className={cls}>{inner}</div>
		);
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<button
					type="button"
					onClick={() => navigate("/")}
					className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
					aria-label={t("settings.back_to_browse")}
				>
					<ChevronLeft className="h-4 w-4" />
					Browse
				</button>
				<div className="flex items-center gap-2">
					<h1 className="app-title">{t("settings.title")}</h1>
					{developerMode ? (
						<span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-contrast)]">
							Dev
						</span>
					) : null}
				</div>
				<p className="app-subtitle mt-1">{t("settings.subtitle")}</p>
			</header>

			<div className="grid gap-6">

				{/* Profile */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Profile</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/profile-editor"),
							<BadgeInfo className="h-5 w-5" />,
							"bg-blue-500/15 text-blue-400",
							t("settings.profile_editor"),
							t("settings.profile_editor_desc"),
						)}
						{navRow(
							() => navigate("/settings/albums"),
							<Images className="h-5 w-5" />,
							"bg-pink-500/15 text-pink-400",
							t("settings.my_albums"),
							t("settings.my_albums_desc"),
						)}
						{navRow(
							() => navigate("/settings/customizability"),
							<Palette className="h-5 w-5" />,
							"bg-violet-500/15 text-violet-400",
							t("settings.customizability"),
							t("settings.customizability_desc"),
						)}
					</div>
				</div>

				{/* Chat */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Chat</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/automation"),
							<Workflow className="h-5 w-5" />,
							"bg-amber-500/15 text-amber-400",
							t("settings.automation"),
							t("settings.automation_desc"),
						)}
						{navRow(
							() => navigate("/settings/saved-phrases"),
							<Bookmark className="h-5 w-5" />,
							"bg-emerald-500/15 text-emerald-400",
							t("settings.saved_phrases", { defaultValue: "Saved Phrases" }),
							t("settings.saved_phrases_desc", { defaultValue: "Manage chat quick replies and import/export .txt" }),
						)}
						{navRow(
							isExporting ? null : () => void handleExport(),
							<Download className="h-5 w-5" />,
							"bg-teal-500/15 text-teal-400",
							t("settings.export_chat"),
							t("settings.export_chat_desc"),
							isExporting ? <span className="text-xs text-[var(--text-muted)]">{t("settings.exporting")}</span> : undefined,
							isExporting,
						)}
					</div>
				</div>

				{/* Safety */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Safety</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/blocked"),
							<UserX className="h-5 w-5" />,
							"bg-red-500/15 text-red-400",
							t("settings.blocked_accounts"),
							t("settings.blocked_accounts_desc"),
						)}
						{navRow(
							() => navigate("/settings/privacy"),
							<Shield className="h-5 w-5" />,
							"bg-sky-500/15 text-sky-400",
							t("settings.privacy"),
							t("settings.privacy_desc"),
						)}
					</div>
				</div>

				{/* Updates */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Updates</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">

						{/* Check for Updates + Channel switcher */}
						<div className="flex items-start gap-3 px-4 py-3.5">
							<div className="rounded-2xl bg-green-500/15 p-2.5 shrink-0 text-green-400">
								<RefreshCcw className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="grid grid-cols-[1fr_auto] gap-x-3">
									<p className="text-sm font-semibold leading-snug">{t("settings.check_updates")}</p>
									<div className="row-span-2 flex items-start">
										{isSwitchingChannel ? (
											<span className="text-xs text-[var(--text-muted)]">{t("settings.switching")}</span>
										) : isCheckingUpdates ? (
											<span className="text-xs text-[var(--text-muted)]">{t("settings.checking")}</span>
										) : (
											<Button type="button" onClick={() => void handleCheckUpdates()} disabled={isCheckingUpdates || isSwitchingChannel}>
												{t("settings.check_now")}
											</Button>
										)}
									</div>
									<p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("settings.check_updates_desc")}</p>
								</div>
								{visibleChannels.length > 0 && (
									<div className="mt-3 flex flex-wrap gap-1">
										{visibleChannels.map((channel) => (
											<button
												key={channel}
												type="button"
												disabled={isSwitchingChannel || isCheckingUpdates}
												onClick={() => void handleSwitchUpdateChannel(channel)}
												className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
													channel === updateChannel
														? "border-[var(--accent)] bg-[var(--accent)] text-black"
														: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)]/50"
												}`}
											>
												{channel}
											</button>
										))}
									</div>
								)}
							</div>
						</div>

						{/* Contributor Channel */}
						{(developerMode || isContributorChannel(updateChannel)) && (
							<div className="px-4 py-3.5">
								<div className="flex items-start gap-3">
									<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
										<GitBranch className="h-5 w-5" />
									</div>
									<div className="grid gap-2 min-w-0 flex-1">
										<div>
											<p className="text-sm font-semibold leading-snug">Contributor Channel</p>
											<p className="text-xs text-[var(--text-muted)] mt-0.5">Receive experimental builds from a community contributor.</p>
										</div>
										{isContributorChannel(updateChannel) ? (
											<>
												<div className="flex items-center justify-between rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-3 py-2">
													<div>
														<p className="text-xs text-[var(--text-muted)]">Active</p>
														<p className="text-sm font-semibold text-[var(--accent)]">{getContributorHandle(updateChannel)}</p>
													</div>
													<button
														type="button"
														disabled={isSwitchingChannel}
														onClick={() => void handleLeaveContributorChannel()}
														className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:border-red-400 hover:text-red-400 disabled:opacity-50"
													>
														{isSwitchingChannel ? "Leaving…" : "Leave"}
													</button>
												</div>
												<p className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
													Community build — use at your own risk.
												</p>
											</>
										) : developerMode ? (
											<div className="flex items-center gap-2">
												<input
													type="text"
													value={contributorCodeInput}
													onChange={(e) => setContributorCodeInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
													onKeyDown={(e) => { if (e.key === "Enter") void handleActivateContributorChannel(); }}
													placeholder="contributor-handle"
													maxLength={32}
													className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]"
												/>
												<button
													type="button"
													disabled={isActivatingContributor || !contributorCodeInput}
													onClick={() => void handleActivateContributorChannel()}
													className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-black transition disabled:opacity-50"
												>
													{isActivatingContributor ? "Activating…" : "Activate"}
												</button>
											</div>
										) : null}
									</div>
								</div>
							</div>
						)}
					</div>
				</div>

				{/* Dev tools */}
				{developerMode ? (
					<div>
						<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Developer</p>
						<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
							<div className="flex w-full items-center gap-3 px-4 py-3.5">
								<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
									<Bug className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-semibold leading-snug">Show Debug Overlays</p>
									<p className="text-xs text-[var(--text-muted)] mt-0.5">Displays source (cache/network) info in the grid.</p>
								</div>
								<button
									type="button"
									onClick={() => void setPreferences({ showDebugInfo: !showDebugInfo })}
									className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${showDebugInfo ? "bg-[var(--accent)]" : "bg-[var(--surface-2)]"}`}
								>
									<span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${showDebugInfo ? "translate-x-5" : "translate-x-0"}`} />
								</button>
							</div>
							{navRow(
								() => navigate("/settings/api-inspector"),
								<Radar className="h-5 w-5" />,
								"bg-[var(--surface-2)] text-[var(--text-muted)]",
								t("settings.api_inspector"),
								t("settings.api_inspector_desc"),
							)}
							<div className="p-4 sm:p-5">
								<div className="flex items-start gap-3">
									<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
										<Bell className="h-5 w-5" />
									</div>
									<div className="grid gap-3 min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<p className="text-sm font-semibold">Push Token (FCM)</p>
											{fcmToken && (
												<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${fcmSyncedToken === fcmToken ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
													{fcmSyncedToken === fcmToken ? "✓ Synced" : "⚠ Not synced"}
												</span>
											)}
										</div>
										{fcmToken ? (
											<div className="grid gap-2">
												<div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
													<p className="text-xs text-[var(--text-muted)] mb-1">Token (tap to select)</p>
													<p className="break-all font-mono text-xs select-all">{fcmToken}</p>
												</div>
												<Button type="button" size="sm" disabled={isSyncingFcm} onClick={() => void handleForceSyncFcm()} className="w-full justify-center">
													{isSyncingFcm ? "Syncing..." : "Force re-sync"}
												</Button>
                                            </div>
										) : (
											<div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-400">
												<p className="font-medium mb-0.5">No token received yet</p>
												<p className="text-xs opacity-80">Android delivers the FCM token via the <code>fg:fcm-token</code> event after Firebase initialises on launch.</p>
											</div>
										)}
										<div>
											<p className="text-xs font-medium text-[var(--text-muted)] mb-1">
												Live event log {fcmEventLog.length > 0 ? `(${fcmEventLog.length} received this session)` : "(waiting…)"}
											</p>
											<div ref={fcmLogRef} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 max-h-32 overflow-y-auto">
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
												<Button type="button" size="sm" disabled={isSyncingFcm || !manualToken.trim()} onClick={() => void handleForceSyncFcm(manualToken.trim())}>
													Sync
												</Button>
											</div>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				) : null}

				{/* About */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">About</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/about"),
							<Info className="h-5 w-5" />,
							"bg-slate-500/15 text-slate-400",
							t("settings.about"),
							t("settings.about_desc"),
						)}
						{navRow(
							() => navigate("/settings/issues"),
							<ClipboardList className="h-5 w-5" />,
							"bg-orange-500/15 text-orange-400",
							t("settings.issue_board"),
							t("settings.issue_board_desc"),
						)}
						{navRow(
							() => navigate("/settings/report-issue"),
							<MessageSquareWarning className="h-5 w-5" />,
							"bg-rose-500/15 text-rose-400",
							t("settings.report_issue"),
							t("settings.report_issue_desc"),
						)}
					</div>
				</div>

				{/* Logout */}
				<div className="surface-card overflow-hidden">
					<div className="flex items-center gap-3 px-4 py-3.5">
						<div className="rounded-2xl bg-red-500/15 p-2.5 shrink-0 text-red-400">
							<LogOut className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold leading-snug">{t("settings.logout")}</p>
							<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
								{t("profile_editor.logout_description", { defaultValue: "You will be signed out of your account on this device." })}
							</p>
						</div>
						<button
							type="button"
							onClick={() => void handleLogout()}
							className="shrink-0 inline-flex items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
						>
							{t("settings.logout")}
						</button>
					</div>
				</div>

			</div>
		</section>
	);
}
