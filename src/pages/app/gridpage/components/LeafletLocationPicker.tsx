import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SelectedLocation } from "../../GridPage.types";

type LeafletLocationPickerProps = {
	selectedLocation: Pick<SelectedLocation, "lat" | "lon"> | null;
	onPick: (lat: number, lon: number) => void;
	onError: (message: string) => void;
};

export function LeafletLocationPicker({
	selectedLocation,
	onPick,
	onError,
}: LeafletLocationPickerProps) {
	const { t } = useTranslation();
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const leafletRef = useRef<any>(null);

	useEffect(() => {
		let mounted = true;

		const initMap = async () => {
			try {
				const L = await import("leaflet");
				await import("leaflet/dist/leaflet.css");

				if (!mounted || !mapContainerRef.current || mapRef.current) {
					return;
				}

				leafletRef.current = L;

				const map = L.map(mapContainerRef.current, {
					zoomControl: true,
				}).setView(
					selectedLocation
						? [selectedLocation.lat, selectedLocation.lon]
						: [20, 0],
					selectedLocation ? 11 : 2,
				);

				L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
					attribution:
						'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
				}).addTo(map);

				map.on("click", (event: any) => {
					onPick(event.latlng.lat, event.latlng.lng);
				});

				mapRef.current = map;

				if (selectedLocation) {
					markerRef.current = L.circleMarker(
						[selectedLocation.lat, selectedLocation.lon],
						{
							radius: 9,
							color: "#131821",
							fillColor: "#ffcc01",
							fillOpacity: 0.95,
						},
					).addTo(map);
				}
			} catch {
				onError(t("browse_location.map_picker_error_load"));
			}
		};

		void initMap();

		return () => {
			mounted = false;
			if (mapRef.current) {
				mapRef.current.off();
				mapRef.current.remove();
				mapRef.current = null;
				markerRef.current = null;
			}
		};
	}, [onError, onPick, selectedLocation, t]);

	useEffect(() => {
		const map = mapRef.current;
		const L = leafletRef.current;

		if (!map || !L || !selectedLocation) {
			return;
		}

		if (markerRef.current) {
			markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lon]);
		} else {
			markerRef.current = L.circleMarker(
				[selectedLocation.lat, selectedLocation.lon],
				{
					radius: 9,
					color: "#131821",
					fillColor: "#ffcc01",
					fillOpacity: 0.95,
				},
			).addTo(map);
		}

		map.setView(
			[selectedLocation.lat, selectedLocation.lon],
			Math.max(11, map.getZoom()),
		);
	}, [selectedLocation]);

	return <div ref={mapContainerRef} className="h-72 w-full" />;
}
