import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../contexts/PreferencesContext";
import { encodeGeohash } from "../../utils/geohash";
import {
	geocodeResultSchema,
	type GeocodeResult,
	type SelectedLocation,
} from "./GridPage.types";
import { LocationSettingsPanel } from "./gridpage/components/LocationSettingsPanel";

export function BrowseLocationPage() {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { setPreferences } = usePreferences();
	const [isDetectingLocation, setIsDetectingLocation] = useState(false);
	const [locationQuery, setLocationQuery] = useState("");
	const [isSearchingLocation, setIsSearchingLocation] = useState(false);
	const [locationResults, setLocationResults] = useState<GeocodeResult[]>([]);
	const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
	const [mapPickerError, setMapPickerError] = useState<string | null>(null);
	const [selectedLocation, setSelectedLocation] =
		useState<SelectedLocation | null>(null);
	const [locationError, setLocationError] = useState<string | null>(null);

	const updateLocationPreference = async (
		lat: number,
		lon: number,
		label?: string,
	) => {
		const nextGeohash = encodeGeohash(lat, lon);
		const finalLabel = label ?? t("browse_location.lat_lon_label", { lat: lat.toFixed(4), lon: lon.toFixed(4) });
		await setPreferences({
			geohash: nextGeohash,
			locationName: finalLabel
		});
		setSelectedLocation({
			lat,
			lon,
			label: finalLabel,
		});
		setMapPickerError(null);
		setLocationError(null);
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
			);
		} catch {
			setLocationError(t("browse_location.error_access"));
		} finally {
			setIsDetectingLocation(false);
		}
	};

	const performSearch = async (query: string) => {
		if (!query) {
			setLocationResults([]);
			return;
		}

		setIsSearchingLocation(true);

		try {
			const response = await fetch(
				`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(
					query,
				)}`,
			);

			if (!response.ok) {
				throw new Error("Failed to search location");
			}

			const parsed = z.array(geocodeResultSchema).parse(await response.json());
			setLocationResults(parsed);
			setLocationError(null);
		} catch {
			setLocationError(t("browse_location.error_search_failed"));
		} finally {
			setIsSearchingLocation(false);
		}
	};

	useEffect(() => {
		const timer = setTimeout(() => {
			const query = locationQuery.trim();
			void performSearch(query);
		}, 300);

		return () => clearTimeout(timer);
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
				/>
			</div>
		</section>
	);
}
