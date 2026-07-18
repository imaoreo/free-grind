import { useCallback, useEffect, useRef, useState } from "react";
import {
	Download,
	FileDown,
	FileUp,
	Loader2,
	MessageSquareQuote,
	RotateCcw,
	ShieldCheck,
	Trash2,
	Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useAuth } from "../../contexts/useAuth";
import { AndroidFs, AndroidPublicGeneralPurposeDir } from "tauri-plugin-android-fs-api";
import { BaseDirectory, mkdir, writeFile as writeFsFile } from "@tauri-apps/plugin-fs";
import * as chatDb from "../../services/chatDb";
import { deleteAllDownloadedMedia, getDownloadedMediaUsage, isAndroid, isIos } from "../../services/saveMedia";
import { loadSavedPhrases, parsePhrasesFromTxt, phrasesToTxt, saveSavedPhrases } from "../../services/savedPhrases";
import { resetAllSettings } from "../../utils/resetSettings";
import { useSettingsHighlight } from "../../hooks/useSettingsHighlight";
import { appLog } from "../../utils/logger";
import type { FullDbExport } from "../../types/chat-db";

function formatBytes(bytes: number): string {
	if (bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB"];
	const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** exponent;
	return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

export function SettingsDataPage() {
	const { t } = useTranslation();
	const highlightId = useSettingsHighlight();
	const { userId } = useAuth();

	const [usage, setUsage] = useState<{ count: number; totalBytes: number } | null>(null);
	const [isLoadingUsage, setIsLoadingUsage] = useState(true);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [showResetConfirm, setShowResetConfirm] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [savedPhrases, setSavedPhrases] = useState<string[]>([]);
	const [isImportingPhrases, setIsImportingPhrases] = useState(false);
	const phrasesInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		void loadSavedPhrases().then(setSavedPhrases);
	}, []);

	const loadUsage = useCallback(async () => {
		setIsLoadingUsage(true);
		try {
			setUsage(await getDownloadedMediaUsage());
		} catch (error) {
			appLog.error("[SettingsDataPage] failed to load downloaded-media usage", error);
		} finally {
			setIsLoadingUsage(false);
		}
	}, []);

	useEffect(() => {
		void loadUsage();
	}, [loadUsage]);

	const handleDeleteAll = async () => {
		setIsDeleting(true);
		try {
			const result = await deleteAllDownloadedMedia();
			if (result.failed > 0) {
				toast.error(
					t("data_backup.delete_partial", {
						defaultValue: "Deleted {{deleted}} files, {{failed}} failed.",
						deleted: result.deleted,
						failed: result.failed,
					}),
				);
			} else {
				toast.success(
					t("data_backup.delete_success", {
						defaultValue: "Deleted {{count}} downloaded files.",
						count: result.deleted,
					}),
				);
			}
			await loadUsage();
		} catch (error) {
			toast.error(getErrorMessage(error, t("data_backup.delete_failed", { defaultValue: "Failed to delete downloaded media." })));
		} finally {
			setIsDeleting(false);
			setShowDeleteConfirm(false);
		}
	};

	const handleExport = async () => {
		if (userId == null) {
			toast.error(t("data_backup.export_no_user", { defaultValue: "You must be signed in to export." }));
			return;
		}
		setIsExporting(true);
		try {
			const fileName = `free-grind-data-${new Date().toISOString().slice(0, 10)}.json`;

			if (isAndroid()) {
				// The blob-URL + <a download> trick below doesn't trigger a save on
				// Android's WebView, so write the export directly via MediaStore instead.
				// Streamed in chunks (rather than one writeFile(uri, allBytesAtOnce))
				// since accounts with a lot of cached media can produce a
				// multi-hundred-MB export — holding it all in memory at once was
				// slow enough to look hung and could crash the WebView on low-memory
				// devices.
				const uri = await AndroidFs.createNewPublicFile(AndroidPublicGeneralPurposeDir.Download, fileName, "application/json", {
					isPending: true,
				});
				try {
					const writable = await AndroidFs.openWriteFileStream(uri);
					const writer = writable.getWriter();
					try {
						for await (const chunk of chatDb.streamFullDatabaseExportBytes(userId)) {
							await writer.write(chunk);
						}
						await writer.close();
					} catch (error) {
						// A write failure already released the stream, so closing it
						// again would throw and mask the real error below.
						await writer.abort(error).catch(() => {});
						throw error;
					}
					await AndroidFs.setPublicFilePending(uri, false);
					await AndroidFs.scanPublicFile(uri);
				} catch (error) {
					await AndroidFs.removeFile(uri).catch(() => {});
					throw error;
				}
			} else {
				// Streams straight to disk (same memory/hang reason as the Android
				// branch above) instead of building one giant JSON string for a
				// Blob + <a download>.
				const generator = chatDb.streamFullDatabaseExportBytes(userId);
				const readable = new ReadableStream<Uint8Array>({
					async pull(controller) {
						const { value, done } = await generator.next();
						if (done) {
							controller.close();
						} else {
							controller.enqueue(value);
						}
					},
					async cancel() {
						await generator.return(undefined);
					},
				});

				// iOS has no shared Downloads folder — write into the app's own
				// Documents dir instead, which Info.plist's UIFileSharingEnabled +
				// LSSupportsOpeningDocumentsInPlace expose in the Files app under
				// "On My iPhone/iPad" > Free Grind.
				const baseDir = isIos() ? BaseDirectory.Document : BaseDirectory.Download;
				// Must stay under <baseDir>/FreeGrind — the fs:allow-write-file
				// capability (desktop.json / ios.json) only scopes write access to
				// that folder, same one saveMedia.ts saves media into on desktop.
				await mkdir("FreeGrind", { baseDir, recursive: true });
				await writeFsFile(`FreeGrind/${fileName}`, readable, { baseDir });
			}

			toast.success(
				isAndroid()
					? t("data_backup.export_success", { defaultValue: "Data exported." })
					: isIos()
						? t("data_backup.export_success_ios", { defaultValue: "Data exported. Find it in the Files app under On My iPhone/iPad → Free Grind." })
						: t("data_backup.export_success_desktop", { defaultValue: "Data exported to Downloads/FreeGrind." }),
			);
		} catch (error) {
			toast.error(getErrorMessage(error, t("data_backup.export_failed", { defaultValue: "Failed to export data." })));
		} finally {
			setIsExporting(false);
		}
	};

	const handleImportFile = async (file: File) => {
		if (userId == null) {
			toast.error(t("data_backup.import_no_user", { defaultValue: "You must be signed in to import." }));
			return;
		}
		setIsImporting(true);
		try {
			const text = await file.text();
			const data = JSON.parse(text) as FullDbExport;
			const result = await chatDb.importFullDatabase(data, userId);
			if (!result.ok) {
				toast.error(
					result.error === "wrong_owner"
						? t("data_backup.import_wrong_owner", { defaultValue: "This export belongs to a different profile and can't be imported here." })
						: t("data_backup.import_invalid", { defaultValue: "This file isn't a valid data export." }),
				);
				return;
			}
			// A full import can touch conversations, messages, and every
			// setting (automation, privacy, browse filters, location, etc.),
			// each of which is otherwise cached in memory or React state and
			// only ever (re)loaded on app start / account switch — a reload
			// is the only way to guarantee everything reflects the import.
			toast.success(
				t("data_backup.import_success", {
					defaultValue: "Imported {{count}} rows. Reloading…",
					count: result.rowsImported,
				}),
			);
			window.location.reload();
		} catch (error) {
			toast.error(getErrorMessage(error, t("data_backup.import_failed", { defaultValue: "Failed to import data." })));
		} finally {
			setIsImporting(false);
		}
	};

	const handleExportPhrasesTxt = () => {
		const content = phrasesToTxt(savedPhrases);
		if (!content) {
			toast.error(t("data_backup.phrases_export_empty", { defaultValue: "No saved phrases to export." }));
			return;
		}
		const blob = new Blob([`${content}\n`], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `free-grind-saved-phrases-${new Date().toISOString().slice(0, 10)}.txt`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		toast.success(t("data_backup.phrases_export_success", { defaultValue: "Saved phrases exported." }));
	};

	const handleImportPhrasesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setIsImportingPhrases(true);
		try {
			const content = await file.text();
			const imported = parsePhrasesFromTxt(content);
			if (imported.length === 0) {
				toast.error(t("data_backup.phrases_import_empty", { defaultValue: "No valid phrases found in that file." }));
				return;
			}
			const updated = await saveSavedPhrases(imported);
			setSavedPhrases(updated);
			toast.success(t("data_backup.phrases_import_success", { defaultValue: "Saved phrases imported." }));
		} catch {
			toast.error(t("data_backup.phrases_import_error", { defaultValue: "Failed to import saved phrases." }));
		} finally {
			setIsImportingPhrases(false);
		}
	};

	const handleResetAllSettings = async () => {
		setIsResetting(true);
		try {
			await resetAllSettings();
			toast.success(t("data_backup.reset_success", { defaultValue: "All settings reset. Reloading…" }));
			window.location.reload();
		} catch (error) {
			toast.error(getErrorMessage(error, t("data_backup.reset_failed", { defaultValue: "Failed to reset settings." })));
			setIsResetting(false);
			setShowResetConfirm(false);
		}
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">{t("data_backup.title", { defaultValue: "Backup & Restore" })}</h1>
				<p className="app-subtitle">
					{t("data_backup.subtitle", { defaultValue: "Manage downloaded media and back up your account's entire data." })}
				</p>
			</header>

			<div className="grid gap-8">
				<div>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<button
							id="data-export"
							type="button"
							onClick={() => void handleExport()}
							disabled={isExporting}
							className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${isExporting ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"} ${highlightId === "data-export" ? "animate-settings-highlight" : ""}`}
						>
							<div className="shrink-0 rounded-2xl bg-teal-500/15 p-2.5 text-teal-400">
								<FileDown className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("data_backup.export", { defaultValue: "Export all data" })}
								</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{t("data_backup.export_card_desc", {
										defaultValue: "Save your entire account to a file: conversations, messages, albums, avatars, cached photos/videos, saved phrases, saved locations, and every app setting.",
									})}
								</p>
							</div>
							{isExporting ? (
								<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" />
							) : (
								<Download className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
							)}
						</button>

						<button
							id="data-import"
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={isImporting}
							className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${isImporting ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"} ${highlightId === "data-import" ? "animate-settings-highlight" : ""}`}
						>
							<div className="shrink-0 rounded-2xl bg-violet-500/15 p-2.5 text-violet-400">
								<FileUp className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("data_backup.import", { defaultValue: "Import data" })}
								</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{t("data_backup.import_card_desc", {
										defaultValue: "Merge a previously exported file back in — nothing already here is erased. The app reloads afterwards.",
									})}
								</p>
							</div>
							{isImporting ? (
								<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" />
							) : (
								<Upload className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
							)}
						</button>
						<input
							ref={fileInputRef}
							type="file"
							accept="application/json,.json"
							className="hidden"
							onChange={(event) => {
								const file = event.target.files?.[0];
								event.target.value = "";
								if (file) void handleImportFile(file);
							}}
						/>

						<div className="flex items-start gap-2.5 px-4 py-3">
							<ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
							<p className="text-xs leading-relaxed text-[var(--text-muted)]">
								{t("data_backup.backup_note", {
									defaultValue: "Exports are tied to your profile — a file can only be imported back into the same account it came from.",
								})}
							</p>
						</div>
					</div>
				</div>

				<div className="grid gap-4">
					{/* Media Storage */}
					<div>
						<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
							{t("data_backup.media_storage", { defaultValue: "Media Storage" })}
						</p>
						<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
							<div
								id="data-storage-used"
								className={`flex items-center justify-between gap-4 px-4 py-3.5 ${highlightId === "data-storage-used" ? "animate-settings-highlight" : ""}`}
							>
								<div className="min-w-0">
									<p className="text-sm font-medium text-[var(--text)]">
										{t("data_backup.storage_used", { defaultValue: "Storage used" })}
									</p>
									<p className="mt-0.5 text-xs text-[var(--text-muted)]">
										{isLoadingUsage
											? t("data_backup.storage_loading", { defaultValue: "Calculating…" })
											: t("data_backup.storage_summary", {
													defaultValue: "{{size}} across {{count}} files",
													size: formatBytes(usage?.totalBytes ?? 0),
													count: usage?.count ?? 0,
												})}
									</p>
								</div>
								<button
									type="button"
									onClick={() => setShowDeleteConfirm(true)}
									disabled={isDeleting || isLoadingUsage || (usage?.count ?? 0) === 0}
									className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
								>
									{isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
									{t("data_backup.delete_all", { defaultValue: "Delete all" })}
								</button>
							</div>
						</div>
					</div>

					{/* Saved Phrases */}
					<div>
						<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
							{t("data_backup.phrases_section", { defaultValue: "Saved Phrases" })}
						</p>
						<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
							<button
								id="data-phrases-export"
								type="button"
								onClick={handleExportPhrasesTxt}
								disabled={savedPhrases.length === 0}
								className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${savedPhrases.length === 0 ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"} ${highlightId === "data-phrases-export" ? "animate-settings-highlight" : ""}`}
							>
								<div className="shrink-0 rounded-2xl bg-teal-500/15 p-2.5 text-teal-400">
									<MessageSquareQuote className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-semibold leading-snug">
										{t("data_backup.phrases_export", { defaultValue: "Export .txt" })}
									</p>
									<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
										{t("data_backup.phrases_export_desc", {
											defaultValue: "Save your saved phrases as a plain text file, one per line.",
										})}
									</p>
								</div>
								<Download className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
							</button>

							<button
								id="data-phrases-import"
								type="button"
								onClick={() => phrasesInputRef.current?.click()}
								disabled={isImportingPhrases}
								className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${isImportingPhrases ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"} ${highlightId === "data-phrases-import" ? "animate-settings-highlight" : ""}`}
							>
								<div className="shrink-0 rounded-2xl bg-violet-500/15 p-2.5 text-violet-400">
									<Upload className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-semibold leading-snug">
										{isImportingPhrases
											? t("data_backup.phrases_importing", { defaultValue: "Importing…" })
											: t("data_backup.phrases_import", { defaultValue: "Import .txt" })}
									</p>
									<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
										{t("data_backup.phrases_import_desc", {
											defaultValue: "One phrase per line — replaces the current list.",
										})}
									</p>
								</div>
								{isImportingPhrases ? (
									<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" />
								) : (
									<Upload className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
								)}
							</button>
						</div>
						<input
							ref={phrasesInputRef}
							type="file"
							accept=".txt,text/plain"
							className="hidden"
							onChange={(event) => void handleImportPhrasesFile(event)}
						/>
					</div>
				</div>

				{/* Danger Zone */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("data_backup.danger_zone", { defaultValue: "Danger Zone" })}
					</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<div
							id="data-reset-all"
							className={`flex items-center justify-between gap-4 px-4 py-3.5 ${highlightId === "data-reset-all" ? "animate-settings-highlight" : ""}`}
						>
							<div className="min-w-0">
								<p className="text-sm font-medium text-[var(--text)]">
									{t("data_backup.reset_all", { defaultValue: "Reset all settings" })}
								</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{t("data_backup.reset_all_desc", {
										defaultValue: "Restores theme, layout, privacy, automation, filters and notification settings to their defaults. Conversations and media are not affected.",
									})}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setShowResetConfirm(true)}
								disabled={isResetting}
								className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
							>
								{isResetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
								{t("data_backup.reset_all", { defaultValue: "Reset all settings" })}
							</button>
						</div>
					</div>
				</div>
			</div>

			<ConfirmDialog
				isOpen={showDeleteConfirm}
				title={t("data_backup.delete_confirm_title", { defaultValue: "Delete all downloaded media?" })}
				message={t("data_backup.delete_confirm_message", {
					defaultValue: "This permanently deletes every photo and video this app has saved to your device. The app's own local cache is not affected.",
				})}
				confirmLabel={t("data_backup.delete_all", { defaultValue: "Delete all" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isDeleting}
				onConfirm={() => void handleDeleteAll()}
				onCancel={() => setShowDeleteConfirm(false)}
			/>

			<ConfirmDialog
				isOpen={showResetConfirm}
				title={t("data_backup.reset_confirm_title", { defaultValue: "Reset all settings?" })}
				message={t("data_backup.reset_confirm_message", {
					defaultValue: "This restores theme, layout, privacy, automation, filters and notification settings to their defaults. Conversations, media and your account are not affected. The app will reload.",
				})}
				confirmLabel={t("data_backup.reset_all", { defaultValue: "Reset all settings" })}
				cancelLabel={t("common.cancel", { defaultValue: "Cancel" })}
				confirmTone="danger"
				isProcessing={isResetting}
				onConfirm={() => void handleResetAllSettings()}
				onCancel={() => setShowResetConfirm(false)}
			/>
		</section>
	);
}
