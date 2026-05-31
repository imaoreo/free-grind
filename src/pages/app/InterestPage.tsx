import { RefreshCw, Eye, ArrowLeftRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import { useInterestData } from "../../hooks/queries/useInterestQueries";
import { markInterestSeen } from "../../services/seenStore";
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

const ONBOARDING_KEY = "fg-interest-onboarding-seen";

// SET THIS TO TRUE FOR DEBUGGING: Always triggers bounce and long delay on refresh
const ALWAYS_BOUNCE_FOR_DEBUG = false;

// Persistent flag for the session to prevent multiple bounces when navigating back and forth
let globalHasBounced = false;
let globalHasShownCount = false;

function InterestSkeleton({ mode }: { mode: InterestTab }) {
	return (
		<div className="relative flex items-center gap-4 pl-5 pr-6 py-4 animate-pulse">
			<div className="h-15 w-15 shrink-0 rounded-full bg-[var(--surface-2)]" />
			<div className="min-w-0 flex-1">
				<div className="h-4 w-32 rounded bg-[var(--surface-2)]" />
				<div className="mt-2 h-3 w-20 rounded bg-[var(--surface-2)]" />
			</div>
			<div className="shrink-0 flex items-center justify-center h-12 w-12">
				{mode === "taps" ? (
					<div className="h-12 w-12 rounded-full bg-[var(--surface-2)]" />
				) : (
					<div className="h-8 w-12 rounded-full bg-[var(--surface-2)]" />
				)}
			</div>
			<div className="absolute bottom-0 right-0 left-0 h-px bg-[var(--surface-2)]" />
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

	const views = data?.views ?? [];
	const taps = data?.taps ?? [];
	const viewedCount = data?.viewedCount ?? null;

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
		if (!ALWAYS_BOUNCE_FOR_DEBUG && globalHasBounced) return;

		const timer = setTimeout(() => {
			setShouldBounce(true);
			globalHasBounced = true;
			// Reset bounce state after animation finishes
			setTimeout(() => setShouldBounce(false), 1000);
		}, 600);
		return () => clearTimeout(timer);
	}, []);

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
		if (!hasMoreItems || isQueryLoading) return;

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
	}, [hasMoreItems, isQueryLoading, handleLoadMore]);

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
	const prevMaxViewsTs = useRef(0);
	const prevMaxTapsTs = useRef(0);

	useEffect(() => {
		const maxViews = views.length > 0 ? Math.max(...views.map(v => v.timestamp ?? 0)) : 0;
		if (maxViews > prevMaxViewsTs.current && prevMaxViewsTs.current > 0) {
			sessionStorage.removeItem("interest-scroll-views");
			if (activeTab === "views") {
				feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
		prevMaxViewsTs.current = maxViews;

		const maxTaps = taps.length > 0 ? Math.max(...taps.map(t => t.timestamp ?? 0)) : 0;
		if (maxTaps > prevMaxTapsTs.current && prevMaxTapsTs.current > 0) {
			sessionStorage.removeItem("interest-scroll-taps");
			if (activeTab === "taps") {
				feedContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}
		prevMaxTapsTs.current = maxTaps;
	}, [views, taps, activeTab]);

	useEffect(() => {
		const container = feedContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			if (container.scrollTop > 0) {
				const scrollData = {
					top: container.scrollTop,
					limit: activeTab === "views" ? viewsLimit : tapsLimit,
					timestamp: Date.now()
				};
				sessionStorage.setItem(`interest-scroll-${activeTab}`, JSON.stringify(scrollData));
			}
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, [activeTab, viewsLimit, tapsLimit]);

	useLayoutEffect(() => {
		if (displayedItems.length > 0 && !isQueryLoading && !hasRestoredScroll && feedContainerRef.current) {
			const storageKey = `interest-scroll-${activeTab}`;
			const saved = sessionStorage.getItem(storageKey);
			if (saved) {
				try {
					const { top, timestamp } = JSON.parse(saved);

					// Only restore if the scroll position is less than the timeout
					if (Date.now() - timestamp < SCROLL_RESTORATION_TIMEOUT_MS && top > 0) {
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
	}, [displayedItems.length, isQueryLoading, hasRestoredScroll, activeTab]);

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
		const willBounceNow = !globalHasBounced;
		const isInitialLook = ALWAYS_BOUNCE_FOR_DEBUG || (isFirstRender.current && willBounceNow);

		const delay = isInitialLook ? 2200 : 800;

		// Only show the animation once per session, but keep the delay logic above for future use
		if (ALWAYS_BOUNCE_FOR_DEBUG || !globalHasShownCount) {
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
	}, [activeTab]);

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
		void refetch();
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

			// Swipe left (positive deltaX) -> go to next tab (views -> taps)
			if (deltaX > 70 && activeTab === "views") {
				handleSetActiveTab("taps");
			}

			// Swipe right (negative deltaX) -> go to previous tab (taps -> views)
			if (deltaX < -70 && activeTab === "taps") {
				handleSetActiveTab("views");
			}

			touchStartXRef.current = null;
		},
		[activeTab, handleSetActiveTab],
	);

	return (
		<>
		<PullToRefreshContainer
			className="app-screen flex h-dvh flex-col w-full !px-0 !pb-0 overflow-x-hidden"
			contentClassName="flex flex-1 flex-col min-h-0"
			style={{ overflow: "visible", overflowX: "hidden" }}
			onRefresh={handleRefresh}
			isDisabled={isQueryLoading}
			isAtTop={() => (feedContainerRef.current?.scrollTop ?? 0) <= 0}
			refreshingLabel={t("interest_page.refreshing", { tab: t(`interest_page.tabs.${activeTab}`) })}
			spinnerColor="var(--accent)"
		>
			{/* Header */}
			<header className="relative z-20 flex shrink-0 flex-col pb-3 pointer-events-none">
				<PageHeaderBackground color="var(--accent)" />
				<div className="pointer-events-auto flex flex-col gap-3 mx-auto w-full max-w-4xl">
					<div className="px-[var(--app-px)]">
						<h1 className="app-title">{t("interest_page.title")}</h1>
					</div>

					<div className="flex flex-col gap-3">
						<div className="flex items-center justify-between pl-[var(--app-px)] pr-[26px]">
							<InterestTabs
								activeTab={activeTab}
								onViewsClick={() => handleSetActiveTab("views")}
								onTapsClick={() => handleSetActiveTab("taps")}
								firstTab={defaultSetting}
								shouldBounce={shouldBounce}
							/>

							<div
								className={cn(
									"glass-pill flex items-center justify-end overflow-hidden shrink-0 transition-all duration-500 ease-in-out",
									activeTab === "views" ? "-mr-[1.5px]" : "mr-0.5",
									showCountLabel
										? "h-11 pl-4 pr-0"
										: (activeTab === "views" ? "h-8 pl-0 pr-0" : "h-11 pl-0 pr-0")
								)}
							>
								<div className="flex items-center justify-end transition-all duration-500">
									<div
										className={cn(
											"flex transition-all duration-500 ease-in-out overflow-hidden",
											showCountLabel ? "opacity-100 max-w-[200px] mr-2" : "opacity-0 max-w-0 mr-0 pointer-events-none"
										)}
									>
										<p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] leading-none whitespace-nowrap">
											{activeTab === "views" ? t("interest_page.total_viewed_count") : t("interest_page.total_taps_count")}
										</p>
									</div>
									<div className="relative flex items-center justify-center">
										<div className={cn(
											"flex items-center justify-center transition-all duration-500",
											activeTab === "views" ? "w-[51px]" : "w-[46px]"
										)}>
											<p className={cn(
												"text-sm font-bold text-[var(--accent)] leading-none tabular-nums shrink-0 transition-opacity duration-300",
												isFetching && !isQueryLoading ? "opacity-0" : "opacity-100"
											)}>
												{activeTab === "views" ? viewedCount : taps.length}
											</p>
										</div>
										{isFetching && !isQueryLoading && (
											<div className="absolute inset-0 flex items-center justify-center">
												<RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--accent)]" />
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
				className={cn("transition-transform duration-500 ease-in-out", shouldBounce && "translate-x-8")}
			>
				<div className="mx-auto w-full max-w-4xl pb-[calc(env(safe-area-inset-bottom,0px)+120px)] px-1">
					{isQueryLoading && activeItems.length === 0 ? (
						<div className="border-t border-[var(--border)]/10">
							{Array.from({ length: 8 }).map((_, i) => (
								<InterestSkeleton key={i} mode={activeTab} />
							))}
						</div>
					) : (
						<div className="flex flex-col">
							{(queryError || (!isQueryLoading && activeItems.length === 0)) && (
								<div className="px-[var(--app-px)] py-4 space-y-4">
									{queryError ? (
										<ErrorState
											title={t("interest_page.error_load", { tab: t(`interest_page.tabs.${activeTab}`) })}
											description={queryError instanceof Error ? queryError.message : String(queryError)}
											onRetry={handleRefresh}
										/>
									) : null}

									{!isQueryLoading && !queryError && activeItems.length === 0 ? (
										<EmptyState
											title={t(`interest_page.empty_${activeTab}`)}
											description={t(`interest_page.empty_${activeTab}_desc`)}
										/>
									) : null}
								</div>
							)}

							{activeItems.length > 0 && (
								<div className="border-t border-[var(--border)]/10">
									{displayedItems.map((item) => (
										<InterestRow
											key={`${activeTab}-${item.profileId}-${item.timestamp ?? "na"}`}
											item={item}
											mode={activeTab}
											onOpenProfile={handleOpenProfile}
											now={nowTimestamp}
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

		{/* Paging Dots Pill */}
		<div className="pointer-events-none fixed bottom-32 left-1/2 z-50 -translate-x-1/2">
			<div className="glass-pill inline-flex items-center gap-1.5 px-2.5 py-1.5">
				{/* The order of dots must match the order of InterestTabs (defaultSetting) */}
				{defaultSetting === "views" ? (
					<>
						<div className={cn(
							"h-1 rounded-full transition-all duration-300",
							activeTab === "views" ? "w-4 bg-[var(--accent)]" : "w-1 bg-black/10 dark:bg-white/20"
						)} />
						<div className={cn(
							"h-1 rounded-full transition-all duration-300",
							activeTab === "taps" ? "w-4 bg-[var(--accent)]" : "w-1 bg-black/10 dark:bg-white/20"
						)} />
					</>
				) : (
					<>
						<div className={cn(
							"h-1 rounded-full transition-all duration-300",
							activeTab === "taps" ? "w-4 bg-[var(--accent)]" : "w-1 bg-black/10 dark:bg-white/20"
						)} />
						<div className={cn(
							"h-1 rounded-full transition-all duration-300",
							activeTab === "views" ? "w-4 bg-[var(--accent)]" : "w-1 bg-black/10 dark:bg-white/20"
						)} />
					</>
				)}
			</div>
		</div>
	</>
	);
}
