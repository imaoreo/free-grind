import { useState, useEffect } from "react";
import { Trash2, Ban, ShieldAlert, FileCode, Clock, RefreshCw } from "lucide-react";
import { BackToSettings } from "../../components/BackToSettings";
import copy from "copy-to-clipboard";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../contexts/PreferencesContext";
import {
	getBlockEvents,
	clearBlockEvents,
	getRawBlockLogs,
	clearRawBlockLogs,
	type BlockEvent,
	type RawBlockLog,
} from "../../services/blockDetectorStore";
import { getThumbImageUrl } from "../../utils/media";
import toast from "react-hot-toast";

export function SettingsBlockDetectorPage() {
	const { t } = useTranslation();
	const { developerMode } = usePreferences();
	const [activeTab, setActiveTab] = useState<"alerts" | "diagnostics">("alerts");
	const [blockEvents, setBlockEvents] = useState<BlockEvent[]>([]);
	const [rawLogs, setRawLogs] = useState<RawBlockLog[]>([]);

	const loadData = () => {
		setBlockEvents(getBlockEvents());
		setRawLogs(getRawBlockLogs());
	};

	useEffect(() => {
		loadData();
		// Refresh log data periodically
		const interval = setInterval(loadData, 5000);
		return () => clearInterval(interval);
	}, []);

	const handleCopyId = (profileId: string) => {
		copy(profileId);
		toast.success(`Copied Profile ID: ${profileId}`);
	};

	const handleClearAlerts = () => {
		clearBlockEvents();
		setBlockEvents([]);
		toast.success("Block history cleared.");
	};

	const handleClearDiagnostics = () => {
		clearRawBlockLogs();
		setRawLogs([]);
		toast.success("Diagnostics log cleared.");
	};

	const formatTime = (ts: number) => {
		return new Date(ts).toLocaleString(undefined, {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			month: "short",
			day: "numeric",
		});
	};

	return (
		<section className="app-screen">
			<header className="mb-6">
				<BackToSettings />
				<h1 className="app-title mb-2">
					{t("settings.block_detector", { defaultValue: "Block Detector" })}
				</h1>
				<p className="app-subtitle mb-4">
					{t("settings.block_detector_desc", {
						defaultValue: "Monitor in real-time when profiles block you, unblock you, or clear their chat history.",
					})}
				</p>
				<div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4 text-sm text-yellow-400/95 leading-relaxed">
					<span className="font-bold uppercase tracking-wider text-xs text-yellow-400 block mb-1.5">Network Limitation</span>
					Block, unblock, and conversation delete events share identical WebSocket packets and cannot be differentiated from one another on a network level.
				</div>
			</header>

			<div className="flex border-b border-[var(--border)] mb-6">
				<button
					type="button"
					onClick={() => setActiveTab("alerts")}
					className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-[2px] ${
						activeTab === "alerts" || !developerMode
							? "border-[var(--accent)] text-[var(--accent-readable)]"
							: "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
					}`}
				>
					<Ban className="h-4 w-4" />
					Block Alerts ({blockEvents.length})
				</button>
				{developerMode && (
					<button
						type="button"
						onClick={() => setActiveTab("diagnostics")}
						className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-[2px] ${
							activeTab === "diagnostics"
								? "border-[var(--accent)] text-[var(--accent-readable)]"
								: "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
						}`}
					>
						<FileCode className="h-4 w-4" />
						Diagnostics Log ({rawLogs.length})
					</button>
				)}
			</div>

			<div className="grid gap-4">
				{activeTab === "alerts" || !developerMode ? (
					<div className="surface-card p-4 sm:p-5">
						<div className="flex items-center justify-between mb-4">
							<p className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								Detected Events
							</p>
							{blockEvents.length > 0 && (
								<button
									type="button"
									onClick={handleClearAlerts}
									className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1.5"
								>
									<Trash2 className="h-3.5 w-3.5" />
									Clear List
								</button>
							)}
						</div>

						{blockEvents.length === 0 ? (
							<div className="text-center py-10 flex flex-col items-center justify-center gap-3">
								<ShieldAlert className="h-10 w-10 text-[var(--text-muted)] opacity-50" />
								<p className="text-sm text-[var(--text-muted)]">No blocks detected yet.</p>
								<p className="text-xs text-[var(--text-muted)] max-w-xs">
									Keep this app open. If someone blocks you or clears the conversation, a notification will appear here.
								</p>
							</div>
						) : (
							<div className="divide-y divide-[var(--border)]">
								{blockEvents.map((event, idx) => {
									const imgUrl = event.imageHash
										? getThumbImageUrl(event.imageHash, "75x75")
										: null;
									return (
										<div
											key={event.profileId + "-" + event.timestamp + "-" + idx}
											onClick={() => handleCopyId(event.profileId)}
											className="flex items-center gap-3.5 py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-[var(--border)]/20 px-3 -mx-3 rounded-xl transition-colors"
											title="Click to copy Profile ID"
										>
											<div className="h-12 w-12 shrink-0 rounded-full border border-[var(--border)] overflow-hidden bg-[var(--surface-2)] flex items-center justify-center">
												{imgUrl ? (
													<img
														src={imgUrl}
														alt={event.displayName || "Blocker"}
														className="h-full w-full object-cover"
													/>
												) : (
													<Ban className="h-5 w-5 text-red-400" />
												)}
											</div>
											<div className="flex-1 min-w-0">
												<p className="text-base font-semibold truncate text-[var(--text)]">
													{event.displayName || "Anonymous User"}
												</p>
												<p className="text-xs font-mono text-[var(--text-muted)] mt-0.5">
													ID: {event.profileId}
												</p>
											</div>
											<div className="text-right">
												<span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] font-medium bg-[var(--surface-2)] px-2.5 py-1 rounded-full border border-[var(--border)]">
													<Clock className="h-3 w-3" />
													{formatTime(event.timestamp)}
												</span>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				) : (
					<div className="surface-card p-4 sm:p-5">
						<div className="flex items-center justify-between mb-4">
							<p className="text-sm font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								Raw Packet Capture
							</p>
							<div className="flex items-center gap-3">
								<button
									type="button"
									onClick={loadData}
									className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text)] flex items-center gap-1.5"
								>
									<RefreshCw className="h-3.5 w-3.5" />
									Refresh
								</button>
								{rawLogs.length > 0 && (
									<button
										type="button"
										onClick={handleClearDiagnostics}
										className="text-xs font-semibold text-red-400 hover:text-red-300 flex items-center gap-1.5"
									>
										<Trash2 className="h-3.5 w-3.5" />
										Clear Logs
									</button>
								)}
							</div>
						</div>

						{rawLogs.length === 0 ? (
							<div className="text-center py-10 flex flex-col items-center justify-center gap-3">
								<FileCode className="h-10 w-10 text-[var(--text-muted)] opacity-50" />
								<p className="text-sm text-[var(--text-muted)]">No raw packet capture logs yet.</p>
								<p className="text-xs text-[var(--text-muted)] max-w-xs">
									Any WebSocket events that match block/delete criteria will be logged here in raw format to help reverse engineer payloads.
								</p>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								{rawLogs.map((log, idx) => (
									<div
										key={log.timestamp + "-" + idx}
										className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs"
									>
										<div className="flex items-center justify-between mb-2 pb-2 border-b border-[var(--border)]">
											<span className="font-semibold font-mono text-[var(--accent-readable)]">
												{log.type}
											</span>
											<span className="text-[10px] text-[var(--text-muted)]">
												{formatTime(log.timestamp)}
											</span>
										</div>
										<pre className="overflow-x-auto p-2 bg-[var(--surface)] border border-[var(--border)] rounded-lg font-mono text-[var(--text)] max-h-48 overflow-y-auto whitespace-pre">
											{JSON.stringify(log.payload, null, 2)}
										</pre>
									</div>
								))}
							</div>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
