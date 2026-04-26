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

export const sharedAlbumViewSchema = z.object({
  profileFeeds: z
    .array(
      z.object({
        profileId: z.number(),
        seen: z.boolean(),
        paywallStatus: z.string(),
        profile: z.object({
          profileId: z.number(),
          name: z.string().nullable(),
          profileUrl: z.string().url().nullable(),
          onlineUntil: z.number().nullable(),
          distanceKm: z.number().nullable(),
        }),
        content: z.object({
          contentId: z.number(),
          contentType: z.string(),
          coverUrl: z.string().url(),
        }),
      })
    )
    .optional()
    .default([]),

  sharedAlbums: z
    .array(
      z.object({
        albumId: z.number(),
        albumNumber: z.number(),
        albumVersion: z.number(),
        albumViewable: z.boolean(),
        imageCount: z.coerce.number().int().default(0),
        videoCount: z.coerce.number().int().default(0),
        ownerProfileId: z.number(),
        hasUnseenContent: z.boolean(),
        name: z.string().nullable(),
        expiresAt: z.number().nullable(),
        totalAlbumsShared: z.number().optional(),
        profile: z.object({
          profileId: z.number(),
          name: z.string().nullable(),
          profileUrl: z.string().url().nullable(),
          onlineUntil: z.number().nullable(),
          distanceKm: z.number().nullable(),
        }),
        coverContent: z.object({
          id: z.number(),
          contentType: z.string(),
          location: z.string().url(),
          status: z.string(),
        }),
      })
    )
    .optional()
    .default([]),
  experimentStatus: z.number().optional(),
  nonEmptyPersonalAlbumCount: z.number().optional(),
  emptyAlbumId: z.number().nullable().optional(),
});

export type Album = z.infer<typeof albumSchema>;
export type AlbumsResponse = z.infer<typeof albumsResponseSchema>;
export type AlbumLimits = z.infer<typeof albumLimitsSchema>;
export type AlbumMedia = z.infer<typeof albumMediaSchema>;
export type AlbumDetail = z.infer<typeof albumDetailSchema>;
export type SharedAlbum = z.infer<typeof sharedAlbumSchema>;
export type SharedAlbumsResponse = z.infer<typeof sharedAlbumsResponseSchema>;
export type AlbumExpirationType = z.infer<typeof albumExpirationTypeSchema>;
export type SharedAlbumView = z.infer<typeof sharedAlbumViewSchema>;