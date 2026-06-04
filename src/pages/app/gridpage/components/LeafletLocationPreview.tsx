import { useEffect, useRef } from "react";

type Props = {
	lat: number;
	lon: number;
	className?: string;
};

export function LeafletLocationPreview({ lat, lon, className = "h-32 w-full" }: Props) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<any>(null);

	useEffect(() => {
		let mounted = true;

		const init = async () => {
			try {
				const L = await import("leaflet");
				await import("leaflet/dist/leaflet.css");
				if (!mounted || !containerRef.current || mapRef.current) return;

				const map = L.map(containerRef.current, {
					zoomControl: false,
					dragging: false,
					scrollWheelZoom: false,
					doubleClickZoom: false,
					boxZoom: false,
					keyboard: false,
					touchZoom: false,
					attributionControl: false,
				}).setView([lat, lon], 15);

				L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

				const accentColor = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ffcc01";
				const icon = L.divIcon({
					className: "",
					html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${accentColor}" stroke="${accentColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white" stroke="white"/></svg>`,
					iconSize: [28, 28],
					iconAnchor: [14, 28],
				});
				L.marker([lat, lon], { icon }).addTo(map);

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
	}, [lat, lon]);

	return <div ref={containerRef} className={className} style={{ isolation: "isolate" }} />;
}
