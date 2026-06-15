import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet, SheetClose } from "../../../components/ui/bottom-sheet";

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

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

interface GiphyPickerSheetProps {
	onClose: () => void;
	onSelect: (gif: GiphyItem) => void;
	isDesktop: boolean;
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
		const previewVariant = "fixed_height_small";
		const previewPath = imgUrl(images, previewVariant) ?? imgUrl(images, "fixed_height") ?? urlPath;

		const previewUrl = imgUrl(images, "fixed_height") ?? urlPath;
		const previewWebpUrl = imgWebp(images, "fixed_height") ?? null;

		const { width, height } = imgDim(images, "original");

		return [{
			id,
			previewUrl,
			previewWebpUrl,
			urlPath,
			stillPath,
			previewPath,
			width,
			height,
		}];
	});
}

async function fetchGiphy(path: string): Promise<unknown> {
	if (!GIPHY_API_KEY) throw new Error("VITE_GIPHY_API_KEY not set");
	const sep = path.includes("?") ? "&" : "?";
	const res = await fetch(`${GIPHY_BASE}${path}${sep}api_key=${GIPHY_API_KEY}`);
	if (!res.ok) throw new Error(`Giphy ${res.status}`);
	return res.json();
}

export function GiphyPickerSheet({ onClose, onSelect, isDesktop }: GiphyPickerSheetProps) {
	const { t } = useTranslation();
	const [query, setQuery] = useState("");
	const [gifs, setGifs] = useState<GiphyItem[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const loadTrending = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const raw = await fetchGiphy("/trending?limit=30");
			setGifs(parseGiphyResponse(raw));
		} catch {
			setError(t("chat.giphy.error_load", { defaultValue: "Could not load GIFs." }));
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
			setError(t("chat.giphy.error_search", { defaultValue: "Search failed." }));
		} finally {
			setIsLoading(false);
		}
	}, [t]);

	useEffect(() => {
		void loadTrending();
	}, [loadTrending]);

	const handleQueryChange = (value: string) => {
		setQuery(value);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		if (!value.trim()) {
			void loadTrending();
			return;
		}
		debounceRef.current = setTimeout(() => {
			void searchGifs(value.trim());
		}, 400);
	};

	useEffect(() => {
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, []);

	const handleSelect = (gif: GiphyItem) => {
		onSelect(gif);
		onClose();
	};

	const col1: GiphyItem[] = [];
	const col2: GiphyItem[] = [];
	gifs.forEach((g, i) => (i % 2 === 0 ? col1 : col2).push(g));

	return (
		<BottomSheet onClose={onClose} isDesktop={isDesktop} bg="bg-[color-mix(in_srgb,var(--surface)_92%,black_8%)]">
			{/* Header */}
			<div className="flex items-center justify-between px-4 pb-3">
				<p className="text-sm font-semibold text-[var(--text)]">
					{t("chat.giphy.title", { defaultValue: "GIFs" })}
				</p>
				<SheetClose className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
					<X className="h-4 w-4" />
				</SheetClose>
			</div>

			{/* Search */}
			<div className="px-4 pb-3">
				<div className="relative flex items-center">
					<Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => handleQueryChange(e.target.value)}
						placeholder={t("chat.giphy.search_placeholder", { defaultValue: "Search GIFs..." })}
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

			{/* GIF Grid */}
			<div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
				{isLoading ? (
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
							{t("chat.giphy.retry", { defaultValue: "Retry" })}
						</button>
					</div>
				) : gifs.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-sm text-[var(--text-muted)]">
							{t("chat.giphy.no_results", { defaultValue: "No GIFs found." })}
						</p>
					</div>
				) : (
					<div className="flex gap-2">
						{[col1, col2].map((col, ci) => (
							<div key={ci} className="flex flex-1 flex-col gap-2">
								{col.map((gif, i) => (
									<button
										key={`${ci}-${i}`}
										type="button"
										onClick={() => handleSelect(gif)}
										className="group relative w-full overflow-hidden rounded-lg bg-[var(--surface-2)]"
										style={{
											aspectRatio: gif.width > 0 && gif.height > 0
												? `${gif.width} / ${gif.height}`
												: "1 / 1",
										}}
									>
										<img
											src={gif.previewWebpUrl ?? gif.previewUrl}
											alt=""
											loading="lazy"
											className="h-full w-full object-cover transition group-hover:scale-105"
										/>
									</button>
								))}
							</div>
						))}
					</div>
				)}
			</div>

			{/* Giphy attribution */}
			<div className="flex justify-end px-4 pb-2 pt-1">
				<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] opacity-60">
					Powered by GIPHY
				</span>
			</div>
		</BottomSheet>
	);
}

export type { GiphyItem };
