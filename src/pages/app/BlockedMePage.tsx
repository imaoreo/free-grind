import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, FlaskConical, MessageSquareText, RefreshCw, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { EmptyState } from "../../components/ui/states";
import { blockedMeStore, type BlockedMeRecord } from "../../services/blockedMeStore";
import { runBlockedMeDetection, confirmBlockedByThem, notifyBlockedMe, type DetectionSummary } from "../../services/blockDetection";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useAuth } from "../../contexts/useAuth";
import { usePreferences } from "../../contexts/PreferencesContext";
import { getChatContactIndexForProfiles } from "../../services/chatContactIndex";

export function BlockedMePage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const service = useApiFunctions();
	const { userId } = useAuth();
	const { developerMode } = usePreferences();
	const [records, setRecords] = useState<BlockedMeRecord[]>([]);
	const [watchingCount, setWatchingCount] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [isChecking, setIsChecking] = useState(false);
	const [lastSummary, setLastSummary] = useState<DetectionSummary | null>(null);
	const [probeProfileId, setProbeProfileId] = useState("");
	const [probeDisplayName, setProbeDisplayName] = useState("");
	const [probeResult, setProbeResult] = useState<string | null>(null);
	const [isProbing, setIsProbing] = useState(false);
	const [isMarking, setIsMarking] = useState(false);

	const load = useCallback(async () => {
		const all = await blockedMeStore.getAll();
		setRecords(all.filter((r) => r.status === "confirmed").sort((a, b) => (b.blockedAt ?? 0) - (a.blockedAt ?? 0)));
		setWatchingCount(all.filter((r) => r.status === "watching").length);
		setIsLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const handleDismiss = async (profileId: string) => {
		await blockedMeStore.removeRecord(profileId);
		void load();
	};

	const handleCheckNow = async () => {
		setIsChecking(true);
		setLastSummary(null);
		try {
			const response = await service.listConversations({ page: 1 });
			const summary = await runBlockedMeDetection(service, response.entries, userId, true);
			setLastSummary(summary);
			await load();
			const confirmedCount = summary.candidates.filter((c) => c.result === "confirmed").length;
			if (confirmedCount > 0) {
				toast.success(t("chat.blocked_me.check_found", { count: confirmedCount, defaultValue: "Found {{count}} new block(s)" }));
			} else if (summary.candidates.length > 0) {
				toast(t("chat.blocked_me.check_inconclusive", { defaultValue: "Checked, but couldn't confirm yet, see details below" }));
			} else {
				toast(t("chat.blocked_me.check_none", { defaultValue: "No disappeared conversations to check, phew" }));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("chat.errors.load_inbox"));
		} finally {
			setIsChecking(false);
		}
	};

	const handleProbe = async () => {
		const profileId = probeProfileId.trim();
		if (!profileId) return;
		setIsProbing(true);
		setProbeResult(null);
		try {
			const blockedByMeIds = new Set(await service.getBlockedProfileIds());
			const { result, detail } = await confirmBlockedByThem(service, profileId, blockedByMeIds);

			let rawDump = "";
			try {
				const raw = await service.getRawProfile(profileId);
				rawDump = `\n\nRaw /v7/profiles/${profileId}:\n${JSON.stringify(raw, null, 2)}`;
			} catch (rawError) {
				rawDump = `\n\nRaw fetch threw: ${rawError instanceof Error ? rawError.message : String(rawError)}`;
			}

			setProbeResult(`${result} — ${detail}${rawDump}`);
		} catch (error) {
			setProbeResult(`error — ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			setIsProbing(false);
		}
	};

	const handleMarkConfirmed = async () => {
		const profileId = probeProfileId.trim();
		if (!profileId) return;
		setIsMarking(true);
		try {
			const indexRecords = await getChatContactIndexForProfiles([profileId]);
			const conversationId = indexRecords[0]?.conversationId ?? `unknown-${profileId}`;
			const displayName = probeDisplayName.trim() || profileId;
			const now = Date.now();

			await blockedMeStore.upsertWatching([
				{ profileId, conversationId, displayName, avatarHash: null, lastSeenAt: now },
			]);
			await blockedMeStore.markConfirmed(profileId, now);
			void notifyBlockedMe(displayName);
			await load();
			toast.success(
				indexRecords[0]?.conversationId
					? "Marked as confirmed, recovered the local conversation"
					: "Marked as confirmed (no local conversation found for this profile)",
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Failed to mark as confirmed");
		} finally {
			setIsMarking(false);
		}
	};

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={() => load()}
			isDisabled={isLoading}
			refreshingLabel={t("chat.blocked_me.refreshing", { defaultValue: "Refreshing…" })}
		>
			<header className="mb-7">
				<div className="mb-4 flex items-center justify-between">
					<button
						type="button"
						onClick={() => navigate("/chat")}
						className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
					>
						<ChevronLeft className="h-4 w-4" />
						{t("nav.inbox")}
					</button>
					<button
						type="button"
						onClick={() => void handleCheckNow()}
						disabled={isChecking}
						className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--text)] disabled:opacity-50"
					>
						<RefreshCw className={isChecking ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
						{t("chat.blocked_me.check_now", { defaultValue: "Check now" })}
					</button>
				</div>
				<h1 className="app-title mb-1">{t("chat.blocked_me.title", { defaultValue: "Blocked you" })}</h1>
				<p className="app-subtitle">
					{t("chat.blocked_me.subtitle", {
						defaultValue: "People whose conversation with you dissapeared, usually because they blocked you.",
					})}
				</p>
				{watchingCount > 0 && (
					<p className="mt-1 text-xs text-[var(--text-muted)]">
						{t("chat.blocked_me.watching_count", { count: watchingCount, defaultValue: "Tracking {{count}} active conversation(s) for changes" })}
					</p>
				)}
			</header>

			{developerMode && (
				<div className="surface-card mb-6 space-y-3 overflow-hidden p-4">
					<p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						<FlaskConical className="h-3.5 w-3.5" />
						Developer tools, yay:3
					</p>

					<div>
						<p className="mb-1.5 text-xs text-[var(--text-muted)]">
							Probe any profile ID through the same check used during a real sweep!!
						</p>
						<div className="flex gap-2">
							<input
								value={probeProfileId}
								onChange={(e) => setProbeProfileId(e.target.value)}
								placeholder="Profile ID"
								className="h-9 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-[var(--accent)]"
							/>
							<button
								type="button"
								onClick={() => void handleProbe()}
								disabled={isProbing || !probeProfileId.trim()}
								className="shrink-0 rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--text)] disabled:opacity-50"
							>
								{isProbing ? "Probing…" : "Probe"}
							</button>
						</div>
						{probeResult && (
							<pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[var(--text-muted)]">{probeResult}</pre>
						)}

						<p className="mb-1.5 mt-3 text-xs text-[var(--text-muted)]">
							Known to be blocked (confirmed via probe above, but the watch record was already lost)? Recover it manually, this looks up the local conversation by profile ID and adds it straight to the confirmed list.
						</p>
						<div className="flex gap-2">
							<input
								value={probeDisplayName}
								onChange={(e) => setProbeDisplayName(e.target.value)}
								placeholder="Display name"
								className="h-9 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-[var(--accent)]"
							/>
							<button
								type="button"
								onClick={() => void handleMarkConfirmed()}
								disabled={isMarking || !probeProfileId.trim()}
								className="shrink-0 rounded-xl border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
							>
								{isMarking ? "Marking…" : "Mark as confirmed"}
							</button>
						</div>
					</div>
				</div>
			)}

			{lastSummary && !developerMode && (
				<div className="surface-card mb-6 overflow-hidden p-3 text-sm text-[var(--text-muted)]">
					{lastSummary.candidates.length === 0 ? (
						<p>Checked {lastSummary.totalWatching} active conversation(s) — nothing new.</p>
					) : (
						<p>
							Checked {lastSummary.candidates.length} disappeared conversation(s) —{" "}
							{lastSummary.candidates.filter((c) => c.result === "confirmed").length} confirmed block(s).
						</p>
					)}
				</div>
			)}

			{lastSummary && developerMode && (
				<div className="surface-card mb-6 overflow-hidden p-3 font-mono text-[11px] leading-relaxed">
					<p className="mb-1 font-semibold text-[var(--text-muted)]">
						Last check: {lastSummary.totalWatching} tracked, {lastSummary.candidates.length} disappeared
					</p>
					{lastSummary.candidates.length === 0 ? (
						<p className="text-[var(--text-muted)]">
							No conversations have disappeared since they were last seen, nothing to check yet!
						</p>
					) : (
						lastSummary.candidates.map((c) => (
							<p
								key={c.profileId}
								className={
									c.result === "confirmed"
										? "text-red-400"
										: c.result === "still-visible"
											? "text-[var(--text-muted)]"
											: "text-amber-400"
								}
							>
								{c.displayName} ({c.profileId}): {c.result} — {c.detail}
							</p>
						))
					)}
				</div>
			)}

			{isLoading ? (
				<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
					{Array.from({ length: 3 }).map((_, i) => (
						<div key={i} className="flex items-center gap-3 px-4 py-3">
							<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
							<div className="min-w-0 flex-1 space-y-1.5">
								<div className="h-3.5 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
								<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
							</div>
						</div>
					))}
				</div>
			) : records.length === 0 ? (
				<EmptyState
					title={t("chat.blocked_me.empty", { defaultValue: "Nobody's blocked you (that we know of!)" })}
					description={t("chat.blocked_me.empty_desc", {
						defaultValue: "We'll notify you and list them here if a conversation disappears because someone blocked you.",
					})}
				/>
			) : (
				<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
					{records.map((record) => {
						const avatarUrl =
							record.avatarHash && validateMediaHash(record.avatarHash)
								? getThumbImageUrl(record.avatarHash, "75x75")
								: null;
						return (
							<div key={record.profileId} className="flex items-center gap-3 px-4 py-3">
								<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
									<ProfileImage
										src={avatarUrl}
										alt={t("profile_details.photo_alt", { name: record.displayName })}
									/>
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-semibold">
										{record.displayName} <span className="font-normal text-[var(--text-muted)]">({record.profileId})</span>
									</p>
									<p className="text-xs text-[var(--text-muted)]">
										{record.blockedAt
											? new Date(record.blockedAt).toLocaleDateString()
											: t("chat.blocked_me.unknown_date", { defaultValue: "Unknown date" })}
									</p>
								</div>
								<button
									type="button"
									onClick={() => navigate(`/chat/blocked-me/${encodeURIComponent(record.profileId)}`)}
									className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:text-[var(--text)]"
								>
									<MessageSquareText className="h-3.5 w-3.5" />
									{t("chat.blocked_me.view_conversation", { defaultValue: "View" })}
								</button>
								<button
									type="button"
									onClick={() => void handleDismiss(record.profileId)}
									aria-label={t("chat.blocked_me.dismiss", { defaultValue: "Dismiss" })}
									className="inline-flex shrink-0 items-center justify-center rounded-xl p-2 text-[var(--text-muted)] transition hover:text-red-400"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</PullToRefreshContainer>
	);
}
