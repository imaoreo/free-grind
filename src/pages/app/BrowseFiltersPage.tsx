import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RangeSlider } from "../../components/ui/range-slider";
import { type ManagedOption } from "./GridPage.types";
import {
	type BrowseFilters,
	type BrowseFiltersDraft,
	defaultBrowseFilters,
	loadBrowseFiltersDraft,
	normalizeBrowseFiltersDraft,
	saveBrowseFiltersDraft,
} from "./browse-filters-storage";

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

	const tribeFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 1, label: t("profile_editor.labels.tribes.bear") },
			{ value: 2, label: t("profile_editor.labels.tribes.clean_cut") },
			{ value: 3, label: t("profile_editor.labels.tribes.daddy") },
			{ value: 4, label: t("profile_editor.labels.tribes.discreet") },
			{ value: 5, label: t("profile_editor.labels.tribes.geek") },
			{ value: 6, label: t("profile_editor.labels.tribes.jock") },
			{ value: 7, label: t("profile_editor.labels.tribes.leather") },
			{ value: 8, label: t("profile_editor.labels.tribes.otter") },
			{ value: 9, label: t("profile_editor.labels.tribes.poz") },
			{ value: 10, label: t("profile_editor.labels.tribes.rugged") },
			{ value: 11, label: t("profile_editor.labels.tribes.sober") },
			{ value: 12, label: t("profile_editor.labels.tribes.trans") },
			{ value: 13, label: t("profile_editor.labels.tribes.twink") },
		],
		[t],
	);

	const lookingForFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 2, label: t("profile_editor.labels.looking_for.chat") },
			{ value: 3, label: t("profile_editor.labels.looking_for.dates") },
			{ value: 4, label: t("profile_editor.labels.looking_for.friends") },
			{ value: 5, label: t("profile_editor.labels.looking_for.networking") },
			{ value: 6, label: t("profile_editor.labels.looking_for.relationship") },
			{ value: 7, label: t("profile_editor.labels.looking_for.hookups") },
		],
		[t],
	);

	const relationshipFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 1, label: t("profile_editor.labels.relationship_status.single") },
			{ value: 2, label: t("profile_editor.labels.relationship_status.dating") },
			{
				value: 3,
				label: t("profile_editor.labels.relationship_status.exclusive"),
			},
			{
				value: 4,
				label: t("profile_editor.labels.relationship_status.committed"),
			},
			{
				value: 5,
				label: t("profile_editor.labels.relationship_status.partnered"),
			},
			{ value: 6, label: t("profile_editor.labels.relationship_status.engaged") },
			{ value: 7, label: t("profile_editor.labels.relationship_status.married") },
			{
				value: 8,
				label: t("profile_editor.labels.relationship_status.open_relationship"),
			},
		],
		[t],
	);

	const bodyTypeFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 1, label: t("profile_editor.labels.body_type.toned") },
			{ value: 2, label: t("profile_editor.labels.body_type.average") },
			{ value: 3, label: t("profile_editor.labels.body_type.large") },
			{ value: 4, label: t("profile_editor.labels.body_type.muscular") },
			{ value: 5, label: t("profile_editor.labels.body_type.slim") },
			{ value: 6, label: t("profile_editor.labels.body_type.stocky") },
		],
		[t],
	);

	const sexualPositionFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: -1, label: t("browse_filters.not_specified") },
			{ value: 1, label: t("profile_editor.labels.sexual_position.top") },
			{ value: 2, label: t("profile_editor.labels.sexual_position.bottom") },
			{ value: 3, label: t("profile_editor.labels.sexual_position.versatile") },
			{ value: 4, label: t("profile_editor.labels.sexual_position.vers_bottom") },
			{ value: 5, label: t("profile_editor.labels.sexual_position.vers_top") },
			{ value: 6, label: t("profile_editor.labels.sexual_position.side") },
		],
		[t],
	);

	const meetAtFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 1, label: t("profile_editor.labels.meet_at.my_place") },
			{ value: 2, label: t("profile_editor.labels.meet_at.your_place") },
			{ value: 3, label: t("profile_editor.labels.meet_at.bar") },
			{ value: 4, label: t("profile_editor.labels.meet_at.coffee_shop") },
			{ value: 5, label: t("profile_editor.labels.meet_at.restaurant") },
		],
		[t],
	);

	const nsfwFilterOptions = useMemo<ManagedOption[]>(
		() => [
			{ value: 1, label: t("profile_editor.labels.nsfw.never") },
			{ value: 2, label: t("profile_editor.labels.nsfw.not_at_first") },
			{ value: 3, label: t("profile_editor.labels.nsfw.yes_please") },
		],
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
		const normalized = tagDraft.trim();
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
							className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]"
							aria-label="Back"
						>
							<ArrowLeft className="h-4 w-4" />
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
							unit="cm"
							min={90}
							max={230}
							minDefault={heightCmMin ? Number(heightCmMin) : 90}
							maxDefault={heightCmMax ? Number(heightCmMax) : 230}
							onChange={(min, max) => {
								setHeightCmMin(min === 90 ? "" : String(min));
								setHeightCmMax(max === 230 ? "" : String(max));
							}}
						/>
						<RangeSlider
							label={t("browse_filters.weight")}
							unit="kg"
							min={30}
							max={200}
							minDefault={
								weightGramsMin ? Math.round(Number(weightGramsMin) / 1000) : 30
							}
							maxDefault={
								weightGramsMax ? Math.round(Number(weightGramsMax) / 1000) : 200
							}
							onChange={(min, max) => {
								setWeightGramsMin(min === 30 ? "" : String(min * 1000));
								setWeightGramsMax(max === 200 ? "" : String(max * 1000));
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
