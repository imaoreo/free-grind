import React from "react";
import { useTranslation } from "react-i18next";
import {
	AtSign,
	BadgeInfo,
	Camera,
	ImageOff,
	Ruler,
	ShieldPlus,
	Sparkles,
	Star,
	Trash2,
} from "lucide-react";
import { getThumbImageUrl } from "../../../utils/media";
import { CategoryHeader, ChipGroup, ToggleRow } from "./ProfileEditorComponents";
import { MAX_PROFILE_PHOTOS, type ProfileDraft } from "./profileEditorUtils";

type Option = { value: number; label: string };

type ToggleMultiValueKey =
	| "lookingFor"
	| "meetAt"
	| "grindrTribes"
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
	photoSlots: (string | null)[];
	profilePhotoHashes: string[];
	isSavingPhotos: boolean;
	isUploadingPhoto: boolean;
	onUploadPhoto: (event: React.ChangeEvent<HTMLInputElement>) => void;
	onSetPrimaryPhoto: (hash: string) => void;
	onRemovePhoto: (hash: string) => void;
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
	photoSlots,
	profilePhotoHashes,
	isSavingPhotos,
	isUploadingPhoto,
	onUploadPhoto,
	onSetPrimaryPhoto,
	onRemovePhoto,
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

	return (
		<div className="grid gap-5">
			{/* Pictures */}
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.pictures.title")}
					description={t("profile_editor.sections.pictures.description")}
					icon={ImageOff}
				/>
				<div className="grid gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5 sm:p-4">
						<p className="text-sm text-[var(--text-muted)]">
							{t("profile_editor.sections.pictures.usage", {
								count: profilePhotoHashes.length,
								total: MAX_PROFILE_PHOTOS,
							})}
						</p>
						<label
							htmlFor="profile-photo-upload"
							className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium transition-colors hover:border-[var(--text-muted)]"
						>
							<Camera className="h-4 w-4" />
							{isUploadingPhoto
								? t("profile_editor.sections.pictures.uploading")
								: t("profile_editor.sections.pictures.add")}
						</label>
						<input
							id="profile-photo-upload"
							type="file"
							accept="image/*"
							onChange={onUploadPhoto}
							disabled={isUploadingPhoto || isSavingPhotos}
							className="hidden"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{photoSlots.map((hash, index) => {
							const isPrimary = index === 0;
							return (
								<div
									key={`${hash ?? "empty"}-${index}`}
									className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-2"
								>
									<div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--surface)]">
										{hash ? (
											<img
												src={getThumbImageUrl(hash, "320x320")}
												alt={`Profile photo ${index + 1}`}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="flex h-full items-center justify-center text-[var(--text-muted)]">
												<ImageOff className="h-5 w-5" />
											</div>
										)}
									</div>

									<div className="mt-2 space-y-2">
										<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
											{isPrimary
												? t("profile_editor.sections.pictures.primary")
												: t("profile_editor.sections.pictures.slot", {
														index: index + 1,
													})}
										</p>

										{hash ? (
											<div className="grid gap-1.5">
												<button
													type="button"
													onClick={() => void onSetPrimaryPhoto(hash)}
													disabled={isPrimary || isSavingPhotos || isUploadingPhoto}
													className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
												>
													<Star className="h-3.5 w-3.5" />
													{t("profile_editor.sections.pictures.set_primary")}
												</button>
												<button
													type="button"
													onClick={() => void onRemovePhoto(hash)}
													disabled={isSavingPhotos || isUploadingPhoto}
													className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-50"
												>
													<Trash2 className="h-3.5 w-3.5" />
													{t("profile_editor.sections.pictures.remove")}
												</button>
											</div>
										) : (
											<label
												htmlFor="profile-photo-upload"
												className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-medium text-[var(--text-muted)]"
											>
												{t("profile_editor.sections.pictures.add")}
											</label>
										)}
									</div>
								</div>
							);
						})}
					</div>

					{isSavingPhotos ? (
						<p className="text-xs text-[var(--text-muted)]">
							{t("profile_editor.sections.pictures.saving")}
						</p>
					) : null}
					<p className="text-xs leading-relaxed text-[var(--text-muted)]">
						{t("profile_editor.sections.pictures.footer")}
					</p>
				</div>
			</div>

			{/* Profile / Basic Info */}
			<div className="surface-card rounded-3xl p-4 sm:p-5">
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

			{/* Stats / States */}
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.states.title")}
					description={t("profile_editor.sections.states.description")}
					icon={Ruler}
				/>
				<div className="grid gap-4">
					<div className="grid gap-4 md:grid-cols-2">
						<ToggleRow
							checked={draft.showAge}
							onChange={(checked) => onDraftChange("showAge", checked)}
							label={t("profile_editor.sections.states.show_age")}
							description={t("profile_editor.sections.states.show_age_desc")}
						/>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								{t("profile_editor.sections.states.age")}
							</label>
							<input
								type="number"
								inputMode="numeric"
								value={draft.age}
								onChange={(event) => onDraftChange("age", event.target.value)}
								className="input-field"
								placeholder={t("profile_editor.sections.states.age")}
							/>
						</div>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<ToggleRow
							checked={draft.showPosition}
							onChange={(checked) => onDraftChange("showPosition", checked)}
							label={t("profile_editor.sections.states.show_position")}
							description={t("profile_editor.sections.states.show_position_desc")}
						/>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								{t("profile_editor.sections.states.position")}
							</label>
							<select
								value={draft.sexualPosition}
								onChange={(event) =>
									onDraftChange("sexualPosition", event.target.value)
								}
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
						<ToggleRow
							checked={draft.showTribes}
							onChange={(checked) => onDraftChange("showTribes", checked)}
							label={t("profile_editor.sections.states.show_tribes")}
							description={t("profile_editor.sections.states.show_tribes_desc")}
						/>
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
								{t("profile_editor.sections.states.relationship_status")}
							</label>
							<select
								value={draft.relationshipStatus}
								onChange={(event) =>
									onDraftChange("relationshipStatus", event.target.value)
								}
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
					</div>

					<div>
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.sections.states.tribes")}
						</p>
						<ChipGroup
							options={tribeOptions}
							selected={draft.grindrTribes}
							onToggle={(value) => onToggleMultiValue("grindrTribes", value)}
						/>
					</div>
				</div>
			</div>

			{/* Expectations */}
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.expectations.title")}
					description={t("profile_editor.sections.expectations.description")}
					icon={Sparkles}
				/>
				<div className="grid gap-4">
					<div>
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.sections.expectations.looking_for")}
						</p>
						<ChipGroup
							options={lookingForOptions}
							selected={draft.lookingFor}
							onToggle={(value) => onToggleMultiValue("lookingFor", value)}
						/>
					</div>
					<div>
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.sections.expectations.meet_at")}
						</p>
						<ChipGroup
							options={meetAtOptions}
							selected={draft.meetAt}
							onToggle={(value) => onToggleMultiValue("meetAt", value)}
						/>
					</div>
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.identity.title")}
					description={t("profile_editor.sections.identity.description")}
					icon={BadgeInfo}
				/>
				<div className="grid gap-4">
					<div>
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.health.title")}
					description={t("profile_editor.sections.health.description")}
					icon={ShieldPlus}
				/>
				<div className="grid gap-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
							<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
							{t("profile_editor.sections.health.health_practices")}
						</p>
						<ChipGroup
							options={sexualHealthOptions}
							selected={draft.sexualHealth}
							onToggle={(value) => onToggleMultiValue("sexualHealth", value)}
						/>
					</div>
					<div>
						<p className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
			<div className="surface-card rounded-3xl p-4 sm:p-5">
				<CategoryHeader
					title={t("profile_editor.sections.social.title")}
					description={t("profile_editor.sections.social.description")}
					icon={AtSign}
				/>
				<div className="grid gap-4 md:grid-cols-3">
					<div>
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
						<label className="mb-2 block text-sm font-medium text-[var(--text-muted)]">
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
			<div className="grid gap-4">
				<div className="surface-card rounded-3xl p-4 sm:p-5">
					<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
						{t("profile_editor.sections.other.title")}
					</p>
					<div className="mt-4 grid gap-3">
						<div className="flex items-center justify-between gap-3">
							<span className="text-sm text-[var(--text-muted)]">
								{t("profile_editor.sections.other.user_id")}
							</span>
							<span className="text-sm font-semibold">
								{profileId ?? "Unknown"}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
