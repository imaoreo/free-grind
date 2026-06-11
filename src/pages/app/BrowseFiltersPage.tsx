import { ChevronLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RangeSlider } from "../../components/ui/range-slider";
import { usePreferences } from "../../contexts/PreferencesContext";
import { type ManagedOption } from "./GridPage.types";
import {
	type BrowseFilters,
	type BrowseFiltersDraft,
	defaultBrowseFilters,
	loadBrowseFiltersDraft,
	normalizeBrowseFiltersDraft,
	saveBrowseFiltersDraft,
} from "./browse-filters-storage";
import {
	getBodyTypeOptions,
	getLookingForOptions,
	getMeetAtOptions,
	getNsfwOptions,
	getRelationshipStatusOptions,
	getSexualPositionOptions,
	getTribeOptions,
} from "./profile-option-builders";
import {
	cmToInches,
	gramsToKg,
	gramsToPounds,
	inchesToCm,
	kgToGrams,
	poundsToGrams,
} from "../../utils/units";

function formatInchesAsFeetInches(totalInches: number): string {
	const safe = Math.max(0, Math.round(totalInches));
	const feet = Math.floor(safe / 12);
	const inches = safe % 12;
	return `${feet}ft ${inches}in`;
}

function parseDraftFromLocationState(state: unknown): BrowseFiltersDraft {
	const persisted = loadBrowseFiltersDraft();
	const safe =
		typeof state === "object" && state !== null
			? (state as {
					browseFiltersDraft?: Partial<BrowseFiltersDraft>;
			  })
			: {};
	const draft = safe.browseFiltersDraft ?? {};

	return normalizeBrowseFiltersDraft({
		browseFilters: {
			...persisted.browseFilters,
			...(draft.browseFilters ?? {}),
		},
		ageMin: typeof draft.ageMin === "string" ? draft.ageMin : persisted.ageMin,
		ageMax: typeof draft.ageMax === "string" ? draft.ageMax : persisted.ageMax,
		heightCmMin:
			typeof draft.heightCmMin === "string"
				? draft.heightCmMin
				: persisted.heightCmMin,
		heightCmMax:
			typeof draft.heightCmMax === "string"
				? draft.heightCmMax
				: persisted.heightCmMax,
		weightGramsMin:
			typeof draft.weightGramsMin === "string"
				? draft.weightGramsMin
				: persisted.weightGramsMin,
		weightGramsMax:
			typeof draft.weightGramsMax === "string"
				? draft.weightGramsMax
				: persisted.weightGramsMax,
		tribes: Array.isArray(draft.tribes) ? draft.tribes : persisted.tribes,
		lookingFor: Array.isArray(draft.lookingFor)
			? draft.lookingFor
			: persisted.lookingFor,
		relationshipStatuses: Array.isArray(draft.relationshipStatuses)
			? draft.relationshipStatuses
			: persisted.relationshipStatuses,
		bodyTypes: Array.isArray(draft.bodyTypes)
			? draft.bodyTypes
			: persisted.bodyTypes,
		sexualPositions: Array.isArray(draft.sexualPositions)
			? draft.sexualPositions
			: persisted.sexualPositions,
		meetAt: Array.isArray(draft.meetAt) ? draft.meetAt : persisted.meetAt,
		nsfwPics: Array.isArray(draft.nsfwPics)
			? draft.nsfwPics
			: persisted.nsfwPics,
		tags: Array.isArray(draft.tags) ? draft.tags : persisted.tags,
	});
}

export function BrowseFiltersPage() {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const navigate = useNavigate();
	const location = useLocation();
	const initialDraft = useMemo(
		() => parseDraftFromLocationState(location.state),
		[location.state],
	);

	const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(
		initialDraft.browseFilters,
	);
	const [ageMin, setAgeMin] = useState(initialDraft.ageMin);
	const [ageMax, setAgeMax] = useState(initialDraft.ageMax);
	const [heightCmMin, setHeightCmMin] = useState(initialDraft.heightCmMin);
	const [heightCmMax, setHeightCmMax] = useState(initialDraft.heightCmMax);
	const [weightGramsMin, setWeightGramsMin] = useState(
		initialDraft.weightGramsMin,
	);
	const [weightGramsMax, setWeightGramsMax] = useState(
		initialDraft.weightGramsMax,
	);
	const [tribes, setTribes] = useState<number[]>(initialDraft.tribes);
	const [lookingFor, setLookingFor] = useState<number[]>(initialDraft.lookingFor);
	const [relationshipStatuses, setRelationshipStatuses] = useState<number[]>(
		initialDraft.relationshipStatuses,
	);
	const [bodyTypes, setBodyTypes] = useState<number[]>(initialDraft.bodyTypes);
	const [sexualPositions, setSexualPositions] = useState<number[]>(
		initialDraft.sexualPositions,
	);
	const [meetAt, setMeetAt] = useState<number[]>(initialDraft.meetAt);
	const [nsfwPics, setNsfwPics] = useState<number[]>(initialDraft.nsfwPics);
	const [tags, setTags] = useState<string[]>(initialDraft.tags);
	const [tagDraft, setTagDraft] = useState("");

	const isImperialHeight = unitsPreset === "uk" || unitsPreset === "american";
	const isImperialWeight = unitsPreset === "american";

	const heightRange = isImperialHeight
		? { min: 35, max: 91, unit: "" }
		: { min: 90, max: 230, unit: "cm" };

	const weightRange = isImperialWeight
		? { min: 66, max: 440, unit: "lb" }
		: { min: 30, max: 200, unit: "kg" };

	const heightMinDefault = heightCmMin
		? (isImperialHeight
			? Math.round(cmToInches(Number(heightCmMin)))
			: Number(heightCmMin))
		: heightRange.min;
	const heightMaxDefault = heightCmMax
		? (isImperialHeight
			? Math.round(cmToInches(Number(heightCmMax)))
			: Number(heightCmMax))
		: heightRange.max;

	const weightMinDefault = weightGramsMin
		? (isImperialWeight
			? Math.round(gramsToPounds(Number(weightGramsMin)))
			: Math.round(gramsToKg(Number(weightGramsMin))))
		: weightRange.min;
	const weightMaxDefault = weightGramsMax
		? (isImperialWeight
			? Math.round(gramsToPounds(Number(weightGramsMax)))
			: Math.round(gramsToKg(Number(weightGramsMax))))
		: weightRange.max;

	const browseFilterOptions: Array<{ key: keyof BrowseFilters; label: string }> =
		useMemo(
			() => [
				{ key: "onlineOnly", label: t("browse_filters.options.online") },
				{ key: "hasAlbum", label: t("browse_filters.options.has_album") },
				{ key: "photoOnly", label: t("browse_filters.options.photo") },
				{ key: "faceOnly", label: t("browse_filters.options.face") },
				{ key: "notRecentlyChatted", label: t("browse_filters.options.no_recent_chat"), },
				{ key: "fresh", label: t("browse_filters.options.fresh") },
				{ key: "rightNow", label: t("browse_filters.options.right_now") },
				{ key: "favorites", label: t("browse_filters.options.favorites") },
				{ key: "hot", label: t("browse_filters.options.hot") },
				{ key: "shuffle", label: t("browse_filters.options.shuffle") },
			],
			[t],
		);

	const localFilterOptions: Array<{ key: keyof BrowseFilters; label: string }> =
		useMemo(
			() => [
				{ key: "isVisiting", label: t("browse_filters.local_filters.is_visiting") },
			],
			[t],
		);

	const tribeFilterOptions = useMemo<ManagedOption[]>(
		() => getTribeOptions(t),
		[t],
	);

	const lookingForFilterOptions = useMemo<ManagedOption[]>(
		() => getLookingForOptions(t),
		[t],
	);

	const relationshipFilterOptions = useMemo<ManagedOption[]>(
		() => getRelationshipStatusOptions(t),
		[t],
	);

	const bodyTypeFilterOptions = useMemo<ManagedOption[]>(
		() => getBodyTypeOptions(t),
		[t],
	);

	const sexualPositionFilterOptions = useMemo<ManagedOption[]>(
		() => [{ value: -1, label: t("browse_filters.not_specified") }, ...getSexualPositionOptions(t)],
		[t],
	);

	const meetAtFilterOptions = useMemo<ManagedOption[]>(
		() => getMeetAtOptions(t),
		[t],
	);

	const nsfwFilterOptions = useMemo<ManagedOption[]>(
		() => getNsfwOptions(t),
		[t],
	);

	const toggleBrowseFilter = (key: keyof BrowseFilters) => {
		setBrowseFilters((previous) => ({
			...previous,
			[key]: !previous[key],
		}));
	};

	const toggleMultiSelect = (
		value: number,
		setter: React.Dispatch<React.SetStateAction<number[]>>,
	) => {
		setter((previous) =>
			previous.includes(value)
				? previous.filter((item) => item !== value)
				: [...previous, value],
		);
	};

	const addTag = () => {
		const normalized = tagDraft.trim().toLowerCase();
		if (!normalized) {
			return;
		}

		setTags((previous) =>
			previous.includes(normalized) ? previous : [...previous, normalized],
		);
		setTagDraft("");
	};

	const removeTag = (value: string) => {
		setTags((previous) => previous.filter((item) => item !== value));
	};

	const clearBrowseFilters = () => {
		setBrowseFilters(defaultBrowseFilters);
		setAgeMin("");
		setAgeMax("");
		setHeightCmMin("");
		setHeightCmMax("");
		setWeightGramsMin("");
		setWeightGramsMax("");
		setTribes([]);
		setLookingFor([]);
		setRelationshipStatuses([]);
		setBodyTypes([]);
		setSexualPositions([]);
		setMeetAt([]);
		setNsfwPics([]);
		setTags([]);
		setTagDraft("");
	};

	const applyAndReturn = () => {
		saveBrowseFiltersDraft({
			sortBy: initialDraft.sortBy,
			browseFilters,
			ageMin,
			ageMax,
			heightCmMin,
			heightCmMax,
			weightGramsMin,
			weightGramsMax,
			tribes,
			lookingFor,
			relationshipStatuses,
			bodyTypes,
			sexualPositions,
			meetAt,
			nsfwPics,
			tags,
		});

		navigate("/", {
			state: {
				browseFiltersDraft: {
					sortBy: initialDraft.sortBy,
					browseFilters,
					ageMin,
					ageMax,
					heightCmMin,
					heightCmMax,
					weightGramsMin,
					weightGramsMax,
					tribes,
					lookingFor,
					relationshipStatuses,
					bodyTypes,
					sexualPositions,
					meetAt,
					nsfwPics,
					tags,
				},
			},
		});
	};

	const renderMultiSelectGroup = (
		title: string,
		options: ManagedOption[],
		selectedValues: number[],
		onToggle: (value: number) => void,
	) => (
		<div>
			<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
				{title}
			</p>
			<div className="mt-2 flex flex-wrap gap-2">
				{options.map((option) => {
					const isSelected = selectedValues.includes(option.value);
					return (
						<button
							key={`${title}-${option.value}`}
							type="button"
							onClick={() => onToggle(option.value)}
							className={`rounded-full border px-3 py-1 font-medium transition ${
								isSelected
									? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
									: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-4 flex items-center justify-between gap-3">
					<div className="inline-flex items-center gap-2">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
							aria-label="Back"
						>
							<ChevronLeft className="h-4 w-4" />
						</button>
						<div>
							<h1 className="app-title">{t("browse_filters.title")}</h1>
							<p className="app-subtitle">{t("browse_filters.subtitle")}</p>
						</div>
					</div>
					<button
						type="button"
						onClick={applyAndReturn}
						className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						{t("browse_filters.apply")}
					</button>
				</header>

				<div className="surface-card space-y-4 p-4 sm:p-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t("browse_filters.quick_filters")}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{browseFilterOptions.map((filter) => {
								const active = browseFilters[filter.key];
								return (
									<button
										key={filter.key}
										type="button"
										onClick={() => toggleBrowseFilter(filter.key)}
										className={`rounded-full border px-3 py-1 font-medium transition ${
											active
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										{filter.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
						<RangeSlider
							label={t("browse_filters.age")}
							min={18}
							max={99}
							minDefault={ageMin ? Number(ageMin) : 18}
							maxDefault={ageMax ? Number(ageMax) : 99}
							onChange={(min, max) => {
								setAgeMin(min === 18 ? "" : String(min));
								setAgeMax(max === 99 ? "" : String(max));
							}}
						/>
						<RangeSlider
							label={t("browse_filters.height")}
							unit={heightRange.unit}
							formatValue={
								isImperialHeight ? formatInchesAsFeetInches : undefined
							}
							min={heightRange.min}
							max={heightRange.max}
							minDefault={heightMinDefault}
							maxDefault={heightMaxDefault}
							onChange={(min, max) => {
								const minCm = isImperialHeight ? Math.round(inchesToCm(min)) : min;
								const maxCm = isImperialHeight ? Math.round(inchesToCm(max)) : max;
								setHeightCmMin(min === heightRange.min ? "" : String(minCm));
								setHeightCmMax(max === heightRange.max ? "" : String(maxCm));
							}}
						/>
						<RangeSlider
							label={t("browse_filters.weight")}
							unit={weightRange.unit}
							min={weightRange.min}
							max={weightRange.max}
							minDefault={weightMinDefault}
							maxDefault={weightMaxDefault}
							onChange={(min, max) => {
								const minGrams = isImperialWeight
									? Math.round(poundsToGrams(min))
									: Math.round(kgToGrams(min));
								const maxGrams = isImperialWeight
									? Math.round(poundsToGrams(max))
									: Math.round(kgToGrams(max));
								setWeightGramsMin(min === weightRange.min ? "" : String(minGrams));
								setWeightGramsMax(max === weightRange.max ? "" : String(maxGrams));
							}}
						/>
					</div>

					{renderMultiSelectGroup(
						t("profile_editor.sections.states.position"),
						sexualPositionFilterOptions,
						sexualPositions,
						(value) => toggleMultiSelect(value, setSexualPositions),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.states.tribes"),
						tribeFilterOptions,
						tribes,
						(value) => toggleMultiSelect(value, setTribes),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.expectations.looking_for"),
						lookingForFilterOptions,
						lookingFor,
						(value) => toggleMultiSelect(value, setLookingFor),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.states.relationship_status"),
						relationshipFilterOptions,
						relationshipStatuses,
						(value) => toggleMultiSelect(value, setRelationshipStatuses),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.states.body_type"),
						bodyTypeFilterOptions,
						bodyTypes,
						(value) => toggleMultiSelect(value, setBodyTypes),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.expectations.meet_at"),
						meetAtFilterOptions,
						meetAt,
						(value) => toggleMultiSelect(value, setMeetAt),
					)}
					{renderMultiSelectGroup(
						t("profile_editor.sections.expectations.accept_nsfw"),
						nsfwFilterOptions,
						nsfwPics,
						(value) => toggleMultiSelect(value, setNsfwPics),
					)}

					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t("browse_filters.tags")}
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<input
								type="text"
								placeholder={t("browse_filters.tags_placeholder")}
								value={tagDraft}
								onChange={(event) => setTagDraft(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addTag();
									}
								}}
								className="h-9 min-w-56 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
							/>
							<button
								type="button"
								onClick={addTag}
								className="h-9 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							>
								{t("browse_filters.add")}
							</button>
						</div>
						{tags.length > 0 ? (
							<div className="mt-2 flex flex-wrap gap-2">
								{tags.map((tag) => (
									<button
										key={tag}
										type="button"
										onClick={() => removeTag(tag)}
										className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										{tag} <span className="ml-1">×</span>
									</button>
								))}
							</div>
						) : null}
					</div>

					<div className="border-t border-[var(--border)] pt-4">
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							{t("browse_filters.local_filters.title")}
						</p>
						<p className="mt-1 text-[10px] text-[var(--text-muted)]">
							{t("browse_filters.local_filters.description")}
						</p>
						<div className="mt-2 flex flex-wrap gap-2">
							{localFilterOptions.map((filter) => {
								const active = browseFilters[filter.key];
								return (
									<button
										key={filter.key}
										type="button"
										onClick={() => toggleBrowseFilter(filter.key)}
										className={`rounded-full border px-3 py-1 font-medium transition ${
											active
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
												: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
										}`}
									>
										{filter.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
						<button
							type="button"
							onClick={clearBrowseFilters}
							className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
						>
							{t("browse_filters.clear_all")}
						</button>
						<button
							type="button"
							onClick={applyAndReturn}
							className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
						>
							{t("browse_filters.apply")}
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
