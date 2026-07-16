import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Pill, Plus, Settings, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { LoadingState } from "../../../components/ui/states";
import { addPrepDose, deletePrepDose, loadPrepDoses, type PrepDose } from "../../../services/prepDoses";
import {
	computeProtectionStatus,
	describeProtectionStatus,
	getNextDoseAction,
	type PrepScheme,
	type PrepStatusVariant,
} from "../../../services/prepTracking";
import { formatDateTime } from "./sexualHealthFormat";
import { SexualHealthFab } from "./SexualHealthFab";
import { SexualHealthEmptyState } from "./SexualHealthEmptyState";
import { SexualHealthPrepSettingsSheet } from "./SexualHealthPrepSettingsSheet";

const STATUS_TEXT_CLASS: Record<PrepStatusVariant, string> = {
	positive: "text-emerald-400",
	warning: "text-amber-400",
	negative: "text-red-400",
	neutral: "text-[var(--text)]",
};

const DOSE_ROLE_LABEL_KEYS: Record<PrepDose["doseRole"], string> = {
	daily: "sexualHealth.doses.role_daily",
	loading: "sexualHealth.doses.role_loading",
	plus24: "sexualHealth.doses.role_plus24",
	plus48: "sexualHealth.doses.role_plus48",
};

const ON_DEMAND_LOG_LABEL: Record<"loading" | "plus24" | "plus48", { key: string; defaultValue: string }> = {
	loading: { key: "sexualHealth.doses.log_loading", defaultValue: "Loading dose (2 pills)" },
	plus24: { key: "sexualHealth.doses.log_plus24", defaultValue: "+24h dose" },
	plus48: { key: "sexualHealth.doses.log_plus48", defaultValue: "+48h dose" },
};

export function SexualHealthDosesTab({
	headerSlotEl,
	fabSlotEl,
	scheme,
	onSchemeChange,
	onDosesChanged,
}: {
	headerSlotEl: HTMLDivElement | null;
	fabSlotEl: HTMLDivElement | null;
	scheme: PrepScheme;
	onSchemeChange: (scheme: PrepScheme) => void;
	onDosesChanged?: () => void;
}) {
	const { t } = useTranslation();
	const [doses, setDoses] = useState<PrepDose[] | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isLogging, setIsLogging] = useState(false);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);

	const reload = () => {
		void loadPrepDoses().then(setDoses);
	};

	useEffect(() => {
		reload();
	}, []);

	const logDose = async (doseRole: PrepDose["doseRole"]) => {
		if (isLogging) return;
		setIsLogging(true);
		try {
			const result = await addPrepDose({ scheme, doseRole });
			setDoses(result.doses);
			if (!result.ok) {
				toast(t("sexualHealth.doses.already_logged", { defaultValue: "Already logged — nothing more to add right now." }));
			} else {
				onDosesChanged?.();
			}
		} finally {
			setIsLogging(false);
		}
	};

	const status = doses ? computeProtectionStatus(doses, scheme) : { state: "unknown" as const };
	const { label, variant } = describeProtectionStatus(status, t);
	const nextAction = doses ? getNextDoseAction(doses, scheme) : null;

	return (
		<>
			{headerSlotEl &&
				createPortal(
					<div className="flex min-h-8 items-center justify-between gap-2.5">
						<p className="min-w-0 truncate text-sm">
							<span className={`font-semibold ${STATUS_TEXT_CLASS[variant]}`}>{label}</span>
							<span className="text-[var(--text-muted)]">
								{" · "}
								{scheme === "daily"
									? t("sexualHealth.doses.scheme_daily", { defaultValue: "Daily dosing" })
									: t("sexualHealth.doses.scheme_on_demand", { defaultValue: "On-demand dosing (2-1-1)" })}
								{nextAction?.scheme === "on_demand" && nextAction.nextRole !== "loading" && (
									<>
										{" · "}
										{t("sexualHealth.doses.next_due", {
											defaultValue: "{{dose}} still needed",
											dose: t(ON_DEMAND_LOG_LABEL[nextAction.nextRole].key, {
												defaultValue: ON_DEMAND_LOG_LABEL[nextAction.nextRole].defaultValue,
											}),
										})}
									</>
								)}
								{nextAction?.alreadyLoggedToday && (
									<>
										{" · "}
										{t("sexualHealth.doses.already_logged_today", { defaultValue: "Today's dose is already logged" })}
									</>
								)}
							</span>
						</p>
						<button
							type="button"
							onClick={() => setIsSettingsOpen(true)}
							className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
							aria-label={t("sexualHealth.info.settings_button", { defaultValue: "PrEP settings" })}
						>
							<Settings className="h-4 w-4" />
						</button>
					</div>,
					headerSlotEl,
				)}

			<div>
				{doses === null ? (
					<div className="px-[var(--app-px)]">
						<LoadingState title={t("sexualHealth.doses.loading", { defaultValue: "Loading doses…" })} />
					</div>
				) : doses.length === 0 ? (
					<SexualHealthEmptyState
						icon={<Pill className="h-5 w-5 opacity-60" />}
						title={t("sexualHealth.doses.empty", { defaultValue: "No doses logged yet" })}
						description={t("sexualHealth.doses.empty_desc", { defaultValue: "Use the button below to log your first dose." })}
					/>
				) : (
					<div>
						{doses.map((dose) => (
							<div
								key={dose.id}
								className="flex items-center gap-4 border-t border-[var(--surface-2)] py-3 pl-4 pr-4"
							>
								<div className="h-15 w-15 shrink-0 squircle drop-shadow-sm flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-muted)]">
									<Pill className="h-6 w-6" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-bold text-[var(--text)]">{t(DOSE_ROLE_LABEL_KEYS[dose.doseRole])}</p>
									<p className="mt-0.5 truncate text-xs font-medium text-[var(--text-muted)]">
										{formatDateTime(dose.takenAt)}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setPendingDeleteId(dose.id)}
									className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/35 text-red-400 transition-all active:scale-95 hover:border-red-500/45"
									style={{
										backgroundColor: "color-mix(in srgb, #ef4444, transparent 92%)",
										boxShadow: "0 2px 8px color-mix(in srgb, #ef4444, transparent 94%)",
									}}
									aria-label={t("sexualHealth.doses.delete", { defaultValue: "Delete dose" })}
								>
									<Trash2 className="h-4 w-4" />
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{nextAction && !nextAction.alreadyLoggedToday && (
				<SexualHealthFab
					slotEl={fabSlotEl}
					disabled={isLogging}
					onClick={() => void logDose(nextAction.scheme === "daily" ? "daily" : nextAction.nextRole)}
					icon={<Plus className="h-8 w-8 stroke-[3]" />}
					label={
						nextAction.scheme === "daily"
							? t("sexualHealth.doses.log_daily", { defaultValue: "Log today's dose" })
							: t(ON_DEMAND_LOG_LABEL[nextAction.nextRole].key, {
									defaultValue: ON_DEMAND_LOG_LABEL[nextAction.nextRole].defaultValue,
								})
					}
				/>
			)}

			<ConfirmDialog
				isOpen={pendingDeleteId != null}
				title={t("sexualHealth.doses.delete_confirm_title", { defaultValue: "Delete this dose?" })}
				message={t("sexualHealth.doses.delete_confirm_message", { defaultValue: "This can't be undone." })}
				confirmLabel={t("sexualHealth.doses.delete_confirm_action", { defaultValue: "Delete" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isDeleting}
				onCancel={() => setPendingDeleteId(null)}
				onConfirm={async () => {
					if (!pendingDeleteId) return;
					setIsDeleting(true);
					try {
						await deletePrepDose(pendingDeleteId);
						reload();
						onDosesChanged?.();
					} finally {
						setIsDeleting(false);
						setPendingDeleteId(null);
					}
				}}
			/>

			{isSettingsOpen && (
				<SexualHealthPrepSettingsSheet
					scheme={scheme}
					onSchemeChange={onSchemeChange}
					onClose={() => setIsSettingsOpen(false)}
				/>
			)}
		</>
	);
}
