import { ArrowLeft, X, Ban, Loader2, MapPin } from "lucide-react";
import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	createBackdropCloseHandler,
	useModalClose,
} from "../../../../hooks/useModalClose";
import { useDesktopBreakpoint } from "../../../../hooks/useDesktopBreakpoint";
import { usePresenceCheck } from "../../../../hooks/usePresenceCheck";
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
	getRelationshipStatusLabelMap,
	getSexualHealthLabelMap,
	getSexualPositionLabelMap,
	getTribeLabelMap,
	getVaccineLabelMap,
} from "../../profile-option-builders";
import { getProfileImageUrl } from "../../../../utils/media";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import { usePreferences } from "../../../../contexts/PreferencesContext";
import { formatDateTime24 } from "../../chat/chatUtils";
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
import { PhotoViewer } from "../../../../components/PhotoViewer";
import { FeedScrollContainer } from "../../../../components/ui/FeedScrollContainer";

type OwnProfileData = { tags: string[] };
const ownProfileDataCache = new Map<string, OwnProfileData>();

type ProfileDetailsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onMessageProfile?: (profileId: string) => void;
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
	activeProfile: ProfileDetail | null;
	selectedBrowseCard: BrowseCard | null;
	isLoadingActiveProfile: boolean;
	activeProfileError: string | null;
	activeProfilePhotoHashes: string[];
	chatContactStatus?: ChatContactIndexRecord | null;
	genderOptions: ManagedOption[];
	pronounOptions: ManagedOption[];
	variant?: "modal" | "page";
	onPrevProfile?: () => void;
	onNextProfile?: () => void;
	activeNote?: string;
	onSaveNote?: (notes: string) => void | Promise<void>;
	onDeleteNote?: () => void | Promise<void>;
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

export function ProfileDetailsModal({
	isOpen,
	onClose,
	onMessageProfile,
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
	activeProfile,
	selectedBrowseCard,
	isLoadingActiveProfile,
	activeProfileError,
	activeProfilePhotoHashes,
	chatContactStatus,
	genderOptions,
	pronounOptions,
	variant = "modal",
	onPrevProfile,
	onNextProfile,
	activeNote,
	onSaveNote,
	onDeleteNote,
}: ProfileDetailsModalProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const { userId } = useAuth();
	const apiFunctions = useApiFunctions();
	const [ownTags, setOwnTags] = useState<string[]>(() => (userId ? (ownProfileDataCache.get(userId)?.tags ?? []) : []));
	useEffect(() => {
		if (!userId) return;
		if (ownProfileDataCache.has(userId)) {
			setOwnTags(ownProfileDataCache.get(userId)!.tags);
			return;
		}
		apiFunctions.getRawProfile(userId).then((raw) => {
			const parsed = profileResponseSchema.safeParse(raw);
			if (parsed.success) {
				const p = parsed.data.profiles[0];
				const data: OwnProfileData = { tags: p?.profileTags ?? [] };
				ownProfileDataCache.set(userId, data);
				setOwnTags(data.tags);
			}
		}).catch(() => {});
	}, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
	const activeProfileName = useMemo(() => {
		if (!activeProfile) {
			return t("profile_details.title");
		}

		const value = activeProfile.displayName?.trim();
		if (value && value !== "3" && value !== "4") {
			return value;
		}

		if (value === "3") {
			return t("profile_details.deleted_account", { defaultValue: "Deleted Account" });
		}

		if (value === "4") {
			return t("profile_details.blocked_account", { defaultValue: "Blocked by User" });
		}

		return t("profile_details.profile_fallback", { id: activeProfile.profileId });
	}, [activeProfile, t]);

	const profileDistance =
		activeProfile?.distance ?? selectedBrowseCard?.distanceMeters ?? null;
	const profileOnlineUntil =
		activeProfile?.onlineUntil ?? selectedBrowseCard?.onlineUntil ?? null;
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
	const messageProfileId = activeProfile?.profileId ?? selectedBrowseCard?.profileId ?? null;
	const usesFreegrind = usePresenceCheck(messageProfileId);
	const visualStateValue = typeof tapVisualState === "string" ? tapVisualState : tapVisualState.state;
	const effectiveTapVisualState = isTappingProfile ? "single" : visualStateValue;
	const isTapActive = effectiveTapVisualState !== "none";
	const isTapDisabled = !onTapProfile || isTappingProfile || isTapBlocked;
	const isTriangleDisabled =
		!onTriangleProfile || !messageProfileId || isLocatingProfile || activeProfile?.isBlockable === null || activeProfile?.displayName === "3" || activeProfile?.displayName === "4";
	const tapButtonClassName =
		isTapActive
			? "inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] text-4xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative"
			: "inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--text-muted)] bg-transparent text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]";
	const triangleButtonClassName = isTriangleDisabled
		? "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-muted)] opacity-70"
		: "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]";

	const lookingForLabels = useMemo(() => getLookingForLabelMap(t), [t]);
	const meetAtLabels = useMemo(() => getMeetAtLabelMap(t), [t]);
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
			return t("profile_editor.sections.states.not_set");
		}

		return activeProfile.genders
			.map((genderId) => getEnumLabel(genderId, genderOptions))
			.join(", ");
	}, [activeProfile?.genders, genderOptions, t]);

	const formattedActivePronouns = useMemo(() => {
		if (!activeProfile?.pronouns.length) {
			return t("profile_editor.sections.states.not_set");
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
			!shouldHideField(formattedActivePronouns) ||
			!shouldHideField(activeProfile.rightNowText?.trim())
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
	const isDesktopLike = useDesktopBreakpoint();
	const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
	const isCarouselRepositioning = useRef(false);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const pageWrapRef = useRef<HTMLDivElement | null>(null);
	const [profileSwipeDelta, setProfileSwipeDelta] = useState(0);
	const profileSwipeRef = useRef({ startX: 0, startY: 0, decided: false, horizontal: false, dragging: false, lastDelta: 0, active: false });
	const [headerOpacity, setHeaderOpacity] = useState(0);
	const [headerFadeDuration, setHeaderFadeDuration] = useState(0);
	const headerScrolled = headerOpacity > 0.5;

	useEffect(() => {
		const el = scrollContainerRef.current;
		if (!el) return;
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
		return () => el.removeEventListener("scroll", onScroll);
	}, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

		const onStart = (e: PointerEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest("button, a, input, textarea, select, [role='button']")) return;
			s.startX = e.clientX;
			s.startY = e.clientY;
			s.decided = false;
			s.horizontal = false;
			s.dragging = false;
			s.lastDelta = 0;
			s.active = true;
		};

		const onMove = (e: PointerEvent) => {
			if (!s.active) return;
			if (s.decided && !s.horizontal) return;
			const dx = e.clientX - s.startX;
			const dy = e.clientY - s.startY;
			if (!s.decided) {
				if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
				s.decided = true;
				s.horizontal = Math.abs(dx) > Math.abs(dy) * 1.5;
				if (s.horizontal) el.setPointerCapture(e.pointerId);
			}
			if (!s.horizontal) return;
			e.preventDefault();
			s.dragging = true;
			s.lastDelta = dx;
			setProfileSwipeDelta(dx);
		};

		const onEnd = (e: PointerEvent) => {
			if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
			s.active = false;
			if (!s.dragging) return;
			s.dragging = false;
			s.horizontal = false;
			s.decided = false;
			const dx = s.lastDelta;
			s.lastDelta = 0;
			setProfileSwipeDelta(0);
			if (dx < -80) onNextProfile?.();
			else if (dx > 80) onPrevProfile?.();
		};

		el.addEventListener("pointerdown", onStart);
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerup", onEnd);
		el.addEventListener("pointercancel", onEnd);
		return () => {
			el.removeEventListener("pointerdown", onStart);
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerup", onEnd);
			el.removeEventListener("pointercancel", onEnd);
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

	const handleMobileCarouselScroll = (event: UIEvent<HTMLDivElement>) => {
		const { scrollLeft, clientWidth } = event.currentTarget;
		if (clientWidth <= 0) {
			return;
		}

		const nextIndex = Math.round(scrollLeft / clientWidth);
		if (nextIndex !== mobileCarouselPhotoIndex) {
			setMobileCarouselPhotoIndex(nextIndex);
		}
	};

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
	const photoUrls = useMemo(() => {
		return activeProfilePhotoHashes.map((hash) =>
			getProfileImageUrl(hash, "1024x1024"),
		);
	}, [activeProfilePhotoHashes]);

	const renderPhotoExtraInfo = useCallback(
		(index: number) => {
			const hash = activeProfilePhotoHashes[index];
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
		[activeProfilePhotoHashes, photoCreatedAtByHash, t],
	);

	const openPhotoViewer = (index: number) => {
		setSelectedPhotoIndex(index);
	};

	const closePhotoViewer = () => {
		setSelectedPhotoIndex(null);
	};


	const photoViewerOverlay = selectedPhotoIndex !== null && (
		<PhotoViewer
			isOpen={true}
			onClose={closePhotoViewer}
			photos={photoUrls}
			initialIndex={selectedPhotoIndex}
			renderExtraInfo={renderPhotoExtraInfo}
		/>
	);

	if (!isOpen) {
		return null;
	}

	if (variant === "page") {
		return (
			<div className="app-screen relative flex h-dvh flex-col w-full !px-0 !pb-0 !pt-0 overflow-x-hidden bg-[var(--bg)]" style={{ paddingBottom: 0 }}>
				<div
					ref={pageWrapRef}
					className="relative flex h-full flex-col"
					style={{
						transform: `translateX(${profileSwipeDelta}px)`,
						transition: profileSwipeDelta === 0 ? "transform 250ms ease-out" : "none",
					}}
				>
				<header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex shrink-0 flex-col px-[var(--app-px)] pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] sm:pb-3.5 sm:pt-[calc(env(safe-area-inset-top,0px)+12px)]">
					<div
						className={`absolute inset-0 bg-[var(--bg)] backdrop-blur-xl ${headerScrolled ? "border-b border-[var(--border)]" : ""}`}
						style={{ opacity: headerOpacity, transition: `opacity ${headerFadeDuration}ms ease-out` }}
						aria-hidden="true"
					/>
					<div className="relative flex w-full items-center gap-3">
						<div className="pointer-events-auto flex shrink-0 items-center gap-3">
							<button
								type="button"
								onClick={onClose}
								className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer ${headerScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
								aria-label={t("settings.back_to_browse")}
							>
								<ArrowLeft className="h-4 w-4" />
							</button>
						</div>

						<div className="pointer-events-auto flex flex-1 items-center justify-end gap-1">
							{messageProfileId && (onBlockProfile || onUnblockProfile) && (
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
									className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors disabled:opacity-50 cursor-pointer ${
										isBlocked
											? "border-red-500/30 bg-red-500/10 text-red-500"
											: headerScrolled
												? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-red-500"
												: "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md hover:text-red-300"
									}`}
									title={isBlocked ? t("profile_details.unblock", "Unblock Profile") : t("profile_details.block", "Block Profile")}
									aria-label={isBlocked ? t("profile_details.unblock", "Unblock Profile") : t("profile_details.block", "Block Profile")}
								>
									{isBlockingProfile ? (
										<Loader2 className="h-4 w-4 animate-spin" />
									) : (
										<Ban className="h-4 w-4" />
									)}
								</button>
							)}
						</div>
					</div>
				</header>

				<div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto">
					<div className="mx-auto w-full max-w-4xl px-[var(--app-px)] pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] sm:pb-8">
						{isLoadingActiveProfile ? (
							<p className="text-sm text-[var(--text-muted)]">
								{t("profile_details.loading")}
							</p>
						) : activeProfileError ? (
							<p className="text-sm text-[var(--text-muted)]">
								{activeProfileError}
							</p>
						) : activeProfile ? (
							<ProfileDetailsContent
								activeProfile={activeProfile}
								activeProfilePhotoHashes={activeProfilePhotoHashes}
								isDesktopLike={isDesktopLike}
								showMobileCarousel={true}
								mobileCarouselRef={mobileCarouselRef}
								mobileCarouselPhotoIndex={mobileCarouselPhotoIndex}
								handleMobileCarouselScroll={handleMobileCarouselScroll}
								openPhotoViewer={openPhotoViewer}
								photoCreatedAtByHash={photoCreatedAtByHash}
								activeProfileName={activeProfileName}
								estimatedCreatedAt={estimatedCreatedAt}
								profileStatusLabel={profileStatusLabel}
								profileStatusLevel={profileStatusLevel}
								ownTags={ownTags}
								profileDistance={profileDistance}
								chatContactStatus={chatContactStatus ?? null}
								messageProfileId={messageProfileId}
								usesFreegrind={usesFreegrind ?? false}
								onMessageProfile={onMessageProfile}
								onTapProfile={onTapProfile}
								onBlockProfile={onBlockProfile}
								onUnblockProfile={onUnblockProfile}
								onToggleFavoriteProfile={onToggleFavoriteProfile}
								onPhotoIndexChange={setMobileCarouselPhotoIndex}
								isFavorite={isFavorite}
								isTogglingFavorite={isTogglingFavorite}
								isBlocked={isBlocked}
								isBlockingProfile={isBlockingProfile}
								isTapDisabled={isTapDisabled}
								isTapBlocked={isTapBlocked}
								isTapActive={isTapActive}
								tapId={tapVisualState.tapId}
								tapButtonClassName={tapButtonClassName}
								onTriangleProfile={onTriangleProfile}
								isTriangleDisabled={isTriangleDisabled}
								triangleButtonClassName={triangleButtonClassName}
								isLocatingProfile={isLocatingProfile}
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
								tribeLabels={tribeLabels}
								hivStatusLabels={hivStatusLabels}
								sexualHealthLabels={sexualHealthLabels}
								vaccineLabels={vaccineLabels}
								sexualPositionLabels={sexualPositionLabels}
								bodyTypeLabels={bodyTypeLabels}
								ethnicityLabels={ethnicityLabels}
								relationshipStatusLabels={relationshipStatusLabels}
								activeNote={activeNote}
								onSaveNote={onSaveNote}
								onDeleteNote={onDeleteNote}
							/>
						) : null}
					</div>
				</div>
				{photoViewerOverlay}
				</div>
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6"
			onClick={handleBackdropClose}
		>
			<div
				className="surface-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100dvh-8rem)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
					<div className="min-w-0 flex-1">
						<p className="truncate text-base font-semibold">{activeProfileName}</p>
					</div>
					<div className="flex items-center gap-1.5">
						{messageProfileId && (onBlockProfile || onUnblockProfile) && (
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
								className={`rounded-lg border border-[var(--border)] p-2 transition-colors disabled:opacity-50 cursor-pointer ${
									isBlocked
										? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
										: "bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-red-500 hover:border-red-500/30"
								}`}
								title={isBlocked ? t("profile_details.unblock", "Unblock Profile") : t("profile_details.block", "Block Profile")}
								aria-label={isBlocked ? t("profile_details.unblock", "Unblock Profile") : t("profile_details.block", "Block Profile")}
							>
								{isBlockingProfile ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Ban className="h-4 w-4" />
								)}
							</button>
						)}
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
							aria-label={t("profile_details.close_profile_details")}
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				<div
					data-lenis-prevent
					className="min-h-0 flex-1 overflow-y-auto p-4 pb-0 sm:p-5 sm:pb-0"
				>
					{isLoadingActiveProfile ? (
						<p className="text-sm text-[var(--text-muted)]">
							{t("profile_details.loading")}
						</p>
					) : activeProfileError ? (
						<p className="text-sm text-[var(--text-muted)]">
							{activeProfileError}
						</p>
					) : activeProfile ? (
						<ProfileDetailsContent
							activeProfile={activeProfile}
							activeProfilePhotoHashes={activeProfilePhotoHashes}
							isDesktopLike={isDesktopLike}
							showMobileCarousel={false}
							mobileCarouselRef={mobileCarouselRef}
							mobileCarouselPhotoIndex={mobileCarouselPhotoIndex}
							handleMobileCarouselScroll={handleMobileCarouselScroll}
							openPhotoViewer={openPhotoViewer}
							photoCreatedAtByHash={photoCreatedAtByHash}
							activeProfileName={activeProfileName}
							estimatedCreatedAt={estimatedCreatedAt}
							profileStatusLabel={profileStatusLabel}
							profileStatusLevel={profileStatusLevel}
							ownTags={ownTags}
							profileDistance={profileDistance}
							chatContactStatus={chatContactStatus ?? null}
							messageProfileId={messageProfileId}
							usesFreegrind={usesFreegrind ?? false}
							onMessageProfile={onMessageProfile}
							onTapProfile={onTapProfile}
							onBlockProfile={onBlockProfile}
							onUnblockProfile={onUnblockProfile}
							onToggleFavoriteProfile={onToggleFavoriteProfile}
							isFavorite={isFavorite}
							isTogglingFavorite={isTogglingFavorite}
							isBlocked={isBlocked}
							isBlockingProfile={isBlockingProfile}
							isTapDisabled={isTapDisabled}
							isTapBlocked={isTapBlocked}
							isTapActive={isTapActive}
							tapId={tapVisualState.tapId}
							tapButtonClassName={tapButtonClassName}
							onTriangleProfile={onTriangleProfile}
							isTriangleDisabled={isTriangleDisabled}
							triangleButtonClassName={triangleButtonClassName}
							isLocatingProfile={isLocatingProfile}
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
							tribeLabels={tribeLabels}
							hivStatusLabels={hivStatusLabels}
							sexualHealthLabels={sexualHealthLabels}
							vaccineLabels={vaccineLabels}
							sexualPositionLabels={sexualPositionLabels}
							bodyTypeLabels={bodyTypeLabels}
							ethnicityLabels={ethnicityLabels}
							relationshipStatusLabels={relationshipStatusLabels}
							activeNote={activeNote}
							onSaveNote={onSaveNote}
							onDeleteNote={onDeleteNote}
						/>
					) : null}
				</div>
			</div>
			{photoViewerOverlay}
		</div>
	);
}