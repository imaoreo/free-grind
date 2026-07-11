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
	maxAlbums: z.number().int().optional(),
	maxContentItemsPerAlbum: z.number().int().optional(),
	maxShares: z.number().int().optional(),
	maxViewableAlbums: z.number().int().optional(),
	maxViewableVideos: z.number().int().optional(),
	maxContentSize: z.number().optional(),
	maxContentSizeHumanReadable: z.string().optional(),
	maxVideoLength: z.number().optional(),
	minVideoLength: z.number().optional(),
	maxShareableAlbums: z.number().int().optional(),
	maxVideosPerAlbum: z.number().int().optional(),
});

export const albumMediaSchema = z.object({
	contentId: stringIdSchema,
	contentType: z.string().nullable().optional(),
	thumbUrl: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
	processing: z.boolean().optional(),
	remainingViews: z.coerce.number().int().optional(),
	statusId: z.number().int().nullable().optional(),
	rejectionId: z.number().int().nullable().optional(),
});

export const albumSharesResponseSchema = z.object({
	profileIds: z.array(z.number().int()).optional().default([]),
});

export const albumDetailSchema = z.object({
	albumId: stringIdSchema,
	albumName: z.string().nullable().optional(),
	content: z.array(albumMediaSchema).optional().default([]),
});

export const albumPosterSchema = z.object({
	posterUrl: z.string().nullable().optional(),
	blurredPosterUrl: z.string().nullable().optional(),
});

export type AlbumPoster = z.infer<typeof albumPosterSchema>;

export const sharedAlbumPreviewContentSchema = z.object({
	thumbUrl: z.string().nullable().optional(),
	url: z.string().nullable().optional(),
	coverUrl: z.string().nullable().optional(),
});

export const sharedAlbumSchema = z.object({
	albumId: z.coerce.number().int(),
	albumName: z.string().nullable().optional(),
	name: z.string().nullable().optional(),
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

const sharedAlbumFeedProfileSchema = z.object({
  profileId: z.number(),
  name: z.string().nullable(),
  profileUrl: z.string().url().nullable(),
  onlineUntil: z.number().nullable(),
  distanceKm: z.number().nullable(),
});

const profileFeedItemSchema = z.object({
  profileId: z.number(),
  seen: z.boolean(),
  paywallStatus: z.string(),
  profile: sharedAlbumFeedProfileSchema,
  content: z.object({
    contentId: z.number(),
    contentType: z.string(),
    // Nullable, not just optional — a cover still processing (or with a
    // rejected/removed image) legitimately has no url yet, and the UI
    // already falls back to a placeholder icon when this is falsy.
    coverUrl: z.string().url().nullable(),
  }),
});

const sharedAlbumFeedItemSchema = z.object({
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
  profile: sharedAlbumFeedProfileSchema,
  coverContent: z.object({
    id: z.number(),
    contentType: z.string(),
    location: z.string().url().nullable(),
    status: z.string(),
  }),
});

/**
 * Validates each feed entry individually and drops only the ones that fail,
 * instead of the array-level z.array(schema) behavior of throwing (and so
 * losing every entry in the response) the moment a single one doesn't match
 * — the pressie-albums feed has been observed to include entries the rest of
 * this schema doesn't expect (e.g. a still-processing cover), and previously
 * any single one of those silently took the whole feed down with it.
 */
function lenientArray<T>(itemSchema: z.ZodType<T>, label: string) {
  return z
    .array(z.unknown())
    .optional()
    .default([])
    .transform((raw) =>
      raw.flatMap((entry) => {
        const result = itemSchema.safeParse(entry);
        if (!result.success) {
          console.warn(`[albums] dropped malformed ${label} feed entry`, result.error.issues, entry);
          return [];
        }
        return [result.data];
      }),
    );
}

export const sharedAlbumViewSchema = z.object({
  profileFeeds: lenientArray(profileFeedItemSchema, "profileFeeds"),
  sharedAlbums: lenientArray(sharedAlbumFeedItemSchema, "sharedAlbums"),
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
export type AlbumSharesResponse = z.infer<typeof albumSharesResponseSchema>;