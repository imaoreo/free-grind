import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, Plus, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { Button } from "../../../components/ui/button";
import { Chip } from "../../../components/ui/chip";
import { LoadingState } from "../../../components/ui/states";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { useRevealOnScroll } from "../../../hooks/useRevealOnScroll";
import { cn } from "../../../utils/cn";
import { useApiFunctions } from "../../../hooks/useApiFunctions";
import { useMyOwnProfile } from "../../../hooks/queries/useProfileQueries";
import { addStiTest, deleteStiTest, loadStiTests, updateStiTest, type StiTest } from "../../../services/stiTests";
import { formatDate, fromDateTimeLocalValue, toDateInputValue } from "./sexualHealthFormat";
import { SexualHealthFab } from "./SexualHealthFab";
import { SexualHealthEmptyState } from "./SexualHealthEmptyState";

const TEST_TYPE_LABEL_KEYS: Record<StiTest["testType"], string> = {
	full_panel: "sexualHealth.tests.type_full_panel",
	hiv: "sexualHealth.tests.type_hiv",
	chlamydia: "sexualHealth.tests.type_chlamydia",
	gonorrhea: "sexualHealth.tests.type_gonorrhea",
	syphilis: "sexualHealth.tests.type_syphilis",
	other: "sexualHealth.tests.type_other",
};

const RESULT_LABEL_KEYS: Record<StiTest["result"], string> = {
	pending: "sexualHealth.tests.result_pending",
	negative: "sexualHealth.tests.result_negative",
	positive: "sexualHealth.tests.result_positive",
};

function TestRow({
	test,
	onEdit,
	onDelete,
}: {
	test: StiTest;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const { ref, revealClass } = useRevealOnScroll();

	return (
		<div
			ref={ref}
			onClick={onEdit}
			className={cn(
				"flex cursor-pointer items-center gap-4 border-t border-[var(--surface-2)] py-3 pl-4 pr-4 transition-colors hover:bg-[var(--surface-2)]/50",
				revealClass,
			)}
		>
			<div className="h-15 w-15 shrink-0 squircle drop-shadow-sm flex items-center justify-center bg-[var(--surface-2)] text-[var(--text-muted)]">
				<FlaskConical className="h-6 w-6" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-bold text-[var(--text)]">{t(TEST_TYPE_LABEL_KEYS[test.testType])}</p>
				<p className="mt-0.5 truncate text-xs font-medium text-[var(--text-muted)]">
					{[formatDate(test.testedAt), t(RESULT_LABEL_KEYS[test.result])].join(" · ")}
				</p>
				{test.note && <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{test.note}</p>}
			</div>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					onDelete();
				}}
				className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/35 text-red-400 transition-all active:scale-95 hover:border-red-500/45"
				style={{
					backgroundColor: "color-mix(in srgb, #ef4444, transparent 92%)",
					boxShadow: "0 2px 8px color-mix(in srgb, #ef4444, transparent 94%)",
				}}
				aria-label={t("sexualHealth.tests.delete", { defaultValue: "Delete" })}
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>
	);
}

function TestFormSheet({
	editingTest,
	onClose,
	onSaved,
	onDeleted,
}: {
	editingTest?: StiTest;
	onClose: () => void;
	onSaved: (testedAt: number) => void;
	onDeleted?: () => void;
}) {
	const { t } = useTranslation();
	const [testedAt, setTestedAt] = useState(() => toDateInputValue(editingTest?.testedAt ?? Date.now()));
	const [testType, setTestType] = useState<StiTest["testType"]>(editingTest?.testType ?? "full_panel");
	const [result, setResult] = useState<StiTest["result"]>(editingTest?.result ?? "pending");
	const [note, setNote] = useState(editingTest?.note ?? "");
	const [isSaving, setIsSaving] = useState(false);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const handleSubmit = async () => {
		setIsSaving(true);
		try {
			const testedAtMs = fromDateTimeLocalValue(testedAt);
			if (editingTest) {
				await updateStiTest({
					id: editingTest.id,
					testedAt: testedAtMs,
					testType,
					result,
					note: note.trim() || null,
				});
			} else {
				await addStiTest({
					testedAt: testedAtMs,
					testType,
					result,
					note: note.trim() || null,
				});
			}
			onSaved(testedAtMs);
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!editingTest) return;
		setIsDeleting(true);
		try {
			await deleteStiTest(editingTest.id);
			onDeleted?.();
		} finally {
			setIsDeleting(false);
			setIsConfirmingDelete(false);
		}
	};

	// Portalled to document.body — see EncounterLogSheet.tsx for why
	// (avoids the FeedScrollContainer mask-image containing-block issue).
	return createPortal(
		<BottomSheet onClose={onClose} isProcessing={isSaving}>
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{editingTest
						? t("sexualHealth.tests.edit_title", { defaultValue: "Edit test" })
						: t("sexualHealth.tests.add_title", { defaultValue: "Add test" })}
				</p>
				<SheetClose disabled={isSaving} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-40">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>
			<div className="grid gap-4 px-4 pb-4">
				<label className="grid gap-1.5">
					<span className="text-xs font-medium text-[var(--text-muted)]">
						{t("sexualHealth.tests.field_date", { defaultValue: "Date" })}
					</span>
					<input type="date" value={testedAt} onChange={(event) => setTestedAt(event.target.value)} className="input-field" />
				</label>
				<div className="grid gap-1.5">
					<span className="text-xs font-medium text-[var(--text-muted)]">
						{t("sexualHealth.tests.field_type", { defaultValue: "Test type" })}
					</span>
					<div className="flex flex-wrap gap-2">
						{(Object.keys(TEST_TYPE_LABEL_KEYS) as StiTest["testType"][]).map((value) => (
							<Chip key={value} selected={testType === value} onClick={() => setTestType(value)}>
								{t(TEST_TYPE_LABEL_KEYS[value])}
							</Chip>
						))}
					</div>
				</div>
				<div className="grid gap-1.5">
					<span className="text-xs font-medium text-[var(--text-muted)]">
						{t("sexualHealth.tests.field_result", { defaultValue: "Result" })}
					</span>
					<div className="flex flex-wrap gap-2">
						{(Object.keys(RESULT_LABEL_KEYS) as StiTest["result"][]).map((value) => (
							<Chip key={value} selected={result === value} onClick={() => setResult(value)}>
								{t(RESULT_LABEL_KEYS[value])}
							</Chip>
						))}
					</div>
				</div>
				<label className="grid gap-1.5">
					<span className="text-xs font-medium text-[var(--text-muted)]">
						{t("sexualHealth.tests.field_note", { defaultValue: "Note (optional)" })}
					</span>
					<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="input-field resize-none" />
				</label>
			</div>
			<div className="flex gap-2 px-4">
				{editingTest ? (
					<button
						type="button"
						onClick={() => setIsConfirmingDelete(true)}
						disabled={isSaving}
						className="flex flex-1 items-center justify-center rounded-xl border border-red-500/35 px-4 py-2.5 text-sm font-medium text-red-400 transition-all active:scale-95 hover:border-red-500/45 disabled:opacity-40"
						style={{
							backgroundColor: "color-mix(in srgb, #ef4444, transparent 92%)",
							boxShadow: "0 2px 8px color-mix(in srgb, #ef4444, transparent 94%)",
						}}
					>
						{t("sexualHealth.tests.delete", { defaultValue: "Delete" })}
					</button>
				) : (
					<Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
						{t("sexualHealth.tests.cancel", { defaultValue: "Cancel" })}
					</Button>
				)}
				<Button variant="primary" className="flex-1" loading={isSaving} onClick={() => void handleSubmit()}>
					{t("sexualHealth.tests.save", { defaultValue: "Save" })}
				</Button>
			</div>

			<ConfirmDialog
				isOpen={isConfirmingDelete}
				title={t("sexualHealth.tests.delete_confirm_title", { defaultValue: "Delete this test?" })}
				message={t("sexualHealth.tests.delete_confirm_message", { defaultValue: "This can't be undone." })}
				confirmLabel={t("sexualHealth.tests.delete_confirm_action", { defaultValue: "Delete" })}
				cancelLabel={t("sexualHealth.tests.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isDeleting}
				onCancel={() => setIsConfirmingDelete(false)}
				onConfirm={() => void handleDelete()}
			/>
		</BottomSheet>,
		document.body,
	);
}

export function SexualHealthTestsTab({
	headerSlotEl,
	fabSlotEl,
}: {
	headerSlotEl: HTMLDivElement | null;
	fabSlotEl: HTMLDivElement | null;
}) {
	const { t } = useTranslation();
	const [tests, setTests] = useState<StiTest[] | null>(null);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editingTest, setEditingTest] = useState<StiTest | null>(null);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const apiFunctions = useApiFunctions();
	const queryClient = useQueryClient();
	const { data: profile } = useMyOwnProfile();

	const reload = () => {
		void loadStiTests().then(setTests);
	};

	useEffect(() => {
		reload();
	}, []);

	// Keeps the profile's single "last tested" field (used by the profile
	// editor and the app-wide TestReminderGate check-up nudge) in sync with
	// the newest test logged here — only ever moves it forward, so logging an
	// old/backdated test can't make an up-to-date profile look stale.
	const syncProfileLastTested = async (testedAtMs: number) => {
		if (profile?.lastTestedDate != null && profile.lastTestedDate >= testedAtMs) {
			return;
		}
		try {
			await apiFunctions.updateMyProfile({ lastTestedDate: testedAtMs });
			queryClient.setQueryData(["my-own-profile"], (current: typeof profile) =>
				current ? { ...current, lastTestedDate: testedAtMs } : current,
			);
			toast.success(
				t("sexualHealth.tests.profile_synced", { defaultValue: "Profile's last tested date updated too" }),
			);
		} catch {
			// Best-effort only — the local test entry is already saved either way.
		}
	};

	return (
		<>
			{headerSlotEl &&
				createPortal(
					<div className="flex min-h-8 items-center justify-between gap-2.5">
						<p className="min-w-0 truncate text-sm">
							<span className="font-semibold text-[var(--text)]">
								{t("sexualHealth.tests.profile_last_tested", { defaultValue: "Last tested (profile)" })}
							</span>
							<span className="text-[var(--text-muted)]">
								{" · "}
								{profile?.lastTestedDate != null
									? formatDate(profile.lastTestedDate)
									: t("sexualHealth.tests.profile_last_tested_unset", { defaultValue: "Not set" })}
							</span>
						</p>
						{/* Invisible spacer matching Doses' settings button so both header rows share the exact same box model/height. */}
						<div className="h-8 w-8 shrink-0" aria-hidden="true" />
					</div>,
					headerSlotEl,
				)}

			<div>
				{tests === null ? (
					<div className="px-[var(--app-px)]">
						<LoadingState title={t("sexualHealth.tests.loading", { defaultValue: "Loading tests…" })} />
					</div>
				) : tests.length === 0 ? (
					<SexualHealthEmptyState
						icon={<FlaskConical className="h-5 w-5 opacity-60" />}
						title={t("sexualHealth.tests.empty", { defaultValue: "No tests logged yet" })}
						description={t("sexualHealth.tests.empty_desc", { defaultValue: "Add your latest STI test to keep track over time." })}
					/>
				) : (
					<div>
						{tests.map((test) => (
							<TestRow
								key={test.id}
								test={test}
								onEdit={() => setEditingTest(test)}
								onDelete={() => setPendingDeleteId(test.id)}
							/>
						))}
					</div>
				)}
			</div>

			{!isAddOpen && !editingTest && (
				<SexualHealthFab
					slotEl={fabSlotEl}
					onClick={() => setIsAddOpen(true)}
					icon={<Plus className="h-8 w-8 stroke-[3]" />}
					label={t("sexualHealth.tests.add", { defaultValue: "Add test" })}
				/>
			)}

			{isAddOpen && (
				<TestFormSheet
					onClose={() => setIsAddOpen(false)}
					onSaved={(testedAtMs) => {
						setIsAddOpen(false);
						reload();
						void syncProfileLastTested(testedAtMs);
					}}
				/>
			)}

			{editingTest && (
				<TestFormSheet
					editingTest={editingTest}
					onClose={() => setEditingTest(null)}
					onSaved={(testedAtMs) => {
						setEditingTest(null);
						reload();
						void syncProfileLastTested(testedAtMs);
					}}
					onDeleted={() => {
						setEditingTest(null);
						reload();
					}}
				/>
			)}

			<ConfirmDialog
				isOpen={pendingDeleteId != null}
				title={t("sexualHealth.tests.delete_confirm_title", { defaultValue: "Delete this test?" })}
				message={t("sexualHealth.tests.delete_confirm_message", { defaultValue: "This can't be undone." })}
				confirmLabel={t("sexualHealth.tests.delete_confirm_action", { defaultValue: "Delete" })}
				cancelLabel={t("sexualHealth.tests.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isDeleting}
				onCancel={() => setPendingDeleteId(null)}
				onConfirm={async () => {
					if (!pendingDeleteId) return;
					setIsDeleting(true);
					try {
						await deleteStiTest(pendingDeleteId);
						reload();
					} finally {
						setIsDeleting(false);
						setPendingDeleteId(null);
					}
				}}
			/>
		</>
	);
}
