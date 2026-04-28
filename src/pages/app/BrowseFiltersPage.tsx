import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RangeSlider } from "../../components/ui/range-slider";
import {
	bodyTypeLabels,
	lookingForLabels,
	type ManagedOption,
	meetAtLabels,
	nsfwLabels,
	relationshipStatusLabels,
	sexualPositionLabels,
	tribeLabels,
} from "./GridPage.types";
import {
	type BrowseFilters,
	type BrowseFiltersDraft,
	defaultBrowseFilters,
	loadBrowseFiltersDraft,
	normalizeBrowseFiltersDraft,
	saveBrowseFiltersDraft,
} from "./browse-filters-storage";

const browseFilterOptions: Array<{ key: keyof BrowseFilters; label: string }> = [
	{ key: "onlineOnly", label: "Online" },
	{ key: "hasAlbum", label: "Has album" },
	{ key: "photoOnly", label: "Photo" },
	{ key: "faceOnly", label: "Face" },
	{ key: "notRecentlyChatted", label: "No recent chat" },
	{ key: "fresh", label: "Fresh" },
	{ key: "rightNow", label: "Right now" },
	{ key: "favorites", label: "Favorites" },
	{ key: "hot", label: "Hot" },
	{ key: "shuffle", label: "Shuffle" },
];

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
	const [weightGramsMin, setWeightGramsMin] = useState(initialDraft.weightGramsMin);
	const [weightGramsMax, setWeightGramsMax] = useState(initialDraft.weightGramsMax);
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

	const buildOptionsFromLabels = (labels: Record<number, string>): ManagedOption[] =>
		Object.entries(labels)
			.map(([value, label]) => ({ value: Number(value), label }))
			.sort((a, b) => a.label.localeCompare(b.label));

	const tribeFilterOptions = useMemo(
		() => buildOptionsFromLabels(tribeLabels),
		[],
	);
	const lookingForFilterOptions = useMemo(
		() => buildOptionsFromLabels(lookingForLabels),
		[],
	);
	const relationshipFilterOptions = useMemo(
		() => buildOptionsFromLabels(relationshipStatusLabels),
		[],
	);
	const bodyTypeFilterOptions = useMemo(
		() => buildOptionsFromLabels(bodyTypeLabels),
		[],
	);
	const sexualPositionFilterOptions = useMemo(
		() => [
			{ value: -1, label: "Not specified" },
			...buildOptionsFromLabels(sexualPositionLabels),
		],
		[],
	);
	const meetAtFilterOptions = useMemo(
		() => buildOptionsFromLabels(meetAtLabels),
		[],
	);
	const nsfwFilterOptions = useMemo(
		() => buildOptionsFromLabels(nsfwLabels),
		[],
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
							<h1 className="app-title">Browse Filters</h1>
							<p className="app-subtitle">Choose who appears in your grid</p>
						</div>
					</div>
					<button
						type="button"
						onClick={applyAndReturn}
						className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
					>
						Apply
					</button>
				</header>

				<div className="surface-card space-y-4 p-4 sm:p-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Quick filters
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
							label="Age"
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
							label="Height"
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
							label="Weight"
							unit="kg"
							min={30}
							max={200}
							minDefault={weightGramsMin ? Math.round(Number(weightGramsMin) / 1000) : 30}
							maxDefault={weightGramsMax ? Math.round(Number(weightGramsMax) / 1000) : 200}
							onChange={(min, max) => {
								setWeightGramsMin(min === 30 ? "" : String(min * 1000));
								setWeightGramsMax(max === 200 ? "" : String(max * 1000));
							}}
						/>
					</div>

					{renderMultiSelectGroup(
						"Sexual position",
						sexualPositionFilterOptions,
						sexualPositions,
						(value) => toggleMultiSelect(value, setSexualPositions),
					)}
					{renderMultiSelectGroup("Tribes", tribeFilterOptions, tribes, (value) =>
						toggleMultiSelect(value, setTribes),
					)}
					{renderMultiSelectGroup(
						"Looking for",
						lookingForFilterOptions,
						lookingFor,
						(value) => toggleMultiSelect(value, setLookingFor),
					)}
					{renderMultiSelectGroup(
						"Relationship status",
						relationshipFilterOptions,
						relationshipStatuses,
						(value) => toggleMultiSelect(value, setRelationshipStatuses),
					)}
					{renderMultiSelectGroup("Body type", bodyTypeFilterOptions, bodyTypes, (value) =>
						toggleMultiSelect(value, setBodyTypes),
					)}
					{renderMultiSelectGroup("Meet at", meetAtFilterOptions, meetAt, (value) =>
						toggleMultiSelect(value, setMeetAt),
					)}
					{renderMultiSelectGroup("NSFW pics", nsfwFilterOptions, nsfwPics, (value) =>
						toggleMultiSelect(value, setNsfwPics),
					)}

					<div>
						<p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
							Tags
						</p>
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<input
								type="text"
								placeholder="Add a tag and press Enter"
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
								Add
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
							Clear all
						</button>
						<button
							type="button"
							onClick={applyAndReturn}
							className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110"
						>
							Apply
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
