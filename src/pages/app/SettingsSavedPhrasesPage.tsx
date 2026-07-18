import { BookMarked, Download, GripVertical, Loader2, MessageSquarePlus, MessageSquareQuote, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import {
	loadSavedPhrases,
	parsePhrasesFromTxt,
	phrasesToTxt,
	saveSavedPhrases,
} from "../../services/savedPhrases";
import { restrictToVerticalAxis } from "../../utils/dndModifiers";
import {
	DndContext,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	verticalListSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type SortablePhraseRowProps = {
	phrase: string;
	onDelete: () => void;
	isDesktop: boolean;
};

function SortablePhraseRow({ phrase, onDelete, isDesktop }: SortablePhraseRowProps) {
	const { t } = useTranslation();
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: phrase });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...(isDesktop ? {} : { ...attributes, ...listeners })}
			className={`flex items-center gap-3 px-4 py-3 ${isDesktop ? "" : "touch-pan-y no-touch-callout"} ${isDragging ? "z-10 bg-[var(--surface)] opacity-60" : ""}`}
		>
			{isDesktop && (
				<button
					type="button"
					{...attributes}
					{...listeners}
					className="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-xl text-[var(--text-muted)] active:cursor-grabbing"
					aria-label={t("settings_saved_phrases.reorder", { defaultValue: "Reorder phrase" })}
				>
					<GripVertical className="h-4 w-4" />
				</button>
			)}
			<div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)]">
				<MessageSquareQuote className="h-3.5 w-3.5" />
			</div>
			<p className="min-w-0 flex-1 break-words text-sm leading-relaxed">{phrase}</p>
			<button
				type="button"
				onClick={onDelete}
				className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
				aria-label={t("settings_saved_phrases.delete", { defaultValue: "Delete phrase" })}
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

export function SettingsSavedPhrasesPage() {
	const { t } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const [savedPhrases, setSavedPhrases] = useState<string[]>([]);
	const [newPhrase, setNewPhrase] = useState("");
	const [isImporting, setIsImporting] = useState(false);
	const importInputRef = useRef<HTMLInputElement | null>(null);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
	);

	useEffect(() => {
		void loadSavedPhrases().then(setSavedPhrases);
	}, []);

	const handleAddPhrase = async () => {
		if (!newPhrase.trim()) return;
		const updated = await saveSavedPhrases([...savedPhrases, newPhrase]);
		setSavedPhrases(updated);
		setNewPhrase("");
	};

	const handleDeletePhrase = async (index: number) => {
		const updated = await saveSavedPhrases(savedPhrases.filter((_, i) => i !== index));
		setSavedPhrases(updated);
	};

	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const from = savedPhrases.indexOf(String(active.id));
		const to = savedPhrases.indexOf(String(over.id));
		if (from === -1 || to === -1) return;

		const reordered = arrayMove(savedPhrases, from, to);
		setSavedPhrases(reordered);
		const updated = await saveSavedPhrases(reordered);
		setSavedPhrases(updated);
	};

	const handleExportTxt = () => {
		const content = phrasesToTxt(savedPhrases);
		if (!content) {
			toast.error(t("settings_saved_phrases.export_empty", { defaultValue: "No saved phrases to export." }));
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
		toast.success(t("settings_saved_phrases.export_success", { defaultValue: "Saved phrases exported." }));
	};

	const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;

		setIsImporting(true);
		try {
			const content = await file.text();
			const imported = parsePhrasesFromTxt(content);
			if (imported.length === 0) {
				toast.error(t("settings_saved_phrases.import_empty", { defaultValue: "No valid phrases found in that file." }));
				return;
			}
			const updated = await saveSavedPhrases(imported);
			setSavedPhrases(updated);
			toast.success(t("settings_saved_phrases.import_success", { defaultValue: "Saved phrases imported." }));
		} catch {
			toast.error(t("settings_saved_phrases.import_error", { defaultValue: "Failed to import saved phrases." }));
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<section className="app-screen">
			<header className="mb-7">
				<BackToSettings />
				<h1 className="app-title mb-1">
					{t("settings_saved_phrases.title", { defaultValue: "Saved Phrases" })}
				</h1>
				<p className="app-subtitle">
					{t("settings_saved_phrases.subtitle", { defaultValue: "Create, import, and export quick replies used in chat." })}
				</p>
			</header>

			<div className="grid gap-6">
				{/* Add phrase */}
				<div className="surface-card overflow-hidden">
					<div className="flex items-start gap-3 p-4">
						<div className="shrink-0 rounded-2xl bg-green-500/15 p-2.5 text-green-400">
							<MessageSquarePlus className="h-5 w-5" />
						</div>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-semibold leading-snug">
								{t("settings_saved_phrases.add_title", { defaultValue: "New Phrase" })}
							</p>
							<p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">
								{t("settings_saved_phrases.add_desc", { defaultValue: "Add a quick reply shortcut for use in chat." })}
							</p>
							<div className="mt-3 flex gap-2">
								<input
									type="text"
									value={newPhrase}
									onChange={(e) => setNewPhrase(e.target.value)}
									placeholder={t("settings_saved_phrases.new_placeholder", { defaultValue: "Type your phrase…" })}
									className="input-field min-w-0 flex-1 !min-h-0 !py-2 !px-3 text-sm"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handleAddPhrase();
										}
									}}
								/>
								<button
									type="button"
									onClick={handleAddPhrase}
									disabled={!newPhrase.trim()}
									className="btn-accent inline-flex shrink-0 items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
								>
									<Plus className="h-3.5 w-3.5" />
									{t("settings_saved_phrases.add_btn", { defaultValue: "Add" })}
								</button>
							</div>
						</div>
					</div>
				</div>

				{/* Phrases list */}
				<div className="min-w-0">
					<div className="mb-2 flex items-center gap-2 px-1">
						<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
							{t("settings_saved_phrases.current", { defaultValue: "Phrases" })}
						</p>
						{savedPhrases.length > 0 && (
							<span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">
								{savedPhrases.length}
							</span>
						)}
					</div>
					<div className="surface-card overflow-hidden">
						{savedPhrases.length === 0 ? (
							<div className="flex flex-col items-center gap-2.5 py-10 text-[var(--text-muted)]">
								<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
									<BookMarked className="h-5 w-5 opacity-60" />
								</div>
								<p className="text-sm font-medium">
									{t("settings_saved_phrases.empty", { defaultValue: "No saved phrases yet." })}
								</p>
								<p className="text-xs opacity-60">
									{t("settings_saved_phrases.empty_hint", { defaultValue: "Type above to add your first phrase." })}
								</p>
							</div>
						) : (
							<DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} autoScroll={false} onDragEnd={(e) => void handleDragEnd(e)}>
								<SortableContext items={savedPhrases} strategy={verticalListSortingStrategy}>
									<div className="divide-y divide-[var(--border)]">
										{savedPhrases.map((phrase, index) => (
											<SortablePhraseRow
												key={phrase}
												phrase={phrase}
												onDelete={() => handleDeletePhrase(index)}
												isDesktop={isDesktop}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						)}
					</div>
				</div>

				{/* Import / Export */}
				<div>
					<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_saved_phrases.import_export_title", { defaultValue: "Import / Export" })}
					</p>
					<div className="surface-card overflow-hidden divide-y divide-[var(--border)]">
						<button
							type="button"
							onClick={handleExportTxt}
							disabled={savedPhrases.length === 0}
							className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${savedPhrases.length === 0 ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"}`}
						>
							<div className="shrink-0 rounded-2xl bg-teal-500/15 p-2.5 text-teal-400">
								<Download className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{t("settings_saved_phrases.export_txt", { defaultValue: "Export .txt" })}
								</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{t("settings_saved_phrases.export_txt_desc", { defaultValue: "Save your phrases as a plain text file, one per line." })}
								</p>
							</div>
							<Download className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
						</button>

						<button
							type="button"
							onClick={() => importInputRef.current?.click()}
							disabled={isImporting}
							className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${isImporting ? "opacity-50" : "hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"}`}
						>
							<div className="shrink-0 rounded-2xl bg-violet-500/15 p-2.5 text-violet-400">
								<Upload className="h-5 w-5" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-semibold leading-snug">
									{isImporting
										? t("settings_saved_phrases.importing", { defaultValue: "Importing…" })
										: t("settings_saved_phrases.import_txt", { defaultValue: "Import .txt" })}
								</p>
								<p className="mt-0.5 text-xs leading-snug text-[var(--text-muted)]">
									{t("settings_saved_phrases.import_txt_desc", { defaultValue: "One phrase per line — replaces the current list." })}
								</p>
							</div>
							{isImporting ? (
								<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" />
							) : (
								<Upload className="h-4 w-4 shrink-0 text-[var(--text-muted)] opacity-50" />
							)}
						</button>
					</div>
					<input
						type="file"
						ref={importInputRef}
						onChange={(e) => void handleImportFile(e)}
						accept=".txt,text/plain"
						className="hidden"
					/>
				</div>
			</div>
		</section>
	);
}
