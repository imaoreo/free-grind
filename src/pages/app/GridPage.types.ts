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

export const lookingForLabels: Record<number, string> = {
	2: "Chat",
	3: "Dates",
	4: "Friends",
	5: "Networking",
	6: "Relationship",
	7: "Hookups",
};

export const relationshipStatusLabels: Record<number, string> = {
	1: "Single",
	2: "Dating",
	3: "Exclusive",
	4: "Committed",
	5: "Partnered",
	6: "Engaged",
	7: "Married",
	8: "Open Relationship",
};

export const bodyTypeLabels: Record<number, string> = {
	1: "Toned",
	2: "Average",
	3: "Large",
	4: "Muscular",
	5: "Slim",
	6: "Stocky",
};

export const ethnicityLabels: Record<number, string> = {
	1: "Asian",
	2: "Black",
	3: "Latino",
	4: "Middle Eastern",
	5: "Mixed",
	6: "Native American",
	7: "White",
	8: "Other",
	9: "South Asian",
};

export const sexualPositionLabels: Record<number, string> = {
	1: "Top",
	2: "Bottom",
	3: "Versatile",
	4: "Vers Bottom",
	5: "Vers Top",
	6: "Side",
};

export const meetAtLabels: Record<number, string> = {
	1: "My Place",
	2: "Your Place",
	3: "Bar",
	4: "Coffee Shop",
	5: "Restaurant",
};

export const hivStatusLabels: Record<number, string> = {
	1: "Negative",
	2: "Negative, on PrEP",
	3: "Positive",
	4: "Positive, undetectable",
};

export const sexualHealthLabels: Record<number, string> = {
	1: "Condoms",
	2: "I'm on doxyPEP",
	3: "I'm on PrEP",
	4: "I'm HIV undetectable",
	5: "Prefer to discuss",
};

export const vaccineLabels: Record<number, string> = {
	1: "COVID-19",
	2: "Monkeypox",
	3: "Meningitis",
};

export const tribeLabels: Record<number, string> = {
	1: "Bear",
	2: "Clean-Cut",
	3: "Daddy",
	4: "Discreet",
	5: "Geek",
	6: "Jock",
	7: "Leather",
	8: "Otter",
	9: "Poz",
	10: "Rugged",
	11: "Sober",
	12: "Trans",
	13: "Twink",
};

export const profileDetailItemSchema = z.object({
	profileId: z
		.union([z.string(), z.number()])
		.transform((value) => String(value)),
	displayName: z.string().nullable().optional(),
	age: z.number().nullable().optional(),
	onlineUntil: z.number().nullable().optional(),
	lastSeen: z.number().nullable().optional(),
	distanceMeters: z.number().nullable().optional(),
	aboutMe: z.string().nullable().optional(),
	profileTags: z.array(z.string()).optional().default([]),
	medias: z
		.array(z.object({ mediaHash: z.string().optional() }))
		.optional()
		.default([]),
	profileImageMediaHash: z.string().nullable().optional(),
	relationshipStatus: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	position: z.number().nullable().optional(),
	positions: z.array(z.number()).optional().default([]),
	hivStatus: z.number().nullable().optional(),
	lastTestedDate: z.number().nullable().optional(),
	rightNowText: z.string().nullable().optional(),
	lookingFor: z.array(z.number()).optional().default([]),
	meetAt: z.array(z.number()).optional().default([]),
	grindrTribes: z.array(z.number()).optional().default([]),
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