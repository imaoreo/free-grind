/**
 * Free, key-less CARTO basemap styles (vector, MapLibre GL JSON).
 * https://carto.com/basemaps — usable without authentication for both
 * the light ("voyager") and dark ("dark-matter") themes used across the app.
 */
export const MAP_STYLE_LIGHT = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
export const MAP_STYLE_DARK = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export function getMapStyleUrl(scheme: "light" | "dark"): string {
	return scheme === "dark" ? MAP_STYLE_DARK : MAP_STYLE_LIGHT;
}

/**
 * CARTO's dark-matter style defaults to a near-monochrome black map where
 * roads/rail barely register. Re-tint land/water/roads with a Google
 * Maps-style dark palette (blue water, teal-green land, light visible
 * roads) instead. Call after the style has (re)loaded, e.g. on the
 * MapLibre "style.load" event.
 */
export function applyDarkMapTheme(map: any): void {
	const LAND = "#1b2e33";
	const PARK = "#163328";
	const WATER = "#0d1f30";
	const ROAD_CASE = "#0f1d20";
	const ROAD_FILL = "#5c6f74";
	const ROAD_MINOR_FILL = "#445256";
	const RAIL = "#62737a";
	const RAIL_DASH = "#4a565a";

	try {
		for (const layer of map.getStyle()?.layers ?? []) {
			const id: string = layer.id;

			if (layer.type === "background") {
				map.setPaintProperty(id, "background-color", LAND);
			} else if (layer.type === "fill") {
				if (/^park/.test(id)) {
					map.setPaintProperty(id, "fill-color", PARK);
				} else if (id === "landcover" || id === "landuse") {
					map.setPaintProperty(id, "fill-color", LAND);
				} else if (/water/i.test(id)) {
					map.setPaintProperty(id, "fill-color", WATER);
				}
			} else if (layer.type === "line" && layer["source-layer"] === "transportation") {
				if (/rail/.test(id)) {
					map.setPaintProperty(id, "line-color", /dash/.test(id) ? RAIL_DASH : RAIL);
				} else if (/case/.test(id)) {
					map.setPaintProperty(id, "line-color", ROAD_CASE);
				} else if (/service|path/.test(id)) {
					map.setPaintProperty(id, "line-color", ROAD_MINOR_FILL);
				} else {
					map.setPaintProperty(id, "line-color", ROAD_FILL);
				}
			}
		}
	} catch {
		// best-effort theming; skip if the upstream style schema changed
	}
}

/**
 * CARTO's basemap styles only switch on street-name labels quite late
 * (minor roads need zoom 16+), and house numbers later still (zoom 17+,
 * the "housenumber" layer). Lower both thresholds so they become visible
 * sooner while zooming in — useful for picking a precise location. Call
 * after the style has (re)loaded, e.g. on the MapLibre "style.load" event.
 */
export function relaxRoadZoomThresholds(map: any): void {
	try {
		for (const layer of map.getStyle()?.layers ?? []) {
			if (layer.type !== "symbol") continue;
			if (/^roadname_/.test(layer.id) && typeof layer.minzoom === "number") {
				map.setLayerZoomRange(layer.id, Math.max(0, layer.minzoom - 2), layer.maxzoom ?? 24);
			} else if (layer.id === "housenumber" || layer["source-layer"] === "housenumber") {
				// The underlying tile source's real data tops out at zoom 14
				// (everything past that is the same tile overzoomed), so 14 is
				// the earliest this layer can show anything regardless of the
				// style's declared minzoom. Its default text-size is also a
				// zoom-stop function starting at 17 (9px), which clamps to
				// that same tiny size for any zoom below it — fix the size too
				// so house numbers are actually legible once they appear.
				map.setLayerZoomRange(layer.id, 14, layer.maxzoom ?? 24);
				try {
					map.setLayoutProperty(layer.id, "text-size", 11);
				} catch {
					// non-fatal — zoom range relaxation above still applies
				}
			}
		}
	} catch {
		// best-effort tweak; skip if the upstream style schema changed
	}
}

export function createPinMarkerElement(accentColor?: string): HTMLDivElement {
	const color =
		accentColor ||
		getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
		"#ffcc01";

	const el = document.createElement("div");
	el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="white" stroke="white"/></svg>`;
	return el;
}
