import { z } from "zod";

/**
 * Clean internal model for a Right Now post used throughout the app.
 * Uses descriptive names consistent with the rest of the project.
 */
export const rightNowFeedItemSchema = z.object({
	id: z.number().nullable(),
	profileId: z.string(),
	displayName: z.string().nullable(),
	/** Server: mediaHash */
	profileImageMediaHash: z.string().nullable(),
	/** Server: media */
	media: z.array(z.object({
		type: z.string().optional(),
		data: z.object({
			thumbnailUrl: z.string().optional().nullable(),
			fullImageUrl: z.string().optional().nullable(),
		}).optional().nullable(),
	})).optional().nullable(),
	text: z.string().nullable(),
	hosting: z.boolean(),
	/** Server: posted */
	postedAt: z.number().nullable(),
	/** Server: expiration */
	expiresAt: z.number().nullable(),
	/** Server: distance */
	distanceMeters: z.number().nullable(),
	lat: z.number().nullable(),
	lon: z.number().nullable(),
	onlineUntil: z.number().nullable(),
	/** Server: favorite */
	isFavorite: z.boolean().default(false),
	recentlyChatted: z.boolean().default(false),
	/** Server: mpuScore */
	mpuScore: z.number().nullable().optional(),
	/** Derived from locked_post_v1.type (xtra_post_v1, unlimited_post_v1) */
	premiumType: z.string().nullable().optional(),
});

export type RightNowFeedItem = z.infer<typeof rightNowFeedItemSchema>;

/**
 * Schema for an item in the feed array as it arrives from the API.
 * This is used for safe parsing and mapping.
 */
export const rightNowFeedEntrySchema = z.object({
	type: z.string(),
	data: z.object({
		id: z.number().optional().nullable(),
		profileId: z.union([z.string(), z.number()]).transform((val) => String(val)),
		displayName: z.string().optional().nullable(),
		mediaHash: z.string().optional().nullable(),
		media: z.array(z.object({
			type: z.string().optional(),
			data: z.object({
				thumbnailUrl: z.string().optional().nullable(),
				fullImageUrl: z.string().optional().nullable(),
			}).optional().nullable(),
		})).optional().nullable(),
		text: z.string().optional().nullable(),
		hosting: z.boolean().optional().default(false),
		posted: z.number().optional().nullable(),
		expiration: z.number().optional().nullable(),
		distance: z.number().optional().nullable(),
		lat: z.number().optional().nullable(),
		lon: z.number().optional().nullable(),
		favorite: z.boolean().optional().default(false),
		recentlyChatted: z.boolean().optional().default(false),
		onlineUntil: z.number().optional().nullable(),
		mpuScore: z.number().optional().nullable(),
		postStatus: z.string().optional().nullable(),
		type: z.string().optional().nullable(), // For locked_post_v1
	}),
});

/**
 * Request schema for creating a post
 */
export const rightNowCreatePostMediaSchema = z.object({
	type: z.enum(["image_v1", "album_v1"]),
	data: z.object({
		id: z.number().int(),
	}),
});

export type RightNowCreatePostMedia = z.infer<typeof rightNowCreatePostMediaSchema>;

export const rightNowCreatePostRequestSchema = z.object({
	text: z.string().max(140).nullable(),
	// NONE is likely used when 'Show Distance' is disabled in general privacy settings
	shareLocation: z.enum(["DISTANCE_AND_MAP", "DISTANCE_ONLY", "NONE"]),
	lat: z.number().nullable(),
	lon: z.number().nullable(),
	locationRadius: z.number().int().nullable(),
	media: z.array(rightNowCreatePostMediaSchema),
	hosting: z.boolean(),
	sharedFields: z.array(z.string()).default([]),
});

export type RightNowCreatePostRequest = z.infer<typeof rightNowCreatePostRequestSchema>;

export const rightNowUploadMediaResponseSchema = z.object({
	mediaId: z.number(),
	url: z.string(),
	thumbnailUrl: z.string(),
});

export type RightNowUploadMediaResponse = z.infer<typeof rightNowUploadMediaResponseSchema>;

export const rightNowCreatePostResponseSchema = z.object({
	post: z.object({
		id: z.number(),
		media: z.array(z.any()).optional().nullable(),
		profileId: z.coerce.string(),
		activeText: z.string().optional().nullable(),
		moderatedText: z.any().optional().nullable(),
		lat: z.number().optional().nullable(),
		lon: z.number().optional().nullable(),
		locationRadius: z.number().optional().nullable(),
		postStatus: z.string().optional().nullable().default("ACTIVE"),
		hosting: z.boolean().optional().default(false),
		posted: z.number().optional().nullable(),
		expiration: z.number().optional().nullable(),
		shareLocation: z.string().optional().nullable().default("NONE"),
		boostUpsellOfferAvailableUntil: z.number().optional().nullable(),
		isDiscreet: z.any().optional().nullable(),
		sharedFields: z.array(z.any()).optional().nullable(),
	}),
});

export type RightNowCreatePostResponse = z.infer<typeof rightNowCreatePostResponseSchema>;

export const rightNowUpdatePostRequestSchema = z.object({
	text: z.string().max(140).nullable().optional(),
	hidden: z.boolean().nullable().optional(),
	hosting: z.boolean().nullable().optional(),
	media: z.array(rightNowCreatePostMediaSchema).nullable().optional(),
	// NONE is likely used when 'Show Distance' is disabled in general privacy settings
	shareLocation: z.enum(["DISTANCE_AND_MAP", "DISTANCE_ONLY", "NONE"]).nullable().optional(),
	locationRadius: z.number().int().nullable().optional(),
	isDiscreet: z.boolean().nullable().optional(),
	sharedFields: z.array(z.string()).default([]),
});

export type RightNowUpdatePostRequest = z.infer<typeof rightNowUpdatePostRequestSchema>;

export const rightNowEntitlementsSchema = z.object({
	rightNow: z.number(),
});

export type RightNowEntitlements = z.infer<typeof rightNowEntitlementsSchema>;
