import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useEffectiveColorScheme } from "../../../../hooks/useEffectiveColorScheme";
import type { SelectedLocation } from "../../GridPage.types";
import { applyDarkMapTheme, createPinMarkerElement, getMapStyleUrl, relaxRoadZoomThresholds } from "./mapStyles";

type MapLocationPickerProps = {
	selectedLocation: Pick<SelectedLocation, "lat" | "lon"> | null;
	onPick: (lat: number, lon: number) => void;
	onError: (message: string) => void;
	className?: string;
	defaultZoom?: number;
	initialCenter?: [number, number];
};

export function MapLocationPicker({
	selectedLocation,
	onPick,
	onError,
	className = "h-72 w-full",
	defaultZoom = 18,
	initialCenter = [20, 0],
}: MapLocationPickerProps) {
	const { t } = useTranslation();
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const maplibreRef = useRef<any>(null);
	const scheme = useEffectiveColorScheme();

	// Kept current via refs so the map-init effect below can stay mount-only
	// instead of tearing down and recreating the whole map on every parent re-render.
	const onPickRef = useRef(onPick);
	onPickRef.current = onPick;
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	const schemeRef = useRef(scheme);
	schemeRef.current = scheme;

	useEffect(() => {
		let mounted = true;

		const initMap = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");

				if (!mounted || !mapContainerRef.current || mapRef.current) return;

				maplibreRef.current = maplibregl;

				const map = new maplibregl.Map({
					container: mapContainerRef.current,
					style: getMapStyleUrl(scheme),
					center: selectedLocation ? [selectedLocation.lon, selectedLocation.lat] : initialCenter,
					zoom: selectedLocation ? defaultZoom : 2,
					attributionControl: false,
				});

				map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
				map.on("click", (event: any) => { onPickRef.current(event.lngLat.lat, event.lngLat.lng); });
				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					if (schemeRef.current === "dark") applyDarkMapTheme(map);
				});
				mapRef.current = map;

				if (selectedLocation) {
					markerRef.current = new maplibregl.Marker({ element: createPinMarkerElement(), anchor: "bottom" })
						.setLngLat([selectedLocation.lon, selectedLocation.lat])
						.addTo(map);
				}
			} catch {
				onErrorRef.current(t("browse_location.map_picker_error_load"));
			}
		};

		void initMap();

		return () => {
			mounted = false;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
				markerRef.current = null;
			}
		};
		// Map is created once; theme/location updates are applied to the live instance below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		map.setStyle(getMapStyleUrl(scheme));
	}, [scheme]);

	useEffect(() => {
		const map = mapRef.current;
		const maplibregl = maplibreRef.current;
		if (!map || !maplibregl || !selectedLocation) return;

		const lngLat: [number, number] = [selectedLocation.lon, selectedLocation.lat];

		if (markerRef.current) {
			markerRef.current.setLngLat(lngLat);
		} else {
			markerRef.current = new maplibregl.Marker({ element: createPinMarkerElement(), anchor: "bottom" })
				.setLngLat(lngLat)
				.addTo(map);
		}

		map.jumpTo({ center: lngLat, zoom: Math.max(defaultZoom, map.getZoom()) });
		map.resize();
	}, [defaultZoom, selectedLocation]);

	return <div ref={mapContainerRef} className={className} />;
}
