import { Loader2, MessageCircle, MessagesSquare, Compass, Navigation, NavigationOff, Star, Ban, FileText, Trash2 } from "lucide-react";
import { type RefObject, type UIEvent, useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import type { ProfileDetail } from "../../GridPage.types";
import {
	formatDistance,
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	formatTimeAgo,
	formatWeightKg,
	shouldHideField,
	getOnlineStatusMeta,
} from "../utils";
import { getProfileImageUrl, getThumbImageUrl } from "../../../../utils/media";
import { ProfileImage } from "../../../../components/ui/profile-image";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import { TapSelector } from "./TapSelector";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";
import { formatRelativeTime, formatLongRelativeTime } from "../../../../utils/relativeTime";
import { usePreferences } from "../../../../contexts/PreferencesContext";

type LabelMap = Record<number, string>;

type ProfileDetailsContentProps = {
	activeProfile: ProfileDetail;
	activeProfilePhotoHashes: string[];
	isDesktopLike: boolean;
	showMobileCarousel: boolean;
	mobileCarouselRef: RefObject<HTMLDivElement | null>;
	mobileCarouselPhotoIndex: number;
	handleMobileCarouselScroll: (event: UIEvent<HTMLDivElement>) => void;
	openPhotoViewer: (index: number) => void;
	photoCreatedAtByHash: Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }>;
	activeProfileName: string;
	estimatedCreatedAt: string;
	profileStatusLabel: string;
	profileDistance: number | null;
	chatContactStatus: ChatContactIndexRecord | null;
	messageProfileId: string | null;
	usesFreegrind: boolean;
	onMessageProfile?: (profileId: string) => void;
	onTapProfile?: (profileId: string, tapId?: number) => void;
	onToggleFavoriteProfile?: (
		profileId: string,
		currentlyFavorite: boolean,
	) => void | Promise<void>;
	isFavorite: boolean;
	isTogglingFavorite: boolean;
	isTapDisabled: boolean;
	isTapBlocked: boolean;
	isTapActive: boolean;
	tapId: number;
	tapButtonClassName: string;
	onTriangleProfile?: (profileId: string) => void;
	isTriangleDisabled: boolean;
	triangleButtonClassName: string;
	isLocatingProfile: boolean;
	hasTagsContent: boolean;
	hasAboutContent: boolean;
	hasExpectationsFields: boolean;
	hasHealthFields: boolean;
	hasStatsFields: boolean;
	hasSocialFields: boolean;
	formattedActiveGenders: string;
	formattedActivePronouns: string;
	lookingForLabels: LabelMap;
	meetAtLabels: LabelMap;
	tribeLabels: LabelMap;
	hivStatusLabels: LabelMap;
	sexualHealthLabels: LabelMap;
	vaccineLabels: LabelMap;
	sexualPositionLabels: LabelMap;
	bodyTypeLabels: LabelMap;
	ethnicityLabels: LabelMap;
	relationshipStatusLabels: LabelMap;
	onBlockProfile?: (profileId: string) => void;
	onUnblockProfile?: (profileId: string) => void;
	isBlocked?: boolean;
	isBlockingProfile?: boolean;
	activeNote?: string;
	onSaveNote?: (notes: string) => void | Promise<void>;
	onDeleteNote?: () => void | Promise<void>;
};

export function ProfileDetailsContent({
	activeProfile,
	activeProfilePhotoHashes,
	isDesktopLike,
	showMobileCarousel,
	mobileCarouselRef,
	mobileCarouselPhotoIndex,
	handleMobileCarouselScroll,
	openPhotoViewer,
	photoCreatedAtByHash,
	activeProfileName,
	estimatedCreatedAt,
	profileDistance,
	chatContactStatus,
	messageProfileId,
	usesFreegrind,

	onTriangleProfile,
	isTriangleDisabled,
	isLocatingProfile,
	hasTagsContent,
	hasAboutContent,
	hasExpectationsFields,
	hasHealthFields,
	hasStatsFields,
	hasSocialFields,
	formattedActiveGenders,
	formattedActivePronouns,
	lookingForLabels,
	meetAtLabels,
	tribeLabels,
	hivStatusLabels,
	sexualHealthLabels,
	vaccineLabels,
	sexualPositionLabels,
	bodyTypeLabels,
	ethnicityLabels,
	relationshipStatusLabels,
	onMessageProfile,
	onTapProfile,
	isTapDisabled,
	isTapBlocked,
	isTapActive,
	tapId,
	onToggleFavoriteProfile,
	isFavorite,
	isTogglingFavorite,
	onBlockProfile,
	onUnblockProfile,
	isBlocked = false,
	isBlockingProfile = false,
	activeNote,
	onSaveNote,
	onDeleteNote,
}: ProfileDetailsContentProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const hasChatHistory = Boolean(chatContactStatus?.hasChatted) || (chatContactStatus?.unreadCount ?? 0) > 0;
	const lastMessageLabel = formatRelativeTime(chatContactStatus?.lastMessageTimestamp ?? null);

	const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
	const [noteText, setNoteText] = useState(activeNote || "");
	const [isSavingNote, setIsSavingNote] = useState(false);
	const notesDialogRef = useRef<HTMLDialogElement | null>(null);

	useEffect(() => {
		if (isNotesModalOpen) {
			setNoteText(activeNote || "");
		}
	}, [isNotesModalOpen, activeNote]);

	useEffect(() => {
		const dialog = notesDialogRef.current;
		if (!dialog) return;

		if (isNotesModalOpen) {
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
	}, [isNotesModalOpen]);

	const handleSaveNote = async () => {
		if (!onSaveNote) return;
		setIsSavingNote(true);
		try {
			await onSaveNote(noteText.trim());
			toast.success(t("favorites.note_saved", "Note saved successfully"));
			setIsNotesModalOpen(false);
		} catch (err) {
			toast.error(t("favorites.save_note_failed", "Failed to save note"));
		} finally {
			setIsSavingNote(false);
		}
	};

	const handleDeleteNote = async () => {
		if (!onDeleteNote) return;
		setIsSavingNote(true);
		try {
			await onDeleteNote();
			toast.success(t("favorites.note_deleted", "Note deleted successfully"));
			setIsNotesModalOpen(false);
		} catch (err) {
			toast.error(t("favorites.delete_note_failed", "Failed to delete note"));
		} finally {
			setIsSavingNote(false);
		}
	};



	const hasLastOnline = typeof activeProfile.seen === "number" && Number.isFinite(activeProfile.seen);
	const hasOnlineUntil = typeof activeProfile.onlineUntil === "number" && Number.isFinite(activeProfile.onlineUntil);
	const referenceTimestamp = hasLastOnline
		? (activeProfile.seen as number)
		: hasOnlineUntil
			? (activeProfile.onlineUntil as number)
			: null;

	const meta = getOnlineStatusMeta(activeProfile.seen, activeProfile.onlineUntil);

	let statusColorClass = "bg-red-500";
	let statusText = "";

	if (meta.isOnline) {
		statusColorClass = "bg-green-500";
		statusText = t(meta.labelKey, { count: meta.count });
	} else if (referenceTimestamp !== null) {
		const diffMs = Math.max(0, Date.now() - referenceTimestamp);
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 60) {
			statusColorClass = "bg-yellow-500";
			statusText = `${t("browse_page.status_online")} ${formatLongRelativeTime(referenceTimestamp)}`;
		} else {
			statusColorClass = "bg-red-500";
			statusText = meta.labelKey === "browse_page.status_offline"
				? t(meta.labelKey)
				: `${t("browse_page.status_online")} ${formatLongRelativeTime(referenceTimestamp)}`;
		}
	} else {
		statusColorClass = "bg-red-500";
		statusText = t("browse_page.status_offline");
	}

	const triggerLocate = () => {
		if (messageProfileId && onTriangleProfile && !isTriangleDisabled && !isLocatingProfile) {
			onTriangleProfile(messageProfileId);
		}
	};

	const copyUserId = async () => {
		try {
			const { default: copy } = await import("copy-to-clipboard");
			copy(activeProfile.profileId);
			toast.success(t("profile_details.user_id_copied", { defaultValue: "User ID copied!" }), { id: "user-id-copy" });
			if (navigator.vibrate) {
				navigator.vibrate(50);
			}
		} catch (err) {
			console.error("Failed to copy user ID", err);
		}
	};

	const renderPhotoCreatedBadge = (hash: string) => {
		const meta = photoCreatedAtByHash[hash] ?? null;
		if (!meta?.takenOnGrindr) return null;
		return (
			<div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
				<img
					src={freegrindLogo}
					alt={t("chat.thread.taken_on_grindr")}
					className="h-3.5 w-3.5 rounded-full"
				/>
				<span>{t("chat.thread.taken_on_grindr")}</span>
			</div>
		);
	};







	return (
		<div className="grid gap-6">
			<div>
				{activeProfilePhotoHashes.length > 0 ? (
					<>
						{showMobileCarousel && !isDesktopLike ? (
							<>
								{/* Mobile Carousel View: We use negative margins (-mx and -mt) to break out of the parent padding
								   and achieve a seamless edge-to-edge look that flushes with the header and screen sides. */}
								<div className="relative sm:hidden -mx-[var(--app-px)]">
									<div
										ref={mobileCarouselRef}
										onScroll={handleMobileCarouselScroll}
										/* Edge-to-edge look: Only border-b is used to avoid a double-border effect with the sticky header's border.
										   Rounded corners are removed to ensure the images touch the screen edges perfectly. */
										className="flex snap-x snap-mandatory overflow-x-auto border-b border-[var(--border)]"
									>
										{activeProfilePhotoHashes.map((hash, index) => (
											<div
												key={hash}
												className="relative h-[min(64dvh,calc(100vw*1.33))] w-full shrink-0 snap-center snap-always overflow-hidden"
											>
												<button
													type="button"
													onClick={() => openPhotoViewer(index)}
													className="absolute inset-0 z-10"
													aria-label={t("profile_details.open_photo", { index: index + 1 })}
												/>
												<img
													/* Using ProfileImageUrl with 1024x1024 for the carousel to ensure high-quality visuals
													   on high-density mobile screens, as thumbnails (320x320) appear blurry here. */
													src={getProfileImageUrl(hash, "1024x1024")}
													alt={t("profile_details.photo_alt", { name: activeProfileName })}
													className="h-full w-full object-cover"
												/>
												{renderPhotoCreatedBadge(hash)}
											</div>
										))}
									</div>

									{activeProfilePhotoHashes.length > 1 ? (
										<div className="mt-2 flex items-center justify-center gap-1.5">
											{activeProfilePhotoHashes.map((hash, index) => (
												<span
													key={`${hash}-dot`}
													className={`h-1.5 w-1.5 rounded-full ${index === mobileCarouselPhotoIndex ? "bg-[var(--text)]" : "bg-[var(--border)]"}`}
													aria-hidden="true"
												/>
											))}
										</div>
									) : null}
								</div>

								<div className="hidden grid-cols-3 gap-2 sm:grid sm:grid-cols-4 lg:grid-cols-6">
									{activeProfilePhotoHashes.map((hash, index) => (
										<button
											type="button"
											key={hash}
											onClick={() => openPhotoViewer(index)}
											className="overflow-hidden rounded-xl border border-[var(--border)]"
											aria-label={t("profile_details.open_photo", { index: index + 1 })}
										>
											<div className="relative">
												<img
													src={getThumbImageUrl(hash, "320x320")}
													alt={t("profile_details.photo_alt", { name: activeProfileName })}
													className="aspect-square w-full object-cover"
												/>
												{renderPhotoCreatedBadge(hash)}
											</div>
										</button>
									))}
								</div>
							</>
						) : (
							<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
								{activeProfilePhotoHashes.map((hash, index) => (
									<button
										type="button"
										key={hash}
										onClick={() => openPhotoViewer(index)}
										className="overflow-hidden rounded-xl border border-[var(--border)]"
										aria-label={t("profile_details.open_photo", { index: index + 1 })}
									>
										<div className="relative">
											<img
												src={getThumbImageUrl(hash, "320x320")}
												alt={t("profile_details.photo_alt", { name: activeProfileName })}
												className="aspect-square w-full object-cover"
											/>
											{renderPhotoCreatedBadge(hash)}
										</div>
									</button>
								))}
							</div>
						)}
					</>
				) : (
					<div className="relative max-w-sm overflow-hidden rounded-xl border border-[var(--border)] aspect-square">
						<ProfileImage
							alt={t("profile_details.default_profile")}
						/>

					</div>
				)}
			</div>

			<div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface-2)] to-color-mix(in srgb, var(--surface-2) 90%, var(--surface)) p-4 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2 min-w-0">
						<h2
							onClick={copyUserId}
							className="text-lg font-bold sm:text-xl select-none cursor-pointer active:opacity-75 transition-opacity truncate hover:text-[var(--accent)] flex items-center gap-1.5"
							title="Tap to copy User ID"
						>
							<span className="text-[var(--text)]">{activeProfileName}</span>
							{activeProfile.age && typeof activeProfile.age === "number" && Number.isInteger(activeProfile.age) && activeProfile.age > 0 && activeProfile.showAge !== false ? (
								<>
									<span className="text-[var(--text-muted)] opacity-40 text-sm select-none">•</span>
									<span className="font-bold text-base sm:text-lg text-[var(--accent-readable)] select-none">
										{activeProfile.age}
									</span>
								</>
							) : null}
						</h2>
					</div>

					{messageProfileId && (
						<div className="flex items-center gap-2 shrink-0">
							{/* Favorite Button */}
							{onToggleFavoriteProfile && (
								<button
									type="button"
									onClick={() => {
										if (!isTogglingFavorite) {
											void onToggleFavoriteProfile(messageProfileId, isFavorite);
										}
									}}
									disabled={isTogglingFavorite}
									className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 active:scale-90 cursor-pointer disabled:opacity-50 ${
										isFavorite
											? "border-amber-500 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 dark:text-amber-400 shadow-md shadow-amber-500/10"
											: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-amber-500 hover:border-amber-500/50 hover:bg-amber-500/10"
									}`}
									title={isFavorite ? t("profile_details.unfavorite") : t("browse_filters.options.favorites")}
									aria-label={isFavorite ? t("profile_details.unfavorite") : t("browse_filters.options.favorites")}
								>
									{isTogglingFavorite ? (
										<Loader2 className="h-4.5 w-4.5 animate-spin" />
									) : (
										<Star className={`h-4.5 w-4.5 transition-transform duration-300 hover:scale-110 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`} />
									)}
								</button>
							)}

							{/* Tap Button */}
							<TapSelector
								profileId={messageProfileId}
								onTapProfile={onTapProfile!}
								isTapDisabled={isTapDisabled}
								isTapBlocked={isTapBlocked}
								isTapActive={isTapActive}
								tapId={tapId}
								tapButtonClassName={
									isTapActive
										? "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface-2))] text-xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative shrink-0"
										: "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))] transition-all duration-300 shrink-0"
								}
							/>

							{/* Message Button */}
							{onMessageProfile && (
								<button
									type="button"
									onClick={() => onMessageProfile(messageProfileId)}
									className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))] transition-all duration-300 active:scale-90 cursor-pointer disabled:opacity-50"
									title={t("profile_details.message")}
									aria-label={t("profile_details.message")}
								>
									<MessageCircle className="h-4.5 w-4.5" />
									{chatContactStatus?.unreadCount && chatContactStatus.unreadCount > 0 ? (
										<span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white ring-1 ring-[var(--surface-2)] animate-bounce">
											{chatContactStatus.unreadCount}
										</span>
									) : null}
								</button>
							)}
						</div>
					)}
				</div>
				{/* Clean Info Row (Out of pills, same line, smaller text) */}
				<div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
					{/* Online status */}
					<span className="flex items-center gap-1.5">
						<span className="relative flex h-2 w-2 shrink-0">
							{/* Breathing ping animation only when online (green / minutes left) */}
							{meta.isOnline && (
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />
							)}
							<span className={`relative inline-flex rounded-full h-2 w-2 ${
								meta.isOnline
									? "bg-emerald-500"
									: statusColorClass === "bg-yellow-500"
										? "bg-amber-500"
										: "bg-zinc-400"
							}`} />
						</span>
						<span className="font-semibold text-[var(--text)]">{statusText}</span>
					</span>

					<span className="opacity-40 select-none">•</span>

					{/* Distance */}
					<span className="flex items-center gap-1.5">
						{isLocatingProfile ? (
							<Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
						) : profileDistance == null || !Number.isFinite(profileDistance) ? (
							<Navigation className="h-3 w-3 opacity-45" />
						) : (
							<Navigation className="h-3 w-3 text-[var(--accent)]" />
						)}
						<button
							type="button"
							onClick={triggerLocate}
							disabled={isTriangleDisabled || isLocatingProfile}
							className="font-semibold text-[var(--text)] hover:text-[var(--accent)] transition-colors cursor-pointer disabled:pointer-events-none"
							title="Tap to run location finder"
						>
							{isLocatingProfile ? "Locating..." : formatDistance(profileDistance, t, unitsPreset)}
						</button>
					</span>

					{hasChatHistory && (
						<>
							<span className="opacity-40 select-none">•</span>
							{/* Chat History */}
							<span className="flex items-center gap-1.5">
								<MessagesSquare className="h-3 w-3 text-blue-400" />
								<span className="font-semibold text-[var(--text-muted)]">{lastMessageLabel || t("profile_details.chatted_before")}</span>
							</span>
						</>
					)}

					{isFavorite && (
						<>
							<span className="opacity-40 select-none">•</span>
							{/* Private Note */}
							<button
								type="button"
								onClick={() => setIsNotesModalOpen(true)}
								className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors cursor-pointer text-left max-w-[150px] sm:max-w-[200px]"
								title={activeNote ? t("favorites.edit_note_title", "Click to edit note") : t("favorites.add_note_title", "Click to add note")}
							>
								<FileText className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
								<span className={`font-semibold text-[var(--text-muted)] truncate ${activeNote ? "italic" : ""}`}>
									{activeNote ? activeNote : t("favorites.add_note_link", "Add Note...")}
								</span>
							</button>
						</>
					)}
				</div>


				{usesFreegrind && (
					<div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/5 border border-amber-500/10 px-3 py-1.5 text-xs text-amber-500/90 w-fit">
						<img
							src={freegrindLogo}
							alt="Free Grind user"
							className="h-4.5 w-4.5 rounded-full"
						/>
						<span className="font-medium">{t("profile_details.uses_free_grind", "Uses FreeGrind")}</span>
					</div>
				)}
			</div>

			<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
				<div className="grid gap-4">
					{hasTagsContent && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.tags")}
							</p>
							<div className="mt-2 flex flex-wrap gap-2">
								{activeProfile.profileTags.map((tag) => (
									<span
										key={tag}
										className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs"
									>
										{tag}
									</span>
								))}
							</div>
						</div>
					)}

					{hasAboutContent && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.about")}
							</p>
							<p className="mt-2 text-sm leading-relaxed text-[var(--text)] whitespace-pre-line">
								{activeProfile.aboutMe?.trim()}
							</p>
						</div>
					)}

					{hasExpectationsFields && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.expectations")}
							</p>
							<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
								{!shouldHideField(
									formatEnumArray(
										activeProfile.lookingFor,
										lookingForLabels,
									),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.looking_for")}:
										</span>{" "}
										{formatEnumArray(
											activeProfile.lookingFor,
											lookingForLabels,
											t
										)}
									</p>
								)}
								{!shouldHideField(
									formatEnumArray(activeProfile.meetAt, meetAtLabels, t),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.meet_at")}:
										</span>{" "}
										{formatEnumArray(
											activeProfile.meetAt,
											meetAtLabels,
											t
										)}
									</p>
								)}
								{!shouldHideField(
									formatEnumArray(
										activeProfile.grindrTribes,
										tribeLabels,
										t
									),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.tribes")}:
										</span>{" "}
										{formatEnumArray(
											activeProfile.grindrTribes,
											tribeLabels,
											t
										)}
									</p>
								)}
								{!shouldHideField(formattedActiveGenders) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.genders")}:
										</span>{" "}
										{formattedActiveGenders}
									</p>
								)}
								{!shouldHideField(formattedActivePronouns) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.pronouns")}:
										</span>{" "}
										{formattedActivePronouns}
									</p>
								)}
								{!shouldHideField(
									activeProfile.rightNowText?.trim(),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.right_now")}:
										</span>{" "}
										{activeProfile.rightNowText?.trim()}
									</p>
								)}
							</div>
						</div>
					)}

					{hasHealthFields && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.health")}
							</p>
							<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
								{!shouldHideField(
									formatEnumValue(
										activeProfile.hivStatus,
										hivStatusLabels,
									),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.hiv_status")}:
										</span>{" "}
										{formatEnumValue(
											activeProfile.hivStatus,
											hivStatusLabels,
											t
										)}
									</p>
								)}
								{activeProfile.lastTestedDate && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.last_tested")}:
										</span>{" "}
										{formatTimeAgo(activeProfile.lastTestedDate, t)}
									</p>
								)}
								{!shouldHideField(
									formatEnumArray(
										activeProfile.sexualHealth,
										sexualHealthLabels,
										t
									),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.sexual_health")}:
										</span>{" "}
										{formatEnumArray(
											activeProfile.sexualHealth,
											sexualHealthLabels,
											t
										)}
									</p>
								)}
								{!shouldHideField(
									formatEnumArray(
										activeProfile.vaccines,
										vaccineLabels,
										t
									),
								) && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.vaccines")}:
										</span>{" "}
										{formatEnumArray(
											activeProfile.vaccines,
											vaccineLabels,
											t
										)}
									</p>
								)}
							</div>
						</div>
					)}
				</div>

				<div className="grid gap-4">
					{hasStatsFields && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.stats")}
							</p>
							<div className="mt-2 grid grid-cols-2 gap-2 text-sm text-[var(--text-muted)]">
								{!shouldHideField(
									formatEnumValue(
										activeProfile.sexualPosition,
										sexualPositionLabels,
									),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.position")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatEnumValue(
												activeProfile.sexualPosition,
												sexualPositionLabels,
												t
											)}
										</p>
									</div>
								)}
								{!shouldHideField(
									formatHeightCm(activeProfile.height, t, unitsPreset),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.height")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatHeightCm(activeProfile.height, t, unitsPreset)}
										</p>
									</div>
								)}
								{!shouldHideField(
									formatWeightKg(activeProfile.weight, t, unitsPreset),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.weight")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatWeightKg(activeProfile.weight, t, unitsPreset)}
										</p>
									</div>
								)}
								{!shouldHideField(
									formatEnumValue(
										activeProfile.bodyType,
										bodyTypeLabels,
										t
									),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.body_type")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatEnumValue(
												activeProfile.bodyType,
												bodyTypeLabels,
												t
											)}
										</p>
									</div>
								)}
								{!shouldHideField(
									formatEnumValue(
										activeProfile.ethnicity,
										ethnicityLabels,
										t
									),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.ethnicity")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatEnumValue(
												activeProfile.ethnicity,
												ethnicityLabels,
												t
											)}
										</p>
									</div>
								)}
								{!shouldHideField(
									formatEnumValue(
										activeProfile.relationshipStatus,
										relationshipStatusLabels,
										t
									),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
										<p className="text-[10px] uppercase tracking-[0.08em]">
											{t("profile_details.relationship")}
										</p>
										<p className="mt-1 font-medium text-[var(--text)]">
											{formatEnumValue(
												activeProfile.relationshipStatus,
												relationshipStatusLabels,
												t
											)}
										</p>
									</div>
								)}
							</div>
						</div>
					)}

					{hasSocialFields && (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
							<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.social")}
							</p>
							<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
								{activeProfile.socialNetworks?.instagram?.userId && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.instagram")}:
										</span>{" "}
										<a
											href={`https://instagram.com/${activeProfile.socialNetworks.instagram.userId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-[var(--text)] underline hover:opacity-75"
										>
											{activeProfile.socialNetworks.instagram.userId}
										</a>
									</p>
								)}
								{activeProfile.socialNetworks?.twitter?.userId && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.x")}:
										</span>{" "}
										<a
											href={`https://x.com/${activeProfile.socialNetworks.twitter.userId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-[var(--text)] underline hover:opacity-75"
										>
											{activeProfile.socialNetworks.twitter.userId}
										</a>
									</p>
								)}
								{activeProfile.socialNetworks?.facebook?.userId && (
									<p>
										<span className="font-semibold text-[var(--text)]">
											{t("profile_details.facebook")}:
										</span>{" "}
										<a
											href={`https://facebook.com/${activeProfile.socialNetworks.facebook.userId}`}
											target="_blank"
											rel="noopener noreferrer"
											className="text-[var(--text)] underline hover:opacity-75"
										>
											{activeProfile.socialNetworks.facebook.userId}
										</a>
									</p>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Block/Unblock Button */}
			{messageProfileId && (onBlockProfile || onUnblockProfile) && (
				<div className="mt-4">
					<button
						type="button"
						onClick={() => {
							if (isBlocked) {
								onUnblockProfile?.(messageProfileId);
							} else {
								onBlockProfile?.(messageProfileId);
							}
						}}
						disabled={isBlockingProfile}
						className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
							isBlocked
								? "border-red-500/35 bg-red-500/10 text-red-500 hover:bg-red-500/15"
								: "border-red-500/20 bg-red-500/5 text-red-600 dark:text-red-400 hover:bg-red-500/10 hover:border-red-500/40 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/20"
						}`}
					>
						{isBlockingProfile ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Ban className="h-4 w-4" />
						)}
						<span>{isBlocked ? t("profile_details.unblock", "Unblock Profile") : t("profile_details.block", "Block Profile")}</span>
					</button>
				</div>
			)}

			{/* Plain text technical details at the bottom of the profile */}
			<div className="mt-4 flex flex-col gap-1 text-[11px] text-[var(--text-muted)] opacity-60 border-t border-[var(--border)]/20 pt-4">
				<div className="flex items-center gap-1.5">
					<span className="font-semibold">User ID:</span>
					<button
						type="button"
						onClick={copyUserId}
						className="font-mono hover:text-[var(--accent)] transition-colors select-all cursor-pointer text-left truncate"
						title="Click to copy User ID"
					>
						{activeProfile.profileId}
					</button>
				</div>
				<p>
					<span className="font-semibold">Estimated Created:</span>{" "}
					{estimatedCreatedAt}
				</p>
			</div>

			{/* Notes pop-up editor modal */}
			<dialog
				ref={notesDialogRef}
				className="fixed left-1/2 top-1/2 m-0 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)] p-0 text-[var(--text)] shadow-2xl backdrop:bg-black/45 focus-visible:outline-none"
				onClick={(event) => {
					if (event.target === notesDialogRef.current && !isSavingNote) {
						setIsNotesModalOpen(false);
					}
				}}
				onClose={() => setIsNotesModalOpen(false)}
			>
				<div className="p-4 flex flex-col gap-3">
					<div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text)]">
						<FileText className="h-4 w-4 text-amber-500 dark:text-amber-400" />
						<span>{t("favorites.private_note_title", "Private Note")}</span>
					</div>

					<textarea
						value={noteText}
						onChange={(e) => setNoteText(e.target.value.slice(0, 500))}
						placeholder={t("favorites.note_placeholder", "Write a private note about this profile...")}
						disabled={isSavingNote}
						className="w-full bg-[var(--surface)] text-[var(--text)] rounded-xl border border-[var(--border)] p-3 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] transition-all min-h-[120px] resize-none"
						autoFocus
					/>

					<div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
						<span>{noteText.length} / 500</span>
						{activeNote && (
							<button
								type="button"
								onClick={handleDeleteNote}
								disabled={isSavingNote}
								className="text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 font-semibold"
							>
								<Trash2 className="h-3.5 w-3.5" />
								<span>{t("favorites.delete_note", "Delete Note")}</span>
							</button>
						)}
					</div>

					<div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<button
							type="button"
							onClick={() => setIsNotesModalOpen(false)}
							disabled={isSavingNote}
							className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-60 cursor-pointer"
						>
							{t("common.cancel", "Cancel")}
						</button>
						<button
							type="button"
							onClick={handleSaveNote}
							disabled={isSavingNote}
							className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60 cursor-pointer"
						>
							{isSavingNote && <Loader2 className="h-4 w-4 animate-spin" />}
							<span>{t("common.save", "Save")}</span>
						</button>
					</div>
				</div>
			</dialog>
		</div>
	);
}