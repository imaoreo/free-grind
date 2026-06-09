import {
	ArrowDown,
	ArrowLeftRight,
	ArrowUp,
	ArrowUpDown,
	Calendar,
	ChevronsDown,
	ChevronsUp,
	Compass,
	ExternalLink,
	FileText,
	Flame,
	Globe,
	Hash,
	Heart,
	Loader2,
	MapPin,
	MessageCircle,
	MessageSquare,
	MessagesSquare,
	Navigation,
	Ruler,
	Scale,
	Search,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Star,
	Syringe,
	Trash2,
	User,
	Zap,
	type LucideIcon,
} from "lucide-react";
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
	onPhotoIndexChange?: (index: number) => void;
	handleMobileCarouselScroll: (event: UIEvent<HTMLDivElement>) => void;
	openPhotoViewer: (index: number) => void;
	photoCreatedAtByHash: Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }>;
	activeProfileName: string;
	estimatedCreatedAt: string;
	profileStatusLabel: string;
	profileStatusLevel: "online" | "recent" | "offline";
	ownTags?: string[];
	profileDistance: number | null;
	chatContactStatus: ChatContactIndexRecord | null;
	messageProfileId: string | null;
	usesFreegrind: boolean;
	onMessageProfile?: (profileId: string) => void;
	onTapProfile?: (profileId: string, tapId?: number) => void;
	onBlockProfile?: (profileId: string) => void;
	onUnblockProfile?: (profileId: string) => void;
	onToggleFavoriteProfile?: (
		profileId: string,
		currentlyFavorite: boolean,
	) => void | Promise<void>;
	isFavorite: boolean;
	isTogglingFavorite: boolean;
	isBlocked: boolean;
	isBlockingProfile: boolean;
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
	onPhotoIndexChange,
	handleMobileCarouselScroll,
	openPhotoViewer,
	photoCreatedAtByHash,
	activeProfileName,
	estimatedCreatedAt,
	profileStatusLabel,
	profileStatusLevel,
	ownTags = [],
	profileDistance,
	chatContactStatus,
	messageProfileId,
	usesFreegrind,
	onMessageProfile,
	onTapProfile,
	onBlockProfile,
	onUnblockProfile,
	onToggleFavoriteProfile,
	isFavorite,
	isTogglingFavorite,
	isBlocked,
	isBlockingProfile,
	isTapDisabled,
	isTapBlocked,
	isTapActive,
	tapId,
	tapButtonClassName,
	onTriangleProfile,
	isTriangleDisabled,
	triangleButtonClassName,
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
	activeNote,
	onSaveNote,
	onDeleteNote,
}: ProfileDetailsContentProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const hasChatHistory = Boolean(chatContactStatus?.hasChatted) || (chatContactStatus?.unreadCount ?? 0) > 0;
	const lastMessageLabel = formatRelativeTime(chatContactStatus?.lastMessageTimestamp ?? null);

	// Notes state
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
			if (!dialog.open) dialog.showModal();
		} else {
			if (dialog.open) dialog.close();
		}
	}, [isNotesModalOpen]);

	const handleSaveNote = async () => {
		if (!onSaveNote) return;
		setIsSavingNote(true);
		try {
			await onSaveNote(noteText.trim());
			toast.success(t("favorites.note_saved", "Note saved successfully"));
			setIsNotesModalOpen(false);
		} catch {
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
		} catch {
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

	const copyUserId = async () => {
		try {
			const { default: copy } = await import("copy-to-clipboard");
			copy(activeProfile.profileId);
			toast.success(t("profile_details.user_id_copied", { defaultValue: "User ID copied!" }), { id: "user-id-copy" });
			if (navigator.vibrate) navigator.vibrate(50);
		} catch (err) {
			console.error("Failed to copy user ID", err);
		}
	};

	const renderPhotoCreatedBadge = (hash: string) => {
		const meta = photoCreatedAtByHash[hash] ?? null;
		if (!meta?.takenOnGrindr) return null;
		return (
			<div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white ring-1 ring-white/25">
				<img src={freegrindLogo} alt={t("chat.thread.taken_on_grindr")} className="h-3.5 w-3.5 rounded-full" />
				<span>{t("chat.thread.taken_on_grindr")}</span>
			</div>
		);
	};

	// Vertical photo swipe (from PR)
	const [dragDelta, setDragDelta] = useState(0);
	const isDraggingRef = useRef(false);
	const lastDeltaRef = useRef(0);
	const currentIndexRef = useRef(mobileCarouselPhotoIndex);
	currentIndexRef.current = mobileCarouselPhotoIndex;
	const onPhotoIndexChangeRef = useRef(onPhotoIndexChange);
	onPhotoIndexChangeRef.current = onPhotoIndexChange;

	useEffect(() => {
		setDragDelta(0);
	}, [activeProfile?.profileId]);

	useEffect(() => {
		const el = mobileCarouselRef.current;
		if (!el || !showMobileCarousel || isDesktopLike) return;

		let startY = 0, startX = 0;
		let decided = false, navigating = false, pointerDown = false;

		const onStart = (e: PointerEvent) => {
			pointerDown = true;
			startY = e.clientY;
			startX = e.clientX;
			decided = false;
			navigating = false;
			isDraggingRef.current = false;
			lastDeltaRef.current = 0;
			el.setPointerCapture(e.pointerId);
		};

		const onMove = (e: PointerEvent) => {
			if (!pointerDown) return;
			const dy = e.clientY - startY;
			const dx = e.clientX - startX;
			if (!decided) {
				if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
				decided = true;
				if (Math.abs(dx) >= Math.abs(dy)) return;
				const idx = currentIndexRef.current;
				const total = activeProfilePhotoHashes.length;
				if ((dy < 0 && idx < total - 1) || (dy > 0 && idx > 0)) {
					navigating = true;
					isDraggingRef.current = true;
					e.preventDefault();
				}
			}
			if (!navigating) return;
			e.preventDefault();
			lastDeltaRef.current = dy;
			setDragDelta(dy);
		};

		const onEnd = () => {
			pointerDown = false;
			isDraggingRef.current = false;
			if (!navigating) return;
			navigating = false;
			const dy = lastDeltaRef.current;
			const idx = currentIndexRef.current;
			const total = activeProfilePhotoHashes.length;
			if (dy < -60 && idx < total - 1) onPhotoIndexChangeRef.current?.(idx + 1);
			else if (dy > 60 && idx > 0) onPhotoIndexChangeRef.current?.(idx - 1);
			lastDeltaRef.current = 0;
			setDragDelta(0);
		};

		el.addEventListener('pointerdown', onStart);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onEnd);
		el.addEventListener('pointercancel', onEnd);
		return () => {
			el.removeEventListener('pointerdown', onStart);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onEnd);
			el.removeEventListener('pointercancel', onEnd);
		};
	}, [activeProfilePhotoHashes.length, showMobileCarousel, isDesktopLike]);

	const positionIconMap: Record<number, LucideIcon> = {
		1: ArrowUp,
		2: ArrowDown,
		3: ArrowUpDown,
		4: ChevronsDown,
		5: ChevronsUp,
		6: ArrowLeftRight,
	};
	const PositionIcon = activeProfile?.sexualPosition != null
		? (positionIconMap[activeProfile.sexualPosition] ?? Compass)
		: null;

	return (
		<div className="grid gap-6">
			{/* Photos */}
			<div>
				{activeProfilePhotoHashes.length > 0 ? (
					<>
						{showMobileCarousel && !isDesktopLike ? (
							<>
								<div className="relative -mx-[var(--app-px)]">
									<div
										ref={mobileCarouselRef}
										className="relative h-[min(64dvh,calc(100vw*1.33))] overflow-hidden border-b border-[var(--border)] touch-none select-none"
									>
										{activeProfilePhotoHashes.map((hash, index) => (
											<div
												key={hash}
												style={{
													transform: `translateY(calc(${(index - mobileCarouselPhotoIndex) * 100}% + ${dragDelta}px))`,
													transition: isDraggingRef.current ? 'none' : 'transform 300ms ease-out',
												}}
												className="absolute inset-0"
											>
												<button
													type="button"
													onClick={() => openPhotoViewer(index)}
													className="absolute inset-0 z-10"
													aria-label={t("profile_details.open_photo", { index: index + 1 })}
												/>
												<img
													src={getProfileImageUrl(hash, "1024x1024")}
													alt={t("profile_details.photo_alt", { name: activeProfileName })}
													className="h-full w-full object-cover"
												/>
												{renderPhotoCreatedBadge(hash)}
											</div>
										))}
									</div>
									{activeProfilePhotoHashes.length > 1 ? (
										<div className="pointer-events-none absolute right-3 inset-y-0 z-20 flex flex-col items-center justify-center">
											<div className="flex flex-col items-center gap-1.5 rounded-full bg-black/30 px-[5px] py-[10px] backdrop-blur-sm">
												{activeProfilePhotoHashes.map((hash, index) => (
													<span
														key={`${hash}-dot`}
														className={`w-1.5 rounded-full transition-[height,background-color] duration-300 ease-out ${index === mobileCarouselPhotoIndex ? "h-3 bg-white" : "h-1.5 bg-white/40"}`}
														aria-hidden="true"
													/>
												))}
											</div>
										</div>
									) : null}
								</div>

								{/* Thumbnail fallback for wider viewports within the mobile modal */}
								<div className="hidden">
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
					showMobileCarousel && !isDesktopLike ? (
						<div className="relative -mx-[var(--app-px)]">
							<div className="relative h-[min(64dvh,calc(100vw*1.33))] overflow-hidden border-b border-[var(--border)] flex items-center justify-center bg-[var(--surface-2)]">
								<User className="h-24 w-24 text-[var(--text-muted)] opacity-20" />
							</div>
						</div>
					) : (
						<div className="relative max-w-sm mx-auto w-full overflow-hidden rounded-xl border border-[var(--border)] aspect-square">
							<ProfileImage alt={t("profile_details.default_profile")} />
						</div>
					)
				)}
			</div>

			{/* Deleted / blocked account alert */}
			{(activeProfile.isBlockable === null || activeProfile.displayName === "3" || activeProfile.displayName === "4") && (
				<div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3.5 flex items-start gap-3">
					<div className="rounded-lg bg-red-500/20 p-1.5 text-red-400 shrink-0">
						<ShieldAlert className="h-4 w-4" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-semibold text-red-400">
							{activeProfile.displayName === "3"
								? t("profile_details.deleted_alert_title", { defaultValue: "Account Deleted" })
								: activeProfile.displayName === "4"
									? t("profile_details.blocked_alert_title_explicit", { defaultValue: "Blocked by User" })
									: t("profile_details.blocked_alert_title", { defaultValue: "Profile Unavailable" })
							}
						</p>
						<p className="text-[11px] text-[var(--text-muted)] mt-0.5 leading-normal">
							{activeProfile.displayName === "3"
								? t("profile_details.deleted_alert_desc", { defaultValue: "This account has been deleted or deactivated." })
								: activeProfile.displayName === "4"
									? t("profile_details.blocked_alert_desc_explicit", { defaultValue: "This person has blocked you." })
									: t("profile_details.blocked_alert_desc", { defaultValue: "This person is currently unavailable. They may have blocked you, or the account has been deactivated." })
							}
						</p>
					</div>
				</div>
			)}

			{/* Profile info — name, action buttons, status/distance/chat/notes */}
			<div className="px-3">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2 min-w-0">
						<h2
							onClick={copyUserId}
							className="text-2xl font-bold sm:text-3xl select-none cursor-pointer active:opacity-75 transition-opacity truncate hover:text-[var(--accent)] flex items-center gap-1.5"
							title="Tap to copy User ID"
						>
							<span className="text-[var(--text)]">{activeProfileName}</span>
							{activeProfile.age && typeof activeProfile.age === "number" && Number.isInteger(activeProfile.age) && activeProfile.age > 0 && activeProfile.showAge !== false ? (
								<>
									<span className="text-[var(--text-muted)] opacity-40 select-none leading-none">·</span>
									<span className="font-normal text-lg sm:text-xl text-[var(--text-muted)] select-none leading-none">
										{activeProfile.age}
									</span>
								</>
							) : null}
						</h2>
					</div>

					{messageProfileId && (
						<div className="flex items-center gap-2 shrink-0">
							{/* Favourite button */}
							{onToggleFavoriteProfile && (
								<button
									type="button"
									onClick={() => {
										if (!isTogglingFavorite) {
											void onToggleFavoriteProfile(messageProfileId, isFavorite);
										}
									}}
									disabled={isTogglingFavorite || activeProfile.isBlockable === null || activeProfile.displayName === "3" || activeProfile.displayName === "4"}
									className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-all duration-300 active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
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

							{/* Tap button */}
							<TapSelector
								profileId={messageProfileId}
								onTapProfile={onTapProfile!}
								isTapDisabled={isTapDisabled || activeProfile.isBlockable === null || activeProfile.displayName === "3" || activeProfile.displayName === "4"}
								isTapBlocked={isTapBlocked}
								isTapActive={isTapActive}
								tapId={tapId}
								compact={true}
								tapButtonClassName={
									isTapActive
										? "inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface-2))] text-xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative shrink-0"
										: "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))] transition-all duration-300 shrink-0"
								}
							/>

							{/* Message button */}
							{onMessageProfile && (
								<button
									type="button"
									onClick={() => onMessageProfile(messageProfileId)}
									disabled={activeProfile.isBlockable === null || activeProfile.displayName === "3" || activeProfile.displayName === "4"}
									className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 hover:bg-[color-mix(in_srgb,var(--accent)_10%,var(--surface-2))] transition-all duration-300 active:scale-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

				{/* Status / distance / chat history / notes row */}
				<div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
					<span className="flex items-center gap-1.5">
						<span className="relative flex h-2 w-2 shrink-0">
							{meta.isOnline && (
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-emerald-400" />
							)}
							<span className={`relative inline-flex rounded-full h-2 w-2 ${
								meta.isOnline ? "bg-emerald-500"
								: statusColorClass === "bg-yellow-500" ? "bg-amber-500"
								: "bg-zinc-400"
							}`} />
						</span>
						<span className="font-semibold text-[var(--text)]">{statusText}</span>
					</span>

					<span className="opacity-40 select-none">•</span>

					<span className="flex items-center gap-1.5">
						{isLocatingProfile ? (
							<Loader2 className="h-3 w-3 animate-spin text-[var(--accent)]" />
						) : profileDistance == null || !Number.isFinite(profileDistance) ? (
							<Navigation className="h-3 w-3 opacity-45" />
						) : (
							<Navigation className="h-3 w-3 text-[var(--accent)]" />
						)}
						<span className="font-semibold text-[var(--text)]">
							{formatDistance(profileDistance, t, unitsPreset)}
						</span>
					</span>

					{hasChatHistory && (
						<>
							<span className="opacity-40 select-none">•</span>
							<span className="flex items-center gap-1.5">
								<MessagesSquare className="h-3 w-3 text-blue-400" />
								<span className="font-semibold text-[var(--text-muted)]">{lastMessageLabel || t("profile_details.chatted_before")}</span>
							</span>
						</>
					)}

					{isFavorite && (
						<>
							<span className="opacity-40 select-none">•</span>
							<button
								type="button"
								onClick={() => setIsNotesModalOpen(true)}
								className="inline-flex items-center gap-1 hover:text-[var(--accent)] transition-colors cursor-pointer text-left max-w-[150px] sm:max-w-[200px]"
								title={activeNote ? t("favorites.edit_note_title", "Click to edit note") : t("favorites.add_note_title", "Click to add note")}
							>
								<FileText className="h-3 w-3 text-amber-500 dark:text-amber-400 shrink-0" />
								<span className="font-semibold text-[var(--text-muted)] truncate">
									{activeNote ? activeNote : t("favorites.add_note_link", "Add Note...")}
								</span>
							</button>
						</>
					)}
				</div>

				{usesFreegrind && (
					<div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/5 border border-amber-500/10 px-3 py-1.5 text-xs text-amber-500/90 w-fit">
						<img src={freegrindLogo} alt="Free Grind user" className="h-4.5 w-4.5 rounded-full" />
						<span className="font-medium">{t("profile_details.uses_free_grind", "Uses FreeGrind")}</span>
					</div>
				)}
			</div>

			{/* Tags / About / Expectations / Health / Stats / Social */}
			<div className="grid gap-8 px-3">
				{/* Tags — full width */}
				{hasTagsContent && (
					<div>
						<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_details.tags")}
						</p>
						<div className="flex flex-wrap gap-2">
							{activeProfile.profileTags.map((tag) => {
								const isMatch = ownTags.some((own) => own.toLowerCase() === tag.toLowerCase());
								return (
									<span
										key={tag}
										className={`rounded-full border px-3 py-1.5 text-sm ${
											isMatch
												? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold"
												: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]"
										}`}
									>
										{tag}
									</span>
								);
							})}
						</div>
					</div>
				)}

				{/* About + Stats side by side on wide screens */}
				{(hasAboutContent || hasStatsFields) && (
				<div className="grid gap-8 lg:grid-cols-2">
					{hasAboutContent && (
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.about")}
							</p>
							<div className="rounded-xl bg-[var(--surface-2)] px-4 py-3">
								<p className="text-sm leading-relaxed text-[var(--text)] whitespace-pre-line">
									{activeProfile.aboutMe?.trim()}
								</p>
							</div>
						</div>
					)}
					{hasStatsFields && (
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.stats")}
							</p>
							<div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
								{PositionIcon != null && !shouldHideField(formatEnumValue(activeProfile.sexualPosition, sexualPositionLabels)) && (
									<div className="flex items-center gap-2.5">
										<PositionIcon className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.sexualPosition, sexualPositionLabels, t)}</p>
									</div>
								)}
								{!shouldHideField(formatHeightCm(activeProfile.height, t, unitsPreset)) && (
									<div className="flex items-center gap-2.5">
										<Ruler className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatHeightCm(activeProfile.height, t, unitsPreset)}</p>
									</div>
								)}
								{!shouldHideField(formatWeightKg(activeProfile.weight, t, unitsPreset)) && (
									<div className="flex items-center gap-2.5">
										<Scale className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatWeightKg(activeProfile.weight, t, unitsPreset)}</p>
									</div>
								)}
								{!shouldHideField(formatEnumValue(activeProfile.bodyType, bodyTypeLabels, t)) && (
									<div className="flex items-center gap-2.5">
										<User className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.bodyType, bodyTypeLabels, t)}</p>
									</div>
								)}
								{!shouldHideField(formatEnumValue(activeProfile.ethnicity, ethnicityLabels, t)) && (
									<div className="flex items-center gap-2.5">
										<Globe className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.ethnicity, ethnicityLabels, t)}</p>
									</div>
								)}
								{!shouldHideField(formatEnumValue(activeProfile.relationshipStatus, relationshipStatusLabels, t)) && (
									<div className="flex items-center gap-2.5">
										<Heart className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm text-[var(--text-muted)]">{formatEnumValue(activeProfile.relationshipStatus, relationshipStatusLabels, t)}</p>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				)}

				{/* Expectations + Health side by side on wide screens */}
				{(hasExpectationsFields || hasHealthFields) && (
				<div className="grid gap-8 lg:grid-cols-2">
					{hasExpectationsFields && (
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.expectations")}
							</p>
							<div className="space-y-2.5">
								{!shouldHideField(formatEnumArray(activeProfile.lookingFor, lookingForLabels)) && (
									<div className="flex items-start gap-2.5">
										<Search className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.looking_for")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.lookingFor, lookingForLabels, t)}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formatEnumArray(activeProfile.meetAt, meetAtLabels, t)) && (
									<div className="flex items-start gap-2.5">
										<MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.meet_at")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.meetAt, meetAtLabels, t)}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formatEnumArray(activeProfile.grindrTribes, tribeLabels, t)) && (
									<div className="flex items-start gap-2.5">
										<Flame className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.tribes")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.grindrTribes, tribeLabels, t)}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formattedActiveGenders) && (
									<div className="flex items-start gap-2.5">
										<User className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.genders")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formattedActiveGenders}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formattedActivePronouns) && (
									<div className="flex items-start gap-2.5">
										<MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.pronouns")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formattedActivePronouns}</span>
										</p>
									</div>
								)}
								{!shouldHideField(activeProfile.rightNowText?.trim()) && (
									<div className="flex items-start gap-2.5">
										<Zap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.right_now")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{activeProfile.rightNowText?.trim()}</span>
										</p>
									</div>
								)}
							</div>
						</div>
					)}

					{hasHealthFields && (
						<div>
							<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
								{t("profile_details.health")}
							</p>
							<div className="space-y-2.5">
								{!shouldHideField(formatEnumValue(activeProfile.hivStatus, hivStatusLabels)) && (
									<div className="flex items-start gap-2.5">
										<Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.hiv_status")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumValue(activeProfile.hivStatus, hivStatusLabels, t)}</span>
										</p>
									</div>
								)}
								{activeProfile.lastTestedDate && (
									<div className="flex items-start gap-2.5">
										<Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.last_tested")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatTimeAgo(activeProfile.lastTestedDate, t)}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels, t)) && (
									<div className="flex items-start gap-2.5">
										<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.sexual_health")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels, t)}</span>
										</p>
									</div>
								)}
								{!shouldHideField(formatEnumArray(activeProfile.vaccines, vaccineLabels, t)) && (
									<div className="flex items-start gap-2.5">
										<Syringe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
										<p className="text-sm">
											<span className="font-semibold text-[var(--text)]">{t("profile_details.vaccines")}:</span>{" "}
											<span className="text-[var(--text-muted)]">{formatEnumArray(activeProfile.vaccines, vaccineLabels, t)}</span>
										</p>
									</div>
								)}
							</div>
						</div>
					)}
				</div>
				)}

				{/* Social — full width */}
				{hasSocialFields && (
				<div>
					<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
						{t("profile_details.social")}
					</p>
							<div className="grid gap-2">
								{activeProfile.socialNetworks?.instagram?.userId && (
									<a
										href={`https://instagram.com/${activeProfile.socialNetworks.instagram.userId}`}
										target="_blank"
										rel="noopener noreferrer"
										className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]"
									>
										<svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
											<path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
										</svg>
										<span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.instagram.userId}</span>
										<ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
									</a>
								)}
								{activeProfile.socialNetworks?.twitter?.userId && (
									<a
										href={`https://x.com/${activeProfile.socialNetworks.twitter.userId}`}
										target="_blank"
										rel="noopener noreferrer"
										className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]"
									>
										<svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
											<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.26 5.632L18.245 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
										</svg>
										<span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.twitter.userId}</span>
										<ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
									</a>
								)}
								{activeProfile.socialNetworks?.facebook?.userId && (
									<a
										href={`https://facebook.com/${activeProfile.socialNetworks.facebook.userId}`}
										target="_blank"
										rel="noopener noreferrer"
										className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 transition hover:border-[var(--accent)]"
									>
										<svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-[var(--text-muted)]">
											<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
										</svg>
										<span className="text-sm font-medium text-[var(--text)]">{activeProfile.socialNetworks.facebook.userId}</span>
										<ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
									</a>
								)}
							</div>
					</div>
				)}

			{/* User ID + estimated creation date */}
			<div className="flex items-center justify-end gap-2 px-3 pb-4 -mt-4 text-xs text-[var(--text-muted)] opacity-50">
				<button type="button" onClick={copyUserId} className="flex items-center gap-1 hover:text-[var(--accent)] transition-colors cursor-pointer" title="Click to copy User ID">
					<Hash className="h-3 w-3 shrink-0" />
					<span className="font-mono">{activeProfile.profileId}</span>
				</button>
				<span className="opacity-40 select-none">·</span>
				<span className="flex items-center gap-1">
					<Calendar className="h-3 w-3 shrink-0" />
					{estimatedCreatedAt}
				</span>
			</div>

			{/* Notes pop-up editor modal */}
			{isNotesModalOpen && <dialog
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
			</dialog>}
		</div>
		</div>
	);
}
