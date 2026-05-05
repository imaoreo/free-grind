import { Flame, MessageCircle, Triangle } from "lucide-react";
import { type RefObject, type UIEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileDetail } from "../../GridPage.types";
import {
	formatDistance,
	formatEnumArray,
	formatEnumValue,
	formatHeightCm,
	formatOptionalNumber,
	formatTimeAgo,
	formatWeightKg,
	shouldHideField,
} from "../utils";
import { getProfileImageUrl, getThumbImageUrl } from "../../../../utils/media";
import blankProfileImage from "../../../../images/blank-profile.png";
import freegrindLogo from "../../../../images/freegrind-logo.webp";

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
	activeProfileName: string;
	estimatedCreatedAt: string;
	profileStatusLabel: string;
	profileDistance: number | null;
	messageProfileId: string | null;
	usesFreegrind: boolean;
	onMessageProfile?: (profileId: string) => void;
	onTapProfile?: (profileId: string) => void;
	isTapDisabled: boolean;
	isTapBlocked: boolean;
	isTapActive: boolean;
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
	activeProfileName,
	estimatedCreatedAt,
	profileStatusLabel,
	profileDistance,
	messageProfileId,
	usesFreegrind,
	onMessageProfile,
	onTapProfile,
	isTapDisabled,
	isTapBlocked,
	isTapActive,
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
}: ProfileDetailsContentProps) {
	const { t } = useTranslation();
	const [isIgniting, setIsIgniting] = useState(false);
	useEffect(() => {
		if (isTapActive) {
			setIsIgniting(true);
			const timer = setTimeout(() => setIsIgniting(false),400);
			return () => clearTimeout(timer);
		}
	}, [isTapActive]);

	return (
		<div className="grid gap-6">
			<div>
				{activeProfilePhotoHashes.length > 0 ? (
					<>
						{showMobileCarousel && !isDesktopLike ? (
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
										<img
											src={getThumbImageUrl(hash, "320x320")}
											alt={t("profile_details.photo_alt", { name: activeProfileName })}
											className="aspect-square w-full object-cover"
										/>
									</button>
								))}
							</div>
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
							<span className="ml-2 text font-medium text-[var(--text-muted)]">
								({formatOptionalNumber(activeProfile.age, t)})
							</span>
						</p>
						<p className="mt-1 text-xs text-[var(--text-muted)]">
							<span className="font-semibold text-[var(--text)]">{t("profile_details.user_id")}:</span> {activeProfile.profileId}
						</p>
						<p className="mt-1 text-xs text-[var(--text-muted)]">
							<span className="font-semibold text-[var(--text)]">{t("profile_details.est_created")}:</span> {estimatedCreatedAt}
						</p>
					</div>
					<div className="grid gap-1 text-xs text-[var(--text-muted)] sm:text-right">
						<p>
							<span className="font-semibold text-[var(--text)]">{t("profile_details.status")}:</span> {profileStatusLabel}
						</p>
						<p>
							<span className="font-semibold text-[var(--text)]">{t("profile_details.distance")}:</span> {formatDistance(profileDistance, t)}
						</p>
					</div>
				</div>
				{usesFreegrind && (
					<div className="mt-2 flex items-center gap-2">
						<img
							src={freegrindLogo}
							alt="Free Grind user"
							title={t("profile_details.uses_free_grind")}
							className="h-5 w-5 rounded-full border border-[var(--border)]"
						/>
					</div>
				)}
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
							{/* Background Overlay to avoid color-mix incompatibility in WebView */}
							{isTapActive && (
								<>
									<div className="absolute inset-0 bg-[var(--accent)] opacity-15 pointer-events-none" />
									<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
										<div
											key={isIgniting ? "ignite" : "loop"}
											className={`h-16 w-16 rounded-full bg-[radial-gradient(circle,rgba(255,140,0,0.8)_0%,rgba(2,6,23,0)_75%)] ${isIgniting ? "animate-flash" : "animate-halo-loop"}`}
										/>
									</div>
								</>
							)}
							<div className="relative z-10 flex h-7 w-7 items-center justify-center">
								<div
									className={`relative inline-block origin-bottom transition-all duration-300 ${isTapActive ? `flame-active text-2xl ${isIgniting ? "animate-ignite" : "animate-flame-loop"}` : ""}`}
								>
									{isTapActive ? (
										"🔥"
									) : (
										<Flame className="h-7 w-7" strokeWidth={1.8} />
									)}
								</div>
							</div>
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
									formatHeightCm(activeProfile.height, t),
								) && (
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
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
									<div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
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
		</div>
	);
}