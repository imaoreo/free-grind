import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
	ArrowUpDown,
	Clock,
	Home,
	Loader2,
	MessageSquare,
	Navigation,
	SlidersHorizontal,
} from "lucide-react";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useRightNowFeed } from "../../hooks/queries/useRightNowQueries";
import type { RightNowFeedItem } from "../../services/apiFunctions";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { formatDistance } from "./gridpage/utils";
import { formatRelativeTime } from "../../utils/relativeTime";
import { cn } from "../../utils/cn";
import { ProfileImage } from "../../components/ui/profile-image";
import { useRevealOnScroll } from "../../hooks/useRevealOnScroll";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import {
	type RightNowFiltersDraft,
	type RightNowSortOption,
	loadRightNowFiltersDraft,
	saveRightNowFiltersDraft,
} from "./rightnow/rightnow-filters-storage";
import { getSexualPositionFilterOptions } from "./profile-option-builders";
import { usePreferences } from "../../contexts/PreferencesContext";
import { RightNowPostFAB, type RightNowFABPhase } from "./rightnow/RightNowPostFAB";
import { RightNowPostPage } from "./rightnow/RightNowPostPage";
import { RightNowFiltersPage } from "./RightNowFiltersPage";
import { PhotoViewer } from "../../components/PhotoViewer";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import {
	SCROLL_RESTORATION_TIMEOUT_MS,
} from "../../config/ui-constants";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { FeedScrollContainer } from "../../components/ui/FeedScrollContainer";

type SortOption = RightNowSortOption;

function parseFiltersFromLocationState(
	state: unknown,
	current: RightNowFiltersDraft,
): RightNowFiltersDraft {
	if (typeof state !== "object" || state === null) {
		return current;
	}

	const safe = state as { rightNowFiltersDraft?: Partial<RightNowFiltersDraft> };
	const draft = safe.rightNowFiltersDraft;
	if (!draft) {
		return current;
	}

	const nextAgeMin =
		typeof draft.ageMin === "number" && Number.isFinite(draft.ageMin)
			? Math.max(18, Math.min(99, draft.ageMin))
			: current.ageMin;
	const nextAgeMax =
		typeof draft.ageMax === "number" && Number.isFinite(draft.ageMax)
			? Math.max(nextAgeMin, Math.min(99, draft.ageMax))
			: current.ageMax;

	return {
		ageMin: nextAgeMin,
		ageMax: nextAgeMax,
		positionFilter:
			typeof draft.positionFilter === "string"
				? draft.positionFilter
				: current.positionFilter,
	};
}

function getItemName(item: RightNowFeedItem, t: TFunction): string {
	const name = item.displayName?.trim();
	if (name) return name;
	return t("profile_details.profile_fallback", { id: item.profileId });
}

function getItemImageUrl(item: RightNowFeedItem): string | null {
	return item.profileImageMediaHash && validateMediaHash(item.profileImageMediaHash)
		? getThumbImageUrl(item.profileImageMediaHash, "320x320")
		: null;
}

function getItemDisplayImageUrl(item: RightNowFeedItem): string | null {
	return getItemImageUrl(item);
}

function isItemOnline(item: RightNowFeedItem): boolean {
	return typeof item.onlineUntil === "number" && item.onlineUntil > Date.now();
}

function PostMediaGrid({
	media,
	onOpenPhoto,
}: {
	media: RightNowFeedItem["media"];
	onOpenPhoto: (index: number) => void;
}) {
	const isDesktop = useDesktopBreakpoint();
	if (!media || media.length === 0) return null;

	const items = media.slice(0, 3);
	const count = items.length;

	return (
		<div
			className={cn(
				"mt-1.5 overflow-hidden rounded-md bg-[var(--surface-2)]",
				isDesktop ? "w-[380px]" : "w-full sm:max-w-[260px]"
			)}
		>
			<div className="relative aspect-video w-full flex gap-[2px]">
				{count === 1 && (
					<button
						type="button"
						className="h-full w-full overflow-hidden"
						onClick={() => onOpenPhoto(0)}
					>
						<img
							src={items[0].data?.fullImageUrl ?? items[0].data?.thumbnailUrl ?? ""}
							className="h-full w-full object-cover transition-transform active:scale-105"
							alt=""
						/>
					</button>
				)}

				{count === 2 && (
					<>
						<button
							type="button"
							className="flex-1 overflow-hidden"
							onClick={() => onOpenPhoto(0)}
						>
							<img
								src={items[0].data?.fullImageUrl ?? items[0].data?.thumbnailUrl ?? ""}
								className="h-full w-full object-cover transition-transform active:scale-105"
								alt=""
							/>
						</button>
						<button
							type="button"
							className="flex-1 overflow-hidden"
							onClick={() => onOpenPhoto(1)}
						>
							<img
								src={items[1].data?.fullImageUrl ?? items[1].data?.thumbnailUrl ?? ""}
								className="h-full w-full object-cover transition-transform active:scale-105"
								alt=""
							/>
						</button>
					</>
				)}

				{count === 3 && (
					<>
						<button
							type="button"
							className="w-[60%] overflow-hidden"
							onClick={() => onOpenPhoto(0)}
						>
							<img
								src={items[0].data?.fullImageUrl ?? items[0].data?.thumbnailUrl ?? ""}
								className="h-full w-full object-cover transition-transform active:scale-105"
								alt=""
							/>
						</button>
						<div className="flex w-[40%] flex-col gap-[2px]">
							<button
								type="button"
								className="flex-1 overflow-hidden"
								onClick={() => onOpenPhoto(1)}
							>
								<img
									src={items[1].data?.fullImageUrl ?? items[1].data?.thumbnailUrl ?? ""}
									className="h-full w-full object-cover transition-transform active:scale-105"
									alt=""
								/>
							</button>
							<button
								type="button"
								className="flex-1 overflow-hidden"
								onClick={() => onOpenPhoto(2)}
							>
								<img
									src={items[2].data?.fullImageUrl ?? items[2].data?.thumbnailUrl ?? ""}
									className="h-full w-full object-cover transition-transform active:scale-105"
									alt=""
								/>
							</button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

function RightNowRow({
	item,
	onMessage,
	onSelect,
	onOpenPhoto,
}: {
	item: RightNowFeedItem;
	onMessage: (profileId: string) => void;
	onSelect: (profileId: string) => void;
	onOpenPhoto: (photos: string[], index: number) => void;
}) {
	const { t } = useTranslation();
	const { unitsPreset } = usePreferences();
	const { ref, revealClass } = useRevealOnScroll();
	const name = getItemName(item, t);
	const isHosting = item.hosting;
	const imageUrl = getItemDisplayImageUrl(item);

	const timeAgo = formatRelativeTime(item.postedAt);
	const distance =
		item.distanceMeters != null
			? formatDistance(item.distanceMeters, t, unitsPreset)
			: null;
	const isOnline = isItemOnline(item);

	const photos = useMemo(() => {
		return (item.media || [])
			.map((m) => m.data?.fullImageUrl || m.data?.thumbnailUrl || "")
			.filter(Boolean);
	}, [item.media]);

	return (
		<div
			ref={ref}
			className={cn(
				"flex items-start gap-3 px-5 py-4 border-b border-[var(--surface-2)]",
				revealClass
			)}
		>
			<button
				type="button"
				className="relative mt-0.5 shrink-0"
				onClick={() => onSelect(item.profileId)}
			>
				<div className="h-14 w-14 overflow-hidden rounded-full">
					<ProfileImage src={imageUrl} alt={name || ""} />
				</div>
				{isOnline ? (
					<span className="absolute bottom-0.5 left-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-green-500" />
				) : null}
			</button>

			<div className="min-w-0 flex-1">
				<button
					type="button"
					className="w-full text-left"
					onClick={() => onSelect(item.profileId)}
				>
					{item.text && (
						<p className="line-clamp-3 text-sm font-bold text-[var(--text)] leading-relaxed mb-1">
							{item.text}
						</p>
					)}

					<div className="flex items-center gap-3">
						{timeAgo ? (
							<span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
								<Clock className="h-3 w-3" />
								{timeAgo}
							</span>
						) : null}
						{distance && distance !== "hidden" ? (
							<span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
								<Navigation className="h-3 w-3" />
								{distance}
							</span>
						) : null}
						{isHosting && (
							<span className="flex items-center gap-1 text-xs text-[var(--right-now)]">
								<Home className="h-3.5 w-3.5" />
							</span>
						)}
					</div>

					<div className="mt-1 flex items-center justify-between gap-2">
						<p className="truncate text-xs text-[var(--text-muted)] font-medium">
							{name}
						</p>
						{item.premiumType && item.premiumType !== "locked" && (
							<span className="shrink-0 text-[10px] font-medium text-[var(--text-muted)] opacity-50 uppercase tracking-wider">
								{item.premiumType.split("_")[0]}
							</span>
						)}
					</div>
				</button>

				<PostMediaGrid
					media={item.media}
					onOpenPhoto={(index) => onOpenPhoto(photos, index)}
				/>
			</div>

			<button
				type="button"
				onClick={() => onMessage(item.profileId)}
				className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--right-now)]/40 text-[var(--right-now)] backdrop-blur-xl transition-all active:scale-95 hover:border-[var(--right-now)]/60"
				style={{
					backgroundColor: "color-mix(in srgb, var(--right-now), transparent 88%)",
					boxShadow: "0 4px 10px color-mix(in srgb, var(--right-now), transparent 85%)"
				}}
				aria-label={t("right_now.message_aria", { name: name || "" })}
			>
				<MessageSquare className="h-4 w-4" />
			</button>
		</div>
	);
}

function RightNowSkeleton() {
	return (
		<div className="flex items-start gap-3 px-5 py-4 animate-pulse">
			<div className="h-14 w-14 shrink-0 rounded-full bg-[var(--surface-2)]" />
			<div className="flex-1 space-y-3 pt-1">
				<div className="space-y-2">
					<div className="h-4 w-[85%] rounded bg-[var(--surface-2)]" />
					<div className="h-4 w-[60%] rounded bg-[var(--surface-2)]" />
				</div>
				<div className="flex items-center gap-3">
					<div className="h-3 w-16 rounded bg-[var(--surface-2)]" />
					<div className="h-3 w-12 rounded bg-[var(--surface-2)]" />
				</div>
			</div>
			<div className="h-10 w-10 shrink-0 rounded-full bg-[var(--surface-2)]" />
		</div>
	);
}

export function RightNowPage() {
	const { t } = useTranslation();
	const location = useLocation();
	const navigate = useNavigate();
	const persistedFilters = useMemo(() => loadRightNowFiltersDraft(), []);

	const [sort, setSort] = useState<SortOption>(persistedFilters.sort);
	const [hostingOnly, setHostingOnly] = useState(persistedFilters.hostingOnly);
	const [ageMin, setAgeMin] = useState(persistedFilters.ageMin);
	const [ageMax, setAgeMax] = useState(persistedFilters.ageMax);
	const [positionFilter, setPositionFilter] = useState<string>(
		persistedFilters.positionFilter,
	);
	const [hasRestoredScroll, setHasRestoredScroll] = useState(false);

	const queryParams = useMemo(() => ({
		sort,
		hosting: hostingOnly ? true : undefined,
		ageMin: ageMin > 18 ? ageMin : undefined,
		ageMax: ageMax < 99 ? ageMax : undefined,
		sexualPositions: positionFilter || undefined,
	}), [sort, hostingOnly, ageMin, ageMax, positionFilter]);

	const { data: items = [], isLoading, error, refetch } = useRightNowFeed(queryParams);

	const [viewerPhotos, setViewerPhotos] = useState<string[]>([]);
	const [viewerIndex, setViewerIndex] = useState(0);
	const [isViewerOpen, setIsViewerOpen] = useState(false);

	const openPhotoViewer = useCallback((photos: string[], index: number) => {
		setViewerPhotos(photos);
		setViewerIndex(index);
		setIsViewerOpen(true);
	}, []);

	const [isPosting, setIsPosting] = useState(false);
	const [isModalMounted, setIsModalMounted] = useState(false);
	const [isFiltersOpen, setIsFiltersOpen] = useState(false);
	const [isFiltersMounted, setIsFiltersMounted] = useState(false);
	const [fabPhase, setFabPhase] = useState<RightNowFABPhase>("idle");
	const feedContainerRef = useRef<HTMLDivElement | null>(null);

	const handlePostClick = useCallback(() => {
		setIsPosting(true);
		setIsModalMounted(true);
	}, []);

	const handlePostSuccess = useCallback((isEdit: boolean) => {
		if (!isEdit) {
			setFabPhase("loading");
		}
		setIsPosting(false);
		setTimeout(() => setIsModalMounted(false), 300);
	}, []);

	const handleCloseModal = useCallback(() => {
		setIsPosting(false);
		setTimeout(() => setIsModalMounted(false), 300);
	}, []);

	const positionFilterOptions = useMemo(
		() => getSexualPositionFilterOptions(t, t("right_now.any_position")),
		[t],
	);

	const ageLabel = `${ageMin}-${ageMax}${ageMax >= 99 ? "+" : ""}`;
	const activePositionFilter =
		positionFilterOptions.find((option) => option.value === positionFilter) ??
		positionFilterOptions[0];
	const hasAdvancedFilters = positionFilter.length > 0 || ageMin !== 18 || ageMax !== 99;
	const filterSummary = useMemo(
		() =>
			t("right_now.filter_summary", {
				position: activePositionFilter.label,
				age: ageLabel,
			}),
		[activePositionFilter.label, ageLabel, t],
	);

	useEffect(() => {
		const next = parseFiltersFromLocationState(location.state, {
			ageMin,
			ageMax,
			positionFilter,
		});

		if (
			next.ageMin !== ageMin ||
			next.ageMax !== ageMax ||
			next.positionFilter !== positionFilter
		) {
			setAgeMin(next.ageMin);
			setAgeMax(next.ageMax);
			setPositionFilter(next.positionFilter);

			const safeState =
				typeof location.state === "object" && location.state !== null
					? (location.state as Record<string, unknown>)
					: {};
			navigate(location.pathname + location.search, {
				replace: true,
				state: { ...safeState, rightNowFiltersDraft: undefined },
			});
		}
	}, [location.key, location.state, navigate, location.pathname, location.search, ageMin, ageMax, positionFilter]);

	useEffect(() => {
		saveRightNowFiltersDraft({
			sort,
			hostingOnly,
			ageMin,
			ageMax,
			positionFilter,
		});
	}, [sort, hostingOnly, ageMin, ageMax, positionFilter]);

	const { activeRightNowId, activeRightNowExpiresAt, rightNowRemaining, setPreferences, developerMode, showDebugInfo, rightNowTestMode } = usePreferences();

	const isSessionActive = useMemo(() => {
		if (!activeRightNowId || !activeRightNowExpiresAt) return false;
		return Date.now() < activeRightNowExpiresAt;
	}, [activeRightNowId, activeRightNowExpiresAt]);

	useEffect(() => {
		const isClearlyActive = activeRightNowId && activeRightNowExpiresAt && (Date.now() < activeRightNowExpiresAt - 2000);

		if (isClearlyActive && fabPhase === "idle" && !isPosting) {
			setFabPhase("countdown");
		} else if (!isSessionActive && fabPhase === "countdown" && !isPosting) {
			setFabPhase("idle");
		}
	}, [isSessionActive, fabPhase, isPosting, activeRightNowId, activeRightNowExpiresAt]);

	useEffect(() => {
		if (!isSessionActive && activeRightNowId) {
			void setPreferences({
				activeRightNowId: null,
				activeRightNowExpiresAt: null,
			});
		}
	}, [isSessionActive, activeRightNowId, setPreferences]);

	// Scroll Memory logic
	useEffect(() => {
		const container = feedContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			if (container.scrollTop > 0) {
				const scrollData = {
					top: container.scrollTop,
					timestamp: Date.now()
				};
				sessionStorage.setItem("rightnow-scroll", JSON.stringify(scrollData));
			}
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	useLayoutEffect(() => {
		if (items.length > 0 && !isLoading && !hasRestoredScroll && feedContainerRef.current) {
			const storageKey = "rightnow-scroll";
			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				try {
					const parsed = JSON.parse(saved);
					// Safety check: is it our new object format or just an old number?
					if (parsed && typeof parsed === "object" && "top" in parsed) {
						const { top, timestamp } = parsed;
						if (Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS && top > 0) {
							feedContainerRef.current.scrollTop = top;
						} else {
							sessionStorage.removeItem(storageKey);
						}
					} else {
						// Old numeric format, clear it
						sessionStorage.removeItem(storageKey);
					}
				} catch (e) {
					sessionStorage.removeItem(storageKey);
				}
			}
			setHasRestoredScroll(true);
		}
	}, [items.length, isLoading, hasRestoredScroll]);

	const handleMessage = useCallback(
		(profileId: string) => {
			const params = new URLSearchParams();
			params.set("targetProfileId", profileId);
			navigate(`/chat?${params.toString()}`);
		},
		[navigate],
	);

	const handleSelect = useCallback(
		(profileId: string) => {
			navigate(`/profile/${profileId}`, {
				state: { returnTo: location.pathname },
			});
		},
		[navigate, location.pathname],
	);

	const toggleSort = useCallback(() => {
		setSort((prev) => (prev === "DISTANCE" ? "RECENCY" : "DISTANCE"));
		setHasRestoredScroll(false);
	}, []);

	const toggleHostingOnly = useCallback(() => {
		setHostingOnly((previous) => !previous);
		setHasRestoredScroll(false);
	}, []);

	const openFilters = useCallback(() => {
		setIsFiltersOpen(true);
		setIsFiltersMounted(true);
	}, []);

	const handleApplyFilters = useCallback((draft: RightNowFiltersDraft) => {
		setAgeMin(draft.ageMin);
		setAgeMax(draft.ageMax);
		setPositionFilter(draft.positionFilter);
		setHasRestoredScroll(false);
	}, []);

	const handleCloseFilters = useCallback(() => {
		setIsFiltersOpen(false);
		setTimeout(() => setIsFiltersMounted(false), 300);
	}, []);

	return (
		<>
		<PullToRefreshContainer
			className="app-screen flex h-dvh flex-col w-full !px-0 !pb-0 overflow-x-hidden"
			contentClassName="flex flex-1 flex-col min-h-0"
			style={{ overflow: "visible", overflowX: "hidden" }}
			onRefresh={() => refetch()}
			isDisabled={isLoading}
			isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("right_now.refreshing")}
			spinnerColor="var(--right-now)"
			spinnerIconColor="white"
		>
			<header className="relative z-20 grid gap-3 px-[var(--app-px)] pointer-events-none">
				<PageHeaderBackground color="var(--right-now)" />
				<div className="pointer-events-auto grid gap-3 mx-auto w-full max-w-4xl">
					<h1 className="app-title">{t("right_now.title")}</h1>

					<div className="flex flex-wrap items-center gap-2 pb-1">
						<button
							type="button"
							onClick={toggleSort}
							className={cn(
								"flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-all active:scale-95",
								"bg-[var(--right-now)] border-[var(--right-now)] text-white shadow-lg shadow-[var(--right-now)]/40",
							)}
						>
							<ArrowUpDown className="h-3.5 w-3.5" />
							{sort === "DISTANCE" ? t("right_now.distance") : t("right_now.recent")}
						</button>

						<button
							type="button"
							onClick={toggleHostingOnly}
							className={cn(
								"shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-all active:scale-95",
								hostingOnly
									? "bg-[var(--right-now)] border-[var(--right-now)] text-white shadow-lg shadow-[var(--right-now)]/40"
									: "border-[var(--right-now)]/40 text-[var(--right-now)] backdrop-blur-xl hover:border-[var(--right-now)]/60 hover:bg-[var(--right-now)]/20",
							)}
							style={!hostingOnly ? {
								backgroundColor: "color-mix(in srgb, var(--right-now), transparent 88%)",
								boxShadow: "0 4px 12px color-mix(in srgb, var(--right-now), transparent 85%)"
							} : undefined}
						>
							{t("right_now.hosting")}
						</button>

						<button
							type="button"
							onClick={openFilters}
							className={cn(
								"inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-all active:scale-95",
								hasAdvancedFilters
									? "bg-[var(--right-now)] border-[var(--right-now)] text-white shadow-lg shadow-[var(--right-now)]/40"
									: "border-[var(--right-now)]/40 text-[var(--right-now)] backdrop-blur-xl hover:border-[var(--right-now)]/60 hover:bg-[var(--right-now)]/20",
							)}
							style={!hasAdvancedFilters ? {
								backgroundColor: "color-mix(in srgb, var(--right-now), transparent 88%)",
								boxShadow: "0 4px 12px color-mix(in srgb, var(--right-now), transparent 85%)"
							} : undefined}
						>
							<SlidersHorizontal className="h-3.5 w-3.5" />
							{t("right_now.filters")}
						</button>

						<span className="text-xs text-[var(--text-muted)] sm:text-sm">
							{filterSummary}
						</span>
					</div>
				</div>
			</header>

			<FeedScrollContainer ref={feedContainerRef}>
				{isLoading ? (
					<div className="mx-auto max-w-2xl divide-y divide-[var(--surface-2)] pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
						{Array.from({ length: 6 }).map((_, i) => (
							<RightNowSkeleton key={i} />
						))}
					</div>
				) : error ? (
					<div className="px-[var(--app-px)] py-8 text-center">
						<p className="mb-3 text-sm text-[var(--text-muted)]">{error instanceof Error ? error.message : String(error)}</p>
						<button
							type="button"
							onClick={() => void refetch()}
							className="rounded-full border border-[var(--right-now)]/30 px-4 py-2 text-sm font-bold text-[var(--right-now)]/70 transition-all hover:border-[var(--right-now)]/50 hover:text-[var(--right-now)] active:scale-95"
							style={{ backgroundColor: "color-mix(in srgb, var(--right-now), transparent 95%)" }}
						>
							{t("right_now.try_again")}
						</button>
					</div>
				) : items.length === 0 ? (
					<div className="px-[var(--app-px)] py-16 text-center">
						<p className="text-sm text-[var(--text-muted)]">{t("right_now.empty")}</p>
					</div>
				) : (
					<div className="mx-auto max-w-2xl pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
						{items.map((item) => (
							<div key={`${item.id}-${item.profileId}`} className="px-0">
								<RightNowRow
									item={item}
									onMessage={handleMessage}
									onSelect={handleSelect}
									onOpenPhoto={openPhotoViewer}
								/>
							</div>
						))}
					</div>
				)}
			</FeedScrollContainer>
		</PullToRefreshContainer>

		<div className="fixed inset-x-0 bottom-30 z-[60] pointer-events-none md:bottom-36">
			<div className="relative mx-auto h-full w-full max-w-4xl px-4 md:px-10">
				{developerMode && showDebugInfo && (
					<div
						className={cn(
							"absolute bottom-0 left-4 transition-all duration-300 pointer-events-auto",
							(isPosting || isFiltersOpen) ? "pointer-events-none opacity-0 translate-y-4" : "opacity-100 translate-y-0",
						)}
					>
						<button
							type="button"
							onClick={() => void setPreferences({ rightNowTestMode: !rightNowTestMode })}
							className={cn(
								"flex h-12 items-center gap-2 rounded-full border px-4 text-xs font-black shadow-xl transition-all active:scale-90",
								rightNowTestMode
									? "bg-blue-600 border-blue-600 text-white shadow-blue-600/40"
									: "bg-[var(--surface-2)] border-[var(--border)] text-[var(--text)]"
							)}
						>
							<div className={cn(
								"h-2 w-2 rounded-full",
								rightNowTestMode ? "bg-white animate-pulse" : "bg-blue-500"
							)} />
							{rightNowTestMode ? "TEST MODE" : "LIVE MODE"}
						</button>
					</div>
				)}

				<div
					className={cn(
						"absolute bottom-0 right-[16%] translate-x-1/2 transition-opacity duration-300 pointer-events-auto",
						(isPosting || isFiltersOpen) ? "pointer-events-none opacity-0" : "opacity-100",
					)}
				>
					<RightNowPostFAB
						onClick={handlePostClick}
						phase={fabPhase}
						onPhaseChange={setFabPhase}
						isEditMode={isSessionActive}
						expiresAt={activeRightNowExpiresAt}
						rightNowRemaining={rightNowRemaining}
						isTestMode={rightNowTestMode}
					/>
				</div>
			</div>
		</div>
		{isModalMounted && (
			<RightNowPostPage
				onClose={handleCloseModal}
				onPost={handlePostSuccess}
			/>
		)}
		{isFiltersMounted && (
			<RightNowFiltersPage
				initialDraft={{ ageMin, ageMax, positionFilter }}
				onClose={handleCloseFilters}
				onApply={handleApplyFilters}
			/>
		)}
		{isViewerOpen && (
			<PhotoViewer
				isOpen={true}
				onClose={() => setIsViewerOpen(false)}
				photos={viewerPhotos}
				initialIndex={viewerIndex}
			/>
		)}
	</>
	);
}
