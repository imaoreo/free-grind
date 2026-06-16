import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	AtSign,
	BadgeInfo,
	Camera,
	Compass,
	GripVertical,
	Home,
	MapPin,
	Plus,
	Ruler,
	ShieldPlus,
	Sparkles,
	Trash2,
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
import {
	getVisitingModeTranslationKey,
	type VisitingMode,
} from "../../../types/visiting";
import { getThumbImageUrl } from "../../../utils/media";
import { CategoryHeader, ChipGroup, ToggleRow } from "./ProfileEditorComponents";
import { MAX_PROFILE_PHOTOS, type ProfileDraft } from "./profileEditorUtils";

type SortablePhotoSlotProps = {
	hash: string;
	slotIndex: number;
	isSavingPhotos: boolean;
	isUploadingPhoto: boolean;
	onRemovePhoto: (hash: string) => void;
	t: ReturnType<typeof useTranslation>["t"];
};

function SortablePhotoSlot({
	hash,
	slotIndex,
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
				className="h-full w-full object-cover"
			/>

			{/* Bottom gradient for legibility */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

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

type ToggleMultiValueKey =
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
	onDraftChange: <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => void;
	onToggleMultiValue: (key: ToggleMultiValueKey, value: number) => void;
	displayNameError: string | null;
	aboutMeError: string | null;
	tagList: string[];
	profilePhotoHashes: string[];
	isSavingPhotos: boolean;
	isUploadingPhoto: boolean;
	onUploadPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onRemovePhoto: (hash: string) => void;
	onReorderPhotos: (newHashes: string[]) => void;
	visitingMode: VisitingMode;
	isLoadingVisitingMode: boolean;
	visitingModeError: string | null;
	onVisitingModeChange: (value: VisitingMode) => void;
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
	pronounOptions: Option[];
	hivStatusOptions: Option[];
	sexualHealthOptions: Option[];
	vaccineOptions: Option[];
};

export function ProfileEditorFormSections({
	draft,
	onDraftChange,
	onToggleMultiValue,
	displayNameError,
	aboutMeError,
	tagList,
	profilePhotoHashes,
	isSavingPhotos,
	isUploadingPhoto,
	onUploadPhoto,
	onRemovePhoto,
	onReorderPhotos,
	visitingMode,
	isLoadingVisitingMode,
	visitingModeError,
	onVisitingModeChange,
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
	pronounOptions,
	hivStatusOptions,
	sexualHealthOptions,
	vaccineOptions,
}: ProfileEditorFormSectionsProps) {
	const { t } = useTranslation();
	const visitingModeDisabled = isLoadingVisitingMode || Boolean(visitingModeError);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [overId, setOverId] = useState<string | null>(null);

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

	const visitingModeOptions: Array<{
		value: VisitingMode;
		icon: typeof MapPin;
	}> = [
		{ value: "AUTO", icon: Compass },
		{ value: "OFF", icon: Home },
		{ value: "ON", icon: MapPin },
	];

	return (
		<div className="grid gap-5">
			{/* Pictures */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.pictures.title")}
					description={t("profile_editor.sections.pictures.description")}
					icon={Camera}
					action={
						<>
							{(() => {
								const uploadDisabled = isUploadingPhoto || isSavingPhotos || profilePhotoHashes.length >= MAX_PROFILE_PHOTOS;
								return (
									<label
										htmlFor={uploadDisabled ? undefined : "profile-photo-upload"}
										className={[
											"inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-medium transition-colors",
											uploadDisabled
												? "cursor-not-allowed opacity-40"
												: "cursor-pointer hover:border-[var(--text-muted)]",
										].join(" ")}
									>
										<Plus className="h-4 w-4" />
										{isUploadingPhoto
											? t("profile_editor.sections.pictures.uploading")
											: t("profile_editor.sections.pictures.add")}
										<span className="ml-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--text-muted)]">
											{profilePhotoHashes.length}/{MAX_PROFILE_PHOTOS}
										</span>
									</label>
								);
							})()}
							<input
								id="profile-photo-upload"
								type="file"
								accept="image/*"
								onChange={onUploadPhoto}
								disabled={isUploadingPhoto || isSavingPhotos || profilePhotoHashes.length >= MAX_PROFILE_PHOTOS}
								className="hidden"
							/>
						</>
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
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{profilePhotoHashes.map((hash) => (
									<SortablePhotoSlot
										key={hash}
										hash={hash}
										slotIndex={liveOrder.indexOf(hash)}
										isSavingPhotos={isSavingPhotos}
										isUploadingPhoto={isUploadingPhoto}
										onRemovePhoto={onRemovePhoto}
										t={t}
									/>
								))}
								{Array.from({ length: MAX_PROFILE_PHOTOS - profilePhotoHashes.length }).map((_, i) => (
									<label
										key={`empty-${i}`}
										htmlFor="profile-photo-upload"
										className="relative flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
									>
										<Plus className="h-6 w-6" />
										<span className="text-xs font-medium">
											{t("profile_editor.sections.pictures.add")}
										</span>
									</label>
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
						<textarea
							value={draft.aboutMe}
							maxLength={255}
							onChange={(event) => onDraftChange("aboutMe", event.target.value)}
							className="input-field min-h-32 resize-y"
							placeholder={t("profile_editor.sections.profile.about_me_placeholder")}
						/>
						<p className="mt-2 text-xs text-[var(--text-muted)] sm:text-sm">
							{aboutMeError ??
								t("profile_editor.sections.profile.char_count", {
									count: draft.aboutMe.length,
									total: 255,
								})}
						</p>
					</div>

					<div>
						<label className="mb-2 block text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_editor.sections.profile.my_tags")}
						</label>
						<input
							type="text"
							value={draft.profileTagsText}
							onChange={(event) =>
								onDraftChange("profileTagsText", event.target.value)
							}
							className="input-field"
							placeholder={t("profile_editor.sections.profile.my_tags_placeholder")}
						/>
						<div className="mt-3 flex flex-wrap gap-2.5">
							{tagList.length > 0 ? (
								tagList.map((tag) => (
									<span
										key={tag}
										className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-sm font-medium"
									>
										{tag}
									</span>
								))
							) : (
								<p className="text-sm text-[var(--text-muted)]">
									{t("profile_editor.sections.profile.no_tags_added")}
								</p>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Visiting Mode */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.visiting_mode.title")}
					description={t("profile_editor.sections.visiting_mode.description")}
					icon={MapPin}
				/>
				<div
					role="radiogroup"
					aria-label={t("profile_editor.sections.visiting_mode.title")}
					className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]"
				>
					{visitingModeOptions.map((option) => {
						const active = option.value === visitingMode;
						const Icon = option.icon;
						const modeKey = getVisitingModeTranslationKey(option.value);

						return (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={active}
								disabled={visitingModeDisabled}
								onClick={() => onVisitingModeChange(option.value)}
								className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
									active
										? "bg-[var(--accent)] text-[var(--accent-contrast)]"
										: "hover:bg-[var(--surface-2)]"
								}`}
							>
								<span
									className={`shrink-0 rounded-2xl p-2.5 ${
										active
											? "bg-[var(--surface)] text-[var(--accent)]"
											: "bg-[var(--surface-2)] text-[var(--text-muted)]"
									}`}
								>
									<Icon className="h-5 w-5" strokeWidth={2.1} />
								</span>
								<span className="min-w-0 flex-1">
									<span className="block text-sm font-semibold leading-snug">
										{t(`profile_editor.sections.visiting_mode.options.${modeKey}.label`)}
									</span>
									<span
										className={`mt-0.5 block text-xs leading-relaxed ${
											active
												? "text-[var(--accent-contrast)]/75"
												: "text-[var(--text-muted)]"
										}`}
									>
										{t(`profile_editor.sections.visiting_mode.options.${modeKey}.description`)}
									</span>
								</span>
								<span
									className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
										active
											? "border-[var(--accent-contrast)] bg-[var(--accent-contrast)]"
											: "border-[var(--border)]"
									}`}
								>
									{active && (
										<span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
									)}
								</span>
							</button>
						);
					})}
				</div>
				{isLoadingVisitingMode || visitingModeError ? (
					<p
						className={`mt-3 text-xs leading-relaxed ${
							visitingModeError ? "text-red-300" : "text-[var(--text-muted)]"
						}`}
					>
						{visitingModeError ??
							t("profile_editor.sections.visiting_mode.loading")}
					</p>
				) : null}
			</div>

			{/* Stats / States */}
			<div className="surface-card p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.states.title")}
					description={t("profile_editor.sections.states.description")}
					icon={Ruler}
				/>
				<div className="grid gap-4">
					{/* Distance — standalone toggle */}
					<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
						<ToggleRow
							checked={draft.showDistance}
							onChange={(checked) => onDraftChange("showDistance", checked)}
							label={t("profile_editor.sections.states.show_distance")}
							description={t("profile_editor.sections.states.show_distance_desc")}
						/>
					</div>

					{/* Age — input + toggle */}
					<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
						<ToggleRow
							checked={draft.showAge}
							onChange={(checked) => onDraftChange("showAge", checked)}
							label={t("profile_editor.sections.states.show_age")}
							description={t("profile_editor.sections.states.show_age_desc")}
						/>
						<div className="border-t border-[var(--border)] px-4 py-3">
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
								placeholder={t("profile_editor.sections.states.height_placeholder")}
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
								placeholder={t("profile_editor.sections.states.weight_placeholder")}
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

					{/* Position — select + toggle */}
					<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
						<ToggleRow
							checked={draft.showPosition}
							onChange={(checked) => onDraftChange("showPosition", checked)}
							label={t("profile_editor.sections.states.show_position")}
							description={t("profile_editor.sections.states.show_position_desc")}
						/>
						<div className="border-t border-[var(--border)] px-4 py-3">
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

					{/* Tribes — chips + toggle */}
					<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
						<ToggleRow
							checked={draft.showTribes}
							onChange={(checked) => onDraftChange("showTribes", checked)}
							label={t("profile_editor.sections.states.show_tribes")}
							description={t("profile_editor.sections.states.show_tribes_desc")}
						/>
						<div className="border-t border-[var(--border)] px-4 py-3">
							<p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
								{t("profile_editor.sections.states.tribes")}
							</p>
							<ChipGroup
								options={tribeOptions}
								selected={draft.grindrTribes}
								onToggle={(value) => onToggleMultiValue("grindrTribes", value)}
							/>
						</div>
						<div className="border-t border-[var(--border)] px-4 py-3">
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
							<ChipGroup
								options={genderOptions}
								selected={draft.genders}
								onToggle={(value) => onToggleMultiValue("genders", value)}
							/>
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
							<input
								type="date"
								value={draft.lastTestedDate}
								onChange={(event) =>
									onDraftChange("lastTestedDate", event.target.value)
								}
								className="input-field"
							/>
						</div>
					</div>

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
		</div>
	);
}
