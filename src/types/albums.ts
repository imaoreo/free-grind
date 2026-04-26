import z from "zod";

const stringIdSchema = z
	.union([z.string(), z.number()])
	.transform((value) => String(value));

export const albumExpirationTypeSchema = z.union([
	z.literal("INDEFINITE"),
	z.literal("ONCE"),
	z.literal("TEN_MINUTES"),
	z.literal("ONE_HOUR"),
	z.literal("ONE_DAY"),
	z.coerce.number().int(),
]);

export const albumSchema = z.object({
	albumId: stringIdSchema,
	albumName: z.string().nullable().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	isShareable: z.boolean().optional(),
});

export const albumsResponseSchema = z.object({
	albums: z.array(albumSchema).optional().default([]),
});

export const albumLimitsSchema = z.object({
	subscriptionType: z.string().optional(),
	maxAlbums: z.number().int().positive().optional(),
});

export const albumMediaSchema = z.object({
	contentId: stringIdSchema,
	contentType: z.string().nullable().optional(),
	thumbUrl: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
	processing: z.boolean().optional(),
	remainingViews: z.coerce.number().int().optional(),
});

export const albumDetailSchema = z.object({
	albumId: stringIdSchema,
	albumName: z.string().nullable().optional(),
	content: z.array(albumMediaSchema).optional().default([]),
});

export const sharedAlbumPreviewContentSchema = z.object({
	thumbUrl: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
});

export const sharedAlbumSchema = z.object({
	albumId: z.coerce.number().int(),
	albumName: z.string().nullable().optional(),
	content: sharedAlbumPreviewContentSchema.nullable().optional(),
	contentCount: z
		.object({
			imageCount: z.coerce.number().int().optional().default(0),
			videoCount: z.coerce.number().int().optional().default(0),
		})
		.optional()
		.default({ imageCount: 0, videoCount: 0 }),
});

export const sharedAlbumsResponseSchema = z.object({
	albums: z.array(sharedAlbumSchema).optional().default([]),
});

export type Album = z.infer<typeof albumSchema>;
export type AlbumsResponse = z.infer<typeof albumsResponseSchema>;
export type AlbumLimits = z.infer<typeof albumLimitsSchema>;
export type AlbumMedia = z.infer<typeof albumMediaSchema>;
export type AlbumDetail = z.infer<typeof albumDetailSchema>;
export type SharedAlbum = z.infer<typeof sharedAlbumSchema>;
export type SharedAlbumsResponse = z.infer<typeof sharedAlbumsResponseSchema>;
export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;