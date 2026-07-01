/**
 * geocoding.ts — reverse-geocodes a geohash into a human-readable place
 * name (e.g. "Berlin, Germany") via Nominatim, the same free OSM-backed
 * service already used for forward search in LocationOverlay.tsx.
 *
 * Results are cached by geohash for the lifetime of the session — travel
 * plan geohashes are low-cardinality (the same handful of places tend to
 * recur) and Nominatim's usage policy expects clients to cache rather than
 * re-request the same lookup.
 */

import { decodeGeohash } from "../../../utils/geohash";
import { appLog } from "../../../utils/logger";

const cache = new Map<string, Promise<{ label: string | null; city: string | null }>>();

export type NominatimAddress = {
	road?: string;
	house_number?: string;
	neighbourhood?: string;
	suburb?: string;
	borough?: string;
	city_district?: string;
	city?: string;
	town?: string;
	village?: string;
	municipality?: string;
	state?: string;
	country?: string;
};

type NominatimReverseResponse = {
	address?: NominatimAddress;
	display_name?: string;
};

/** city/town/village/municipality, whichever Nominatim populated — shared by the label formatter and the "save as" default name. */
export function getCityFromAddress(address: NominatimAddress): string | null {
	return address.city ?? address.town ?? address.village ?? address.municipality ?? null;
}

/**
 * "Street Housenumber, City, District" — street+number leads (most specific,
 * and the two read naturally together), then city, then district last.
 * Reads better than Nominatim's own display_name order (housenumber,
 * street, district, city). Shared between reverse geocoding and forward
 * search results so both render addresses identically.
 */
export function formatNominatimAddress(address: NominatimAddress, fallback: string | null): string | null {
	const street = address.road
		? (address.house_number ? `${address.road} ${address.house_number}` : address.road)
		: null;
	const cityName = getCityFromAddress(address);
	const district = address.neighbourhood ?? address.suburb ?? address.borough ?? address.city_district ?? null;

	const parts = [street, cityName, district].filter(
		(part, index, all): part is string => !!part && all.indexOf(part) === index,
	);
	if (parts.length > 0) {
		return parts.join(", ");
	}
	return address.country ?? fallback;
}

async function fetchReverseGeocode(
	lat: number,
	lon: number,
): Promise<{ label: string | null; city: string | null }> {
	try {
		// zoom=18 (building/street level) — anything coarser collapses picks
		// that are a few streets apart into the same neighbourhood/suburb
		// result, since those fields don't change within a whole district.
		// Only the `road` field changes street-to-street, so resolving that
		// fine is the only way to reflect small map moves.
		const response = await fetch(
			`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lon}`,
			{ headers: { "User-Agent": "Mozilla/5.0 (compatible)" } },
		);
		if (!response.ok) {
			return { label: null, city: null };
		}
		const data = (await response.json()) as NominatimReverseResponse;
		if (!data.address) {
			return { label: data.display_name ?? null, city: null };
		}
		return {
			label: formatNominatimAddress(data.address, data.display_name ?? null),
			city: getCityFromAddress(data.address),
		};
	} catch (error) {
		appLog.warn("[geocoding] reverse lookup failed", error);
		return { label: null, city: null };
	}
}

function resolveGeohash(geohash: string): Promise<{ label: string | null; city: string | null }> {
	const cached = cache.get(geohash);
	if (cached) {
		return cached;
	}

	const run = (async () => {
		try {
			const decoded = decodeGeohash(geohash);
			const lat = (decoded.lat[0] + decoded.lat[1]) / 2;
			const lon = (decoded.lon[0] + decoded.lon[1]) / 2;
			return await fetchReverseGeocode(lat, lon);
		} catch (error) {
			appLog.warn(`[geocoding] failed to decode geohash ${geohash}`, error);
			return { label: null, city: null };
		}
	})();

	cache.set(geohash, run);
	return run;
}

/** Resolves a geohash to a "City, Country"-style label, or null if it can't be resolved. Cached per geohash for the session. */
export async function reverseGeocodeGeohash(geohash: string): Promise<string | null> {
	const { label } = await resolveGeohash(geohash);
	return label;
}

/** Resolves a geohash to just its city name, or null if it can't be resolved. Shares the reverse-geocode cache, so this is free if the label was already resolved for the same geohash. */
export async function reverseGeocodeCityForGeohash(geohash: string): Promise<string | null> {
	const { city } = await resolveGeohash(geohash);
	return city;
}
