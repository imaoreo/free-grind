import z from "zod";

const stringIdSchema = z
	.union([z.string(), z.number()])
	.transform((value) => String(value));

const timestampSchema = z.union([z.number(), z.string()]).optional();

export const interestViewedCountSchema = z
	.object({
		totalCount: z.coerce.number().int().optional(),
		maxDisplayCount: z.coerce.number().int().optional(),
	})
	.passthrough();

export const interestViewEntrySchema = z
	.object({
		profileId: stringIdSchema.optional(),
		viewerProfileId: stringIdSchema.optional(),
		id: stringIdSchema.optional(),
		displayName: z.string().nullable().optional(),
		profileImageMediaHash: z.string().nullable().optional(),
		photoHash: z.string().nullable().optional(),
		mediaHash: z.string().nullable().optional(),
		seen: z.coerce.number().optional(),
		lastViewed: z.coerce.number().optional(),
		distance: z.coerce.number().nullable().optional(),
		rightNow: z.string().nullable().optional(),
		isSecretAdmirer: z.boolean().optional(),
		isViewedMeFreshFace: z.boolean().optional(),
		isInBadNeighborhood: z.boolean().optional(),
		isFavorite: z.boolean().optional(),
		timestamp: timestampSchema,
		sentOn: timestampSchema,
		readOn: timestampSchema,
		lastViewedAt: timestampSchema,
		viewedCount: interestViewedCountSchema.optional(),
		profile: z.record(z.string(), z.unknown()).optional(),
		preview: z.record(z.string(), z.unknown()).optional(),
		viewer: z.record(z.string(), z.unknown()).optional(),
		user: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const interestViewsListSchema = z
	.object({
		totalViewers: z.coerce.number().int().optional(),
		previews: z.array(interestViewEntrySchema).optional().default([]),
		profiles: z.array(interestViewEntrySchema).optional().default([]),
	})
	.passthrough();

export const interestViewsResponseSchema = z
	.union([
		interestViewsListSchema,
		z
			.object({
				data: interestViewsListSchema,
			})
			.passthrough(),
	]);

export const interestTapEntrySchema = z
	.object({
		profileId: stringIdSchema.optional(),
		senderId: stringIdSchema.optional(),
		displayName: z.string().nullable().optional(),
		profileImageMediaHash: z.string().nullable().optional(),
		photoHash: z.string().nullable().optional(),
		mediaHash: z.string().nullable().optional(),
		timestamp: timestampSchema,
		sentOn: timestampSchema,
		readOn: timestampSchema,
		lastViewedAt: timestampSchema,
		tapType: z.coerce.number().int().nullable().optional(),
	})
	.passthrough();

export const interestTapsResponseSchema = z
	.object({
		profiles: z.array(interestTapEntrySchema).optional().default([]),
	})
	.passthrough();

export type InterestViewsResponse = z.infer<typeof interestViewsResponseSchema>;
export type InterestTapsResponse = z.infer<typeof interestTapsResponseSchema>;
