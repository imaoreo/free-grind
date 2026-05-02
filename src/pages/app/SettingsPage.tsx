import { useNavigate } from "react-router-dom";
import {
	BadgeInfo,
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
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
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
	const [isExporting, setIsExporting] = useState(false);
	const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
	const [isSwitchingChannel, setIsSwitchingChannel] = useState(false);
	const [updateChannel, setUpdateChannel] =
		useState<HotswapChannel>(getCurrentHotswapChannel());

	const handleLogout = async () => {
		try {
			await logout();
			navigate("/auth/sign-in");
		} catch (error) {
			console.error("Logout failed:", error);
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
		} catch (error) {
			console.error("Export failed:", error);
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
			console.error("Update check failed:", error, "| message:", msg);
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
				toast.success(t("settings.switched_and_updated", { channel }));
				window.location.reload();
				return;
			}

			toast.success(t("settings.switched_channel", { channel }));
			window.location.reload();
		} catch (error) {
			console.error("Switch update environment failed:", error);
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
								{getHotswapChannels().map((channel) => (
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
