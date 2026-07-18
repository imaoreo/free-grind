import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RangeSlider } from "../../components/ui/range-slider";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { usePreferences } from "../../contexts/PreferencesContext";
import { useManagedTagCategories } from "../../hooks/queries/useProfileQueries";
import { cn } from "../../utils/cn";
import { buildTagLabelMap } from "../../utils/tags";
import { type ManagedOption } from "./GridPage.types";
import type { ManagedTag } from "../../types/api-functions";
import {
	type BrowseFilters,
	type BrowseFiltersDraft,
	getDefaultBrowseFiltersDraft,
	normalizeBrowseFiltersDraft,
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

interface BrowseFiltersOverlayProps {
	initialDraft: BrowseFiltersDraft;
	onClose: () => void;
	onApply: (draft: BrowseFiltersDraft) => void;
	/** Right Now and Favorites both rely on the real location/presence, which
	 * doesn't apply to a browsed-away explore location — hide those two quick
	 * filters while explore mode is active (mirrors GridPage's own filter row). */
	isExploreActive?: boolean;
}

export function BrowseFiltersOverlay({ initialDraft, onClose, onApply, isExploreActive = false }: BrowseFiltersOverlayProps) {
	const { t, i18n } = useTranslation();
	const { unitsPreset } = usePreferences();
	const { data: managedTagCategories } = useManagedTagCategories(i18n.language);
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);

	// Mirrors GridPage's own filter row: while browsing an explore location,
	// every accent-tinted element in this sheet switches to EXPLORE_COLOR
	// (see --explore in index.css) the same way it switches for Right Now.
	const accentColor = isExploreActive ? "var(--explore)" : "var(--accent)";

	const normalized = useMemo(() => normalizeBrowseFiltersDraft(initialDraft), [initialDraft]);

	const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(normalized.browseFilters);
	const [ageMin, setAgeMin] = useState(normalized.ageMin);
	const [ageMax, setAgeMax] = useState(normalized.ageMax);
	const [heightCmMin, setHeightCmMin] = useState(normalized.heightCmMin);
	const [heightCmMax, setHeightCmMax] = useState(normalized.heightCmMax);
	const [weightGramsMin, setWeightGramsMin] = useState(normalized.weightGramsMin);
	const [weightGramsMax, setWeightGramsMax] = useState(normalized.weightGramsMax);
	const [tribes, setTribes] = useState<number[]>(normalized.tribes);
	const [lookingFor, setLookingFor] = useState<number[]>(normalized.lookingFor);
	const [relationshipStatuses, setRelationshipStatuses] = useState<number[]>(normalized.relationshipStatuses);
	const [bodyTypes, setBodyTypes] = useState<number[]>(normalized.bodyTypes);
	const [sexualPositions, setSexualPositions] = useState<number[]>(normalized.sexualPositions);
	const [meetAt, setMeetAt] = useState<number[]>(normalized.meetAt);
	const [nsfwPics, setNsfwPics] = useState<number[]>(normalized.nsfwPics);
	const [tags, setTags] = useState<string[]>(normalized.tags);
	const [tagDraft, setTagDraft] = useState("");
	const [nicknameFilter, setNicknameFilter] = useState(normalized.nicknameFilter);

	const handleClose = () => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);
		setTimeout(() => onClose(), 280);
	};

	const isImperialHeight = unitsPreset === "uk" || unitsPreset === "american";
	const isImperialWeight = unitsPreset === "american";

	const heightRange = isImperialHeight
		? { min: 35, max: 91, unit: "" }
		: { min: 90, max: 230, unit: "cm" };

	const weightRange = isImperialWeight
		? { min: 66, max: 440, unit: "lb" }
		: { min: 30, max: 200, unit: "kg" };

	const heightMinDefault = heightCmMin
		? (isImperialHeight ? Math.round(cmToInches(Number(heightCmMin))) : Number(heightCmMin))
		: heightRange.min;
	const heightMaxDefault = heightCmMax
		? (isImperialHeight ? Math.round(cmToInches(Number(heightCmMax))) : Number(heightCmMax))
		: heightRange.max;
	const weightMinDefault = weightGramsMin
		? (isImperialWeight ? Math.round(gramsToPounds(Number(weightGramsMin))) : Math.round(gramsToKg(Number(weightGramsMin))))
		: weightRange.min;
	const weightMaxDefault = weightGramsMax
		? (isImperialWeight ? Math.round(gramsToPounds(Number(weightGramsMax))) : Math.round(gramsToKg(Number(weightGramsMax))))
		: weightRange.max;

	const browseFilterOptions: Array<{ key: keyof BrowseFilters; label: string }> = useMemo(() => {
		const options: Array<{ key: keyof BrowseFilters; label: string }> = [
			{ key: "onlineOnly", label: t("browse_filters.options.online") },
			{ key: "hasAlbum", label: t("browse_filters.options.has_album") },
			{ key: "photoOnly", label: t("browse_filters.options.photo") },
			{ key: "faceOnly", label: t("browse_filters.options.face") },
			{ key: "notRecentlyChatted", label: t("browse_filters.options.no_recent_chat") },
			{ key: "fresh", label: t("browse_filters.options.fresh") },
			{ key: "rightNow", label: t("browse_filters.options.right_now") },
			{ key: "favorites", label: t("browse_filters.options.favorites") },
			{ key: "hot", label: t("browse_filters.options.hot") },
			{ key: "shuffle", label: t("browse_filters.options.shuffle") },
		];
		return isExploreActive ? options.filter((option) => option.key !== "rightNow" && option.key !== "favorites") : options;
	}, [t, isExploreActive]);

	const localFilterOptions: Array<{ key: keyof BrowseFilters; label: string }> = useMemo(() => [
		{ key: "isVisiting", label: t("browse_filters.local_filters.is_visiting") },
	], [t]);

	const tribeFilterOptions = useMemo<ManagedOption[]>(() => getTribeOptions(t), [t]);
	const lookingForFilterOptions = useMemo<ManagedOption[]>(() => getLookingForOptions(t), [t]);
	const relationshipFilterOptions = useMemo<ManagedOption[]>(() => getRelationshipStatusOptions(t), [t]);
	const bodyTypeFilterOptions = useMemo<ManagedOption[]>(() => getBodyTypeOptions(t), [t]);
	const sexualPositionFilterOptions = useMemo<ManagedOption[]>(
		() => [{ value: -1, label: t("browse_filters.not_specified") }, ...getSexualPositionOptions(t)],
		[t],
	);
	const meetAtFilterOptions = useMemo<ManagedOption[]>(() => getMeetAtOptions(t), [t]);
	const nsfwFilterOptions = useMemo<ManagedOption[]>(() => getNsfwOptions(t), [t]);

	// Flat list of every managed tag across all categories — the filter only
	// ever needs to search/add individual tags, never browse by category.
	const allManagedTags = useMemo(
		() => (managedTagCategories ?? []).flatMap((category) => category.tags),
		[managedTagCategories],
	);

	// `tags` holds whatever actually gets sent to the server: a catalog tag's
	// stable `key` (see addManagedTag), or the raw typed text for a free-typed
	// tag that isn't in the catalog (addTag) — there's no key for those.
	const tagLabelByKey = useMemo(() => buildTagLabelMap(allManagedTags), [allManagedTags]);
	const tagLabel = (value: string) => tagLabelByKey.get(value) ?? value;

	const tagSearchResults = useMemo(() => {
		const query = tagDraft.trim().toLowerCase();
		if (!query) return [];
		return allManagedTags
			.filter((tag) => tag.text.toLowerCase().includes(query) && !tags.includes(tag.key))
			.slice(0, 8);
	}, [tagDraft, allManagedTags, tags]);

	const toggleBrowseFilter = (key: keyof BrowseFilters) => {
		setBrowseFilters((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	const toggleMultiSelect = (value: number, setter: React.Dispatch<React.SetStateAction<number[]>>) => {
		setter((prev) => prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]);
	};

	const addTag = (value: string = tagDraft) => {
		const norm = value.trim().toLowerCase();
		if (!norm) return;
		setTags((prev) => prev.includes(norm) ? prev : [...prev, norm]);
		setTagDraft("");
	};

	const addManagedTag = (tag: ManagedTag) => {
		setTags((prev) => (prev.includes(tag.key) ? prev : [...prev, tag.key]));
		setTagDraft("");
	};

	const clearAll = () => {
		const cleared = { ...getDefaultBrowseFiltersDraft(), sortBy: normalized.sortBy };
		onApply(cleared);
		handleClose();
	};

	const handleApply = () => {
		onApply({
			sortBy: normalized.sortBy,
			browseFilters,
			ageMin, ageMax,
			heightCmMin, heightCmMax,
			weightGramsMin, weightGramsMax,
			tribes, lookingFor, relationshipStatuses,
			bodyTypes, sexualPositions, meetAt,
			nsfwPics, tags,
			nicknameFilter,
		});
		handleClose();
	};

	const renderSection = (
		title: string,
		options: ManagedOption[],
		selectedValues: number[],
		onToggle: (value: number) => void,
	) => (
		<section
			className="rounded-2xl p-4"
			style={{
				backgroundColor: `color-mix(in srgb, ${accentColor}, transparent 96%)`,
				border: `1px solid color-mix(in srgb, ${accentColor}, transparent 88%)`,
			}}
		>
			<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
				{title}
			</p>
			<div className="flex flex-wrap gap-2">
				{options.map((option) => {
					const isSelected = selectedValues.includes(option.value);
					return (
						<button
							key={`${title}-${option.value}`}
							type="button"
							onClick={() => onToggle(option.value)}
							className={cn(
								"rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all active:scale-95",
								isSelected
									? isExploreActive
										? "border-[var(--explore)] bg-[var(--explore)] text-white shadow-sm"
										: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
									: isExploreActive
										? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--explore)]/60 hover:text-[var(--text)]"
										: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]",
							)}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</section>
	);

	const renderToggleSection = (
		title: string,
		options: Array<{ key: keyof BrowseFilters; label: string }>,
	) => (
		<section
			className="rounded-2xl p-4"
			style={{
				backgroundColor: `color-mix(in srgb, ${accentColor}, transparent 96%)`,
				border: `1px solid color-mix(in srgb, ${accentColor}, transparent 88%)`,
			}}
		>
			<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
				{title}
			</p>
			<div className="flex flex-wrap gap-2">
				{options.map((filter) => {
					const active = browseFilters[filter.key];
					return (
						<button
							key={filter.key}
							type="button"
							onClick={() => toggleBrowseFilter(filter.key)}
							className={cn(
								"rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all active:scale-95",
								active
									? isExploreActive
										? "border-[var(--explore)] bg-[var(--explore)] text-white shadow-sm"
										: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
									: isExploreActive
										? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--explore)]/60 hover:text-[var(--text)]"
										: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]",
							)}
						>
							{filter.label}
						</button>
					);
				})}
			</div>
		</section>
	);

	return (
		<div className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${isClosing ? "pointer-events-none" : ""}`}>
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
				onClick={handleClose}
			/>

			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${
					isClosing ? "animate-modal-top-out" : "animate-modal-top-in"
				} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				<header className="relative shrink-0 overflow-hidden px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color={accentColor} />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text)]">
								<SlidersHorizontal className="h-5 w-5" />
							</div>
							<h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
								{t("browse_filters.title")}
							</h2>
						</div>
						<button
							type="button"
							onClick={handleClose}
							className="shrink-0 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
							aria-label="Close"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</header>

				<div className="shrink-0 border-b border-[var(--border)]" />

				<div className="relative z-10 flex-1 overflow-y-auto px-[var(--app-px)]">
					<div className="space-y-3 py-4">
						{renderToggleSection(t("browse_filters.quick_filters"), browseFilterOptions)}

						<section
							className="rounded-2xl p-4"
							style={{
								backgroundColor: `color-mix(in srgb, ${accentColor}, transparent 96%)`,
								border: `1px solid color-mix(in srgb, ${accentColor}, transparent 88%)`,
							}}
						>
							<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
								{t("browse_filters.age")} / {t("browse_filters.height")} / {t("browse_filters.weight")}
							</p>
							<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
								<RangeSlider
									label={t("browse_filters.age")}
									min={18}
									max={99}
									minDefault={ageMin ? Number(ageMin) : 18}
									maxDefault={ageMax ? Number(ageMax) : 99}
									activeColor={accentColor}
									showSeparator={true}
									onChange={(min, max) => {
										setAgeMin(min === 18 ? "" : String(min));
										setAgeMax(max === 99 ? "" : String(max));
									}}
								/>
								<RangeSlider
									label={t("browse_filters.height")}
									unit={heightRange.unit}
									formatValue={isImperialHeight ? formatInchesAsFeetInches : undefined}
									min={heightRange.min}
									max={heightRange.max}
									minDefault={heightMinDefault}
									maxDefault={heightMaxDefault}
									activeColor={accentColor}
									showSeparator={true}
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
									activeColor={accentColor}
									showSeparator={true}
									onChange={(min, max) => {
										const minGrams = isImperialWeight ? Math.round(poundsToGrams(min)) : Math.round(kgToGrams(min));
										const maxGrams = isImperialWeight ? Math.round(poundsToGrams(max)) : Math.round(kgToGrams(max));
										setWeightGramsMin(min === weightRange.min ? "" : String(minGrams));
										setWeightGramsMax(max === weightRange.max ? "" : String(maxGrams));
									}}
								/>
							</div>
						</section>

						{renderSection(
							t("profile_editor.sections.states.position"),
							sexualPositionFilterOptions,
							sexualPositions,
							(value) => toggleMultiSelect(value, setSexualPositions),
						)}
						{renderSection(
							t("profile_editor.sections.states.tribes"),
							tribeFilterOptions,
							tribes,
							(value) => toggleMultiSelect(value, setTribes),
						)}
						{renderSection(
							t("profile_editor.sections.expectations.looking_for"),
							lookingForFilterOptions,
							lookingFor,
							(value) => toggleMultiSelect(value, setLookingFor),
						)}
						{renderSection(
							t("profile_editor.sections.states.relationship_status"),
							relationshipFilterOptions,
							relationshipStatuses,
							(value) => toggleMultiSelect(value, setRelationshipStatuses),
						)}
						{renderSection(
							t("profile_editor.sections.states.body_type"),
							bodyTypeFilterOptions,
							bodyTypes,
							(value) => toggleMultiSelect(value, setBodyTypes),
						)}
						{renderSection(
							t("profile_editor.sections.expectations.meet_at"),
							meetAtFilterOptions,
							meetAt,
							(value) => toggleMultiSelect(value, setMeetAt),
						)}
						{renderSection(
							t("profile_editor.sections.expectations.accept_nsfw"),
							nsfwFilterOptions,
							nsfwPics,
							(value) => toggleMultiSelect(value, setNsfwPics),
						)}

						<section
							className="rounded-2xl p-4"
							style={{
								backgroundColor: `color-mix(in srgb, ${accentColor}, transparent 96%)`,
								border: `1px solid color-mix(in srgb, ${accentColor}, transparent 88%)`,
							}}
						>
							<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
								{t("browse_filters.tags")}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<input
									type="text"
									placeholder={t("browse_filters.tags_placeholder")}
									value={tagDraft}
									onChange={(e) => setTagDraft(e.target.value)}
									onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
									className="h-9 min-w-40 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)]"
								/>
								<button
									type="button"
									onClick={() => addTag()}
									className={cn(
										"h-9 rounded-lg border border-[var(--border)] px-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]",
										isExploreActive ? "hover:border-[var(--explore)]" : "hover:border-[var(--accent)]",
									)}
								>
									{t("browse_filters.add")}
								</button>
							</div>
							{tagSearchResults.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-2">
									{tagSearchResults.map((tag) => (
										<button
											key={tag.tagId}
											type="button"
											onClick={() => addManagedTag(tag)}
											className={cn(
												"rounded-full border bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text)] transition",
												isExploreActive
													? "border-[var(--explore)]/60 hover:bg-[var(--explore)] hover:text-white"
													: "border-[var(--accent)]/60 hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]",
											)}
										>
											+ {tag.text}
										</button>
									))}
								</div>
							)}
							{tags.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-2">
									{tags.map((tag) => (
										<button
											key={tag}
											type="button"
											onClick={() => setTags((prev) => prev.filter((t) => t !== tag))}
											className={cn(
												"rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition",
												isExploreActive
													? "border-[var(--explore)] bg-[var(--explore)] text-white"
													: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]",
											)}
										>
											{tagLabel(tag)} <span className="ml-1">×</span>
										</button>
									))}
								</div>
							)}
						</section>

						<section
							className="rounded-2xl p-4"
							style={{
								backgroundColor: `color-mix(in srgb, ${accentColor}, transparent 96%)`,
								border: `1px solid color-mix(in srgb, ${accentColor}, transparent 88%)`,
							}}
						>
							<p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">
								{t("browse_filters.local_filters.title")}
							</p>
							<div className="flex flex-wrap gap-2">
								{localFilterOptions.map((filter) => {
									const active = browseFilters[filter.key];
									return (
										<button
											key={filter.key}
											type="button"
											onClick={() => toggleBrowseFilter(filter.key)}
											className={cn(
												"rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all active:scale-95",
												active
													? isExploreActive
														? "border-[var(--explore)] bg-[var(--explore)] text-white shadow-sm"
														: "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm"
													: isExploreActive
														? "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--explore)]/60 hover:text-[var(--text)]"
														: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/60 hover:text-[var(--text)]",
											)}
										>
											{filter.label}
										</button>
									);
								})}
							</div>
							<div className="relative mt-2">
								<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
								<input
									type="text"
									value={nicknameFilter}
									onChange={(e) => setNicknameFilter(e.target.value)}
									placeholder={t("browse_filters.local_filters.nickname_placeholder")}
									className={cn(
										"h-9 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-8 pr-8 text-sm text-[var(--text)] outline-none transition",
										isExploreActive ? "focus:border-[var(--explore)]" : "focus:border-[var(--accent)]",
									)}
								/>
								{nicknameFilter && (
									<button
										type="button"
										onClick={() => setNicknameFilter("")}
										className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
						</section>
					</div>
				</div>

				<div
					className="relative z-10 shrink-0 border-t border-[var(--border)] px-[var(--app-px)] pt-3 flex gap-2"
					style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
				>
					<button
						type="button"
						onClick={clearAll}
						className={cn(
							"flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]",
							isExploreActive ? "hover:border-[var(--explore)]" : "hover:border-[var(--accent)]",
						)}
					>
						{t("browse_filters.clear_all")}
					</button>
					<button
						type="button"
						onClick={handleApply}
						className={cn(
							"relative flex-1 overflow-hidden rounded-xl py-3 text-sm font-bold transition group",
							isExploreActive ? "bg-[var(--explore)] text-white" : "bg-[var(--accent)] text-[var(--accent-contrast)]",
						)}
					>
						<span className="relative z-10">{t("browse_filters.apply")}</span>
						<div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
					</button>
				</div>
			</div>
		</div>
	);
}
