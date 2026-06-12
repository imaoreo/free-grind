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

function resolveIsDark(): boolean {
	const scheme = document.documentElement.getAttribute("data-scheme");
	if (scheme === "dark") return true;
	if (scheme === "light") return false;
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getTileLayer(dark: boolean) {
	return dark
		? {
				url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
		  }
		: {
				url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
				attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
		  };
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
	const tileLayerRef = useRef<any>(null);

	useEffect(() => {
		let mounted = true;

		const initMap = async () => {
			try {
				const L = await import("leaflet");
				await import("leaflet/dist/leaflet.css");

				if (!mounted || !mapContainerRef.current || mapRef.current) return;

				leafletRef.current = L;

				const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(
					selectedLocation ? [selectedLocation.lat, selectedLocation.lon] : initialCenter,
					selectedLocation ? defaultZoom : 2,
				);

				const tile = getTileLayer(resolveIsDark());
				tileLayerRef.current = L.tileLayer(tile.url, { attribution: tile.attribution }).addTo(map);

				map.on("click", (event: any) => { onPick(event.latlng.lat, event.latlng.lng); });

				mapRef.current = map;

				if (selectedLocation) {
					markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lon], { icon: createPinIcon(L) }).addTo(map);
				}

				// swap tile layer when the app theme changes
				const observer = new MutationObserver(() => {
					const L2 = leafletRef.current;
					const map2 = mapRef.current;
					if (!L2 || !map2) return;
					if (tileLayerRef.current) { tileLayerRef.current.remove(); }
					const next = getTileLayer(resolveIsDark());
					tileLayerRef.current = L2.tileLayer(next.url, { attribution: next.attribution }).addTo(map2);
				});
				observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-scheme"] });

				// clean up observer on map destroy — store it so we can disconnect
				(map as any)._themeObserver = observer;
			} catch {
				onError(t("browse_location.map_picker_error_load"));
			}
		};

		void initMap();

		return () => {
			mounted = false;
			if (mapRef.current) {
				const observer = (mapRef.current as any)._themeObserver;
				if (observer) observer.disconnect();
				mapRef.current.off();
				mapRef.current.remove();
				mapRef.current = null;
				markerRef.current = null;
				tileLayerRef.current = null;
			}
		};
	}, [defaultZoom, onError, onPick, selectedLocation, t]);

	useEffect(() => {
		const map = mapRef.current;
		const L = leafletRef.current;

		if (!map || !L || !selectedLocation) return;

		if (markerRef.current) {
			markerRef.current.setLatLng([selectedLocation.lat, selectedLocation.lon]);
		} else {
			markerRef.current = L.marker([selectedLocation.lat, selectedLocation.lon], { icon: createPinIcon(L) }).addTo(map);
		}

		map.setView([selectedLocation.lat, selectedLocation.lon], Math.max(defaultZoom, map.getZoom()));
		map.invalidateSize();
	}, [defaultZoom, selectedLocation]);

	return <div ref={mapContainerRef} className={className} />;
}
