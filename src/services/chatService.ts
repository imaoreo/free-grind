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
	type ChatReactionPayload,
	type ChatMessageMutation,
	type ShareAlbumPayload,
} from "../types/chat";
import { albumsResponseSchema, type Album } from "../types/albums";
import type {
	AlbumDetailsResponse,
	CreateAlbumResponse,
	RestFetcher,
	RestResponse,
	SearchProfilesParams,
	SearchProfilesResponse,
	SharedConversationImage,
	UploadAlbumContentParams,
	UploadAlbumContentResponse,
	UploadChatMediaParams,
	UploadChatMediaResponse,
} from "../types/chat-service";

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

export function createChatService(fetchRest: RestFetcher, t: (key: string) => string) {
	return {
		async searchProfiles(
			params: SearchProfilesParams,
		): Promise<SearchProfilesResponse> {
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
			await assertSuccess(response, t("chat.errors.search_profiles"));

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
								medias: z
									.array(
										z.object({
											mediaHash: z.string().optional(),
											type: z.number().optional(),
											state: z.number().optional(),
										}),
									)
									.nullable()
									.optional()
									.default([]),
								profileTags: z.array(z.string()).optional().default([]),
								hasAlbum: z.boolean().optional().default(false),
								showDistance: z.boolean().optional().default(false),
								showAge: z.boolean().optional().default(false),
								approximateDistance: z.boolean().optional().default(false),
								boosting: z.boolean().optional().default(false),
								isFavorite: z.boolean().optional().default(false),
								new: z.boolean().optional().default(false),
								lastChatTimestamp: z.coerce
									.number()
									.nullable()
									.optional()
									.default(null),
								lastUpdatedTime: z.coerce
									.number()
									.nullable()
									.optional()
									.default(null),
								lastViewed: z.coerce
									.number()
									.nullable()
									.optional()
									.default(null),
								seen: z.coerce.number().nullable().optional().default(null),
								hasFaceRecognition: z.boolean().optional().default(false),
								gender: z.array(z.number()).optional().default([]),
							}),
						)
						.optional()
						.default([]),
					lastDistanceInKm: z.coerce
						.number()
						.nullable()
						.optional()
						.default(null),
					lastProfileId: z.coerce
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
			await assertSuccess(response, t("chat.errors.load_inbox"));
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
			await assertSuccess(response, t("chat.errors.load_messages"));
			const parsed = messagesResponseSchema.parse(
				await parseJsonSafe(response),
			);
			return {
				...parsed,
				messages: sortMessages(parsed.messages),
			};
		},

		async getMessage(params: {
			conversationId: string;
			messageId: string;
		}): Promise<Message> {
			const response = await fetchRest(
				`/v4/chat/conversation/${params.conversationId}/message/${params.messageId}`,
			);
			await assertSuccess(response, t("chat.errors.load_message"));
			return z
				.object({ message: messageSchema })
				.parse(await parseJsonSafe(response)).message;
		},

		async sendMessage(payload: SendMessagePayload): Promise<Message> {
			const safePayload = sendMessagePayloadSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/send", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, t("chat.errors.send_failed"));
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
			await assertSuccess(response, t("chat.errors.update_pin_state"));
		},

		async unpinConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}/unpin`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, t("chat.errors.update_pin_state"));
		},

		async muteConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v1/push/conversation/${conversationId}/mute`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, t("chat.errors.update_mute_state"));
		},

		async unmuteConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v1/push/conversation/${conversationId}/unmute`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, t("chat.errors.update_mute_state"));
		},

		async markRead(conversationId: string, messageId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}/read/${messageId}`,
				{
					method: "POST",
				},
			);
			await assertSuccess(response, t("chat.errors.mark_read_failed"));
		},

		async unsendMessage(payload: ChatMessageMutation) {
			const safePayload = chatMessageMutationSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/unsend", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, t("chat.errors.unsend_failed"));
		},

		async deleteMessage(payload: ChatMessageMutation) {
			const safePayload = chatMessageMutationSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/delete", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, t("chat.errors.delete_failed"));
		},

		async reactToMessage(payload: ChatReactionPayload) {
			const safePayload = chatReactionPayloadSchema.parse(payload);
			const response = await fetchRest("/v4/chat/message/reaction", {
				method: "POST",
				body: safePayload,
			});
			await assertSuccess(response, t("chat.errors.react_failed"));
		},

		async getSharedConversationImages(
			conversationId: string,
		): Promise<SharedConversationImage[]> {
			const response = await fetchRest(
				`/v5/chat/media/shared/images/with-me/${conversationId}`,
			);
			await assertSuccess(
				response,
				t("chat.errors.load_shared_images"),
			);
			const payload = await parseJsonSafe(response);
			const itemSchema = z.object({
				mediaId: z.coerce.number().int(),
				url: z.string().nullable().optional().default(null),
				expiresAt: z.coerce.number().nullable().optional().default(null),
			});
			const direct = z
				.object({ images: z.array(itemSchema).optional().default([]) })
				.safeParse(payload);
			const nested = z.array(itemSchema).safeParse(payload);
			const parsed = direct.success
				? direct.data.images
				: nested.success
					? nested.data
					: [];

			return parsed;
		},

		async listAlbums(): Promise<Album[]> {
			const response = await fetchRest("/v1/albums");
			await assertSuccess(response, t("chat.errors.load_albums"));
			const parsed = albumsResponseSchema.parse(await parseJsonSafe(response));
			return parsed.albums;
		},

		async createAlbum(albumName: string): Promise<CreateAlbumResponse> {
			const response = await fetchRest("/v2/albums", {
				method: "POST",
				body: { albumName },
			});
			await assertSuccess(response, t("chat.errors.create_album_failed"));
			return z
				.object({
					albumId: z.coerce.number().int(),
				})
				.parse(await parseJsonSafe(response));
		},

		async getAlbum(albumId: number | string): Promise<AlbumDetailsResponse> {
			const response = await fetchRest(`/v1/albums/${albumId}`);
			await assertSuccess(response, t("chat.errors.load_album_details"));
            
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

		async uploadChatMedia(
			params: UploadChatMediaParams,
		): Promise<UploadChatMediaResponse> {
			const query = new URLSearchParams({
				looping: String(params.options.looping),
				takenOnGrindr: String(params.options.takenOnGrindr),
			});

			const response = await fetchRest(
				`/v5/chat/media/upload?${query.toString()}`,
				{
					method: "POST",
					rawBody: params.multipart.body,
					contentType: params.multipart.contentType,
				},
			);

			await assertSuccess(response, t("chat.errors.upload_media_failed"));

			const parsed = z
				.object({
					mediaId: z.coerce.number().int(),
					mediaHash: z.string().nullable().optional().default(null),
					url: z.string().nullable().optional().default(null),
				})
				.parse(await parseJsonSafe(response));

			return {
				mediaId: parsed.mediaId,
				mediaHash: parsed.mediaHash,
				url: parsed.url,
			};
		},

		async uploadAlbumContent(
			params: UploadAlbumContentParams,
		): Promise<UploadAlbumContentResponse> {
			const response = await fetchRest(`/v1/albums/${params.albumId}/content`, {
				method: "POST",
				rawBody: params.multipart.body,
				contentType: params.multipart.contentType,
			});
			await assertSuccess(response, t("chat.errors.upload_media_failed"));
			return z
				.object({
					contentId: z.coerce.number().int(),
				})
				.parse(await parseJsonSafe(response));
		},

		async shareAlbum(payload: ShareAlbumPayload) {
			const safePayload = shareAlbumPayloadSchema.parse(payload);
			const response = await fetchRest(
				`/v4/albums/${safePayload.albumId}/shares`,
				{
					method: "POST",
					body: { profiles: safePayload.profiles },
				},
			);
			await assertSuccess(response, t("chat.errors.album_share_failed"));
		},
	};
}
