import { Eye, Hand, Loader2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import blankProfileImage from "../../images/blank-profile.png";
import {
	interestViewsStore,
	type StoredInterestView,
} from "../../services/interestViewsStore";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { EmptyState, ErrorState } from "../../components/ui/states";
import { PullToRefreshContainer } from "./components/PullToRefreshContainer";

type InterestTab = "views" | "taps";

type InterestItem = {
	profileId: string;
	displayName: string;
	imageHash: string | null;
	timestamp: number | null;
	tapType: number | null;
	viewCount: number | null;
	canOpenProfile: boolean;
};

const PREVIEW_ID_PREFIX = "preview:";

function fromStoredView(row: StoredInterestView): InterestItem {
	return {
		profileId: row.profileId,
		displayName: row.displayName,
		imageHash: row.imageHash,
		timestamp: row.timestamp ?? row.updatedAt,
		tapType: null,
		viewCount: row.viewCount,
		canOpenProfile: !row.profileId.startsWith(PREVIEW_ID_PREFIX),
	};
}

function toStoredView(item: InterestItem): Omit<StoredInterestView, "updatedAt"> {
	return {
		profileId: item.profileId,
		displayName: item.displayName,
		imageHash: item.imageHash,
		timestamp: item.timestamp,
		viewCount: item.viewCount,
	};
}

function isPlaceholderName(name: string, profileId: string): boolean {
	return name === `Profile ${profileId}`;
}

function mergeViewItem(
	cached: InterestItem | null,
	incoming: InterestItem,
): InterestItem {
	if (!cached) {
		return incoming;
	}

	const incomingLooksPlaceholder = isPlaceholderName(
		incoming.displayName,
		incoming.profileId,
	);

	return {
		profileId: incoming.profileId,
		displayName:
			incomingLooksPlaceholder && !isPlaceholderName(cached.displayName, cached.profileId)
				? cached.displayName
				: incoming.displayName,
		imageHash: incoming.imageHash ?? cached.imageHash,
		timestamp: incoming.timestamp ?? cached.timestamp,
		tapType: null,
		viewCount: incoming.viewCount ?? cached.viewCount,
		canOpenProfile: incoming.canOpenProfile || cached.canOpenProfile,
	};
}

function asObject(value: unknown): Record<string, unknown> | null {
	if (typeof value !== "object" || value === null) {
		return null;
	}
	return value as Record<string, unknown>;
}

function toStringId(value: unknown): string | null {
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return String(value);
	}
	return null;
}

function toNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return null;
}

function getItemDisplayName(entry: Record<string, unknown>, profileId: string, t: TFunction): string {
	const value = entry.displayName;
	if (typeof value === "string" && value.trim().length > 0) {
		return value;
	}
	return t("interest_page.profile_fallback", { id: profileId });
}

function getItemImageHash(entry: Record<string, unknown>): string | null {
	const candidates = [entry.profileImageMediaHash, entry.photoHash, entry.mediaHash];
	for (const candidate of candidates) {
		if (typeof candidate === "string" && validateMediaHash(candidate)) {
			return candidate;
		}
	}
	return null;
}

function getItemTimestamp(entry: Record<string, unknown>): number | null {
	return (
		toNumber(entry.timestamp) ??
		toNumber(entry.sentOn) ??
		toNumber(entry.readOn) ??
		toNumber(entry.lastViewedAt) ??
		toNumber(entry.lastViewed) ??
		toNumber(entry.seen)
	);
}

function getViewEntryRecord(entry: unknown): Record<string, unknown> | null {
	const obj = asObject(entry);
	if (!obj) {
		return null;
	}

	const nestedCandidates = [obj.profile, obj.preview, obj.viewer, obj.user];
	for (const candidate of nestedCandidates) {
		const nested = asObject(candidate);
		if (nested) {
			return {
				...obj,
				...nested,
			};
		}
	}

	return obj;
}

function getViewProfileId(entry: Record<string, unknown>): string | null {
	return (
		toStringId(entry.profileId) ??
		toStringId(entry.viewerProfileId) ??
		toStringId(entry.id)
	);
}

function getPreviewSyntheticId(
	entry: Record<string, unknown>,
	index: number,
): string {
	const hash = typeof entry.profileImageMediaHash === "string" ? entry.profileImageMediaHash : "nohash";
	if (hash !== "nohash") {
		// Keep preview IDs stable across refreshes for the same hash.
		return `${PREVIEW_ID_PREFIX}${hash}`;
	}
	const seen = toNumber(entry.lastViewed) ?? toNumber(entry.seen) ?? toNumber(entry.timestamp) ?? 0;
	return `${PREVIEW_ID_PREFIX}${hash}:${seen}:${index}`;
}

function normalizeViews(
	payload: unknown,
	previouslyCached: InterestItem[],
	t: TFunction
): InterestItem[] {
	const root = asObject(payload);
	if (!root) {
		return previouslyCached;
	}
	const dataRoot = asObject(root.data);

	const profilesRaw = Array.isArray(root.profiles)
		? root.profiles
		: Array.isArray(dataRoot?.profiles)
			? dataRoot.profiles
			: [];
	const previewsRaw = Array.isArray(root.previews)
		? root.previews
		: Array.isArray(dataRoot?.previews)
			? dataRoot.previews
			: [];

	const normalizedProfiles = profilesRaw
		.map<InterestItem | null>((entry) => {
			const obj = getViewEntryRecord(entry);
			if (!obj) {
				return null;
			}

			const profileId = getViewProfileId(obj);
			if (!profileId) {
				return null;
			}

			const viewedCount = asObject(obj.viewedCount);

			return {
				profileId,
				displayName: getItemDisplayName(obj, profileId, t),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: null,
				viewCount: toNumber(viewedCount?.totalCount),
				canOpenProfile: true,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);

	const normalizedPreviews = previewsRaw
		.map<InterestItem | null>((entry, index) => {
			const obj = getViewEntryRecord(entry);
			if (!obj) {
				return null;
			}

			const profileId = getViewProfileId(obj) ?? getPreviewSyntheticId(obj, index);

			const viewedCount = asObject(obj.viewedCount);

			return {
				profileId,
				displayName:
					getViewProfileId(obj) !== null ? getItemDisplayName(obj, profileId, t) : t("interest_page.private_viewer"),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: null,
				viewCount: toNumber(viewedCount?.totalCount),
				canOpenProfile: getViewProfileId(obj) !== null,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);

	const cachedMap = new Map(previouslyCached.map((item) => [item.profileId, item]));
	const profileMap = new Map(normalizedProfiles.map((item) => [item.profileId, item]));

	const merged: InterestItem[] = [];
	const seenIds = new Set<string>();
	const seenHashes = new Set<string>();

	for (const profileItem of normalizedProfiles) {
		const cachedItem = cachedMap.get(profileItem.profileId) ?? null;
		const nextItem = mergeViewItem(cachedItem, profileItem);
		if (seenIds.has(nextItem.profileId)) {
			continue;
		}
		if (nextItem.imageHash && seenHashes.has(nextItem.imageHash)) {
			continue;
		}
		merged.push(nextItem);
		seenIds.add(nextItem.profileId);
		if (nextItem.imageHash) {
			seenHashes.add(nextItem.imageHash);
		}
	}

	for (const cachedItem of previouslyCached) {
		if (seenIds.has(cachedItem.profileId)) {
			continue;
		}
		if (cachedItem.imageHash && seenHashes.has(cachedItem.imageHash)) {
			continue;
		}
		merged.push(cachedItem);
		seenIds.add(cachedItem.profileId);
		if (cachedItem.imageHash) {
			seenHashes.add(cachedItem.imageHash);
		}
	}

	for (const previewItem of normalizedPreviews) {
		if (seenIds.has(previewItem.profileId)) {
			continue;
		}
		if (previewItem.imageHash && seenHashes.has(previewItem.imageHash)) {
			continue;
		}
		if (cachedMap.has(previewItem.profileId) || profileMap.has(previewItem.profileId)) {
			continue;
		}
		merged.push(previewItem);
		seenIds.add(previewItem.profileId);
		if (previewItem.imageHash) {
			seenHashes.add(previewItem.imageHash);
		}
	}

	return merged;
}

function normalizeTaps(payload: unknown, t: TFunction): InterestItem[] {
	const root = asObject(payload);
	if (!root || !Array.isArray(root.profiles)) {
		return [];
	}

	return root.profiles
		.map<InterestItem | null>((entry) => {
			const obj = asObject(entry);
			if (!obj) {
				return null;
			}

			const profileId = toStringId(obj.profileId) ?? toStringId(obj.senderId);
			if (!profileId) {
				return null;
			}

			return {
				profileId,
				displayName: getItemDisplayName(obj, profileId, t),
				imageHash: getItemImageHash(obj),
				timestamp: getItemTimestamp(obj),
				tapType: toNumber(obj.tapType),
				viewCount: null,
				canOpenProfile: true,
			};
		})
		.filter((entry): entry is InterestItem => entry !== null);
}

function formatTimestamp(timestamp: number | null, t: TFunction): string {
	if (!timestamp) {
		return t("interest_page.unknown_time");
	}
	return new Date(timestamp).toLocaleString();
}

function tapLabel(tapType: number | null, t: TFunction): string {
	switch (tapType) {
		case 0:
			return t("interest_page.tap_labels.friendly");
		case 1:
			return t("interest_page.tap_labels.hot");
		case 2:
			return t("interest_page.tap_labels.looking");
		default:
			return t("interest_page.tap_labels.default");
	}
}

function InterestTabs({
	activeTab,
	onViewsClick,
	onTapsClick,
}: {
	activeTab: InterestTab;
	onViewsClick: () => void;
	onTapsClick: () => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="flex min-h-10 items-end gap-3">
			<button
				type="button"
				onClick={onViewsClick}
				className={
					activeTab === "views"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "views" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "views"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("interest_page.tabs.views")}
				</span>
			</button>
			<button
				type="button"
				onClick={onTapsClick}
				className={
					activeTab === "taps"
						? "inline-flex items-end text-left"
						: "inline-flex items-end text-left text-[var(--text-muted)] transition hover:text-[var(--text)]"
				}
				aria-current={activeTab === "taps" ? "page" : undefined}
			>
				<span
					className={
						activeTab === "taps"
							? "text-2xl font-bold leading-none sm:text-3xl"
							: "text-lg font-semibold leading-none sm:text-xl"
					}
				>
					{t("interest_page.tabs.taps")}
				</span>
			</button>
		</div>
	);
}

function InterestRow({
	item,
	mode,
	onOpenProfile,
}: {
	item: InterestItem;
	mode: InterestTab;
	onOpenProfile: (profileId: string) => void;
}) {
	const { t } = useTranslation();
	const imageSrc = item.imageHash ? getThumbImageUrl(item.imageHash, "320x320") : blankProfileImage;
	const trailing =
		mode === "views"
			? item.viewCount != null
				? t("interest_page.view_count", { count: item.viewCount })
				: t("interest_page.viewed")
			: tapLabel(item.tapType, t);

	return (
		<button
			type="button"
			onClick={() => {
				if (item.canOpenProfile) {
					onOpenProfile(item.profileId);
				}
			}}
			disabled={!item.canOpenProfile}
			className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-left transition hover:bg-[var(--surface-2)]"
		>
			<div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[var(--surface-2)]">
				<img src={imageSrc} alt={item.displayName} className="h-full w-full object-cover" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-semibold text-[var(--text)]">{item.displayName}</p>
				<p className="truncate text-xs text-[var(--text-muted)]">{formatTimestamp(item.timestamp, t)}</p>
			</div>
			<span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)]">
				{mode === "views" ? <Eye className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
				{mode === "views" && !item.canOpenProfile ? t("interest_page.preview") : trailing}
			</span>
		</button>
	);
}

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
	const touchStartXRef = useRef<number | null>(null);

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
								/>
							))}
						</div>
					) : null}
				</div>
			</div>
		</PullToRefreshContainer>
	);
}
