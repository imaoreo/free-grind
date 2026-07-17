import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { Avatar } from "../../../components/ui/avatar";
import { Chip } from "../../../components/ui/chip";
import { Button } from "../../../components/ui/button";
import { ConfirmDialog } from "../../../components/ui/confirm-dialog";
import { PersonPicker, type PickedPerson } from "./PersonPicker";
import { addEncounter, deleteEncounter, updateEncounter, type Encounter } from "../../../services/encounters";
import { loadPrepDoses } from "../../../services/prepDoses";
import { computeProtectionStatus } from "../../../services/prepTracking";
import { usePrepScheme } from "./usePrepScheme";
import { formatDateTime, toDateTimeLocalValue, fromDateTimeLocalValue } from "./sexualHealthFormat";

const PREP_TAG = "PrEP";
const PROTECTION_TAGS = [PREP_TAG, "Doxy-PEP", "Condom"];

interface EncounterLogSheetProps {
	prefill?: PickedPerson;
	editingEncounter?: Encounter;
	editingAvatarSrc?: string | null;
	onClose: () => void;
	onLogged: () => void;
	onDeleted?: () => void;
}

export function EncounterLogSheet({
	prefill,
	editingEncounter,
	editingAvatarSrc,
	onClose,
	onLogged,
	onDeleted,
}: EncounterLogSheetProps) {
	const { t } = useTranslation();
	const [scheme] = usePrepScheme();
	const isEditing = editingEncounter != null;
	const [person, setPerson] = useState<PickedPerson | null>(
		editingEncounter
			? {
					profileId: editingEncounter.profileId,
					conversationId: editingEncounter.conversationId,
					displayName: editingEncounter.displayName,
					avatarSrc: editingAvatarSrc ?? null,
				}
			: (prefill ?? null),
	);
	const [changingPerson, setChangingPerson] = useState(false);
	const [occurredAt, setOccurredAt] = useState(() =>
		toDateTimeLocalValue(editingEncounter?.occurredAt ?? Date.now()),
	);
	const [tags, setTags] = useState<string[]>(editingEncounter?.tags ?? []);
	const [note, setNote] = useState(editingEncounter?.note ?? "");
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

	// The app already knows whether the user is currently PrEP-protected from
	// their own dose tracking — no need to make them tag that by hand. Only
	// relevant when logging a new encounter, not when editing one's tags.
	useEffect(() => {
		if (isEditing) return;
		let cancelled = false;
		void loadPrepDoses().then((doses) => {
			if (cancelled) return;
			const status = computeProtectionStatus(doses, scheme);
			if (status.state === "protected") {
				setTags((current) => (current.includes(PREP_TAG) ? current : [...current, PREP_TAG]));
			}
		});
		return () => {
			cancelled = true;
		};
	}, [scheme, isEditing]);

	const showPicker = !isEditing && (!person || changingPerson);

	const toggleTag = (tag: string) => {
		setTags((current) => (current.includes(tag) ? current.filter((existing) => existing !== tag) : [...current, tag]));
	};

	const handleSubmit = async () => {
		if (!person) return;
		setIsSaving(true);
		try {
			if (editingEncounter) {
				await updateEncounter(editingEncounter, { tags, note: note.trim() || null });
				toast.success(t("sexualHealth.encounter.updated", { defaultValue: "Encounter updated" }));
			} else {
				await addEncounter({
					occurredAt: fromDateTimeLocalValue(occurredAt),
					profileId: person.profileId,
					displayName: person.displayName,
					tags,
					note: note.trim() || null,
					conversationId: person.conversationId,
				});
				toast.success(t("sexualHealth.encounter.saved", { defaultValue: "Encounter logged" }));
			}
			onLogged();
		} catch {
			toast.error(t("sexualHealth.encounter.save_failed", { defaultValue: "Could not log this encounter." }));
		} finally {
			setIsSaving(false);
		}
	};

	const handleDelete = async () => {
		if (!editingEncounter) return;
		setIsDeleting(true);
		try {
			await deleteEncounter(editingEncounter.id);
			onDeleted?.();
		} finally {
			setIsDeleting(false);
			setIsConfirmingDelete(false);
		}
	};

	// Portalled to document.body: this sheet can be opened from within the
	// scroll area's masked container (FeedScrollContainer sets an inline
	// mask-image, which — like transform/filter — creates a new containing
	// block for position:fixed descendants), which would otherwise confine
	// this "fixed inset-0" overlay to that container's box instead of the
	// real viewport, leaving it stuck behind the app's fixed bottom nav bar.
	return createPortal(
		<BottomSheet onClose={onClose} isProcessing={isSaving}>
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{isEditing
						? t("sexualHealth.encounter.edit_title", { defaultValue: "Edit encounter" })
						: t("sexualHealth.encounter.sheet_title", { defaultValue: "Log an encounter" })}
				</p>
				<SheetClose
					disabled={isSaving}
					className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-40"
				>
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			<div className={`max-h-[65dvh] overflow-y-auto px-4 ${showPicker ? "" : "pb-4"}`}>
				{showPicker ? (
					<PersonPicker
						onPick={(picked) => {
							setPerson(picked);
							setChangingPerson(false);
						}}
					/>
				) : (
					<div className="grid gap-4">
						{isEditing ? (
							<div className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5">
								<Avatar src={person!.avatarSrc} fallback={person!.displayName} className="h-9 w-9" />
								<span className="min-w-0 flex-1 truncate text-sm font-medium">{person!.displayName}</span>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setChangingPerson(true)}
								className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2.5 text-left transition hover:border-[var(--accent)]"
							>
								<Avatar src={person!.avatarSrc} fallback={person!.displayName} className="h-9 w-9" />
								<span className="min-w-0 flex-1 truncate text-sm font-medium">{person!.displayName}</span>
								<span className="shrink-0 text-xs text-[var(--text-muted)]">
									{t("sexualHealth.encounter.change_person", { defaultValue: "Change" })}
								</span>
							</button>
						)}

						{isEditing ? (
							<div className="grid gap-1.5">
								<span className="text-xs font-medium text-[var(--text-muted)]">
									{t("sexualHealth.encounter.when", { defaultValue: "When" })}
								</span>
								<p className="text-sm text-[var(--text)]">{formatDateTime(editingEncounter.occurredAt)}</p>
							</div>
						) : (
							<label className="grid gap-1.5">
								<span className="text-xs font-medium text-[var(--text-muted)]">
									{t("sexualHealth.encounter.when", { defaultValue: "When" })}
								</span>
								<input
									type="datetime-local"
									value={occurredAt}
									onChange={(event) => setOccurredAt(event.target.value)}
									className="input-field"
								/>
							</label>
						)}

						<div className="grid gap-1.5">
							<span className="text-xs font-medium text-[var(--text-muted)]">
								{t("sexualHealth.encounter.protection", { defaultValue: "Protection" })}
							</span>
							<div className="flex flex-wrap gap-2">
								{PROTECTION_TAGS.map((tag) => (
									<Chip
										key={tag}
										selected={tags.includes(tag)}
										onClick={() => toggleTag(tag)}
										className="min-h-0 px-3 py-1"
									>
										{tag}
									</Chip>
								))}
							</div>
						</div>

						<label className="grid gap-1.5">
							<span className="text-xs font-medium text-[var(--text-muted)]">
								{t("sexualHealth.encounter.note", { defaultValue: "Note (optional)" })}
							</span>
							<textarea
								value={note}
								onChange={(event) => setNote(event.target.value)}
								rows={2}
								className="input-field resize-none"
							/>
						</label>
					</div>
				)}
			</div>

			{!showPicker && (
				<div className="flex gap-2 px-4">
					{isEditing ? (
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
							{t("sexualHealth.encounter.delete", { defaultValue: "Delete encounter" })}
						</button>
					) : (
						<Button variant="secondary" className="flex-1" onClick={onClose} disabled={isSaving}>
							{t("sexualHealth.encounter.cancel", { defaultValue: "Cancel" })}
						</Button>
					)}
					<Button variant="primary" className="flex-1" loading={isSaving} onClick={() => void handleSubmit()}>
						{t("sexualHealth.encounter.save", { defaultValue: "Save" })}
					</Button>
				</div>
			)}

			<ConfirmDialog
				isOpen={isConfirmingDelete}
				title={t("sexualHealth.encounter.delete_confirm_title", { defaultValue: "Delete this encounter?" })}
				message={t("sexualHealth.encounter.delete_confirm_message", { defaultValue: "This can't be undone." })}
				confirmLabel={t("sexualHealth.encounter.delete_confirm_action", { defaultValue: "Delete" })}
				cancelLabel={t("sexualHealth.encounter.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isDeleting}
				onCancel={() => setIsConfirmingDelete(false)}
				onConfirm={() => void handleDelete()}
			/>
		</BottomSheet>,
		document.body,
	);
}
