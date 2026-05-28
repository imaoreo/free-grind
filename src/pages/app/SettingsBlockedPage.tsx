import { useCallback, useEffect, useMemo, useState } from "react";
import { UserX } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useBlockedProfileIds, useUnblockProfile } from "../../hooks/queries/useProfileQueries";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import blankProfileImage from "../../images/blank-profile.png";

type BlockedProfileListItem = {
	profileId: string;
	displayName: string;
	avatarUrl: string;
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

	const extractBlockedProfileMeta = useCallback(
		(rawProfilePayload: unknown, profileId: string) => {
			const fallbackName = t("profile_details.profile_fallback", { id: profileId });
			if (typeof rawProfilePayload !== "object" || rawProfilePayload === null) {
				return {
					displayName: fallbackName,
					avatarUrl: blankProfileImage,
				};
			}

			const profiles = (rawProfilePayload as { profiles?: unknown }).profiles;
			if (!Array.isArray(profiles) || profiles.length === 0) {
				return {
					displayName: fallbackName,
					avatarUrl: blankProfileImage,
				};
			}

			const first = profiles[0];
			if (typeof first !== "object" || first === null) {
				return {
					displayName: fallbackName,
					avatarUrl: blankProfileImage,
				};
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
					: blankProfileImage;

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
						const { displayName, avatarUrl } = extractBlockedProfileMeta(
							raw,
							profileId,
						);
						return {
							profileId,
							displayName,
							avatarUrl,
						} satisfies BlockedProfileListItem;
					}),
				);

				const successful = profileResults
					.filter(
						(
							result,
						): result is PromiseFulfilledResult<BlockedProfileListItem> =>
							result.status === "fulfilled",
					)
					.map((result) => result.value);

				const successfulIds = new Set(successful.map((profile) => profile.profileId));
				const fallbackItems = blockedIds
					.filter((profileId) => !successfulIds.has(profileId))
					.map((profileId) => ({
						profileId,
						displayName: t("profile_details.profile_fallback", { id: profileId }),
						avatarUrl: blankProfileImage,
					}));

				setBlockedProfiles([...successful, ...fallbackItems]);
			} catch (loadError) {
				setBlockedProfiles([]);
				setError(
					loadError instanceof Error
						? loadError.message
						: t("settings_blocked.error_load"),
				);
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
			// The blockedProfiles state is updated via the useEffect above when blockedIdsData changes
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
			onRefresh={() => refetchIds()}
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
									<img
										src={profile.avatarUrl}
										alt={t("profile_details.photo_alt", {
											name: profile.displayName,
										})}
										className="h-11 w-11 shrink-0 rounded-full object-cover"
									/>
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
