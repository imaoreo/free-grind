import { Check, Clock, Loader2, Search, Send, Sticker, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";
const RECENT_GIFS_KEY = "fg-recent-gifs";
const RECENT_GIFS_MAX = 20;

interface GiphyItem {
	id: string;
	previewUrl: string;
	previewWebpUrl: string | null;
	urlPath: string;
	stillPath: string;
	previewPath: string;
	width: number;
	height: number;
}

function loadRecentGifs(): GiphyItem[] {
	try {
		const raw = window.localStorage.getItem(RECENT_GIFS_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as GiphyItem[]) : [];
	} catch {
		return [];
	}
}

function saveRecentGif(gif: GiphyItem): GiphyItem[] {
	const existing = loadRecentGifs().filter((g) => g.id !== gif.id);
	const next = [gif, ...existing].slice(0, RECENT_GIFS_MAX);
	window.localStorage.setItem(RECENT_GIFS_KEY, JSON.stringify(next));
	return next;
}

interface GiphyPickerSheetProps {
	onClose: () => void;
	onSelect: (gif: GiphyItem) => void;
	isDesktop: boolean;
	isSending?: boolean;
}

function imgUrl(images: Record<string, unknown>, key: string): string | null {
	const v = images[key];
	if (!v || typeof v !== "object") return null;
	const u = (v as Record<string, unknown>).url;
	return typeof u === "string" ? u : null;
}

function imgWebp(images: Record<string, unknown>, key: string): string | null {
	const v = images[key];
	if (!v || typeof v !== "object") return null;
	const u = (v as Record<string, unknown>).webp;
	return typeof u === "string" ? u : null;
}

function imgDim(images: Record<string, unknown>, key: string): { width: number; height: number } {
	const v = images[key];
	if (!v || typeof v !== "object") return { width: 0, height: 0 };
	const img = v as Record<string, unknown>;
	return { width: Number(img.width) || 0, height: Number(img.height) || 0 };
}

function parseGiphyResponse(raw: unknown): GiphyItem[] {
	if (!raw || typeof raw !== "object") return [];
	const r = raw as Record<string, unknown>;
	const data = Array.isArray(r.data) ? r.data : [];
	return data.flatMap((item: unknown) => {
		if (!item || typeof item !== "object") return [];
		const it = item as Record<string, unknown>;
		const id = typeof it.id === "string" ? it.id : null;
		const images = it.images && typeof it.images === "object" ? it.images as Record<string, unknown> : null;
		if (!id || !images) return [];

		const urlPath = imgUrl(images, "original") ?? imgUrl(images, "downsized_large") ?? imgUrl(images, "fixed_height");
		if (!urlPath) return [];

		const stillPath = imgUrl(images, "original_still") ?? imgUrl(images, "fixed_height_still") ?? urlPath;
		const previewPath = imgUrl(images, "fixed_height_small") ?? imgUrl(images, "fixed_height") ?? urlPath;
		const previewUrl = imgUrl(images, "fixed_height") ?? urlPath;
		const previewWebpUrl = imgWebp(images, "fixed_height") ?? null;
		const { width, height } = imgDim(images, "original");

		return [{ id, previewUrl, previewWebpUrl, urlPath, stillPath, previewPath, width, height }];
	});
}

async function fetchGiphy(path: string): Promise<unknown> {
	if (!GIPHY_API_KEY) throw new Error("VITE_GIPHY_API_KEY not set");
	const sep = path.includes("?") ? "&" : "?";
	const res = await fetch(`${GIPHY_BASE}${path}${sep}api_key=${GIPHY_API_KEY}`);
	if (!res.ok) throw new Error(`Giphy ${res.status}`);
	return res.json();
}

function GifGrid({ gifs, selectedId, onToggle }: { gifs: GiphyItem[]; selectedId: string | null; onToggle: (gif: GiphyItem) => void }) {
	const col1: GiphyItem[] = [];
	const col2: GiphyItem[] = [];
	gifs.forEach((g, i) => (i % 2 === 0 ? col1 : col2).push(g));

	return (
		<div className="flex gap-2">
			{[col1, col2].map((col, ci) => (
				<div key={ci} className="flex flex-1 flex-col gap-2">
					{col.map((gif, i) => {
						const isSelected = selectedId === gif.id;
						return (
							<button
								key={`${ci}-${i}`}
								type="button"
								onClick={() => onToggle(gif)}
								className="group relative w-full overflow-hidden rounded-lg bg-[var(--surface-2)]"
								style={{
									aspectRatio: gif.width > 0 && gif.height > 0 ? `${gif.width} / ${gif.height}` : "1 / 1",
									outline: isSelected ? "2px solid var(--accent)" : "none",
									outlineOffset: "-2px",
								}}
							>
								<img
									src={gif.previewWebpUrl ?? gif.previewUrl}
									alt=""
									loading="lazy"
									className="h-full w-full object-cover transition group-hover:scale-105"
								/>
								{isSelected && (
									<div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--accent) 45%, transparent)" }}>
										<Check className="h-5 w-5 text-white drop-shadow" />
									</div>
								)}
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}

type Tab = "trending" | "recent";

export function GiphyPickerSheet({ onClose, onSelect, isDesktop, isSending = false }: GiphyPickerSheetProps) {
	const { t } = useTranslation();
	const [tab, setTab] = useState<Tab>("trending");
	const [query, setQuery] = useState("");
	const [gifs, setGifs] = useState<GiphyItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedGif, setSelectedGif] = useState<GiphyItem | null>(null);
	const [recentGifs, setRecentGifs] = useState<GiphyItem[]>(() => loadRecentGifs());
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const loadTrending = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const raw = await fetchGiphy("/trending?limit=30");
			setGifs(parseGiphyResponse(raw));
		} catch {
			setError(t("chat.giphy.error_load"));
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	const searchGifs = useCallback(async (q: string) => {
		setIsLoading(true);
		setError(null);
		try {
			const raw = await fetchGiphy(`/search?q=${encodeURIComponent(q)}&limit=30`);
			setGifs(parseGiphyResponse(raw));
		} catch {
			setError(t("chat.giphy.error_search"));
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void loadTrending();
	}, [loadTrending]);

	useEffect(() => {
		return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
	}, []);

	const handleQueryChange = (value: string) => {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!value.trim()) {
			void loadTrending();
			return;
		}
		debounceRef.current = setTimeout(() => { void searchGifs(value.trim()); }, 400);
	};

	const handleTabChange = (next: Tab) => {
		setTab(next);
		setSelectedGif(null);
		if (next === "trending") {
			setQuery("");
			void loadTrending();
		}
	};

	const handleToggle = (gif: GiphyItem) => {
		setSelectedGif((prev) => (prev?.id === gif.id ? null : gif));
	};

	const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
		{ id: "trending", label: t("chat.giphy.tab_trending"), icon: <TrendingUp className="h-3.5 w-3.5" /> },
		{ id: "recent", label: t("chat.giphy.tab_recent"), icon: <Clock className="h-3.5 w-3.5" /> },
	];

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]" panelClassName="max-h-[60dvh]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{t("chat.giphy.title")}
				</p>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			{/* Tab bar */}
			<div className="flex border-b border-[var(--border)] px-2 pb-0 pt-1">
				{tabs.map((tab_item) => (
					<button
						key={tab_item.id}
						type="button"
						onClick={() => handleTabChange(tab_item.id)}
						className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
							tab === tab_item.id
								? "border-[var(--accent)] text-[var(--accent)]"
								: "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
						}`}
					>
						{tab_item.icon}
						{tab_item.label}
					</button>
				))}
			</div>

			{/* Search (Trending tab only) */}
			{tab === "trending" && (
				<div className="px-4 pt-3">
					<div className="relative flex items-center">
						<Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
						<input
							type="text"
							value={query}
							onChange={(e) => handleQueryChange(e.target.value)}
							placeholder={t("chat.giphy.search_placeholder")}
							className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-4 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
						/>
						{query.length > 0 && (
							<button
								type="button"
								onClick={() => handleQueryChange("")}
								className="absolute right-3 text-[var(--text-muted)] hover:text-[var(--text)]"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						)}
					</div>
				</div>
			)}

			{/* Content */}
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
				{tab === "trending" ? (
					isLoading ? (
						<div className="flex items-center justify-center py-12">
							<div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
						</div>
					) : error ? (
						<div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
							<p className="text-sm text-[var(--text-muted)]">{error}</p>
							<button
								type="button"
								onClick={() => (query.trim() ? void searchGifs(query.trim()) : void loadTrending())}
								className="text-sm text-[var(--accent)] hover:underline"
							>
								{t("chat.giphy.retry")}
							</button>
						</div>
					) : gifs.length === 0 ? (
						<div className="flex items-center justify-center py-12">
							<p className="text-sm text-[var(--text-muted)]">
								{t("chat.giphy.no_results")}
							</p>
						</div>
					) : (
						<GifGrid gifs={gifs} selectedId={selectedGif?.id ?? null} onToggle={handleToggle} />
					)
				) : recentGifs.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2.5 text-center text-[var(--text-muted)]" style={{ minHeight: "40dvh" }}>
						<div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
							<Sticker className="h-5 w-5 opacity-60" />
						</div>
						<p className="text-sm font-medium">
							{t("chat.giphy.recent_empty")}
						</p>
						<p className="text-xs opacity-60">
							{t("chat.giphy.recent_empty_hint")}
						</p>
					</div>
				) : (
					<GifGrid gifs={recentGifs} selectedId={selectedGif?.id ?? null} onToggle={handleToggle} />
				)}
			</div>

			{/* Send footer */}
			{selectedGif && (
				<div className="border-t border-[var(--border)] px-3 pt-3">
					<button
						type="button"
						onClick={() => {
							setRecentGifs(saveRecentGif(selectedGif));
							onSelect(selectedGif);
							onClose();
						}}
						disabled={isSending}
						className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition hover:brightness-110 disabled:opacity-60"
					>
						{isSending ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Send className="h-4 w-4" />
						)}
						<span>{isSending ? t("chat_drawer.sending") : t("chat.send")}</span>
					</button>
				</div>
			)}
		</BottomSheet>
	);
}

export type { GiphyItem };
