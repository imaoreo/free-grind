import { Loader2, Map, MapPin, Navigation, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import z from "zod";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { usePreferences } from "../../contexts/PreferencesContext";
import { appLog } from "../../utils/logger";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
import { type GeocodeResult, type SelectedLocation, geocodeResultSchema } from "./GridPage.types";
import { LeafletLocationPicker } from "./gridpage/components/LeafletLocationPicker";

interface LocationOverlayProps {
	onClose: () => void;
}

export function LocationOverlay({ onClose }: LocationOverlayProps) {
	const { t } = useTranslation();
	const { setPreferences, geohash, locationName, useAutoLocation } = usePreferences();
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isMapOpen, setIsMapOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const searchInputRef = useRef<HTMLInputElement>(null);

	const initialCenter: [number, number] | undefined = (() => {
		if (geohash) {
			try {
				const decoded = decodeGeohash(geohash);
				return [(decoded.lat[0] + decoded.lat[1]) / 2, (decoded.lon[0] + decoded.lon[1]) / 2];
			} catch {
				return undefined;
			}
		}
		return undefined;
	})();

	useEffect(() => {
		if (geohash && !selectedLocation) {
			try {
				const decoded = decodeGeohash(geohash);
				const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
				const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
				setSelectedLocation({ lat, lon, label: locationName ?? t("browse_location.current_location_label") });
			} catch { /* ignore */ }
		}
		// focus search on mount
		setTimeout(() => searchInputRef.current?.focus(), 120);
	}, []);

	const handleClose = useCallback(() => {
		if (isClosingRef.current) return;
		isClosingRef.current = true;
		setIsClosing(true);
		if (window.history.state?.modal === "location-overlay") window.history.back();
		if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
		closeTimeoutRef.current = setTimeout(() => { closeTimeoutRef.current = null; onClose(); }, 300);
	}, [onClose]);

	useEffect(() => {
		return () => { if (closeTimeoutRef.current) { clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; } };
	}, []);

	useEffect(() => {
		if (window.history.state?.modal !== "location-overlay") window.history.pushState({ modal: "location-overlay" }, "");
		const handlePopState = (e: PopStateEvent) => { if (e.state?.modal !== "location-overlay") handleClose(); };
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [handleClose]);

	const saveAndClose = async (lat: number, lon: number, label: string, isAuto = false) => {
		setIsSaving(true);
		try {
			await setPreferences({ geohash: encodeGeohash(lat, lon), locationName: label, useAutoLocation: isAuto });
			handleClose();
		} catch {
			setLocationError(t("browse_location.error_search_failed"));
		} finally {
			setIsSaving(false);
		}
	};

	const handleUseCurrentLocation = async () => {
		setIsDetectingLocation(true);
		setLocationError(null);
		try {
			const tauriGeo = await import("@tauri-apps/plugin-geolocation").catch(() => null);
			if (tauriGeo) {
				let permissions = await tauriGeo.checkPermissions();
				if (permissions.location !== "granted" && permissions.location !== "denied") permissions = await tauriGeo.requestPermissions(["location"]);
				if (permissions.location !== "granted") { setLocationError(t("browse_location.error_access")); return; }
				const pos = await tauriGeo.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 });
				await saveAndClose(pos.coords.latitude, pos.coords.longitude, t("browse_location.current_location_label"), true);
				return;
			}
			if (!("geolocation" in navigator)) { setLocationError(t("browse_location.error_geolocation")); return; }
			const pos = await new Promise<GeolocationPosition>((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000, maximumAge: 20000 }));
			await saveAndClose(pos.coords.latitude, pos.coords.longitude, t("browse_location.current_location_label"), true);
		} catch (e) {
			appLog.error("Geolocation failed", e);
			setLocationError(t("browse_location.error_access"));
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const performSearch = async (query: string, signal?: AbortSignal) => {
		if (!query || query === lastSearchedQuery) { setIsSearchingLocation(false); return; }
		setLastSearchedQuery(query);
		setIsSearchingLocation(true);
		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=6&q=${encodeURIComponent(query)}`,
				{ signal, headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
			);
			if (!response.ok) throw new Error("search failed");
			setLocationResults(z.array(geocodeResultSchema).parse(await response.json()));
			setLocationError(null);
		} catch (e) {
			if (e instanceof Error && e.name === "AbortError") return;
			appLog.error("Location search failed", e);
			setLocationError(t("browse_location.error_search_failed"));
		} finally {
			setIsSearchingLocation(false);
		}
	};

	useEffect(() => {
		const query = locationQuery.trim();
		if (query.length < 2) { setLocationResults([]); setIsSearchingLocation(false); setLastSearchedQuery(""); return; }
		const controller = new AbortController();
		const timer = setTimeout(() => void performSearch(query, controller.signal), 500);
		return () => { clearTimeout(timer); controller.abort(); };
	}, [locationQuery]);

	const clearSearch = () => { setLocationQuery(""); setLocationResults([]); setLastSearchedQuery(""); searchInputRef.current?.focus(); };

	const isSearching = locationQuery.trim().length > 0;

	return (
		<div className={`fixed inset-0 z-[55] flex flex-col no-touch-callout isolate ${isClosing ? "pointer-events-none" : ""}`}>
			<div
				className={`absolute inset-0 bg-black/45 backdrop-blur-sm ${isClosing ? "animate-backdrop-out" : "animate-backdrop-in"}`}
				onClick={handleClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				className={`relative mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden bg-[var(--bg)] shadow-2xl transform-gpu will-change-transform ${isClosing ? "animate-modal-top-out" : "animate-modal-top-in"} md:border-x md:border-[var(--border)]`}
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<header className="relative shrink-0 overflow-hidden px-[var(--app-px)] pb-4 pt-[calc(env(safe-area-inset-top,0px)+0.875rem)]">
					<PageHeaderBackground color="var(--accent)" />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text)]">
								<MapPin className="h-4.5 w-4.5" />
							</div>
							<h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
								{t("browse_location.title")}
							</h2>
						</div>
						<button
							type="button"
							onClick={handleClose}
							className="shrink-0 rounded-full bg-[var(--surface-2)] p-2 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text)] active:scale-90"
							aria-label="Close"
						>
							<X className="h-5 w-5" />
						</button>
					</div>
				</header>

				{/* Pinned search bar */}
				<div className="shrink-0 border-y border-[var(--border)] bg-[var(--bg)] px-[var(--app-px)] py-2.5">
					<div className="relative">
						<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
						<input
							ref={searchInputRef}
							type="text"
							value={locationQuery}
							onChange={(e) => setLocationQuery(e.target.value)}
							placeholder={t("browse_location.search_placeholder")}
							className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] pl-10 pr-10 text-sm text-[var(--text)] outline-none transition focus:border-[var(--accent)] focus:bg-[var(--surface)]"
						/>
						{isSearchingLocation ? (
							<Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
						) : locationQuery ? (
							<button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)]">
								<X className="h-3.5 w-3.5" />
							</button>
						) : null}
					</div>
				</div>

				{/* Scrollable list */}
				<div className="relative z-10 flex-1 overflow-y-auto">

					{/* Error */}
					{locationError && (
						<div className="mx-[var(--app-px)] mt-3 flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
							<X className="h-4 w-4 shrink-0" />
							{locationError}
						</div>
					)}

					{/* GPS row — always shown */}
					<button
						type="button"
						onClick={() => void handleUseCurrentLocation()}
						disabled={isDetectingLocation || isSaving}
						className="flex w-full items-center gap-3.5 px-[var(--app-px)] py-3.5 transition hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:opacity-60"
					>
						<div className="relative shrink-0">
							<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-sm shadow-[var(--accent)]/40">
								{isDetectingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
							</div>
							{useAutoLocation && !isDetectingLocation && (
								<span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
									<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-75" />
									<span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
								</span>
							)}
						</div>
						<div className="min-w-0 flex-1 text-left">
							<p className="text-sm font-semibold text-[var(--text)]">
								{isDetectingLocation ? t("browse_location.detecting_location") : t("browse_location.use_current_location")}
							</p>
							{useAutoLocation && !isDetectingLocation && (
								<p className="mt-0.5 truncate text-xs text-[var(--accent)]">
									{locationName ?? t("browse_location.current_location_label")}
								</p>
							)}
						</div>
						{useAutoLocation && !isDetectingLocation && (
							<span className="shrink-0 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-white">{t("browse_location.badge_active")}</span>
						)}
					</button>

					{/* Divider */}
					<div className="mx-[var(--app-px)] border-t border-[var(--border)]" />

					{/* Search results OR current manual location */}
					{isSearching ? (
						locationResults.length > 0 ? (
							locationResults.map((result) => (
								<button
									key={`${result.lat}:${result.lon}`}
									type="button"
									onClick={() => void saveAndClose(Number(result.lat), Number(result.lon), result.display_name)}
									disabled={isSaving}
									className="flex w-full items-center gap-3.5 px-[var(--app-px)] py-3.5 transition hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] disabled:opacity-60"
								>
									<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-muted)]">
										<MapPin className="h-4 w-4" />
									</div>
									<span className="text-sm text-[var(--text)] line-clamp-2 text-left">{result.display_name}</span>
								</button>
							))
						) : !isSearchingLocation ? (
							<p className="px-[var(--app-px)] py-4 text-sm text-[var(--text-muted)]">{t("browse_location.error_search_failed_general")}</p>
						) : null
					) : !useAutoLocation && locationName ? (
						/* Current manual location row */
						<div className="flex items-center gap-3.5 px-[var(--app-px)] py-3.5">
							<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--accent)]">
								<MapPin className="h-4 w-4" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{t("browse_location.current_location_heading")}</p>
								<p className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{locationName}</p>
							</div>
							<span className="shrink-0 rounded-full border border-[var(--accent)]/40 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">{t("browse_location.badge_active")}</span>
						</div>
					) : null}

					{/* Divider before map */}
					{!isSearching && (
						<>
							<div className="mx-[var(--app-px)] border-t border-[var(--border)]" />

							{/* Map picker row */}
							<button
								type="button"
								onClick={() => { setMapPickerError(null); setIsMapOpen((v) => !v); }}
								className="flex w-full items-center gap-3.5 px-[var(--app-px)] py-3.5 transition hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)]"
							>
								<div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${isMapOpen ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-2)] text-[var(--text-muted)]"}`}>
									<Map className="h-4 w-4" />
								</div>
								<p className="flex-1 text-left text-sm font-semibold text-[var(--text)]">
									{t("browse_location.map_picker_title")}
								</p>
								<span className="shrink-0 text-xs text-[var(--text-muted)]">
									{isMapOpen ? t("browse_location.map_picker_hide") : t("browse_location.map_picker_open")}
								</span>
							</button>

							{isMapOpen && (
								<div className="border-t border-[var(--border)]">
									{mapPickerError ? (
										<p className="px-[var(--app-px)] py-3 text-sm text-[var(--text-muted)]">{mapPickerError}</p>
									) : (
										<LeafletLocationPicker
											selectedLocation={selectedLocation}
											onPick={(lat, lon) => setSelectedLocation({ lat, lon, label: t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) }) })}
											onError={setMapPickerError}
											defaultZoom={11}
											initialCenter={initialCenter}
										/>
									)}
									{selectedLocation && (
										<div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-[var(--app-px)] py-3">
											<div className="flex min-w-0 items-center gap-2">
												<MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
												<p className="truncate text-xs text-[var(--text-muted)]">{selectedLocation.label}</p>
											</div>
											<button
												type="button"
												disabled={isSaving}
												onClick={() => void handleUseMapSelection()}
												className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
											>
												{isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("browse_location.use_selected_location")}
											</button>
										</div>
									)}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);

	async function handleUseMapSelection() {
		if (!selectedLocation) return;
		await saveAndClose(selectedLocation.lat, selectedLocation.lon, selectedLocation.label);
	}
}
