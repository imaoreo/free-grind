import { useNavigate } from "react-router-dom";
import {
	AlertCircle,
	Bell,
	Bookmark,
	Bug,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	ClipboardList,
	DatabaseBackup,
	Download,
	GitBranch,
	HeartPulse,
	HelpCircle,
	Images,
	Info,
	Loader2,
	LogOut,
	Megaphone,
	MessageSquareWarning,
	History,
	Palette,
	Radar,
	RefreshCcw,
	Search,
	Shield,
	SlidersHorizontal,
	Terminal,
    Workflow,
	UserPlus,
	UserX,
	X,
} from "lucide-react";
import { useState, useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { appLog } from "../../utils/logger";
import { useAuth } from "../../contexts/useAuth";
import { useApi } from "../../hooks/useApi";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useInboxSyncStatus } from "../../hooks/useInboxSyncStatus";
import type { InboxSyncStatus } from "../../services/inboxSync";
import {
	checkForHotswapUpdate,
	getCurrentHotswapChannel,
	getHotswapChannels,
	getHotswapChannelLabel,
	installHotswapUpdate,
	isHotswapAvailable,
	setHotswapChannel,
	clearContributorChannel,
	isContributorChannel,
	getContributorHandle,
	type HotswapChannel,
} from "../../services/hotswap";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useFingerprintCheck } from "../../components/FingerprintCheckButton";
import { VersionAnnouncement } from "../../components/VersionAnnouncement";
import { VERSION_ANNOUNCEMENTS } from "../../data/versionAnnouncements";
import { OutdatedVersionPromptView } from "../../components/OutdatedVersionPrompt";
import { Avatar } from "../../components/ui/avatar";
import { getThumbImageUrl } from "../../utils/media";
import { getSavedAccountProfile, removeSavedAccountProfile } from "../../services/savedAccountProfiles";
import { isAndroid } from "../../services/saveMedia";
import { useSettingsSearchIndex } from "../../data/settingsSearchIndex";

const PUSH_TOKEN_STORAGE_KEY = "fg-fcm-token";
const PUSH_TOKEN_SYNCED_STORAGE_KEY = "fg-fcm-token-synced";
// Always previews whichever entry was added/edited most recently, regardless
// of whether it matches the app's current running version yet.
const LATEST_ANNOUNCEMENT = VERSION_ANNOUNCEMENTS[VERSION_ANNOUNCEMENTS.length - 1] ?? null;
const PREVIEW_RELEASE_INFO = {
	latestVersion: "9.9.9",
	releasesUrl: "https://github.com/imaoreo/free-grind/releases",
};

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

function describeInboxSyncStatus(status: InboxSyncStatus, t: TFunction) {
	switch (status.phase) {
		case "syncing_list":
			return {
				title: t("settings.chat_sync_syncing_list", { defaultValue: "Checking for new chats…" }),
				description:
					status.changedSoFar > 0
						? t("settings.chat_sync_syncing_list_desc_changed", {
								defaultValue: "{{checked}} checked, {{changed}} new or updated",
								checked: status.conversationsSoFar,
								changed: status.changedSoFar,
							})
						: t("settings.chat_sync_syncing_list_desc", {
								defaultValue: "{{count}} checked so far",
								count: status.conversationsSoFar,
							}),
				badgeIcon: <Loader2 className="h-3 w-3 animate-spin" />,
				badgeClass: "",
				badgeStyle: {
					backgroundColor: "var(--accent)",
					color: "var(--accent-contrast)",
				} as CSSProperties | undefined,
				progressPercent: null as number | null,
				active: true,
			};
		case "syncing_messages": {
			const progressPercent =
				status.total > 0 ? Math.round((status.completed / status.total) * 100) : null;
			return {
				title: t("settings.chat_sync_syncing_messages", {
					defaultValue: "Syncing latest messages…",
				}),
				description: t("settings.chat_sync_syncing_messages_desc", {
					defaultValue: "{{completed}} / {{total}} conversations",
					completed: status.completed,
					total: status.total,
				}),
				badgeIcon: <Loader2 className="h-3 w-3 animate-spin" />,
				badgeClass: "",
				badgeStyle: {
					backgroundColor: "var(--accent)",
					color: "var(--accent-contrast)",
				} as CSSProperties | undefined,
				progressPercent,
				active: true,
			};
		}
		case "done":
			return {
				title: t("settings.chat_sync_done", { defaultValue: "Chats up to date" }),
				description:
					status.changed > 0
						? t("settings.chat_sync_done_desc_changed", {
								defaultValue: "{{count}} conversations total, {{changed}} just updated",
								count: status.conversations,
								changed: status.changed,
							})
						: t("settings.chat_sync_done_desc", {
								defaultValue: "{{count}} conversations synced",
								count: status.conversations,
							}),
				badgeIcon: <CheckCircle2 className="h-3 w-3" />,
				badgeClass: "bg-emerald-500 text-white",
				badgeStyle: undefined as CSSProperties | undefined,
				progressPercent: null,
				active: false,
			};
		case "error":
			return {
				title: t("settings.chat_sync_error", { defaultValue: "Chat sync failed" }),
				description: status.message,
				badgeIcon: <AlertCircle className="h-3 w-3" />,
				badgeClass: "bg-red-500 text-white",
				badgeStyle: undefined as CSSProperties | undefined,
				progressPercent: null,
				active: false,
			};
		default:
			return {
				title: t("settings.chat_sync_preparing", { defaultValue: "Preparing chat sync…" }),
				description: t("settings.chat_sync_preparing_desc", {
					defaultValue: "Runs in the background and won't slow down the app.",
				}),
				badgeIcon: <Loader2 className="h-3 w-3 animate-spin" />,
				badgeClass: "",
				badgeStyle: {
					backgroundColor: "var(--accent)",
					color: "var(--accent-contrast)",
				} as CSSProperties | undefined,
				progressPercent: null,
				active: true,
			};
	}
}

export function SettingsPage() {
	const { t } = useTranslation();
	const { userId, logout, savedAccounts, switchAccount, removeSavedAccount } = useAuth();
	const inboxSyncStatus = useInboxSyncStatus(userId);
	const inboxSyncDisplay = describeInboxSyncStatus(inboxSyncStatus, t);
	const [searchQuery, setSearchQuery] = useState("");
	const settingsSearchIndex = useSettingsSearchIndex();
	const searchResults = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return [];
		return settingsSearchIndex.filter((entry) =>
			entry.label.toLowerCase().includes(query) ||
			entry.description?.toLowerCase().includes(query) ||
			entry.section.toLowerCase().includes(query),
		);
	}, [searchQuery, settingsSearchIndex]);
	const [switchingProfileId, setSwitchingProfileId] = useState<string | null>(null);
	const [removingProfileId, setRemovingProfileId] = useState<string | null>(null);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	// "active" = end the current session; a profile id = forget that saved
	// (non-active) account — both are presented the same way (logout icon +
	// confirmation) even though only the active one is a "real" logout.
	const [logoutConfirmTarget, setLogoutConfirmTarget] = useState<"active" | string | null>(null);
	const navigate = useNavigate();
	const { callMethod, asAppError } = useApi();
	const { developerMode, showDebugInfo, setPreferences } = usePreferences();
	const [previewAnnouncement, setPreviewAnnouncement] = useState(false);
	const [previewOutdatedPrompt, setPreviewOutdatedPrompt] = useState(false);
	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
	const [isSwitchingChannel, setIsSwitchingChannel] = useState(false);
	const fingerprintCheck = useFingerprintCheck();
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
	const visibleChannels = getHotswapChannels();
	const [contributorCodeInput, setContributorCodeInput] = useState("");
	const [isActivatingContributor, setIsActivatingContributor] = useState(false);

	const handleForceSyncFcm = useCallback(async (overrideToken?: string) => {
		const tokenToSync = overrideToken ?? fcmToken;
		if (!tokenToSync) {
			toast.error("No FCM token to sync.");
			return;
		}
		setIsSyncingFcm(true);
		try {
			await callMethod("sync_push_token", { token: tokenToSync });
			// Marker must match AuthContext's `${token}::${userId}` format — the same
			// FCM token is shared across saved accounts, but sync is per-account.
			const syncMarker = `${tokenToSync}::${userId}`;
			window.localStorage.setItem(PUSH_TOKEN_SYNCED_STORAGE_KEY, syncMarker);
			setFcmSyncedToken(syncMarker);
			toast.success("FCM token synced to Grindr.");
		} catch (error) {
			const appError = asAppError(error);
			toast.error(appError?.prettyMessage ?? (error instanceof Error ? error.message : "Sync failed"));
		} finally {
			setIsSyncingFcm(false);
		}
	}, [fcmToken, userId, callMethod, asAppError]);

	const handleLogout = async () => {
		setIsLoggingOut(true);
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			const message = getErrorMessage(error, "Failed to log out.");
			toast.error(message);
		} finally {
			setIsLoggingOut(false);
			setLogoutConfirmTarget(null);
		}
	};

	const handleSwitchAccount = async (profileId: string) => {
		setSwitchingProfileId(profileId);
		try {
			await switchAccount(profileId);
			navigate("/");
		} catch (error) {
			const message = getErrorMessage(error, "Failed to switch account.");
			toast.error(message);
		} finally {
			setSwitchingProfileId(null);
		}
	};

	const handleRemoveSavedAccount = async (profileId: string) => {
		setRemovingProfileId(profileId);
		try {
			await removeSavedAccount(profileId);
			removeSavedAccountProfile(profileId);
		} catch (error) {
			const message = getErrorMessage(error, "Failed to remove saved account.");
			toast.error(message);
		} finally {
			setRemovingProfileId(null);
			setLogoutConfirmTarget(null);
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
				toast.success(t("settings.switched_and_updated", { channel: getHotswapChannelLabel(channel) }));
				window.location.reload();
				return;
			}

			toast.success(t("settings.switched_channel", { channel: getHotswapChannelLabel(channel) }));
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

	if (previewAnnouncement && LATEST_ANNOUNCEMENT) {
		return (
			<div className="app-shell z-[300]">
				<VersionAnnouncement
					announcement={LATEST_ANNOUNCEMENT}
					buttonLabel="Close"
					onClose={() => setPreviewAnnouncement(false)}
				/>
			</div>
		);
	}

	if (previewOutdatedPrompt) {
		return (
			<div className="app-shell z-[110]">
				<OutdatedVersionPromptView
					appVersion={import.meta.env.VITE_APP_VERSION}
					releaseInfo={PREVIEW_RELEASE_INFO}
					onDismiss={() => setPreviewOutdatedPrompt(false)}
				/>
			</div>
		);
	}

	return (
		<section className="app-screen">
			<header className="mb-7">
				<button
					type="button"
					onClick={() => navigate("/", { replace: true })}
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
							Developer Mode
						</span>
					) : null}
				</div>
				<p className="app-subtitle mt-1">{t("settings.subtitle")}</p>
			</header>

			<div className="settings-search-bar mb-6 flex items-center gap-2.5 px-4 py-0.5">
				<Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
				<input
					type="search"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder={t("settings.search_placeholder")}
					className="h-11 flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
				/>
				{searchQuery ? (
					<button
						type="button"
						onClick={() => setSearchQuery("")}
						className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
						aria-label={t("common.clear", { defaultValue: "Clear" })}
					>
						<X className="h-4 w-4" />
					</button>
				) : null}
			</div>

			{searchQuery.trim() ? (
				<div className="grid gap-6">
					{searchResults.length === 0 ? (
						<p className="px-1 text-sm text-[var(--text-muted)]">
							{t("settings.search_no_results", { query: searchQuery.trim() })}
						</p>
					) : (
						<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
							{searchResults.map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => navigate(entry.anchor ? `${entry.route}#${entry.anchor}` : entry.route)}
									className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
								>
									<div className={`rounded-2xl p-2.5 shrink-0 ${entry.iconClass}`}>
										<entry.icon className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-semibold leading-snug">{entry.label}</p>
										<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5 truncate">
											{entry.section}{entry.description ? ` — ${entry.description}` : ""}
										</p>
									</div>
									<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
								</button>
							))}
						</div>
					)}
				</div>
			) : (
			<div className="grid gap-6">

				{/* Profile — the active profile is the primary focus (tap it to edit
				    your profile), with the account switcher folded in below it for
				    the other saved accounts you can tap between without
				    re-entering a password. Each saved account keeps its own chat
				    history and caches fully separate (see chatDb.ts/cache.ts), so
				    switching never shows a leftover account's data. */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Profile</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{(() => {
							const activeAccount = userId != null
								? savedAccounts.find((account) => String(userId) === account.profileId)
								: undefined;
							const activeProfile = userId != null ? getSavedAccountProfile(String(userId)) : null;
							return (
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => navigate("/settings/profile-editor")}
										className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
									>
										<Avatar
											src={activeProfile?.photoHash ? getThumbImageUrl(activeProfile.photoHash, "75x75") : null}
											alt=""
											className="h-10 w-10 shrink-0 rounded-2xl border-0"
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold leading-snug">
												{activeProfile?.displayName || activeAccount?.email || t("settings.profile_editor")}
											</p>
											<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
												{t("settings.profile_editor_desc")}
											</p>
										</div>
									</button>
									<button
										type="button"
										onClick={() => setLogoutConfirmTarget("active")}
										aria-label={t("settings.logout")}
										className="mr-2 shrink-0 rounded-xl p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
									>
										<LogOut className="h-4 w-4" />
									</button>
								</div>
							);
						})()}

						{savedAccounts
							.filter((account) => !(userId != null && String(userId) === account.profileId))
							.map((account) => {
								const isSwitching = switchingProfileId === account.profileId;
								const isRemoving = removingProfileId === account.profileId;
								const savedProfile = getSavedAccountProfile(account.profileId);
								return (
									<div key={account.profileId} className="flex items-center gap-1">
										<button
											type="button"
											onClick={() => void handleSwitchAccount(account.profileId)}
											disabled={isSwitching || isRemoving}
											className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:cursor-not-allowed"
										>
											<div className="relative h-10 w-10 shrink-0">
												<Avatar
													src={savedProfile.photoHash ? getThumbImageUrl(savedProfile.photoHash, "75x75") : null}
													alt=""
													className="h-full w-full rounded-2xl border-0"
												/>
												{isSwitching && (
													<div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface)]/80">
														<Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold leading-snug">
													{savedProfile.displayName || account.email || account.profileId}
												</p>
												<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
													{t("settings.account_tap_to_switch", { defaultValue: "Tap to switch" })}
												</p>
											</div>
										</button>
										<button
											type="button"
											onClick={() => setLogoutConfirmTarget(account.profileId)}
											disabled={isSwitching || isRemoving}
											aria-label={t("settings.logout")}
											className="mr-2 shrink-0 rounded-xl p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
										>
											{isRemoving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
										</button>
									</div>
								);
							})}
						<button
							type="button"
							onClick={() => navigate("/auth/sign-in?mode=add-profile")}
							className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
						>
							<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
								<UserPlus className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("settings.add_account", { defaultValue: "Add account" })}
								</p>
								<p className="text-xs text-[var(--text-muted)] leading-snug mt-0.5">
									{t("settings.add_account_desc", { defaultValue: "Sign in with another account" })}
								</p>
							</div>
							<ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
						</button>
					</div>
				</div>

				{/* Customizability */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Customizability</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/customizability"),
							<Palette className="h-5 w-5" />,
							"bg-violet-500/15 text-violet-400",
							t("settings.customizability"),
							t("settings.customizability_desc"),
						)}
						{navRow(
							() => navigate("/settings/behavior"),
							<SlidersHorizontal className="h-5 w-5" />,
							"bg-slate-500/15 text-slate-400",
							t("settings.behavior"),
							t("settings.behavior_desc"),
						)}
						{navRow(
							() => navigate("/settings/notifications"),
							<Bell className="h-5 w-5" />,
							"bg-blue-500/15 text-blue-400",
							t("settings.notifications"),
							t("settings.notifications_desc"),
						)}
					</div>
				</div>

				{/* Chat */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">Chat</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<div className="flex items-center gap-3 px-4 py-3.5">
							<div className="relative shrink-0">
								<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)]">
									<DatabaseBackup className="h-5 w-5" />
								</div>
								<div
									className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[var(--surface)] ${inboxSyncDisplay.badgeClass}`}
									style={inboxSyncDisplay.badgeStyle}
								>
									{inboxSyncDisplay.badgeIcon}
								</div>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center justify-between gap-2">
									<p className="text-sm font-semibold leading-snug">{inboxSyncDisplay.title}</p>
									{inboxSyncDisplay.progressPercent != null && (
										<p className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent)]">
											{inboxSyncDisplay.progressPercent}%
										</p>
									)}
								</div>
								<p className="mt-0.5 text-xs leading-snug tabular-nums text-[var(--text-muted)]">
									{inboxSyncDisplay.description}
								</p>
								{inboxSyncDisplay.active && (
									<div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
										<div
											className={
												inboxSyncDisplay.progressPercent == null
													? "h-full w-2/5 animate-progress-indeterminate rounded-full bg-[var(--accent)]"
													: "h-full rounded-full bg-[var(--accent)] transition-all duration-300"
											}
											style={
												inboxSyncDisplay.progressPercent != null
													? { width: `${inboxSyncDisplay.progressPercent}%` }
													: undefined
											}
										/>
									</div>
								)}
							</div>
						</div>
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
							() => navigate("/settings/albums"),
							<Images className="h-5 w-5" />,
							"bg-pink-500/15 text-pink-400",
							t("settings.my_albums"),
							t("settings.my_albums_desc"),
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
							() => navigate("/settings/block-history"),
							<History className="h-5 w-5" />,
							"bg-orange-500/15 text-orange-400",
							t("settings.block_history", { defaultValue: "Block Activity" }),
							t("settings.block_history_desc", {
								defaultValue: "See who has blocked or unblocked you, and when.",
							}),
						)}
						{navRow(
							() => navigate("/settings/privacy"),
							<Shield className="h-5 w-5" />,
							"bg-sky-500/15 text-sky-400",
							t("settings.privacy"),
							t("settings.privacy_desc"),
						)}
						{navRow(
							() => navigate("/settings/sexual-health"),
							<HeartPulse className="h-5 w-5" />,
							"bg-rose-500/15 text-rose-400",
							t("settings.sexual_health", { defaultValue: "Sexual Health" }),
							t("settings.sexual_health_desc", {
								defaultValue: "Track PrEP doses, encounters, tests and appointments.",
							}),
						)}
					</div>
				</div>

				{/* Backup & Restore */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings.data_section", { defaultValue: "Backup & Restore" })}
					</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						{navRow(
							() => navigate("/settings/data"),
							<DatabaseBackup className="h-5 w-5" />,
							"bg-teal-500/15 text-teal-400",
							t("settings.data", { defaultValue: "Backup & Restore" }),
							t("settings.data_desc", { defaultValue: "Downloaded media storage, and back up/restore your entire account" }),
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
								<RefreshCcw className={`h-5 w-5 ${isCheckingUpdates || isSwitchingChannel ? "animate-spin" : ""}`} />
							</div>
							<div className="min-w-0 flex-1">
								<div className="grid grid-cols-[1fr_auto] gap-x-3">
									<p className="text-sm font-semibold leading-snug">{t("settings.check_updates")}</p>
									<div className="row-span-2 flex items-start">
										<Button type="button" onClick={() => void handleCheckUpdates()} disabled={isCheckingUpdates || isSwitchingChannel}>
											{t("settings.check_now")}
										</Button>
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
												{getHotswapChannelLabel(channel)}
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
									<div className="relative shrink-0">
										<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)]">
											<GitBranch className="h-5 w-5" />
										</div>
										{isContributorChannel(updateChannel) && (
											<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-[var(--surface)]">
												<CheckCircle2 className="h-3 w-3" />
											</div>
										)}
									</div>
									<div className="grid gap-2 min-w-0 flex-1">
										<div>
											<p className="text-sm font-semibold leading-snug">Contributor Channel</p>
											<p className="text-xs text-[var(--text-muted)] mt-0.5">
											{isContributorChannel(updateChannel)
												? "Receiving experimental builds from a community contributor. Use at your own risk."
												: "Receive experimental builds from a community contributor."}
										</p>
										</div>
										{isContributorChannel(updateChannel) ? (
											<div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 px-3 py-2">
												<div className="min-w-0">
													<p className="text-xs text-[var(--text-muted)]">Active</p>
													<p className="text-sm font-semibold text-[var(--accent)] truncate">{getContributorHandle(updateChannel)}</p>
												</div>
												<button
													type="button"
													disabled={isSwitchingChannel}
													onClick={() => void handleLeaveContributorChannel()}
													className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
												>
													{isSwitchingChannel ? "Leaving…" : "Leave"}
												</button>
											</div>
										) : developerMode ? (
											<div className="flex gap-2">
												<input
													type="text"
													value={contributorCodeInput}
													onChange={(e) => setContributorCodeInput(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
													onKeyDown={(e) => { if (e.key === "Enter") void handleActivateContributorChannel(); }}
													placeholder="contributor-handle"
													maxLength={32}
													className="input-field flex min-w-0 flex-1 items-center font-mono text-xs"
												/>
												<Button type="button" disabled={isActivatingContributor || !contributorCodeInput} onClick={() => void handleActivateContributorChannel()}>
													{isActivatingContributor ? "Activating…" : "Activate"}
												</Button>
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
								<Terminal className="h-5 w-5" />,
								"bg-[var(--surface-2)] text-[var(--text-muted)]",
								t("settings.api_inspector"),
								t("settings.api_inspector_desc"),
							)}
							{isAndroid() && (
							<div className="p-4 sm:p-5">
								<div className="flex items-start gap-3">
									<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 shrink-0 text-[var(--text-muted)]">
										<Bell className="h-5 w-5" />
									</div>
									<div className="grid gap-3 min-w-0 flex-1">
										<div className="flex items-center gap-2 flex-wrap">
											<p className="text-sm font-semibold">Push Token (FCM)</p>
											{fcmToken && (() => {
												// Sync marker is `${token}::${userId}` (see AuthContext) since the
												// device token is shared across saved accounts but sync is per-account.
												const isSynced = fcmSyncedToken === `${fcmToken}::${userId}`;
												return (
													<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isSynced ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
														{isSynced ? "✓ Synced" : "⚠ Not synced"}
													</span>
												);
											})()}
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
							)}
							<div className="p-4 sm:p-5">
								<div className="flex items-start gap-3">
									<div className="relative shrink-0">
										<div className="rounded-2xl bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)]">
											<Radar className="h-5 w-5" />
										</div>
										{fingerprintCheck.loading ? (
											<div
												className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-[var(--surface)]"
												style={{ backgroundColor: "var(--accent)", color: "var(--accent-contrast)" }}
											>
												<Loader2 className="h-3 w-3 animate-spin" />
											</div>
										) : fingerprintCheck.ok ? (
											<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-[var(--surface)]">
												<CheckCircle2 className="h-3 w-3" />
											</div>
										) : fingerprintCheck.result || fingerprintCheck.error ? (
											<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white ring-2 ring-[var(--surface)]">
												<AlertCircle className="h-3 w-3" />
											</div>
										) : (
											<div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] ring-2 ring-[var(--surface)]">
												<HelpCircle className="h-3 w-3" />
											</div>
										)}
									</div>
									<div className="grid gap-3 min-w-0 flex-1">
										<div className="grid grid-cols-[1fr_auto] gap-x-3">
											<p className="text-sm font-semibold leading-snug">Fingerprint Check</p>
											<div className="row-span-2 flex items-start">
												<Button type="button" disabled={fingerprintCheck.loading} onClick={() => void fingerprintCheck.checkFingerprint()}>
													Check
												</Button>
											</div>
											<p className="mt-0.5 text-xs text-[var(--text-muted)]">Verify your HTTP/TLS fingerprint matches OkHttp configuration.</p>
										</div>
										{fingerprintCheck.result && (
											<div className="grid gap-2">
												<div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
													<div className="mb-1 flex items-center justify-between gap-2">
														<p className="text-xs text-[var(--text-muted)]">JA3 Hash</p>
														<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${fingerprintCheck.result.ja3_match ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
															{fingerprintCheck.result.ja3_match ? "✓ Match" : "✗ Mismatch"}
														</span>
													</div>
													<p className="break-all font-mono text-xs">{fingerprintCheck.result.ja3_hash}</p>
												</div>
												<div className="rounded-lg bg-[var(--surface-2)] px-3 py-2">
													<div className="mb-1 flex items-center justify-between gap-2">
														<p className="text-xs text-[var(--text-muted)]">Akamai Fingerprint</p>
														<span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${fingerprintCheck.result.akamai_match ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
															{fingerprintCheck.result.akamai_match ? "✓ Match" : "✗ Mismatch"}
														</span>
													</div>
													<p className="break-all font-mono text-xs">{fingerprintCheck.result.akamai_fingerprint}</p>
												</div>
												<p className="text-xs text-[var(--text-muted)]">HTTP Version <span className="font-mono text-[var(--text)]">{fingerprintCheck.result.http_version}</span></p>
											</div>
										)}
										{fingerprintCheck.error && (
											<div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-sm text-yellow-400">
												<p className="font-medium mb-0.5">Fingerprint check failed</p>
												<p className="text-xs opacity-80">{fingerprintCheck.error}</p>
											</div>
										)}
									</div>
								</div>
							</div>
							{navRow(
								() => setPreviewAnnouncement(true),
								<Megaphone className="h-5 w-5" />,
								"bg-[var(--surface-2)] text-[var(--text-muted)]",
								"Preview Version Announcement",
								LATEST_ANNOUNCEMENT
									? `View the "${LATEST_ANNOUNCEMENT.headline}" screen (v${LATEST_ANNOUNCEMENT.version}).`
									: "No version announcement configured yet.",
								undefined,
								!LATEST_ANNOUNCEMENT,
							)}
							{navRow(
								() => setPreviewOutdatedPrompt(true),
								<Download className="h-5 w-5" />,
								"bg-[var(--surface-2)] text-[var(--text-muted)]",
								"Preview Outdated Update Prompt",
								"View the \"Update Available\" screen shown when the app is out of date.",
							)}
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

			</div>
			)}

			<ConfirmDialog
				isOpen={logoutConfirmTarget != null}
				title={t("settings.logout_confirm_title", { defaultValue: "Log out?" })}
				message={
					logoutConfirmTarget === "active"
						? t("profile_editor.logout_description", { defaultValue: "You will be signed out of your account on this device." })
						: t("settings.logout_other_description", { defaultValue: "You'll need to sign in again to use this account on this device." })
				}
				confirmLabel={t("settings.logout")}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={
					logoutConfirmTarget === "active" ? isLoggingOut : removingProfileId === logoutConfirmTarget
				}
				onConfirm={() => {
					if (logoutConfirmTarget === "active") {
						void handleLogout();
					} else if (logoutConfirmTarget != null) {
						void handleRemoveSavedAccount(logoutConfirmTarget);
					}
				}}
				onCancel={() => setLogoutConfirmTarget(null)}
			/>
		</section>
	);
}
