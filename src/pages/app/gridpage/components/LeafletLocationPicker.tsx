import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SelectedLocation } from "../../GridPage.types";

type LeafletLocationPickerProps = {
	selectedLocation: Pick<SelectedLocation, "lat" | "lon"> | null;
	onPick: (lat: number, lon: number) => void;
	onError: (message: string) => void;
	className?: string;
	defaultZoom?: number;
	initialCenter?: [number, number];
};

function createPinIcon(L: any) {
	const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ffcc01";
	return L.divIcon({
		className: "",
		html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${accentColor}" stroke="${accentColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white" stroke="white"/></svg>`,
		iconSize: [28, 28],
		iconAnchor: [14, 28],
	});
}

export function LeafletLocationPicker({
	selectedLocation,
	onPick,
	onError,
	className = "h-72 w-full",
	defaultZoom = 18,
	initialCenter = [20, 0],
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
						: initialCenter,
					selectedLocation ? defaultZoom : 2,
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
					markerRef.current = L.marker(
						[selectedLocation.lat, selectedLocation.lon],
						{ icon: createPinIcon(L) },
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
	}, [defaultZoom, onError, onPick, selectedLocation, t]);

	useEffect(() => {
		const map = mapRef.current;
		const L = leafletRef.current;

		if (!map || !L || !selectedLocation) {
			return;
		}

		if (markerRef.current) {
			markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lon]);
		} else {
			markerRef.current = L.marker(
				[selectedLocation.lat, selectedLocation.lon],
				{ icon: createPinIcon(L) },
			).addTo(map);
		}

		map.setView(
			[selectedLocation.lat, selectedLocation.lon],
			Math.max(defaultZoom, map.getZoom()),
		);

		map.invalidateSize();
	}, [defaultZoom, selectedLocation]);

	return <div ref={mapContainerRef} className={className} />;
}
