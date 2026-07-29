import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AtSign, Ban, Calendar, FileText, Flame, ImageOff, Image as ImageIcon, MessageCirclePlus, MessageSquare, Plus, Search, Trash2, User, X } from "lucide-react";
import toast from "react-hot-toast";
import { AppToaster } from "../AppToaster";
import { Slider } from "../ui/range-slider";
import type { Album } from "../../types/albums";
import type {
	AutomationRule,
	AutomationRuleAction,
	AutomationRuleCondition,
	AutomationTrigger,
} from "../../utils/automationRules";

// The "doesn't contain" keyword conditions aren't a distinct entry in
// AutomationRuleCondition — they're the same type with `negate: true`. But in
// the editor's add-condition dropdown they're offered as separate picks (like
// age_above/age_below already are), fixed at creation time rather than an
// after-the-fact toggle, so a condition's title never has to change under you.
type KeywordNotConditionKind =
	| "bio_not_contains_keyword"
	| "message_not_contains_keyword"
	| "display_name_not_contains_keyword"
	| "x_handle_not_contains_keyword"
	| "instagram_handle_not_contains_keyword"
	| "facebook_handle_not_contains_keyword";
type ConditionKind = AutomationRuleCondition["type"] | KeywordNotConditionKind;
type ActionKind = AutomationRuleAction["type"];

const TRIGGER_KINDS: AutomationTrigger[] = ["new_chat", "message_received", "tap_received"];

const CONDITION_KINDS: ConditionKind[] = [
	"profile_picture",
	"age_above",
	"age_below",
	"display_name_contains_keyword",
	"display_name_not_contains_keyword",
	"bio_contains_keyword",
	"bio_not_contains_keyword",
	"message_contains_keyword",
	"message_not_contains_keyword",
	"has_x_handle",
	"x_handle_contains_keyword",
	"x_handle_not_contains_keyword",
	"has_instagram_handle",
	"instagram_handle_contains_keyword",
	"instagram_handle_not_contains_keyword",
	"has_facebook_handle",
	"facebook_handle_contains_keyword",
	"facebook_handle_not_contains_keyword",
];

const ACTION_KINDS: ActionKind[] = ["block", "send_message", "share_album"];

// Condition types that render as a keyword textarea (with the custom /
// forbidden-list toggle), same UI for all of them.
const KEYWORD_CONDITION_TYPES = [
	"bio_contains_keyword",
	"message_contains_keyword",
	"display_name_contains_keyword",
	"x_handle_contains_keyword",
	"instagram_handle_contains_keyword",
	"facebook_handle_contains_keyword",
] as const satisfies AutomationRuleCondition["type"][];
type KeywordConditionType = (typeof KEYWORD_CONDITION_TYPES)[number];

// Condition types that render as a simple "has X" / "no X" select, same UI
// for all of them (see the profile_picture pattern this generalizes from).
const HAS_CONDITION_TYPES = ["has_x_handle", "has_instagram_handle", "has_facebook_handle"] as const satisfies AutomationRuleCondition["type"][];
type HasConditionType = (typeof HAS_CONDITION_TYPES)[number];

type KeywordCondition = Extract<AutomationRuleCondition, { type: KeywordConditionType }>;

function isKeywordCondition(condition: AutomationRuleCondition): condition is KeywordCondition {
	return (KEYWORD_CONDITION_TYPES as readonly string[]).includes(condition.type);
}

const KEYWORD_NOT_KIND_BY_TYPE: Record<KeywordConditionType, KeywordNotConditionKind> = {
	bio_contains_keyword: "bio_not_contains_keyword",
	message_contains_keyword: "message_not_contains_keyword",
	display_name_contains_keyword: "display_name_not_contains_keyword",
	x_handle_contains_keyword: "x_handle_not_contains_keyword",
	instagram_handle_contains_keyword: "instagram_handle_not_contains_keyword",
	facebook_handle_contains_keyword: "facebook_handle_not_contains_keyword",
};

// Maps an add-dropdown `kind` to the actual stored condition type + negate
// flag (several kinds share the same underlying type).
function resolveConditionKind(kind: ConditionKind): { type: AutomationRuleCondition["type"]; negate: boolean } {
	const entry = (Object.entries(KEYWORD_NOT_KIND_BY_TYPE) as [KeywordConditionType, KeywordNotConditionKind][]).find(
		([, notKind]) => notKind === kind,
	);
	if (entry) return { type: entry[0], negate: true };
	return { type: kind as AutomationRuleCondition["type"], negate: false };
}

// Reverse of resolveConditionKind — used to look up the right label for an
// existing condition's title based on its stored type + negate flag.
function conditionKindOf(condition: AutomationRuleCondition): ConditionKind {
	if ((KEYWORD_CONDITION_TYPES as readonly string[]).includes(condition.type) && "negate" in condition && condition.negate) {
		return KEYWORD_NOT_KIND_BY_TYPE[condition.type as KeywordConditionType];
	}
	return condition.type;
}

function defaultCondition(kind: ConditionKind): AutomationRuleCondition {
	if (kind === "age_above" || kind === "age_below") return { type: kind, value: 25 };
	const { type, negate } = resolveConditionKind(kind);
	if ((KEYWORD_CONDITION_TYPES as readonly string[]).includes(type)) {
		return { type: type as KeywordConditionType, keywords: "", negate };
	}
	if ((HAS_CONDITION_TYPES as readonly string[]).includes(type)) {
		return { type: type as HasConditionType, has: false };
	}
	return { type: "profile_picture", has: false };
}



// "message_contains_keyword" needs message text, which only "new_chat" and
// "message_received" ever provide (tap events have none) — dead weight on a
// rule whose triggers no longer include either, so drop it automatically
// rather than leaving a condition that can never match.
function dropIncompatibleConditions(
	triggers: AutomationTrigger[],
	conditions: AutomationRuleCondition[],
): AutomationRuleCondition[] {
	const hasMessageTextTrigger = triggers.includes("new_chat") || triggers.includes("message_received");
	if (hasMessageTextTrigger) return conditions;
	return conditions.filter((c) => c.type !== "message_contains_keyword");
}

function defaultAction(kind: ActionKind, firstAlbum?: Album): AutomationRuleAction {
	if (kind === "send_message") return { type: "send_message", text: "" };
	if (kind === "share_album") {
		return { type: "share_album", albumId: firstAlbum ? Number(firstAlbum.albumId) : 0 };
	}
	return { type: "block" };
}

export function AutomationRuleEditor({
	isOpen,
	rule,
	isNew,
	albums,
	onSave,
	onCancel,
	onDelete,
}: {
	isOpen: boolean;
	rule: AutomationRule | null;
	isNew: boolean;
	albums: Album[];
	onSave: (rule: AutomationRule) => void;
	onCancel: () => void;
	onDelete?: () => void;
}) {
	const { t } = useTranslation();
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const [draft, setDraft] = useState<AutomationRule | null>(rule);

	useEffect(() => {
		setDraft(rule);
	}, [rule]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (isOpen) {
			if (!dialog.open) {
				try {
					dialog.showModal();
				} catch {
					dialog.show();
				}
			}
		} else if (dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const handleCancel = (event: Event) => {
			event.preventDefault();
			onCancel();
		};
		dialog.addEventListener("cancel", handleCancel);
		return () => dialog.removeEventListener("cancel", handleCancel);
	}, [onCancel]);

	const conditionLabel = (kind: ConditionKind) => t(`settings_automation.condition_${kind}`);
	const actionLabel = (kind: ActionKind) => t(`settings_automation.action_${kind}`);

	const addCondition = (kind: ConditionKind) => {
		setDraft((prev) => prev && { ...prev, conditions: [...prev.conditions, defaultCondition(kind)] });
	};

	const updateCondition = (index: number, patch: Partial<AutomationRuleCondition>) => {
		setDraft((prev) => prev && {
			...prev,
			conditions: prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } as AutomationRuleCondition : c)),
		});
	};

	const removeCondition = (index: number) => {
		setDraft((prev) => prev && { ...prev, conditions: prev.conditions.filter((_, i) => i !== index) });
	};

	const addAction = (kind: ActionKind) => {
		setDraft((prev) => prev && { ...prev, actions: [...prev.actions, defaultAction(kind, albums[0])] });
	};

	const updateAction = (index: number, patch: Partial<AutomationRuleAction>) => {
		setDraft((prev) => prev && {
			...prev,
			actions: prev.actions.map((a, i) => (i === index ? { ...a, ...patch } as AutomationRuleAction : a)),
		});
	};

	const removeAction = (index: number) => {
		setDraft((prev) => prev && { ...prev, actions: prev.actions.filter((_, i) => i !== index) });
	};

	const triggerLabel = (trigger: AutomationTrigger) => t(`settings_automation.rule_trigger_${trigger}`);

	const hasMessageTextTrigger =
		draft != null && (draft.triggers.includes("new_chat") || draft.triggers.includes("message_received"));
	const availableConditionKinds = CONDITION_KINDS.filter((kind) => {
		const { type, negate } = resolveConditionKind(kind);
		const alreadyPresent = draft?.conditions.some(
			(c) => c.type === type && !!("negate" in c ? c.negate : false) === negate,
		);
		const needsMessageText = kind === "message_contains_keyword" || kind === "message_not_contains_keyword";
		return !alreadyPresent && (!needsMessageText || hasMessageTextTrigger);
	});

	const handleSave = () => {
		if (!draft) return;
		if (!draft.name.trim()) {
			toast.error(t("settings_automation.rule_needs_name"));
			return;
		}
		if (draft.actions.length === 0) {
			toast.error(t("settings_automation.rule_needs_action"));
			return;
		}
		if (draft.actions.some((a) => a.type === "send_message" && !a.text.trim())) {
			toast.error(t("settings_automation.action_needs_message_text"));
			return;
		}
		onSave(draft);
	};

	return (
		<dialog
			ref={dialogRef}
			className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl outline-none backdrop:bg-black/45"
			onClick={(event) => {
				if (event.target === dialogRef.current) onCancel();
			}}
		>
			<AppToaster />
			{draft && <div className="grid max-h-[85dvh] grid-rows-[auto_1fr_auto]">
			<div className="border-b border-[var(--border)] p-5 pb-4">
				<div className="flex items-center justify-between gap-2">
					<p className="text-base font-semibold">{t(isNew ? "settings_automation.add_rule" : "settings_automation.edit_rule")}</p>
					<button
						type="button"
						onClick={onCancel}
						aria-label={t("settings_automation.cancel")}
						className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<input
					type="text"
					value={draft.nameKey ? t(draft.nameKey) : draft.name}
					onChange={(e) => setDraft(draft && { ...draft, name: e.target.value, nameKey: undefined })}
					placeholder={t("settings_automation.rule_name_placeholder")}
					readOnly={draft.locked}
					className={`input-field mt-3 ${draft.locked ? "cursor-not-allowed opacity-60" : ""}`}
				/>
			</div>

			<div className="min-h-0 overflow-y-auto px-5 pb-5">
				{/* TRIGGER */}
				<p className="mb-2 mt-4 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
					{t("settings_automation.trigger_label")}
				</p>
				<div className="grid grid-cols-3 gap-1.5">
					{TRIGGER_KINDS.map((trigger) => {
						const selected = draft.triggers.includes(trigger);
						return (
							<button
								key={trigger}
								type="button"
								disabled={draft.locked}
								onClick={() => {
									if (selected && draft.triggers.length <= 1) return; // keep at least one
									const nextTriggers = selected
										? draft.triggers.filter((t) => t !== trigger)
										: [...draft.triggers, trigger];
									setDraft(
										draft && {
											...draft,
											triggers: nextTriggers,
											conditions: dropIncompatibleConditions(nextTriggers, draft.conditions),
										},
									);
								}}
								className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-[11px] font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-60 ${
									selected
										? "bg-[var(--accent)] text-[var(--accent-contrast)]"
										: "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
								}`}
							>
								{trigger === "tap_received" ? (
									<Flame className="h-4 w-4" />
								) : trigger === "message_received" ? (
									<MessageSquare className="h-4 w-4" />
								) : (
									<MessageCirclePlus className="h-4 w-4" />
								)}
								<span>{triggerLabel(trigger)}</span>
							</button>
						);
					})}
				</div>

				{/* CONDITIONS */}
				<div className="mb-2 mt-5 flex items-center justify-between px-1">
					<p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
						{t("settings_automation.conditions_label")}
					</p>
					{draft.conditions.length > 1 && (
						<div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
							{(["all", "any"] as const).map((mode) => (
								<button
									key={mode}
									type="button"
									disabled={draft.locked}
									onClick={() => setDraft(draft && { ...draft, matchMode: mode })}
									className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-60 ${
										draft.matchMode === mode
											? "bg-[var(--accent)] text-[var(--accent-contrast)]"
											: "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
									}`}
								>
									{t(`settings_automation.match_mode_${mode}`)}
								</button>
							))}
						</div>
					)}
				</div>
				<div className="grid gap-2">
					{draft.conditions.map((condition, index) => {
						const removeButton = !draft.locked && (
							<button
								type="button"
								onClick={() => removeCondition(index)}
								className="mt-0.5 shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
							>
								<Trash2 className="h-4 w-4" />
							</button>
						);

						if (condition.type === "age_above" || condition.type === "age_below") {
							return (
								<div
									key={condition.type}
									className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
								>
									<div className="mt-0.5 shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
										<Calendar className="h-5 w-5" />
									</div>
									<div className="min-w-0 flex-1">
										<Slider
											label={conditionLabel(condition.type)}
											displayValue={String(condition.value)}
											activeColor="#a855f7"
											trackColor="color-mix(in srgb, var(--surface-2), black 20%)"
											min={18}
											max={99}
											defaultValue={condition.value}
											onChange={(value) => updateCondition(index, { value })}
										/>
									</div>
									{removeButton}
								</div>
							);
						}

						if (isKeywordCondition(condition)) {
							return (
								<div
									key={condition.type}
									className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
								>
									<div className="mt-0.5 shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
										{condition.type === "bio_contains_keyword" ? (
											<FileText className="h-5 w-5" />
										) : condition.type === "display_name_contains_keyword" ? (
											<User className="h-5 w-5" />
										) : condition.type === "message_contains_keyword" ? (
											<Search className="h-5 w-5" />
										) : (
											<AtSign className="h-5 w-5" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium">{conditionLabel(conditionKindOf(condition))}</p>
										<div className="mt-2 flex overflow-hidden rounded-lg border border-[var(--border)]">
											{(["custom", "forbidden"] as const).map((source, i) => {
												const selected = !!condition.useForbiddenList === (source === "forbidden");
												return (
													<button
														key={source}
														type="button"
														onClick={() => updateCondition(index, { useForbiddenList: source === "forbidden" })}
														className={`flex-1 px-2 py-1.5 text-[11px] font-semibold transition ${
															i > 0 ? "border-l border-[var(--border)]" : ""
														} ${
															selected
																? "bg-[var(--accent)] text-[var(--accent-contrast)]"
																: "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
														}`}
													>
														{t(`settings_automation.keyword_source_${source}`)}
													</button>
												);
											})}
										</div>
										{condition.useForbiddenList ? (
											<p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
												{t("settings_automation.keyword_source_forbidden_hint")}
											</p>
										) : (
											<textarea
												value={condition.keywords}
												onChange={(e) => updateCondition(index, { keywords: e.target.value })}
												placeholder={t("settings_automation.condition_keywords_placeholder")}
												className="input-field mt-2 min-h-[60px] resize-y"
											/>
										)}
									</div>
									{removeButton}
								</div>
							);
						}

						// Remaining condition types all share the `has: boolean` shape:
						// profile_picture plus the has_*_handle conditions. profile_picture
						// keeps its original translation keys; the handle conditions use a
						// `condition_<type>[_none|_has]` naming scheme instead.
						const titleKey =
							condition.type === "profile_picture" ? "condition_profile_picture" : `condition_${condition.type}`;
						const noneKey =
							condition.type === "profile_picture" ? "condition_no_profile_picture" : `condition_${condition.type}_none`;
						const hasKey =
							condition.type === "profile_picture" ? "condition_has_profile_picture" : `condition_${condition.type}_has`;
						return (
							<div
								key={condition.type}
								className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
							>
								<div className="mt-0.5 shrink-0 rounded-2xl bg-purple-500/15 p-2.5 text-purple-400">
									{condition.type === "profile_picture" ? (
										condition.has ? <ImageIcon className="h-5 w-5" /> : <ImageOff className="h-5 w-5" />
									) : (
										<AtSign className="h-5 w-5" />
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium">{t(`settings_automation.${titleKey}`)}</p>
									<select
										value={condition.has ? "has" : "none"}
										onChange={(e) => updateCondition(index, { has: e.target.value === "has" })}
										className="input-field mt-2"
									>
										<option value="none">{t(`settings_automation.${noneKey}`)}</option>
										<option value="has">{t(`settings_automation.${hasKey}`)}</option>
									</select>
								</div>
								{removeButton}
							</div>
						);
					})}

					{!draft.locked && availableConditionKinds.length > 0 && (
						<select
							value=""
							onChange={(e) => {
								if (e.target.value) addCondition(e.target.value as ConditionKind);
							}}
							className="input-field"
						>
							<option value="" disabled>
								{t("settings_automation.add_condition")}
							</option>
							{availableConditionKinds.map((kind) => (
								<option key={kind} value={kind}>
									{conditionLabel(kind)}
								</option>
							))}
						</select>
					)}
				</div>

				{/* ACTIONS */}
				<p className="mb-2 mt-5 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
					{t("settings_automation.actions_label")}
				</p>
				<div className="grid gap-2">
					{draft.actions.map((action, index) =>
						action.type === "block" ? (
							<div
								key={index}
								className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
							>
								<div className="shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
									<Ban className="h-5 w-5" />
								</div>
								<p className="min-w-0 flex-1 text-sm font-medium">{actionLabel(action.type)}</p>
								{!draft.locked && (
									<button
										type="button"
										onClick={() => removeAction(index)}
										className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}
							</div>
						) : (
							<div
								key={index}
								className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3"
							>
								<div className="mt-0.5 shrink-0 rounded-2xl bg-orange-500/15 p-2.5 text-orange-400">
									{action.type === "send_message" && <MessageSquare className="h-5 w-5" />}
									{action.type === "share_album" && <ImageIcon className="h-5 w-5" />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="text-sm font-medium">{actionLabel(action.type)}</p>
									{action.type === "send_message" && (
										<textarea
											value={action.text}
											onChange={(e) => updateAction(index, { text: e.target.value })}
											placeholder={t("settings_automation.action_send_message_placeholder")}
											className="input-field mt-2 min-h-[70px] resize-y"
										/>
									)}
									{action.type === "share_album" && (
										albums.length > 0 ? (
											<select
												value={action.albumId}
												onChange={(e) => updateAction(index, { albumId: Number(e.target.value) })}
												className="input-field mt-2"
											>
												{albums.map((album) => (
													<option key={album.albumId} value={album.albumId}>
														{album.albumName || album.albumId}
													</option>
												))}
											</select>
										) : (
											<p className="mt-1 text-xs text-[var(--text-muted)]">
												{t("settings_automation.no_albums_hint")}
											</p>
										)
									)}
								</div>
								{!draft.locked && (
									<button
										type="button"
										onClick={() => removeAction(index)}
										className="mt-0.5 shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}
							</div>
						),
					)}

					{!draft.locked && (
					<select
						value=""
						onChange={(e) => {
							if (e.target.value) addAction(e.target.value as ActionKind);
						}}
						className="input-field"
					>
						<option value="" disabled>
							{t("settings_automation.add_action")}
						</option>
						{ACTION_KINDS.map((kind) => (
							<option key={kind} value={kind}>
								{actionLabel(kind)}
							</option>
						))}
					</select>
					)}
				</div>
			</div>

			<div className="flex items-center gap-2 border-t border-[var(--border)] p-5 pt-4">
				{onDelete && (
					<button
						type="button"
						onClick={onDelete}
						className="inline-flex h-11 flex-1 basis-1/2 items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 text-sm font-medium text-red-400 transition hover:border-red-500/50 hover:bg-red-500/15 hover:text-red-300"
					>
						<Trash2 className="h-4 w-4" />
						{t("settings_automation.delete_rule")}
					</button>
				)}
				<button
					type="button"
					onClick={handleSave}
					className={`btn-accent inline-flex h-11 items-center justify-center gap-2 px-4 ${onDelete ? "flex-1 basis-1/2" : "w-full"}`}
				>
					<Plus className="h-4 w-4" />
					{t("settings_automation.save_rule")}
				</button>
			</div>
			</div>}
		</dialog>
	);
}
