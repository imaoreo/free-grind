import { useEffect, useRef } from "react";
import { useEffectiveColorScheme } from "../../../../hooks/useEffectiveColorScheme";
import { applyDarkMapTheme, createPinMarkerElement, getMapStyleUrl, relaxRoadZoomThresholds } from "./mapStyles";

type Props = {
	lat: number;
	lon: number;
	className?: string;
};

export function MapLocationPreview({ lat, lon, className = "h-32 w-full" }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);
	const scheme = useEffectiveColorScheme();

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			try {
				const maplibregl = (await import("maplibre-gl")).default;
				await import("maplibre-gl/dist/maplibre-gl.css");
				if (!mounted || !containerRef.current || mapRef.current) return;

				const map = new maplibregl.Map({
					container: containerRef.current,
					style: getMapStyleUrl(scheme),
					center: [lon, lat],
					zoom: 15,
					interactive: false,
					attributionControl: false,
				});

				map.on("style.load", () => {
					relaxRoadZoomThresholds(map);
					if (scheme === "dark") applyDarkMapTheme(map);
				});

				new maplibregl.Marker({ element: createPinMarkerElement(), anchor: "bottom" })
					.setLngLat([lon, lat])
					.addTo(map);

				mapRef.current = map;
			} catch {
				// silently fail
			}
		};

		void init();

		return () => {
			mounted = false;
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, [lat, lon, scheme]);

	return <div ref={containerRef} className={className} style={{ isolation: "isolate" }} />;
}
