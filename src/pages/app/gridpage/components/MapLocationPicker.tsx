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
	// No default value here on purpose: [20, 0] (Gulf of Guinea) used to be
	// the default, which made an *unset* initialCenter indistinguishable
	// from a genuine "center here" request once destructured — a truthy
	// placeholder array that fooled the zoom-in decision below into zooming
	// in on the middle of the ocean whenever the real center wasn't ready
	// yet. Leaving it undefined when not passed keeps that distinction.
	initialCenter,
}: MapLocationPickerProps) {
	const { t } = useTranslation();
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const markerRef = useRef<any>(null);
	const maplibreRef = useRef<any>(null);
	const resizeObserverRef = useRef<ResizeObserver | null>(null);
	const scheme = useEffectiveColorScheme();

	// Kept current via refs so the map-init effect below can stay mount-only
	// instead of tearing down and recreating the whole map on every parent re-render.
	const onPickRef = useRef(onPick);
	onPickRef.current = onPick;
	const onErrorRef = useRef(onError);
	onErrorRef.current = onError;
	const schemeRef = useRef(scheme);
	schemeRef.current = scheme;
	// Construction itself happens after an async import + two rAFs (see
	// waitForPaint below) — by then the parent may already have re-rendered
	// with a freshly-resolved selectedLocation/initialCenter (e.g. once its
	// own geohash-driven effect fires). Reading through refs at construction
	// time instead of the values closed over when this mount effect was
	// first scheduled means it always uses whatever is current by the time
	// it actually runs, not a stale snapshot from the very first render.
	const selectedLocationRef = useRef(selectedLocation);
	selectedLocationRef.current = selectedLocation;
	const initialCenterRef = useRef(initialCenter);
	initialCenterRef.current = initialCenter;

	useEffect(() => {
		let mounted = true;

		// Waits for the browser to actually paint the current layout (two
		// rAFs, since the first one just schedules a frame that hasn't been
		// painted yet) before measuring the container. The parent overlay is
		// still running its slide-in transform when this effect fires, and
		// maplibre reads container size exactly once at construction — if
		// that read lands mid-animation/pre-layout, the canvas can end up
		// stuck at a stale/zero size despite the CSS box looking correct.
		const waitForPaint = () =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			});

		const initMap = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");
				await waitForPaint();

				if (!mounted || !mapContainerRef.current || mapRef.current) return;

				maplibreRef.current = maplibregl;

				const currentSelectedLocation = selectedLocationRef.current;
				const startCenter = currentSelectedLocation
					? ([currentSelectedLocation.lon, currentSelectedLocation.lat] as [number, number])
					: initialCenterRef.current;
				const map = new maplibregl.Map({
					container: mapContainerRef.current,
					style: getMapStyleUrl(scheme),
					center: startCenter ?? [20, 0],
					// Zoom in whenever we actually know where to center (a picked
					// location, or a passed-in hint like the device's current
					// position) — only fall back to a world view when we truly
					// have nothing to go on.
					zoom: startCenter ? defaultZoom : 2,
					attributionControl: false,
				});

				map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
				map.on("click", (event: any) => { onPickRef.current(event.lngLat.lat, event.lngLat.lng); });
				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					if (schemeRef.current === "dark") applyDarkMapTheme(map);
				});
				// Extra safety net beyond waitForPaint above: re-measure once the
				// map reports itself fully loaded, in case the container's size
				// still wasn't final at construction time.
				map.once("load", () => map.resize());
				mapRef.current = map;

				if (currentSelectedLocation) {
					markerRef.current = new maplibregl.Marker({ element: createPinMarkerElement(), anchor: "bottom" })
						.setLngLat([currentSelectedLocation.lon, currentSelectedLocation.lat])
						.addTo(map);
				}

				// The container can still be mid-transition (e.g. the parent
				// overlay sliding/animating in) when the map reads its size at
				// construction time, leaving the canvas stuck at a stale/zero
				// size and rendering blank. A ResizeObserver catches any size
				// change after the fact — including that animation settling —
				// and tells maplibre to re-measure.
				if (mapContainerRef.current && "ResizeObserver" in window) {
					resizeObserverRef.current = new ResizeObserver(() => {
						mapRef.current?.resize();
					});
					resizeObserverRef.current.observe(mapContainerRef.current);
				}
			} catch {
				onErrorRef.current(t("browse_location.map_picker_error_load"));
			}
		};

		void initMap();

		return () => {
			mounted = false;
			resizeObserverRef.current?.disconnect();
			resizeObserverRef.current = null;
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
