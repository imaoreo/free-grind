import z from "zod";

export const browseProfileSchema = z.object({
	profiles: z
		.array(
			z.object({
				profileImageMediaHash: z.string().nullable().optional(),
				medias: z
					.array(z.object({ mediaHash: z.string().optional() }))
					.optional()
					.nullable(),
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
	isVisiting: z.boolean().optional(),
	isBoosting: z.boolean().optional(),
	unreadCount: z.number().optional(),
	favorite: z.boolean().optional(),
	chatted: z.boolean().optional(),
	rightNow: z.string().nullable().optional(),
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
	lastChatTimestamp: z.number().nullable().optional(),
	isNew: z.boolean().optional(),
	lastUpdatedTime: z.number().nullable().optional(),
	distance: z.number().nullable().optional(),
	approximateDistance: z.boolean().optional(),
	showDistance: z.boolean().optional(),
	isFavorite: z.boolean().optional(),
	aboutMe: z.string().nullable().optional(),
	identity: z.unknown().nullable().optional(),
	nsfw: z.number().nullable().optional(),
	hashtags: z.array(z.unknown()).nullable().optional().transform(v => v ?? []),
	profileTags: z.array(z.string()).nullable().optional().transform(v => v ?? []),
	medias: z
		.array(
			z.object({
				mediaHash: z.string().optional(),
				type: z.number().nullable().optional(),
				state: z.number().nullable().optional(),
				reason: z.string().nullable().optional(),
				takenOnGrindr: z.boolean().nullable().optional(),
				createdAt: z.number().nullable().optional(),
			}),
		)
		.nullable()
		.optional()
		.transform(v => v ?? []),
	profileImageMediaHash: z.string().nullable().optional(),
	tapped: z.boolean().optional(),
	tapType: z.union([z.number(), z.boolean()]).nullable().optional(),
	lastReceivedTapTimestamp: z.number().nullable().optional(),
	isTeleporting: z.boolean().optional(),
	isRoaming: z.boolean().optional(),
	arrivalDays: z.number().nullable().optional(),
	foundVia: z.unknown().nullable().optional(),
	unreadCount: z.number().optional(),
	relationshipStatus: z.number().nullable().optional(),
	bodyType: z.number().nullable().optional(),
	ethnicity: z.number().nullable().optional(),
	height: z.number().nullable().optional(),
	weight: z.number().nullable().optional(),
	sexualPosition: z.number().nullable().optional(),
	showPosition: z.boolean().optional(),
	hivStatus: z.number().nullable().optional(),
	lastTestedDate: z.number().nullable().optional(),
	rightNow: z.string().nullable().optional(),
	rightNowText: z.string().nullable().optional(),
	rightNowPosted: z.number().nullable().optional(),
	rightNowDistance: z.number().nullable().optional(),
	rightNowThumbnailUrl: z.string().nullable().optional(),
	rightNowFullImageUrl: z.string().nullable().optional(),
	rightNowShareLocation: z.unknown().nullable().optional(),
	rightNowMedias: z
		.array(
			z.object({
				mediaId: z.number().nullable().optional(),
				thumbnailUrl: z.string().nullable().optional(),
				fullImageUrl: z.string().nullable().optional(),
				contentType: z.string().nullable().optional(),
				isNsfw: z.boolean().nullable().optional(),
			}),
		)
		.nullable()
		.optional()
		.transform(v => v ?? []),
	verifiedInstagramId: z.string().nullable().optional(),
	lastThrobTimestamp: z.unknown().nullable().optional(),
	isBlockable: z.boolean().nullable().optional(),
	lookingFor: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	meetAt: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	grindrTribes: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	showTribes: z.boolean().optional(),
	tribesImInto: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	showVipBadge: z.boolean().optional(),
	genders: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	pronouns: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	sexualHealth: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	vaccines: z.array(z.number()).nullable().optional().transform(v => v ?? []),
	isVisiting: z.boolean().optional(),
	travelPlans: z
		.array(
			z.object({
				id: z.number().nullable().optional(),
				geohash: z.string().optional(),
				locationName: z.string().optional(),
				startDateUtc: z.number().nullable().optional(),
				endDateUtc: z.number().nullable().optional(),
				showOnProfile: z.boolean().nullable().optional(),
			}),
		)
		.nullable()
		.optional()
		.transform(v => v ?? []),
	isInAList: z.boolean().optional(),
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