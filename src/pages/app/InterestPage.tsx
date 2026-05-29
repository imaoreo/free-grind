import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type TouchEvent } from "react";
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
import { SCROLL_RESTORATION_TIMEOUT_MS } from "../../config/ui-constants";
import { cn } from "../../utils/cn";

const ONBOARDING_KEY = "fg-interest-onboarding-seen";

export function InterestPage() {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const defaultSetting = window.localStorage.getItem("fg-interest-default-tab") === "views" ? "views" : "taps";
	const activeTab: InterestTab = searchParams.get("tab") === "views" || (!searchParams.get("tab") && defaultSetting === "views") ? "views" : "taps";

	const { data, isLoading: isQueryLoading, error: queryError, refetch } = useInterestData();

	const views = data?.views ?? [];
	const taps = data?.taps ?? [];
	const viewedCount = data?.viewedCount ?? null;

	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

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
	const touchStartXRef = useRef<number | null>(null);
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
	const [viewsLimit, setViewsLimit] = useState(ITEMS_PER_PAGE);
	const [tapsLimit, setTapsLimit] = useState(ITEMS_PER_PAGE);

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
		if (activeTab === "views") {
			setViewsLimit((prev) => prev + ITEMS_PER_PAGE);
		} else {
			setTapsLimit((prev) => prev + ITEMS_PER_PAGE);
		}
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
		setViewsLimit(ITEMS_PER_PAGE);
		setTapsLimit(ITEMS_PER_PAGE);
		setHasRestoredScroll(false);
		prevTabRef.current = activeTab;
	}, [activeTab]);

	// Clear scroll memory for a specific tab when NEW activity is detected in that tab
	const prevMaxViewsTs = useRef(0);
	const prevMaxTapsTs = useRef(0);

	useEffect(() => {
		const maxViews = views.length > 0 ? Math.max(...views.map(v => v.timestamp ?? 0)) : 0;
		if (maxViews > prevMaxViewsTs.current && prevMaxViewsTs.current > 0) {
			sessionStorage.removeItem("interest-scroll-views");
		}
		prevMaxViewsTs.current = maxViews;

		const maxTaps = taps.length > 0 ? Math.max(...taps.map(t => t.timestamp ?? 0)) : 0;
		if (maxTaps > prevMaxTapsTs.current && prevMaxTapsTs.current > 0) {
			sessionStorage.removeItem("interest-scroll-taps");
		}
		prevMaxTapsTs.current = maxTaps;
	}, [views, taps]);

	useEffect(() => {
		const container = feedContainerRef.current;
		if (!container) return;

		const handleScroll = () => {
			if (container.scrollTop > 0) {
				const scrollData = {
					top: container.scrollTop,
					timestamp: Date.now()
				};
				sessionStorage.setItem(`interest-scroll-${activeTab}`, JSON.stringify(scrollData));
			}
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, [activeTab]);

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

	const handleRefresh = useCallback(() => {
		if (activeTab === "views") {
			setViewsLimit(ITEMS_PER_PAGE);
		} else {
			setTapsLimit(ITEMS_PER_PAGE);
		}
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
			<header className="relative z-20 grid gap-3 px-[var(--app-px)] pointer-events-none">
				<div
					className="absolute -top-64 left-1/2 h-[600px] w-[200vw] -translate-x-1/2"
					style={{
						zIndex: -1,
						// Use the --accent color for the glow effect
						background: "radial-gradient(ellipse 100% 100% at 50% 0%, var(--accent) 0%, color-mix(in srgb, var(--accent), transparent 40%) 15%, color-mix(in srgb, var(--accent), transparent 85%) 60%, transparent 100%)",
						// The mask remains for the shaping
						maskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black 35%, transparent 80%)",
						WebkitMaskImage: "radial-gradient(ellipse 80% 100% at 50% 0%, black 0%, black 35%, transparent 80%)",
						backdropFilter: "blur(12px)",
						WebkitBackdropFilter: "blur(12px)",
					}}
				/>
				<div className="pointer-events-auto grid gap-3 mx-auto w-full max-w-4xl">
					<h1 className="app-title">{t("interest_page.title")}</h1>
					<div className="flex items-end gap-3">
						<InterestTabs
							activeTab={activeTab}
							onViewsClick={() => handleSetActiveTab("views")}
							onTapsClick={() => handleSetActiveTab("taps")}
						/>
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
					onTouchStart={handleTouchStart}
					onTouchEnd={handleTouchEnd}
				>
					<div className="mx-auto w-full max-w-4xl space-y-4 pb-[calc(env(safe-area-inset-bottom,0px)+120px)]">
						<div className="px-[var(--app-px)] space-y-4">
							{activeTab === "views" && viewedCount != null ? (
								<div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
									<p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
										{t("interest_page.total_viewed_count")}
									</p>
									<p className="mt-1 text-lg font-semibold text-[var(--text)]">{viewedCount}</p>
								</div>
							) : null}

							{isQueryLoading && activeItems.length === 0 ? (
								<div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
									<div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
										<Loader2 className="h-4 w-4 animate-spin" />
										{t("interest_page.loading", { tab: t(`interest_page.tabs.${activeTab}`) })}
									</div>
								</div>
							) : null}

							{!isQueryLoading && queryError ? (
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

						{(activeItems.length > 0) ? (
							<div className="divide-y divide-[var(--surface-2)] border-t border-[var(--border)]/10">
								{displayedItems.map((item) => (
									<InterestRow
										key={`${activeTab}-${item.profileId}-${item.timestamp ?? "na"}`}
										item={item}
										mode={activeTab}
										onOpenProfile={handleOpenProfile}
										now={nowTimestamp}
									/>
								))}

								{hasMoreItems && (
									<div
										ref={loadMoreTriggerRef}
										className="flex w-full items-center justify-center p-6"
									>
										<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
									</div>
								)}
							</div>
						) : null}
					</div>
				</div>
			</div>
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
