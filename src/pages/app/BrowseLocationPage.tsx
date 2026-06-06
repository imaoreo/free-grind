import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { 
	ChevronLeft, 
	Trash2, 
	Download, 
	Upload, 
	MapPin, 
	Settings, 
	Crosshair, 
	Bookmark, 
	X, 
	Loader2 
} from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { appLog } from "../../utils/logger";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash, decodeGeohash } from "../../utils/geohash";
import {
	geocodeResultSchema,
	type GeocodeResult,
	type SelectedLocation,
} from "./GridPage.types";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";
import {
	loadSavedLocations,
	addSavedLocation,
	deleteSavedLocation,
	exportLocationsToTxt,
	parseLocationsFromTxt,
	saveSavedLocations,
	type SavedLocation,
} from "../../services/savedLocations";

export function BrowseLocationPage() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { setPreferences, geohash, locationName } = usePreferences();
	
	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [selectedLocation, setSelectedLocation] =
		useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

	const [savedLocations, setSavedLocations] = useState<SavedLocation[]>(() => loadSavedLocations());
	const [newLocationName, setNewLocationName] = useState("");
	const [isImporting, setIsImporting] = useState(false);
	const importInputRef = useRef<HTMLInputElement | null>(null);
	const [isPresetsExpanded, setIsPresetsExpanded] = useState(false);
	
	// Modal states
	const [showSaveModal, setShowSaveModal] = useState(false);
	const [showManageModal, setShowManageModal] = useState(false);

	const handleSaveCurrentLocation = () => {
		if (!selectedLocation || !newLocationName.trim()) {
			return;
		}
		const updated = addSavedLocation(
			savedLocations,
			newLocationName,
			selectedLocation.lat,
			selectedLocation.lon,
		);
		setSavedLocations(updated);
		setNewLocationName("");
		toast.success(t("browse_location.save_success", { defaultValue: "Location saved successfully!" }));
	};

	const handleDeleteLocation = (id: string) => {
		const updated = deleteSavedLocation(savedLocations, id);
		setSavedLocations(updated);
		toast.success(t("browse_location.delete_success", { defaultValue: "Location deleted." }));
	};

	const handleExportLocations = () => {
		const content = exportLocationsToTxt(savedLocations);
		if (!content || savedLocations.length === 0) {
			toast.error(t("browse_location.export_empty", { defaultValue: "No saved locations to export." }));
			return;
		}

		const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `free-grind-saved-locations-${new Date().toISOString().slice(0, 10)}.txt`;
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
		toast.success(t("browse_location.export_success", { defaultValue: "Locations exported successfully!" }));
	};

	const handleImportClick = () => {
		importInputRef.current?.click();
	};

	const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const imported = parseLocationsFromTxt(content);
			if (imported.length === 0) {
				toast.error(t("browse_location.import_empty", { defaultValue: "No valid locations found in that file." }));
				return;
			}

			const updated = saveSavedLocations(imported);
			setSavedLocations(updated);
			toast.success(t("browse_location.import_success", { defaultValue: "Locations imported successfully!" }));
		} catch {
			toast.error(t("browse_location.import_error", { defaultValue: "Failed to import locations." }));
		} finally {
			setIsImporting(false);
		}
	};

	const initialCenter = (() => {
		if (geohash) {
			try {
				const decoded = decodeGeohash(geohash);
				return [
					(decoded.lat[0] + decoded.lat[1]) / 2,
					(decoded.lon[0] + decoded.lon[1]) / 2,
				] as [number, number];
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
				setSelectedLocation({
					lat,
					lon,
					label: locationName ?? t("browse_location.current_location_label"),
				});
			} catch (e) {
				appLog.error("Failed to decode geohash from preferences", e);
			}
		}
	}, [geohash, locationName, t]);

	const updateLocationPreference = async (
		lat: number,
		lon: number,
		label?: string,
		isAuto?: boolean,
	) => {
		const nextGeohash = encodeGeohash(lat, lon);
		const finalLabel = label ?? t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		await setPreferences({
			geohash: nextGeohash,
			locationName: finalLabel,
			useAutoLocation: isAuto ?? false
		});
		setSelectedLocation({
			lat,
			lon,
			label: finalLabel,
		});
		setMapPickerError(null);
		setLocationError(null);
		navigate("/");
	};

	const handleUseCurrentLocation = async () => {
		if (!("geolocation" in navigator)) {
			setLocationError(t("browse_location.error_geolocation"));
			return;
		}

		setIsDetectingLocation(true);

		try {
			const position = await new Promise<GeolocationPosition>(
				(resolve, reject) => {
					navigator.geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true,
						timeout: 12000,
						maximumAge: 20000,
					});
				},
			);

			await updateLocationPreference(
				position.coords.latitude,
				position.coords.longitude,
				t("browse_location.current_location_label"),
				true,
			);
		} catch (e) {
			appLog.error("Geolocation failed", e);
			setLocationError(t("browse_location.error_access"));
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const performSearch = async (query: string, signal?: AbortSignal) => {
		if (!query || query === lastSearchedQuery) {
			setIsSearchingLocation(false);
			return;
		}

		setLastSearchedQuery(query);
		setIsSearchingLocation(true);

		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
					query,
				)}`,
				{
					signal,
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
					},
				},
			);

			if (!response.ok) {
				throw new Error("Failed to search location");
			}

			const parsed = z.array(geocodeResultSchema).parse(await response.json());
			setLocationResults(parsed);
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

		if (query.length < 3) {
			setLocationResults([]);
			setIsSearchingLocation(false);
			setLastSearchedQuery("");
			return;
		}

		const controller = new AbortController();
		const timer = setTimeout(() => {
			void performSearch(query, controller.signal);
		}, 800);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	}, [locationQuery]);

	return (
		<section className="app-screen">
			<div className="mx-auto w-full max-w-4xl flex flex-col min-h-screen pb-16">
				<header className="mb-4 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate("/")}
						className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] cursor-pointer"
						aria-label={t("browse_location.back_aria")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div>
						<h1 className="app-title">{t("browse_location.title")}</h1>
						<p className="app-subtitle">{t("browse_location.subtitle")}</p>
					</div>
				</header>

				{locationError ? (
					<p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
						{locationError}
					</p>
				) : null}

				{/* Saved Locations Card */}
				<div className="mb-4 bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border)]">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
							<MapPin className="h-3.5 w-3.5 text-[var(--accent)]" />
							<span>{t("browse_location.presets_title", { defaultValue: "Saved Locations" })}</span>
						</div>

						<div className="flex items-center gap-2">
							{savedLocations.length > 6 && (
								<button
									type="button"
									onClick={() => setIsPresetsExpanded(!isPresetsExpanded)}
									className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--text-muted)] transition cursor-pointer"
								>
									{isPresetsExpanded 
										? t("common.show_less", { defaultValue: "Show Less" })
										: t("common.show_more", { defaultValue: "Show More" })}
								</button>
							)}
							<button
								type="button"
								onClick={() => setShowManageModal(true)}
								className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition hover:text-[var(--text)] hover:border-[var(--text-muted)] cursor-pointer"
								title={t("browse_location.manage_presets", { defaultValue: "Manage Saved Locations" })}
							>
								<Settings className="h-3.5 w-3.5" />
							</button>
						</div>
					</div>

					<div className="flex flex-wrap gap-2 mt-3 transition-all duration-300">
						{savedLocations.length === 0 ? (
							<span className="text-xs text-[var(--text-muted)] italic py-1">
								{t("browse_location.no_presets", { defaultValue: "No saved locations" })}
							</span>
						) : (
							(isPresetsExpanded ? savedLocations : savedLocations.slice(0, 6)).map((loc) => (
								<button
									key={loc.id}
									type="button"
									onClick={() => void updateLocationPreference(loc.latitude, loc.longitude, loc.name)}
									className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text)] transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)] cursor-pointer"
								>
									{loc.name}
								</button>
							))
						)}
					</div>
				</div>

				{/* Unified Settings Panel (Search Input + Results + Always-Visible Map) */}
				<LocationSettingsPanel
					locationQuery={locationQuery}
					onLocationQueryChange={setLocationQuery}
					isSearchingLocation={isSearchingLocation}
					locationResults={locationResults}
					onChooseLocation={(lat, lon, label) => {
						setSelectedLocation({ lat, lon, label });
						setMapPickerError(null);
						setLocationResults([]);
						setLocationQuery("");
					}}
					selectedLocation={selectedLocation}
					onMapPick={(lat, lon) => {
						setSelectedLocation({
							lat,
							lon,
							label: t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) }),
						});
					}}
					onMapPickerError={setMapPickerError}
					mapPickerError={mapPickerError}
					initialCenter={initialCenter}
				/>

				{/* Selected Location Address Card */}
				{selectedLocation && (
					<div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs flex flex-col gap-1.5">
						<span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
							{t("browse_location.selected_location_header", { defaultValue: "Selected Location" })}
						</span>
						<span className="font-medium text-[var(--text)] text-sm leading-snug">{selectedLocation.label}</span>
						<span className="font-mono text-[var(--text-muted)] text-[10px]">
							{selectedLocation.lat.toFixed(6)}, {selectedLocation.lon.toFixed(6)}
						</span>
					</div>
				)}

				{/* Unified Bottom Action Row */}
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={handleUseCurrentLocation}
						disabled={isDetectingLocation}
						className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] transition hover:border-[var(--text-muted)] disabled:opacity-60 cursor-pointer"
						title={t("browse_location.use_current_location")}
					>
						{isDetectingLocation ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Crosshair className="h-5 w-5" />
						)}
					</button>

					<button
						type="button"
						disabled={!selectedLocation}
						onClick={() => {
							if (selectedLocation) {
								void updateLocationPreference(
									selectedLocation.lat,
									selectedLocation.lon,
									selectedLocation.label,
								);
							}
						}}
						className="flex-1 inline-flex h-12 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-sm font-semibold transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
					>
						{t("browse_location.use_selected_location")}
					</button>

					{selectedLocation && (
						<button
							type="button"
							onClick={() => {
								setNewLocationName("");
								setShowSaveModal(true);
							}}
							className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text)] transition hover:border-[var(--text-muted)] hover:text-[var(--accent)] cursor-pointer"
							title={t("browse_location.save_selected_title", { defaultValue: "Save Location" })}
						>
							<Bookmark className="h-5 w-5" />
						</button>
					)}
				</div>
			</div>

			{/* Modal: Save Location */}
			{showSaveModal && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
					<div 
						className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
						onClick={() => setShowSaveModal(false)}
					/>
					<div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl animate-modal-in">
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-sm font-bold text-[var(--text)]">
								{t("browse_location.save_selected_title", { defaultValue: "Save Location" })}
							</h3>
							<button
								type="button"
								onClick={() => setShowSaveModal(false)}
								className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition cursor-pointer"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						
						<div className="mb-3 rounded-lg bg-[var(--surface-2)] p-2.5 text-xs text-[var(--text-muted)] flex flex-col gap-0.5">
							<span className="font-semibold text-[var(--text)] truncate">{selectedLocation?.label}</span>
							<span className="font-mono text-[10px]">{selectedLocation?.lat.toFixed(5)}, {selectedLocation?.lon.toFixed(5)}</span>
						</div>

						<div className="flex flex-col gap-3">
							<input
								type="text"
								value={newLocationName}
								onChange={(e) => setNewLocationName(e.target.value)}
								placeholder={t("browse_location.save_placeholder", { defaultValue: "e.g. Home, Office, Paris..." })}
								className="input-field w-full text-xs"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter" && newLocationName.trim()) {
										handleSaveCurrentLocation();
										setShowSaveModal(false);
									}
								}}
							/>
							
							<div className="flex justify-end gap-2 mt-2">
								<button
									type="button"
									onClick={() => setShowSaveModal(false)}
									className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--surface-3)] cursor-pointer"
								>
									{t("common.cancel", { defaultValue: "Cancel" })}
								</button>
								<button
									type="button"
									onClick={() => {
										handleSaveCurrentLocation();
										setShowSaveModal(false);
									}}
									disabled={!newLocationName.trim()}
									className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
								>
									{t("browse_location.save_btn", { defaultValue: "Save Location" })}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Modal: Manage Saved Locations */}
			{showManageModal && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
					<div 
						className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in"
						onClick={() => setShowManageModal(false)}
					/>
					<div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl animate-modal-in flex flex-col max-h-[80vh]">
						<div className="mb-4 flex items-center justify-between">
							<div>
								<h3 className="text-sm font-bold text-[var(--text)]">
									{t("browse_location.manage_title", { defaultValue: "Manage Saved Locations" })}
								</h3>
								<p className="text-[11px] text-[var(--text-muted)]">
									{t("browse_location.manage_subtitle", { defaultValue: "View, delete, or backup your saved locations." })}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setShowManageModal(false)}
								className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] transition cursor-pointer"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{/* Scrollable list */}
						<div className="flex-1 overflow-y-auto min-h-0 pr-1 mb-4 flex flex-col gap-2 scrollbar-none">
							{savedLocations.length === 0 ? (
								<p className="text-xs text-[var(--text-muted)] italic py-8 text-center">
									{t("browse_location.no_saved", { defaultValue: "No saved locations yet." })}
								</p>
							) : (
								savedLocations.map((loc) => (
									<div
										key={loc.id}
										className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 transition hover:border-[var(--text-muted)]"
									>
										<div className="flex-1 min-w-0">
											<p className="text-xs font-semibold truncate text-[var(--text)]">{loc.name}</p>
											<p className="text-[10px] font-mono text-[var(--text-muted)] truncate mt-0.5">
												{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)}
											</p>
										</div>
										<button
											type="button"
											onClick={() => handleDeleteLocation(loc.id)}
											className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-red-500/10 hover:text-red-400 cursor-pointer"
											title={t("browse_location.delete_tooltip", { defaultValue: "Delete location" })}
										>
											<Trash2 className="h-3.5 w-3.5" />
										</button>
									</div>
								))
							)}
						</div>

						{/* Actions */}
						<div className="border-t border-[var(--border)] pt-4 flex flex-wrap gap-2 justify-between items-center">
							<div className="flex gap-2">
								<button
									type="button"
									onClick={handleExportLocations}
									disabled={savedLocations.length === 0}
									className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface-3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
								>
									<Download className="h-3.5 w-3.5" />
									{t("browse_location.export_btn", { defaultValue: "Export Backup" })}
								</button>
								<button
									type="button"
									onClick={handleImportClick}
									disabled={isImporting}
									className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--text)] transition hover:bg-[var(--surface-3)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
								>
									<Upload className="h-3.5 w-3.5" />
									{isImporting
										? t("browse_location.importing_btn", { defaultValue: "Importing..." })
										: t("browse_location.import_btn", { defaultValue: "Import Backup" })}
								</button>
							</div>
							
							<input
								type="file"
								ref={importInputRef}
								onChange={(event) => void handleImportFile(event)}
								accept=".txt,text/plain,application/json"
								className="hidden"
							/>
						</div>
					</div>
				</div>
			)}
		</section>
	);
}
