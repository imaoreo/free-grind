import { Bookmark, Check, Compass, Home, Loader2, MapPin, Navigation, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import z from "zod";
import { PageHeaderBackground } from "../../components/ui/PageHeaderBackground";
import { usePreferences } from "../../contexts/PreferencesContext";
import { appLog } from "../../utils/logger";
import { getCurrentLocation, getLocationErrorMessageKey } from "../../services/currentLocation";
import { decodeGeohash, encodeGeohash } from "../../utils/geohash";
import { type GeocodeResult, type SelectedLocation, geocodeResultSchema } from "./GridPage.types";
import { MapLocationPicker } from "./gridpage/components/MapLocationPicker";
import {
	formatNominatimAddress,
	getCityFromAddress,
	reverseGeocodeCityForGeohash,
	reverseGeocodeGeohash,
} from "./gridpage/geocoding";
import {
	addSavedLocation,
	deleteSavedLocation,
	loadSavedLocations,
	type SavedLocation,
} from "../../services/savedLocations";
import {
	useHomeLocation,
	useUpdateHomeLocation,
	useUpdateVisitingMode,
	useVisitingMode,
} from "../../hooks/queries/useProfileQueries";
import { VISITING_MODES, getVisitingModeTranslationKey, type VisitingMode } from "../../types/visiting";

export type ExploreLocation = { geohash: string; label: string } | null;

// Explore gets its own accent (distinct from the app's --accent, used for the
// real/"set" location) so the two modes are never visually ambiguous — same
// color everywhere it shows up: this overlay's tab/banner/buttons and
// GridPage's header pill.
export const EXPLORE_COLOR = "#3b82f6";

interface LocationOverlayProps {
	onClose: () => void;
	exploreLocation: ExploreLocation;
	onSetExploreLocation: (next: ExploreLocation) => void;
}

function SavedLocationRow({
	location,
	isActive,
	activeColor,
	disabled,
	onApply,
	onDelete,
}: {
	location: SavedLocation;
	isActive: boolean;
	activeColor: string;
	disabled: boolean;
	onApply: () => void;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const [address, setAddress] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void reverseGeocodeGeohash(location.geohash).then((label) => {
			if (!cancelled) setAddress(label);
		});
		return () => {
			cancelled = true;
		};
	}, [location.geohash]);

	return (
		<div className="flex items-center gap-1 bg-[var(--surface-2)]">
			<button
				type="button"
				onClick={onApply}
				disabled={disabled}
				className="flex min-w-0 flex-1 items-center gap-4 p-4 text-left transition hover:bg-[var(--surface-3,var(--surface))] disabled:opacity-60"
			>
				<div
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]"
					style={{ color: activeColor }}
				>
					<Bookmark className="h-4 w-4" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[var(--text)]">{location.name}</p>
					<p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
						{address ?? t("browse_location.resolving_location")}
					</p>
				</div>
				{isActive && (
					<div
						className={`flex shrink-0 items-center gap-1 rounded-full py-1 pl-1.5 pr-2.5 text-xs font-bold shadow-sm ${
							activeColor === "var(--accent)" ? "text-[var(--accent-contrast)]" : "text-white"
						}`}
						style={{ backgroundColor: activeColor }}
					>
						<Check className="h-3.5 w-3.5 shrink-0" />
						{t("browse_location.badge_active")}
					</div>
				)}
			</button>
			<button
				type="button"
				onClick={onDelete}
				disabled={disabled}
				aria-label={t("browse_location.delete_saved_location")}
				className="mr-2 shrink-0 rounded-xl p-2.5 text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-60"
			>
				<Trash2 className="h-4 w-4" />
			</button>
		</div>
	);
}

export function LocationOverlay({ onClose, exploreLocation, onSetExploreLocation }: LocationOverlayProps) {
	const { t } = useTranslation();
	const { setPreferences, geohash, locationName, useAutoLocation, autoFocusLocationSearch } = usePreferences();
	const [isClosing, setIsClosing] = useState(false);
	const isClosingRef = useRef(false);
	const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Which of the two ways to pick a location is active: "set" changes the
	// real geohash (visible to others, persisted). "explore" browses a
	// different area via /v7/search's exploreGeoHash without touching it —
	// see GridPage's exploreLocation state for why this stays out of
	// preferences. Defaults to whichever is already in effect.
	const [activeTab, setActiveTab] = useState<"set" | "explore">(exploreLocation ? "explore" : "set");
	const isExploreTab = activeTab === "explore";

	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);
	const [currentLocationError, setCurrentLocationError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);
	const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

	useEffect(() => {
		void loadSavedLocations().then(setSavedLocations);
	}, []);
	const [isNamingLocation, setIsNamingLocation] = useState(false);
	const [newLocationName, setNewLocationName] = useState("");
	const searchInputRef = useRef<HTMLInputElement>(null);

	// Home location + visiting mode are account-wide profile settings (not
	// grid-browsing preferences like geohash above), but they're both about
	// "where/how your profile shows up" so they live in this same overlay
	// rather than the profile editor — see LocationOverlay's set/explore tabs
	// for the parallel: everything here saves immediately, no separate "Save"
	// step.
	const { data: homeLocation } = useHomeLocation();
	const updateHomeLocation = useUpdateHomeLocation();
	const { data: visitingMode, isLoading: isLoadingVisitingMode, isError: isVisitingModeError } = useVisitingMode();
	const updateVisitingModeMutation = useUpdateVisitingMode();
	const visitingModeDisabled = isLoadingVisitingMode || isVisitingModeError || updateVisitingModeMutation.isPending;
	const visitingModeIcons: Record<VisitingMode, typeof MapPin> = { AUTO: Compass, OFF: Home, ON: MapPin };

	const handleSetAsHome = async (lat: number, lon: number) => {
		try {
			await updateHomeLocation.mutateAsync({ lat, lon });
			toast.success(t("browse_location.home_updated_toast"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("browse_location.home_update_failed"));
		}
	};

	const handleVisitingModeChange = async (mode: VisitingMode) => {
		if (mode === visitingMode) return;
		try {
			await updateVisitingModeMutation.mutateAsync(mode);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : t("api.errors.save_visiting_mode"));
		}
	};

	// Derived directly from geohash (not one-time state) so it can never go
	// stale — re-mounting isn't the only way this can change; geohash itself
	// can change while this component is alive (e.g. right after saving a
	// pick, before the close animation has actually unmounted it).
	const geohashCenter = useMemo<[number, number] | undefined>(() => {
		if (!geohash) return undefined;
		try {
			const decoded = decodeGeohash(geohash);
			return [(decoded.lat[0] + decoded.lat[1]) / 2, (decoded.lon[0] + decoded.lon[1]) / 2];
		} catch {
			return undefined;
		}
	}, [geohash]);
	const [gpsFallbackCenter, setGpsFallbackCenter] = useState<[number, number] | undefined>(undefined);
	const initialCenter = geohashCenter ?? gpsFallbackCenter;

	// Re-syncs selectedLocation to the saved geohash whenever it changes —
	// previously this only ran once on mount, so if this component instance
	// outlives a single open/close cycle (or the very first mount raced
	// ahead of geohash being available), the map would keep showing
	// whatever it started with instead of the actual saved location.
	useEffect(() => {
		if (isExploreTab || !geohash) return;
		try {
			const decoded = decodeGeohash(geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon
					? current
					: { lat, lon, label: locationName ?? t("browse_location.current_location_label") },
			);
		} catch { /* ignore */ }
	}, [isExploreTab, geohash, locationName, t]);

	// Same idea as the geohash-sync effect above, but for the explore tab:
	// keeps the map pin aligned with the current explore location (or the
	// real location as a sensible starting point if none is set yet) without
	// fighting the "set" tab's own sync effect above.
	useEffect(() => {
		if (!isExploreTab) return;
		const source = exploreLocation ?? (geohash ? { geohash, label: locationName ?? t("browse_location.current_location_label") } : null);
		if (!source) return;
		try {
			const decoded = decodeGeohash(source.geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon ? current : { lat, lon, label: source.label },
			);
		} catch { /* ignore */ }
	}, [isExploreTab, exploreLocation, geohash, locationName, t]);

	// No saved location to center on yet (fresh user) — try the device's
	// current position just to position the map sensibly. This only nudges
	// where the map opens; it doesn't pick/select anything or touch
	// saveAndClose, so no permission-denied error needs surfacing.
	useEffect(() => {
		if (geohash) return;
		void (async () => {
			try {
				const tauriGeo = await import("@tauri-apps/plugin-geolocation").catch(() => null);
				if (tauriGeo) {
					const perms = await tauriGeo.checkPermissions();
					if (perms.location !== "granted") return;
					const pos = await tauriGeo.getCurrentPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
					setGpsFallbackCenter([pos.coords.latitude, pos.coords.longitude]);
					return;
				}
				if (!("geolocation" in navigator)) return;
				const pos = await new Promise<GeolocationPosition>((res, rej) =>
					navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }),
				);
				setGpsFallbackCenter([pos.coords.latitude, pos.coords.longitude]);
			} catch {
				// no permission yet / unavailable — map just opens at the world view
			}
		})();
	}, [geohash]);

	useEffect(() => {
		if (!autoFocusLocationSearch) return;
		setTimeout(() => searchInputRef.current?.focus(), 120);
	}, [autoFocusLocationSearch]);

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
		const onPop = (e: PopStateEvent) => { if (e.state?.modal !== "location-overlay") handleClose(); };
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [handleClose]);

	const saveAndClose = async (lat: number, lon: number, label: string, isAuto = false) => {
		setIsSaving(true);
		try {
			await setPreferences({ geohash: encodeGeohash(lat, lon), locationName: label, useAutoLocation: isAuto });
			// Setting your real location while still "exploring" elsewhere would
			// leave the grid showing a place you just moved away from — end
			// explore whenever you actually commit a new real location.
			if (exploreLocation) {
				onSetExploreLocation(null);
			}
			handleClose();
		} catch {
			setLocationError(t("browse_location.error_search_failed"));
		} finally {
			setIsSaving(false);
		}
	};

	// Explore is local-only state (see GridPage), so unlike saveAndClose there's
	// no request to await — it just updates the parent and closes.
	const confirmExplore = (lat: number, lon: number, label: string) => {
		onSetExploreLocation({ geohash: encodeGeohash(lat, lon), label });
		handleClose();
	};

	const stopExploring = () => {
		onSetExploreLocation(null);
		handleClose();
	};

	// Resolves the geocoded place name for a GPS fix before saving, so the
	// header pill/overlay title show the same "Street Number, City,
	// District" format as every other way of picking a location, instead of
	// a generic "Current location" string. Falls back to that generic text
	// if the lookup fails — never blocks saving on it.
	const resolveGpsLabel = async (lat: number, lon: number): Promise<string> => {
		const label = await reverseGeocodeGeohash(encodeGeohash(lat, lon)).catch(() => null);
		return label ?? t("browse_location.current_location_label");
	};

	const handleUseCurrentLocation = async () => {
		setIsDetectingLocation(true);
		setCurrentLocationError(null);
		try {
			const { lat, lon } = await getCurrentLocation();
			const label = await resolveGpsLabel(lat, lon);
			await saveAndClose(lat, lon, label, true);
		} catch (e) {
			appLog.error("Geolocation failed", e);
			setCurrentLocationError(t(getLocationErrorMessageKey(e)));
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const performSearch = async (query: string, signal?: AbortSignal) => {
		if (!query || query === lastSearchedQuery) { setIsSearchingLocation(false); return; }
		setLastSearchedQuery(query);
		setIsSearchingLocation(true);
		try {
			const res = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
				{ signal, headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
			);
			if (!res.ok) throw new Error("search failed");
			setLocationResults(z.array(geocodeResultSchema).parse(await res.json()));
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
		const ctrl = new AbortController();
		const timer = setTimeout(() => void performSearch(query, ctrl.signal), 500);
		return () => { clearTimeout(timer); ctrl.abort(); };
	}, [locationQuery]);

	const clearSearch = () => { setLocationQuery(""); setLocationResults([]); setLastSearchedQuery(""); searchInputRef.current?.focus(); };
	const isSearching = locationQuery.trim().length > 0;
	// Whether the current map pin already matches the saved/active location —
	// regardless of whether that location came from a manual pick or GPS, so
	// the "confirm new pick" footer doesn't flash for a location that was
	// just auto-saved via "use current location".
	const isActiveLocationSelected = isExploreTab
		? !!exploreLocation && selectedLocation?.label === exploreLocation.label
		: !!locationName && selectedLocation?.label === locationName;

	// Same "Active" badge treatment as SavedLocationRow gets — compares against
	// the real geohash (not selectedLocation, which also tracks in-progress
	// map picks) so it only lights up once home is actually the saved location.
	const isHomeLocationActive =
		!useAutoLocation && !!homeLocation && geohash === encodeGeohash(homeLocation.lat, homeLocation.lon);

	const handleMapPick = (lat: number, lon: number) => {
		const fallbackLabel = t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		setSelectedLocation({ lat, lon, label: t("browse_location.resolving_location"), city: null });
		const geohashForPick = encodeGeohash(lat, lon);
		void reverseGeocodeGeohash(geohashForPick).then((label) => {
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon
					? { ...current, label: label ?? fallbackLabel }
					: current,
			);
		});
		void reverseGeocodeCityForGeohash(geohashForPick).then((city) => {
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon ? { ...current, city } : current,
			);
		});
	};

	const handleSelectSearchResult = (result: GeocodeResult) => {
		const lat = Number(result.lat);
		const lon = Number(result.lon);
		// Search results carry an address breakdown (addressdetails=1), so
		// format it the same way as everywhere else right away; the
		// reverse-geocode call below still refines it afterwards in case
		// that lookup resolves a more precise/different address.
		const initialLabel = (result.address && formatNominatimAddress(result.address, result.display_name)) ?? result.display_name;
		const initialCity = result.address ? getCityFromAddress(result.address) : null;
		setSelectedLocation({ lat, lon, label: initialLabel, city: initialCity });
		setLocationQuery("");
		setLocationResults([]);
		setLastSearchedQuery("");
		const geohashForResult = encodeGeohash(lat, lon);
		void reverseGeocodeGeohash(geohashForResult).then((label) => {
			if (!label) return;
			setSelectedLocation((current) =>
				current && current.lat === lat && current.lon === lon ? { ...current, label } : current,
			);
		});
		if (!initialCity) {
			void reverseGeocodeCityForGeohash(geohashForResult).then((city) => {
				if (!city) return;
				setSelectedLocation((current) =>
					current && current.lat === lat && current.lon === lon ? { ...current, city } : current,
				);
			});
		}
	};

	const handleApplySavedLocation = (location: SavedLocation) => {
		if (isExploreTab) {
			confirmExplore(location.lat, location.lon, location.name);
			return;
		}
		void saveAndClose(location.lat, location.lon, location.name);
	};

	const handleDeleteSavedLocation = (id: string) => {
		void deleteSavedLocation(id).then(setSavedLocations);
	};

	const handleSaveCurrentAsNamedLocation = () => {
		const name = newLocationName.trim();
		if (!name || !selectedLocation) return;
		void addSavedLocation({
			name,
			geohash: encodeGeohash(selectedLocation.lat, selectedLocation.lon),
			lat: selectedLocation.lat,
			lon: selectedLocation.lon,
		}).then(setSavedLocations);
		setNewLocationName("");
		setIsNamingLocation(false);
	};

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
				<header className="relative shrink-0 overflow-hidden border-b border-[var(--border)] px-[var(--app-px)] pb-5 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
					<PageHeaderBackground color={exploreLocation ? EXPLORE_COLOR : "var(--accent)"} />
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<div
								className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-colors"
								style={{ backgroundColor: exploreLocation ? EXPLORE_COLOR : "var(--surface-2)", color: exploreLocation ? "#fff" : "var(--text)" }}
							>
								{exploreLocation ? <Search className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
							</div>
							<div>
								<h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
									{t("browse_location.title")}
								</h2>
								{exploreLocation ? (
									<p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: EXPLORE_COLOR }}>
										<Search className="h-3 w-3 shrink-0" />
										<span className="truncate max-w-[200px]">
											{t("browse_location.exploring_label", { label: exploreLocation.label })}
										</span>
									</p>
								) : locationName ? (
									<p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
										{useAutoLocation
											? <Navigation className="h-3 w-3 shrink-0 text-[var(--accent)]" />
											: <MapPin className="h-3 w-3 shrink-0 text-[var(--accent)]" />
										}
										<span className="truncate max-w-[200px]">{locationName}</span>
									</p>
								) : null}
							</div>
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

				{/* Scrollable content */}
				<div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-[var(--app-px)]" data-lenis-prevent>
					<div className="space-y-4 py-4">

						{/* Set vs. Explore: "set" changes your real, visible location;
						    "explore" only changes what you browse — see confirmExplore.
						    Explore gets its own color (EXPLORE_COLOR) everywhere — tab,
						    banner, buttons — kept distinct from the app's --accent used
						    for "set", so which mode is active is never ambiguous. */}
						<div className="flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-1 shadow-sm">
							<button
								type="button"
								onClick={() => {
									setActiveTab("set");
									// Leaving the explore tab ends explore right away, not just
									// once a new real location is confirmed — otherwise the grid
									// would keep showing the explored area while this tab implies
									// you're back to your real location.
									if (exploreLocation) {
										onSetExploreLocation(null);
									}
								}}
								className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
									!isExploreTab
										? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-md shadow-[var(--accent)]/25"
										: "text-[var(--text-muted)] hover:text-[var(--text)]"
								}`}
							>
								<MapPin className="h-3.5 w-3.5" />
								{t("browse_location.tab_set")}
							</button>
							<button
								type="button"
								onClick={() => setActiveTab("explore")}
								style={isExploreTab ? { backgroundColor: EXPLORE_COLOR } : undefined}
								className={`flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-2 text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
									isExploreTab ? "text-white shadow-md" : "text-[var(--text-muted)] hover:text-[var(--text)]"
								}`}
							>
								<Search className="h-3.5 w-3.5" />
								{t("browse_location.tab_explore")}
							</button>
						</div>

						{/* Error */}
						{locationError && (
							<div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
								<X className="h-4 w-4 shrink-0" />
								{locationError}
							</div>
						)}

						{/* Quick picks: GPS first (set tab only), then saved locations — one
						    consistent list/row style. Hidden entirely when there's nothing
						    to show — e.g. the explore tab with no active explore and no
						    saved locations yet, since GPS (the other permanent entry) only
						    applies to the "set" tab. */}
						{(!isExploreTab || exploreLocation || savedLocations.length > 0) && (
						<div>
							<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
								{t("browse_location.quick_picks")}
							</p>
							<div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]">
								{isExploreTab && exploreLocation && (
									<button
										type="button"
										onClick={stopExploring}
										className="flex w-full items-center gap-4 bg-[var(--surface-2)] p-4 text-left transition hover:bg-[var(--surface-3,var(--surface))]"
									>
										<div
											className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]"
											style={{ color: EXPLORE_COLOR }}
										>
											<X className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-semibold text-[var(--text)]">
												{t("browse_location.stop_explore")}
											</p>
											<p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
												{t("browse_location.exploring_label", { label: exploreLocation.label })}
											</p>
										</div>
									</button>
								)}

								{!isExploreTab && homeLocation && (
									<button
										type="button"
										onClick={() => void saveAndClose(homeLocation.lat, homeLocation.lon, homeLocation.name)}
										disabled={isSaving}
										className="flex w-full items-center gap-4 bg-[var(--surface-2)] p-4 text-left transition hover:bg-[var(--surface-3,var(--surface))] disabled:opacity-60"
									>
										<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--accent)]">
											<Home className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-semibold text-[var(--text)]">
												{t("browse_location.home_location_label")}
											</p>
											<p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{homeLocation.name}</p>
										</div>
										{isHomeLocationActive && (
											<div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] py-1 pl-1.5 pr-2.5 text-xs font-bold text-[var(--accent-contrast)] shadow-sm">
												<Check className="h-3.5 w-3.5 shrink-0" />
												{t("browse_location.badge_active")}
											</div>
										)}
									</button>
								)}

								{!isExploreTab && (
									<button
										type="button"
										onClick={() => void handleUseCurrentLocation()}
										disabled={isDetectingLocation || isSaving}
										className="flex w-full items-center gap-4 bg-[var(--surface-2)] p-4 text-left transition hover:bg-[var(--surface-3,var(--surface))] disabled:opacity-60"
									>
										<div
											className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] ${
												currentLocationError ? "text-red-500" : "text-[var(--accent)]"
											}`}
										>
											{isDetectingLocation ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : currentLocationError ? (
												<X className="h-4 w-4" />
											) : (
												<Navigation className="h-4 w-4" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-semibold text-[var(--text)]">
												{isDetectingLocation ? t("browse_location.detecting_location") : t("browse_location.use_current_location")}
											</p>
											<p
												className={`mt-0.5 text-xs ${
													currentLocationError ? "text-red-500" : "truncate text-[var(--text-muted)]"
												}`}
											>
												{currentLocationError
													? currentLocationError
													: useAutoLocation && locationName
														? locationName
														: t("browse_location.panel_subtitle")}
											</p>
										</div>
										{useAutoLocation && !isDetectingLocation && !currentLocationError && (
											<div className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent)] py-1 pl-1.5 pr-2.5 text-xs font-bold text-[var(--accent-contrast)] shadow-sm">
												<Check className="h-3.5 w-3.5 shrink-0" />
												{t("browse_location.badge_active")}
											</div>
										)}
									</button>
								)}

								{savedLocations.map((location) => (
									<SavedLocationRow
										key={location.id}
										location={location}
										isActive={
											isExploreTab
												? exploreLocation?.geohash === location.geohash
												: !useAutoLocation && geohash === location.geohash
										}
										activeColor={isExploreTab ? EXPLORE_COLOR : "var(--accent)"}
										disabled={isSaving}
										onApply={() => handleApplySavedLocation(location)}
										onDelete={() => handleDeleteSavedLocation(location.id)}
									/>
								))}
							</div>
						</div>
						)}

						{/* Location search: separated from quick picks above as its own group */}
						<div className="space-y-3">
						<p className="px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
							{t("browse_location.location_search")}
						</p>

						{/* Search bar + results, attached as one dropdown-style card */}
						<div
							className={`overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] transition ${
								isExploreTab ? "focus-within:border-[#3b82f6]" : "focus-within:border-[var(--accent)]"
							}`}
						>
							<div className="relative">
								<Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
								<input
									ref={searchInputRef}
									type="text"
									value={locationQuery}
									onChange={(e) => setLocationQuery(e.target.value)}
									placeholder={t("browse_location.search_placeholder")}
									className="h-12 w-full bg-transparent pl-10 pr-10 text-sm text-[var(--text)] outline-none"
								/>
								{isSearchingLocation ? (
									<Loader2 className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
								) : locationQuery ? (
									<button
										type="button"
										onClick={clearSearch}
										className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] transition hover:text-[var(--text)]"
									>
										<X className="h-3.5 w-3.5" />
									</button>
								) : null}
							</div>

							{isSearching ? (
								locationResults.length > 0 ? (
									<div className="max-h-64 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
										{locationResults.map((result) => (
											<button
												key={`${result.lat}:${result.lon}`}
												type="button"
												onClick={() => handleSelectSearchResult(result)}
												className="flex w-full items-center gap-3.5 bg-[var(--surface-2)] px-4 py-4 text-left transition hover:bg-[var(--surface-3,var(--surface))] active:bg-[var(--surface)]"
											>
												<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--text-muted)]">
													<MapPin className="h-3.5 w-3.5" />
												</div>
												<span className="text-sm text-[var(--text)] line-clamp-2">
													{(result.address && formatNominatimAddress(result.address, result.display_name)) ?? result.display_name}
												</span>
											</button>
										))}
									</div>
								) : !isSearchingLocation ? (
									<p className="border-t border-[var(--border)] bg-[var(--surface-2)] px-4 py-4 text-sm text-[var(--text-muted)]">
										{t("browse_location.error_search_failed_general")}
									</p>
								) : null
							) : null}
						</div>

						{/* Map + current selection — one container, so the map and its
						    confirmation/save details read as a single unit instead of
						    two separate cards. */}
						{!isSearching && (
							<div className="overflow-hidden rounded-2xl border border-[var(--border)]">
								{mapPickerError ? (
									<p className="px-4 py-4 text-sm text-[var(--text-muted)]">{mapPickerError}</p>
								) : (
									<MapLocationPicker
										selectedLocation={selectedLocation}
										onPick={handleMapPick}
										onError={setMapPickerError}
										defaultZoom={11}
										initialCenter={initialCenter}
										pinColor={isExploreTab ? EXPLORE_COLOR : undefined}
									/>
								)}

								{/* Only appears once you've tapped a new spot on the map above
								    that differs from your active location — nothing to confirm
								    (and no extra section) if it just matches what's already
								    active, since that's already reflected above. */}
								{selectedLocation && !isActiveLocationSelected && (
									<div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4">
										<div className="flex items-center gap-3">
											<div
												className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
													isExploreTab ? "text-white" : "text-[var(--accent-contrast)]"
												}`}
												style={{ backgroundColor: isExploreTab ? EXPLORE_COLOR : "var(--accent)" }}
											>
												<MapPin className="h-4 w-4" />
											</div>
											<div className="min-w-0 flex-1">
												<p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
													{t("browse_location.new_pick_heading")}
												</p>
												<p className="mt-0.5 truncate text-sm font-semibold text-[var(--text)]">{selectedLocation.label}</p>
											</div>
											{!isExploreTab && (
												<button
													type="button"
													onClick={() => void handleSetAsHome(selectedLocation.lat, selectedLocation.lon)}
													disabled={updateHomeLocation.isPending}
													aria-label={t("browse_location.set_as_home")}
													className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] disabled:opacity-60"
												>
													{updateHomeLocation.isPending ? (
														<Loader2 className="h-4 w-4 animate-spin" />
													) : (
														<Home className="h-4 w-4" />
													)}
												</button>
											)}
											<button
												type="button"
												onClick={() => {
													setIsNamingLocation((v) => {
														const next = !v;
														if (next && !newLocationName.trim() && selectedLocation.city) {
															setNewLocationName(selectedLocation.city);
														}
														return next;
													});
												}}
												aria-label={t("browse_location.save_as")}
												style={
													isNamingLocation
														? { borderColor: isExploreTab ? EXPLORE_COLOR : "var(--accent)", backgroundColor: isExploreTab ? EXPLORE_COLOR : "var(--accent)" }
														: undefined
												}
												className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition ${
													isNamingLocation
														? isExploreTab
															? "text-white"
															: "text-[var(--accent-contrast)]"
														: "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
												}`}
											>
												<Bookmark className="h-4 w-4" />
											</button>
										</div>

										{isNamingLocation && (
											<div className="mt-3 flex gap-2">
												<input
													type="text"
													autoFocus
													value={newLocationName}
													onChange={(e) => setNewLocationName(e.target.value)}
													onKeyDown={(e) => { if (e.key === "Enter") handleSaveCurrentAsNamedLocation(); }}
													placeholder={t("browse_location.save_as_placeholder")}
													className={`h-11 min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] outline-none transition ${
														isExploreTab ? "focus:border-[#3b82f6]" : "focus:border-[var(--accent)]"
													}`}
												/>
												<button
													type="button"
													disabled={!newLocationName.trim()}
													onClick={handleSaveCurrentAsNamedLocation}
													style={{ backgroundColor: isExploreTab ? EXPLORE_COLOR : "var(--accent)" }}
													className={`shrink-0 rounded-xl px-4 text-sm font-bold transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50 ${
														isExploreTab ? "text-white" : "text-[var(--accent-contrast)]"
													}`}
												>
													{t("travel_plans.save")}
												</button>
											</div>
										)}

										<button
											type="button"
											disabled={isSaving}
											onClick={() =>
												isExploreTab
													? confirmExplore(selectedLocation.lat, selectedLocation.lon, selectedLocation.label)
													: void saveAndClose(selectedLocation.lat, selectedLocation.lon, selectedLocation.label)
											}
											style={isExploreTab ? { backgroundColor: EXPLORE_COLOR } : undefined}
											className={`relative mt-3 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-sm font-bold shadow-md transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 ${
												isExploreTab ? "text-white" : "bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[var(--accent)]/30"
											}`}
										>
											{isSaving ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<>
													<Check className="h-4 w-4" />
													{isExploreTab
														? t("browse_location.start_explore")
														: t("browse_location.use_selected_location")}
												</>
											)}
										</button>
									</div>
								)}
							</div>
						)}
						</div>

						{/* Profile mode: Auto/Home/Visiting — secondary, low-frequency
						    setting, kept at the very bottom out of the way of the
						    location-picking flow above. Only applies to your real
						    location, not the explore tab's local-only browsing. Saves
						    immediately on tap, same as everything else in this overlay. */}
						{!isExploreTab && (
							<div>
								<p className="mb-2 px-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
									{t("profile_editor.sections.visiting_mode.title")}
								</p>
								<div
									role="radiogroup"
									aria-label={t("profile_editor.sections.visiting_mode.title")}
									className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)]"
								>
									{VISITING_MODES.map((mode) => {
										const active = mode === visitingMode;
										const Icon = visitingModeIcons[mode];
										const modeKey = getVisitingModeTranslationKey(mode);
										return (
											<button
												key={mode}
												type="button"
												role="radio"
												aria-checked={active}
												disabled={visitingModeDisabled}
												onClick={() => void handleVisitingModeChange(mode)}
												className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
													active
														? "bg-[var(--accent)] text-[var(--accent-contrast)]"
														: "hover:bg-[var(--surface-2)]"
												}`}
											>
												<span
													className={`shrink-0 rounded-2xl p-2.5 ${
														active
															? "bg-[var(--surface)] text-[var(--accent)]"
															: "bg-[var(--surface-2)] text-[var(--text-muted)]"
													}`}
												>
													<Icon className="h-5 w-5" strokeWidth={2.1} />
												</span>
												<span className="min-w-0 flex-1">
													<span className="block text-sm font-semibold leading-snug">
														{t(`profile_editor.sections.visiting_mode.options.${modeKey}.label`)}
													</span>
													<span
														className={`mt-0.5 block text-xs leading-relaxed ${
															active ? "text-[var(--accent-contrast)]/75" : "text-[var(--text-muted)]"
														}`}
													>
														{t(`profile_editor.sections.visiting_mode.options.${modeKey}.description`)}
													</span>
												</span>
												<span
													className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
														active
															? "border-[var(--accent-contrast)] bg-[var(--accent-contrast)]"
															: "border-[var(--border)]"
													}`}
												>
													{active && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
												</span>
											</button>
										);
									})}
								</div>
								{isLoadingVisitingMode || isVisitingModeError ? (
									<p
										className={`mt-2 px-1 text-xs leading-relaxed ${
											isVisitingModeError ? "text-red-300" : "text-[var(--text-muted)]"
										}`}
									>
										{isVisitingModeError
											? t("profile_editor.sections.visiting_mode.error")
											: t("profile_editor.sections.visiting_mode.loading")}
									</p>
								) : null}
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
