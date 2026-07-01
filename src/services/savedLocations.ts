import { appLog } from "../utils/logger";
import { geohashSchema } from "../utils/geohash";
import z from "zod";
import {
	deleteSavedLocationRow,
	getAllSavedLocations,
	insertSavedLocation,
} from "./chatDb";

const savedLocationSchema = z.object({
	id: z.string(),
	name: z.string(),
	geohash: geohashSchema,
	lat: z.number(),
	lon: z.number(),
});

export type SavedLocation = z.infer<typeof savedLocationSchema>;

export async function loadSavedLocations(): Promise<SavedLocation[]> {
	try {
		const rows = await getAllSavedLocations();
		const result: SavedLocation[] = [];
		for (const row of rows) {
			const parsedItem = savedLocationSchema.safeParse(row);
			if (parsedItem.success) {
				result.push(parsedItem.data);
			}
		}
		return result;
	} catch (error) {
		appLog.error("[savedLocations] loadSavedLocations failed", error);
		return [];
	}
}

export async function addSavedLocation(input: {
	name: string;
	geohash: string;
	lat: number;
	lon: number;
}): Promise<SavedLocation[]> {
	const entry: SavedLocation = {
		id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
		name: input.name.trim(),
		geohash: input.geohash,
		lat: input.lat,
		lon: input.lon,
	};
	const rows = await insertSavedLocation(entry);
	return rows;
}

export async function deleteSavedLocation(id: string): Promise<SavedLocation[]> {
	const rows = await deleteSavedLocationRow(id);
	return rows;
}
