import { useRef, useState } from "react";
import { FileUp, Loader2, UploadCloud, X } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackupCategoryPicker } from "./BackupCategoryPicker";
import { OnboardingItem, OnboardingModal } from "./OnboardingModal";
import { BottomSheet, SheetClose } from "./ui/bottom-sheet";
import { useDesktopBreakpoint } from "../hooks/useDesktopBreakpoint";
import * as chatDb from "../services/chatDb";
import {
	cleanupTempFile,
	copyPickedFileToTemp,
	importBackupFile,
	inspectBackupFile,
	type BackupCategoryId,
} from "../services/backupRestore";
import { markRestoreOffered } from "../utils/restoreOfferStorage";

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

export function RestoreBackupOffer({ userId, onDone }: { userId: number; onDone: () => void }) {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [isBusy, setIsBusy] = useState(false);
	const [pendingImport, setPendingImport] = useState<{
		tempPath: string;
		categories: BackupCategoryId[];
		selected: Set<BackupCategoryId>;
	} | null>(null);

	const finish = () => {
		markRestoreOffered(userId);
		onDone();
	};

	const showImportError = (error: "wrong_owner" | "invalid_format") => {
		toast.error(
			error === "wrong_owner"
				? t("restore_offer.import_wrong_owner", { defaultValue: "This export belongs to a different profile and can't be imported here." })
				: t("restore_offer.import_invalid", { defaultValue: "This file isn't a valid data export." }),
		);
	};

	const handleFilePicked = async (file: File) => {
		setIsBusy(true);
		const tempPath = await copyPickedFileToTemp(file);
		try {
			const inspection = await inspectBackupFile(tempPath, userId);
			if (!inspection.ok) {
				showImportError(inspection.error);
				await cleanupTempFile(tempPath);
				return;
			}
			setPendingImport({ tempPath, categories: inspection.categories, selected: new Set(inspection.categories) });
		} catch (error) {
			toast.error(getErrorMessage(error, t("restore_offer.import_failed", { defaultValue: "Failed to read backup file." })));
			await cleanupTempFile(tempPath);
		} finally {
			setIsBusy(false);
		}
	};

	const handleCancelImport = () => {
		if (pendingImport) {
			void cleanupTempFile(pendingImport.tempPath);
		}
		setPendingImport(null);
	};

	const handleConfirmImport = async () => {
		if (!pendingImport) return;
		setIsBusy(true);
		try {
			const result = await importBackupFile(
				chatDb.getActiveChatDbFileName(),
				userId,
				pendingImport.tempPath,
				Array.from(pendingImport.selected),
			);
			if (!result.ok) {
				showImportError(result.error);
				return;
			}
			toast.success(
				t("restore_offer.import_success", { defaultValue: "Imported {{count}} rows. Reloading…", count: result.rowsImported }),
			);
			await cleanupTempFile(pendingImport.tempPath);
			setPendingImport(null);
			finish();
			window.location.reload();
		} catch (error) {
			toast.error(getErrorMessage(error, t("restore_offer.import_failed", { defaultValue: "Failed to read backup file." })));
		} finally {
			setIsBusy(false);
		}
	};

	const toggleCategory = (id: BackupCategoryId) => {
		setPendingImport((prev) => {
			if (!prev) return prev;
			const next = new Set(prev.selected);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return { ...prev, selected: next };
		});
	};

	return (
		<>
			<OnboardingModal
				title={t("restore_offer.title", { defaultValue: "Restore your data?" })}
				headerIcon={FileUp}
				onClose={finish}
				onConfirm={finish}
				buttonLabel={t("restore_offer.skip", { defaultValue: "Skip for now" })}
			>
				<OnboardingItem
					icon={UploadCloud}
					title={t("restore_offer.item_title", { defaultValue: "Have a backup file?" })}
					description={t("restore_offer.description", {
						defaultValue: "If you have a backup file from this account, you can restore your conversations, media, and settings now.",
					})}
				>
					<button
						type="button"
						onClick={() => fileInputRef.current?.click()}
						disabled={isBusy}
						className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
						{t("restore_offer.choose_file", { defaultValue: "Choose backup file" })}
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept="application/zip,.zip"
						className="hidden"
						onChange={(event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) void handleFilePicked(file);
						}}
					/>
				</OnboardingItem>
			</OnboardingModal>

			{pendingImport && (
				<BottomSheet
					onClose={handleCancelImport}
					isDesktop={isDesktop}
					isProcessing={isBusy}
					panelClassName="max-h-[82dvh]"
					zIndex="z-[150]"
				>
					<div className="flex items-center justify-between px-4 pb-3">
						<p className="text-sm font-semibold text-[var(--text)]">
							{t("restore_offer.categories_title", { defaultValue: "What do you want to restore?" })}
						</p>
						<SheetClose
							disabled={isBusy}
							className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] disabled:opacity-60"
						>
							<X className="h-4 w-4" />
						</SheetClose>
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto pb-4" data-lenis-prevent>
						<p className="mb-3 px-4 text-xs leading-relaxed text-[var(--text-muted)]">
							{t("restore_offer.categories_desc", { defaultValue: "Only categories present in this file can be restored." })}
						</p>
						<BackupCategoryPicker categories={pendingImport.categories} selected={pendingImport.selected} onToggle={toggleCategory} />
					</div>
					<div className="flex gap-2 px-4 pb-4 pt-2">
						<SheetClose
							disabled={isBusy}
							className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60"
						>
							{t("common.cancel", { defaultValue: "Cancel" })}
						</SheetClose>
						<button
							type="button"
							onClick={() => void handleConfirmImport()}
							disabled={isBusy || pendingImport.selected.size === 0}
							className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
						>
							{isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
							<span>{t("restore_offer.confirm", { defaultValue: "Restore" })}</span>
						</button>
					</div>
				</BottomSheet>
			)}
		</>
	);
}
