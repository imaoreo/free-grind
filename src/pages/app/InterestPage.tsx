import { RefreshCw, Eye, ArrowLeftRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useInterestData } from "../../hooks/queries/useInterestQueries";
import { markInterestSeen, getInterestTabLastSeen, markInterestTabSeen } from "../../services/seenStore";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";
import {
	TAP_RECEIVED_EVENT,
	type TapReceivedDetail,
} from "../../components/ChatRealtimeBridge";
import {
	type InterestTab,
	type InterestItem,
	fromStoredView,
	toStoredView,
	toNumber,
	asObject,
	normalizeViews,
	normalizeTaps,
} from "./interest/interestUtils";
import { InterestTabs, InterestRow } from "./interest/InterestComponents";
import { InterestOnboardingModal } from "./interest/InterestOnboardingModal";
import {
	SCROLL_RESTORATION_TIMEOUT_MS,
} from "../../config/ui-constants";
import { cn } from "../../utils/cn";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { FeedScrollContainer } from "../../components/ui/FeedScrollContainer";
import { useDesktopBreakpoint } from "../../hooks/useDesktopBreakpoint";
import { usePreferences } from "../../contexts/PreferencesContext";

const ONBOARDING_KEY = "fg-interest-onboarding-seen";

// SET THIS TO TRUE FOR DEBUGGING: Always triggers bounce and long delay on refresh
const ALWAYS_BOUNCE_FOR_DEBUG = false;

// Persistent flag for the session to prevent multiple bounces when navigating back and forth
let globalHasBounced = false;
let globalHasShownCount = false;

function InterestSkeleton({ mode }: { mode: InterestTab }) {
	return (
		<div className="flex items-center gap-4 border-b border-[var(--surface-2)] py-3 pl-5 pr-6">
			<div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
			<div className="flex flex-1 flex-col gap-2">
				<div className="h-3 w-28 animate-pulse rounded-full bg-[var(--surface-2)]" />
				<div className="h-2.5 w-16 animate-pulse rounded-full bg-[var(--border)]" />
			</div>
			{mode === "taps" ? (
				<div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
			) : (
				<div className="h-8 w-14 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
			)}
		</div>
	);
}

export function InterestPage() {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const navigate = useNavigate();
	const location = useLocation();
	const isDesktop = useDesktopBreakpoint();
	const [searchParams, setSearchParams] = useSearchParams();
	const defaultSetting = window.localStorage.getItem("fg-interest-default-tab") === "views" ? "views" : "taps";
	const activeTab: InterestTab = searchParams.get("tab") === "taps" || searchParams.get("tab") === "views"
		? (searchParams.get("tab") as InterestTab)
		: defaultSetting;

	const { data, isLoading: isQueryLoading, isFetching, error: queryError, refetch } = useInterestData();
	const [isDemoLoading, setIsDemoLoading] = useState(false);
	const isLoading = isQueryLoading || isDemoLoading;

	const { developerMode, showDebugInfo } = usePreferences();
	const [demoMode, setDemoMode] = useState(() => {
		const saved = window.localStorage.getItem("fg-interest-demo-mode");
		return saved ? Number.parseInt(saved, 10) : 0;
	});
	const [demoViewsCount, setDemoViewsCount] = useState(() => {
		if (demoMode === 2 || demoMode === 3) return 12;
		return 0;
	});
	const [demoTapsCount, setDemoTapsCount] = useState(() => {
		if (demoMode === 1 || demoMode === 3) return 5;
		return 0;
	});

	const [demoAddedViews, setDemoAddedViews] = useState<InterestItem[]>([]);
	const [demoAddedTaps, setDemoAddedTaps] = useState<InterestItem[]>([]);

	useEffect(() => {
		if (demoMode === 0 || !developerMode) {
			setDemoAddedViews([]);
			setDemoAddedTaps([]);
			return;
		}

		const startDelay = setTimeout(() => {
			let cycle = 0;
			const targetCounts = [5, 55, 555, 5555];

			const interval = setInterval(() => {
				const target = targetCounts[cycle % targetCounts.length];
				cycle++;

				if (demoMode === 1 || demoMode === 3) {
					setDemoTapsCount(target);
					setDemoAddedTaps(Array(target).fill({ profileId: "demo", timestamp: Date.now() }));
				}
				if (demoMode === 2 || demoMode === 3) {
					setDemoViewsCount(target);
					// To make viewedCount exactly match the target:
					setDemoAddedViews(Array(target).fill({ profileId: "demo", timestamp: Date.now() }));
				}
			}, 5000);
			return () => clearInterval(interval);
		}, 7000);

		return () => clearTimeout(startDelay);
	}, [demoMode]);

	const views = useMemo(() => {
		const base = data?.views ?? [];
		return demoMode !== 0 ? [...demoAddedViews, ...base] : base;
	}, [data?.views, demoAddedViews, demoMode]);

	const taps = useMemo(() => {
		const base = data?.taps ?? [];
		return demoMode !== 0 ? [...demoAddedTaps, ...base] : base;
	}, [data?.taps, demoAddedTaps, demoMode]);

	const viewedCount = demoMode !== 0 ? demoAddedViews.length : (data?.viewedCount ?? 0);

	const [lastSeenViews, setLastSeenViews] = useState(() => getInterestTabLastSeen("views"));
	const [lastSeenTaps, setLastSeenTaps] = useState(() => getInterestTabLastSeen("taps"));

	const newViewsCount = useMemo(() => {
		if (demoMode !== 0) return demoViewsCount;
		return views.filter(v => (v.timestamp ?? 0) > lastSeenViews).length;
	}, [views, lastSeenViews, demoMode, demoViewsCount]);

	const newTapsCount = useMemo(() => {
		if (demoMode !== 0) return demoTapsCount;
		return taps.filter(t => (t.timestamp ?? 0) > lastSeenTaps).length;
	}, [taps, lastSeenTaps, demoMode, demoTapsCount]);

	// Mark active tab as seen
	useEffect(() => {
		if (data) {
			const items = activeTab === "views" ? views : taps;
			const maxInItems = items.length > 0 ? Math.max(...items.map(i => i.timestamp ?? 0)) : 0;
			const at = Math.max(Date.now(), maxInItems);

			// Delay marking as seen to allow the tab transition to finish smoothly
			// without the width of the tab changing mid-animation.
			const timer = setTimeout(() => {
				if (demoMode !== 0) {
					if (activeTab === "views") setDemoViewsCount(0);
					else setDemoTapsCount(0);
				}

				markInterestTabSeen(activeTab, at);
				if (activeTab === "views") {
					setLastSeenViews(at);
				} else {
					setLastSeenTaps(at);
				}
			}, 300);

			return () => clearTimeout(timer);
		}
	}, [activeTab, data, views, taps, demoMode]);

	const handleSetDemoMode = useCallback((mode: number) => {
		setDemoMode(mode);
		window.localStorage.setItem("fg-interest-demo-mode", mode.toString());
		setDemoAddedViews([]);
		setDemoAddedTaps([]);

		if (mode !== 0) {
			setIsDemoLoading(true);
			setTimeout(() => setIsDemoLoading(false), 1000);
		}

		if (mode === 1) { // Taps
			setDemoTapsCount(5);
			setDemoViewsCount(0);
		} else if (mode === 2) { // Visitors
			setDemoViewsCount(12);
			setDemoTapsCount(0);
		} else if (mode === 3) { // Both
			setDemoViewsCount(12);
			setDemoTapsCount(5);
		} else {
			setDemoViewsCount(0);
			setDemoTapsCount(0);
		}
	}, []);

	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const [showCountLabel, setShowCountLabel] = useState(false);

	// Track the newest activity across both taps and views.
	const maxInterestTimestamp = useMemo(() => {
		let max = 0;
		for (const list of [views, taps]) {
			for (const item of list) {
				if (item.timestamp && item.timestamp > max) {
					max = item.timestamp;
				}
			}
		}
		return max;
	}, [views, taps]);

	const [showOnboarding, setShowOnboarding] = useState(() => {
		return !localStorage.getItem(ONBOARDING_KEY);
	});
	const [shouldBounce, setShouldBounce] = useState(false);
	const touchStartXRef = useRef<number | null>(null);

	const isFirstRender = useRef(true);

	// Trigger peek animation
	useEffect(() => {
		if (!ALWAYS_BOUNCE_FOR_DEBUG && globalHasBounced && demoMode === 0) return;

		const timer = setTimeout(() => {
			setShouldBounce(true);
			globalHasBounced = true;
			// Reset bounce state after animation finishes
			setTimeout(() => setShouldBounce(false), 1000);
		}, 600);
		return () => clearTimeout(timer);
	}, [demoMode]);

	const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
	const feedContainerRef = useRef<HTMLDivElement | null>(null);
	const [hasRestoredScroll, setHasRestoredScroll] = useState(false);
	const prevTabRef = useRef<InterestTab>(activeTab);

	// Re-activate onboarding when switching back to views tab if not yet acknowledged
	useEffect(() => {
		if (activeTab === "views" && !localStorage.getItem(ONBOARDING_KEY)) {
			setShowOnboarding(true);
		}
	}, [activeTab]);

	const handleCloseOnboarding = useCallback(() => {
		setShowOnboarding(false);
	}, []);

	const handleAcknowledgeOnboarding = useCallback(() => {
		setShowOnboarding(false);
		localStorage.setItem(ONBOARDING_KEY, "true");
	}, []);

	const ITEMS_PER_PAGE = 30;
	const [viewsLimit, setViewsLimit] = useState(() => {
		const saved = sessionStorage.getItem("interest-scroll-views");
		if (saved) {
			try {
				const { limit, timestamp } = JSON.parse(saved);
				if (limit && Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS) {
					return limit;
				}
			} catch (e) {}
		}
		return ITEMS_PER_PAGE;
	});
	const [tapsLimit, setTapsLimit] = useState(() => {
		const saved = sessionStorage.getItem("interest-scroll-taps");
		if (saved) {
			try {
				const { limit, timestamp } = JSON.parse(saved);
				if (limit && Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS) {
					return limit;
				}
			} catch (e) {}
		}
		return ITEMS_PER_PAGE;
	});
	const [isPending, startTransition] = useTransition();

	const activeItems = useMemo(
		() => (activeTab === "views" ? views : taps),
		[activeTab, taps, views],
	);

	const displayedItems = useMemo(() => {
		const limit = activeTab === "views" ? viewsLimit : tapsLimit;
		return activeItems.slice(0, limit);
	}, [activeTab, activeItems, viewsLimit, tapsLimit]);

	const hasMoreItems = activeItems.length > displayedItems.length;

	const handleLoadMore = useCallback(() => {
		startTransition(() => {
			if (activeTab === "views") {
				setViewsLimit((prev) => prev + ITEMS_PER_PAGE);
			} else {
				setTapsLimit((prev) => prev + ITEMS_PER_PAGE);
			}
		});
	}, [activeTab]);

	// Infinite scroll observer
	useEffect(() => {
		if (!hasMoreItems || isLoading) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					handleLoadMore();
				}
			},
			{ threshold: 0.1, rootMargin: "100px" },
		);

		const currentTrigger = loadMoreTriggerRef.current;
		if (currentTrigger) {
			observer.observe(currentTrigger);
		}

		return () => {
			if (currentTrigger) {
				observer.unobserve(currentTrigger);
			}
		};
	}, [hasMoreItems, isLoading, handleLoadMore]);

	// Reset limits and scroll restoration when changing tabs
	useEffect(() => {
		if (prevTabRef.current !== activeTab) {
			setViewsLimit(ITEMS_PER_PAGE);
			setTapsLimit(ITEMS_PER_PAGE);
			setHasRestoredScroll(false);
			prevTabRef.current = activeTab;
		}
	}, [activeTab]);

	// Clear scroll memory for a specific tab when NEW activity is detected in that tab
	const prevMaxViewsTs = useRef(lastSeenViews);
	const prevMaxTapsTs = useRef(lastSeenTaps);

	useEffect(() => {
		const maxViews = views.length > 0 ? Math.max(...views.map(v => v.timestamp ?? 0)) : 0;
		if (maxViews > prevMaxViewsTs.current) {
			sessionStorage.removeItem("interest-scroll-views");
			if (activeTab === "views") {
				feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
		if (maxViews > 0) prevMaxViewsTs.current = maxViews;

		const maxTaps = taps.length > 0 ? Math.max(...taps.map(t => t.timestamp ?? 0)) : 0;
		if (maxTaps > prevMaxTapsTs.current) {
			sessionStorage.removeItem("interest-scroll-taps");
			if (activeTab === "taps") {
				feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
		if (maxTaps > 0) prevMaxTapsTs.current = maxTaps;
	}, [views, taps, activeTab]);

	useEffect(() => {
		const container = feedContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const scrollData = {
				top: container.scrollTop,
				limit: activeTab === "views" ? viewsLimit : tapsLimit,
				timestamp: Date.now()
			};
			sessionStorage.setItem(`interest-scroll-${activeTab}`, JSON.stringify(scrollData));
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, [activeTab, viewsLimit, tapsLimit]);

	useLayoutEffect(() => {
		if (displayedItems.length > 0 && !isLoading && !hasRestoredScroll && feedContainerRef.current) {
			const storageKey = `interest-scroll-${activeTab}`;

			// If there's new activity since the last time we "saw" this tab,
			// don't restore the scroll position - stay at the top.
			const currentItems = activeTab === "views" ? views : taps;
			const maxTs = currentItems.length > 0 ? Math.max(...currentItems.map(i => i.timestamp ?? 0)) : 0;
			const lastSeen = activeTab === "views" ? lastSeenViews : lastSeenTaps;

			if (maxTs > lastSeen) {
				sessionStorage.removeItem(storageKey);
				feedContainerRef.current.scrollTop = 0;
				setHasRestoredScroll(true);
				return;
			}

			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				try {
					const { top, timestamp } = JSON.parse(saved);

					// Only restore if the scroll position is less than the timeout
					if (Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS) {
						feedContainerRef.current.scrollTop = top;
					} else {
						// Clean up expired scroll data
						sessionStorage.removeItem(storageKey);
					}
				} catch (e) {
					sessionStorage.removeItem(storageKey);
				}
			} else {
				// If no saved position, ensure we are at the top for the new tab
				feedContainerRef.current.scrollTop = 0;
			}
			setHasRestoredScroll(true);
		}
	}, [displayedItems.length, isLoading, hasRestoredScroll, activeTab, lastSeenViews, lastSeenTaps, views, taps]);

	// Keep relative timestamps fresh.
	useEffect(() => {
		const id = window.setInterval(() => setNowTimestamp(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	// Mark Interest as "seen" whenever the user is on this page so the
	// NavBar dot clears.
	useEffect(() => {
		if (data) {
			markInterestSeen(Math.max(Date.now(), maxInterestTimestamp));
		}
	}, [activeTab, maxInterestTimestamp, data]);

	// Animate the count label: show it briefly on tab change, then hide it.
	useEffect(() => {
		setShowCountLabel(false);

		// Synchronize with the bounce: Only long delay if a bounce is actually happening
		// ALWAYS_BOUNCE_FOR_DEBUG forces the long delay.
		// Otherwise, we only wait long if it's the very first render AND we haven't bounced yet.
		const willBounceNow = !globalHasBounced || demoMode !== 0;
		const isInitialLook = ALWAYS_BOUNCE_FOR_DEBUG || (isFirstRender.current && willBounceNow);

		const delay = isInitialLook ? 2200 : 800;

		// Only show the animation once per session, but keep the delay logic above for future use
		if (ALWAYS_BOUNCE_FOR_DEBUG || !globalHasShownCount || demoMode !== 0) {
			const timer = setTimeout(() => {
				setShowCountLabel(true);
				globalHasShownCount = true;
			}, delay);
			const hideTimer = setTimeout(() => setShowCountLabel(false), delay + 4000);

			isFirstRender.current = false;

			return () => {
				clearTimeout(timer);
				clearTimeout(hideTimer);
			};
		}

		isFirstRender.current = false;
	}, [activeTab, demoMode]);

	const handleRefresh = useCallback(() => {
		if (activeTab === "views") {
			setViewsLimit(ITEMS_PER_PAGE);
			sessionStorage.removeItem("interest-scroll-views");
		} else {
			setTapsLimit(ITEMS_PER_PAGE);
			sessionStorage.removeItem("interest-scroll-taps");
		}
		setHasRestoredScroll(true);
		feedContainerRef.current?.scrollTo(0, 0);
		return refetch();
	}, [activeTab, refetch, ITEMS_PER_PAGE]);

	const handleSetActiveTab = useCallback(
		(nextTab: InterestTab) => {
			const nextParams = new URLSearchParams(searchParams);
			// Always explicitly set the tab in the URL so our new default setting doesn't override it
			nextParams.set("tab", nextTab);
			setSearchParams(nextParams, { replace: true });
		},
		[searchParams, setSearchParams],
	);

	const handleOpenProfile = useCallback(
		(profileId: string) => {
			navigate(`/profile/${profileId}`, {
				state: { returnTo: `${location.pathname}${location.search}` },
			});
		},
		[navigate, location.pathname, location.search],
	);

	const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
		touchStartXRef.current = event.touches[0]?.clientX ?? null;
	}, []);

	const handleTouchEnd = useCallback(
		(event: TouchEvent<HTMLDivElement>) => {
			const startX = touchStartXRef.current;
			if (startX == null) {
				return;
			}

			const endX = event.changedTouches[0]?.clientX ?? startX;
			const deltaX = startX - endX;

			const isViewsFirst = defaultSetting === "views";
			const leftTab = isViewsFirst ? "views" : "taps";
			const rightTab = isViewsFirst ? "taps" : "views";

			// Swipe left (positive deltaX) -> move to the right tab
			if (deltaX > 70 && activeTab === leftTab) {
				handleSetActiveTab(rightTab);
			}

			// Swipe right (negative deltaX) -> move to the left tab
			if (deltaX < -70 && activeTab === rightTab) {
				handleSetActiveTab(leftTab);
			}

			touchStartXRef.current = null;
		},
		[activeTab, handleSetActiveTab, defaultSetting],
	);

	return (
		<>
		<PullToRefreshContainer
			className="app-screen flex h-dvh flex-col w-full !px-0 !pb-0 overflow-x-hidden"
			contentClassName="flex flex-1 flex-col min-h-0"
			style={{ overflow: "visible", overflowX: "hidden" }}
			onRefresh={handleRefresh}
			isDisabled={isLoading}
			isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("interest_page.refreshing", { tab: t(`interest_page.tabs.${activeTab}`) })}
			spinnerColor="var(--accent)"
		>
			{/* Header */}
			<header className="relative z-20 flex shrink-0 flex-col pb-3 pointer-events-none">
				<PageHeaderBackground color="var(--accent)" />
				<div className="pointer-events-auto flex flex-col gap-3 mx-auto w-full max-w-4xl">
					<div className="px-[var(--app-px)] flex items-center justify-between">
						<h1 className="app-title">{t("interest_page.title")}</h1>
						{developerMode && showDebugInfo && (
							<button
								onClick={() => handleSetDemoMode((demoMode + 1) % 4)}
								className="text-[10px] font-bold bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full text-white/40 transition-colors uppercase tracking-widest"
							>
								Demo: {["Off", "Taps", "Visitors", "Both"][demoMode]}
							</button>
						)}
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex h-12 items-center justify-between pl-[var(--app-px)] pr-6 -mt-1">
							<InterestTabs
								activeTab={activeTab}
								onViewsClick={() => handleSetActiveTab("views")}
								onTapsClick={() => handleSetActiveTab("taps")}
								firstTab={defaultSetting}
								shouldBounce={shouldBounce}
								newViewsCount={newViewsCount}
								newTapsCount={newTapsCount}
							/>

							<div
								className={cn(
									"glass-pill neutral flex items-center overflow-hidden shrink-0 transition-all duration-500 ease-in-out",
									activeTab === "views" && "-mr-[3.5px]",
									showCountLabel
										? "justify-end h-10 pl-4 pr-0 max-w-[300px]"
										: (activeTab === "views" ? "justify-center h-8 pl-[1.5px] pr-[1px] min-w-[53.5px]" : "justify-center h-12 pl-0 pr-0 max-w-[48px]")
								)}
							>
								<div className={cn(
									"flex items-center transition-all duration-500",
									showCountLabel ? "justify-end" : "justify-center"
								)}>
									<div
										className={cn(
											"flex transition-all duration-500 ease-in-out overflow-hidden",
											showCountLabel ? "opacity-100 max-w-[200px] mr-0" : "opacity-0 max-w-0 mr-0 pointer-events-none"
										)}
									>
										<p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] leading-none whitespace-nowrap">
											{activeTab === "views" ? t("interest_page.total_viewed_count") : t("interest_page.total_taps_count")}
										</p>
									</div>
									<div className="relative flex items-center justify-center">
										<div className={cn(
											"flex items-center justify-center transition-all duration-500",
											activeTab === "views" ? "w-[51px]" : "w-12"
										)}>
											<p className={cn(
												"text-sm font-bold text-[var(--text-muted)] leading-none tabular-nums shrink-0 transition-opacity duration-300",
												(isFetching && !isQueryLoading) || isDemoLoading ? "opacity-0" : "opacity-100"
											)}>
												{activeTab === "views" ? viewedCount : taps.length}
											</p>
										</div>
										{((isFetching && !isQueryLoading) || isDemoLoading) && (
											<div className="absolute inset-0 flex items-center justify-center">
												<RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</header>

			<FeedScrollContainer
				ref={feedContainerRef}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
				className={cn("transition-transform duration-500 ease-in-out", shouldBounce && "-translate-x-8")}
			>
				<div className="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom,0px)+120px)] px-0">
					{(isLoading && (activeItems.length === 0 || isDemoLoading)) ? (
						<div className="border-t border-[var(--border)]/10">
							{Array.from({ length: 8 }).map((_, i) => (
								<InterestSkeleton key={i} mode={activeTab} />
							))}
						</div>
					) : (
						<div className="flex flex-col">
							{(queryError || (!isLoading && activeItems.length === 0)) && (
								<div className="px-[var(--app-px)] py-4 space-y-4">
									{queryError ? (
										<ErrorState
											title={t("interest_page.error_load", { tab: t(`interest_page.tabs.${activeTab}`) })}
											description={queryError instanceof Error ? queryError.message : String(queryError)}
											onRetry={handleRefresh}
										/>
									) : null}

									{!isLoading && !queryError && activeItems.length === 0 ? (
										<EmptyState
											title={t(`interest_page.empty_${activeTab}`)}
											description={t(`interest_page.empty_${activeTab}_desc`)}
										/>
									) : null}
								</div>
							)}

							{activeItems.length > 0 && (
								<div className="flex flex-col">
									{displayedItems.map((item, index) => (
										<InterestRow
											key={`${activeTab}-${item.profileId}-${item.timestamp ?? "na"}`}
											item={item}
											mode={activeTab}
											onOpenProfile={handleOpenProfile}
											now={nowTimestamp}
											isFirst={index === 0}
										/>
									))}

									{(hasMoreItems || isPending) && (
										<div
											ref={loadMoreTriggerRef}
											className="flex w-full items-center justify-center p-6"
										>
											<RefreshCw
												className={cn(
													"h-5 w-5 text-[var(--text-muted)] transition-all duration-200",
													isPending ? "animate-spin opacity-40" : "opacity-0"
												)}
											/>
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</FeedScrollContainer>
		</PullToRefreshContainer>
		{showOnboarding && activeTab === "views" && (
			<InterestOnboardingModal
				onClose={handleCloseOnboarding}
				onConfirm={handleAcknowledgeOnboarding}
			/>
		)}
	</>
	);
}
