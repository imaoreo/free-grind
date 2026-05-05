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
export function InterestPage() {
	const { t } = useTranslation();
	const api = useApiFunctions();
	const navigate = useNavigate();
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab: InterestTab =
		searchParams.get("tab") === "taps" ? "taps" : "views";
	const [views, setViews] = useState<InterestItem[]>([]);
	const [taps, setTaps] = useState<InterestItem[]>([]);
	const [viewedCount, setViewedCount] = useState<number | null>(null);
	const [viewsLoaded, setViewsLoaded] = useState(false);
	const [tapsLoaded, setTapsLoaded] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
	const touchStartXRef = useRef<number | null>(null);

	// Keep relative timestamps fresh.
	useEffect(() => {
		const id = window.setInterval(() => setNowTimestamp(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, []);

	// Mark Interest as "seen" whenever the user is on this page so the
	// NavBar dot clears.
	useEffect(() => {
		markInterestSeen();
	}, [activeTab, taps.length, views.length]);

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

	const activeItems = useMemo(
		() => (activeTab === "views" ? views : taps),
		[activeTab, taps, views],
	);

	const handleRefresh = useCallback(() => {
		if (activeTab === "views") {
			void loadViews();
			return;
		}
		void loadTaps();
	}, [activeTab, loadTaps, loadViews]);

	const handleSetActiveTab = useCallback(
		(nextTab: InterestTab) => {
			const nextParams = new URLSearchParams(searchParams);
			if (nextTab === "views") {
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
							{activeItems.map((item) => (
								<InterestRow
									key={`${activeTab}-${item.profileId}-${item.timestamp ?? "na"}`}
									item={item}
									mode={activeTab}
									onOpenProfile={handleOpenProfile}
									now={nowTimestamp}
								/>
							))}
						</div>
					) : null}
				</div>
			</div>
		</PullToRefreshContainer>
	);
}
