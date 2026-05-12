import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, Loader2, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BackToSettings } from "../../components/BackToSettings";
import {
	searchIssues,
	type IssueCategory,
	type IssueResult,
	type IssueStatus,
} from "../../services/apiHelpers";

const PAGE_SIZE = 20;

type CategoryFilter = "ALL" | IssueCategory;
type StatusFilter = "ALL" | IssueStatus;

function StatusBadge({ status }: { status: IssueStatus }) {
	const { t } = useTranslation();
	const label = t(`issue_search.status_${status.toLowerCase()}`);

	const colorMap: Record<IssueStatus, string> = {
		OPEN: "bg-blue-500/15 text-blue-400",
		IN_PROGRESS: "bg-yellow-500/15 text-yellow-400",
		RESOLVED: "bg-green-500/15 text-green-400",
		CLOSED: "bg-[var(--surface-2)] text-[var(--text-muted)]",
	};

	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${colorMap[status]}`}
		>
			{label}
		</span>
	);
}

function CategoryBadge({ category }: { category: IssueCategory }) {
	const { t } = useTranslation();
	const label =
		category === "FEATURE_REQUEST"
			? t("issue_search.category_feature")
			: t("issue_search.category_bug");

	const className =
		category === "FEATURE_REQUEST"
			? "bg-purple-500/15 text-purple-400"
			: "bg-orange-500/15 text-orange-400";

	return (
		<span
			className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-tight ${className}`}
		>
			{label}
		</span>
	);
}

function IssueCard({ issue }: { issue: IssueResult }) {
	const [expanded, setExpanded] = useState(false);

	const createdAt = new Date(issue.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	const snippet =
		issue.description.length > 160
			? `${issue.description.slice(0, 160).trimEnd()}…`
			: issue.description;

	return (
		<button
			type="button"
			onClick={() => setExpanded((prev) => !prev)}
			className="surface-card grid w-full gap-2 p-4 text-left sm:p-5"
		>
			<div className="flex items-start justify-between gap-3">
				<p className="text-sm font-semibold leading-snug text-[var(--text)]">
					{issue.title}
				</p>
				<ChevronRight
					className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
				/>
			</div>

			<div className="flex flex-wrap gap-1.5">
				<StatusBadge status={issue.status} />
				<CategoryBadge category={issue.category} />
			</div>

			{expanded ? (
				<p className="whitespace-pre-wrap text-sm text-[var(--text-muted)]">
					{issue.description}
				</p>
			) : (
				<p className="text-sm text-[var(--text-muted)]">{snippet}</p>
			)}

			<p className="text-xs text-[var(--text-muted)]">{createdAt}</p>
		</button>
	);
}

export function IssueSearchPage() {
	const { t } = useTranslation();

	const [query, setQuery] = useState("");
	const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
	const [issues, setIssues] = useState<IssueResult[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [skip, setSkip] = useState(0);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const activeRequestRef = useRef(0);

	const fetchIssues = useCallback(
		async ({
			searchQuery,
			category,
			status,
			nextSkip,
			append,
		}: {
			searchQuery: string;
			category: CategoryFilter;
			status: StatusFilter;
			nextSkip: number;
			append: boolean;
		}) => {
			const requestId = ++activeRequestRef.current;

			if (append) {
				setIsLoadingMore(true);
			} else {
				setIsLoading(true);
				setError(null);
			}

			try {
				const result = await searchIssues({
					search: searchQuery.trim() || undefined,
					category: category === "ALL" ? undefined : category,
					status: status === "ALL" ? undefined : status,
					skip: nextSkip,
					take: PAGE_SIZE,
				});

				if (requestId !== activeRequestRef.current) return;

				if (append) {
					setIssues((prev) => [...prev, ...result.data]);
				} else {
					setIssues(result.data);
					setSkip(0);
				}

				setTotal(result.total);
				setSkip(nextSkip + result.data.length);
			} catch (err) {
				if (requestId !== activeRequestRef.current) return;
				setError(err instanceof Error ? err.message : t("issue_search.error_load"));
			} finally {
				if (requestId === activeRequestRef.current) {
					setIsLoading(false);
					setIsLoadingMore(false);
				}
			}
		},
		[t],
	);

	// Initial load + filter changes
	useEffect(() => {
		void fetchIssues({
			searchQuery: query,
			category: categoryFilter,
			status: statusFilter,
			nextSkip: 0,
			append: false,
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [categoryFilter, statusFilter]);

	// Debounced search
	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			void fetchIssues({
				searchQuery: query,
				category: categoryFilter,
				status: statusFilter,
				nextSkip: 0,
				append: false,
			});
		}, 350);

		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [query]);

	const handleLoadMore = () => {
		void fetchIssues({
			searchQuery: query,
			category: categoryFilter,
			status: statusFilter,
			nextSkip: skip,
			append: true,
		});
	};

	const categoryTabs: { value: CategoryFilter; label: string }[] = [
		{ value: "ALL", label: t("issue_search.filter_all") },
		{ value: "BUG", label: t("issue_search.category_bug") },
		{ value: "FEATURE_REQUEST", label: t("issue_search.category_feature") },
	];

	const statusTabs: { value: StatusFilter; label: string }[] = [
		{ value: "ALL", label: t("issue_search.filter_all") },
		{ value: "OPEN", label: t("issue_search.status_open") },
		{ value: "IN_PROGRESS", label: t("issue_search.status_in_progress") },
		{ value: "RESOLVED", label: t("issue_search.status_resolved") },
		{ value: "CLOSED", label: t("issue_search.status_closed") },
	];

	const hasMore = issues.length < total;

	return (
		<section className="app-screen">
			<header className="mb-5">
				<BackToSettings />
				<div className="flex items-center justify-between gap-3">
					<div>
						<h1 className="app-title mb-1">{t("issue_search.title")}</h1>
						<p className="app-subtitle">{t("issue_search.subtitle")}</p>
					</div>
					<Link
						to="/settings/report-issue"
						className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--accent)]"
					>
						<Plus className="h-4 w-4" />
						{t("issue_search.report_cta")}
					</Link>
				</div>
			</header>

			{/* Search input */}
			<div className="mb-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3">
				<Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
				<input
					type="search"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t("issue_search.search_placeholder")}
					className="h-10 flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none"
				/>
				{query ? (
					<button
						type="button"
						onClick={() => setQuery("")}
						className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text)]"
					>
						<X className="h-4 w-4" />
					</button>
				) : null}
			</div>

			{/* Category filter */}
			<div className="mb-3 flex gap-2 overflow-x-auto pb-1">
				{categoryTabs.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => setCategoryFilter(tab.value)}
						className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition"
						style={{
							borderColor:
								categoryFilter === tab.value ? "var(--accent)" : "var(--border)",
							background:
								categoryFilter === tab.value
									? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
									: "var(--surface-2)",
						}}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Status filter */}
			<div className="mb-5 flex gap-2 overflow-x-auto pb-1">
				{statusTabs.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => setStatusFilter(tab.value)}
						className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition"
						style={{
							borderColor:
								statusFilter === tab.value ? "var(--accent)" : "var(--border)",
							background:
								statusFilter === tab.value
									? "color-mix(in srgb, var(--accent) 16%, var(--surface))"
									: "var(--surface-2)",
						}}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Results */}
			{isLoading ? (
				<div className="flex justify-center py-12">
					<Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
				</div>
			) : error ? (
				<div className="surface-card flex flex-col items-center gap-3 p-6 text-center">
					<p className="text-sm text-[var(--text-muted)]">{error}</p>
					<button
						type="button"
						onClick={() =>
							fetchIssues({
								searchQuery: query,
								category: categoryFilter,
								status: statusFilter,
								nextSkip: 0,
								append: false,
							})
						}
						className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-readable)]"
					>
						<RefreshCw className="h-4 w-4" />
						{t("issue_search.retry")}
					</button>
				</div>
			) : issues.length === 0 ? (
				<div className="surface-card p-6 text-center">
					<p className="text-sm text-[var(--text-muted)]">
						{query
							? t("issue_search.no_results_query", { query })
							: t("issue_search.no_results")}
					</p>
				</div>
			) : (
				<div className="grid gap-3">
					{issues.map((issue) => (
						<IssueCard key={issue.id} issue={issue} />
					))}

					{hasMore ? (
						<button
							type="button"
							onClick={handleLoadMore}
							disabled={isLoadingMore}
							className="surface-card flex w-full items-center justify-center gap-2 p-4 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-50"
						>
							{isLoadingMore ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : null}
							{isLoadingMore
								? t("issue_search.loading_more")
								: t("issue_search.load_more", {
										remaining: total - issues.length,
									})}
						</button>
					) : (
						<p className="text-center text-xs text-[var(--text-muted)]">
							{t("issue_search.showing_all", { count: total })}
						</p>
					)}
				</div>
			)}
		</section>
	);
}
