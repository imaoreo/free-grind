import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
	ArrowUpDown,
	Clock,
	Loader2,
	MessageSquare,
	Navigation,
	SlidersHorizontal,
} from "lucide-react";
import { useApiFunctions } from "../../hooks/useApiFunctions";
import type { RightNowFeedItem } from "../../services/apiFunctions";
import { getThumbImageUrl, validateMediaHash } from "../../utils/media";
import { formatDistance } from "./gridpage/utils";
import { cn } from "../../utils/cn";
import blankProfileImage from "../../images/blank-profile.png";
import { sexualPositionLabels } from "../../types/grid";
import {
	type RightNowFiltersDraft,
	type RightNowSortOption,
	loadRightNowFiltersDraft,
	saveRightNowFiltersDraft,
} from "./rightnow-filters-storage";

type SortOption = RightNowSortOption;

const positionFilterOptions = [
	{ value: "", label: "Any" },
	...Object.entries(sexualPositionLabels)
		.sort(([left], [right]) => Number(left) - Number(right))
		.map(([value, label]) => ({ value, label })),
];

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
			? Math.max(18, Math.min(102, draft.ageMin))
			: current.ageMin;
	const nextAgeMax =
		typeof draft.ageMax === "number" && Number.isFinite(draft.ageMax)
			? Math.max(nextAgeMin, Math.min(102, draft.ageMax))
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

function formatMinutesAgo(postedAt: number | null): string {
	if (!postedAt) return "";
	const diffMs = Date.now() - postedAt;
	if (diffMs < 0) return "Just now";
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "Just now";
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	return `${Math.floor(hours / 24)}d`;
}

function getItemName(item: RightNowFeedItem): string {
	return item.displayName?.trim() || "Anonymous";
}

function getItemImageUrl(item: RightNowFeedItem): string | null {
	return (
		item.imageUrl ??
		(item.profileImageMediaHash && validateMediaHash(item.profileImageMediaHash)
			? getThumbImageUrl(item.profileImageMediaHash, "320x320")
			: null)
	);
}

function getItemDisplayImageUrl(item: RightNowFeedItem): string {
	return getItemImageUrl(item) ?? blankProfileImage;
}

function isItemOnline(item: RightNowFeedItem): boolean {
	return typeof item.onlineUntil === "number" && item.onlineUntil > Date.now();
}

function RightNowRow({
	item,
	onMessage,
	onSelect,
}: {
	item: RightNowFeedItem;
	onMessage: (profileId: string) => void;
	onSelect: (profileId: string) => void;
}) {
	const name = getItemName(item);
	const isHosting = item.hosting;
	const imageUrl = getItemDisplayImageUrl(item);

	const timeAgo = formatMinutesAgo(item.postedAt);
	const distance = item.distanceMeters != null ? formatDistance(item.distanceMeters) : null;
	const subtitle = isHosting ? `${name} is Hosting in Right Now` : `${name} is in Right Now`;
	const isOnline = isItemOnline(item);

	return (
		<div className="flex items-center gap-3 px-[var(--app-px)] py-3">
			{/* Avatar */}
			<button
				type="button"
				className="relative shrink-0"
				onClick={() => onSelect(item.profileId)}
			>
				<div className="h-14 w-14 overflow-hidden rounded-full bg-[var(--surface-2)]">
					<img src={imageUrl} alt={name} className="h-full w-full object-cover" />
				</div>
				{isOnline ? (
					<span className="absolute bottom-0.5 left-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg)] bg-green-500" />
				) : null}
			</button>

			{/* Text info */}
			<button
				type="button"
				className="min-w-0 flex-1 text-left"
				onClick={() => onSelect(item.profileId)}
			>
				<p className="truncate text-sm font-bold text-[var(--text)]">{name}</p>
				<p className="truncate text-xs text-[var(--text-muted)]">{subtitle}</p>
				<div className="mt-0.5 flex items-center gap-3">
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
				</div>
				{item.text ? (
					<p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
						{item.text}
					</p>
				) : null}
			</button>

			{/* Message button */}
			<button
				type="button"
				onClick={() => onMessage(item.profileId)}
				className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors active:bg-[var(--surface-3)]"
				aria-label={`Message ${name}`}
			>
				<MessageSquare className="h-4 w-4" />
			</button>
		</div>
	);
}

export function RightNowPage() {
	const apiFunctions = useApiFunctions();
	const location = useLocation();
	const navigate = useNavigate();
	const persistedFilters = useMemo(() => loadRightNowFiltersDraft(), []);

	const [items, setItems] = useState<RightNowFeedItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sort, setSort] = useState<SortOption>(persistedFilters.sort);
	const [hostingOnly, setHostingOnly] = useState(persistedFilters.hostingOnly);
	const [ageMin, setAgeMin] = useState(persistedFilters.ageMin);
	const [ageMax, setAgeMax] = useState(persistedFilters.ageMax);
	const [positionFilter, setPositionFilter] = useState<string>(
		persistedFilters.positionFilter,
	);

	const ageLabel = `${ageMin}-${ageMax}${ageMax >= 102 ? "+" : ""}`;
	const activePositionFilter =
		positionFilterOptions.find((option) => option.value === positionFilter) ??
		positionFilterOptions[0];
	const hasAdvancedFilters = positionFilter.length > 0 || ageMin !== 18 || ageMax !== 102;
	const filterSummary = useMemo(
		() => `Position: ${activePositionFilter.label} · Age: ${ageLabel}`,
		[activePositionFilter.label, ageLabel],
	);

	useEffect(() => {
		const next = parseFiltersFromLocationState(location.state, {
			ageMin,
			ageMax,
			positionFilter,
		});
		setAgeMin(next.ageMin);
		setAgeMax(next.ageMax);
		setPositionFilter(next.positionFilter);
	}, [location.key, location.state]);

	useEffect(() => {
		saveRightNowFiltersDraft({
			sort,
			hostingOnly,
			ageMin,
			ageMax,
			positionFilter,
		});
	}, [sort, hostingOnly, ageMin, ageMax, positionFilter]);

	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const loadFeed = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await apiFunctions.getRightNowFeed({
				sort,
				hosting: hostingOnly ? true : undefined,
				ageMin,
				ageMax,
				sexualPositions: positionFilter || undefined,
			});
			if (isMountedRef.current) {
				setItems(result);
			}
		} catch (err) {
			if (isMountedRef.current) {
				setError(err instanceof Error ? err.message : "Failed to load Right Now");
			}
		} finally {
			if (isMountedRef.current) {
				setIsLoading(false);
			}
		}
	}, [apiFunctions, sort, hostingOnly, ageMin, ageMax, positionFilter]);

	useEffect(() => {
		void loadFeed();
	}, [loadFeed]);

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
			navigate(`/profile/${profileId}`);
		},
		[navigate],
	);

	const toggleSort = useCallback(() => {
		setSort((prev) => (prev === "DISTANCE" ? "RECENCY" : "DISTANCE"));
	}, []);

	const openFilters = useCallback(() => {
		navigate("/right-now/filters", {
			state: {
				rightNowFiltersDraft: {
					ageMin,
					ageMax,
					positionFilter,
				},
				returnTo: "/right-now",
			},
		});
	}, [navigate, ageMin, ageMax, positionFilter]);

	return (
		<section className="app-screen flex flex-col">
			{/* Header */}
			<header className="mb-2 grid gap-3 px-[var(--app-px)]">
				<h1 className="app-title">Right Now</h1>

				<div className="flex flex-wrap items-center gap-2 pb-1">
					{/* Sort by Distance / Recency */}
					<button
						type="button"
						onClick={toggleSort}
						className={cn(
							"flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
							"bg-[var(--surface-2)] text-[var(--text)]",
						)}
					>
						<ArrowUpDown className="h-3.5 w-3.5" />
						{sort === "DISTANCE" ? "Distance" : "Recent"}
					</button>

					{/* Hosting toggle */}
					<button
						type="button"
						onClick={() => setHostingOnly((v) => !v)}
						className={cn(
							"shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
							hostingOnly
								? "bg-[var(--accent)] text-[var(--accent-contrast)]"
								: "bg-[var(--surface-2)] text-[var(--text)]",
						)}
					>
						Hosting
					</button>

					<button
						type="button"
						onClick={openFilters}
						className={cn(
							"inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
							hasAdvancedFilters
								? "bg-[var(--accent)] text-[var(--accent-contrast)]"
								: "bg-[var(--surface-2)] text-[var(--text)]",
						)}
					>
						<SlidersHorizontal className="h-3.5 w-3.5" />
						Filters
					</button>

					<span className="text-xs text-[var(--text-muted)] sm:text-sm">
						{filterSummary}
					</span>
				</div>
			</header>

			{/* Feed */}
			<div className="flex-1 overflow-y-auto">
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
							className="rounded-full bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text)]"
						>
							Try again
						</button>
					</div>
				) : items.length === 0 ? (
					<div className="px-[var(--app-px)] py-16 text-center">
						<p className="text-sm text-[var(--text-muted)]">Nobody here right now.</p>
					</div>
				) : (
					<div className="divide-y divide-[var(--surface-2)]">
						{items.map((item) => (
							<RightNowRow
								key={item.profileId}
								item={item}
								onMessage={handleMessage}
								onSelect={handleSelect}
							/>
						))}
					</div>
				)}
			</div>

		</section>
	);
}

