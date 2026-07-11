import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldPlus } from "lucide-react";
import { useAuth } from "../contexts/useAuth";
import { usePreferences } from "../contexts/PreferencesContext";
import { useApiFunctions } from "../hooks/useApiFunctions";
import { useMyOwnProfile } from "../hooks/queries/useProfileQueries";
import { LastTestedMonthPicker } from "./LastTestedMonthPicker";
import { processDismissCountdown, writeDismissedFlag } from "../utils/appStartDismissCountdown";

const TEST_REMINDER_THRESHOLD_MONTHS = 3;
const TEST_REMINDER_DISMISS_KEY = "test-reminder-dismissed";
// "Skip" only suppresses the reminder for this many subsequent app starts —
// same mechanism as OutdatedVersionGate — rather than dismissing forever, so
// an overdue test doesn't get permanently forgotten.
const TEST_REMINDER_REOPEN_COUNT = 10;

function monthsSince(timestamp: number): number {
	return (Date.now() - timestamp) / (1000 * 60 * 60 * 24 * 30.44);
}

function currentMonthValue(): string {
	const now = new Date();
	return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Gates the routed app behind a full-page HIV test reminder — same slot in
 * the tree as onboarding/VersionAnnouncement in App.tsx, not a floating
 * overlay on top of the grid. Shown once the last test is 3+ months old.
 * Lets the user patch lastTestedDate directly (same optimistic-PATCH pattern
 * as the grid header's "show distance" toggle) instead of routing to the
 * full profile editor. "Skip" suppresses the reminder for the next
 * TEST_REMINDER_REOPEN_COUNT app starts (same countdown mechanism as
 * OutdatedVersionGate) rather than showing it every cold start; it can also
 * be turned off entirely from the profile editor's Health section.
 */
export function TestReminderGate({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const { userId, isLoading: isAuthLoading } = useAuth();
	const { testReminderDisabled } = usePreferences();
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const { data: profile } = useMyOwnProfile(Boolean(userId) && !isAuthLoading);
	const [isDismissed, setIsDismissed] = useState(() =>
		processDismissCountdown(TEST_REMINDER_DISMISS_KEY),
	);
	const [monthValue, setMonthValue] = useState(currentMonthValue);
	const [isSaving, setIsSaving] = useState(false);

	const isOverdue =
		!testReminderDisabled &&
		profile?.lastTestedDate != null &&
		monthsSince(profile.lastTestedDate) >= TEST_REMINDER_THRESHOLD_MONTHS;

	if (!isOverdue || isDismissed) {
		return <>{children}</>;
	}

	const handleSave = async () => {
		if (!monthValue || isSaving) {
			return;
		}
		const timestamp = Date.parse(`${monthValue}-01T00:00:00.000Z`);
		if (!Number.isFinite(timestamp)) {
			return;
		}

		setIsSaving(true);
		try {
			await apiFunctions.updateMyProfile({ lastTestedDate: timestamp });
			queryClient.setQueryData(["my-own-profile"], (current: typeof profile) =>
				current ? { ...current, lastTestedDate: timestamp } : current,
			);
			toast.success(t("test_reminder.saved"));
			setIsDismissed(true);
		} catch {
			toast.error(t("test_reminder.save_failed"));
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="app-shell">
		<div className="fs-card-outer fs-card-overlay no-touch-callout">
			<div className="fs-card-inner fs-card-lg flex flex-col">
				<div
					className="flex flex-1 flex-col items-center justify-center px-8 text-center"
					style={{
						paddingTop: "max(48px, env(safe-area-inset-top))",
						paddingBottom: "max(24px, env(safe-area-inset-bottom))",
					}}
				>
					<div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
						<ShieldPlus className="h-9 w-9 text-[var(--accent)]" />
					</div>
					<h1 className="text-2xl font-bold text-[var(--text)]">{t("test_reminder.title")}</h1>
					<p className="mt-2 max-w-xs text-sm leading-relaxed text-[var(--text-muted)]">
						{t("test_reminder.description")}
					</p>
					<div className="mt-6 w-full max-w-[240px]">
						<LastTestedMonthPicker
							value={monthValue}
							onChange={setMonthValue}
							notSetLabel={t("profile_editor.sections.states.not_set")}
						/>
					</div>
				</div>

				<div
					className="flex h-44 shrink-0 flex-col justify-end gap-2 px-6"
					style={{ paddingBottom: "max(28px, calc(env(safe-area-inset-bottom) + 12px))" }}
				>
					<button
						type="button"
						onClick={() => void handleSave()}
						disabled={!monthValue || isSaving}
						className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{isSaving ? t("test_reminder.saving") : t("test_reminder.save")}
					</button>
					<button
						type="button"
						onClick={() => {
							writeDismissedFlag(TEST_REMINDER_DISMISS_KEY, TEST_REMINDER_REOPEN_COUNT);
							setIsDismissed(true);
						}}
						disabled={isSaving}
						className="w-full rounded-xl py-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
					>
						{t("test_reminder.skip")}
					</button>
				</div>
			</div>
		</div>
		</div>
	);
}
