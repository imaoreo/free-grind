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

import { runAutomationRulesForSender } from "../utils/automationRules";
import { isReadReceiptsHidden } from "../utils/privacy";
import { ApiFunctionError, assertSuccess, parseJsonSafe } from "./apiHelpers";
import { sendViaRealtime } from "./chatRealtime";

export { ApiFunctionError as ChatApiError };

// The official app's own fixed page size for GET .../message (it hardcodes
// this too — not something the server picks on its own). Exported so local
// (chatDb-backed) pagination — archived conversations, and the "server
// exhausted" fallthrough for live ones — can match it instead of drifting.
export const MESSAGE_PAGE_LIMIT = 20;

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

const drawerMediaItemSchema = z.object({
	id: z.coerce.number().int(),
	url: z.string(),
	contentType: z.string(),
	createdTs: z.coerce.number().int(),
	used: z.boolean().optional().default(false),
	takenOnGrindr: z.boolean().optional().default(false),
});

async function parseDrawerMediaResponse(
	response: RestResponse,
	t: (key: string) => string,
): Promise<Array<z.infer<typeof drawerMediaItemSchema>>> {
	await assertSuccess(response, t("chat.errors.load_drawer_media"));
	const payload = await parseJsonSafe(response);
	const parsed = z.array(drawerMediaItemSchema).safeParse(payload);
	return parsed.success ? parsed.data : [];
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
			const safeEntries: ConversationEntry[] = [];
			for (const entry of parsed.entries) {
				const data: any = entry.data;

				const displayName = data.name || (data.participants && data.participants[0]?.displayName) || "";
				const aboutMe = data.participants?.[0]?.aboutMe || "";
				const lastMessageText = data.previewText || (data.lastMessage?.body?.text) || "";
				const profileAge = data.participants?.[0]?.age;

				// Custom automation rules — reconciles conversations that arrived
				// while the app was closed, since inbox sync lands here on launch
				// rather than through the live WS handler. Uses the age/photo
				// hash already present on the preview, no extra profile request.
				// "new_chat" (and "message_received") only fire when they messaged
				// us, not when we started the conversation — gate on the preview's
				// last message being theirs.
				const previewProfileId = data.participants?.[0]?.profileId;
				const lastMessageSenderId = data.preview?.senderId ?? data.lastMessage?.senderId;
				const lastMessageIsIncoming =
					lastMessageSenderId != null && String(lastMessageSenderId) === String(previewProfileId);
				if (previewProfileId && lastMessageIsIncoming) {
					const automationRunner = {
						blockProfile: (profileId: string) =>
							fetchRest(`/v3/me/blocks/${encodeURIComponent(profileId)}`, { method: "POST" }),
						sendText: (payload: SendTextPayload) => this.sendText(payload),
						shareAlbum: (payload: ShareAlbumPayload) => this.shareAlbum(payload),
					};
					const profileSnapshot = {
						age: profileAge,
						profileImageMediaHash: data.participants?.[0]?.primaryMediaHash ?? null,
						aboutMe: aboutMe || null,
						displayName: displayName || null,
					};
					const lastMessageId: string | undefined =
						data.preview?.messageId ?? data.lastMessage?.messageId ?? undefined;

					const { blocked: blockedByNewChat } = await runAutomationRulesForSender(
						String(previewProfileId),
						"new_chat",
						automationRunner,
						profileSnapshot,
						lastMessageText || null,
					).catch(() => ({ blocked: false, matchedRuleNames: [] }));
					if (blockedByNewChat) continue; // Do NOT show them in the inbox!

					if (lastMessageId) {
						const { blocked: blockedByMessage } = await runAutomationRulesForSender(
							String(previewProfileId),
							"message_received",
							automationRunner,
							profileSnapshot,
							lastMessageText || null,
							lastMessageId,
						).catch(() => ({ blocked: false, matchedRuleNames: [] }));
						if (blockedByMessage) continue;
					}
				}

				safeEntries.push(entry);
			}
			// ---------------------------------

			return {
				...parsed,
				entries: sortConversations(safeEntries),
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
			// Matches the official app's fixed page size for this endpoint — it was
			// never sent here before, leaving the server's own (unknown, possibly
			// inconsistent) default in charge of the actual page size.
			query.set("limit", String(MESSAGE_PAGE_LIMIT));

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
			try {
				const result = await sendViaRealtime("chat.v1.message.send", safePayload);
				return messageSchema.parse(result);
			} catch {
				// replyToMessageId is WS-only — HTTP returns 400 if included
				const { replyToMessageId: _r, ...httpPayload } = safePayload;
				const response = await fetchRest("/v4/chat/message/send", {
					method: "POST",
					body: httpPayload,
				});
				await assertSuccess(response, t("chat.errors.send_failed"));
				return messageSchema.parse(await parseJsonSafe(response));
			}
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
				replyToMessageId: safePayload.replyToMessageId,
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

		async deleteConversation(conversationId: string): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/conversation/${conversationId}`,
				{
					method: "DELETE",
				},
			);
			await assertSuccess(response, t("chat.errors.delete_conversation"));
		},

		async markRead(conversationId: string, messageId: string): Promise<void> {
 		// --- READ RECEIPTS CHECK ---
 		if (isReadReceiptsHidden(conversationId)) {
 			return; // Silently do nothing. They will never know you read it!
 		}
 		// ---------------------------

 		const response = await fetchRest(
 			`/v4/chat/conversation/${conversationId}/read/${messageId}`,
 			{ method: "POST" },
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

		async sendTypingStatus(conversationId: string, status: "Typing" | "Cleared"): Promise<void> {
			await fetchRest("/v4/chatstatus/typing", {
				method: "POST",
				body: { conversationId, status },
			});
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
			const albumDetailsSchema = z.object({
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
			});

			const v2Response = await fetchRest(`/v2/albums/${albumId}`);
			await assertSuccess(v2Response, t("chat.errors.load_album_details"));
			const v2Result = albumDetailsSchema.parse(await parseJsonSafe(v2Response));

			// v2 can come back with an empty content array for expired/locked albums
            // check v1 as a supplement in that case, but keep the (already fetched) v2 result 
            // as the fallback if v1 doesn't support this route (405) for this account/album.
			if (v2Result.content.length === 0) {
				const v1Response = await fetchRest(`/v1/albums/${albumId}`);
				if (v1Response.status === 405) {
					return v2Result;
				}
				await assertSuccess(v1Response, t("chat.errors.load_album_details"));
				return albumDetailsSchema.parse(await parseJsonSafe(v1Response));
			}

			return v2Result;
		},

		async getSharedAlbums(profileId: number | string): Promise<{
			albumId: number;
			albumName: string | null;
			contentCount: { imageCount: number; videoCount: number };
			previewContent: { contentId: number; thumbUrl: string | null; blurredUrl: string | null } | null;
		}[]> {
			const response = await fetchRest(`/v2/albums/shares/${profileId}`);
			await assertSuccess(response, t("chat.errors.load_album_details"));
			const parsed = z
				.object({
					albums: z.array(
						z.object({
							albumId: z.coerce.number().int(),
							albumName: z.string().nullable().optional().default(null),
							contentCount: z.object({
								imageCount: z.number().int().optional().default(0),
								videoCount: z.number().int().optional().default(0),
							}).optional().default({ imageCount: 0, videoCount: 0 }),
							content: z.object({
								contentId: z.coerce.number().int(),
								thumbUrl: z.string().nullable().optional().default(null),
								blurredUrl: z.string().nullable().optional().default(null),
							}).nullable().optional().default(null),
						}),
					).optional().default([]),
				})
				.parse(await parseJsonSafe(response));
			return parsed.albums.map((a) => ({
				albumId: a.albumId,
				albumName: a.albumName ?? null,
				contentCount: a.contentCount,
				previewContent: a.content
					? { contentId: a.content.contentId, thumbUrl: a.content.thumbUrl ?? null, blurredUrl: a.content.blurredUrl ?? null }
					: null,
			}));
		},

		async getAlbumContentPoster(albumId: number | string, contentId: number | string): Promise<{ posterUrl: string | null; blurredPosterUrl: string | null }> {
			const response = await fetchRest(`/v1/albums/${albumId}/content/${contentId}/poster`);
			await assertSuccess(response, t("chat.errors.load_album_details"));
			return z
				.object({
					posterUrl: z.string().nullable().optional().default(null),
					blurredPosterUrl: z.string().nullable().optional().default(null),
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
			if (params.options.durationSeconds != null) {
				query.set("length", String(params.options.durationSeconds));
			}

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
					expiresAt: z.coerce.number().nullable().optional().default(null),
				})
				.parse(await parseJsonSafe(response));

			return {
				mediaId: parsed.mediaId,
				mediaHash: parsed.mediaHash,
				url: parsed.url,
				expiresAt: parsed.expiresAt,
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

		async stopAlbumShare(albumId: number, recipientProfileId: number) {
			const response = await fetchRest(
				`/v1/albums/${albumId}/unshares`,
				{
					method: "PUT",
					body: { profiles: [{ profileId: recipientProfileId, shareId: 0 }] },
				},
			);
			await assertSuccess(response, t("chat.errors.album_share_failed"));
		},

		async getDrawerMedia(
			conversationId: string,
		): Promise<Array<{
			id: number;
			url: string;
			contentType: string;
			createdTs: number;
			used: boolean;
			takenOnGrindr: boolean;
		}>> {
			const response = await fetchRest(
				`/v4/chat/media/drawer/${conversationId}`,
			);
			return parseDrawerMediaResponse(response, t);
		},

		// Same drawer contents, without the "used in this conversation" flag —
		// used before a conversation exists yet (e.g. starting a chat from a
		// profile), since /v4/chat/media/drawer/{conversationId} has no
		// conversation-less variant.
		async getGlobalDrawerMedia(): Promise<Array<{
			id: number;
			url: string;
			contentType: string;
			createdTs: number;
			used: boolean;
			takenOnGrindr: boolean;
		}>> {
			const response = await fetchRest("/v4/chat/media/drawer");
			return parseDrawerMediaResponse(response, t);
		},

		async addMediaToDrawer(mediaId: number): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/media/drawer/${mediaId}`,
				{ method: "PUT" },
			);
			await assertSuccess(response, t("chat.errors.upload_media_failed"));
		},

		async deleteDrawerMedia(mediaId: number): Promise<void> {
			const response = await fetchRest(
				`/v4/chat/media/drawer/${mediaId}`,
				{ method: "DELETE" },
			);
			await assertSuccess(response, t("chat.errors.delete_failed"));
		},
	};
}
