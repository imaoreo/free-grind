import { Loader2, MessageCircle, MessagesSquare, Compass, Info, Ban, Fingerprint, CalendarDays, Navigation, NavigationOff } from "lucide-react";
import { type RefObject, type UIEvent, useState } from "react";
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
	onBlockProfile,
	onUnblockProfile,
	isBlocked,
	isBlockingProfile,
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
}: ProfileDetailsContentProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const hasChatHistory = Boolean(chatContactStatus?.hasChatted) || (chatContactStatus?.unreadCount ?? 0) > 0;
	const lastMessageLabel = formatRelativeTime(chatContactStatus?.lastMessageTimestamp ?? null);

	const [showDetails, setShowDetails] = useState(false);

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

			{messageProfileId && onMessageProfile && (
				<div className="flex items-center gap-3">
					{(onBlockProfile || onUnblockProfile) && (
						<button
							type="button"
							onClick={handleBlockAction}
							disabled={isBlockingProfile}
							className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-[0.98] disabled:opacity-70 cursor-pointer ${
								isBlocked
									? "border-red-500 bg-red-500/20 text-red-400 hover:brightness-110"
									: "border-[var(--border)] bg-[var(--surface)] text-red-500/50 hover:text-red-400 hover:border-red-500/35"
							}`}
							title={
								isBlocked
									? t("profile_details.unblock")
									: t("profile_details.block")
							}
							aria-label={
								isBlocked
									? t("profile_details.unblock")
									: t("profile_details.block")
							}
						>
							{isBlockingProfile ? (
								<Loader2 className="h-5 w-5 animate-spin" />
							) : (
								<Ban className="h-5 w-5" />
							)}
						</button>
					)}

					<button
						type="button"
						onClick={() => onMessageProfile(messageProfileId)}
						className="relative flex-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] text-zinc-950 font-bold tracking-wide transition-all duration-200 hover:brightness-105 active:scale-[0.98] shadow-md shadow-amber-500/10"
					>
						<MessageCircle className="h-5 w-5 text-zinc-950" />
						<span>{t("profile_details.message")}</span>
						{chatContactStatus?.unreadCount && chatContactStatus.unreadCount > 0 ? (
							<span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-[var(--surface-2)]">
								{chatContactStatus.unreadCount}
							</span>
						) : null}
					</button>

					<TapSelector
						profileId={messageProfileId}
						onTapProfile={onTapProfile!}
						isTapDisabled={isTapDisabled}
						isTapBlocked={isTapBlocked}
						isTapActive={isTapActive}
						tapId={tapId}
						tapButtonClassName={
							isTapActive
								? "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--accent)] bg-[var(--surface)] text-3xl leading-none text-[var(--text)] hover:brightness-110 overflow-hidden relative shrink-0"
								: "inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/50 transition-all duration-200 shrink-0"
						}
					/>
				</div>
			)}

			<div className="rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--surface-2)] to-color-mix(in srgb, var(--surface-2) 90%, var(--surface)) p-4 shadow-sm">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
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
					<button
						type="button"
						onClick={() => setShowDetails(!showDetails)}
						className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-200 active:scale-95 ${
							showDetails
								? "border-[var(--accent)] bg-[var(--accent)] text-zinc-950 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
								: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]"
						}`}
						title="Toggle technical details"
						aria-label="Toggle technical details"
					>
						<Info className="h-4.5 w-4.5" />
					</button>
				</div>

				{/* Dash-Pills Row */}
				<div className="mt-3.5 flex flex-wrap gap-2 items-center">
					{/* Online status badge */}
					<span
						className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border backdrop-blur-md shadow-sm transition-all ${
							meta.isOnline
								? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_2px_10px_-3px_rgba(16,185,129,0.2)]"
								: statusColorClass === "bg-yellow-500"
									? "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_2px_10px_-3px_rgba(245,158,11,0.15)]"
									: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
						}`}
					>
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
						{statusText}
					</span>

					{/* Distance badge */}
					<button
						type="button"
						onClick={triggerLocate}
						disabled={isTriangleDisabled || isLocatingProfile}
						className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border backdrop-blur-md shadow-sm transition-all duration-300 active:scale-95 cursor-pointer ${
							isLocatingProfile
								? "bg-[var(--accent)] text-zinc-950 border-[var(--accent)] animate-pulse"
								: profileDistance == null || !Number.isFinite(profileDistance)
									? "bg-[var(--surface-3)]/60 text-[var(--text-muted)] border-[var(--border)]/75"
									: "bg-[var(--surface-3)] hover:bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--accent)]/50"
						}`}
						title="Tap to run location finder"
					>
						{isLocatingProfile ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-950" />
						) : profileDistance == null || !Number.isFinite(profileDistance) ? (
							<NavigationOff className="h-3 w-3 shrink-0" />
						) : (
							<Navigation className="h-3 w-3 text-[var(--accent)] transform transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 duration-300" />
						)}
						<span>
							{isLocatingProfile ? "Locating..." : formatDistance(profileDistance, t, unitsPreset)}
						</span>
					</button>

					{/* Chat History badge */}
					{hasChatHistory && (
						<span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20 backdrop-blur-md shadow-sm shadow-[0_2px_10px_-3px_rgba(59,130,246,0.15)]">
							<MessagesSquare className="h-3.5 w-3.5" />
							<span>{lastMessageLabel || t("profile_details.chatted_before")}</span>
						</span>
					)}
				</div>

				{/* Expandable details panel */}
				{showDetails && (
					<div className="mt-3.5 grid grid-cols-2 gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-muted)] animate-in slide-in-from-top-2 duration-200">
						<div
							onClick={copyUserId}
							className="cursor-pointer hover:bg-[var(--surface-2)] p-2 rounded-lg transition-colors flex flex-col gap-1"
							title="Tap to copy User ID"
						>
							<span className="font-semibold text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
								<Fingerprint className="h-3.5 w-3.5 text-[var(--accent)]" />
								User ID
							</span>
							<span className="font-mono text-[var(--text)] select-all truncate">{activeProfile.profileId}</span>
						</div>
						<div className="p-2 flex flex-col gap-1">
							<span className="font-semibold text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
								<CalendarDays className="h-3.5 w-3.5 text-[var(--accent)]" />
								Estimated Created
							</span>
							<span className="text-[var(--text)] truncate">{estimatedCreatedAt}</span>
						</div>
					</div>
				)}
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


		</div>
	);
}