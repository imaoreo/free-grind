import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import * as chatDb from "../../services/chatDb";
import { unhideProfile as unhideProfileLocally } from "../../services/profileHide";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "../../components/ui/states";

type HiddenProfileListItem = {
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
};

export function SettingsHiddenPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const location = useLocation();
	const apiFunctions = useApiFunctions();

	const [hiddenProfiles, setHiddenProfiles] = useState<HiddenProfileListItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [mutatingProfileId, setMutatingProfileId] = useState<string | null>(null);
	const [isUnhidingAll, setIsUnhidingAll] = useState(false);
	const [confirmUnhideAll, setConfirmUnhideAll] = useState(false);

	const loadHiddenProfiles = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			const stored = await chatDb.listHiddenProfiles();

			if (stored.length === 0) {
				setHiddenProfiles([]);
				return;
			}

			// Batch-fetch fresh details via the cascade endpoint in chunks of 50,
			// same as the Blocked page — falls back to the locally snapshotted
			// name/avatar (see chatDb.hideProfile) if a chunk fails or a profile
			// has since become unresolvable (deleted/banned).
			const CHUNK_SIZE = 50;
			const ids = stored.map((p) => p.profileId);
			const chunks: string[][] = [];
			for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
				chunks.push(ids.slice(i, i + CHUNK_SIZE));
			}

			const detailsById = new Map<string, { displayName: string; avatarUrl: string | null }>();
			await Promise.all(
				chunks.map(async (chunk) => {
					try {
						const raw = await apiFunctions.getProfilesByIds(chunk);
						const profiles =
							raw && typeof raw === "object" && Array.isArray((raw as { profiles?: unknown }).profiles)
								? (raw as { profiles: unknown[] }).profiles
								: [];
						for (const p of profiles) {
							if (!p || typeof p !== "object") continue;
							const idRaw = (p as { profileId?: unknown }).profileId;
							if (idRaw == null) continue;
							const profileId = String(idRaw);
							const nameRaw = (p as { displayName?: unknown }).displayName;
							const displayName =
								typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim() : null;
							const hashRaw = (p as { profileImageMediaHash?: unknown }).profileImageMediaHash;
							const avatarUrl =
								typeof hashRaw === "string" && validateMediaHash(hashRaw)
									? getThumbImageUrl(hashRaw, "75x75")
									: null;
							if (displayName || avatarUrl) {
								detailsById.set(profileId, {
									displayName: displayName ?? t("settings_hidden.name_fallback", { defaultValue: "Someone" }),
									avatarUrl,
								});
							}
						}
					} catch {
						// Chunk failed — its ids fall back to the local snapshot below.
					}
				}),
			);

			setHiddenProfiles(
				stored.map((profile) => {
					const meta = detailsById.get(profile.profileId);
					const avatarUrl =
						meta?.avatarUrl ??
						(profile.avatarMediaHash && validateMediaHash(profile.avatarMediaHash)
							? getThumbImageUrl(profile.avatarMediaHash, "75x75")
							: null);
					return {
						profileId: profile.profileId,
						displayName:
							meta?.displayName ??
							profile.displayName ??
							t("settings_hidden.name_fallback", { defaultValue: "Someone" }),
						avatarUrl,
					} satisfies HiddenProfileListItem;
				}),
			);
		} catch (loadError) {
			setHiddenProfiles([]);
			setError(loadError instanceof Error ? loadError.message : t("settings_hidden.error_load"));
		} finally {
			setIsLoading(false);
		}
	}, [apiFunctions, t]);

	useEffect(() => {
		void loadHiddenProfiles();
	}, [loadHiddenProfiles]);

	const handleUnhide = async (profileId: string) => {
		if (mutatingProfileId) return;

		setMutatingProfileId(profileId);
		try {
			await unhideProfileLocally(profileId);
			setHiddenProfiles((previous) => previous.filter((p) => p.profileId !== profileId));
			toast.success(t("profile_details.unhide_success"));
		} finally {
			setMutatingProfileId(null);
		}
	};

	const handleUnhidePress = (profileId: string) => {
		if (mutatingProfileId) return;
		void handleUnhide(profileId);
	};

	const handleUnhideAll = async () => {
		setIsUnhidingAll(true);
		try {
			await Promise.all(hiddenProfiles.map((p) => unhideProfileLocally(p.profileId)));
			setHiddenProfiles([]);
			toast.success(t("settings_hidden.unhide_all_success", { defaultValue: "All profiles unhidden." }));
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : t("settings_hidden.unhide_all_failed", { defaultValue: "Failed to unhide all profiles." }),
			);
		} finally {
			setIsUnhidingAll(false);
			setConfirmUnhideAll(false);
		}
	};

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={() => loadHiddenProfiles()}
			isDisabled={isLoading}
			refreshingLabel={t("settings_hidden.refreshing")}
		>
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings_hidden.title")}</h1>
				<p className="app-subtitle">{t("settings_hidden.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				{isLoading ? (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{Array.from({ length: 4 }).map((_, i) => (
								<div key={i} className="flex items-center gap-3 px-4 py-3">
									<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
									<div className="min-w-0 flex-1 space-y-1.5">
										<div className="h-3.5 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
										<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
									</div>
									<div className="h-7 w-20 animate-pulse rounded-xl bg-[var(--surface-2)]" />
								</div>
							))}
						</div>
					</div>
				) : error ? (
					<ErrorState
						title={t("settings_hidden.error_load")}
						description={error}
						onRetry={() => void loadHiddenProfiles()}
					/>
				) : hiddenProfiles.length === 0 ? (
					<EmptyState
						title={t("settings_hidden.empty")}
						description={t("settings_hidden.empty_desc", { defaultValue: "Profiles you hide from the grid will show up here." })}
					/>
				) : (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_hidden.section_label", { defaultValue: "Hidden" })}
							</p>
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{hiddenProfiles.length}
							</span>
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{hiddenProfiles.map((profile) => {
								const isMutating = mutatingProfileId === profile.profileId;
								return (
									<div key={profile.profileId} className="flex items-center gap-3 px-4 py-3">
										<button
											type="button"
											className="flex min-w-0 flex-1 items-center gap-3 text-left"
											onClick={() => navigate(`/profile/${profile.profileId}`, { state: { returnTo: location.pathname } })}
										>
											<div className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
												<ProfileImage
													src={profile.avatarUrl}
													alt={t("profile_details.photo_alt", { name: profile.displayName })}
												/>
											</div>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm font-semibold">
													{profile.displayName}
												</p>
												<p className="text-xs text-[var(--text-muted)]">
													{t("settings_hidden.profile_id", { id: profile.profileId })}
												</p>
											</div>
										</button>
										<button
											type="button"
											onClick={() => handleUnhidePress(profile.profileId)}
											onPointerUp={(event) => {
												if (event.pointerType === "mouse") return;
												event.preventDefault();
												handleUnhidePress(profile.profileId);
											}}
											disabled={isMutating}
											className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/5 hover:text-[var(--accent)] disabled:opacity-50"
										>
											<Eye className="h-3.5 w-3.5" />
											{t("settings_hidden.unhide", { defaultValue: "Unhide" })}
										</button>
									</div>
								);
							})}
						</div>
					</div>
				)}
				{!isLoading && !error && hiddenProfiles.length > 0 && (
					<div className="surface-card overflow-hidden">
						<div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-[var(--surface-2)] p-2.5 text-[var(--text-muted)]">
								<EyeOff className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="grid grid-cols-[1fr_auto] gap-x-3">
									<p className="text-sm font-semibold leading-snug">
										{t("settings_hidden.unhide_all_title", { defaultValue: "Unhide All" })}
									</p>
									<div className="row-span-2 flex items-start">
										{isUnhidingAll ? (
											<span className="text-xs text-[var(--text-muted)]">
												{t("settings_hidden.unhiding_all", { defaultValue: "Unhiding…" })}
											</span>
										) : (
											<button
												type="button"
												onClick={() => setConfirmUnhideAll(true)}
												className="shrink-0 inline-flex items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm font-semibold transition hover:bg-[var(--surface)]"
											>
												{t("settings_hidden.unhide_all_title", { defaultValue: "Unhide All" })}
											</button>
										)}
									</div>
									<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
										{t("settings_hidden.unhide_all_desc", { defaultValue: "Show all hidden profiles on the grid again." })}
									</p>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			<ConfirmDialog
				isOpen={confirmUnhideAll}
				title={t("settings_hidden.unhide_all_title", { defaultValue: "Unhide All" })}
				message={t("settings_hidden.unhide_all_confirm", { defaultValue: "This will unhide all hidden profiles. Are you sure?" })}
				confirmLabel={isUnhidingAll ? t("settings_hidden.unhiding_all", { defaultValue: "Unhiding…" }) : t("settings_hidden.unhide_all_title", { defaultValue: "Unhide All" })}
				cancelLabel={t("settings_hidden.cancel", { defaultValue: "Cancel" })}
				onConfirm={() => void handleUnhideAll()}
				onCancel={() => setConfirmUnhideAll(false)}
				isProcessing={isUnhidingAll}
			/>
		</PullToRefreshContainer>
	);
}
