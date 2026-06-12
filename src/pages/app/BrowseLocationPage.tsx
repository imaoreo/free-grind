import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { checkPermissions, requestPermissions, getCurrentPosition } from "@tauri-apps/plugin-geolocation";
import { appLog } from "../../utils/logger";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash, decodeGeohash } from "../../utils/geohash";
import {
	geocodeResultSchema,
	type GeocodeResult,
	type SelectedLocation,
} from "./GridPage.types";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";

export function BrowseLocationPage() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { setPreferences, geohash, locationName } = usePreferences();
	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [lastSearchedQuery, setLastSearchedQuery] = useState("");
	const [selectedLocation, setSelectedLocation] =
		useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

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
		setIsDetectingLocation(true);

		try {
			let permissions = await checkPermissions();
			if (permissions.location !== "granted" && permissions.location !== "denied") {
				permissions = await requestPermissions(["location"]);
			}
			if (permissions.location !== "granted") {
				setLocationError(t("browse_location.error_access"));
				return;
			}

			const position = await getCurrentPosition({
				enableHighAccuracy: true,
				timeout: 12000,
				maximumAge: 20000,
			});

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
			<div className="mx-auto w-full max-w-4xl">
				<header className="mb-4 flex items-center gap-3">
					<button
						type="button"
						onClick={() => navigate("/")}
						className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
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

				<LocationSettingsPanel
					isVisible={true}
					isDetectingLocation={isDetectingLocation}
					onUseCurrentLocation={() => {
						void handleUseCurrentLocation();
					}}
					locationQuery={locationQuery}
					onLocationQueryChange={setLocationQuery}
					isSearchingLocation={isSearchingLocation}

					locationResults={locationResults}
					onChooseLocation={(lat, lon, label) => {
						void updateLocationPreference(lat, lon, label);
					}}
					selectedLocation={selectedLocation}
					isMapPickerOpen={isMapPickerOpen}
					mapPickerError={mapPickerError}
					onToggleMapPicker={() => {
						setMapPickerError(null);
						setIsMapPickerOpen((current) => !current);
					}}
					onMapPick={(lat, lon) => {
						setSelectedLocation({
							lat,
							lon,
							label: t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) }),
						});
					}}
					onMapPickerError={setMapPickerError}
					onUseSelectedLocation={() => {
						if (!selectedLocation) {
							return;
						}

						void updateLocationPreference(
							selectedLocation.lat,
							selectedLocation.lon,
							selectedLocation.label,
						);
					}}
					initialCenter={initialCenter}
				/>
			</div>
		</section>
	);
}
