import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Slider } from "../../../components/ui/range-slider";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { formatDistanceForUnits } from "../../../utils/units";
import { getSexualPositionOptions } from "../profile-option-builders";
import type { InboxFilterKey, InboxVisibilityFilter } from "../../../types/chat-page";
import type { ChatFiltersDraft } from "../chat/chatUtils";

/** One "Pinned"/"Archived"/"Hidden" row: a label plus a 3-way chip group
 * (Show all/Hide/Only) — same chip styling as the other filter sections so
 * these read as part of the same system instead of a bolted-on control. */
function VisibilityFilterRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: InboxVisibilityFilter;
	onChange: (v: InboxVisibilityFilter) => void;
}) {
	const { t } = useTranslation();
	const options: { value: InboxVisibilityFilter; label: string }[] = [
		{ value: "all", label: t("chat.filter.state_all", { defaultValue: "Show all" }) },
		{ value: "hide", label: t("chat.filter.state_hide", { defaultValue: "Hide" }) },
		{ value: "only", label: t("chat.filter.state_only", { defaultValue: "Only" }) },
	];

	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<span className="text-sm font-semibold text-[var(--text)]">{label}</span>
			<div className="flex flex-wrap gap-1.5">
				{options.map((option) => {
					const active = value === option.value;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => onChange(option.value)}
							className={`rounded-full border px-3 py-1 text-xs font-semibold transition active:scale-95 ${
								active
									? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm shadow-[var(--accent)]/30"
									: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]"
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const distanceSteps = [
	100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400,
	1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 3000, 3500,
	4000, 4500, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000,
	15000, 16000, 17000, 18000, 19000, 20000, 21000, 22000, 23000, 24000, 25000,
	30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000,
];

type Props = {
	isDesktop: boolean;
	draft: ChatFiltersDraft;
	onChangeDraft: (draft: ChatFiltersDraft) => void;
	archivedCount: number;
	hiddenCount: number;
};

export function ChatFiltersPanel({ isDesktop: _isDesktop, draft, onChangeDraft, archivedCount, hiddenCount }: Props) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();

	const inboxFilterOptions: Array<{ key: InboxFilterKey; label: string }> = [
		{ key: "unreadOnly", label: t("chat_filters.options.unread") },
		{ key: "favoritesOnly", label: t("browse_filters.options.favorites") },
		{ key: "chemistryOnly", label: t("chat_filters.options.chemistry") },
		{ key: "rightNowOnly", label: t("browse_filters.options.right_now") },
		{ key: "onlineNowOnly", label: t("browse_filters.options.online") },
	];

	const currentDistanceMeters = draft.distanceMeters === "" ? 75000 : Number(draft.distanceMeters);
	const currentDistanceIndex = distanceSteps.indexOf(currentDistanceMeters);
	const displayDistanceIndex = currentDistanceIndex === -1 ? distanceSteps.length - 1 : currentDistanceIndex;
	const distanceDisplay = formatDistanceForUnits(currentDistanceMeters, unitsPreset);

	const positionFilterOptions = useMemo(
		() => [
			{ value: -1, label: t("browse_filters.not_specified") },
			...getSexualPositionOptions(t).map((o) => ({ value: o.value, label: o.label })),
		],
		[t],
	);

	const toggle = (key: InboxFilterKey) =>
		onChangeDraft({ ...draft, [key]: !draft[key] });

	const togglePosition = (positionId: number) =>
		onChangeDraft({
			...draft,
			positions: draft.positions.includes(positionId)
				? draft.positions.filter((v) => v !== positionId)
				: [...draft.positions, positionId],
		});

	return (
		<div className="space-y-3 px-[var(--app-px)] py-4" data-lenis-prevent>
			{/* Quick filters */}
			<section
				className="rounded-2xl p-4"
				style={{ backgroundColor: "color-mix(in srgb, var(--accent), transparent 96%)", border: "1px solid color-mix(in srgb, var(--accent), transparent 88%)" }}
			>
				<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
					{t("browse_filters.quick_filters")}
				</p>
				<div className="flex flex-wrap gap-2">
					{inboxFilterOptions.map((filter) => {
						const active = draft[filter.key];
						return (
							<button
								key={filter.key}
								type="button"
								onClick={() => toggle(filter.key)}
								className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
									active
										? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm shadow-[var(--accent)]/30"
										: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]"
								}`}
							>
								{filter.label}
							</button>
						);
					})}
				</div>
			</section>

			{/* Pinned/Archived/Hidden visibility */}
			<section
				className="space-y-3 rounded-2xl p-4"
				style={{ backgroundColor: "color-mix(in srgb, var(--accent), transparent 96%)", border: "1px solid color-mix(in srgb, var(--accent), transparent 88%)" }}
			>
				<p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
					{t("chat_filters.visibility", { defaultValue: "Visibility" })}
				</p>
				<VisibilityFilterRow
					label={t("chat.pinned")}
					value={draft.pinnedFilter}
					onChange={(pinnedFilter) => onChangeDraft({ ...draft, pinnedFilter })}
				/>
				{archivedCount > 0 && (
					<VisibilityFilterRow
						label={t("chat.archived.filter_label", { defaultValue: "Archived" })}
						value={draft.archivedFilter}
						onChange={(archivedFilter) => onChangeDraft({ ...draft, archivedFilter })}
					/>
				)}
				{hiddenCount > 0 && (
					<VisibilityFilterRow
						label={t("chat.hidden.filter_label", { defaultValue: "Hidden" })}
						value={draft.hiddenFilter}
						onChange={(hiddenFilter) => onChangeDraft({ ...draft, hiddenFilter })}
					/>
				)}
			</section>

			{/* Distance slider */}
			<section
				className="rounded-2xl p-4"
				style={{ backgroundColor: "color-mix(in srgb, var(--accent), transparent 96%)", border: "1px solid color-mix(in srgb, var(--accent), transparent 88%)" }}
			>
				<Slider
					label={t("chat_filters.max_distance")}
					min={0}
					max={distanceSteps.length - 1}
					defaultValue={displayDistanceIndex}
					displayValue={distanceDisplay}
					onChange={(index) => {
						const meters = distanceSteps[index];
						onChangeDraft({
							...draft,
							distanceMeters: index === distanceSteps.length - 1 ? "" : String(meters),
						});
					}}
				/>
			</section>

			{/* Position filters */}
			<section
				className="rounded-2xl p-4"
				style={{ backgroundColor: "color-mix(in srgb, var(--accent), transparent 96%)", border: "1px solid color-mix(in srgb, var(--accent), transparent 88%)" }}
			>
				<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
					{t("profile_editor.sections.states.position")}
				</p>
				<div className="flex flex-wrap gap-2">
					{positionFilterOptions.map(({ value: positionId, label }) => {
						const active = draft.positions.includes(positionId);
						return (
							<button
								key={positionId}
								type="button"
								onClick={() => togglePosition(positionId)}
								className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition active:scale-95 ${
									active
										? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm shadow-[var(--accent)]/30"
										: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]"
								}`}
							>
								{label}
							</button>
						);
					})}
				</div>
			</section>
		</div>
	);
}
