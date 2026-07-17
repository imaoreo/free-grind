import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AlertTriangle,
	AtSign,
	BadgeInfo,
	Camera,
	Clock,
	GripVertical,
	Plus,
	Ruler,
	ShieldPlus,
	Sparkles,
	Tag,
	Trash2,
	Users,
	X,
} from "lucide-react";
import {
	DndContext,
	PointerSensor,
	TouchSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type DragOverEvent,
	type DragStartEvent,
} from "@dnd-kit/core";
import {
	SortableContext,
	arrayMove,
	rectSortingStrategy,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { usePreferences } from "../../../contexts/PreferencesContext";
import { getThumbImageUrl } from "../../../utils/media";
import { type UnitsPreset } from "../../../utils/units";
import { Chip } from "../../../components/ui/chip";
import { LastTestedMonthPicker } from "../../../components/LastTestedMonthPicker";
import { CategoryHeader, ChipGroup, ToggleRow } from "./ProfileEditorComponents";
import { TravelPlansSection } from "./TravelPlansSection";
import { TagsPickerDialog } from "./TagsPickerDialog";
import { ManagedOptionsPickerDialog } from "./ManagedOptionsPickerDialog";
import {
	MAX_GENDERS,
	MAX_PROFILE_PHOTOS,
	MEDIA_MODERATION_STATE,
	toggleProfileTagText,
	type ProfileDraft,
} from "./profileEditorUtils";

export type PhotoModeration = { state: number | null; reason: string | null };

type SortablePhotoSlotProps = {
	hash: string;
	slotIndex: number;
	moderation?: PhotoModeration;
	isSavingPhotos: boolean;
	isUploadingPhoto: boolean;
	onRemovePhoto: (hash: string) => void;
	t: ReturnType<typeof useTranslation>["t"];
};

function SortablePhotoSlot({
	hash,
	slotIndex,
	moderation,
	isSavingPhotos,
	isUploadingPhoto,
	onRemovePhoto,
	t,
}: SortablePhotoSlotProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: hash });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	const isPrimary = slotIndex === 0;
	const isPending = moderation?.state === MEDIA_MODERATION_STATE.PENDING;
	const isRejected = moderation?.state === MEDIA_MODERATION_STATE.REJECTED;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={[
				"relative aspect-square overflow-hidden rounded-2xl bg-[var(--surface-2)]",
				isDragging ? "opacity-40" : "",
			].join(" ")}
		>
			<img
				src={getThumbImageUrl(hash, "320x320")}
				alt={`Profile photo ${slotIndex + 1}`}
				className={`h-full w-full object-cover ${isRejected ? "opacity-50 grayscale" : ""}`}
			/>

			{/* Bottom gradient for legibility */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

			{/* Moderation state badge */}
			{(isPending || isRejected) && (
				<div className="absolute left-2 top-2">
					<span
						title={moderation?.reason ?? undefined}
						className={[
							"inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm",
							isRejected ? "bg-red-500/90" : "bg-amber-500/90",
						].join(" ")}
					>
						{isRejected ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
						{isRejected
							? t("profile_editor.sections.pictures.rejected")
							: t("profile_editor.sections.pictures.pending_moderation")}
					</span>
				</div>
			)}

			{/* Primary badge / slot number */}
			<div className="absolute bottom-2 left-2">
				{isPrimary ? (
					<span className="rounded-md bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
						{t("profile_editor.sections.pictures.primary")}
					</span>
				) : (
					<span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white/80">
						#{slotIndex + 1}
					</span>
				)}
			</div>

			{/* Drag handle */}
			{!isSavingPhotos && !isUploadingPhoto && (
				<div
					{...attributes}
					{...listeners}
					className="absolute right-2 top-2 cursor-grab touch-none rounded-lg bg-black/40 p-1.5 text-white backdrop-blur-sm active:cursor-grabbing"
				>
					<GripVertical className="h-3.5 w-3.5" />
				</div>
			)}

			{/* Delete button */}
			<button
				type="button"
				onClick={() => void onRemovePhoto(hash)}
				disabled={isSavingPhotos || isUploadingPhoto}
				className="absolute bottom-2 right-2 rounded-lg bg-black/40 p-1.5 text-white/80 backdrop-blur-sm transition-colors hover:bg-red-500/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

type Option = { value: number; label: string };

export type ToggleMultiValueKey =
	| "lookingFor"
	| "meetAt"
	| "grindrTribes"
	| "tribesImInto"
	| "genders"
	| "pronouns"
	| "sexualHealth"
	| "vaccines";

type ProfileEditorFormSectionsProps = {
	draft: ProfileDraft;
	unitsPreset: UnitsPreset;
	onDraftChange: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
	onToggleMultiValue: (key: ToggleMultiValueKey, value: number) => void;
	displayNameError: string | null;
	aboutMeError: string | null;
	tagsError: string | null;
	tagList: string[];
	tagLabelByKey: Map<string, string>;
	profilePhotoHashes: string[];
	photoModerationByHash?: Map<string, PhotoModeration>;
	isSavingPhotos: boolean;
	isUploadingPhoto: boolean;
	isDesktop: boolean;
	onOpenPhotoDrawer: () => void;
	onRemovePhoto: (hash: string) => void;
	onReorderPhotos: (newHashes: string[]) => void;
	profileId?: string | number | null;
	ethnicityOptions: Option[];
	bodyTypeOptions: Option[];
	positionOptions: Option[];
	relationshipStatusOptions: Option[];
	tribeOptions: Option[];
	lookingForOptions: Option[];
	meetAtOptions: Option[];
	nsfwOptions: Option[];
	genderOptions: Option[];
	defaultGenderIds: number[];
	pronounOptions: Option[];
	hivStatusOptions: Option[];
	sexualHealthOptions: Option[];
	vaccineOptions: Option[];
};

export function ProfileEditorFormSections({
	draft,
	unitsPreset,
	onDraftChange,
	onToggleMultiValue,
	displayNameError,
	aboutMeError,
	tagsError,
	tagList,
	tagLabelByKey,
	profilePhotoHashes,
	photoModerationByHash,
	isSavingPhotos,
	isUploadingPhoto,
	isDesktop,
	onOpenPhotoDrawer,
	onRemovePhoto,
	onReorderPhotos,
	profileId,
	ethnicityOptions,
	bodyTypeOptions,
	positionOptions,
	relationshipStatusOptions,
	tribeOptions,
	lookingForOptions,
	meetAtOptions,
	nsfwOptions,
	genderOptions,
	defaultGenderIds,
	pronounOptions,
	hivStatusOptions,
	sexualHealthOptions,
	vaccineOptions,
}: ProfileEditorFormSectionsProps) {
	const { t } = useTranslation();
	const { testReminderDisabled, setPreferences } = usePreferences();
	const isImperialHeight = unitsPreset === "uk" || unitsPreset === "american";
	const isImperialWeight = unitsPreset === "american";
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);
	const [isTagsDialogOpen, setIsTagsDialogOpen] = useState(false);
	const [isGenderDialogOpen, setIsGenderDialogOpen] = useState(false);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
	);

	const liveOrder = useMemo(() => {
		if (!activeId || !overId || activeId === overId) return profilePhotoHashes;
		const from = profilePhotoHashes.indexOf(activeId);
		const to = profilePhotoHashes.indexOf(overId);
		if (from === -1 || to === -1) return profilePhotoHashes;
		return arrayMove(profilePhotoHashes, from, to);
	}, [activeId, overId, profilePhotoHashes]);

	const handleDndDragStart = ({ active }: DragStartEvent) => {
		setActiveId(String(active.id));
	};

	const handleDndDragOver = ({ over }: DragOverEvent) => {
		setOverId(over ? String(over.id) : null);
	};

	const handleDndDragEnd = ({ active, over }: DragEndEvent) => {
		setActiveId(null);
		setOverId(null);
		if (!over || active.id === over.id) return;
		const from = profilePhotoHashes.indexOf(String(active.id));
		const to = profilePhotoHashes.indexOf(String(over.id));
		if (from === -1 || to === -1) return;
		onReorderPhotos(arrayMove(profilePhotoHashes, from, to));
	};

	const TEST_REMINDER_THRESHOLD_MONTHS = 3;

	const monthsSinceLastTested = useMemo(() => {
		if (!draft.lastTestedDate) return null;
		const timestamp = new Date(draft.lastTestedDate).getTime();
		if (Number.isNaN(timestamp)) return null;
		return (Date.now() - timestamp) / (1000 * 60 * 60 * 24 * 30.44);
	}, [draft.lastTestedDate]);

	const isTestOverdue =
		monthsSinceLastTested != null && monthsSinceLastTested >= TEST_REMINDER_THRESHOLD_MONTHS;

	return (
		<div className="grid gap-5">
			{/* Pictures */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.pictures.title")}
					description={t("profile_editor.sections.pictures.description")}
					icon={Camera}
					action={
						(() => {
							const uploadDisabled = isUploadingPhoto || isSavingPhotos || profilePhotoHashes.length >= MAX_PROFILE_PHOTOS;
							return (
								<button
									type="button"
									onClick={onOpenPhotoDrawer}
									disabled={uploadDisabled}
									className={[
										"inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium transition-colors",
										uploadDisabled
											? "cursor-not-allowed opacity-40"
											: "cursor-pointer hover:border-[var(--text-muted)]",
									].join(" ")}
								>
									{isUploadingPhoto
										? t("profile_editor.sections.pictures.uploading")
										: t("profile_editor.sections.pictures.add")}
									<span className="ml-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
										{profilePhotoHashes.length}/{MAX_PROFILE_PHOTOS}
									</span>
								</button>
							);
						})()
					}
				/>
				<div className="grid gap-4">
					<DndContext
						sensors={sensors}
						onDragStart={handleDndDragStart}
						onDragOver={handleDndDragOver}
						onDragEnd={handleDndDragEnd}
						onDragCancel={() => { setActiveId(null); setOverId(null); }}
					>
						<SortableContext items={profilePhotoHashes} strategy={rectSortingStrategy}>
							<div className={`grid gap-3 ${isDesktop ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-3"}`}>
								{profilePhotoHashes.map((hash) => (
									<SortablePhotoSlot
										key={hash}
										hash={hash}
										slotIndex={liveOrder.indexOf(hash)}
										moderation={photoModerationByHash?.get(hash)}
										isSavingPhotos={isSavingPhotos}
										isUploadingPhoto={isUploadingPhoto}
										onRemovePhoto={onRemovePhoto}
										t={t}
									/>
								))}
								{Array.from({ length: MAX_PROFILE_PHOTOS - profilePhotoHashes.length }).map((_, i) => (
									<button
										key={`empty-${i}`}
										type="button"
										onClick={onOpenPhotoDrawer}
										className="relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
									>
										<Plus className="h-6 w-6" />
										<span className="text-xs font-medium">
											{t("profile_editor.sections.pictures.add")}
										</span>
									</button>
								))}
							</div>
						</SortableContext>
					</DndContext>

					{isSavingPhotos ? (
						<p className="text-xs text-[var(--text-muted)]">
							{t("profile_editor.sections.pictures.saving")}
						</p>
					) : null}
				</div>
			</div>

			{/* Profile / Basic Info */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.profile.title")}
					description={t("profile_editor.sections.profile.description")}
					icon={Sparkles}
				/>
				<div className="grid gap-5">
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_editor.sections.profile.display_name")}
						</label>
						<input
							type="text"
							maxLength={15}
							value={draft.displayName}
							onChange={(event) => onDraftChange("displayName", event.target.value)}
							className="input-field"
							placeholder={t("profile_editor.sections.profile.display_name_placeholder")}
						/>
						<p className="mt-2 text-xs text-[var(--text-muted)] sm:text-sm">
							{displayNameError ??
								t("profile_editor.sections.profile.char_count", {
									count: draft.displayName.trim().length || 0,
									total: 15,
								})}
						</p>
					</div>

					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_editor.sections.profile.about_me")}
						</label>
						<div className="relative">
							<textarea
								value={draft.aboutMe}
								maxLength={255}
								onChange={(event) => onDraftChange("aboutMe", event.target.value)}
								className="input-field min-h-32 resize-y pb-6"
								placeholder={t("profile_editor.sections.profile.about_me_placeholder")}
							/>
							<div className="pointer-events-none absolute bottom-2.5 right-3 text-[10px] font-medium text-[var(--text-muted)] opacity-70">
								{t("profile_editor.sections.profile.char_count", {
									count: draft.aboutMe.length,
									total: 255,
								})}
							</div>
						</div>
						{aboutMeError && (
							<p className="mt-2 text-xs text-red-400 sm:text-sm">{aboutMeError}</p>
						)}
					</div>

					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_editor.sections.profile.my_tags")}
						</label>
						{tagsError && (
							<p className="mb-2 text-xs text-red-400 sm:text-sm">{tagsError}</p>
						)}
						<div className="flex flex-wrap gap-2.5">
							{tagList.length > 0 ? (
								<>
									{tagList.map((tag) => (
										<button
											key={tag}
											type="button"
											onClick={() =>
												onDraftChange(
													"profileTagsText",
													toggleProfileTagText(draft.profileTagsText, tag),
												)
											}
											className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium transition-colors hover:border-[var(--accent)]"
										>
											{tagLabelByKey.get(tag) ?? tag}
											<X className="h-3 w-3 text-[var(--text-muted)] transition-colors group-hover:text-[var(--text)]" />
										</button>
									))}
									<button
										type="button"
										onClick={() => setIsTagsDialogOpen(true)}
										className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
									>
										<Tag className="h-3.5 w-3.5" />
										{t("profile_editor.sections.profile.my_tags_manage")}
									</button>
								</>
							) : (
								<button
									type="button"
									onClick={() => setIsTagsDialogOpen(true)}
									className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3 py-1 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									<Plus className="h-3.5 w-3.5" />
									{t("profile_editor.sections.profile.no_tags_added")}
								</button>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Stats / States */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.states.title")}
					description={t("profile_editor.sections.states.description")}
					icon={Ruler}
				/>
				<div className="grid gap-4">
					{/* Distance — standalone toggle, plain row like the fields below */}
					<ToggleRow
						checked={draft.showDistance}
						onChange={(checked) => onDraftChange("showDistance", checked)}
						label={t("profile_editor.sections.states.show_distance")}
						description={t("profile_editor.sections.states.show_distance_desc")}
						labelClassName="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
						padding=""
					/>

					{/* Age toggle + field — separate plain rows, no shared box */}
					<ToggleRow
						checked={draft.showAge}
						onChange={(checked) => onDraftChange("showAge", checked)}
						label={t("profile_editor.sections.states.show_age")}
						description={t("profile_editor.sections.states.show_age_desc")}
						labelClassName="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
						padding=""
					/>
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.states.age")}
						</label>
						<input
							type="number"
							inputMode="numeric"
							value={draft.age}
							onChange={(event) => onDraftChange("age", event.target.value)}
							className="input-field"
							placeholder="—"
						/>
					</div>

					{/* Height + Weight */}
					<div className="grid grid-cols-2 gap-2 sm:gap-3">
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.height")}
							</label>
							<input
								type="number"
								inputMode="numeric"
								value={draft.height}
								onChange={(event) => onDraftChange("height", event.target.value)}
								className="input-field"
								placeholder={t(
									isImperialHeight
										? "profile_editor.sections.states.height_placeholder_in"
										: "profile_editor.sections.states.height_placeholder",
								)}
							/>
						</div>
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.weight")}
							</label>
							<input
								type="number"
								inputMode="numeric"
								value={draft.weight}
								onChange={(event) => onDraftChange("weight", event.target.value)}
								className="input-field"
								placeholder={t(
									isImperialWeight
										? "profile_editor.sections.states.weight_placeholder_lb"
										: "profile_editor.sections.states.weight_placeholder",
								)}
							/>
						</div>
					</div>

					{/* Ethnicity + Body Type */}
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.ethnicity")}
							</label>
							<select
								value={draft.ethnicity}
								onChange={(event) => onDraftChange("ethnicity", event.target.value)}
								className="input-field"
							>
								<option value="">{t("profile_editor.sections.states.not_set")}</option>
								{ethnicityOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.body_type")}
							</label>
							<select
								value={draft.bodyType}
								onChange={(event) => onDraftChange("bodyType", event.target.value)}
								className="input-field"
							>
								<option value="">{t("profile_editor.sections.states.not_set")}</option>
								{bodyTypeOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Relationship Status */}
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.states.relationship_status")}
						</label>
						<select
							value={draft.relationshipStatus}
							onChange={(event) => onDraftChange("relationshipStatus", event.target.value)}
							className="input-field"
						>
							<option value="">{t("profile_editor.sections.states.not_set")}</option>
							{relationshipStatusOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					{/* Role/Position — separated from the stats above by a thin divider, not its own box */}
					<div className="grid gap-4 border-t border-[var(--border)] pt-4">
						<ToggleRow
							checked={draft.showPosition}
							onChange={(checked) => onDraftChange("showPosition", checked)}
							label={t("profile_editor.sections.states.show_position")}
							description={t("profile_editor.sections.states.show_position_desc")}
							labelClassName="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
							padding=""
						/>
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.position")}
							</label>
							<select
								value={draft.sexualPosition}
								onChange={(event) => onDraftChange("sexualPosition", event.target.value)}
								className="input-field"
							>
								<option value="">{t("profile_editor.sections.states.not_set")}</option>
								{positionOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					</div>

					{/* Tribes — separated by a thin divider, not its own box */}
					<div className="grid gap-4 border-t border-[var(--border)] pt-4">
						<ToggleRow
							checked={draft.showTribes}
							onChange={(checked) => onDraftChange("showTribes", checked)}
							label={t("profile_editor.sections.states.show_tribes")}
							description={t("profile_editor.sections.states.show_tribes_desc")}
							labelClassName="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
							padding=""
						/>
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.tribes")}
							</p>
							<ChipGroup
								options={tribeOptions}
								selected={draft.grindrTribes}
								onToggle={(value) => onToggleMultiValue("grindrTribes", value)}
							/>
						</div>
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.tribes_im_into")}
							</p>
							<ChipGroup
								options={tribeOptions}
								selected={draft.tribesImInto}
								onToggle={(value) => onToggleMultiValue("tribesImInto", value)}
							/>
						</div>
					</div>
				</div>
			</div>

			<TravelPlansSection profileId={profileId} />

			{/* Expectations */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.expectations.title")}
					description={t("profile_editor.sections.expectations.description")}
					icon={Sparkles}
				/>
				<div className="grid gap-4">
					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.expectations.looking_for")}
						</p>
						<ChipGroup
							options={lookingForOptions}
							selected={draft.lookingFor}
							onToggle={(value) => onToggleMultiValue("lookingFor", value)}
						/>
					</div>
					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.expectations.meet_at")}
						</p>
						<ChipGroup
							options={meetAtOptions}
							selected={draft.meetAt}
							onToggle={(value) => onToggleMultiValue("meetAt", value)}
						/>
					</div>
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.expectations.accept_nsfw")}
						</label>
						<select
							value={draft.nsfw}
							onChange={(event) => onDraftChange("nsfw", event.target.value)}
							className="input-field"
						>
							<option value="">{t("profile_editor.sections.states.not_set")}</option>
							{nsfwOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>
				</div>
			</div>

			{/* Identity */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.identity.title")}
					description={t("profile_editor.sections.identity.description")}
					icon={BadgeInfo}
				/>
				<div className="grid gap-4">
					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.identity.gender")}
						</p>
						{genderOptions.length > 0 ? (
							<div className="flex flex-wrap gap-2.5">
								{[
									...defaultGenderIds,
									...draft.genders.filter((value) => !defaultGenderIds.includes(value)),
								].map((value) => {
									const option = genderOptions.find((item) => item.value === value);
									if (!option) return null;
									const active = draft.genders.includes(value);
									return (
										<Chip
											key={value}
											selected={active}
											onClick={() => onToggleMultiValue("genders", value)}
										>
											{option.label}
										</Chip>
									);
								})}
								<button
									type="button"
									onClick={() => setIsGenderDialogOpen(true)}
									className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border)] px-3.5 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
								>
									<Users className="h-3.5 w-3.5" />
									{t("profile_editor.sections.identity.gender_more")}
								</button>
							</div>
						) : (
							<p className="text-sm text-[var(--text-muted)]">
								{t("profile_editor.sections.identity.gender_unavailable")}
							</p>
						)}
					</div>
					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.identity.pronouns")}
						</p>
						{pronounOptions.length > 0 ? (
							<ChipGroup
								options={pronounOptions}
								selected={draft.pronouns}
								onToggle={(value) => onToggleMultiValue("pronouns", value)}
							/>
						) : (
							<p className="text-sm text-[var(--text-muted)]">
								{t("profile_editor.sections.identity.pronouns_unavailable")}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Health */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.health.title")}
					description={t("profile_editor.sections.health.description")}
					icon={ShieldPlus}
				/>
				<div className="grid gap-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.health.hiv_status")}
							</label>
							<select
								value={draft.hivStatus}
								onChange={(event) => onDraftChange("hivStatus", event.target.value)}
								className="input-field"
							>
								<option value="">{t("profile_editor.sections.states.not_set")}</option>
								{hivStatusOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.health.last_tested")}
							</label>
							<LastTestedMonthPicker
								value={draft.lastTestedDate}
								onChange={(next) => onDraftChange("lastTestedDate", next)}
								notSetLabel={t("profile_editor.sections.states.not_set")}
							/>
						</div>
					</div>

					{isTestOverdue && (
						<div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-3">
							<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
							<p className="text-xs leading-relaxed text-amber-400 sm:text-sm">
								{t("profile_editor.sections.health.test_reminder")}
							</p>
						</div>
					)}

					<ToggleRow
						checked={!testReminderDisabled}
						onChange={(checked) => void setPreferences({ testReminderDisabled: !checked })}
						label={t("profile_editor.sections.health.test_reminder_toggle")}
						description={t("profile_editor.sections.health.test_reminder_toggle_desc")}
						labelClassName="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
						padding=""
					/>

					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.health.health_practices")}
						</p>
						<ChipGroup
							options={sexualHealthOptions}
							selected={draft.sexualHealth}
							onToggle={(value) => onToggleMultiValue("sexualHealth", value)}
						/>
					</div>
					<div>
						<p className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.health.vaccinations")}
						</p>
						<ChipGroup
							options={vaccineOptions}
							selected={draft.vaccines}
							onToggle={(value) => onToggleMultiValue("vaccines", value)}
						/>
					</div>
				</div>
			</div>

			{/* Social */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.social.title")}
					description={t("profile_editor.sections.social.description")}
					icon={AtSign}
				/>
				<div className="grid gap-4 md:grid-cols-3">
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.social.instagram")}
						</label>
						<input
							type="text"
							value={draft.instagram}
							onChange={(event) => onDraftChange("instagram", event.target.value)}
							className="input-field"
							placeholder={t("profile_editor.sections.social.placeholder")}
						/>
					</div>
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.social.twitter")}
						</label>
						<input
							type="text"
							value={draft.twitter}
							onChange={(event) => onDraftChange("twitter", event.target.value)}
							className="input-field"
							placeholder={t("profile_editor.sections.social.placeholder")}
						/>
					</div>
					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
							{t("profile_editor.sections.social.facebook")}
						</label>
						<input
							type="text"
							value={draft.facebook}
							onChange={(event) => onDraftChange("facebook", event.target.value)}
							className="input-field"
							placeholder={t("profile_editor.sections.social.placeholder")}
						/>
					</div>
				</div>
			</div>

			{/* Other / Account Info */}
			<div>
				<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
					{t("profile_editor.sections.other.title")}
				</p>
				<div className="surface-card overflow-hidden">
					<div className="flex items-center justify-between px-4 py-3.5">
						<span className="text-sm text-[var(--text-muted)]">
							{t("profile_editor.sections.other.user_id")}
						</span>
						<span className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1 font-mono text-sm font-semibold">
							{profileId ?? "—"}
						</span>
					</div>
				</div>
			</div>

			{isTagsDialogOpen && (
				<TagsPickerDialog
					tagsText={draft.profileTagsText}
					onChange={(next) => onDraftChange("profileTagsText", next)}
					onClose={() => setIsTagsDialogOpen(false)}
				/>
			)}

			{isGenderDialogOpen && (
				<ManagedOptionsPickerDialog
					title={t("profile_editor.sections.identity.gender_dialog_title")}
					searchPlaceholder={t("profile_editor.sections.identity.gender_search_placeholder")}
					noMatchesLabel={t("profile_editor.sections.identity.gender_no_matches")}
					options={genderOptions}
					selected={draft.genders}
					max={MAX_GENDERS}
					maxMessage={t("profile_editor.errors.max_selection", { count: MAX_GENDERS })}
					onToggle={(value) => onToggleMultiValue("genders", value)}
					onClose={() => setIsGenderDialogOpen(false)}
				/>
			)}
		</div>
	);
}
