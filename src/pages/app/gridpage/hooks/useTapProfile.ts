import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import type { ProfileDetail } from "../../GridPage.types";

type TapVisualState = { visualState: "single" | "mutual"; sentAt: number };

type UseTapProfileParams = {
	activeProfile: ProfileDetail | null;
	setActiveProfile: React.Dispatch<React.SetStateAction<ProfileDetail | null>>;
	activeProfileId: string | null;
	tap: (profileId: string | number) => Promise<{ isMutual: boolean }>;
	TAP_WINDOW_MS: number;
};

function toEpochMs(timestamp: number | null | undefined): number | null {
	if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
		return null;
	}
	return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function isWithinWindow(timestamp: number | null | undefined, windowMs: number): boolean {
	const normalizedTimestamp = toEpochMs(timestamp);
	if (normalizedTimestamp === null) {
		return false;
	}
	const ageMs = Date.now() - normalizedTimestamp;
	return ageMs >= 0 && ageMs < windowMs;
}

export function useTapProfile({
	activeProfile,
	setActiveProfile,
	activeProfileId,
	tap,
	TAP_WINDOW_MS,
}: UseTapProfileParams) {
	const { t } = useTranslation();
	const [tappingProfileId, setTappingProfileId] = useState<string | null>(null);
	const [tapVisualStates, setTapVisualStates] = useState<
		Record<string, TapVisualState>
	>({});

	const resolvedTapVisualState = useMemo(() => {
		if (!activeProfileId) {
			return "none" as const;
		}

		const localState = tapVisualStates[activeProfileId] ?? null;
		const localStateWithinWindow =
			localState && isWithinWindow(localState.sentAt, TAP_WINDOW_MS) ? localState : null;
		const hasSentTap =
			activeProfile?.tapped === true || localStateWithinWindow !== null;
		const hasReceivedTap =
			typeof activeProfile?.lastReceivedTapTimestamp === "number" &&
			isWithinWindow(activeProfile.lastReceivedTapTimestamp, TAP_WINDOW_MS);

		if (hasSentTap || hasReceivedTap) {
			return "single" as const;
		}

		return "none" as const;
	}, [activeProfile, activeProfileId, tapVisualStates, TAP_WINDOW_MS]);

	const hasSentTapRecently = useMemo(() => {
		if (!activeProfileId) {
			return false;
		}

		const sentFromServer = activeProfile?.tapped === true;
		const sentLocally = isWithinWindow(tapVisualStates[activeProfileId]?.sentAt, TAP_WINDOW_MS);

		return sentFromServer || sentLocally;
	}, [activeProfile, activeProfileId, tapVisualStates, TAP_WINDOW_MS]);

	const handleTapProfile = useCallback(
		async (profileId: string) => {
			if (tappingProfileId === profileId) {
				return;
			}

			const sentFromServer =
				activeProfile?.profileId === profileId && activeProfile.tapped === true;
			const sentLocally = isWithinWindow(tapVisualStates[profileId]?.sentAt, TAP_WINDOW_MS);
			if (sentFromServer || sentLocally) {
				toast(t("browse_page.toasts.tap_limit"));
				return;
			}

			setTappingProfileId(profileId);
			try {
				const result = await tap(profileId);
				setActiveProfile((current) =>
					current && current.profileId === profileId
						? { ...current, tapped: true }
						: current,
				);
				setTapVisualStates((current) => ({
					...current,
					[profileId]: {
						visualState: result.isMutual ? "mutual" : "single",
						sentAt: Date.now(),
					},
				}));
				toast.success(
					result.isMutual
						? t("browse_page.toasts.tap_mutual")
						: t("browse_page.toasts.tap_sent"),
				);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: t("browse_page.toasts.tap_failed"),
				);
			} finally {
				setTappingProfileId((current: string | null) =>
					current === profileId ? null : current,
				);
			}
		},
		[activeProfile, tap, tapVisualStates, tappingProfileId, TAP_WINDOW_MS, t],
	);

	return {
		tappingProfileId,
		tapVisualStates,
		resolvedTapVisualState,
		hasSentTapRecently,
		handleTapProfile,
	};
}
