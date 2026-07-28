import { Album, Ban, Check, ChevronDown, ChevronLeft, ChevronUp, EllipsisVertical, Flame, Images, LockKeyhole, MessageCircle, Pencil, Phone, StickyNote, Star, Trash2, Triangle, X, Zap } from "lucide-react";
import toast from "react-hot-toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
	createBackdropCloseHandler,
	useModalClose,
} from "../../../../hooks/useModalClose";
import { usePresenceCheck } from "../../../../hooks/usePresenceCheck";
import { useTravelPlans } from "../../../../hooks/queries/useProfileQueries";
import { useApiFunctions } from "../../../../hooks/useApiFunctions";
import { useAuth } from "../../../../contexts/useAuth";
import { profileResponseSchema } from "../../profile-editor/profileEditorUtils";
import type {
	BrowseCard,
	ManagedOption,
	ProfileDetail,
} from "../../GridPage.types";
import {
	getBodyTypeLabelMap,
	getEthnicityLabelMap,
	getHivStatusLabelMap,
	getLookingForLabelMap,
	getMeetAtLabelMap,
	getNsfwLabelMap,
	getRelationshipStatusLabelMap,
	getSexualHealthLabelMap,
	getSexualPositionLabelMap,
	getTribeLabelMap,
	getVaccineLabelMap,
} from "../../profile-option-builders";
import { getProfileImageUrl } from "../../../../utils/media";
import { getForbiddenWords, setForbiddenWords } from "../../../../utils/autoblock";
import { ProfileImage } from "../../../../components/ui/profile-image";
import { PromptDialog } from "../../../../components/ui/prompt-dialog";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import { FreeGrindBadge } from "../../../../components/FreeGrindBadge";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { formatDateTime24 } from "../../chat/chatUtils";
import { formatRelativeTime } from "../../../../utils/relativeTime";
import {
	formatEstimatedAccountCreation,
	formatDistance,
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	formatWeightKg,
	getOnlineStatusMeta,
	getEnumLabel,
	shouldHideField,
} from "../utils";
import { ProfileDetailsContent } from "./ProfileDetailsContent";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";
import { PhotoViewer, type PhotoViewerMenuAction } from "../../../../components/PhotoViewer";
import { PhotoActionBar } from "../../../../components/PhotoActionBar";
import { useProfileAlbumStatus } from "../../../../hooks/useProfileAlbumStatus";
import { captureAlbum, getLocalAlbum } from "../../../../services/albumStore";
import type { AlbumViewer } from "../../../../types/shared-albums";
import { saveAllAlbumMedia, saveAllMedia } from "../../../../utils/albumMedia";

type OwnProfileData = { tags: string[] };
const ownProfileDataCache = new Map<string, OwnProfileData>();

// Synthetic hash prepended to the photo carousel when the profile has an
// active Right Now post with an image, so it shows as the first slide.
const RIGHT_NOW_SLIDE_HASH = "__right_now_slide__";

// Synthetic hash appended to the photo carousel when the profile has (or has
// ever had) an album, so it shows as the last slide/indicator dot.
const ALBUM_SLIDE_HASH = "__album_slide__";

// Synthetic hash prepended when the profile has no real photo of its own
// (and no Right Now slide either) — keeps the default-avatar placeholder as
// its own slide instead of just disappearing once an album slide is added.
const DEFAULT_PROFILE_SLIDE_HASH = "__default_profile_slide__";

type ProfileDetailsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onMessageProfile?: (profileId: string) => void;
	onSendQuickMessage?: (profileId: string, text: string) => void;
	onSendProfilePhotoReply?: (profileId: string, imageHash: string, text: string) => void | Promise<void>;
	onTriangleProfile?: (profileId: string) => void;
	onBlockProfile?: (profileId: string) => void;
	onUnblockProfile?: (profileId: string) => void;
	onToggleFavoriteProfile?: (
		profileId: string,
		currentlyFavorite: boolean,
	) => void | Promise<void>;
	isFavorite?: boolean;
	isTogglingFavorite?: boolean;
	isBlocked?: boolean;
	isBlockingProfile?: boolean;
	isLocatingProfile?: boolean;
	onTapProfile?: (profileId: string, tapId?: number) => void;
	isTappingProfile?: boolean;
	isTapBlocked?: boolean;
	tapVisualState?: { state: "none" | "single" | "mutual"; tapId: number };
	onTagClick?: (tag: string) => void;
	activeProfile: ProfileDetail | null;
	selectedBrowseCard: BrowseCard | null;
	isLoadingActiveProfile: boolean;
	activeProfileError: string | null;
	activeProfilePhotoHashes: string[];
	chatContactStatus?: ChatContactIndexRecord | null;
	localNickname?: string | null;
	genderOptions: ManagedOption[];
	pronounOptions: ManagedOption[];
	variant?: "modal" | "page";
	onPrevProfile?: () => void;
	onNextProfile?: () => void;
};

function normalizeMediaCreatedAt(value: unknown): number | null {
	if (typeof value !== "number" && typeof value !== "string") {
		return null;
	}

	const numeric = typeof value === "number" ? value : Number(value.trim());
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return null;
	}

	// Most API timestamps are in milliseconds; seconds are normalized.
	return numeric < 1_000_000_000_000 ? Math.round(numeric * 1000) : Math.round(numeric);
}

function ProfileDetailsSkeleton() {
	return (
		<div className="animate-pulse space-y-8 px-3" aria-hidden="true">
			<div>
				<div className="h-7 w-2/5 rounded-full bg-[var(--surface-2)]" />
				<div className="mt-2.5 flex flex-wrap items-center gap-3">
					<div className="h-3 w-20 rounded-full bg-[var(--surface-2)]" />
					<div className="h-3 w-16 rounded-full bg-[var(--surface-2)]" />
				</div>
				<div className="mt-2 flex flex-wrap items-center gap-3">
					<div className="h-3 w-12 rounded-full bg-[var(--surface-2)]" />
					<div className="h-3 w-12 rounded-full bg-[var(--surface-2)]" />
					<div className="h-3 w-12 rounded-full bg-[var(--surface-2)]" />
				</div>
			</div>

			<div className="flex flex-wrap gap-2">
				<div className="h-6 w-16 rounded-full bg-[var(--surface-2)]" />
				<div className="h-6 w-20 rounded-full bg-[var(--surface-2)]" />
				<div className="h-6 w-14 rounded-full bg-[var(--surface-2)]" />
				<div className="h-6 w-24 rounded-full bg-[var(--surface-2)]" />
			</div>

			<div className="space-y-2.5">
				<div className="h-3 w-full rounded-full bg-[var(--surface-2)]" />
				<div className="h-3 w-5/6 rounded-full bg-[var(--surface-2)]" />
				<div className="h-3 w-2/3 rounded-full bg-[var(--surface-2)]" />
			</div>

			<div className="space-y-3">
				{Array.from({ length: 4 }).map((_, i) => (
					<div key={i} className="flex items-center gap-2.5">
						<div className="h-4 w-4 shrink-0 rounded bg-[var(--surface-2)]" />
						<div className="h-3 w-1/3 rounded-full bg-[var(--surface-2)]" />
					</div>
				))}
			</div>
		</div>
	);
}

export function ProfileDetailsModal({
	isOpen,
	onClose,
	onMessageProfile,
	onSendQuickMessage,
	onSendProfilePhotoReply,
	onTriangleProfile,
	onBlockProfile,
	onUnblockProfile,
	onToggleFavoriteProfile,
	isFavorite = false,
	isTogglingFavorite = false,
	isBlocked = false,
	isBlockingProfile = false,
	isLocatingProfile = false,
	onTapProfile,
	isTappingProfile = false,
	isTapBlocked = false,
	tapVisualState = { state: "none", tapId: 1 },
	onTagClick,
	activeProfile,
	selectedBrowseCard,
	isLoadingActiveProfile,
	activeProfileError,
	activeProfilePhotoHashes,
	chatContactStatus,
	localNickname,
	genderOptions,
	pronounOptions,
	variant = "modal",
	onPrevProfile,
	onNextProfile,
}: ProfileDetailsModalProps) {
	const { t } = useTranslation();
	const { unitsPreset, showAlbumSensitiveContentWarning } = usePreferences();
	const { userId } = useAuth();
	const navigate = useNavigate();
	const apiFunctions = useApiFunctions();
	const [ownTags, setOwnTags] = useState<string[]>(() => (userId ? (ownProfileDataCache.get(String(userId))?.tags ?? []) : []));
	useEffect(() => {
		if (!userId) return;
		if (ownProfileDataCache.has(String(userId))) {
			setOwnTags(ownProfileDataCache.get(String(userId))!.tags);
			return;
		}
		apiFunctions.getRawProfile(userId).then((raw) => {
			const parsed = profileResponseSchema.safeParse(raw);
			if (parsed.success) {
				const p = parsed.data.profiles[0];
				const data: OwnProfileData = { tags: p?.profileTags ?? [] };
				ownProfileDataCache.set(String(userId), data);
				setOwnTags(data.tags);
			}
		}).catch(() => {});
	}, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
	const activeProfileName = useMemo(() => {
		if (!activeProfile) {
			return t("profile_details.title");
		}

		const nickname = localNickname?.trim();
		if (nickname) {
			return nickname;
		}

		const value = activeProfile.displayName?.trim();
		if (value) {
			return value;
		}

		return t("profile_details.anonymous", "Someone");
	}, [activeProfile, localNickname, t]);

	const messageProfileId = activeProfile?.profileId ?? selectedBrowseCard?.profileId ?? null;
	const isOwnProfile = userId != null && messageProfileId != null && String(userId) === String(messageProfileId);
	const profileDistance =
		activeProfile?.distance ?? selectedBrowseCard?.distanceMeters ?? null;
	const profileOnlineUntil = isOwnProfile
		? Date.now() + 60 * 60 * 1000
		: (activeProfile?.onlineUntil ?? selectedBrowseCard?.onlineUntil ?? null);
	const profileLastSeen = activeProfile?.seen ?? selectedBrowseCard?.lastOnline ?? null;
	const profileStatusMeta = getOnlineStatusMeta(
		profileLastSeen,
		profileOnlineUntil,
	);
	const profileStatusLabel = profileStatusMeta.isOnline
		? t(profileStatusMeta.labelKey, { count: profileStatusMeta.count })
		: profileStatusMeta.labelKey === "browse_page.status_offline"
			? t(profileStatusMeta.labelKey)
			: t("profile_details.last_online", {
					value: t(profileStatusMeta.labelKey, {
						count: profileStatusMeta.count,
					}),
				});
	const profileStatusLevel: "online" | "recent" | "offline" =
		profileStatusMeta.isOnline ? "online"
		: profileStatusMeta.labelKey === "browse_page.status_minutes_ago" && (profileStatusMeta.count ?? 99) <= 10 ? "recent"
		: "offline";
	const estimatedCreatedAt = formatEstimatedAccountCreation(activeProfile?.profileId, t);
	const { data: travelPlans } = useTravelPlans(activeProfile?.profileId);
	const usesFreegrind = usePresenceCheck(messageProfileId);
	const visualStateValue = typeof tapVisualState === "string" ? tapVisualState : tapVisualState.state;
	const effectiveTapVisualState = isTappingProfile ? "single" : visualStateValue;
	const isTapActive = effectiveTapVisualState !== "none";
	const isTapDisabled = isOwnProfile || !onTapProfile || isTappingProfile || isTapBlocked;
	const isTriangleDisabled =
		!onTriangleProfile || !messageProfileId || isLocatingProfile;
	const tapButtonClassName =
		isTapActive
			? "inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] text-4xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative"
			: "inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--text-muted)] bg-transparent text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]";
	const lookingForLabels = useMemo(() => getLookingForLabelMap(t), [t]);
	const meetAtLabels = useMemo(() => getMeetAtLabelMap(t), [t]);
	const nsfwLabels = useMemo(() => getNsfwLabelMap(t), [t]);
	const tribeLabels = useMemo(() => getTribeLabelMap(t), [t]);
	const hivStatusLabels = useMemo(() => getHivStatusLabelMap(t), [t]);
	const sexualHealthLabels = useMemo(() => getSexualHealthLabelMap(t), [t]);
	const vaccineLabels = useMemo(() => getVaccineLabelMap(t), [t]);
	const sexualPositionLabels = useMemo(() => getSexualPositionLabelMap(t), [t]);
	const bodyTypeLabels = useMemo(() => getBodyTypeLabelMap(t), [t]);
	const ethnicityLabels = useMemo(() => getEthnicityLabelMap(t), [t]);
	const relationshipStatusLabels = useMemo(() => getRelationshipStatusLabelMap(t),[t]);

	const formattedActiveGenders = useMemo(() => {
		if (!activeProfile?.genders.length) {
			return "Not set";
		}

		return activeProfile.genders
			.map((genderId) => getEnumLabel(genderId, genderOptions))
			.join(", ");
	}, [activeProfile?.genders, genderOptions, t]);

	const formattedActivePronouns = useMemo(() => {
		if (!activeProfile?.pronouns.length) {
			return "Not set";
		}

		return activeProfile.pronouns
			.map((pronounId) => getEnumLabel(pronounId, pronounOptions))
			.join(", ");
	}, [activeProfile?.pronouns, pronounOptions, t]);

	const hasExpectationsFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumArray(activeProfile.lookingFor, lookingForLabels, t),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.meetAt, meetAtLabels, t)) ||
			!shouldHideField(
				formatEnumArray(activeProfile.grindrTribes, tribeLabels, t),
			) ||
			!shouldHideField(formattedActiveGenders) ||
			!shouldHideField(formattedActivePronouns)
		);
	}, [activeProfile, formattedActiveGenders, formattedActivePronouns, t]);

	const hasHealthFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumValue(activeProfile.hivStatus, hivStatusLabels, t),
			) ||
			Boolean(activeProfile.lastTestedDate) ||
			!shouldHideField(
				formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels, t),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.vaccines, vaccineLabels, t))
		);
	}, [activeProfile, t]);

	const hasStatsFields = useMemo(() => {
		if (!activeProfile) return false;
		const positionFormatted = formatEnumValue(
			activeProfile.sexualPosition,
			sexualPositionLabels,
			t
		);
		return (
			!shouldHideField(positionFormatted) ||
			!shouldHideField(formatHeightCm(activeProfile.height, t, unitsPreset)) ||
			!shouldHideField(formatWeightKg(activeProfile.weight, t, unitsPreset)) ||
			!shouldHideField(
				formatEnumValue(activeProfile.bodyType, bodyTypeLabels, t),
			) ||
			!shouldHideField(
				formatEnumValue(activeProfile.ethnicity, ethnicityLabels, t),
			) ||
			!shouldHideField(
				formatEnumValue(
					activeProfile.relationshipStatus,
					relationshipStatusLabels,
					t
				),
			)
		);
	}, [activeProfile, t, unitsPreset]);

	const hasSocialFields = useMemo(() => {
		if (!activeProfile) return false;
		return Boolean(
			activeProfile.socialNetworks?.instagram?.userId ||
			activeProfile.socialNetworks?.twitter?.userId ||
			activeProfile.socialNetworks?.facebook?.userId,
		);
	}, [activeProfile]);

	const hasTagsContent = useMemo(() => {
		if (!activeProfile) return false;
		return activeProfile.profileTags.length > 0;
	}, [activeProfile?.profileTags.length]);

	const hasAboutContent = useMemo(() => {
		if (!activeProfile) return false;
		return Boolean(activeProfile.aboutMe?.trim());
	}, [activeProfile?.aboutMe]);

	const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(
		null,
	);

	const [mobileCarouselPhotoIndex, setMobileCarouselPhotoIndex] = useState(0);
	const [isDesktopLike, setIsDesktopLike] = useState(() => {
		if (typeof window === "undefined") {
			return true;
		}
		return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	});
	const [isModalSplit, setIsModalSplit] = useState(() =>
		typeof window !== "undefined" && window.innerWidth >= 900
	);
	const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
	const carouselIndexRef = useRef(0);
	const carouselTotalRef = useRef(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const pageWrapRef = useRef<HTMLDivElement | null>(null);
	const [profileSwipeDelta, setProfileSwipeDelta] = useState(0);
	const profileSwipeRef = useRef({ startX: 0, startY: 0, decided: false, horizontal: false, dragging: false, lastDelta: 0 });
	const [headerOpacity, setHeaderOpacity] = useState(0);
	const [headerFadeDuration, setHeaderFadeDuration] = useState(0);
	const inlineScrolled = headerOpacity > 0.5;
	const [carouselDragDelta, setCarouselDragDelta] = useState(0);
	const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
	const [banBioPrompt, setBanBioPrompt] = useState<{ text: string } | null>(null);
	const [banNamePrompt, setBanNamePrompt] = useState<{ text: string } | null>(null);
	const [quickMessageDraft, setQuickMessageDraft] = useState("");
	const [barTapPickerOpen, setBarTapPickerOpen] = useState(false);
	const [barInputVisible, setBarInputVisible] = useState(true);
	const [barTapHoverId, setBarTapHoverId] = useState<number | null>(null);
	const [barTapFlyEmoji, setBarTapFlyEmoji] = useState<{ id: number; key: number; originDx: number; originDy: number; particles: { dx: number; dy: number; size: number; dur: number; delay: number; emoji?: string }[] } | null>(null);
	const barTapLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const barTapStickyRef = useRef(false);
	const barTapSkipUpRef = useRef(false);
	const barInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const barTapOptionsRef = useRef<HTMLDivElement>(null);
	const barTapButtonRef = useRef<HTMLButtonElement>(null);
	const controlsBarRef = useRef<HTMLDivElement>(null);
	const actionsMenuRef = useRef<HTMLDivElement>(null);

	const [profileNote, setProfileNote] = useState("");
	const [profilePhoneNumber, setProfilePhoneNumber] = useState("");
	const [isLoadingNote, setIsLoadingNote] = useState(false);
	const [isEditingNote, setIsEditingNote] = useState(false);
	const [noteDraft, setNoteDraft] = useState("");
	const [phoneNumberDraft, setPhoneNumberDraft] = useState("");
	const [isSavingNote, setIsSavingNote] = useState(false);

	useEffect(() => {
		if (!messageProfileId || isOwnProfile || !isFavorite) {
			setProfileNote("");
			setProfilePhoneNumber("");
			setIsEditingNote(false);
			return;
		}

		let cancelled = false;
		setIsLoadingNote(true);
		setProfileNote("");
		setProfilePhoneNumber("");
		setIsEditingNote(false);

		apiFunctions.getProfileNote(String(messageProfileId))
			.then((data) => {
				if (!cancelled) {
					setProfileNote(data.notes ?? "");
					setProfilePhoneNumber(data.phoneNumber ?? "");
				}
			})
			.catch(() => {})
			.finally(() => {
				if (!cancelled) setIsLoadingNote(false);
			});

		return () => { cancelled = true; };
	}, [messageProfileId, isOwnProfile, isFavorite]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleSaveNote = async () => {
		if (!messageProfileId) return;
		setIsSavingNote(true);
		try {
			await apiFunctions.saveProfileNote(String(messageProfileId), {
				notes: noteDraft,
				phoneNumber: phoneNumberDraft,
			});
			setProfileNote(noteDraft);
			setProfilePhoneNumber(phoneNumberDraft);
			setIsEditingNote(false);
			toast.success(t("favorites.note_saved"));
		} catch {
			toast.error(t("favorites.save_note_failed"));
		} finally {
			setIsSavingNote(false);
		}
	};

	const handleDeleteNote = async () => {
		if (!messageProfileId) return;
		setIsSavingNote(true);
		try {
			await apiFunctions.deleteProfileNote(String(messageProfileId));
			setProfileNote("");
			setProfilePhoneNumber("");
			setIsEditingNote(false);
			toast.success(t("favorites.note_deleted"));
		} catch {
			toast.error(t("favorites.delete_note_failed"));
		} finally {
			setIsSavingNote(false);
		}
	};

	const hasBio = Boolean(activeProfile?.aboutMe?.trim());

	const handleBanBioPhrase = () => {
		setIsActionsMenuOpen(false);
		const bio = activeProfile?.aboutMe || "";
		if (!bio.trim()) { return; }
		setBanBioPrompt({ text: bio });
	};

	const actualProfileName = activeProfile?.displayName?.trim() || "";

	const handleBanProfileName = () => {
		setIsActionsMenuOpen(false);
		if (!actualProfileName) { return; }
		setBanNamePrompt({ text: actualProfileName });
	};

	const notesSectionJsx = isFavorite && !isOwnProfile ? (
		<div className="px-3">
			{/* Header row */}
			<div className="mb-2.5 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
						{t("favorites.note_section_title")}
					</p>
					{isLoadingNote && (
						<div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
					)}
				</div>
				{isEditingNote ? (
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={handleSaveNote}
							disabled={isSavingNote}
							className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--accent-contrast)] transition hover:opacity-90 disabled:opacity-50"
						>
							<Check className="h-3 w-3" />
							{t("common.save")}
						</button>
						<button
							type="button"
							onClick={() => setIsEditingNote(false)}
							disabled={isSavingNote}
							className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-50"
						>
							<X className="h-3 w-3" />
							{t("common.cancel")}
						</button>
					</div>
				) : (
					<button
						type="button"
						onClick={() => { setNoteDraft(profileNote); setPhoneNumberDraft(profilePhoneNumber); setIsEditingNote(true); }}
						disabled={isLoadingNote}
						className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition hover:text-[var(--text)]"
					>
						<Pencil className="h-3 w-3" />
						{t("common.edit")}
					</button>
				)}
			</div>

			{/* Body */}
			{isEditingNote ? (
				<div className="space-y-2">
					<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)] transition-colors focus-within:border-[var(--accent)]">
						<div className="flex items-start gap-2.5 px-3 pt-3 pb-2">
							<StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
							<textarea
								autoFocus
								value={noteDraft}
								onChange={(e) => setNoteDraft(e.target.value)}
								placeholder={t("favorites.note_placeholder")}
								rows={3}
								className="min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
							/>
						</div>
						<div className="flex items-center gap-2.5 border-t border-[var(--border)] px-3 py-2.5">
							<Phone className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
							<input
								type="tel"
								value={phoneNumberDraft}
								onChange={(e) => setPhoneNumberDraft(e.target.value)}
								placeholder={t("favorites.phone_number_placeholder")}
								className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
							/>
						</div>
					</div>
					{(profileNote || profilePhoneNumber) && (
						<div className="flex justify-end">
							<button
								type="button"
								onClick={handleDeleteNote}
								disabled={isSavingNote}
								className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10 disabled:opacity-50"
							>
								<Trash2 className="h-3 w-3" />
								{t("favorites.delete_note")}
							</button>
						</div>
					)}
				</div>
			) : profileNote ? (
				<div className="space-y-1.5">
					<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
						<p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)] select-text">{profileNote}</p>
					</div>
					{profilePhoneNumber && (
						<div className="flex min-h-10 items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3">
							<Phone className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
							<span className="text-sm text-[var(--text)] select-text">{profilePhoneNumber}</span>
						</div>
					)}
				</div>
			) : (
				<button
					type="button"
					onClick={() => { setNoteDraft(""); setPhoneNumberDraft(""); setIsEditingNote(true); }}
					disabled={isLoadingNote}
					className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--border)] px-4 py-3 text-left transition hover:border-[var(--accent)]/60 hover:bg-[var(--surface-2)]"
				>
					<StickyNote className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
					<span className="text-sm text-[var(--text-muted)]">{t("favorites.note_empty")}</span>
				</button>
			)}
		</div>
	) : null;

	const barTapEmoji = (id: number) => id === 0 ? "👋" : id === 2 ? "😈" : "🔥";
    const barTapParticleColor = (id: number) => id === 0 ? "rgba(234,179,8,0.9)" : id === 2 ? "rgba(168,85,247,0.9)" : "rgba(249,115,22,0.9)";
const barTapGlow = (id: number) => id === 0 ? "drop-shadow(0 0 10px rgba(234,179,8,0.95))" : id === 2 ? "drop-shadow(0 0 10px rgba(168,85,247,0.95))" : "drop-shadow(0 0 10px rgba(249,115,22,0.95))";
	const makeParticles = (tapId?: number) => {
		const dots = Array.from({ length: 28 }, (_, i) => {
			const angle = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
			const dist = Math.random() * 280 + 160;
			return {
				dx: Math.cos(angle) * dist,
				dy: Math.sin(angle) * dist,
				size: Math.random() * 10 + 4,
				dur: Math.random() * 0.45 + 0.4,
				delay: Math.random() * 0.08 + 0.62,
			};
		});
		const eggplants = tapId === 2 ? Array.from({ length: 6 }, (_, i) => {
			const angle = (i / 6) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
			const dist = Math.random() * 260 + 140;
			return {
				dx: Math.cos(angle) * dist,
				dy: Math.sin(angle) * dist,
				size: 24,
				dur: Math.random() * 0.3 + 1.0,
				delay: Math.random() * 0.1 + 0.64,
				emoji: "🍆",
			};
		}) : [];
		return [...dots, ...eggplants];
	};

	const isDesktopBar = variant !== "page";

	const handleBarTapPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (isTapDisabled) return;
		if (barTapPickerOpen && isDesktopBar) {
			// Button acts as close (X) when picker already open on desktop
			barTapSkipUpRef.current = true;
			setBarTapPickerOpen(false);
			setBarTapHoverId(null);
			barTapStickyRef.current = false;
			barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210);
			return;
		}
		e.currentTarget.setPointerCapture(e.pointerId);
		barTapLongPressRef.current = setTimeout(() => {
			barTapStickyRef.current = isDesktopBar;
			setBarTapPickerOpen(true);
			setBarInputVisible(false);
			if (barInputTimerRef.current) clearTimeout(barInputTimerRef.current);
			const bridge = (window as any).FreeGrindBridge;
			bridge?.vibrate?.(10) ?? navigator.vibrate?.(10);
		}, 300);
	};

	const handleBarTapPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (!barTapPickerOpen || barTapStickyRef.current) return;
		const container = barTapOptionsRef.current;
		let newId: number | null = null;
		if (container) {
			const rect = container.getBoundingClientRect();
			if (e.clientX >= rect.left && e.clientX <= rect.right) {
				const ids = [0, 2, 1];
				const index = Math.min(Math.floor((e.clientX - rect.left) / (rect.width / 3)), 2);
				newId = ids[index];
			}
		}
		if (newId !== barTapHoverId) {
			setBarTapHoverId(newId);
			if (newId !== null) {
				const bridge = (window as any).FreeGrindBridge;
				bridge?.vibrate?.(8) ?? navigator.vibrate?.(8);
			}
		}
	};

	const fireTap = (tapId: number) => {
		if (!onTapProfile || !messageProfileId || isTapBlocked) return;
		const bridge = (window as any).FreeGrindBridge;
		bridge?.vibrate?.(30) ?? navigator.vibrate?.([15, 10, 25]);
		onTapProfile(String(messageProfileId), tapId);
		const btnRect = barTapButtonRef.current?.getBoundingClientRect();
		const originDx = btnRect ? btnRect.left + btnRect.width / 2 - window.innerWidth / 2 : window.innerWidth / 2 - 110;
		const originDy = btnRect ? btnRect.top + btnRect.height / 2 - window.innerHeight / 2 : window.innerHeight / 2 - 80;
		setBarTapFlyEmoji({ id: tapId, key: Date.now(), originDx, originDy, particles: makeParticles(tapId) });
		setBarTapPickerOpen(false);
		setBarTapHoverId(null);
		barTapStickyRef.current = false;
		barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210);
	};

	const handleBarTapPointerUp = (_e: React.PointerEvent<HTMLButtonElement>) => {
		if (isTapDisabled) return;
		if (barTapSkipUpRef.current) {
			barTapSkipUpRef.current = false;
			return;
		}
		if (barTapLongPressRef.current) {
			clearTimeout(barTapLongPressRef.current);
			barTapLongPressRef.current = null;
		}
		if (barTapPickerOpen && !barTapStickyRef.current) {
			if (barTapHoverId !== null) {
				fireTap(barTapHoverId);
			} else {
				setBarTapPickerOpen(false);
				setBarTapHoverId(null);
				barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210);
			}
		} else if (!barTapPickerOpen && !isTapActive) {
			fireTap(1);
		}
	};

	useEffect(() => {
		if (!barTapFlyEmoji) return;
		const timer = setTimeout(() => setBarTapFlyEmoji(null), 1400);
		return () => clearTimeout(timer);
	}, [barTapFlyEmoji]);

	useEffect(() => {
		if (!isActionsMenuOpen) return;
		const handler = (e: MouseEvent) => {
			if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
				setIsActionsMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [isActionsMenuOpen]);

	useEffect(() => {
		const el = scrollContainerRef.current;
		if (!el || (variant === "modal" && isModalSplit)) return;
		setHeaderOpacity(0);
		setHeaderFadeDuration(0);
		let lastScrollTop = 0;
		const onScroll = () => {
			const scrollTop = el.scrollTop;
			const scrollingDown = scrollTop > lastScrollTop;
			lastScrollTop = scrollTop;
			setHeaderFadeDuration(scrollingDown ? 0 : 400);
			setHeaderOpacity(Math.min(scrollTop / 150, 1));
		};
		el.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			el.removeEventListener("scroll", onScroll);
			setHeaderOpacity(0);
			setHeaderFadeDuration(0);
		};
	}, [isOpen, isModalSplit, variant]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
        const el = pageWrapRef.current;

        if (
            !el ||
            !isOpen ||
            selectedPhotoIndex !== null ||
            variant !== "page" ||
            (!onPrevProfile && !onNextProfile)
        ) {
            return;
        }

		const s = profileSwipeRef.current;

		const onStart = (e: TouchEvent) => {
			if (controlsBarRef.current?.contains(e.target as Node)) return;
			s.startX = e.touches[0].clientX;
			s.startY = e.touches[0].clientY;
			s.decided = false;
			s.horizontal = false;
			s.dragging = false;
			s.lastDelta = 0;
		};

		const onMove = (e: TouchEvent) => {
			const dx = e.touches[0].clientX - s.startX;
			const dy = e.touches[0].clientY - s.startY;
			if (!s.decided) {
				if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
				s.decided = true;
				s.horizontal = Math.abs(dx) >= Math.abs(dy);
			}
			if (!s.horizontal) return;
			e.preventDefault();
			s.dragging = true;
			s.lastDelta = dx;
			setProfileSwipeDelta(dx);
		};

		const onEnd = () => {
			if (!s.dragging) return;
			s.dragging = false;
			s.horizontal = false;
			const dx = s.lastDelta;
			s.lastDelta = 0;
			setProfileSwipeDelta(0);
			if (dx < -80) onNextProfile?.();
			else if (dx > 80) onPrevProfile?.();
		};

		el.addEventListener("touchstart", onStart, { passive: true });
		el.addEventListener("touchmove", onMove, { passive: false });
		el.addEventListener("touchend", onEnd, { passive: true });
		el.addEventListener("touchcancel", onEnd, { passive: true });
		return () => {
			el.removeEventListener("touchstart", onStart);
			el.removeEventListener("touchmove", onMove);
			el.removeEventListener("touchend", onEnd);
			el.removeEventListener("touchcancel", onEnd);
		};
	}, [
        isOpen,
        selectedPhotoIndex,
        variant,
        onNextProfile,
        onPrevProfile,
    ]);

	useModalClose({ isOpen, onClose });
	const handleBackdropClose = useMemo(
		() => createBackdropCloseHandler(onClose),
		[onClose],
	);

	useEffect(() => {
		if (!isOpen) {
			setSelectedPhotoIndex(null);
		}
	}, [isOpen]);

	useEffect(() => {
		setSelectedPhotoIndex(null);
		setMobileCarouselPhotoIndex(0);
	}, [activeProfile?.profileId, activeProfilePhotoHashes.length]);

	useEffect(() => {
		const query = window.matchMedia("(hover: hover) and (pointer: fine)");
		const update = () => setIsDesktopLike(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		const update = () => setIsModalSplit(window.innerWidth >= 900);
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);

	// Keep refs in sync so the wheel handler always sees current values
	carouselIndexRef.current = mobileCarouselPhotoIndex;

	useEffect(() => {
		const el = mobileCarouselRef.current;
		if (!el || isModalSplit) return;
		const onWheel = (e: WheelEvent) => {
			const idx = carouselIndexRef.current;
			const total = carouselTotalRef.current;
			if (e.deltaY > 0 && idx < total - 1) {
				e.preventDefault();
				setMobileCarouselPhotoIndex((i) => Math.min(i + 1, total - 1));
			} else if (e.deltaY < 0 && idx > 0) {
				e.preventDefault();
				setMobileCarouselPhotoIndex((i) => Math.max(i - 1, 0));
			}
			// At boundary: don't preventDefault → scroll propagates normally
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [isModalSplit]);

	const photoCreatedAtByHash = useMemo(() => {
		if (!activeProfile) {
			return {} as Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }>;
		}

		const createdMap: Record<string, { createdAt: number | null; takenOnGrindr: boolean | null }> = {};
		for (const media of activeProfile.medias) {
			const hash = media.mediaHash;
			if (!hash) {
				continue;
			}

			createdMap[hash] = {
				createdAt: normalizeMediaCreatedAt(media.createdAt),
				takenOnGrindr: media.takenOnGrindr ?? null,
			};
		}

		return createdMap;
	}, [activeProfile]);

	const hasRightNowSlide = !!(
		activeProfile &&
		!shouldHideField(activeProfile.rightNowText?.trim()) &&
		(activeProfile.rightNowFullImageUrl || activeProfile.rightNowThumbnailUrl)
	);
	const rightNowSlideUrl = activeProfile?.rightNowFullImageUrl || activeProfile?.rightNowThumbnailUrl || null;

	// Lazily checked once this profile's detail view is open (not per grid
	// tile) — hasAlbum is sticky (stays true once we've ever locally cached
	// an album for this profile), hasSharedWithMe always reflects the latest
	// live check and drives the lock-vs-cover decision on the slide.
	const albumStatus = useProfileAlbumStatus(
		messageProfileId != null ? String(messageProfileId) : null,
		!isOwnProfile && messageProfileId != null,
	);

	// True only when there's genuinely nothing photo-like to show for this
	// profile yet — mirrors the pre-album condition that used to gate the
	// standalone default-avatar placeholder, so that behavior (no separate
	// placeholder once a Right Now slide already fills that role) is unchanged.
	const showDefaultProfileSlide = activeProfilePhotoHashes.length === 0 && !hasRightNowSlide;

	// The photo set shown in both carousels and the full-screen viewer: the
	// default-avatar placeholder (if there's no real photo or Right Now slide
	// to show instead) first, then the Right Now post's image (if any), then
	// the profile's own photos, then the album slide (if any) last.
	const carouselHashes = useMemo(() => {
		const base = hasRightNowSlide ? [RIGHT_NOW_SLIDE_HASH, ...activeProfilePhotoHashes] : activeProfilePhotoHashes;
		const withDefault = showDefaultProfileSlide ? [DEFAULT_PROFILE_SLIDE_HASH, ...base] : base;
		return albumStatus.hasAlbum ? [...withDefault, ALBUM_SLIDE_HASH] : withDefault;
	}, [hasRightNowSlide, activeProfilePhotoHashes, albumStatus.hasAlbum, showDefaultProfileSlide]);
	const getSlideImageUrl = (hash: string) => {
		if (hash === RIGHT_NOW_SLIDE_HASH) return rightNowSlideUrl ?? "";
		if (hash === ALBUM_SLIDE_HASH) return albumStatus.coverUrl ?? "";
		if (hash === DEFAULT_PROFILE_SLIDE_HASH) return "";
		return getProfileImageUrl(hash, "1024x1024");
	};
	const isRightNowSlideActive = carouselHashes[mobileCarouselPhotoIndex] === RIGHT_NOW_SLIDE_HASH;
	carouselTotalRef.current = carouselHashes.length;

	// Excludes the album and default-avatar slides (always last/first, if
	// present) — neither opens this generic photo viewer (album opens the
	// album viewer, the default slide has no real photo to show fullscreen),
	// and since PhotoViewer wraps navigation with modulo, leaving them in
	// would let swiping past the boundary land on an unstyled "photo".
	const photoUrls = useMemo(() => {
		return carouselHashes
			.filter((hash) => hash !== ALBUM_SLIDE_HASH && hash !== DEFAULT_PROFILE_SLIDE_HASH)
			.map((hash) => getSlideImageUrl(hash));
	}, [carouselHashes, rightNowSlideUrl]);

	const renderPhotoExtraInfo = useCallback(
		(index: number) => {
			const hash = carouselHashes[index];

			if (hash === RIGHT_NOW_SLIDE_HASH) {
				return (
					<p
						className="inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold ring-1 ring-white/25"
						style={{ color: "var(--right-now)" }}
					>
						<Zap className="h-3.5 w-3.5" />
						<span>{t("profile_details.right_now")}</span>
					</p>
				);
			}

			const meta = photoCreatedAtByHash[hash];
			if (!meta?.takenOnGrindr && !meta?.createdAt) return null;

			return (
				<p className="inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
                    <style>{`
                        @keyframes logo-shine { 0%, 100% { filter: drop-shadow(0 0 2px rgba(255,140,0,0.3)) brightness(1); } 50% { filter: drop-shadow(0 0 7px rgba(255,140,0,0.95)) brightness(1.25); } }
                        .logo-shine { animation: logo-shine 2.8s ease-in-out infinite; }
                    `}</style>
					{meta.takenOnGrindr ? (
						<img
							src={freegrindLogo}
							alt={t("chat.thread.taken_on_grindr")}
							className="h-3.5 w-3.5 rounded-full logo-shine"
						/>
					) : null}
					{meta.createdAt ? (
						<span>{formatDateTime24(meta.createdAt)}</span>
					) : null}
				</p>
			);
		},
		[carouselHashes, photoCreatedAtByHash, t],
	);

	const renderPhotoFooter = useCallback(
		(index: number) => {
			const hash = carouselHashes[index];
			if (hash === RIGHT_NOW_SLIDE_HASH || !onSendProfilePhotoReply || !messageProfileId || isOwnProfile) {
				return null;
			}
			return (
				<PhotoActionBar
					onSendText={(text) => onSendProfilePhotoReply(String(messageProfileId), hash, text)}
				/>
			);
		},
		[carouselHashes, onSendProfilePhotoReply, messageProfileId, isOwnProfile],
	);

	const openPhotoViewer = (index: number) => {
		setSelectedPhotoIndex(index);
	};

	const closePhotoViewer = () => {
		setSelectedPhotoIndex(null);
	};

	// Own profile pictures aren't worth their own subfolder — there's only
	// ever one "me" to organize by. Someone else's photos get filed under
	// their profile id so saved pictures land sorted by person instead of
	// all dumped in one flat folder.
	const photoViewerFolderKey = !isOwnProfile && messageProfileId != null ? String(messageProfileId) : null;

	const [isSavingAllPhotos, setIsSavingAllPhotos] = useState(false);

	const handleSaveAllPhotos = useCallback(async () => {
		if (isSavingAllPhotos || photoUrls.length === 0) return;
		setIsSavingAllPhotos(true);
		try {
			await saveAllMedia(
				photoUrls.map((url) => ({ url, type: "image" as const })),
				photoViewerFolderKey,
				t,
			);
		} finally {
			setIsSavingAllPhotos(false);
		}
	}, [isSavingAllPhotos, photoUrls, photoViewerFolderKey, t]);

	const photoMenuActions = useMemo<PhotoViewerMenuAction[]>(() => [
		{
			key: "save-all",
			label: t("profile_details.save_all"),
			icon: Images,
			onClick: () => void handleSaveAllPhotos(),
			disabled: isSavingAllPhotos || photoUrls.length === 0,
		},
	], [t, handleSaveAllPhotos, isSavingAllPhotos, photoUrls.length]);

	const photoViewerOverlay = selectedPhotoIndex !== null && (
		<PhotoViewer
			isOpen={true}
			onClose={closePhotoViewer}
			photos={photoUrls}
			initialIndex={selectedPhotoIndex}
			renderExtraInfo={renderPhotoExtraInfo}
			renderFooter={renderPhotoFooter}
			conversationId={photoViewerFolderKey}
			menuActions={photoMenuActions}
		/>
	);

	// Opening the album shared with this profile — mirrors
	// SharedAlbumsPage.tsx's openViewer: mark it opened, fetch full content,
	// fall back to whatever's already cached locally if the live fetch fails,
	// and eagerly capture it so it survives the share later expiring.
	const [albumViewer, setAlbumViewer] = useState<AlbumViewer | null>(null);
	const [albumViewerIndex, setAlbumViewerIndex] = useState(0);
	const [isOpeningAlbum, setIsOpeningAlbum] = useState(false);
	const [isSavingAllAlbumMedia, setIsSavingAllAlbumMedia] = useState(false);
	const albumViewerOpenRef = useRef(false);
	albumViewerOpenRef.current = albumViewer != null;

	useEffect(() => {
		const onPopState = () => {
			if (albumViewerOpenRef.current && !(window.history.state as { profileAlbumViewer?: boolean } | null)?.profileAlbumViewer) {
				setAlbumViewer(null);
				setAlbumViewerIndex(0);
			}
		};
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	const closeAlbumViewer = useCallback(() => {
		const state = window.history.state as Record<string, unknown> | null;
		if (state?.profileAlbumViewer) {
			const { profileAlbumViewer: _omit, ...rest } = state;
			window.history.replaceState(rest, "");
		}
		setAlbumViewer(null);
		setAlbumViewerIndex(0);
	}, []);

	const handleAlbumViewerIndexChange = useCallback((index: number) => {
		setAlbumViewerIndex((prev) => (prev === index ? prev : index));
	}, []);

	const handleSaveAllAlbumMedia = useCallback(async () => {
		if (!albumViewer || isSavingAllAlbumMedia) return;
		setIsSavingAllAlbumMedia(true);
		try {
			await saveAllAlbumMedia(albumViewer, t);
		} finally {
			setIsSavingAllAlbumMedia(false);
		}
	}, [albumViewer, isSavingAllAlbumMedia, t]);

	const albumMenuActions = useMemo<PhotoViewerMenuAction[]>(() => {
		if (!albumViewer) return [];
		return [
			{
				key: "save-all",
				label: t("profile_details.save_all"),
				icon: Images,
				onClick: () => void handleSaveAllAlbumMedia(),
				disabled: isSavingAllAlbumMedia || albumViewer.content.length === 0,
			},
		];
	}, [albumViewer, isSavingAllAlbumMedia, t, handleSaveAllAlbumMedia]);

	const sendAlbumContentReaction = useCallback(
		async (albumId: number, albumContentId: number, targetProfileId: number) => {
			try {
				await apiFunctions.sendMessage({
					type: "AlbumContentReaction",
					target: { type: "Direct", targetId: targetProfileId },
					body: { albumId, albumContentId },
				});
				toast.success(t("chat.toasts.album_reaction_sent", { defaultValue: "Reaction sent" }));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			}
		},
		[apiFunctions, t],
	);

	const sendAlbumContentReply = useCallback(
		async (
			albumId: number,
			albumContentId: number,
			contentType: string | null | undefined,
			targetProfileId: number,
			text: string,
		) => {
			try {
				await apiFunctions.sendMessage({
					type: "AlbumContentReply",
					target: { type: "Direct", targetId: targetProfileId },
					body: { albumId, albumContentId, albumContentReply: text, contentType: contentType ?? "image/jpeg" },
				});
				toast.success(t("chat.toasts.album_reply_sent", { defaultValue: "Reply sent" }));
			} catch (error) {
				toast.error(error instanceof Error ? error.message : t("chat.errors.send_failed"));
			}
		},
		[apiFunctions, t],
	);

	const albumHeader = useMemo(() => {
		if (!albumViewer) return undefined;
		return {
			avatarUrl: albumViewer.profileMediaHash
				? getProfileImageUrl(albumViewer.profileMediaHash, "320x320")
				: null,
			name: albumViewer.profileName,
			subtitle: [profileStatusLabel, profileDistance != null ? formatDistance(profileDistance, t, unitsPreset) : null]
				.filter(Boolean)
				.join(" · ") || null,
			isOnline: profileStatusMeta.isOnline,
		};
	}, [albumViewer, profileStatusLabel, profileDistance, profileStatusMeta.isOnline, t, unitsPreset]);

	const handleAlbumSlideClick = useCallback(async () => {
		if (!albumStatus.hasSharedWithMe || albumStatus.albumId == null || isOpeningAlbum || messageProfileId == null) {
			return;
		}
		const albumId = albumStatus.albumId;
		const profileIdNum = Number(messageProfileId);
		setIsOpeningAlbum(true);
		try {
			await apiFunctions.openSharedAlbum({ albumId });
			const details = await apiFunctions.getAlbum(albumId);
			setAlbumViewer({
				albumId: details.albumId,
				albumName: details.albumName,
				profileId: profileIdNum,
				profileName: activeProfileName,
				profileMediaHash: activeProfilePhotoHashes[0] ?? null,
				onlineUntil: profileOnlineUntil,
				distanceMetres: profileDistance,
				conversationId: null,
				content: details.content,
			});
			setAlbumViewerIndex(0);
			if (!(window.history.state as { profileAlbumViewer?: boolean } | null)?.profileAlbumViewer) {
				window.history.pushState({ ...(window.history.state as object | null), profileAlbumViewer: true }, "");
			}
			void captureAlbum({
				albumId: details.albumId,
				albumName: details.albumName,
				content: details.content,
				ownerProfileId: String(messageProfileId),
				conversationId: null,
				sharedViaMessageId: null,
				remainingViews: null,
				isViewable: true,
			});
		} catch (error) {
			const local = await getLocalAlbum(albumId).catch(() => null);
			if (local && local.content.length > 0) {
				setAlbumViewer({
					albumId: local.albumId,
					albumName: local.albumName,
					profileId: profileIdNum,
					profileName: activeProfileName,
					profileMediaHash: activeProfilePhotoHashes[0] ?? null,
					onlineUntil: profileOnlineUntil,
					distanceMetres: profileDistance,
					conversationId: null,
					content: local.content,
				});
				setAlbumViewerIndex(0);
				if (!(window.history.state as { profileAlbumViewer?: boolean } | null)?.profileAlbumViewer) {
					window.history.pushState({ ...(window.history.state as object | null), profileAlbumViewer: true }, "");
				}
			} else {
				toast.error(error instanceof Error ? error.message : t("shared_albums.error_open_fallback"));
			}
		} finally {
			setIsOpeningAlbum(false);
		}
	}, [albumStatus.hasSharedWithMe, albumStatus.albumId, isOpeningAlbum, apiFunctions, messageProfileId, activeProfileName, activeProfilePhotoHashes, profileOnlineUntil, profileDistance, t]);

	const albumViewerPhotos = useMemo(() => {
		if (!albumViewer) return [];
		return albumViewer.content.map((item) => ({
			url: item.url || item.thumbUrl || item.coverUrl || "",
			type: (item.contentType?.startsWith("video/") ? "video" : "image") as "image" | "video",
		}));
	}, [albumViewer]);

	const albumOpeningOverlay = isOpeningAlbum && (
		<div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/50 p-4">
			<div className="surface-card p-4 text-sm text-[var(--text-muted)]">{t("shared_albums.opening")}</div>
		</div>
	);

	const albumViewerOverlay = albumViewer && (
		<PhotoViewer
			isOpen={true}
			onClose={closeAlbumViewer}
			photos={albumViewerPhotos}
			initialIndex={albumViewerIndex}
			onIndexChange={handleAlbumViewerIndexChange}
			menuActions={albumMenuActions}
			albumHeader={albumHeader}
			contentWarning={showAlbumSensitiveContentWarning}
			renderFooter={(idx) => {
				const item = albumViewer.content[idx];
				if (!item || messageProfileId == null || isOwnProfile) return null;
				const targetProfileId = Number(messageProfileId);
				return (
					<PhotoActionBar
						onSendText={(text) =>
							sendAlbumContentReply(albumViewer.albumId, item.contentId, item.contentType, targetProfileId, text)
						}
						onReact={() => sendAlbumContentReaction(albumViewer.albumId, item.contentId, targetProfileId)}
					/>
				);
			}}
		/>
	);

	// Shared between both the mobile/inline and split-desktop carousel
	// blocks below — renders a slide's tappable content for a given hash,
	// swapping in the album cover/lock overlay in place of a plain photo.
	const renderCarouselSlideContent = (hash: string, index: number) => {
		if (hash === DEFAULT_PROFILE_SLIDE_HASH) {
			// Non-interactive, same as the old standalone placeholder — there's
			// no real photo behind this slide to open a viewer for.
			return (
				<ProfileImage alt={t("profile_details.default_profile")} className="h-full w-full object-cover" />
			);
		}

		if (hash === ALBUM_SLIDE_HASH) {
			const isLocked = !albumStatus.hasSharedWithMe;
			const primaryPhotoHash = activeProfilePhotoHashes[0];
			const showAlbumCover = !isLocked && !!albumStatus.coverUrl;
			return (
				<>
					<button
						type="button"
						onClick={() => void handleAlbumSlideClick()}
						className="absolute inset-0 z-10"
						aria-label={t(isLocked ? "profile_details.album_locked" : "profile_details.open_shared_album")}
					/>
					{showAlbumCover ? (
						<img
							src={albumStatus.coverUrl ?? undefined}
							alt=""
							className="h-full w-full scale-110 object-cover blur-[2px] brightness-[0.55]"
						/>
					) : (
						<>
							{/* Locked (or cover not loaded yet) — frosted-glass backdrop of
							the profile's own picture (or the default avatar) instead of a
							flat black background. */}
							<ProfileImage
								src={primaryPhotoHash ? getProfileImageUrl(primaryPhotoHash, "1024x1024") : null}
								alt=""
								className="h-full w-full scale-110 object-cover blur-2xl brightness-[0.55]"
							/>
							<div className="pointer-events-none absolute inset-0 bg-black/25 backdrop-blur-sm" aria-hidden="true" />
						</>
					)}
					<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
						{isLocked ? (
							<div className="flex flex-col items-center gap-8">
								<LockKeyhole className="h-10 w-10 text-white/90 drop-shadow-lg" />
								<span className="text-xs font-bold uppercase tracking-wide text-white/90 drop-shadow-lg">
									{t("profile_details.album_locked_label")}
								</span>
							</div>
						) : (
							<div className="h-20 w-20 overflow-hidden rounded-full ring-2 ring-white/80 shadow-xl">
								<ProfileImage
									src={primaryPhotoHash ? getProfileImageUrl(primaryPhotoHash, "320x320") : null}
									alt=""
									className="h-full w-full object-cover"
								/>
							</div>
						)}
					</div>
				</>
			);
		}

		return (
			<>
				<button
					type="button"
					onClick={() => openPhotoViewer(index)}
					className="absolute inset-0 z-10"
					aria-label={t("profile_details.open_photo", { index: index + 1 })}
				/>
				<img
					src={getSlideImageUrl(hash)}
					alt={t("profile_details.photo_alt", { name: activeProfileName })}
					className="h-full w-full object-cover"
				/>
			</>
		);
	};

	const renderInlineLayout = () => (
		<>
			{/* Floating header — transparent over carousel, opaque after scrolling */}
			<div
				className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 sm:px-5"
				style={{
					paddingTop: variant === "page" ? "calc(env(safe-area-inset-top,0px) + 10px)" : "0.75rem",
					paddingBottom: "0.75rem",
				}}
			>
				<div
					className={`absolute inset-0 ${variant === "page" ? "bg-[var(--bg)]" : "bg-[var(--surface-2)]"} backdrop-blur-xl${inlineScrolled ? " border-b border-[var(--border)]" : ""}`}
					style={{ opacity: headerOpacity, transition: `opacity ${headerFadeDuration}ms ease-out` }}
					aria-hidden="true"
				/>
				<div className="pointer-events-auto relative flex w-full items-center gap-3">
					<button
						type="button"
						onClick={onClose}
						className={`shrink-0 rounded-xl border p-2 transition-colors ${inlineScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
						aria-label={t(variant === "page" ? "settings.back_to_browse" : "profile_details.close_profile_details")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div className={`min-w-0 flex-1${inlineScrolled ? "" : " drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"}`}>
						<div className="flex items-center gap-1.5 min-w-0">
							<p className={`truncate text-base font-semibold leading-tight${inlineScrolled ? "" : " text-white"}`}>{activeProfileName}</p>
							{usesFreegrind && (
								<FreeGrindBadge size="sm" title={t("profile_details.uses_free_grind")} />
							)}
							{activeProfile?.age != null && Number.isFinite(activeProfile.age) && (
								<span className={`shrink-0 text-sm${inlineScrolled ? " text-[var(--text-muted)]" : " text-white/70"}`}>{activeProfile.age}</span>
							)}
						</div>
						<p className={`text-xs leading-tight${inlineScrolled ? " text-[var(--text-muted)]" : " text-white/70"}`}>
							{[profileStatusLabel, profileDistance != null ? formatDistance(profileDistance, t, unitsPreset) : null].filter(Boolean).join(" · ")}
						</p>
					</div>
					{isOwnProfile && (
						<button
							type="button"
							onClick={() => navigate("/settings/profile-editor")}
							className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors ${inlineScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
							aria-label={t("profile_editor.edit_profile")}
						>
							<Pencil className="h-4 w-4" />
						</button>
					)}
					{messageProfileId && !isOwnProfile && (
						<div className="flex shrink-0 items-center gap-1.5">
							{onToggleFavoriteProfile && (
								<button
									type="button"
									onClick={() => onToggleFavoriteProfile(String(messageProfileId), isFavorite)}
									disabled={isTogglingFavorite}
									className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors disabled:opacity-60 ${
										isFavorite
											? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
											: inlineScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"
									}`}
									aria-label={isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
								>
									<Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
								</button>
							)}
							{(onBlockProfile || onUnblockProfile) && (
								<button
									type="button"
									onClick={() => isBlocked ? onUnblockProfile?.(String(messageProfileId)) : (messageProfileId && onBlockProfile?.(String(messageProfileId)))}
									disabled={isBlockingProfile}
									className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors disabled:opacity-60 ${
										isBlocked
											? inlineScrolled ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-red-400/60 bg-red-500/20 text-red-300 backdrop-blur-md"
											: inlineScrolled ? "border-red-500/40 bg-red-500/8 text-red-400 hover:border-red-500/70 hover:bg-red-500/15" : "border-red-400/50 bg-red-500/15 text-red-300 backdrop-blur-md hover:border-red-400/80"
									}`}
									aria-label={isBlocked ? t("profile_details.unblock") : t("profile_details.block")}
								>
									<Ban className="h-4 w-4" />
								</button>
							)}
							<div ref={actionsMenuRef} className="relative">
								<button
									type="button"
									onClick={() => setIsActionsMenuOpen((v) => !v)}
									className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors ${inlineScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
									aria-label="More actions"
									aria-expanded={isActionsMenuOpen}
								>
									<EllipsisVertical className="h-4 w-4" />
								</button>
								{isActionsMenuOpen && (
									<div className="absolute right-0 top-full z-50 mt-2 flex min-w-[190px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 shadow-lg">
										<div className="flex flex-col gap-1 px-2">
										<button
											type="button"
											disabled={isTriangleDisabled}
											onClick={() => { setIsActionsMenuOpen(false); if (messageProfileId) onTriangleProfile?.(String(messageProfileId)); }}
											className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
										>
											<Triangle className="mr-2 h-4 w-4 opacity-70" />
											{isLocatingProfile ? t("profile_details.locating") : t("profile_details.locate")}
										</button>
										</div>
										{(hasBio || actualProfileName) && <div className="h-px shrink-0 bg-[var(--border)]" />}
										{(hasBio || actualProfileName) && (
										<div className="flex flex-col gap-1 px-2">
										{hasBio && (
											<button
												type="button"
												onClick={handleBanBioPhrase}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
											>
												<Ban className="mr-2 h-4 w-4 opacity-70" />
												<span className="flex flex-col">
													<span>Add forbidden Keyword</span>
													<span className="text-xs text-[var(--text-muted)]">Bio Phrase</span>
												</span>
											</button>
										)}
										{actualProfileName && (
											<button
												type="button"
												onClick={handleBanProfileName}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
											>
												<Ban className="mr-2 h-4 w-4 opacity-70" />
												<span className="flex flex-col">
													<span>Add forbidden Keyword</span>
													<span className="text-xs text-[var(--text-muted)]">Profile Name</span>
												</span>
											</button>
										)}
										</div>
										)}
									</div>
								)}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Scrollable content — carousel first, profile details below */}
			<div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
				{isLoadingActiveProfile && (
					<div
						className="animate-pulse bg-[var(--surface-2)]"
						style={{ height: variant === "page" ? "min(78dvh, calc(100vw * 1.55))" : "min(55dvh, calc((100vw - 3rem) * 1.25))" }}
						aria-hidden="true"
					/>
				)}
				{!isLoadingActiveProfile && !activeProfileError && activeProfile && (
					<div
						ref={mobileCarouselRef}
						className="relative overflow-hidden bg-black"
						style={{ height: variant === "page" ? "min(78dvh, calc(100vw * 1.55))" : "min(55dvh, calc((100vw - 3rem) * 1.25))" }}
					>
						{isRightNowSlideActive && (
							<div
								className="pointer-events-none absolute inset-0 z-30"
								style={{ boxShadow: "inset 0 0 34px -10px color-mix(in srgb, color-mix(in srgb, var(--right-now), black 25%), transparent 35%)" }}
								aria-hidden="true"
							/>
						)}
						<div
							className="pointer-events-none absolute inset-x-0 top-0 z-10"
							style={{ height: "12rem", background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
							aria-hidden="true"
						/>
						{carouselHashes.map((hash, index) => (
							<div
								key={hash}
								className="absolute inset-0 overflow-hidden"
								style={{
									transform: `translateY(calc(${(index - mobileCarouselPhotoIndex) * 100}% + ${carouselDragDelta}px))`,
									transition: carouselDragDelta !== 0 ? "none" : "transform 300ms ease-out",
								}}
							>
								{renderCarouselSlideContent(hash, index)}
							</div>
						))}
						{activeProfile.lastReceivedTapTimestamp != null && (
							<div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-row items-center gap-1.5">
								<div className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
									<Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" />
									<span className="text-xs font-medium text-white">{formatRelativeTime(activeProfile.lastReceivedTapTimestamp)}</span>
								</div>
							</div>
						)}
						{carouselHashes.length > 1 && (
							<div className="absolute inset-y-0 right-3 z-20 flex flex-col items-center justify-center">
								<div className="flex flex-col items-center gap-1.5 rounded-full bg-black/30 px-[5px] py-[10px] backdrop-blur-sm">
									{carouselHashes.map((hash, index) => (
										<button
											key={`${hash}-dot`}
											type="button"
											onClick={() => setMobileCarouselPhotoIndex(index)}
											className="flex items-center justify-center p-1.5 -m-1.5"
											aria-label={t("profile_details.open_photo", { index: index + 1 })}
										>
											{hash === RIGHT_NOW_SLIDE_HASH ? (
												<span
													className="flex w-1.5 shrink-0 items-center justify-center overflow-visible transition-[height] duration-300 ease-out"
													style={{ height: index === mobileCarouselPhotoIndex ? "12px" : "6px" }}
												>
													<Zap
														className="h-3 w-3 shrink-0 scale-[0.55] transition-colors duration-150 ease-out"
														style={{ color: index === mobileCarouselPhotoIndex ? "var(--right-now)" : "rgba(255,255,255,0.4)" }}
														fill="currentColor"
													/>
												</span>
											) : hash === ALBUM_SLIDE_HASH ? (
												<span
													className="flex w-1.5 shrink-0 items-center justify-center overflow-visible transition-[height] duration-300 ease-out"
													style={{ height: index === mobileCarouselPhotoIndex ? "12px" : "6px" }}
												>
													<Album
														className="h-3 w-3 shrink-0 scale-[0.6] transition-colors duration-150 ease-out"
														style={{ color: index === mobileCarouselPhotoIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)" }}
													/>
												</span>
											) : (
												<span
													className={`w-1.5 rounded-full transition-[height,background-color] duration-300 ease-out ${
														index === mobileCarouselPhotoIndex ? "h-3 bg-white" : "h-1.5 bg-white/40"
													}`}
												/>
											)}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}
				<div className={`p-4 sm:p-5 ${variant === "page" ? "pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:pb-[calc(env(safe-area-inset-bottom,0px)+6rem)]" : "pb-28"}`}>
					{isLoadingActiveProfile ? (
						<ProfileDetailsSkeleton />
					) : activeProfileError ? (
						<p className="text-sm text-[var(--text-muted)]">{activeProfileError}</p>
					) : activeProfile ? (
						<ProfileDetailsContent
							activeProfile={activeProfile}
							activeProfilePhotoHashes={carouselHashes}
							isDesktopLike={isDesktopLike}
							showMobileCarousel={true}
							mobileCarouselRef={mobileCarouselRef}
							mobileCarouselPhotoIndex={mobileCarouselPhotoIndex}
							openPhotoViewer={openPhotoViewer}
							activeProfileName={activeProfileName}
							estimatedCreatedAt={estimatedCreatedAt}
							travelPlans={travelPlans}
							profileStatusLabel={profileStatusLabel}
							profileStatusLevel={profileStatusLevel}
							ownTags={ownTags}
							profileDistance={profileDistance}
							chatContactStatus={chatContactStatus ?? null}
							messageProfileId={messageProfileId}
							usesFreegrind={usesFreegrind ?? false}
							onMessageProfile={variant === "page" && !isOwnProfile ? onMessageProfile : undefined}
							onTapProfile={variant === "page" && !isOwnProfile ? onTapProfile : undefined}
							onTagClick={onTagClick}
							onPhotoIndexChange={setMobileCarouselPhotoIndex}
							onDragDeltaChange={setCarouselDragDelta}
							isTapDisabled={isTapDisabled}
							isTapBlocked={isTapBlocked}
							isTapActive={isTapActive}
							tapId={tapVisualState.tapId}
							tapButtonClassName={tapButtonClassName}
							hasTagsContent={hasTagsContent}
							hasAboutContent={hasAboutContent}
							hasExpectationsFields={hasExpectationsFields}
							hasHealthFields={hasHealthFields}
							hasStatsFields={hasStatsFields}
							hasSocialFields={hasSocialFields}
							formattedActiveGenders={formattedActiveGenders}
							formattedActivePronouns={formattedActivePronouns}
							lookingForLabels={lookingForLabels}
							meetAtLabels={meetAtLabels}
							nsfwLabels={nsfwLabels}
							tribeLabels={tribeLabels}
							hivStatusLabels={hivStatusLabels}
							sexualHealthLabels={sexualHealthLabels}
							vaccineLabels={vaccineLabels}
							sexualPositionLabels={sexualPositionLabels}
							bodyTypeLabels={bodyTypeLabels}
							ethnicityLabels={ethnicityLabels}
							relationshipStatusLabels={relationshipStatusLabels}
							extraTopSection={notesSectionJsx}
							hidePicturesSection={true}
						/>
					) : null}
				</div>
			</div>

			{/* Floating footer with gradient */}
			{messageProfileId && !isOwnProfile && (
				<div
					className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
					style={{
						paddingTop: "5rem",
						paddingBottom: variant === "page" ? "calc(env(safe-area-inset-bottom,0px) + 0.75rem)" : "0.75rem",
						background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)",
					}}
				>
					<div
						ref={controlsBarRef}
						className="pointer-events-auto flex items-center gap-1 px-3"
						onPointerDown={(e) => e.stopPropagation()}
					>
						<div className="relative min-w-0 flex-1" style={{ pointerEvents: barInputVisible ? "auto" : "none" }}>
							<div
								className="pointer-events-none absolute inset-0 rounded-xl backdrop-blur-md"
								style={{
									background: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
									border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
									opacity: barInputVisible ? 1 : 0,
									transition: barInputVisible ? "opacity 0.25s" : "opacity 0.12s",
								}}
							/>
							<input
								type="text"
								value={quickMessageDraft}
								onChange={(e) => setQuickMessageDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && quickMessageDraft.trim()) {
										onSendQuickMessage?.(String(messageProfileId), quickMessageDraft.trim());
										setQuickMessageDraft("");
									}
								}}
								placeholder={t("profile_details.quick_message_placeholder", "Message...")}
								className="relative h-11 w-full rounded-xl bg-transparent px-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
								style={{ opacity: barInputVisible ? 1 : 0, transition: barInputVisible ? "opacity 0.25s" : "opacity 0.12s" }}
							/>
						</div>
						<div
							className="transition-[max-width] duration-200 ease-out"
							style={{ maxWidth: barTapPickerOpen ? `${3 * 52}px` : "0px", overflowX: barTapPickerOpen ? "visible" : "clip", overflowY: "visible" }}
						>
							<div ref={barTapOptionsRef} className="flex items-center">
								{[0, 2, 1].map((id) => (
									<div
										key={id}
										data-tap-id={id}
										onClick={() => fireTap(id)}
										onMouseEnter={() => setBarTapHoverId(id)}
										onMouseLeave={() => setBarTapHoverId(null)}
										className={`flex h-11 w-13 cursor-pointer items-center justify-center text-2xl leading-none transition-all duration-150 ${barTapHoverId === id ? "origin-bottom scale-[2] opacity-100" : "opacity-60"}`}
										style={barTapHoverId === id ? { filter: barTapGlow(id) } : undefined}
									>
										{barTapEmoji(id)}
									</div>
								))}
							</div>
						</div>
						<button
							ref={barTapButtonRef}
							type="button"
							onPointerDown={handleBarTapPointerDown}
							onPointerMove={handleBarTapPointerMove}
							onPointerUp={handleBarTapPointerUp}
							onPointerCancel={() => { setBarTapPickerOpen(false); setBarTapHoverId(null); barTapStickyRef.current = false; if (barTapLongPressRef.current) clearTimeout(barTapLongPressRef.current); barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210); }}
							disabled={isTapDisabled}
							className={`tap-btn-base relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-2xl leading-none transition-all touch-none select-none ${isTappingProfile ? "opacity-40" : ""} ${barTapPickerOpen ? "text-[var(--text-muted)]" : isTapActive || barTapHoverId !== null ? "text-white" : "text-[var(--text-muted)]"}`}
							style={isTapBlocked ? { filter: barTapGlow(tapVisualState.tapId) } : !barTapPickerOpen && barTapHoverId !== null ? { filter: barTapGlow(barTapHoverId) } : undefined}
						>
							{barTapPickerOpen
								? <X className="h-5 w-5" strokeWidth={2} />
								: barTapHoverId !== null
									? barTapEmoji(barTapHoverId)
									: isTapActive
										? barTapEmoji(tapVisualState.tapId)
										: <Flame className="h-5 w-5" strokeWidth={1.8} />
							}
						</button>
						{(onMessageProfile || onSendQuickMessage) && (
							<button
								type="button"
								onClick={() => {
									if (quickMessageDraft.trim()) {
										onSendQuickMessage?.(String(messageProfileId), quickMessageDraft.trim());
										setQuickMessageDraft("");
									} else {
										onMessageProfile?.(String(messageProfileId));
									}
								}}
								className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-[var(--accent)] transition hover:brightness-110"
							>
								<span className="relative inline-flex">
									<MessageCircle className="h-5 w-5" strokeWidth={1.8} />
									{(chatContactStatus?.unreadCount ?? 0) > 0 && (
										<span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-contrast)] shadow-sm">
											{chatContactStatus?.unreadCount}
										</span>
									)}
								</span>
							</button>
						)}
					</div>
				</div>
			)}
		</>
	);

	if (!isOpen) {
		return null;
	}

	if (variant === "page") {
		return (
			<div className="app-screen relative flex h-dvh flex-col w-full !px-0 !pb-0 !pt-0 overflow-x-hidden bg-[var(--bg)]">
				<div
					ref={pageWrapRef}
					className="relative flex h-full flex-col"
					style={{
						transform: `translateX(${profileSwipeDelta}px)`,
						transition: profileSwipeDelta === 0 ? "transform 250ms ease-out" : "none",
					}}
				>
				{renderInlineLayout()}
				{photoViewerOverlay}
				{albumOpeningOverlay}
				{albumViewerOverlay}
				<PromptDialog
					isOpen={banBioPrompt !== null}
					title={t("profile_details.ban_bio_title")}
					message={t("profile_details.ban_bio_prompt")}
					defaultValue={banBioPrompt?.text ?? ""}
					confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
					cancelLabel={t("chat.actions.cancel")}
					onConfirm={(wordToBan) => {
						const currentList = getForbiddenWords();
						const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
						void setForbiddenWords(newList);
						toast.success(t("profile_details.ban_bio_added", { word: wordToBan }));
						setBanBioPrompt(null);
					}}
					onCancel={() => setBanBioPrompt(null)}
				/>
				<PromptDialog
					isOpen={banNamePrompt !== null}
					title={t("profile_details.ban_bio_title")}
					message={t("chat.actions.ban_name_prompt", {
						defaultValue: "Trim this down to the exact name or phrase you want to ban:",
					})}
					defaultValue={banNamePrompt?.text ?? ""}
					confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
					cancelLabel={t("chat.actions.cancel")}
					onConfirm={(wordToBan) => {
						const currentList = getForbiddenWords();
						const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
						void setForbiddenWords(newList);
						toast.success(t("profile_details.ban_bio_added", { word: wordToBan }));
						setBanNamePrompt(null);
					}}
					onCancel={() => setBanNamePrompt(null)}
				/>
				{barTapFlyEmoji && (
					<>
						{barTapFlyEmoji.particles.map((p, i) => p.emoji ? (
							<span
								key={`p-${barTapFlyEmoji.key}-${i}`}
								className="animate-emoji-particle-rise"
								style={{
									left: "50%",
									top: "50%",
									opacity: 0,
									fontSize: `${p.size}px`,
									lineHeight: 1,
									filter: barTapGlow(barTapFlyEmoji.id),
									zIndex: 202,
									"--dx": `${p.dx}px`,
									"--dy": `${p.dy}px`,
									"--dur": `${p.dur}s`,
									"--delay": `${p.delay}s`,
								} as React.CSSProperties}
							>{p.emoji}</span>
						) : (
							<div
								key={`p-${barTapFlyEmoji.key}-${i}`}
								className="animate-particle-rise"
								style={{
									left: "50%",
									top: "50%",
									opacity: 0,
									width: `${p.size}px`,
									height: `${p.size}px`,
									background: barTapParticleColor(barTapFlyEmoji.id),
									boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${barTapParticleColor(barTapFlyEmoji.id)}`,
									zIndex: 202,
									"--dx": `${p.dx}px`,
									"--dy": `${p.dy}px`,
									"--dur": `${p.dur}s`,
									"--delay": `${p.delay}s`,
								} as React.CSSProperties}
							/>
						))}
						<span
							key={`emoji-${barTapFlyEmoji.key}`}
							className="animate-tap-fly-center fixed pointer-events-none"
							style={{ left: "50%", top: "50%", zIndex: 201, filter: barTapGlow(barTapFlyEmoji.id), "--tap-origin-dx": `${barTapFlyEmoji.originDx}px`, "--tap-origin-dy": `${barTapFlyEmoji.originDy}px` } as React.CSSProperties}
						>
							{barTapEmoji(barTapFlyEmoji.id)}
						</span>
					</>
				)}
				</div>
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6"
			onClick={handleBackdropClose}
		>
			<div
				className="surface-card flex w-full max-w-[min(80vw,1300px)] overflow-hidden rounded-2xl"
				style={{
					flexDirection: isModalSplit ? "row" : "column",
					maxHeight: isModalSplit ? "calc(100dvh - 8rem)" : "calc(100dvh - 1.5rem)",
					height: isModalSplit ? "calc(100dvh - 8rem)" : undefined,
				}}
				onClick={(event) => event.stopPropagation()}
			>
				{/* Left panel: full-height photo carousel (split mode only) */}
				{isModalSplit && isLoadingActiveProfile && (
					<div className="relative shrink-0 animate-pulse overflow-hidden bg-[var(--surface-2)]" style={{ width: "54%" }} aria-hidden="true" />
				)}
				{isModalSplit && !isLoadingActiveProfile && !activeProfileError && activeProfile && (
					<div
						className="relative shrink-0 overflow-hidden bg-black"
						style={{ width: "54%" }}
						onWheel={(e) => {
							e.preventDefault();
							if (e.deltaY > 0) setMobileCarouselPhotoIndex((i) => Math.min(i + 1, carouselHashes.length - 1));
							else if (e.deltaY < 0) setMobileCarouselPhotoIndex((i) => Math.max(i - 1, 0));
						}}
					>
						{isRightNowSlideActive && (
							<div
								className="pointer-events-none absolute inset-0 z-30"
								style={{ boxShadow: "inset 0 0 34px -10px color-mix(in srgb, color-mix(in srgb, var(--right-now), black 25%), transparent 35%)" }}
								aria-hidden="true"
							/>
						)}
						{carouselHashes.map((hash, index) => (
							<div
								key={hash}
								className="absolute inset-0 overflow-hidden"
								style={{
									transform: `translateY(${(index - mobileCarouselPhotoIndex) * 100}%)`,
									transition: "transform 300ms ease-out",
								}}
							>
								{renderCarouselSlideContent(hash, index)}
							</div>
						))}
						{activeProfile.lastReceivedTapTimestamp != null && (
							<div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-row items-center gap-1.5">
								<div className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
									<Flame className="h-3.5 w-3.5 shrink-0 text-orange-400" />
									<span className="text-xs font-medium text-white">
										{formatRelativeTime(activeProfile.lastReceivedTapTimestamp)}
									</span>
								</div>
							</div>
						)}
						{carouselHashes.length > 1 && (
							<>
								<button
									type="button"
									onClick={() => setMobileCarouselPhotoIndex((i) => Math.max(i - 1, 0))}
									disabled={mobileCarouselPhotoIndex === 0}
									aria-label={t("profile_details.previous_photo")}
									className="absolute left-1/2 top-3 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 disabled:opacity-0 disabled:pointer-events-none"
								>
									<ChevronUp className="h-4 w-4" />
								</button>
								<button
									type="button"
									onClick={() => setMobileCarouselPhotoIndex((i) => Math.min(i + 1, carouselHashes.length - 1))}
									disabled={mobileCarouselPhotoIndex === carouselHashes.length - 1}
									aria-label={t("profile_details.next_photo")}
									className="absolute bottom-3 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60 disabled:opacity-0 disabled:pointer-events-none"
								>
									<ChevronDown className="h-4 w-4" />
								</button>
							</>
						)}
						{carouselHashes.length > 1 && (
							<div className="absolute inset-y-0 right-4 z-20 flex flex-col items-center justify-center">
								<div className="flex flex-col items-center gap-2 rounded-full bg-black/30 px-[7px] py-[14px] backdrop-blur-sm">
									{carouselHashes.map((hash, index) => (
										<button
											key={`${hash}-dot`}
											type="button"
											onClick={() => setMobileCarouselPhotoIndex(index)}
											className="flex items-center justify-center p-1.5 -m-1.5"
											aria-label={t("profile_details.open_photo", { index: index + 1 })}
										>
											{hash === RIGHT_NOW_SLIDE_HASH ? (
												<span
													className="flex w-2 shrink-0 items-center justify-center overflow-visible transition-[height] duration-300 ease-out"
													style={{ height: index === mobileCarouselPhotoIndex ? "16px" : "8px" }}
												>
													<Zap
														className="h-4 w-4 shrink-0 scale-[0.55] transition-colors duration-150 ease-out"
														style={{ color: index === mobileCarouselPhotoIndex ? "var(--right-now)" : "rgba(255,255,255,0.4)" }}
														fill="currentColor"
													/>
												</span>
											) : hash === ALBUM_SLIDE_HASH ? (
												<span
													className="flex w-2 shrink-0 items-center justify-center overflow-visible transition-[height] duration-300 ease-out"
													style={{ height: index === mobileCarouselPhotoIndex ? "16px" : "8px" }}
												>
													<Album
														className="h-4 w-4 shrink-0 scale-[0.65] transition-colors duration-150 ease-out"
														style={{ color: index === mobileCarouselPhotoIndex ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)" }}
													/>
												</span>
											) : (
												<span
													className={`w-2 rounded-full transition-[height,background-color] duration-300 ease-out ${
														index === mobileCarouselPhotoIndex ? "h-4 bg-white" : "h-2 bg-white/40"
													}`}
												/>
											)}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Right column (or full width on non-split): header + content + footer */}
				<div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
					{!isModalSplit ? renderInlineLayout() : (
						<>
							{/* Solid split-mode header */}
							<div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
								<div className="flex w-full items-center gap-3">
									<button type="button" onClick={onClose} className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors" aria-label={t("profile_details.close_profile_details")}>
										<ChevronLeft className="h-4 w-4" />
									</button>
									<div className="min-w-0 flex-1">
										<p className="truncate text-base font-semibold">{activeProfileName}</p>
									</div>
									{isOwnProfile && (
										<button type="button" onClick={() => navigate("/settings/profile-editor")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors" aria-label={t("profile_editor.edit_profile")}>
											<Pencil className="h-4 w-4" />
										</button>
									)}
									{messageProfileId && !isOwnProfile && (
										<div className="flex shrink-0 items-center gap-1.5">
											{onToggleFavoriteProfile && (
												<button type="button" onClick={() => onToggleFavoriteProfile(String(messageProfileId), isFavorite)} disabled={isTogglingFavorite}
													className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-60 ${isFavorite ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
													aria-label={isFavorite ? t("chat.unfavorite") : t("chat.favorite")}>
													<Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
												</button>
											)}
											{(onBlockProfile || onUnblockProfile) && (
												<button type="button" onClick={() => isBlocked ? onUnblockProfile?.(String(messageProfileId)) : (messageProfileId && onBlockProfile?.(String(messageProfileId)))} disabled={isBlockingProfile}
													className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-60 ${isBlocked ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-red-500/40 bg-red-500/8 text-red-400 hover:border-red-500/70 hover:bg-red-500/15"}`}
													aria-label={isBlocked ? t("profile_details.unblock") : t("profile_details.block")}>
													<Ban className="h-4 w-4" />
												</button>
											)}
											<div ref={actionsMenuRef} className="relative">
												<button type="button" onClick={() => setIsActionsMenuOpen((v) => !v)}
													className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)] transition-colors"
													aria-label="More actions" aria-expanded={isActionsMenuOpen}>
													<EllipsisVertical className="h-4 w-4" />
												</button>
												{isActionsMenuOpen && (
													<div className="absolute right-0 top-full z-50 mt-2 flex min-w-[190px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 shadow-lg">
														<div className="flex flex-col gap-1 px-2">
														<button type="button" disabled={isTriangleDisabled}
															onClick={() => { setIsActionsMenuOpen(false); if (messageProfileId) onTriangleProfile?.(String(messageProfileId)); }}
															className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-50">
															<Triangle className="mr-2 h-4 w-4 opacity-70" />
															{isLocatingProfile ? t("profile_details.locating") : t("profile_details.locate")}
														</button>
														</div>
														{(hasBio || actualProfileName) && <div className="h-px shrink-0 bg-[var(--border)]" />}
														{(hasBio || actualProfileName) && (
														<div className="flex flex-col gap-1 px-2">
														{hasBio && (
															<button
																type="button"
																onClick={handleBanBioPhrase}
																className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
															>
																<Ban className="mr-2 h-4 w-4 opacity-70" />
																<span className="flex flex-col">
																	<span>Add forbidden Keyword</span>
																	<span className="text-xs text-[var(--text-muted)]">Bio Phrase</span>
																</span>
															</button>
														)}
														{actualProfileName && (
															<button
																type="button"
																onClick={handleBanProfileName}
																className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)]"
															>
																<Ban className="mr-2 h-4 w-4 opacity-70" />
																<span className="flex flex-col">
																	<span>Add forbidden Keyword</span>
																	<span className="text-xs text-[var(--text-muted)]">Profile Name</span>
																</span>
															</button>
														)}
														</div>
														)}
													</div>
												)}
											</div>
										</div>
									)}
								</div>
							</div>
							{/* Split-mode content */}
							<div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-lenis-prevent>
								<div className="p-4 pb-28 sm:p-5 sm:pb-28">
									{isLoadingActiveProfile ? (
										<ProfileDetailsSkeleton />
									) : activeProfileError ? (
										<p className="text-sm text-[var(--text-muted)]">{activeProfileError}</p>
									) : activeProfile ? (
										<ProfileDetailsContent
											activeProfile={activeProfile}
											activeProfilePhotoHashes={carouselHashes}
											isDesktopLike={isDesktopLike}
											showMobileCarousel={false}
											mobileCarouselRef={mobileCarouselRef}
											mobileCarouselPhotoIndex={mobileCarouselPhotoIndex}
											openPhotoViewer={openPhotoViewer}
											activeProfileName={activeProfileName}
											estimatedCreatedAt={estimatedCreatedAt}
											travelPlans={travelPlans}
											profileStatusLabel={profileStatusLabel}
											profileStatusLevel={profileStatusLevel}
											ownTags={ownTags}
											profileDistance={profileDistance}
											chatContactStatus={chatContactStatus ?? null}
											messageProfileId={messageProfileId}
											usesFreegrind={usesFreegrind ?? false}
											onMessageProfile={undefined}
											onTapProfile={undefined}
											onTagClick={onTagClick}
											isTapDisabled={isTapDisabled}
											isTapBlocked={isTapBlocked}
											isTapActive={isTapActive}
											tapId={tapVisualState.tapId}
											tapButtonClassName={tapButtonClassName}
											hasTagsContent={hasTagsContent}
											hasAboutContent={hasAboutContent}
											hasExpectationsFields={hasExpectationsFields}
											hasHealthFields={hasHealthFields}
											hasStatsFields={hasStatsFields}
											hasSocialFields={hasSocialFields}
											formattedActiveGenders={formattedActiveGenders}
											formattedActivePronouns={formattedActivePronouns}
											lookingForLabels={lookingForLabels}
											meetAtLabels={meetAtLabels}
											nsfwLabels={nsfwLabels}
											tribeLabels={tribeLabels}
											hivStatusLabels={hivStatusLabels}
											sexualHealthLabels={sexualHealthLabels}
											vaccineLabels={vaccineLabels}
											sexualPositionLabels={sexualPositionLabels}
											bodyTypeLabels={bodyTypeLabels}
											ethnicityLabels={ethnicityLabels}
											relationshipStatusLabels={relationshipStatusLabels}
											extraTopSection={notesSectionJsx}
											hidePicturesSection={true}
										/>
									) : null}
								</div>
							</div>
							{/* Split-mode footer */}
							{messageProfileId && !isOwnProfile && (
								<div className="pointer-events-none absolute inset-x-0 bottom-0 z-30" style={{ paddingTop: "5rem", paddingBottom: "0.75rem", background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)" }}>
									<div ref={controlsBarRef} className="pointer-events-auto flex items-center gap-1 px-3" onPointerDown={(e) => e.stopPropagation()}>
										<div className="relative min-w-0 flex-1" style={{ pointerEvents: barInputVisible ? "auto" : "none" }}>
											<div className="pointer-events-none absolute inset-0 rounded-xl backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--surface-2) 50%, transparent)", border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)", opacity: barInputVisible ? 1 : 0, transition: barInputVisible ? "opacity 0.25s" : "opacity 0.12s" }} />
											<input type="text" value={quickMessageDraft} onChange={(e) => setQuickMessageDraft(e.target.value)}
												onKeyDown={(e) => { if (e.key === "Enter" && quickMessageDraft.trim()) { onSendQuickMessage?.(String(messageProfileId), quickMessageDraft.trim()); setQuickMessageDraft(""); } }}
												placeholder={t("profile_details.quick_message_placeholder", "Message...")}
												className="relative h-11 w-full rounded-xl bg-transparent px-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
												style={{ opacity: barInputVisible ? 1 : 0, transition: barInputVisible ? "opacity 0.25s" : "opacity 0.12s" }} />
										</div>
										<div className="transition-[max-width] duration-200 ease-out" style={{ maxWidth: barTapPickerOpen ? `${3 * 52}px` : "0px", overflowX: barTapPickerOpen ? "visible" : "clip", overflowY: "visible" }}>
											<div ref={barTapOptionsRef} className="flex items-center">
												{[0, 2, 1].map((id) => (
													<div key={id} data-tap-id={id} onClick={() => fireTap(id)} onMouseEnter={() => setBarTapHoverId(id)} onMouseLeave={() => setBarTapHoverId(null)}
														className={`flex h-11 w-13 cursor-pointer items-center justify-center text-2xl leading-none transition-all duration-150 ${barTapHoverId === id ? "origin-bottom scale-[2] opacity-100" : "opacity-60"}`}
														style={barTapHoverId === id ? { filter: barTapGlow(id) } : undefined}>
														{barTapEmoji(id)}
													</div>
												))}
											</div>
										</div>
										<button ref={barTapButtonRef} type="button" onPointerDown={handleBarTapPointerDown} onPointerMove={handleBarTapPointerMove} onPointerUp={handleBarTapPointerUp}
											onPointerCancel={() => { setBarTapPickerOpen(false); setBarTapHoverId(null); barTapStickyRef.current = false; if (barTapLongPressRef.current) clearTimeout(barTapLongPressRef.current); barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210); }}
											disabled={isTapDisabled}
											className={`tap-btn-base relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-2xl leading-none transition-all touch-none select-none ${isTappingProfile ? "opacity-40" : ""} ${barTapPickerOpen ? "text-[var(--text-muted)]" : isTapActive || barTapHoverId !== null ? "text-white" : "text-[var(--text-muted)]"}`}
											style={isTapBlocked ? { filter: barTapGlow(tapVisualState.tapId) } : !barTapPickerOpen && barTapHoverId !== null ? { filter: barTapGlow(barTapHoverId) } : undefined}>
											{barTapPickerOpen ? <X className="h-5 w-5" strokeWidth={2} /> : barTapHoverId !== null ? barTapEmoji(barTapHoverId) : isTapActive ? barTapEmoji(tapVisualState.tapId) : <Flame className="h-5 w-5" strokeWidth={1.8} />}
										</button>
										{(onMessageProfile || onSendQuickMessage) && (
											<button type="button" onClick={() => { if (quickMessageDraft.trim()) { onSendQuickMessage?.(String(messageProfileId), quickMessageDraft.trim()); setQuickMessageDraft(""); } else { onMessageProfile?.(String(messageProfileId)); } }}
												className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-[var(--accent)] transition hover:brightness-110">
												<span className="relative inline-flex">
													<MessageCircle className="h-5 w-5" strokeWidth={1.8} />
													{(chatContactStatus?.unreadCount ?? 0) > 0 && (
														<span className="absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[9px] font-bold text-[var(--accent-contrast)] shadow-sm">
															{chatContactStatus?.unreadCount}
														</span>
													)}
												</span>
											</button>
										)}
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>
			{barTapFlyEmoji && (
				<>
					{barTapFlyEmoji.particles.map((p, i) => p.emoji ? (
						<span
							key={`p-${barTapFlyEmoji.key}-${i}`}
							className="animate-emoji-particle-rise"
							style={{
								left: "50%", top: "50%", opacity: 0,
								fontSize: `${p.size}px`, lineHeight: 1,
								filter: barTapGlow(barTapFlyEmoji.id), zIndex: 202,
								"--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
								"--dur": `${p.dur}s`, "--delay": `${p.delay}s`,
							} as React.CSSProperties}
						>{p.emoji}</span>
					) : (
						<div
							key={`p-${barTapFlyEmoji.key}-${i}`}
							className="animate-particle-rise"
							style={{
								left: "50%", top: "50%", opacity: 0,
								width: `${p.size}px`, height: `${p.size}px`,
								background: barTapParticleColor(barTapFlyEmoji.id),
								boxShadow: `0 0 ${p.size * 3}px ${p.size}px ${barTapParticleColor(barTapFlyEmoji.id)}`,
								zIndex: 202,
								"--dx": `${p.dx}px`, "--dy": `${p.dy}px`,
								"--dur": `${p.dur}s`, "--delay": `${p.delay}s`,
							} as React.CSSProperties}
						/>
					))}
					<span
						key={`emoji-${barTapFlyEmoji.key}`}
						className="animate-tap-fly-center fixed pointer-events-none"
						style={{ left: "50%", top: "50%", zIndex: 201, filter: barTapGlow(barTapFlyEmoji.id), "--tap-origin-dx": `${barTapFlyEmoji.originDx}px`, "--tap-origin-dy": `${barTapFlyEmoji.originDy}px` } as React.CSSProperties}
					>
						{barTapEmoji(barTapFlyEmoji.id)}
					</span>
				</>
			)}
			{photoViewerOverlay}
			{albumOpeningOverlay}
			{albumViewerOverlay}
			<PromptDialog
				isOpen={banBioPrompt !== null}
				title={t("profile_details.ban_bio_title")}
				message={t("profile_details.ban_bio_prompt")}
				defaultValue={banBioPrompt?.text ?? ""}
				confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={(wordToBan) => {
					const currentList = getForbiddenWords();
					const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
					void setForbiddenWords(newList);
					toast.success(t("profile_details.ban_bio_added", { word: wordToBan }));
					setBanBioPrompt(null);
				}}
				onCancel={() => setBanBioPrompt(null)}
			/>
			<PromptDialog
				isOpen={banNamePrompt !== null}
				title={t("profile_details.ban_bio_title")}
				message={t("chat.actions.ban_name_prompt", {
					defaultValue: "Trim this down to the exact name or phrase you want to ban:",
				})}
				defaultValue={banNamePrompt?.text ?? ""}
				confirmLabel={t("chat.actions.ban_word_confirm", { defaultValue: "Add" })}
				cancelLabel={t("chat.actions.cancel")}
				onConfirm={(wordToBan) => {
					const currentList = getForbiddenWords();
					const newList = currentList ? `${currentList}, ${wordToBan}` : wordToBan;
					void setForbiddenWords(newList);
					toast.success(t("profile_details.ban_bio_added", { word: wordToBan }));
					setBanNamePrompt(null);
				}}
				onCancel={() => setBanNamePrompt(null)}
			/>
		</div>
	);
}