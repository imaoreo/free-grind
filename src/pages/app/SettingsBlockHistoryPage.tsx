import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { ProfileImage } from "../../components/ui/profile-image";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { listBlockEvents } from "../../services/chatDb";
import type { StoredBlockEvent } from "../../types/chat-db";
import { resolveAvatarSrc } from "../../services/avatarStore";
import { getParticipantAvatarUrl } from "./chat/chatUtils";

function formatEventTimestamp(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

export function SettingsBlockHistoryPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();

	const [events, setEvents] = useState<StoredBlockEvent[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);

	const load = useCallback(async () => {
		setError(null);
		try {
			const stored = await listBlockEvents();
			setEvents(stored);
		} catch (loadError) {
			setEvents([]);
			setError(
				loadError instanceof Error ? loadError.message : t("settings_block_history.error_load"),
			);
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void load();
	}, [load]);

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={load}
			isDisabled={isLoading}
			refreshingLabel={t("settings_block_history.refreshing")}
		>
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings_block_history.title")}</h1>
				<p className="app-subtitle">{t("settings_block_history.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				{isLoading ? (
					<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
						{Array.from({ length: 4 }).map((_, i) => (
							<div key={i} className="flex items-center gap-3 px-4 py-3">
								<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
								<div className="min-w-0 flex-1 space-y-1.5">
									<div className="h-3.5 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
									<div className="h-3 w-24 animate-pulse rounded-full bg-[var(--surface-2)]" />
								</div>
							</div>
						))}
					</div>
				) : error ? (
					<ErrorState
						title={t("settings_block_history.error_load")}
						description={error}
						onRetry={() => void load()}
					/>
				) : !events || events.length === 0 ? (
					<EmptyState
						title={t("settings_block_history.empty")}
						description={t("settings_block_history.empty_desc")}
					/>
				) : (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_block_history.section_label")}
							</p>
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{events.length}
							</span>
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{events.map((event) => {
								const displayName =
									event.displayName || t("settings_block_history.name_fallback");
								const avatarSrc = resolveAvatarSrc(
									event.avatarMediaHash,
									getParticipantAvatarUrl(event.avatarMediaHash),
								);
								const isBlocked = event.eventType === "blocked";
								const rowClassName = "flex w-full items-center gap-3 px-4 py-3 text-left";
								const content = (
									<>
										<div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
											<ProfileImage
												src={avatarSrc}
												alt={t("profile_details.photo_alt", { name: displayName })}
											/>
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold">{displayName}</p>
											<p className="text-xs text-[var(--text-muted)]">
												{formatEventTimestamp(event.timestamp)}
											</p>
										</div>
										<span
											className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold ${
												isBlocked
													? "bg-red-500/10 text-red-400"
													: "bg-emerald-500/10 text-emerald-400"
											}`}
										>
											{isBlocked ? (
												<ShieldOff className="h-3.5 w-3.5" />
											) : (
												<ShieldCheck className="h-3.5 w-3.5" />
											)}
											{isBlocked
												? t("settings_block_history.blocked")
												: t("settings_block_history.unblocked")}
										</span>
									</>
								);
								return event.profileId ? (
									<button
										key={event.id}
										type="button"
										onClick={() =>
											navigate(`/profile/${event.profileId}`, {
												state: { returnTo: location.pathname },
											})
										}
										className={rowClassName}
									>
										{content}
									</button>
								) : (
									<div key={event.id} className={rowClassName}>
										{content}
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</PullToRefreshContainer>
	);
}
