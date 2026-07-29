import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Plus, Search, X } from "lucide-react";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";
import { Chip } from "../../../components/ui/chip";
import { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";
import { useManagedTagCategories } from "../../../hooks/queries/useProfileQueries";
import type { ManagedTagCategory } from "../../../types/api-functions";
import { MAX_PROFILE_TAGS, normalizeTagList, toggleProfileTagText } from "./profileEditorUtils";

const TAGS_PREVIEW_LIMIT = 7;

interface TagsPickerDialogProps {
	tagsText: string;
	onChange: (nextTagsText: string) => void;
	onClose: () => void;
}

function TagCategorySection({
	category,
	selected,
	showAll,
	onToggle,
}: {
	category: ManagedTagCategory;
	selected: string[];
	showAll: boolean;
	onToggle: (tagKey: string) => void;
}) {
	const { t } = useTranslation();
	const [expanded, setExpanded] = useState(false);

	// Selected tags go first so the >7 preview cutoff can never hide a tag
	// the user already picked.
	const orderedTags = useMemo(() => {
		const isSelected = (tagKey: string) => selected.includes(tagKey);
		return [...category.tags].sort((a, b) => Number(isSelected(b.key)) - Number(isSelected(a.key)));
	}, [category.tags, selected]);

	// Desktop has room to just show everything, and while the search box is
	// focused every tag should be browsable/selectable too — the preview
	// cutoff only makes sense for the cramped, non-searching mobile view.
	const visibleTags = expanded || showAll ? orderedTags : orderedTags.slice(0, TAGS_PREVIEW_LIMIT);
	const hiddenCount = showAll ? 0 : orderedTags.length - visibleTags.length;

	return (
		<div>
			<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
				{category.possessiveText ?? category.text}
			</p>
			{/* Blocks the search input's blur on mousedown — otherwise clicking a
			    tag that's only visible because of showAll would collapse the
			    list back to 7 before the click could land on it. */}
			<div className="flex flex-wrap gap-2.5" onMouseDown={(event) => event.preventDefault()}>
				{visibleTags.map((tag) => {
					const active = selected.includes(tag.key);
					return (
						<Chip key={tag.tagId} selected={active} onClick={() => onToggle(tag.key)}>
							{tag.text}
						</Chip>
					);
				})}
				{hiddenCount > 0 && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
					>
						<Plus className="h-3.5 w-3.5" />
						{t("profile_editor.tags_dialog.see_more", { count: hiddenCount })}
					</button>
				)}
			</div>
		</div>
	);
}

export function TagsPickerDialog({ tagsText, onChange, onClose }: TagsPickerDialogProps) {
	const { t, i18n } = useTranslation();
	const isDesktop = useDesktopBreakpoint();
	const { data: categories, isLoading } = useManagedTagCategories(i18n.language);
	const [query, setQuery] = useState("");
	const [isSearchFocused, setIsSearchFocused] = useState(false);
	const showAll = isDesktop || isSearchFocused;

	const nonEmptyCategories = useMemo(
		() => (categories ?? []).filter((category) => category.tags.length > 0),
		[categories],
	);

	const filteredCategories = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return nonEmptyCategories;
		}
		return nonEmptyCategories
			.map((category) => ({
				...category,
				tags: category.tags.filter((tag) => tag.text.toLowerCase().includes(normalizedQuery)),
			}))
			.filter((category) => category.tags.length > 0);
	}, [nonEmptyCategories, query]);

	const selected = useMemo(() => normalizeTagList(tagsText), [tagsText]);

	const handleToggle = (tagKey: string) => {
		const alreadySelected = selected.includes(tagKey);
		if (!alreadySelected && selected.length >= MAX_PROFILE_TAGS) {
			toast.error(t("profile_editor.errors.max_selection", { count: MAX_PROFILE_TAGS }));
			return;
		}
		onChange(toggleProfileTagText(tagsText, tagKey));
	};

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} panelClassName="max-h-[82dvh]">
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{t("profile_editor.tags_dialog.title")}
				</p>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>
			<div className="px-4 pb-4">
				<label className="relative block">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
					<input
						type="text"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						onFocus={() => setIsSearchFocused(true)}
						onBlur={() => setIsSearchFocused(false)}
						placeholder={t("profile_editor.tags_dialog.search_placeholder")}
						className="input-field pl-9 pr-9"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[var(--text-muted)] transition hover:text-[var(--text)]"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</label>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3" data-lenis-prevent>
				{isLoading ? (
					<p className="py-6 text-center text-sm text-[var(--text-muted)]">
						{t("profile_editor.loading")}
					</p>
				) : filteredCategories.length > 0 ? (
					<div className="grid gap-4">
						{filteredCategories.map((category) => (
							<TagCategorySection
								key={category.text}
								category={category}
								selected={selected}
								showAll={showAll}
								onToggle={handleToggle}
							/>
						))}
					</div>
				) : (
					<p className="py-6 text-center text-sm text-[var(--text-muted)]">
						{query
							? t("profile_editor.tags_dialog.no_matches")
							: t("profile_editor.tags_dialog.unavailable")}
					</p>
				)}
			</div>
		</BottomSheet>
	);
}
