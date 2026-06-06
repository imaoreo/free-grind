import { ArrowLeft, ChevronLeft, ChevronRight, X, Loader2, Ban } from "lucide-react";
import { type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	createBackdropCloseHandler,
	useModalClose,
} from "../../../../hooks/useModalClose";
import { usePresenceCheck } from "../../../../hooks/usePresenceCheck";
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
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	formatWeightKg,
	getOnlineStatusMeta,
	getEnumLabel,
	shouldHideField,
} from "../utils";
import { ProfileDetailsContent } from "./ProfileDetailsContent";
import { useDesktopBreakpoint } from "../../../../hooks/useDesktopBreakpoint";
import type { ChatContactIndexRecord } from "../../../../types/chat-contact-index";
import { PhotoViewer } from "../../../../components/PhotoViewer";
import { FeedScrollContainer } from "../../../../components/ui/FeedScrollContainer";

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
	const activeProfileName = useMemo(() => {
		if (!activeProfile) {
			return t("profile_details.title");
		}

		const value = activeProfile.displayName?.trim();
		if (value) {
			return value;
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
	const estimatedCreatedAt = formatEstimatedAccountCreation(activeProfile?.profileId, t);
	const messageProfileId = activeProfile?.profileId ?? selectedBrowseCard?.profileId ?? null;
	const usesFreegrind = usePresenceCheck(messageProfileId);
	const visualStateValue = typeof tapVisualState === "string" ? tapVisualState : tapVisualState.state;
	const effectiveTapVisualState = isTappingProfile ? "single" : visualStateValue;
	const isTapActive = effectiveTapVisualState !== "none";
	const isTapDisabled = !onTapProfile || isTappingProfile || isTapBlocked;
	const isTriangleDisabled =
		!onTriangleProfile || !messageProfileId || isLocatingProfile;
	const tapButtonClassName =
		isTapActive
			? "inline-flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--accent)] bg-[var(--surface)] text-4xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative"
			: "inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--text-muted)] bg-transparent text-[var(--text-muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]";
	const triangleButtonClassName = isTriangleDisabled
		? "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text-muted)] opacity-70"
		: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]";

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

	const handleBlockAction = () => {
		if (!messageProfileId || isBlockingProfile) {
			return;
		}

		if (isBlocked) {
			onUnblockProfile?.(messageProfileId);
			return;
		}

		onBlockProfile?.(messageProfileId);
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
			<div className="app-screen relative flex h-dvh flex-col w-full !px-0 !pb-0 !pt-0 overflow-x-hidden bg-[var(--bg)]">
				<header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex shrink-0 flex-col px-[var(--app-px)] pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] sm:pb-3.5 sm:pt-[calc(env(safe-area-inset-top,0px)+12px)]">
					<div className="flex w-full items-center gap-3">
						<div className="pointer-events-auto flex flex-1 justify-start">
							<button
								type="button"
								onClick={onClose}
								className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"
								aria-label={t("settings.back_to_browse")}
							>
								<ArrowLeft className="h-4 w-4" />
							</button>
						</div>



						<div className="pointer-events-auto flex flex-1 items-center justify-end gap-1">
							<button
								type="button"
								onClick={onPrevProfile}
								disabled={!onPrevProfile}
								className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md disabled:opacity-30"
								aria-label={t("profile_details.previous_profile")}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<button
								type="button"
								onClick={onNextProfile}
								disabled={!onNextProfile}
								className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md disabled:opacity-30"
								aria-label={t("profile_details.next_profile")}
							>
								<ChevronRight className="h-4 w-4" />
							</button>
						</div>
					</div>
				</header>

				<FeedScrollContainer>
					<div className="mx-auto w-full max-w-4xl px-[var(--app-px)] pt-0 pb-[calc(env(safe-area-inset-bottom,0px)+8rem)]">
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
				</FeedScrollContainer>
				{photoViewerOverlay}
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
				<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
					<div>
						<p className="text-base font-semibold">{activeProfileName}</p>
					</div>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
							aria-label={t("profile_details.close_profile_details")}
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>

				<div
					data-lenis-prevent
					className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,0px)+8rem)] sm:p-5 sm:pb-6"
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