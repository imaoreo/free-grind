import z from "zod";

export const conversationIdSchema = z.string().min(1);

export const inboxFiltersSchema = z.object({
	unreadOnly: z.boolean().optional(),
	chemistryOnly: z.boolean().optional(),
	favoritesOnly: z.boolean().optional(),
	rightNowOnly: z.boolean().optional(),
	onlineNowOnly: z.boolean().optional(),
	distanceMeters: z.number().nullable().optional(),
	positions: z.array(z.number().int()).optional(),
});

export const participantSchema = z.object({
	profileId: z.coerce.number().int(),
	primaryMediaHash: z.string().nullable().optional(),
	lastOnline: z.coerce.number().nullable().optional(),
	onlineUntil: z.coerce.number().nullable().optional(),
	distanceMetres: z.coerce.number().nullable().optional(),
	position: z.coerce.number().nullable().optional(),
	isInAList: z.boolean().optional(),
	hasDatingPotential: z.boolean().optional(),
});

export const messagePreviewSchema = z.object({
	conversationId: z
		.object({
			value: conversationIdSchema,
		})
		.optional(),
	messageId: z.string().optional(),
	senderId: z.coerce.number().int().optional(),
	type: z.string().optional(),
	chat1Type: z.string().optional(),
	text: z.string().nullable().optional(),
	albumId: z.coerce.number().nullable().optional(),
	imageHash: z.string().nullable().optional(),
});

export const conversationEntrySchema = z.object({
	type: z.string().optional(),
	data: z.object({
		conversationId: conversationIdSchema,
		name: z.string().optional().default(""),
		participants: z.array(participantSchema).optional().default([]),
		lastActivityTimestamp: z.coerce.number().nullable().optional().default(0),
		unreadCount: z.coerce.number().int().nonnegative().optional().default(0),
		preview: messagePreviewSchema.nullable().optional(),
		muted: z.boolean().optional().default(false),
		pinned: z.boolean().optional().default(false),
		favorite: z.boolean().optional().default(false),
		rightNow: z.string().nullable().optional(),
		hasUnreadThrob: z.boolean().optional(),
	}),
});

export const inboxResponseSchema = z.object({
	entries: z.array(conversationEntrySchema).optional().default([]),
	nextPage: z.coerce.number().int().nullable().optional(),
	totalFullConversations: z.coerce.number().optional(),
	totalPartialConversations: z.coerce.number().optional(),
});

export const messageReactionSchema = z.object({
	profileId: z.coerce.number().int(),
	reactionType: z.coerce.number().int(),
});

export const messageSchema = z.object({
	messageId: z.string(),
	conversationId: conversationIdSchema,
	senderId: z.coerce.number().int(),
	timestamp: z.coerce.number(),
	unsent: z.boolean().optional().default(false),
	reactions: z.array(messageReactionSchema).optional().default([]),
	type: z.string().optional().default("Unknown"),
	chat1Type: z.string().nullable().optional(),
	body: z.unknown().nullable().optional(),
	replyToMessage: z.unknown().nullable().optional(),
	replyPreview: z.unknown().nullable().optional(),
	dynamic: z.boolean().optional(),
});

export const messagesResponseSchema = z.object({
	lastReadTimestamp: z.coerce.number().nullable().optional(),
	messages: z.array(messageSchema).optional().default([]),
	metadata: z
		.object({
			translate: z.boolean().optional(),
			hasSharedAlbums: z.boolean().optional(),
			isInAList: z.boolean().optional(),
		})
		.optional(),
	profile: z
		.object({
			profileId: z.coerce.number().int(),
			name: z.string().optional(),
			mediaHash: z.string().nullable().optional(),
			onlineUntil: z.coerce.number().nullable().optional(),
			distance: z.coerce.number().nullable().optional(),
			showDistance: z.boolean().optional(),
		})
		.nullable()
		.optional(),
});

export const sendMessagePayloadSchema = z.object({
	type: z.string(),
	target: z.object({
		type: z.enum(["Direct", "Group", "HumanWingman"]),
		targetId: z.coerce.number().int(),
	}),
	body: z.record(z.string(), z.unknown()).nullable(),
});

export const sendTextPayloadSchema = z.object({
	targetProfileId: z.coerce.number().int(),
	text: z.string().trim().min(1).max(5000),
});

export const chatMessageMutationSchema = z.object({
	conversationId: conversationIdSchema,
	messageId: z.string().min(1),
});

export const chatReactionPayloadSchema = chatMessageMutationSchema.extend({
	reactionType: z.coerce.number().int(),
});

export const shareAlbumPayloadSchema = z.object({
	albumId: z.coerce.number().int(),
	profiles: z
		.array(
			z.object({
				profileId: z.coerce.number().int(),
				expirationType: z.union([
					z.literal("INDEFINITE"),
					z.literal("ONCE"),
					z.literal("TEN_MINUTES"),
					z.literal("ONE_HOUR"),
					z.literal("ONE_DAY"),
					z.coerce.number().int(),
				]),
			}),
		)
		.min(1),
});

export const websocketEnvelopeSchema = z.object({
	event: z.string().optional(),
	type: z.string().optional(),
	timestamp: z.coerce.number().optional(),
	payload: z.unknown().optional(),
	data: z.unknown().optional(),
});

export type InboxFilters = z.infer<typeof inboxFiltersSchema>;
export type ConversationEntry = z.infer<typeof conversationEntrySchema>;
export type InboxResponse = z.infer<typeof inboxResponseSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessagesResponse = z.infer<typeof messagesResponseSchema>;
export type SendMessagePayload = z.infer<typeof sendMessagePayloadSchema>;
export type SendTextPayload = z.infer<typeof sendTextPayloadSchema>;
export type ChatMessageMutation = z.infer<typeof chatMessageMutationSchema>;
export type ChatReactionPayload = z.infer<typeof chatReactionPayloadSchema>;
export type ShareAlbumPayload = z.infer<typeof shareAlbumPayloadSchema>;
export type WebsocketEnvelope = z.infer<typeof websocketEnvelopeSchema>;
