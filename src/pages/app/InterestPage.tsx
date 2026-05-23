import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import {
	interestViewsStore,
} from "../../services/interestViewsStore";
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

const ONBOARDING_KEY = "fg-interest-onboarding-seen";

export function InterestPage() {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const defaultSetting = window.localStorage.getItem("fg-interest-default-tab") === "views" ? "views" : "taps";
	const activeTab: InterestTab = searchParams.get("tab") === "views" || (!searchParams.get("tab") && defaultSetting === "views") ? "views" : "taps";
	const [views, setViews] = useState<InterestItem[]>([]);
	const [taps, setTaps] = useState<InterestItem[]>([]);
	const [viewedCount, setViewedCount] = useState<number | null>(null);
	const [viewsLoaded, setViewsLoaded] = useState(false);
	const [tapsLoaded, setTapsLoaded] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const [showOnboarding, setShowOnboarding] = useState(() => {
		return !localStorage.getItem(ONBOARDING_KEY);
	});
	const touchStartXRef = useRef<number | null>(null);
	const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

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

	// Reset limits when changing tabs or refreshing
	useEffect(() => {
		setViewsLimit(ITEMS_PER_PAGE);
		setTapsLimit(ITEMS_PER_PAGE);
	}, [activeTab]);

	// Keep relative timestamps fresh.
	useEffect(() => {
		const id = window.setInterval(() => setNowTimestamp(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, []);

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

	// Mark Interest as "seen" whenever the user is on this page so the
	// NavBar dot clears.
	useEffect(() => {
		markInterestSeen(Math.max(Date.now(), maxInterestTimestamp));
	}, [activeTab, maxInterestTimestamp]);

	useEffect(() => {
		let cancelled = false;

		void interestViewsStore.getAll().then((rows) => {
			if (cancelled || rows.length === 0) {
				return;
			}
			setViews(rows.map(fromStoredView));
		});

		return () => {
			cancelled = true;
		};
	}, []);

	const loadViews = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const cachedViews = (await interestViewsStore.getAll()).map(fromStoredView);
			if (cachedViews.length > 0) {
				setViews(cachedViews);
				setViewsLoaded(true);
			}

			const listPayload = await api.getViews();
			const listObj = asObject(listPayload);
			const listDataObj = asObject(listObj?.data);
			setViewedCount(
				toNumber(listObj?.totalViewers) ?? toNumber(listDataObj?.totalViewers),
			);

			const normalizedViews = normalizeViews(listPayload, cachedViews, t);
			setViews(normalizedViews);
			await interestViewsStore.upsertMany(
				normalizedViews.map((item) => toStoredView(item)),
			);
			setViewsLoaded(true);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : t("interest_page.error_load", { tab: t(`interest_page.tabs.views`) }));
		} finally {
			setIsLoading(false);
		}
	}, [api, t]);

	const loadTaps = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const payload = await api.getTaps();
			setTaps(normalizeTaps(payload, t));
			setTapsLoaded(true);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : t("interest_page.error_load", { tab: t(`interest_page.tabs.taps`) }));
		} finally {
			setIsLoading(false);
		}
	}, [api, t]);

	useEffect(() => {
		if (activeTab === "views" && !viewsLoaded) {
			void loadViews();
		}
		if (activeTab === "taps" && !tapsLoaded) {
			void loadTaps();
		}
	}, [activeTab, viewsLoaded, tapsLoaded, loadViews, loadTaps]);

	// Live tap events from the chat WebSocket — prepend incoming taps so the
	// list updates without waiting for the next refresh.
	useEffect(() => {
		const onTap = (event: Event) => {
			const detail = (event as CustomEvent<TapReceivedDetail>).detail;
			if (!detail) return;
			const incoming: InterestItem = {
				profileId: detail.profileId,
				displayName: detail.displayName,
				imageHash: detail.imageHash,
				timestamp: detail.timestamp,
				tapType: detail.tapType,
				viewCount: null,
				canOpenProfile: true,
				isFromCache: false,
			};
			setTaps((previous) => {
				const filtered = previous.filter(
					(item) => item.profileId !== incoming.profileId,
				);
				return [incoming, ...filtered];
			});
			setTapsLoaded(true);
		};
		window.addEventListener(TAP_RECEIVED_EVENT, onTap as EventListener);
		return () => {
			window.removeEventListener(TAP_RECEIVED_EVENT, onTap as EventListener);
		};
	}, []);

	const handleRefresh = useCallback(() => {
		if (activeTab === "views") {
			setViewsLimit(ITEMS_PER_PAGE);
			void loadViews();
			return;
		}
		setTapsLimit(ITEMS_PER_PAGE);
		void loadTaps();
	}, [activeTab, loadTaps, loadViews, ITEMS_PER_PAGE]);

	const handleSetActiveTab = useCallback(
		(nextTab: InterestTab) => {
			const nextParams = new URLSearchParams(searchParams);
			if (nextTab === "taps") {
				nextParams.delete("tab");
			} else {
				nextParams.set("tab", nextTab);
			}
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
			className="app-screen"
			onRefresh={handleRefresh}
			isDisabled={isLoading}
			refreshingLabel={t("interest_page.refreshing", { tab: t(`interest_page.tabs.${activeTab}`) })}
		>
			<div
				className="mx-auto w-full max-w-4xl"
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
			>
				<h1 className="app-title">{t("interest_page.title")}</h1>
				<div className="mt-4 space-y-4">
					<div className="flex items-end gap-3">
						<InterestTabs
							activeTab={activeTab}
							onViewsClick={() => handleSetActiveTab("views")}
							onTapsClick={() => handleSetActiveTab("taps")}
						/>
					</div>

					{activeTab === "views" && viewedCount != null ? (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
							<p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
								{t("interest_page.total_viewed_count")}
							</p>
							<p className="mt-1 text-lg font-semibold text-[var(--text)]">{viewedCount}</p>
						</div>
					) : null}

					{isLoading ? (
						<div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
							<div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
								<Loader2 className="h-4 w-4 animate-spin" />
								{t("interest_page.loading", { tab: t(`interest_page.tabs.${activeTab}`) })}
							</div>
						</div>
					) : null}

					{!isLoading && error ? (
						<ErrorState
							title={t("interest_page.error_load", { tab: t(`interest_page.tabs.${activeTab}`) })}
							description={error}
							onRetry={handleRefresh}
						/>
					) : null}

					{!isLoading && !error && activeItems.length === 0 ? (
						<EmptyState
							title={t(`interest_page.empty_${activeTab}`)}
							description={t(`interest_page.empty_${activeTab}_desc`)}
						/>
					) : null}

					{!isLoading && !error && activeItems.length > 0 ? (
						<div className="space-y-2">
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
