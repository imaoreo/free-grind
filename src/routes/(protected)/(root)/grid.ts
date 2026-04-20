import z from "zod";
import { fetchRest } from "$lib/api";
import { geohashSchema } from "$lib/api/geohash";
import { mediaHashPublicSchema } from "$lib/api/media";
import { urlSearchParamsCodec } from "$lib/utils";

export const searchProfileSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	displayName: z.string().nullable(),
	age: z.int().nonnegative().nullable(),
	distance: z.number().nullable(),
	medias: z.array(z.object({ mediaHash: mediaHashPublicSchema })).nullable(),
});

export const gridQuerySchema = z.object({
	nearbyGeoHash: geohashSchema,
	exploreGeoHash: geohashSchema.optional(),
	photoOnly: z.boolean().optional(),
	faceOnly: z.boolean().optional(),
	notRecentlyChatted: z.boolean().optional(),
	hasAlbum: z.boolean().optional(),
	fresh: z.boolean().optional(),
	genders: z.string().optional(),
	pageNumber: z.int().nonnegative().optional(),
});

export const searchQuerySchema = gridQuerySchema.extend({
	online: z.boolean().optional(),
	ageMinimum: z.int().nonnegative().optional(),
	ageMaximum: z.int().nonnegative().optional(),
	heightMinimum: z.number().nonnegative().optional(),
	heightMaximum: z.number().nonnegative().optional(),
	weightMinimum: z.number().nonnegative().optional(),
	weightMaximum: z.number().nonnegative().optional(),
	grindrTribesIds: z.string().optional(),
	lookingForIds: z.string().optional(),
	relationshipStatusIds: z.string().optional(),
	bodyTypeIds: z.string().optional(),
	sexualPositionIds: z.string().optional(),
	meetAtIds: z.string().optional(),
	nsfwIds: z.string().optional(),
	profileTags: z.string().optional(),
	searchAfterDistance: z.string().optional(),
	searchAfterProfileId: z.string().optional(),
	freeFilter: z.boolean().optional(),
});

export async function searchProfiles(query: z.infer<typeof searchQuerySchema>) {
	return await fetchRest(
		"/v7/search?" + urlSearchParamsCodec(searchQuerySchema).encode(query),
	)
		.then((res) => res.json())
		.then((data) =>
			z
				.object({
					profiles: z.array(searchProfileSchema),
				})
				.parse(data),
		);
}
