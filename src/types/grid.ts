import z from "zod";

export const browseProfileSchema = z.object({
	profiles: z
		.array(
			z.object({
				profileImageMediaHash: z.string().nullable().optional(),
				medias: z
					.array(z.object({ mediaHash: z.string().optional() }))
					.optional()
					.default([]),
			}),
		)
		.length(1),
});

const cascadeItemSchema = z.object({
	type: z.string(),
	data: z.unknown(),
});

export const cascadeResponseSchema = z.object({
	items: z.array(cascadeItemSchema).optional().default([]),
	nextPage: z.number().nullable().optional(),
});

export const browseCardSchema = z.object({
	profileId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	displayName: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	distanceMeters: z.number().nullable().optional(),
	primaryImageUrl: z.string().nullable().optional(),
	lastOnline: z.number().nullable().optional(),
	onlineUntil: z.number().nullable().optional(),
	isPopular: z.boolean().optional(),
	unreadCount: z.number().optional(),
	rightNow: z.unknown().optional(),
});

export type BrowseCard = z.infer<typeof browseCardSchema>;

export const geocodeResultSchema = z.object({
	display_name: z.string(),
	lat: z.string(),
	lon: z.string(),
});

export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const profileDetailItemSchema = z.object({
	profileId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	displayName: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	showAge: z.boolean().optional(),
	onlineUntil: z.number().nullable().optional(),
	seen: z.number().nullable().optional(),
	lastViewed: z.number().nullable().optional(),
	distance: z.number().nullable().optional(),
	approximateDistance: z.boolean().optional(),
	showDistance: z.boolean().optional(),
	isFavorite: z.boolean().optional(),
	aboutMe: z.string().nullable().optional(),
	profileTags: z.array(z.string()).optional().default([]),
	medias: z
		.array(z.object({ mediaHash: z.string().optional() }))
		.optional()
		.default([]),
	profileImageMediaHash: z.string().nullable().optional(),
	tapped: z.boolean().optional(),
	tapType: z.union([z.number(), z.boolean()]).nullable().optional(),
	lastReceivedTapTimestamp: z.number().nullable().optional(),
	relationshipStatus: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	sexualPosition: z.number().nullable().optional(),
	showPosition: z.boolean().optional(),
	hivStatus: z.number().nullable().optional(),
	lastTestedDate: z.number().nullable().optional(),
	rightNowText: z.string().nullable().optional(),
	lookingFor: z.array(z.number()).optional().default([]),
	meetAt: z.array(z.number()).optional().default([]),
	grindrTribes: z.array(z.number()).optional().default([]),
	showTribes: z.boolean().optional(),
	genders: z.array(z.number()).optional().default([]),
	pronouns: z.array(z.number()).optional().default([]),
	sexualHealth: z.array(z.number()).optional().default([]),
	vaccines: z.array(z.number()).optional().default([]),
	socialNetworks: z
		.object({
			instagram: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			twitter: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
			facebook: z
				.object({ userId: z.string().nullable().optional() })
				.optional(),
		})
		.optional(),
});

export const profileDetailResponseSchema = z.object({
	profiles: z.array(profileDetailItemSchema).length(1),
});

export type ProfileDetail = z.infer<typeof profileDetailItemSchema>;

export type SelectedLocation = {
	lat: number;
	lon: number;
	label: string;
};

export type ManagedOption = {
	value: number;
	label: string;
};