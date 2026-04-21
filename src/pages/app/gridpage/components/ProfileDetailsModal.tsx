import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
	BrowseCard,
	ManagedOption,
	ProfileDetail,
} from "../../GridPage.types";
import {
	bodyTypeLabels,
	ethnicityLabels,
	hivStatusLabels,
	lookingForLabels,
	meetAtLabels,
	relationshipStatusLabels,
	sexualHealthLabels,
	sexualPositionLabels,
	tribeLabels,
	vaccineLabels,
} from "../../GridPage.types";
import { getProfileImageUrl, getThumbImageUrl } from "../../../../utils/media";
import {
	formatDistance,
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	formatOptionalNumber,
	formatTimeAgo,
	formatWeightKg,
	getEnumLabel,
	isCurrentlyOnline,
	shouldHideField,
} from "../utils";

type ProfileDetailsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	activeProfile: ProfileDetail | null;
	selectedBrowseCard: BrowseCard | null;
	isLoadingActiveProfile: boolean;
	activeProfileError: string | null;
	activeProfilePhotoHashes: string[];
	genderOptions: ManagedOption[];
	pronounOptions: ManagedOption[];
	variant?: "modal" | "page";
};

export function ProfileDetailsModal({
	isOpen,
	onClose,
	activeProfile,
	selectedBrowseCard,
	isLoadingActiveProfile,
	activeProfileError,
	activeProfilePhotoHashes,
	genderOptions,
	pronounOptions,
	variant = "modal",
}: ProfileDetailsModalProps) {
	const activeProfileName = useMemo(() => {
		if (!activeProfile) {
			return "Profile details";
		}

		const value = activeProfile.displayName?.trim();
		if (value) {
			return value;
		}

		return `Profile ${activeProfile.profileId}`;
	}, [activeProfile]);

	const profileDistance =
		activeProfile?.distance ?? selectedBrowseCard?.distanceMeters ?? null;
	const profileOnlineUntil =
		activeProfile?.onlineUntil ?? selectedBrowseCard?.onlineUntil ?? null;
	const profileLastSeen = activeProfile?.seen ?? null;

	const formattedActiveGenders = useMemo(() => {
		if (!activeProfile?.genders.length) {
			return "Not set";
		}

		return activeProfile.genders
			.map((genderId) => getEnumLabel(genderId, genderOptions))
			.join(", ");
	}, [activeProfile?.genders, genderOptions]);

	const formattedActivePronouns = useMemo(() => {
		if (!activeProfile?.pronouns.length) {
			return "Not set";
		}

		return activeProfile.pronouns
			.map((pronounId) => getEnumLabel(pronounId, pronounOptions))
			.join(", ");
	}, [activeProfile?.pronouns, pronounOptions]);

	const hasExpectationsFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumArray(activeProfile.lookingFor, lookingForLabels),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.meetAt, meetAtLabels)) ||
			!shouldHideField(
				formatEnumArray(activeProfile.grindrTribes, tribeLabels),
			) ||
			!shouldHideField(formattedActiveGenders) ||
			!shouldHideField(formattedActivePronouns) ||
			!shouldHideField(activeProfile.rightNowText?.trim())
		);
	}, [activeProfile, formattedActiveGenders, formattedActivePronouns]);

	const hasHealthFields = useMemo(() => {
		if (!activeProfile) return false;
		return (
			!shouldHideField(
				formatEnumValue(activeProfile.hivStatus, hivStatusLabels),
			) ||
			Boolean(activeProfile.lastTestedDate) ||
			!shouldHideField(
				formatEnumArray(activeProfile.sexualHealth, sexualHealthLabels),
			) ||
			!shouldHideField(formatEnumArray(activeProfile.vaccines, vaccineLabels))
		);
	}, [activeProfile]);

	const hasStatsFields = useMemo(() => {
		if (!activeProfile) return false;
		const positionFormatted = formatEnumValue(
			activeProfile.sexualPosition,
			sexualPositionLabels,
		);
		return (
			!shouldHideField(positionFormatted) ||
			!shouldHideField(formatHeightCm(activeProfile.height)) ||
			!shouldHideField(formatWeightKg(activeProfile.weight)) ||
			!shouldHideField(
				formatEnumValue(activeProfile.bodyType, bodyTypeLabels),
			) ||
			!shouldHideField(
				formatEnumValue(activeProfile.ethnicity, ethnicityLabels),
			) ||
			!shouldHideField(
				formatEnumValue(
					activeProfile.relationshipStatus,
					relationshipStatusLabels,
				),
			)
		);
	}, [activeProfile]);

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

	useEffect(() => {
		if (!isOpen) {
			setSelectedPhotoIndex(null);
		}
	}, [isOpen]);

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
				aria-label="Close photo viewer"
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
					aria-label="Previous photo"
				>
					<ChevronLeft className="h-5 w-5" />
				</button>
				<button
					type="button"
					onClick={showNextPhoto}
					className="absolute right-2 top-1/2 z-[83] inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/50 text-white sm:right-4 sm:h-11 sm:w-11"
					aria-label="Next photo"
				>
					<ChevronRight className="h-5 w-5" />
				</button>
				<img
					src={getProfileImageUrl(selectedPhotoHash, "1024x1024")}
					alt={`${activeProfileName} photo`}
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
					<div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 pb-3 pt-[calc(env(safe-area-inset-top,0px)+10px)] sm:px-4 sm:pb-3.5 sm:pt-[calc(env(safe-area-inset-top,0px)+12px)]">
						<div className="flex items-center gap-2">
							<button
								type="button"
								onClick={onClose}
								className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)]"
								aria-label="Back to browse"
							>
								<ArrowLeft className="h-4 w-4" />
							</button>
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
									Profile details
								</p>
								<p className="text-base font-semibold">{activeProfileName}</p>
							</div>
						</div>
					</div>

					<div className="px-3 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+7rem)] sm:px-4 sm:py-5">
						{isLoadingActiveProfile ? (
							<p className="text-sm text-[var(--text-muted)]">
								Loading profile details...
							</p>
						) : activeProfileError ? (
							<p className="text-sm text-[var(--text-muted)]">
								{activeProfileError}
							</p>
						) : activeProfile ? (
							<div className="grid gap-6">
								<div>
									<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
										Pictures ({activeProfilePhotoHashes.length})
									</p>
									{activeProfilePhotoHashes.length > 0 ? (
										<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
											{activeProfilePhotoHashes.map((hash, index) => (
												<button
													type="button"
													key={hash}
													onClick={() => openPhotoViewer(index)}
													className="overflow-hidden rounded-xl border border-[var(--border)]"
													aria-label={`Open photo ${index + 1}`}
												>
													<img
														src={getThumbImageUrl(hash, "320x320")}
														alt={`${activeProfileName} photo`}
														className="aspect-square w-full object-cover"
													/>
												</button>
											))}
										</div>
									) : (
										<p className="text-sm text-[var(--text-muted)]">
											No profile photos available.
										</p>
									)}
								</div>

								<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
									<div className="flex flex-wrap items-end justify-between gap-3">
										<div>
											<p className="text-lg font-semibold sm:text-xl">
												{activeProfileName}
												<span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
													({formatOptionalNumber(activeProfile.age)})
												</span>
											</p>
											<p className="mt-1 text-xs text-[var(--text-muted)]">
												User ID: {activeProfile.profileId}
											</p>
										</div>
										<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
											<p>
												Status:{" "}
												{isCurrentlyOnline(profileOnlineUntil)
													? "Online"
													: `Last online ${formatTimeAgo(profileLastSeen ?? profileOnlineUntil)}`}
											</p>
											<p>Distance: {formatDistance(profileDistance)}</p>
										</div>
									</div>
								</div>

								<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
									<div className="grid gap-4">
										{hasTagsContent && (
											<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
												<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
													Tags
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
													About
												</p>
												<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
													{activeProfile.aboutMe?.trim()}
												</p>
											</div>
										)}

										{hasExpectationsFields && (
											<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
												<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
													Expectations
												</p>
												<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
													{!shouldHideField(
														formatEnumArray(
															activeProfile.lookingFor,
															lookingForLabels,
														),
													) && (
														<p>
															Looking for:{" "}
															{formatEnumArray(
																activeProfile.lookingFor,
																lookingForLabels,
															)}
														</p>
													)}
													{!shouldHideField(
														formatEnumArray(activeProfile.meetAt, meetAtLabels),
													) && (
														<p>
															Meet at:{" "}
															{formatEnumArray(
																activeProfile.meetAt,
																meetAtLabels,
															)}
														</p>
													)}
													{!shouldHideField(
														formatEnumArray(
															activeProfile.grindrTribes,
															tribeLabels,
														),
													) && (
														<p>
															Tribes:{" "}
															{formatEnumArray(
																activeProfile.grindrTribes,
																tribeLabels,
															)}
														</p>
													)}
													{!shouldHideField(formattedActiveGenders) && (
														<p>Genders: {formattedActiveGenders}</p>
													)}
													{!shouldHideField(formattedActivePronouns) && (
														<p>Pronouns: {formattedActivePronouns}</p>
													)}
													{!shouldHideField(
														activeProfile.rightNowText?.trim(),
													) && (
														<p>
															Right now: {activeProfile.rightNowText?.trim()}
														</p>
													)}
												</div>
											</div>
										)}

										{hasHealthFields && (
											<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
												<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
													Health
												</p>
												<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
													{!shouldHideField(
														formatEnumValue(
															activeProfile.hivStatus,
															hivStatusLabels,
														),
													) && (
														<p>
															HIV status:{" "}
															{formatEnumValue(
																activeProfile.hivStatus,
																hivStatusLabels,
															)}
														</p>
													)}
													{activeProfile.lastTestedDate && (
														<p>
															Last tested:{" "}
															{formatTimeAgo(activeProfile.lastTestedDate)}
														</p>
													)}
													{!shouldHideField(
														formatEnumArray(
															activeProfile.sexualHealth,
															sexualHealthLabels,
														),
													) && (
														<p>
															Sexual health:{" "}
															{formatEnumArray(
																activeProfile.sexualHealth,
																sexualHealthLabels,
															)}
														</p>
													)}
													{!shouldHideField(
														formatEnumArray(
															activeProfile.vaccines,
															vaccineLabels,
														),
													) && (
														<p>
															Vaccines:{" "}
															{formatEnumArray(
																activeProfile.vaccines,
																vaccineLabels,
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
													Stats
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
																Position
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatEnumValue(
																	activeProfile.sexualPosition,
																	sexualPositionLabels,
																)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatHeightCm(activeProfile.height),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																Height
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatHeightCm(activeProfile.height)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatWeightKg(activeProfile.weight),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																Weight
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatWeightKg(activeProfile.weight)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatEnumValue(
															activeProfile.bodyType,
															bodyTypeLabels,
														),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																Body type
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatEnumValue(
																	activeProfile.bodyType,
																	bodyTypeLabels,
																)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatEnumValue(
															activeProfile.ethnicity,
															ethnicityLabels,
														),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																Ethnicity
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatEnumValue(
																	activeProfile.ethnicity,
																	ethnicityLabels,
																)}
															</p>
														</div>
													)}
													{!shouldHideField(
														formatEnumValue(
															activeProfile.relationshipStatus,
															relationshipStatusLabels,
														),
													) && (
														<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
															<p className="text-[10px] uppercase tracking-[0.08em]">
																Relationship
															</p>
															<p className="mt-1 font-medium text-[var(--text)]">
																{formatEnumValue(
																	activeProfile.relationshipStatus,
																	relationshipStatusLabels,
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
													Social
												</p>
												<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
													{activeProfile.socialNetworks?.instagram?.userId && (
														<p>
															Instagram:{" "}
															{activeProfile.socialNetworks.instagram.userId}
														</p>
													)}
													{activeProfile.socialNetworks?.twitter?.userId && (
														<p>
															X: {activeProfile.socialNetworks.twitter.userId}
														</p>
													)}
													{activeProfile.socialNetworks?.facebook?.userId && (
														<p>
															Facebook:{" "}
															{activeProfile.socialNetworks.facebook.userId}
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
			onClick={onClose}
		>
			<div
				className="surface-card max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-2xl"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							Profile details
						</p>
						<p className="text-base font-semibold">{activeProfileName}</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2"
						aria-label="Close profile details"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="max-h-[80vh] overflow-y-auto p-4 sm:p-5">
					{isLoadingActiveProfile ? (
						<p className="text-sm text-[var(--text-muted)]">
							Loading profile details...
						</p>
					) : activeProfileError ? (
						<p className="text-sm text-[var(--text-muted)]">
							{activeProfileError}
						</p>
					) : activeProfile ? (
						<div className="grid gap-6">
							<div>
								<p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
									Pictures ({activeProfilePhotoHashes.length})
								</p>
								{activeProfilePhotoHashes.length > 0 ? (
									<div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
										{activeProfilePhotoHashes.map((hash, index) => (
											<button
												type="button"
												key={hash}
												onClick={() => openPhotoViewer(index)}
												className="overflow-hidden rounded-xl border border-[var(--border)]"
												aria-label={`Open photo ${index + 1}`}
											>
												<img
													src={getThumbImageUrl(hash, "320x320")}
													alt={`${activeProfileName} photo`}
													className="aspect-square w-full object-cover"
												/>
											</button>
										))}
									</div>
								) : (
									<p className="text-sm text-[var(--text-muted)]">
										No profile photos available.
									</p>
								)}
							</div>

							<div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
								<div className="flex flex-wrap items-end justify-between gap-3">
									<div>
										<p className="text-lg font-semibold sm:text-xl">
											{activeProfileName}
											<span className="ml-2 text-sm font-medium text-[var(--text-muted)]">
												({formatOptionalNumber(activeProfile.age)})
											</span>
										</p>
										<p className="mt-1 text-xs text-[var(--text-muted)]">
											User ID: {activeProfile.profileId}
										</p>
									</div>
									<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
										<p>
											Status:{" "}
											{isCurrentlyOnline(profileOnlineUntil)
												? "Online"
												: `Last online ${formatTimeAgo(profileLastSeen ?? profileOnlineUntil)}`}
										</p>
										<p>Distance: {formatDistance(profileDistance)}</p>
									</div>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
								<div className="grid gap-4">
									{hasTagsContent && (
										<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
											<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												Tags
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
												About
											</p>
											<p className="mt-2 text-sm leading-relaxed text-[var(--text)]">
												{activeProfile.aboutMe?.trim()}
											</p>
										</div>
									)}

									{hasExpectationsFields && (
										<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
											<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												Expectations
											</p>
											<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
												{!shouldHideField(
													formatEnumArray(
														activeProfile.lookingFor,
														lookingForLabels,
													),
												) && (
													<p>
														Looking for:{" "}
														{formatEnumArray(
															activeProfile.lookingFor,
															lookingForLabels,
														)}
													</p>
												)}
												{!shouldHideField(
													formatEnumArray(activeProfile.meetAt, meetAtLabels),
												) && (
													<p>
														Meet at:{" "}
														{formatEnumArray(
															activeProfile.meetAt,
															meetAtLabels,
														)}
													</p>
												)}
												{!shouldHideField(
													formatEnumArray(
														activeProfile.grindrTribes,
														tribeLabels,
													),
												) && (
													<p>
														Tribes:{" "}
														{formatEnumArray(
															activeProfile.grindrTribes,
															tribeLabels,
														)}
													</p>
												)}
												{!shouldHideField(formattedActiveGenders) && (
													<p>Genders: {formattedActiveGenders}</p>
												)}
												{!shouldHideField(formattedActivePronouns) && (
													<p>Pronouns: {formattedActivePronouns}</p>
												)}
												{!shouldHideField(
													activeProfile.rightNowText?.trim(),
												) && (
													<p>Right now: {activeProfile.rightNowText?.trim()}</p>
												)}
											</div>
										</div>
									)}

									{hasHealthFields && (
										<div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
											<p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
												Health
											</p>
											<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
												{!shouldHideField(
													formatEnumValue(
														activeProfile.hivStatus,
														hivStatusLabels,
													),
												) && (
													<p>
														HIV status:{" "}
														{formatEnumValue(
															activeProfile.hivStatus,
															hivStatusLabels,
														)}
													</p>
												)}
												{activeProfile.lastTestedDate && (
													<p>
														Last tested:{" "}
														{formatTimeAgo(activeProfile.lastTestedDate)}
													</p>
												)}
												{!shouldHideField(
													formatEnumArray(
														activeProfile.sexualHealth,
														sexualHealthLabels,
													),
												) && (
													<p>
														Sexual health:{" "}
														{formatEnumArray(
															activeProfile.sexualHealth,
															sexualHealthLabels,
														)}
													</p>
												)}
												{!shouldHideField(
													formatEnumArray(
														activeProfile.vaccines,
														vaccineLabels,
													),
												) && (
													<p>
														Vaccines:{" "}
														{formatEnumArray(
															activeProfile.vaccines,
															vaccineLabels,
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
												Stats
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
															Position
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatEnumValue(
																activeProfile.sexualPosition,
																sexualPositionLabels,
															)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatHeightCm(activeProfile.height),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															Height
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatHeightCm(activeProfile.height)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatWeightKg(activeProfile.weight),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															Weight
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatWeightKg(activeProfile.weight)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatEnumValue(
														activeProfile.bodyType,
														bodyTypeLabels,
													),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															Body type
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatEnumValue(
																activeProfile.bodyType,
																bodyTypeLabels,
															)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatEnumValue(
														activeProfile.ethnicity,
														ethnicityLabels,
													),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															Ethnicity
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatEnumValue(
																activeProfile.ethnicity,
																ethnicityLabels,
															)}
														</p>
													</div>
												)}
												{!shouldHideField(
													formatEnumValue(
														activeProfile.relationshipStatus,
														relationshipStatusLabels,
													),
												) && (
													<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
														<p className="text-[10px] uppercase tracking-[0.08em]">
															Relationship
														</p>
														<p className="mt-1 font-medium text-[var(--text)]">
															{formatEnumValue(
																activeProfile.relationshipStatus,
																relationshipStatusLabels,
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
												Social
											</p>
											<div className="mt-2 grid gap-1 text-sm text-[var(--text-muted)]">
												{activeProfile.socialNetworks?.instagram?.userId && (
													<p>
														Instagram:{" "}
														{activeProfile.socialNetworks.instagram.userId}
													</p>
												)}
												{activeProfile.socialNetworks?.twitter?.userId && (
													<p>
														X: {activeProfile.socialNetworks.twitter.userId}
													</p>
												)}
												{activeProfile.socialNetworks?.facebook?.userId && (
													<p>
														Facebook:{" "}
														{activeProfile.socialNetworks.facebook.userId}
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
