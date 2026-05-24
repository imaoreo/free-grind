import { Download, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import {
	loadSavedPhrases,
	parsePhrasesFromTxt,
	phrasesToTxt,
	saveSavedPhrases,
} from "../../services/savedPhrases";

export function SettingsSavedPhrasesPage() {
	const { t } = useTranslation();
	const [savedPhrases, setSavedPhrases] = useState<string[]>(() => loadSavedPhrases());
	const [newPhrase, setNewPhrase] = useState("");
	const [isImporting, setIsImporting] = useState(false);
	const importInputRef = useRef<HTMLInputElement | null>(null);

	const handleAddPhrase = () => {
		if (!newPhrase.trim()) {
			return;
		}
		const updated = saveSavedPhrases([...savedPhrases, newPhrase]);
		setSavedPhrases(updated);
		setNewPhrase("");
	};

	const handleDeletePhrase = (index: number) => {
		const updated = saveSavedPhrases(savedPhrases.filter((_, phraseIndex) => phraseIndex !== index));
		setSavedPhrases(updated);
	};

	const handleExportTxt = () => {
		const content = phrasesToTxt(savedPhrases);
		if (!content) {
			toast.error(
				t("settings_saved_phrases.export_empty", {
					defaultValue: "No saved phrases to export.",
				}),
			);
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
		toast.success(
			t("settings_saved_phrases.export_success", {
				defaultValue: "Saved phrases exported.",
			}),
		);
	};

	const handleImportClick = () => {
		importInputRef.current?.click();
	};

	const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const imported = parsePhrasesFromTxt(content);
			if (imported.length === 0) {
				toast.error(
					t("settings_saved_phrases.import_empty", {
						defaultValue: "No valid phrases found in that file.",
					}),
				);
				return;
			}

			const updated = saveSavedPhrases(imported);
			setSavedPhrases(updated);
			toast.success(
				t("settings_saved_phrases.import_success", {
					defaultValue: "Saved phrases imported.",
				}),
			);
		} catch {
			toast.error(
				t("settings_saved_phrases.import_error", {
					defaultValue: "Failed to import saved phrases.",
				}),
			);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<section className="app-screen">
			<BackToSettings />
			<header className="mb-6">
				<p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-readable)]">
					{t("settings_saved_phrases.label", { defaultValue: "Chat" })}
				</p>
				<h1 className="app-title mt-2">
					{t("settings_saved_phrases.title", {
						defaultValue: "Saved Phrases",
					})}
				</h1>
				<p className="app-subtitle">
					{t("settings_saved_phrases.subtitle", {
						defaultValue: "Create, import, and export quick replies used in chat.",
					})}
				</p>
			</header>

			<div className="grid gap-4">
				<div className="surface-card p-4 sm:p-5">
					<div className="flex flex-col gap-2 sm:flex-row">
						<input
							type="text"
							value={newPhrase}
							onChange={(event) => setNewPhrase(event.target.value)}
							placeholder={t("settings_saved_phrases.new_placeholder", {
								defaultValue: "Add a new phrase...",
							})}
							className="input-field w-full"
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									handleAddPhrase();
								}
							}}
						/>
						<button
							type="button"
							onClick={handleAddPhrase}
							disabled={!newPhrase.trim()}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Plus className="h-4 w-4" />
							{t("settings_saved_phrases.add", { defaultValue: "Add" })}
						</button>
					</div>
				</div>

				<div className="surface-card p-4 sm:p-5">
					<div className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={handleExportTxt}
							disabled={savedPhrases.length === 0}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Download className="h-4 w-4" />
							{t("settings_saved_phrases.export_txt", { defaultValue: "Export .txt" })}
						</button>
						<button
							type="button"
							onClick={handleImportClick}
							disabled={isImporting}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-sm font-medium text-[var(--text)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
						>
							<Upload className="h-4 w-4" />
							{isImporting
								? t("settings_saved_phrases.importing", { defaultValue: "Importing..." })
								: t("settings_saved_phrases.import_txt", { defaultValue: "Import .txt" })}
						</button>
						<input
							type="file"
							ref={importInputRef}
							onChange={(event) => void handleImportFile(event)}
							accept=".txt,text/plain"
							className="hidden"
						/>
					</div>
					<p className="mt-2 text-xs text-[var(--text-muted)]">
						{t("settings_saved_phrases.import_hint", {
							defaultValue:
								"Import expects one phrase per line and will replace the current list.",
						})}
					</p>
				</div>

				<div className="surface-card p-4 sm:p-5">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-lg font-semibold">
							{t("settings_saved_phrases.current", { defaultValue: "Current Phrases" })}
						</h2>
						<span className="text-xs text-[var(--text-muted)]">
							{t("settings_saved_phrases.count", {
								count: savedPhrases.length,
								defaultValue: "{{count}} saved",
							})}
						</span>
					</div>
					{savedPhrases.length === 0 ? (
						<p className="text-sm text-[var(--text-muted)]">
							{t("settings_saved_phrases.empty", {
								defaultValue: "No saved phrases yet.",
							})}
						</p>
					) : (
						<div className="grid gap-2">
							{savedPhrases.map((phrase, index) => (
								<div
									key={`${phrase}-${index}`}
									className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
								>
									<p className="min-w-0 flex-1 truncate text-sm text-[var(--text)]">{phrase}</p>
									<button
										type="button"
										onClick={() => handleDeletePhrase(index)}
										className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
										aria-label={t("settings_saved_phrases.delete", {
											defaultValue: "Delete phrase",
										})}
										title={t("settings_saved_phrases.delete", {
											defaultValue: "Delete phrase",
										})}
									>
										<Trash2 className="h-4 w-4" />
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
