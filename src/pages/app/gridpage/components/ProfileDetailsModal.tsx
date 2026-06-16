import { Ban, ChevronLeft, Ellipsis, Flame, MessageCircle, Pencil, Star, Triangle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
	createBackdropCloseHandler,
	useModalClose,
} from "../../../../hooks/useModalClose";
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
	getNsfwLabelMap,
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
import { ConfirmDialog } from "../../../../components/ui/confirm-dialog";

type OwnProfileData = { tags: string[] };
const ownProfileDataCache = new Map<string, OwnProfileData>();

type ProfileDetailsModalProps = {
	isOpen: boolean;
	onClose: () => void;
	onMessageProfile?: (profileId: string) => void;
	onSendQuickMessage?: (profileId: string, text: string) => void;
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
	onSendQuickMessage,
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
}: ProfileDetailsModalProps) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
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

		const value = activeProfile.displayName?.trim();
		if (value) {
			return value;
		}

		return t("profile_details.anonymous", "Someone");
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
	const isOwnProfile = userId != null && messageProfileId != null && String(userId) === String(messageProfileId);
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
	const [isDesktopLike, setIsDesktopLike] = useState(() => {
		if (typeof window === "undefined") {
			return true;
		}
		return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
	});
	const mobileCarouselRef = useRef<HTMLDivElement | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const pageWrapRef = useRef<HTMLDivElement | null>(null);
	const [profileSwipeDelta, setProfileSwipeDelta] = useState(0);
	const profileSwipeRef = useRef({ startX: 0, startY: 0, decided: false, horizontal: false, dragging: false, lastDelta: 0 });
	const [headerOpacity, setHeaderOpacity] = useState(0);
	const [headerFadeDuration, setHeaderFadeDuration] = useState(0);
	const headerScrolled = isDesktopLike || headerOpacity > 0.5;
	const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
	const [showBlockConfirm, setShowBlockConfirm] = useState(false);
	const [quickMessageDraft, setQuickMessageDraft] = useState("");
	const [barTapPickerOpen, setBarTapPickerOpen] = useState(false);
	const [barInputVisible, setBarInputVisible] = useState(true);
	const [barTapHoverId, setBarTapHoverId] = useState<number | null>(null);
	const [barTapFlyEmoji, setBarTapFlyEmoji] = useState<{ id: number; key: number; particles: { dx: number; dy: number; size: number; dur: number; delay: number; emoji?: string }[] } | null>(null);
	const barTapLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const barTapStickyRef = useRef(false);
	const barTapSkipUpRef = useRef(false);
	const barInputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const barTapOptionsRef = useRef<HTMLDivElement>(null);
	const controlsBarRef = useRef<HTMLDivElement>(null);
	const actionsMenuRef = useRef<HTMLDivElement>(null);

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
		setBarTapFlyEmoji({ id: tapId, key: Date.now(), particles: makeParticles(tapId) });
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
			<div className="app-screen relative flex h-dvh flex-col w-full !px-0 !pb-0 !pt-0 overflow-x-hidden bg-[var(--bg)]">
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
						style={{ opacity: isDesktopLike ? 1 : headerOpacity, transition: `opacity ${headerFadeDuration}ms ease-out` }}
						aria-hidden="true"
					/>
					<div className="relative flex w-full items-center gap-3">
						{/* Left: back + name */}
						<div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3">
							<button
								type="button"
								onClick={onClose}
								className={`shrink-0 rounded-xl border p-2 transition-colors ${headerScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
								aria-label={t("settings.back_to_browse")}
							>
								<ChevronLeft className="h-4 w-4" />
							</button>
							<div className={`min-w-0 ${headerScrolled ? "" : "drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"}`}>
								<div className="flex items-center gap-1.5 min-w-0">
									<p className={`truncate text-base font-semibold leading-tight ${headerScrolled ? "text-[var(--text)]" : "text-white"}`}>{activeProfileName}</p>
									{usesFreegrind && (
										<img
											src={freegrindLogo}
											alt="Free Grind user"
											title={t("profile_details.uses_free_grind")}
											className="h-4 w-4 shrink-0 rounded-full border border-[var(--border)]"
										/>
									)}
								</div>
								<p className={`text-xs leading-tight ${headerScrolled ? "text-[var(--text-muted)]" : "text-white/70"}`}>
									{[profileStatusLabel, profileDistance != null ? formatDistance(profileDistance, t, unitsPreset) : null].filter(Boolean).join(" · ")}
								</p>
							</div>
						</div>

						{/* Right: actions */}
						{isOwnProfile && (
							<button
								type="button"
								onClick={() => navigate("/settings/profile-editor")}
								className={`pointer-events-auto inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors ${headerScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
								aria-label={t("profile_editor.edit_profile")}
							>
								<Pencil className="h-4 w-4" />
							</button>
						)}
						{messageProfileId && !isOwnProfile && (
							<div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
								{/* Favorite */}
								{onToggleFavoriteProfile && (
									<button
										type="button"
										onClick={() => onToggleFavoriteProfile(String(messageProfileId), isFavorite)}
										disabled={isTogglingFavorite}
										className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors disabled:opacity-60 ${
											isFavorite
												? headerScrolled
													? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
													: "border-white/70 bg-white/15 text-white backdrop-blur-md"
												: headerScrolled
													? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)]"
													: "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"
										}`}
										aria-label={isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
									>
										<Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
									</button>
								)}

								{/* Block */}
								{(onBlockProfile || onUnblockProfile) && (
									<button
										type="button"
										onClick={() => isBlocked ? onUnblockProfile?.(String(messageProfileId)) : setShowBlockConfirm(true)}
										disabled={isBlockingProfile}
										className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors disabled:opacity-60 ${
											isBlocked
												? headerScrolled
													? "border-red-500/50 bg-red-500/10 text-red-400"
													: "border-red-400/60 bg-red-500/20 text-red-300 backdrop-blur-md"
												: headerScrolled
													? "border-red-500/40 bg-red-500/8 text-red-400 hover:border-red-500/70 hover:bg-red-500/15"
													: "border-red-400/50 bg-red-500/15 text-red-300 backdrop-blur-md hover:border-red-400/80"
										}`}
										aria-label={isBlocked ? t("profile_details.unblock") : t("profile_details.block")}
									>
										<Ban className="h-4 w-4" />
									</button>
								)}

								{/* Three-dot menu */}
								<div ref={actionsMenuRef} className="relative">
									<button
										type="button"
										onClick={() => setIsActionsMenuOpen((v) => !v)}
										className={`inline-flex shrink-0 items-center justify-center rounded-xl border p-2 transition-colors ${headerScrolled ? "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--text)]" : "border-white/45 bg-transparent text-white shadow-[0_10px_28px_-18px_rgba(0,0,0,0.95)] backdrop-blur-md"}`}
										aria-label="More actions"
										aria-expanded={isActionsMenuOpen}
									>
										<Ellipsis className="h-4 w-4" />
									</button>
									{isActionsMenuOpen && (
										<div className="absolute right-0 top-full z-50 mt-2 flex min-w-[190px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
											<button
												type="button"
												disabled={isTriangleDisabled}
												onClick={() => {
													setIsActionsMenuOpen(false);
													if (messageProfileId) onTriangleProfile?.(String(messageProfileId));
												}}
												className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
											>
												<Triangle className="mr-2 h-4 w-4 opacity-70" />
												{isLocatingProfile ? t("profile_details.locating") : t("profile_details.locate")}
											</button>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</header>

				<FeedScrollContainer ref={scrollContainerRef}>
					<div className="mx-auto w-full max-w-4xl px-[var(--app-px)] pt-0 pb-[calc(env(safe-area-inset-bottom,0px)+6rem)] sm:pb-5">
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
								openPhotoViewer={openPhotoViewer}
								activeProfileName={activeProfileName}
								estimatedCreatedAt={estimatedCreatedAt}
								profileStatusLabel={profileStatusLabel}
								profileStatusLevel={profileStatusLevel}
								ownTags={ownTags}
								profileDistance={profileDistance}
								chatContactStatus={chatContactStatus ?? null}
								messageProfileId={messageProfileId}
								usesFreegrind={usesFreegrind ?? false}
								onMessageProfile={isOwnProfile ? undefined : onMessageProfile}
								onTapProfile={isOwnProfile ? undefined : onTapProfile}
								onPhotoIndexChange={setMobileCarouselPhotoIndex}
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
							/>
						) : null}
					</div>
				</FeedScrollContainer>
				{photoViewerOverlay}
				{messageProfileId && !isOwnProfile && (
					<div
						className="pointer-events-none absolute inset-x-0 bottom-0 z-30"
						style={{
							paddingTop: "5rem",
							paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
							background: "linear-gradient(to top, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)",
						}}
					>
						<div
							ref={controlsBarRef}
							className="pointer-events-auto flex items-center gap-1 pl-4 pr-2"
							onPointerDown={(e) => e.stopPropagation()}
						>
							{/* Left: input — parent never changes opacity (would break backdrop-filter); each child animates its own opacity */}
							<div
								className="relative min-w-0 flex-1"
								style={{ pointerEvents: barInputVisible ? "auto" : "none" }}
							>
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
											onMessageProfile?.(String(messageProfileId));
											setQuickMessageDraft("");
										}
									}}
									placeholder={t("profile_details.message_placeholder")}
									className="relative h-13 w-full rounded-xl bg-transparent px-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
									style={{
										opacity: barInputVisible ? 1 : 0,
										transition: barInputVisible ? "opacity 0.25s" : "opacity 0.12s",
									}}
								/>
							</div>

							{/* Right: tap options (expand on long press) + tap btn + chat btn — fixed position */}
							<div className="flex shrink-0 items-center">
								{/* Tap options — always rendered, animate width open/closed */}
								{/* overflow-x:clip clips horizontal without forcing overflow-y to auto, so icons can scale upward freely */}
								<div
									className="transition-[max-width] duration-200 ease-out"
									style={{ maxWidth: barTapPickerOpen ? `${3 * 52}px` : "0px", overflowX: barTapPickerOpen ? "visible" : "clip", overflowY: "visible" }}
								>
									<div
										ref={barTapOptionsRef}
										className="flex items-center"
									>
										{[0, 2, 1].map((id) => (
											<div
												key={id}
												data-tap-id={id}
												className={`flex h-13 w-13 cursor-pointer items-center justify-center text-2xl leading-none transition-all duration-150 ${barTapHoverId === id ? "origin-bottom scale-[2] opacity-100" : "opacity-60"}`}
										style={barTapHoverId === id ? { filter: barTapGlow(id) } : undefined}
											>
												{barTapEmoji(id)}
											</div>
										))}
									</div>
								</div>
								{/* Tap button — always visible, kept in DOM for pointer capture */}
								<div>
									<button
										type="button"
										onPointerDown={handleBarTapPointerDown}
										onPointerMove={handleBarTapPointerMove}
										onPointerUp={handleBarTapPointerUp}
										onPointerCancel={() => { setBarTapPickerOpen(false); setBarTapHoverId(null); if (barTapLongPressRef.current) clearTimeout(barTapLongPressRef.current); barInputTimerRef.current = setTimeout(() => setBarInputVisible(true), 210); }}
										disabled={isTapDisabled}
										className={`tap-btn-base relative inline-flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-2xl leading-none transition-all touch-none select-none ${isTappingProfile ? "opacity-40" : ""} ${isTapActive || barTapHoverId !== null ? "text-white" : "text-[var(--text-muted)]"}`}
									style={isTapBlocked ? { filter: barTapGlow(tapVisualState.tapId) } : barTapHoverId !== null ? { filter: barTapGlow(barTapHoverId) } : undefined}
									>
										{barTapHoverId !== null
											? barTapEmoji(barTapHoverId)
											: isTapActive
												? barTapEmoji(tapVisualState.tapId)
												: <Flame className="h-6 w-6" strokeWidth={1.8} />
										}
									</button>
								</div>
								{(onMessageProfile || onSendQuickMessage) && (
									<button
										type="button"
										onClick={() => {
											if (quickMessageDraft.trim()) {
												onSendQuickMessage?.(String(messageProfileId), quickMessageDraft.trim());
												setQuickMessageDraft("");
											}
											onMessageProfile?.(String(messageProfileId));
										}}
										className="inline-flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-[var(--accent)] transition hover:brightness-110"
										aria-label={t("profile_details.message")}
									>
										<MessageCircle className="h-6 w-6" />
									</button>
								)}
							</div>
						</div>
					</div>
				)}
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
							style={{ left: "50%", top: "50%", zIndex: 201, filter: barTapGlow(barTapFlyEmoji.id) }}
						>
							{barTapEmoji(barTapFlyEmoji.id)}
						</span>
					</>
				)}
				<ConfirmDialog
					isOpen={showBlockConfirm}
					onCancel={() => setShowBlockConfirm(false)}
					onConfirm={() => { setShowBlockConfirm(false); if (messageProfileId) onBlockProfile?.(String(messageProfileId)); }}
					title={t("profile_details.block")}
					message={t("profile_details.block_confirm")}
					confirmLabel={t("profile_details.block")}
					cancelLabel={t("common.cancel")}
					confirmTone="danger"
					isProcessing={isBlockingProfile}
				/>
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
				className="surface-card flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl sm:max-h-[calc(100dvh-8rem)]"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 sm:px-5">
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)]"
						aria-label={t("profile_details.close_profile_details")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<p className="truncate text-base font-semibold">{activeProfileName}</p>
							{activeProfile?.age != null && Number.isFinite(activeProfile.age) && (
								<span className="shrink-0 text-sm text-[var(--text-muted)]">{activeProfile.age}</span>
							)}
						</div>
						<p className="mt-0.5 text-xs text-[var(--text-muted)]">
							{[profileStatusLabel, profileDistance != null ? formatDistance(profileDistance, t, unitsPreset) : null].filter(Boolean).join(" · ")}
						</p>
					</div>
					{isOwnProfile && (
						<button
							type="button"
							onClick={() => navigate("/settings/profile-editor")}
							className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)]"
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
									className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-60 ${isFavorite ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
									aria-label={isFavorite ? t("chat.unfavorite") : t("chat.favorite")}
								>
									<Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
								</button>
							)}
							{(onBlockProfile || onUnblockProfile) && (
								<button
									type="button"
									onClick={() => isBlocked ? onUnblockProfile?.(String(messageProfileId)) : setShowBlockConfirm(true)}
									disabled={isBlockingProfile}
									className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-60 ${isBlocked ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-red-500/40 bg-red-500/8 text-red-400 hover:border-red-500/70 hover:bg-red-500/15"}`}
									aria-label={isBlocked ? t("profile_details.unblock") : t("profile_details.block")}
								>
									<Ban className="h-4 w-4" />
								</button>
							)}
							<div ref={actionsMenuRef} className="relative">
								<button
									type="button"
									onClick={() => setIsActionsMenuOpen((v) => !v)}
									className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
									aria-label="More actions"
									aria-expanded={isActionsMenuOpen}
								>
									<Ellipsis className="h-4 w-4" />
								</button>
								{isActionsMenuOpen && (
									<div className="absolute right-0 top-full z-50 mt-2 flex min-w-[190px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg">
										<button
											type="button"
											disabled={isTriangleDisabled}
											onClick={() => {
												setIsActionsMenuOpen(false);
												if (messageProfileId) onTriangleProfile?.(String(messageProfileId));
											}}
											className="flex items-center rounded-lg px-2 py-2 text-left text-sm text-[var(--text)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
										>
											<Triangle className="mr-2 h-4 w-4 opacity-70" />
											{isLocatingProfile ? t("profile_details.locating") : t("profile_details.locate")}
										</button>
									</div>
								)}
							</div>
						</div>
					)}
				</div>

				<div
					data-lenis-prevent
					className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
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
							openPhotoViewer={openPhotoViewer}
							activeProfileName={activeProfileName}
							estimatedCreatedAt={estimatedCreatedAt}
							profileStatusLabel={profileStatusLabel}
							profileStatusLevel={profileStatusLevel}
							ownTags={ownTags}
							profileDistance={profileDistance}
							chatContactStatus={chatContactStatus ?? null}
							messageProfileId={messageProfileId}
							usesFreegrind={usesFreegrind ?? false}
							onMessageProfile={undefined}
							onTapProfile={undefined}
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
						/>
					) : null}
				</div>

				{/* Bottom actions bar — desktop modal */}
				{messageProfileId && !isOwnProfile && (
					<div
						ref={controlsBarRef}
						className="flex items-center gap-1 border-t border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
						onPointerDown={(e) => e.stopPropagation()}
					>
						{/* Chat input */}
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

						{/* Tap options */}
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

						{/* Tap button */}
						<button
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

						{/* Message button */}
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
								<MessageCircle className="h-5 w-5" strokeWidth={1.8} />
							</button>
						)}
					</div>
				)}
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
						style={{ left: "50%", top: "50%", zIndex: 201, filter: barTapGlow(barTapFlyEmoji.id) }}
					>
						{barTapEmoji(barTapFlyEmoji.id)}
					</span>
				</>
			)}
			{photoViewerOverlay}
			<ConfirmDialog
				isOpen={showBlockConfirm}
				onCancel={() => setShowBlockConfirm(false)}
				onConfirm={() => { setShowBlockConfirm(false); if (messageProfileId) onBlockProfile?.(String(messageProfileId)); }}
				title={t("profile_details.block")}
				message={t("profile_details.block_confirm")}
				confirmLabel={t("profile_details.block")}
				cancelLabel={t("common.cancel")}
				confirmTone="danger"
				isProcessing={isBlockingProfile}
			/>
		</div>
	);
}