import { useMemo, useState } from "react";
import { UserX } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useBlockedProfiles, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { ProfileImage } from "../../components/ui/profile-image";

type BlockedProfileListItem = {
	profileId: string;
	displayName: string;
	avatarUrl: string | null;
};

export function SettingsBlockedPage() {
	const { t } = useTranslation();
	const { data: blockedProfilesData, isLoading, refetch, error: queryError } = useBlockedProfiles();
	const { mutateAsync: unblockProfileMutation, isPending: isUnblocking } = useUnblockProfile();

	const [mutatingProfileId, setMutatingProfileId] = useState<string | null>(null);

	const blockedProfiles = useMemo(() => {
		if (!blockedProfilesData) {
			return [];
		}

		// Sort by timestamp descending (most recent block at the top)
		const sorted = [...blockedProfilesData].sort((a, b) => {
			const tA = a.timestamp ?? 0;
			const tB = b.timestamp ?? 0;
			return tB - tA;
		});

		return sorted.map((profile) => {
			const fallbackName = t("profile_details.profile_fallback", { id: profile.profileId });
			const displayName = profile.displayName?.trim() || fallbackName;
			const avatarUrl =
				profile.profileImageMediaHash && validateMediaHash(profile.profileImageMediaHash)
					? getThumbImageUrl(profile.profileImageMediaHash, "75x75")
					: null;

			return {
				profileId: profile.profileId,
				displayName,
				avatarUrl,
			} satisfies BlockedProfileListItem;
		});
	}, [blockedProfilesData, t]);

	const error = queryError instanceof Error ? queryError.message : null;

	const blockedCountLabel = useMemo(
		() =>
			blockedProfiles.length === 1
				? t("settings_blocked.count_one", { count: blockedProfiles.length })
				: t("settings_blocked.count_other", { count: blockedProfiles.length }),
		[blockedProfiles.length, t],
	);

	const handleUnblock = async (profileId: string) => {
		if (isUnblocking) {
			return;
		}

		const requiresConfirm = window.matchMedia(
			"(hover: hover) and (pointer: fine)",
		).matches;
		const confirmed = requiresConfirm
			? window.confirm(t("profile_details.unblock_confirm"))
			: true;
		if (!confirmed) {
			return;
		}

		setMutatingProfileId(profileId);
		try {
			await unblockProfileMutation(profileId);
			toast.success(t("profile_details.unblock_success"));
		} catch (unblockError) {
			toast.error(
				unblockError instanceof Error
					? unblockError.message
					: t("profile_details.unblock_failed"),
			);
		} finally {
			setMutatingProfileId(null);
		}
	};

	const handleUnblockPress = (profileId: string) => {
		if (mutatingProfileId) {
			return;
		}
		void handleUnblock(profileId);
	};

	return (
		<PullToRefreshContainer
			className="app-screen"
			onRefresh={() => refetch()}
			isDisabled={isLoading}
			refreshingLabel={t("settings_blocked.refreshing")}
		>
			<BackToSettings />
			<header className="mb-6">
				<h1 className="app-title mb-2">{t("settings_blocked.title")}</h1>
				<p className="app-subtitle">{t("settings_blocked.subtitle")}</p>
				{!isLoading ? (
					<p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
						{blockedCountLabel}
					</p>
				) : null}
			</header>

			<div className="grid gap-4">
				{isLoading ? (
					<div className="surface-card p-5 text-sm text-[var(--text-muted)]">
						{t("settings_blocked.loading")}
					</div>
				) : null}

				{!isLoading && error ? (
					<div className="surface-card p-5 text-sm text-[var(--text-muted)]">
						{error}
					</div>
				) : null}

				{!isLoading && !error && blockedProfiles.length === 0 ? (
					<div className="surface-card p-5 text-sm text-[var(--text-muted)]">
						{t("settings_blocked.empty")}
					</div>
				) : null}

				{!isLoading && !error && blockedProfiles.length > 0
					? blockedProfiles.map((profile) => {
						const isMutating = mutatingProfileId === profile.profileId;
						return (
							<div
								key={profile.profileId}
								className="surface-card flex items-center justify-between gap-3 p-4 sm:p-5"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="h-11 w-11 shrink-0 overflow-hidden rounded-full">
										<ProfileImage
											src={profile.avatarUrl}
											alt={t("profile_details.photo_alt", {
												name: profile.displayName,
											})}
										/>
									</div>
									<div className="min-w-0">
										<p className="truncate text-sm font-semibold text-[var(--text)] sm:text-base">
											{profile.displayName}
										</p>
										<p className="text-xs text-[var(--text-muted)]">
											{t("settings_blocked.profile_id", {
												id: profile.profileId,
											})}
										</p>
									</div>
								</div>

								<button
									type="button"
									onClick={() => handleUnblockPress(profile.profileId)}
									onPointerUp={(event) => {
										if (event.pointerType === "mouse") {
											return;
										}
										event.preventDefault();
										handleUnblockPress(profile.profileId);
									}}
									disabled={isMutating}
									className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)] disabled:opacity-70"
								>
									<UserX className="h-4 w-4" />
									{isMutating
										? t("profile_details.unblock_in_progress")
										: t("profile_details.unblock")}
								</button>
							</div>
						);
					})
					: null}
			</div>
		</PullToRefreshContainer>
	);
}
