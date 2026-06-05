import { appLog } from "../utils/logger";
import { encodeGeohash } from "../utils/geohash";

export const SAVED_LOCATIONS_STORAGE_KEY = "fg-saved-locations";
export const SAVED_LOCATIONS_UPDATED_EVENT = "fg:saved-locations-updated";

export interface SavedLocation {
	id: string;
	name: string;
	latitude: number;
	longitude: number;
	geohash: string;
}

export function loadSavedLocations(): SavedLocation[] {
	if (typeof window === "undefined") {
		return [];
	}

	try {
		const stored = window.localStorage.getItem(SAVED_LOCATIONS_STORAGE_KEY);
		if (!stored) {
			return [];
		}
		const parsed = JSON.parse(stored);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed.filter((item): item is SavedLocation => {
			const raw = item as Record<string, any>;
			return (
				!!item &&
				typeof item === "object" &&
				typeof raw.id === "string" &&
				typeof raw.name === "string" &&
				typeof raw.latitude === "number" &&
				typeof raw.longitude === "number" &&
				typeof raw.geohash === "string"
			);
		});
	} catch (error) {
		appLog.error("[savedLocations] loadSavedLocations failed", error);
		return [];
	}
}

export function saveSavedLocations(locations: SavedLocation[]): SavedLocation[] {
	if (typeof window === "undefined") {
		return locations;
	}
	try {
		window.localStorage.setItem(SAVED_LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
		window.dispatchEvent(
			new CustomEvent<SavedLocation[]>(SAVED_LOCATIONS_UPDATED_EVENT, {
				detail: locations,
			}),
		);
	} catch (error) {
		appLog.error("[savedLocations] saveSavedLocations failed", error);
	}
	return locations;
}

export function addSavedLocation(
	locations: SavedLocation[],
	name: string,
	latitude: number,
	longitude: number,
): SavedLocation[] {
	const geohash = encodeGeohash(latitude, longitude);
	const newLocation: SavedLocation = {
		id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
		name: name.trim(),
		latitude,
		longitude,
		geohash,
	};
	const updated = [...locations, newLocation];
	return saveSavedLocations(updated);
}

export function deleteSavedLocation(locations: SavedLocation[], id: string): SavedLocation[] {
	const updated = locations.filter((loc) => loc.id !== id);
	return saveSavedLocations(updated);
}

export function exportLocationsToTxt(locations: SavedLocation[]): string {
	return locations
		.map((loc) => `${loc.name.replace(/\r?\n/g, " ")},${loc.latitude},${loc.longitude}`)
		.join("\n");
}

export function parseLocationsFromTxt(content: string): SavedLocation[] {
	const locations: SavedLocation[] = [];
	const lines = content.split(/\r?\n/g);

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}

		// Find the last two commas to split name, latitude, longitude
		// This is safe even if the name contains commas (e.g. "Paris, France,48.8566,2.3522")
		const lastCommaIndex = trimmed.lastIndexOf(",");
		if (lastCommaIndex === -1) {
			continue;
		}

		const secondToLastCommaIndex = trimmed.lastIndexOf(",", lastCommaIndex - 1);
		if (secondToLastCommaIndex === -1) {
			continue;
		}

		const name = trimmed.substring(0, secondToLastCommaIndex).trim();
		const latStr = trimmed.substring(secondToLastCommaIndex + 1, lastCommaIndex).trim();
		const lonStr = trimmed.substring(lastCommaIndex + 1).trim();

		const latitude = parseFloat(latStr);
		const longitude = parseFloat(lonStr);

		if (isNaN(latitude) || isNaN(longitude)) {
			continue;
		}

		const geohash = encodeGeohash(latitude, longitude);
		locations.push({
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			name: name || `Imported ${latitude.toFixed(4)},${longitude.toFixed(4)}`,
			latitude,
			longitude,
			geohash,
		});
	}

	return locations;
}
