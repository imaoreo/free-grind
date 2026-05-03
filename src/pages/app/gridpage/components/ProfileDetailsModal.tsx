import { ArrowLeft, ChevronLeft, ChevronRight, Flame, MessageCircle, Triangle, X } from "lucide-react";
import { type UIEvent, useEffect, useMemo, useRef, useState } from "react";
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
import { getProfileImageUrl, getThumbImageUrl } from "../../../../utils/media";
import blankProfileImage from "../../../../images/blank-profile.png";
import freegrindLogo from "../../../../images/freegrind-logo.webp";
import {
	formatDistance,
	formatEstimatedAccountCreation,
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	getOnlineStatusMeta,
	formatOptionalNumber,
	formatTimeAgo,
	formatWeightKg,
	getEnumLabel,
	shouldHideField,
} from "../utils";

type ProfileDetailsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onMessageProfile?: (profileId: string) => void;
	onTriangleProfile?: (profileId: string) => void;
	isLocatingProfile?: boolean;
	onTapProfile?: (profileId: string) => void;
	isTappingProfile?: boolean;
	isTapBlocked?: boolean;
	tapVisualState?: "none" | "single" | "mutual";
	activeProfile: ProfileDetail | null;
	selectedBrowseCard: BrowseCard | null;
	isLoadingActiveProfile: boolean;
	activeProfileError: string | null;
	activeProfilePhotoHashes: string[];
	genderOptions: ManagedOption[];
	pronounOptions: ManagedOption[];
	variant?: "modal" | "page";
	onPrevProfile?: () => void;
	onNextProfile?: () => void;
};

export function ProfileDetailsModal({
	isOpen,
	onClose,
	onMessageProfile,
	onTriangleProfile,
	isLocatingProfile = false,
	onTapProfile,
	isTappingProfile = false,
	isTapBlocked = false,
	tapVisualState = "none",
	activeProfile,
	selectedBrowseCard,
	isLoadingActiveProfile,
	activeProfileError,
	activeProfilePhotoHashes,
	genderOptions,
	pronounOptions,
	variant = "modal",
	onPrevProfile,
	onNextProfile,
}: ProfileDetailsModalProps) {
	const { t } = useTranslation();
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
	const effectiveTapVisualState = isTappingProfile ? "single" : tapVisualState;
	const isTapActive = effectiveTapVisualState !== "none";
	const isTapDisabled = !onTapProfile || isTappingProfile || isTapBlocked;
	const isTriangleDisabled =
		!onTriangleProfile || !messageProfileId || isLocatingProfile;
	const tapButtonClassName =
		isTapActive
			? "inline-flex h-16 w-16 items-center justify-center rounded-full border border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_20%,var(--surface))] text-4xl leading-none text-[var(--text)] transition hover:brightness-110"
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
			!shouldHideField(formatHeightCm(activeProfile.height, t)) ||
			!shouldHideField(formatWeightKg(activeProfile.weight, t)) ||
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
	}, [activeProfile, t]);

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
		setMobileCarouselPhotoIndex(0);
		if (mobileCarouselRef.current) {
			mobileCarouselRef.current.scrollTo({ left: 0 });
		}
	}, [activeProfile?.profileId, activeProfilePhotoHashes.length]);

	useEffect(() => {
		const query = window.matchMedia("(hover: hover) and (pointer: fine)");
		const update = () => setIsDesktopLike(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

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

	const selectedPhotoHash =
		selectedPhotoIndex === null
			? null
			: (activeProfilePhotoHashes[selectedPhotoIndex] ?? null);

	const openPhotoViewer = (index: number) => {
		setSelectedPhotoIndex(index);
	};

	const closePhotoViewer = () => {
		setSelectedPhotoIndex(null);
	};

	const showPreviousPhoto = () => {
		if (!activeProfilePhotoHashes.length || selectedPhotoIndex === null) {
			return;
		}

		setSelectedPhotoIndex(
			(selectedPhotoIndex - 1 + activeProfilePhotoHashes.length) %
				activeProfilePhotoHashes.length,
		);
	};

	const showNextPhoto = () => {
		if (!activeProfilePhotoHashes.length || selectedPhotoIndex === null) {
			return;
		}

		setSelectedPhotoIndex(
			(selectedPhotoIndex + 1) % activeProfilePhotoHashes.length,
		);
	};

	useEffect(() => {
		if (selectedPhotoIndex === null) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				closePhotoViewer();
				return;
			}

			if (event.key === "ArrowLeft") {
				showPreviousPhoto();
				return;
			}

			if (event.key === "ArrowRight") {
				showNextPhoto();
			}
		};

		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [selectedPhotoIndex]);

	const photoViewerOverlay = selectedPhotoHash ? (
		<div
			className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6"
			onClick={closePhotoViewer}
		>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					closePhotoViewer();
				}}
				className="absolute right-3 top-3 z-[83] inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-5 sm:top-5"
				aria-label={t("profile_details.close_photo_viewer")}
			>
				<X className="h-5 w-5" />
			</button>

			<div
				className="relative z-[82] flex max-h-full w-full max-w-5xl flex-col items-center justify-center gap-3"
				onClick={(event) => event.stopPropagation()}
			>
				<button
					type="button"
					onClick={showPreviousPhoto}
					className="absolute left-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:left-4 sm:h-11 sm:w-11"
					aria-label={t("profile_details.previous_photo")}
				>
					<ChevronLeft className="h-5 w-5" />
				</button>
				<button
					type="button"
					onClick={showNextPhoto}
					className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11"
					aria-label={t("profile_details.next_photo")}
				>
					<ChevronRight className="h-5 w-5" />
				</button>
				<img
					src={getProfileImageUrl(selectedPhotoHash, "1024x1024")}
					alt={t("profile_details.photo_alt", { name: activeProfileName })}
					className="max-h-[82vh] w-auto max-w-full rounded-xl object-contain"
				/>
				<p className="rounded-full bg-black/50 px-3 py-1 text-xs text-white">
					{(selectedPhotoIndex ?? 0) + 1} / {activeProfilePhotoHashes.length}
				</p>
			</div>
		</div>
	) : null;

	if (!isOpen) {
		return null;
	}

	if (variant === "page") {
		return (
			<section className="min-h-screen bg-[var(--bg)] pb-24">
				<div className="w-full">
					{/* Sticky header container using --app-px for consistent horizontal alignment with the main browse page */}
					<div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-[var(--app-px)] pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] sm:pb-3.5 sm:pt-[calc(env(safe-area-inset-top,0px)+12px)]">
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onClose}
								className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]"
								aria-label={t("settings.back_to_browse")}
							>
								<ArrowLeft className="h-4 w-4" />
							</button>
							{(onPrevProfile || onNextProfile) && (
								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={onPrevProfile}
										disabled={!onPrevProfile}
										className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] disabled:opacity-30"
										aria-label={t("profile_details.previous_profile")}
									>
										<ChevronLeft className="h-4 w-4" />
									</button>
									<button
										type="button"
										onClick={onNextProfile}
										disabled={!onNextProfile}
										className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] disabled:opacity-30"
										aria-label={t("profile_details.next_profile")}
									>
										<ChevronRight className="h-4 w-4" />
									</button>
								</div>
							)}
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
									{t("profile_details.title")}
								</p>
								<div className="flex items-center gap-2">
									<p className="text-base font-semibold">{activeProfileName}</p>
									{usesFreegrind && (
										<img
											src={freegrindLogo}
											alt="Free Grind user"
											title={t("profile_details.uses_free_grind")}
											className="h-5 w-5 rounded-full border border-[var(--border)]"
										/>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Main content area using --app-px for consistent padding */}
					<div className="px-[var(--app-px)] pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] sm:py-5">
						{isLoadingActiveProfile ? (
							<p className="text-sm text-[var(--text-muted)]">
								{t("profile_details.loading")}
							</p>
						) : activeProfileError ? (
							<p className="text-sm text-[var(--text-muted)]">
								{activeProfileError}
							</p>
						) : activeProfile ? (
							<div className="grid gap-6">
								<div>
									{/* The 'Pictures' label has been removed as the photo count is already implicitly shown
									   via the carousel pagination dots on mobile, or clearly visible via the grid layout. */}
									{activeProfilePhotoHashes.length > 0 ? (
										<>
											{isDesktopLike ? (
												<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
													{activeProfilePhotoHashes.map((hash, index) => (
														<button
															type="button"
															key={hash}
															onClick={() => openPhotoViewer(index)}
															className="overflow-hidden rounded-xl border border-[var(--border)]"
															aria-label={t("profile_details.open_photo", { index: index + 1 })}
														>
															<img
																src={getThumbImageUrl(hash, "320x320")}
																alt={t("profile_details.photo_alt", { name: activeProfileName })}
																className="aspect-square w-full object-cover"
															/>
														</button>
													))}
												</div>
											) : (
												<>
											{/* Mobile Carousel View: We use negative margins (-mx and -mt) to break out of the parent padding
											   and achieve a seamless edge-to-edge look that flushes with the header and screen sides. */}
											<div className="sm:hidden -mx-[var(--app-px)] -mt-4">
												<div
													ref={mobileCarouselRef}
													onScroll={handleMobileCarouselScroll}
													/* Edge-to-edge look: Only border-b is used to avoid a double-border effect with the sticky header's border.
													   Rounded corners are removed to ensure the images touch the screen edges perfectly. */
													className="flex snap-x snap-mandatory overflow-x-auto border-b border-[var(--border)]"
												>
													{activeProfilePhotoHashes.map((hash, index) => (
														<button
															type="button"
															key={hash}
															onClick={() => openPhotoViewer(index)}
															className="aspect-[2/3] w-full shrink-0 snap-center overflow-hidden"
															aria-label={t("profile_details.open_photo", { index: index + 1 })}
														>
															<img
																/* Using ProfileImageUrl with 1024x1024 for the carousel to ensure high-quality visuals
																   on high-density mobile screens, as thumbnails (320x320) appear blurry here. */
																src={getProfileImageUrl(hash, "1024x1024")}
																alt={t("profile_details.photo_alt", { name: activeProfileName })}
																className="h-full w-full object-cover"
															/>
														</button>
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
														<img
															src={getThumbImageUrl(hash, "320x320")}
															alt={t("profile_details.photo_alt", { name: activeProfileName })}
															className="aspect-square w-full object-cover"
														/>
													</button>
												))}
											</div>
												</>
											)}
										</>
									) : (
										<div className="max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
											<img
												src={blankProfileImage}
													alt={t("profile_details.default_profile")}
													className="aspect-square w-full object-cover"
											/>
										</div>
									)}
								</div>

								<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
									<div className="flex flex-wrap items-end justify-between gap-3">
										<div>
											<p className="text-lg font-semibold sm:text-xl">
												{activeProfileName}
												<span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
													({formatOptionalNumber(activeProfile.age, t)})
												</span>
											</p>
											<p className="mt-1 text-xs text-[var(--text-muted)]">
												{t("profile_details.user_id")}: {activeProfile.profileId}
											</p>
												<p className="mt-1 text-xs text-[var(--text-muted)]">
													{t("profile_details.est_created")}: {estimatedCreatedAt}
												</p>
										</div>
										<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
											<p>
												{t("profile_details.status")}: {profileStatusLabel}
											</p>
											<p>{t("profile_details.distance")}: {formatDistance(profileDistance, t)}</p>
										</div>
									</div>
									{messageProfileId && onMessageProfile ? (
										<div className="mt-3 grid grid-cols-[1.2fr_auto_1.2fr] items-center gap-2">
												<button
													type="button"
													onClick={() => onMessageProfile(messageProfileId)}
													className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
												>
													<MessageCircle className="h-4 w-4" />
													{t("profile_details.message")}
												</button>
												<button
													type="button"
													onClick={() => onTapProfile?.(messageProfileId)}
													disabled={isTapDisabled}
													className={tapButtonClassName}
													aria-label="Tap profile"
													title={
														isTapBlocked
															? "Tap already sent in the last 24 hours"
															: isTapActive
																? "Tap active"
																: "Send tap"
													}
												>
													{isTapActive ? (
														"🔥"
													) : (
														<Flame className="h-7 w-7" strokeWidth={1.8} />
													)}
												</button>
												<button
													type="button"
													onClick={() => {
														if (messageProfileId && onTriangleProfile) {
															onTriangleProfile(messageProfileId);
														}
													}}
													disabled={isTriangleDisabled}
													className={triangleButtonClassName}
													aria-label="Run location finder"
													title={isLocatingProfile ? "Location finder running" : "Location finder"}
												>
													<Triangle className="h-4 w-4" />
													{isLocatingProfile ? "Locating..." : "Locate"}
												</button>
										</div>
									) : null}
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
												<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
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
															{t("profile_details.looking_for")}:{" "}
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
															{t("profile_details.meet_at")}:{" "}
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
															{t("profile_details.tribes")}:{" "}
															{formatEnumArray(
																activeProfile.grindrTribes,
																tribeLabels,
																t
															)}
														</p>
													)}
													{!shouldHideField(formattedActiveGenders) && (
														<p>{t("profile_details.genders")}: {formattedActiveGenders}</p>
													)}
													{!shouldHideField(formattedActivePronouns) && (
														<p>{t("profile_details.pronouns")}: {formattedActivePronouns}</p>
													)}
													{!shouldHideField(
														activeProfile.rightNowText?.trim(),
													) && (
														<p>
															{t("profile_details.right_now")}: {activeProfile.rightNowText?.trim()}
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
															{t("profile_details.hiv_status")}:{" "}
															{formatEnumValue(
																activeProfile.hivStatus,
																hivStatusLabels,
																t
															)}
														</p>
													)}
													{activeProfile.lastTestedDate && (
														<p>
															{t("profile_details.last_tested")}:{" "}
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
															{t("profile_details.sexual_health")}:{" "}
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
															{t("profile_details.vaccines")}:{" "}
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
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
														formatHeightCm(activeProfile.height, t),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																{t("profile_details.height")}
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatHeightCm(activeProfile.height, t)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatWeightKg(activeProfile.weight, t),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																{t("profile_details.weight")}
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatWeightKg(activeProfile.weight, t)}
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
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
															{t("profile_details.instagram")}:{" "}
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
															{t("profile_details.x")}:{" "}
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
															{t("profile_details.facebook")}:{" "}
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
							</div>
						) : null}
					</div>
				</div>
				{photoViewerOverlay}
			</section>
		);
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-6"
			onClick={handleBackdropClose}
		>
			<div
				className="surface-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100dvh-8rem)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							{t("profile_details.title")}
						</p>
						<p className="text-base font-semibold">{activeProfileName}</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
						aria-label={t("profile_details.close_profile_details")}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,0px)+8rem)] sm:p-5 sm:pb-6">
					{isLoadingActiveProfile ? (
						<p className="text-sm text-[var(--text-muted)]">
							{t("profile_details.loading")}
						</p>
					) : activeProfileError ? (
						<p className="text-sm text-[var(--text-muted)]">
							{activeProfileError}
						</p>
					) : activeProfile ? (
						<div className="grid gap-6">
							<div>
								{activeProfilePhotoHashes.length > 0 ? (
									<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
										{activeProfilePhotoHashes.map((hash, index) => (
											<button
												type="button"
												key={hash}
												onClick={() => openPhotoViewer(index)}
												className="overflow-hidden rounded-xl border border-[var(--border)]"
												aria-label={t("profile_details.open_photo", { index: index + 1 })}
											>
												<img
													src={getThumbImageUrl(hash, "320x320")}
													alt={t("profile_details.photo_alt", { name: activeProfileName })}
													className="aspect-square w-full object-cover"
												/>
											</button>
										))}
									</div>
								) : (
									<div className="max-w-sm overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
										<img
											src={blankProfileImage}
											alt={t("profile_details.default_profile")}
											className="aspect-square w-full object-cover"
										/>
									</div>
								)}
							</div>

							<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
								<div className="flex flex-wrap items-end justify-between gap-3">
									<div>
										<p className="text-lg font-semibold sm:text-xl">
											{activeProfileName}
											<span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
												({formatOptionalNumber(activeProfile.age, t)})
											</span>
										</p>
										<p className="mt-1 text-xs text-[var(--text-muted)]">
											{t("profile_details.user_id")}: {activeProfile.profileId}
										</p>
										<p className="mt-1 text-xs text-[var(--text-muted)]">
											{t("profile_details.est_created")}: {estimatedCreatedAt}
										</p>
									</div>
									<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
										<p>
											{t("profile_details.status")}: {profileStatusLabel}
										</p>
										<p>{t("profile_details.distance")}: {formatDistance(profileDistance, t)}</p>
									</div>
								</div>
								{messageProfileId && onMessageProfile ? (
									<div className="mt-3 grid grid-cols-[1.2fr_auto_1.2fr] items-center gap-2">
											<button
												type="button"
												onClick={() => onMessageProfile(messageProfileId)}
												className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
											>
												<MessageCircle className="h-4 w-4" />
												{t("profile_details.message")}
											</button>
											<button
												type="button"
												onClick={() => onTapProfile?.(messageProfileId)}
												disabled={isTapDisabled}
												className={tapButtonClassName}
												aria-label={t("profile_details.tap_profile")}
												title={
													isTapBlocked
														? t("profile_details.tap_sent_recent")
														: isTapActive
															? t("profile_details.tap_active")
															: t("profile_details.send_tap")
												}
											>
												{isTapActive ? (
													"🔥"
												) : (
													<Flame className="h-7 w-7" strokeWidth={1.8} />
												)}
											</button>
											<button
												type="button"
												onClick={() => {
													if (messageProfileId && onTriangleProfile) {
														onTriangleProfile(messageProfileId);
													}
												}}
												disabled={isTriangleDisabled}
												className={triangleButtonClassName}
												aria-label={t("profile_details.run_location_finder")}
												title={isLocatingProfile ? t("profile_details.location_finder_running") : t("profile_details.location_finder")}
											>
												<Triangle className="h-4 w-4" />
												{isLocatingProfile ? t("profile_details.locating") : t("profile_details.locate")}
											</button>
									</div>
								) : null}
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
											<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
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
														{t("profile_details.looking_for")}:{" "}
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
														{t("profile_details.meet_at")}:{" "}
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
														{t("profile_details.tribes")}:{" "}
														{formatEnumArray(
															activeProfile.grindrTribes,
															tribeLabels,
															t
														)}
													</p>
												)}
												{!shouldHideField(formattedActiveGenders) && (
													<p>{t("profile_details.genders")}: {formattedActiveGenders}</p>
												)}
												{!shouldHideField(formattedActivePronouns) && (
													<p>{t("profile_details.pronouns")}: {formattedActivePronouns}</p>
												)}
												{!shouldHideField(
													activeProfile.rightNowText?.trim(),
												) && (
													<p>{t("profile_details.right_now")}: {activeProfile.rightNowText?.trim()}</p>
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
														{t("profile_details.hiv_status")}:{" "}
														{formatEnumValue(
															activeProfile.hivStatus,
															hivStatusLabels,
															t
														)}
													</p>
												)}
												{activeProfile.lastTestedDate && (
													<p>
														{t("profile_details.last_tested")}:{" "}
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
														{t("profile_details.sexual_health")}:{" "}
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
														{t("profile_details.vaccines")}:{" "}
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
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
													formatHeightCm(activeProfile.height, t),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															{t("profile_details.height")}
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatHeightCm(activeProfile.height, t)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatWeightKg(activeProfile.weight, t),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															{t("profile_details.weight")}
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatWeightKg(activeProfile.weight, t)}
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
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
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
														{t("profile_details.instagram")}:{" "}
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
														{t("profile_details.x")}:{" "}
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
														{t("profile_details.facebook")}:{" "}
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
						</div>
					) : null}
				</div>
			</div>
			{photoViewerOverlay}
		</div>
	);
}
