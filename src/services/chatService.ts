import z from "zod";
import {
	chatMessageMutationSchema,
	chatReactionPayloadSchema,
	inboxFiltersSchema,
	inboxResponseSchema,
	messagesResponseSchema,
	messageSchema,
	sendMessagePayloadSchema,
	sendTextPayloadSchema,
	shareAlbumPayloadSchema,
	type ConversationEntry,
	type InboxFilters,
	type InboxResponse,
	type Message,
	type MessagesResponse,
	type SendMessagePayload,
	type SendTextPayload,
} from "../types/chat";

export interface RestResponse {
	status: number;
	json: () => unknown;
	text: () => string;
	bytes: () => Uint8Array;
}

export type RestFetcher = (
	path: string,
	options?: {
		method?: string;
		body?: unknown;
		rawBody?: Uint8Array;
		contentType?: string;
		abortController?: AbortController;
	},
) => Promise<RestResponse>;

export interface MultipartUpload {
	body: Uint8Array;
	contentType: string;
}

export class ChatApiError extends Error {
	status: number;
	payload: unknown;

	constructor(message: string, status: number, payload: unknown) {
		super(message);
		this.name = "ChatApiError";
		this.status = status;
		this.payload = payload;
	}
}

async function parseJsonSafe(response: RestResponse): Promise<unknown> {
	try {
		return response.json();
	} catch {
		return null;
	}
}

async function assertSuccess(
	response: RestResponse,
	fallbackMessage: string,
): Promise<void> {
	if (response.status >= 200 && response.status < 300) {
		return;
	}

	const payload = await parseJsonSafe(response);
	const parsed = z
		.object({
			message: z.string().optional(),
			error: z.string().optional(),
		})
		.safeParse(payload);

	const message =
		parsed.success && (parsed.data.message || parsed.data.error)
			? parsed.data.message || parsed.data.error || fallbackMessage
			: fallbackMessage;

	throw new ChatApiError(message, response.status, payload);
}

function sortConversations(entries: ConversationEntry[]): ConversationEntry[] {
	return [...entries].sort((a, b) => {
		if (a.data.pinned && !b.data.pinned) {
			return -1;
		}
		if (b.data.pinned && !a.data.pinned) {
			return 1;
		}
		return (
			(b.data.lastActivityTimestamp ?? 0) - (a.data.lastActivityTimestamp ?? 0)
		);
	});
}

function sortMessages(messages: Message[]): Message[] {
	return [...messages].sort((a, b) => a.timestamp - b.timestamp);
}

export function createChatService(fetchRest: RestFetcher) {
	return {
		async searchProfiles(params: {
			nearbyGeoHash: string;
			searchAfterDistance?: string;
			searchAfterProfileId?: string;
			online?: boolean;
			hasAlbum?: boolean;
		}): Promise<{
			profiles: Array<{
				profileId: number;
				displayName: string;
				age: number | null;
				distance: number | null;
				profileImageMediaHash: string | null;
				hasAlbum: boolean;
				showDistance: boolean;
			}>;
			lastDistanceInKm: number | null;
			lastProfileId: number | null;
		}> {
			const query = new URLSearchParams({
				nearbyGeoHash: params.nearbyGeoHash,
			});

			if (params.searchAfterDistance) {
				query.set("searchAfterDistance", params.searchAfterDistance);
			}
			if (params.searchAfterProfileId) {
				query.set("searchAfterProfileId", params.searchAfterProfileId);
			}
			if (params.online !== undefined) {
				query.set("online", String(params.online));
			}
			if (params.hasAlbum !== undefined) {
				query.set("hasAlbum", String(params.hasAlbum));
			}

			const response = await fetchRest(`/v7/search?${query.toString()}`);
			await assertSuccess(response, "Failed to search profiles");

			return z
				.object({
					profiles: z
						.array(
							z.object({
								profileId: z.coerce.number().int(),
								displayName: z
									.string()
									.nullable()
									.optional()
									.transform((value) => (value ?? "").trim()),
								age: z.coerce.number().nullable().optional().default(null),
								distance: z.coerce.number().nullable().optional().default(null),
								profileImageMediaHash: z
									.string()
									.nullable()
									.optional()
									.default(null),
								hasAlbum: z.boolean().optional().default(false),
								showDistance: z.boolean().optional().default(false),
							}),
						)
						.optional()
						.default([]),
					lastDistanceInKm: z
						.coerce
						.number()
						.nullable()
						.optional()
						.default(null),
					lastProfileId: z
						.coerce
						.number()
						.int()
						.nullable()
						.optional()
						.default(null),
				})
				.parse(await parseJsonSafe(response));
		},

		async listConversations(params?: {
			page?: number;
			filters?: InboxFilters;
		}): Promise<InboxResponse> {
			const page = params?.page ?? 1;
			const filters = inboxFiltersSchema.optional().parse(params?.filters);
			const response = await fetchRest(`/v4/inbox?page=${page}`, {
				method: "POST",
				body: filters,
			});
			await assertSuccess(response, "Failed to load conversations");
			const parsed = inboxResponseSchema.parse(await parseJsonSafe(response));
			return {
				...parsed,
				entries: sortConversations(parsed.entries),
			};
		},

		async listMessages(params: {
			conversationId: string;
			pageKey?: string;
			includeProfile?: boolean;
		}): Promise<MessagesResponse> {
			const query = new URLSearchParams();
			if (params.pageKey) {
				query.set("pageKey", params.pageKey);
			}
			if (params.includeProfile) {
				query.set("profile", "true");
			}

			const suffix = query.toString() ? `?${query.toString()}` : "";
			const response = await fetchRest(
				`/v5/chat/conversation/${params.conversationId}/message${suffix}`,
			);
			await assertSuccess(response, "Failed to load messages");
			const parsed = messagesResponseSchema.parse(
				await parseJsonSafe(response),
			);
			return {
				...parsed,
				messages: sortMessages(parsed.messages),
			};
		},

		async sendMessage(payload: SendMessagePayload): Promise<Message> {
			const safePayload = sendMessagePayloadSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/send", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, "Failed to send message");
			return messageSchema.parse(await parseJsonSafe(response));
		},

		async sendText(payload: SendTextPayload): Promise<Message> {
			const safePayload = sendTextPayloadSchema.parse(payload);
			return this.sendMessage({
				type: "Text",
				target: {
					type: "Direct",
					targetId: safePayload.targetProfileId,
				},
				body: { text: safePayload.text },
			});
		},

		async pinConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}/pin`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, "Failed to pin conversation");
		},

		async unpinConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}/unpin`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, "Failed to unpin conversation");
		},

		async muteConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v1/push/conversation/${conversationId}/mute`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, "Failed to mute conversation");
		},

		async unmuteConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v1/push/conversation/${conversationId}/unmute`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, "Failed to unmute conversation");
		},

		async markRead(conversationId: string, messageId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}/read/${messageId}`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, "Failed to mark conversation as read");
		},

		async unsendMessage(payload: {
			conversationId: string;
			messageId: string;
		}) {
			const safePayload = chatMessageMutationSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/unsend", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, "Failed to unsend message");
		},

		async deleteMessage(payload: {
			conversationId: string;
			messageId: string;
		}) {
			const safePayload = chatMessageMutationSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/delete", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, "Failed to delete message");
		},

		async reactToMessage(payload: {
			conversationId: string;
			messageId: string;
			reactionType: number;
		}) {
			const safePayload = chatReactionPayloadSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/reaction", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, "Failed to react to message");
		},

		async listAlbums(): Promise<
			Array<{
				albumId: string | number;
				albumName?: string | null;
				isShareable?: boolean;
			}>
		> {
			const response = await fetchRest("/v1/albums");
			await assertSuccess(response, "Failed to load albums");
			const parsed = z
				.object({
					albums: z
						.array(
							z.object({
								albumId: z.union([z.string(), z.number()]),
								albumName: z.string().nullable().optional(),
								isShareable: z.boolean().optional(),
							}),
						)
						.optional()
						.default([]),
				})
				.parse(await parseJsonSafe(response));
			return parsed.albums;
		},

		async createAlbum(albumName: string): Promise<{ albumId: number }> {
			const response = await fetchRest("/v2/albums", {
				method: "POST",
				body: { albumName },
			});
			await assertSuccess(response, "Failed to create album");
			return z
				.object({
					albumId: z.coerce.number().int(),
				})
				.parse(await parseJsonSafe(response));
		},

		async getAlbum(albumId: number | string): Promise<{
			albumId: number;
			albumName: string | null;
			content: Array<{
				contentId: number;
				contentType: string | null;
				thumbUrl: string | null;
				url: string | null;
				coverUrl: string | null;
				processing: boolean;
			}>;
		}> {
			const response = await fetchRest(`/v2/albums/${albumId}`);
			await assertSuccess(response, "Failed to load album");
			return z
				.object({
					albumId: z.coerce.number().int(),
					albumName: z.string().nullable().optional().default(null),
					content: z
						.array(
							z.object({
								contentId: z.coerce.number().int(),
								contentType: z.string().nullable().optional().default(null),
								thumbUrl: z.string().nullable().optional().default(null),
								url: z.string().nullable().optional().default(null),
								coverUrl: z.string().nullable().optional().default(null),
								processing: z.boolean().optional().default(false),
							}),
						)
						.optional()
						.default([]),
				})
				.parse(await parseJsonSafe(response));
		},

		async uploadAlbumContent(params: {
			albumId: number | string;
			multipart: MultipartUpload;
		}): Promise<{ contentId: number }> {
			const response = await fetchRest(`/v1/albums/${params.albumId}/content`, {
				method: "POST",
				rawBody: params.multipart.body,
				contentType: params.multipart.contentType,
			});
			await assertSuccess(response, "Failed to upload media");
			return z
				.object({
					contentId: z.coerce.number().int(),
				})
				.parse(await parseJsonSafe(response));
		},

		async shareAlbum(payload: {
			albumId: number;
			profiles: Array<{ profileId: number; expirationType: string | number }>;
		}) {
			const safePayload = shareAlbumPayloadSchema.parse(payload);
			const response = await fetchRest(
				`/v4/albums/${safePayload.albumId}/shares`,
				{
					method: "POST",
					body: { profiles: safePayload.profiles },
				},
			);
			await assertSuccess(response, "Failed to share album");
		},
	};
}
