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
import type { RightNowFeedItem } from "../../services/apiFunctions";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { formatDistance } from "./gridpage/utils";
import { formatRelativeTime } from "../../utils/relativeTime";
import { cn } from "../../utils/cn";
import blankProfileImage from "../../images/blank-profile.png";
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
import { getCachedRightNowFeed, setCachedRightNowFeed } from "./rightnow/rightnow-cache";

type SortOption = RightNowSortOption;

function buildRightNowFeedCacheKey(
	sort: SortOption,
	hostingOnly: boolean,
	ageMin: number,
	ageMax: number,
	positionFilter: string,
): string {
	return [sort, hostingOnly ? "hosting" : "all", ageMin, ageMax, positionFilter || "any"].join("|");
}

function sortItemsByOption(items: RightNowFeedItem[], sort: SortOption): RightNowFeedItem[] {
	const sorted = [...items];
	if (sort === "DISTANCE") {
		sorted.sort((left, right) => {
			const leftDistance = left.distanceMeters ?? Number.POSITIVE_INFINITY;
			const rightDistance = right.distanceMeters ?? Number.POSITIVE_INFINITY;
			return leftDistance - rightDistance;
		});
		return sorted;
	}

	sorted.sort((left, right) => {
		const leftPostedAt = left.postedAt ?? 0;
		const rightPostedAt = right.postedAt ?? 0;
		return rightPostedAt - leftPostedAt;
	});
	return sorted;
}

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
	// Only use the profileImageMediaHash for the avatar circle
	return item.profileImageMediaHash && validateMediaHash(item.profileImageMediaHash)
		? getThumbImageUrl(item.profileImageMediaHash, "320x320")
		: null;
}

function getItemDisplayImageUrl(item: RightNowFeedItem): string {
	return getItemImageUrl(item) ?? blankProfileImage;
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

	const items = media.slice(0, 3); // Limit to max 3 as requested
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
		<div className="flex items-start gap-3 px-5 py-4">
			{/* Avatar */}
			<button
				type="button"
				className="relative mt-0.5 shrink-0"
				onClick={() => onSelect(item.profileId)}
			>
				<div className="h-14 w-14 overflow-hidden rounded-full bg-[var(--surface-2)]">
					<img src={imageUrl} alt={name || ""} className="h-full w-full object-cover" />
				</div>
				{isOnline ? (
					<span className="absolute bottom-0.5 left-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-green-500" />
				) : null}
			</button>

			{/* Text info */}
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

				{/* Post Images Grid */}
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

export function RightNowPage() {
	const { t } = useTranslation();
	const apiFunctions = useApiFunctions();
	const location = useLocation();
	const navigate = useNavigate();
	const persistedFilters = useMemo(() => loadRightNowFiltersDraft(), []);
	const initialCacheKey = useMemo(
		() =>
			buildRightNowFeedCacheKey(
				persistedFilters.sort,
				persistedFilters.hostingOnly,
				persistedFilters.ageMin,
				persistedFilters.ageMax,
				persistedFilters.positionFilter,
			),
		[persistedFilters],
	);

	const [items, setItems] = useState<RightNowFeedItem[]>(() => getCachedRightNowFeed(initialCacheKey) || []);
	const [isLoading, setIsLoading] = useState(() => !getCachedRightNowFeed(initialCacheKey));
	const [error, setError] = useState<string | null>(null);
	const [sort, setSort] = useState<SortOption>(persistedFilters.sort);
	const [hostingOnly, setHostingOnly] = useState(persistedFilters.hostingOnly);
	const [ageMin, setAgeMin] = useState(persistedFilters.ageMin);
	const [ageMax, setAgeMax] = useState(persistedFilters.ageMax);
	const [positionFilter, setPositionFilter] = useState<string>(
		persistedFilters.positionFilter,
	);
	const [hasRestoredScroll, setHasRestoredScroll] = useState(false);

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
	const unfilteredItemsRef = useRef<RightNowFeedItem[] | null>(null);

	const handlePostClick = useCallback(() => {
		setIsPosting(true);
		setIsModalMounted(true);
	}, []);

	const handlePostSuccess = useCallback((isEdit: boolean) => {
		if (!isEdit) {
			setFabPhase("loading");
		}
		setIsPosting(false); // Button starts fading in
		// Let the modal stay for 300ms to finish its animation
		setTimeout(() => setIsModalMounted(false), 300);
	}, [setFabPhase]);

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

			// Clear the state from the history entry so it doesn't re-apply when returning to this page
			const safeState =
				typeof location.state === "object" && location.state !== null
					? (location.state as Record<string, unknown>)
					: {};
			navigate(location.pathname + location.search, {
				replace: true,
				state: { ...safeState, rightNowFiltersDraft: undefined },
			});
		}
	}, [
		location.key,
		location.state,
		navigate,
		location.pathname,
		location.search,
		ageMin,
		ageMax,
		positionFilter,
	]);

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
	const isMountedRef = useRef(true);

	const isSessionActive = useMemo(() => {
		if (!activeRightNowId || !activeRightNowExpiresAt) return false;
		return Date.now() < activeRightNowExpiresAt;
	}, [activeRightNowId, activeRightNowExpiresAt]);

	useEffect(() => {
		// Only transition idle -> countdown if the session is clearly active
		// We add a small buffer (2s) to avoid fighting with the FAB's own countdown
		const isClearlyActive = activeRightNowId && activeRightNowExpiresAt && (Date.now() < activeRightNowExpiresAt - 2000);

		if (isClearlyActive && fabPhase === "idle" && !isPosting) {
			setFabPhase("countdown");
		} else if (!isSessionActive && fabPhase === "countdown" && !isPosting) {
			// Session ended or expired
			setFabPhase("idle");
		}
	}, [isSessionActive, fabPhase, isPosting, activeRightNowId, activeRightNowExpiresAt]);

	// Auto-clear expired session from preferences
	useEffect(() => {
		if (!isSessionActive && activeRightNowId) {
			void setPreferences({
				activeRightNowId: null,
				activeRightNowExpiresAt: null,
			});
		}
	}, [isSessionActive, activeRightNowId, setPreferences]);

	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const loadFeed = useCallback(async (ignoreCache = false) => {
		const cacheKey = buildRightNowFeedCacheKey(
			sort,
			hostingOnly,
			ageMin,
			ageMax,
			positionFilter,
		);
		if (!ignoreCache) {
			const cached = getCachedRightNowFeed(cacheKey);
			if (cached) {
				setItems(cached);
				if (!hostingOnly) {
					unfilteredItemsRef.current = cached;
				}
				setIsLoading(false);
				return;
			}
		}

		setIsLoading(true);
		setError(null);
		try {
			const result = await apiFunctions.getRightNowFeed({
				sort,
				hosting: hostingOnly ? true : undefined,
				ageMin: ageMin > 18 ? ageMin : undefined,
				ageMax: ageMax < 99 ? ageMax : undefined,
				sexualPositions: positionFilter || undefined,
			});
			if (isMountedRef.current) {
				setItems(result);
				if (!hostingOnly) {
					unfilteredItemsRef.current = result;
				}
				setCachedRightNowFeed(result, cacheKey);
			}
		} catch (err) {
			if (isMountedRef.current) {
				setError(
					err instanceof Error ? err.message : t("right_now.error_load"),
				);
			}
		} finally {
			if (isMountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [apiFunctions, sort, hostingOnly, ageMin, ageMax, positionFilter, t]);

	useEffect(() => {
		void loadFeed();
	}, [loadFeed]);

	useEffect(() => {
		setHasRestoredScroll(false);
		sessionStorage.removeItem("rightnow-scroll");
	}, [sort, hostingOnly, ageMin, ageMax, positionFilter]);

	useEffect(() => {
		const container = feedContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			if (container.scrollTop > 0) {
				sessionStorage.setItem("rightnow-scroll", container.scrollTop.toString());
			}
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	useLayoutEffect(() => {
		if (items.length > 0 && !isLoading && !hasRestoredScroll && feedContainerRef.current) {
			const saved = sessionStorage.getItem("rightnow-scroll");
			if (saved) {
				const scrollTop = parseInt(saved, 10);
				if (scrollTop > 0) {
					feedContainerRef.current.scrollTop = scrollTop;
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
		setSort((prev) => {
			const next = prev === "DISTANCE" ? "RECENCY" : "DISTANCE";
			const nextKey = buildRightNowFeedCacheKey(
				next,
				hostingOnly,
				ageMin,
				ageMax,
				positionFilter,
			);
			const cached = getCachedRightNowFeed(nextKey);
			if (cached) {
				setItems(cached);
			} else {
				setItems((current) => sortItemsByOption(current, next));
			}
			return next;
		});
	}, [hostingOnly, ageMin, ageMax, positionFilter]);

	const toggleHostingOnly = useCallback(() => {
		setHostingOnly((previous) => {
			const next = !previous;
			const nextKey = buildRightNowFeedCacheKey(
				sort,
				next,
				ageMin,
				ageMax,
				positionFilter,
			);
			const cached = getCachedRightNowFeed(nextKey);
			if (cached) {
				setItems(cached);
				return next;
			}

			if (next) {
				unfilteredItemsRef.current = items;
				setItems((current) => current.filter((item) => item.hosting));
			} else if (unfilteredItemsRef.current) {
				setItems(unfilteredItemsRef.current);
			}

			return next;
		});
	}, [sort, ageMin, ageMax, positionFilter, items]);

	const openFilters = useCallback(() => {
		setIsFiltersOpen(true);
		setIsFiltersMounted(true);
	}, []);

	const handleApplyFilters = useCallback((draft: RightNowFiltersDraft) => {
		setAgeMin(draft.ageMin);
		setAgeMax(draft.ageMax);
		setPositionFilter(draft.positionFilter);
		const nextKey = buildRightNowFeedCacheKey(
			sort,
			hostingOnly,
			draft.ageMin,
			draft.ageMax,
			draft.positionFilter,
		);
		const cached = getCachedRightNowFeed(nextKey);
		if (cached) {
			setItems(cached);
		}
	}, [sort, hostingOnly]);

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
			onRefresh={() => loadFeed(true)}
			isDisabled={isLoading}
			isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("right_now.refreshing")}
			spinnerColor="var(--right-now)"
		>
			{/* Header */}
			<header className="relative z-20 grid gap-3 px-[var(--app-px)] pointer-events-none">
				<div
					className="absolute -top-64 left-1/2 h-[600px] w-[200vw] -translate-x-1/2"
					style={{
						zIndex: -1,
						// Use the --right-now color for the glow effect
						background: "radial-gradient(ellipse 100% 100% at 50% 0%, var(--right-now) 0%, color-mix(in srgb, var(--right-now), transparent 40%) 15%, color-mix(in srgb, var(--right-now), transparent 85%) 60%, transparent 100%)",
						// The mask remains for the shaping
						maskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black 35%, transparent 80%)",
						WebkitMaskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black 35%, transparent 80%)",
						backdropFilter: "blur(12px)",
						WebkitBackdropFilter: "blur(12px)",
					}}
				/>
				<div className="pointer-events-auto grid gap-3 mx-auto w-full max-w-4xl">
					<h1 className="app-title">{t("right_now.title")}</h1>

					<div className="flex flex-wrap items-center gap-2 pb-1">
						{/* Sort by Distance / Recency */}
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

						{/* Hosting toggle */}
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

			{/* Feed */}
			<div className="relative flex-1 min-h-0 -mt-32">
				<div
					ref={feedContainerRef}
					className="h-full overflow-y-auto pt-32"
					style={{
						maskImage: "linear-gradient(to bottom, transparent, black 220px)",
						WebkitMaskImage: "linear-gradient(to bottom, transparent, black 220px)",
					}}
				>
				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
					</div>
				) : error ? (
					<div className="px-[var(--app-px)] py-8 text-center">
						<p className="mb-3 text-sm text-[var(--text-muted)]">{error}</p>
						<button
							type="button"
							onClick={() => void loadFeed()}
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
					<div className="mx-auto max-w-2xl divide-y divide-[var(--surface-2)] pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
						{items.map((item) => (
							<div key={item.profileId} className="px-0">
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
			</div>
		</div>
		</PullToRefreshContainer>

		<div className="fixed inset-x-0 bottom-30 z-[60] pointer-events-none md:bottom-36">
			<div className="relative mx-auto h-full w-full max-w-4xl px-4 md:px-10">
				{/* Debug Toggle FAB (Bottom Left) */}
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
