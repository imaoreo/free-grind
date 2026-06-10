import { useCallback, useEffect, useState } from "react";
import { ShieldOff, UserX } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useBlockedProfileIds, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { EmptyState, ErrorState } from "../../components/ui/states";

type BlockedProfileListItem = {
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
};

export function SettingsBlockedPage() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const { data: blockedIdsData, isLoading: isLoadingIds, refetch: refetchIds } = useBlockedProfileIds();
	const { mutateAsync: unblockProfileMutation, isPending: isUnblocking } = useUnblockProfile();

	const [blockedProfiles, setBlockedProfiles] = useState<BlockedProfileListItem[]>([]);
	const [isLoadingDetails, setIsLoadingDetails] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mutatingProfileId, setMutatingProfileId] = useState<string | null>(null);
	const [isUnblockingAll, setIsUnblockingAll] = useState(false);
	const [confirmUnblockAll, setConfirmUnblockAll] = useState(false);

	const extractBlockedProfileMeta = useCallback(
		(rawProfilePayload: unknown, profileId: string) => {
			const fallbackName = t("profile_details.profile_fallback", { id: profileId });
			if (typeof rawProfilePayload !== "object" || rawProfilePayload === null) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const profiles = (rawProfilePayload as { profiles?: unknown }).profiles;
			if (!Array.isArray(profiles) || profiles.length === 0) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const first = profiles[0];
			if (typeof first !== "object" || first === null) {
				return { displayName: fallbackName, avatarUrl: null };
			}

			const displayNameRaw = (first as { displayName?: unknown }).displayName;
			const displayName =
				typeof displayNameRaw === "string" && displayNameRaw.trim().length > 0
					? displayNameRaw.trim()
					: fallbackName;

			const hashRaw = (first as { profileImageMediaHash?: unknown }).profileImageMediaHash;
			const avatarUrl =
				typeof hashRaw === "string" && validateMediaHash(hashRaw)
					? getThumbImageUrl(hashRaw, "75x75")
					: null;

			return { displayName, avatarUrl };
		},
		[t],
	);

	const loadBlockedProfileDetails = useCallback(
		async (blockedIds: string[]) => {
			setIsLoadingDetails(true);
			setError(null);

			try {
				if (blockedIds.length === 0) {
					setBlockedProfiles([]);
					return;
				}

				const profileResults = await Promise.allSettled(
					blockedIds.map(async (profileId) => {
						const raw = await apiFunctions.getRawProfile(profileId);
						const { displayName, avatarUrl } = extractBlockedProfileMeta(raw, profileId);
						return { profileId, displayName, avatarUrl } satisfies BlockedProfileListItem;
					}),
				);

				const successful = profileResults
					.filter((r): r is PromiseFulfilledResult<BlockedProfileListItem> => r.status === "fulfilled")
					.map((r) => r.value);

				const successfulIds = new Set(successful.map((p) => p.profileId));
				const fallbackItems = blockedIds
					.filter((profileId) => !successfulIds.has(profileId))
					.map((profileId) => ({
						profileId,
						displayName: t("profile_details.profile_fallback", { id: profileId }),
						avatarUrl: null,
					}));

				setBlockedProfiles([...successful, ...fallbackItems]);
			} catch (loadError) {
				setBlockedProfiles([]);
				setError(loadError instanceof Error ? loadError.message : t("settings_blocked.error_load"));
			} finally {
				setIsLoadingDetails(false);
			}
		},
		[apiFunctions, extractBlockedProfileMeta, t],
	);

	useEffect(() => {
		if (blockedIdsData) {
			void loadBlockedProfileDetails(blockedIdsData);
		}
	}, [blockedIdsData, loadBlockedProfileDetails]);

	const isLoading = isLoadingIds || isLoadingDetails;

	const handleUnblock = async (profileId: string) => {
		if (isUnblocking) return;

		const requiresConfirm = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
		const confirmed = requiresConfirm ? window.confirm(t("profile_details.unblock_confirm")) : true;
		if (!confirmed) return;

		setMutatingProfileId(profileId);
		try {
			await unblockProfileMutation(profileId);
			toast.success(t("profile_details.unblock_success"));
		} catch (unblockError) {
			toast.error(
				unblockError instanceof Error ? unblockError.message : t("profile_details.unblock_failed"),
			);
		} finally {
			setMutatingProfileId(null);
		}
	};

	const handleUnblockPress = (profileId: string) => {
		if (mutatingProfileId) return;
		void handleUnblock(profileId);
	};

	const handleUnblockAll = async () => {
		setIsUnblockingAll(true);
		try {
			await apiFunctions.unblockAllProfiles();
			toast.success(t("settings_blocked.unblock_all_success", { defaultValue: "All users unblocked." }));
			void refetchIds();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : t("settings_blocked.unblock_all_failed", { defaultValue: "Failed to unblock all profiles." }));
		} finally {
			setIsUnblockingAll(false);
			setConfirmUnblockAll(false);
		}
	};

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={() => refetchIds()}
			isDisabled={isLoading}
			refreshingLabel={t("settings_blocked.refreshing")}
		>
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("settings_blocked.title")}</h1>
				<p className="app-subtitle">{t("settings_blocked.subtitle")}</p>
			</header>

			<div className="grid gap-6">
				{isLoading ? (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<div className="h-3 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
							{!isLoadingIds && blockedIdsData && blockedIdsData.length > 0 && (
								<div className="h-3.5 w-5 animate-pulse rounded-full bg-[var(--surface-2)]" />
							)}
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{Array.from({ length: isLoadingIds ? 4 : (blockedIdsData?.length ?? 4) }).map((_, i) => (
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
						title={t("settings_blocked.error_load")}
						description={error}
						onRetry={() => void refetchIds()}
					/>
				) : blockedProfiles.length === 0 ? (
					<EmptyState
						title={t("settings_blocked.empty")}
						description={t("settings_blocked.empty_desc", { defaultValue: "Accounts you block won't be able to see you or message you." })}
					/>
				) : (
					<div>
						<div className="mb-2 flex items-center gap-2 px-1">
							<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("settings_blocked.section_label", { defaultValue: "Blocked" })}
							</p>
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{blockedProfiles.length}
							</span>
						</div>
						<div className="surface-card divide-y divide-[var(--border)] overflow-hidden">
							{blockedProfiles.map((profile) => {
								const isMutating = mutatingProfileId === profile.profileId;
								return (
									<div key={profile.profileId} className="flex items-center gap-3 px-4 py-3">
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
												{t("settings_blocked.profile_id", { id: profile.profileId })}
											</p>
										</div>
										<button
											type="button"
											onClick={() => handleUnblockPress(profile.profileId)}
											onPointerUp={(event) => {
												if (event.pointerType === "mouse") return;
												event.preventDefault();
												handleUnblockPress(profile.profileId);
											}}
											disabled={isMutating}
											className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition hover:border-red-400/60 hover:bg-red-500/5 hover:text-red-400 disabled:opacity-50"
										>
											<UserX className="h-3.5 w-3.5" />
											{isMutating
												? t("profile_details.unblock_in_progress")
												: t("profile_details.unblock")}
										</button>
									</div>
								);
							})}
						</div>
					</div>
				)}
				{/* Unblock all — shown once list is loaded and non-empty */}
				{!isLoading && !error && blockedProfiles.length > 0 && (
					<div className="surface-card overflow-hidden">
						<div className="flex items-start gap-3 p-4">
							<div className="shrink-0 rounded-2xl bg-red-500/15 p-2.5 text-red-400">
								<ShieldOff className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="grid grid-cols-[1fr_auto] gap-x-3">
									<p className="text-sm font-semibold leading-snug">
										{t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
									</p>
									<div className="row-span-2 flex items-start">
										{isUnblockingAll ? (
											<span className="text-xs text-[var(--text-muted)]">
												{t("settings_blocked.unblocking_all", { defaultValue: "Unblocking…" })}
											</span>
										) : (
											<button
												type="button"
												onClick={() => setConfirmUnblockAll(true)}
												className="shrink-0 inline-flex items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
											>
												{t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
											</button>
										)}
									</div>
									<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
										{t("settings_blocked.unblock_all_desc", { defaultValue: "Remove all blocked accounts at once. This cannot be undone." })}
									</p>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>

			<ConfirmDialog
				isOpen={confirmUnblockAll}
				title={t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
				message={t("settings_blocked.unblock_all_confirm", { defaultValue: "This will unblock all blocked accounts. Are you sure?" })}
				confirmLabel={isUnblockingAll ? t("settings_blocked.unblocking_all", { defaultValue: "Unblocking…" }) : t("settings_blocked.unblock_all_title", { defaultValue: "Unblock All" })}
				cancelLabel={t("settings_blocked.cancel", { defaultValue: "Cancel" })}
				onConfirm={() => void handleUnblockAll()}
				onCancel={() => setConfirmUnblockAll(false)}
				isProcessing={isUnblockingAll}
				confirmTone="danger"
			/>
		</PullToRefreshContainer>
	);
}
