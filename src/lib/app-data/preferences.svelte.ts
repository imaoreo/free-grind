import z from "zod";
import { existsAppDataFile, readAppDataFile, writeAppDataFile } from ".";
import { decode, encode } from "@msgpack/msgpack";
import { geohashSchema } from "$lib/api/geohash";

const preferencesSchema = z.object({
	geohash: geohashSchema.nullable(),
});

export async function getPreferences(): Promise<
	z.infer<typeof preferencesSchema>
> {
	if (await existsAppDataFile("preferences.data")) {
		return await readAppDataFile("preferences.data")
			.then(decode)
			.then((data) => preferencesSchema.parse(data));
	} else {
		return {
			geohash: null,
		};
	}
}

export async function setPreferences(
	newValues: Partial<z.infer<typeof preferencesSchema>>,
): Promise<void> {
	const oldValues = await getPreferences();
	const preferences = {
		...oldValues,
		...newValues,
	};
	preferencesSchema.parse(preferences);
	await writeAppDataFile("preferences.data", encode(preferences));
}
