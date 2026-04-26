import { useNavigate } from "react-router-dom";
import {
	BadgeInfo,
	ChevronRight,
	Download,
	FolderOpen,
	Images,
	Info,
	LogOut,
	Radar,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { exportAllLogs } from "../../services/chatLog";
import { Button } from "../../components/ui/button";

export function SettingsPage() {
	const { logout } = useAuth();
	const navigate = useNavigate();
	const [isExporting, setIsExporting] = useState(false);

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
			a.download = `open-grind-export-${new Date().toISOString().slice(0, 10)}.json`;
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

	return (
		<section className="app-screen">
			<header className="mb-6">
				<h1 className="app-title mb-2">Settings</h1>
				<p className="app-subtitle">Choose what you want to manage.</p>
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
							<p className="text-base font-semibold">Profile Editor</p>
							<p className="text-sm text-[var(--text-muted)]">
								Edit profile details, identity, and preferences.
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
							<p className="text-base font-semibold">About Open Grind</p>
							<p className="text-sm text-[var(--text-muted)]">
								Project goals, credits, licence, and documentation links.
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
							<p className="text-base font-semibold">API Inspector</p>
							<p className="text-sm text-[var(--text-muted)]">
								View request and response history for debugging.
							</p>
						</div>
					</div>
					<ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
				</button>

				<button
					type="button"
					onClick={() => navigate("/settings/shared-albums")}
					className="surface-card flex w-full items-center justify-between p-4 text-left transition-transform hover:-translate-y-0.5 sm:p-5"
				>
					<div className="flex items-center gap-3">
						<div className="rounded-xl bg-[var(--surface-2)] p-2.5">
							<FolderOpen className="h-5 w-5" />
						</div>
						<div>
							<p className="text-base font-semibold">Shared Albums</p>
							<p className="text-sm text-[var(--text-muted)]">
								See every album that has been shared with you.
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
							<p className="text-base font-semibold">My Albums</p>
							<p className="text-sm text-[var(--text-muted)]">
								Create, rename, and delete private albums.
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
							<p className="text-base font-semibold">Export Chat Data</p>
							<p className="text-sm text-[var(--text-muted)]">
								Download all locally stored messages as a JSON file.
							</p>
						</div>
					</div>
					{isExporting ? (
						<span className="text-xs text-[var(--text-muted)]">Exporting…</span>
					) : (
						<Download className="h-5 w-5 text-[var(--text-muted)]" />
					)}
				</button>

				<div className="mt-2 flex flex-wrap items-center gap-3">
					<Button type="button" onClick={() => navigate("/")}>
						Back to Browse
					</Button>
					<Button type="button" variant="primary" onClick={handleLogout}>
						<LogOut className="h-4 w-4" />
						Logout
					</Button>
				</div>
			</div>
		</section>
	);
}
