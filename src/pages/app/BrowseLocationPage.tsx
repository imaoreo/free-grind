import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import z from "zod";
import { ChevronLeft } from "lucide-react";
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
	const { geohash, setPreferences } = usePreferences();
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
		await setPreferences({ geohash: nextGeohash });
		setSelectedLocation({
			lat,
			lon,
			label: label ?? `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
		});
		setMapPickerError(null);
		setLocationError(null);
	};

	const handleUseCurrentLocation = async () => {
		if (!("geolocation" in navigator)) {
			setLocationError("Geolocation is unavailable on this device.");
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
				"Current location",
			);
		} catch {
			setLocationError(
				"Could not access your location. Check location permissions and try again.",
			);
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
			setLocationError("Location search failed. Try again in a moment.");
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
						aria-label="Back to browse"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div>
						<h1 className="app-title">Browse Location</h1>
						<p className="app-subtitle">Choose where your feed should load from.</p>
					</div>
				</header>

				{locationError ? (
					<p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-muted)]">
						{locationError}
					</p>
				) : null}

				<LocationSettingsPanel
					isVisible={true}
					hasGeohash={Boolean(geohash)}
					isDetectingLocation={isDetectingLocation}
					onUseCurrentLocation={() => {
						void handleUseCurrentLocation();
					}}
					onDone={() => navigate("/")}
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
							label: `Lat ${lat.toFixed(4)}, Lon ${lon.toFixed(4)}`,
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
