import i18n from "../../../i18n";
import { useEffect, useState } from "react";
import type { ConversationEntry, InboxFilters, Message } from "../../../types/messages";
import type { UiMessage } from "../../../types/chat-page";
import type { MediaKind } from "../../../types/chat-db";
import {
	getProfileImageUrl,
	getThumbImageUrl,
	validateMediaHash,
} from "../../../utils/media";
import { formatRelativeTime } from "../../../utils/relativeTime";

export type ChatFiltersDraft = {
	unreadOnly: boolean;
	chemistryOnly: boolean;
	favoritesOnly: boolean;
	rightNowOnly: boolean;
	onlineNowOnly: boolean;
	distanceMeters: string;
	positions: number[];
};

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

export function isNumberArray(value: unknown): value is number[] {
	return Array.isArray(value) && value.every((item) => typeof item === "number");
}

export function buildChatFiltersDraft(filters: InboxFilters): ChatFiltersDraft {
	return {
		unreadOnly: filters.unreadOnly === true,
		chemistryOnly: filters.chemistryOnly === true,
		favoritesOnly: filters.favoritesOnly === true,
		rightNowOnly: filters.rightNowOnly === true,
		onlineNowOnly: filters.onlineNowOnly === true,
		distanceMeters:
			typeof filters.distanceMeters === "number"
				? String(filters.distanceMeters)
				: "",
		positions: filters.positions ?? [],
	};
}

export function draftToFilters(draft: ChatFiltersDraft): InboxFilters {
	const distanceMeters =
		typeof draft.distanceMeters === "string" && draft.distanceMeters.trim() !== ""
			? Number(draft.distanceMeters)
			: undefined;
	return {
		unreadOnly: draft.unreadOnly || undefined,
		chemistryOnly: draft.chemistryOnly || undefined,
		favoritesOnly: draft.favoritesOnly || undefined,
		rightNowOnly: draft.rightNowOnly || undefined,
		onlineNowOnly: draft.onlineNowOnly || undefined,
		positions:
			isNumberArray(draft.positions) && draft.positions.length > 0
				? draft.positions
				: undefined,
		distanceMeters:
			typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
				? distanceMeters
				: undefined,
	};
}

export function parseChatFiltersFromLocationState(state: unknown): InboxFilters | null {
	const safe =
		typeof state === "object" && state !== null
			? (state as { inboxFiltersDraft?: Partial<ChatFiltersDraft> })
			: {};
	const draft = safe.inboxFiltersDraft;

	if (!draft) {
		return null;
	}

	const distanceMeters =
		typeof draft.distanceMeters === "string" && draft.distanceMeters.trim() !== ""
			? Number(draft.distanceMeters)
			: undefined;

	return {
		unreadOnly: draft.unreadOnly === true ? true : undefined,
		chemistryOnly: draft.chemistryOnly === true ? true : undefined,
		favoritesOnly: draft.favoritesOnly === true ? true : undefined,
		rightNowOnly: draft.rightNowOnly === true ? true : undefined,
		onlineNowOnly: draft.onlineNowOnly === true ? true : undefined,
		positions:
			isNumberArray(draft.positions) && draft.positions.length > 0
				? draft.positions
				: undefined,
		distanceMeters:
			typeof distanceMeters === "number" && Number.isFinite(distanceMeters)
				? distanceMeters
				: undefined,
	};
}

export async function buildBinaryUpload(file: File): Promise<{
	body: Uint8Array;
	contentType: string;
}> {
	const fileBytes = new Uint8Array(await file.arrayBuffer());
	return {
		body: fileBytes,
		contentType: file.type || "application/octet-stream",
	};
}

const relativeTimeFormatterCache = new Map<string, Intl.RelativeTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getRelativeTimeFormatter(lng: string, options: Intl.RelativeTimeFormatOptions) {
	const key = `${lng}-${JSON.stringify(options)}`;
	if (!relativeTimeFormatterCache.has(key)) {
		relativeTimeFormatterCache.set(key, new Intl.RelativeTimeFormat(lng, options));
	}
	return relativeTimeFormatterCache.get(key)!;
}

function getDateTimeFormatter(lng: string, options: Intl.DateTimeFormatOptions) {
	const key = `${lng}-${JSON.stringify(options)}`;
	if (!dateTimeFormatterCache.has(key)) {
		dateTimeFormatterCache.set(key, new Intl.DateTimeFormat(lng, options));
	}
	return dateTimeFormatterCache.get(key)!;
}

export function formatConversationTime(
	timestamp: number | null | undefined,
): string {
	return formatRelativeTime(timestamp);
}

export function formatMessageTime(
	timestamp: number,
	now: number,
	t: TranslateFn,
): string {
	const diffMs = now - timestamp;
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;

	if (diffMs < hourMs) {
		const minsAgo = Math.max(0, Math.floor(diffMs / minuteMs));
		if (minsAgo <= 1) {
			return t("chat.time.one_min_ago");
		}
		return t("chat.time.mins_ago", { count: minsAgo });
	}

	return new Date(timestamp).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatDateTime24(timestamp: number): string {
	const date = new Date(timestamp);
	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = String(date.getFullYear()).slice(-2);
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");

	return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Determines the date header label for grouping messages in the chat thread.
 * Returns "Today", "Yesterday", a weekday (e.g., "Monday"), or a formatted date.
 */
export function formatDateHeader(
	timestamp: number,
	now: number,
	t: TranslateFn,
): string {
	const msgDate = new Date(timestamp);
	const nowDate = new Date(now);

	const isSameDay = (d1: Date, d2: Date) =>
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate();

	if (isSameDay(msgDate, nowDate)) {
		return t("chat.today");
	}

	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);
	if (isSameDay(msgDate, yesterday)) {
		return t("chat.yesterday");
	}

	const oneWeekAgo = new Date(now);
	oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

	if (msgDate > oneWeekAgo) {
		const formatter = getDateTimeFormatter(i18n.language, { weekday: "long" });
		return formatter.format(msgDate);
	}

	const formatter = getDateTimeFormatter(i18n.language, {
		day: "numeric",
		month: "long",
		year:
			msgDate.getFullYear() === nowDate.getFullYear() ? undefined : "numeric",
	});

	return formatter.format(msgDate);
}

export function getPreviewText(conversation: ConversationEntry, t: TranslateFn): string {
	const preview = conversation.data.preview;
	if (!preview) {
		return t("chat.no_messages_yet");
	}

	if (preview.text?.trim()) {
		return preview.text;
	}

	switch (preview.type) {
		case "Image":
		case "ExpiringImage":
			return t("chat.preview.sent_image");
		case "Giphy":
			return t("chat.preview.sent_gif");
		case "Gaymoji":
			return t("chat.preview.sent_gaymoji");
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return t("chat.preview.shared_album");
		case "Audio":
			return t("chat.preview.sent_audio");
		case "AlbumContentReaction":
			return t("chat.preview.reacted_album_content");
		case "Video":
		case "PrivateVideo":
		case "NonExpiringVideo":
			return t("chat.preview.sent_video");
		case "Location":
			return t("chat.preview.sent_location");
		default:
			return t("chat.preview.sent_message");
	}
}

export function getMessagePreviewLabel(message: Message, t: TranslateFn): string {
	if (
		typeof (message.body as Record<string, unknown> | null)?.text === "string"
	) {
		return String((message.body as Record<string, unknown>).text);
	}

	switch (message.type) {
		case "Image":
		case "ExpiringImage":
			return t("chat.preview.sent_image");
		case "Giphy":
			return t("chat.preview.sent_gif");
		case "Gaymoji":
			return t("chat.preview.sent_gaymoji");
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return t("chat.preview.shared_album");
		case "Audio":
			return t("chat.preview.sent_audio");
		case "AlbumContentReaction":
			return t("chat.preview.reacted_album_content");
		case "Video":
		case "PrivateVideo":
		case "NonExpiringVideo":
			return t("chat.preview.sent_video");
		case "Location":
			return t("chat.preview.sent_location");
		default:
			return t("chat.preview.sent_message");
	}
}

// Types getPreviewText/getMessagePreviewLabel can render a specific label
// for. Anything else with no text falls through to the generic "Sent a
// message" — which we'd rather replace with the real last message when we
// have local history for it.
const SELF_EXPLANATORY_PREVIEW_TYPES = new Set([
	"Image",
	"ExpiringImage",
	"Giphy",
	"Gaymoji",
	"Album",
	"ExpiringAlbum",
	"ExpiringAlbumV2",
	"Audio",
	"AlbumContentReaction",
	"Video",
	"PrivateVideo",
	"NonExpiringVideo",
	"Location",
]);

/**
 * Whether a conversation's preview is worth showing as-is, or should be
 * replaced with one derived from local history instead — covers both a
 * missing preview (e.g. last message was unsent server-side) and a present
 * but textless, unrecognized-type preview that would otherwise render as a
 * generic "Sent a message".
 */
export function isPreviewUnhelpful(
	preview: ConversationEntry["data"]["preview"],
): boolean {
	if (!preview) {
		return true;
	}
	if (preview.text?.trim()) {
		return false;
	}
	return !preview.type || !SELF_EXPLANATORY_PREVIEW_TYPES.has(preview.type);
}

/**
 * Builds an inbox-preview object from an actual message, for when the live
 * API's own preview is unusable (e.g. null — seen when the last message was
 * unsent server-side, even though earlier history exists). Used as a local
 * fallback so the inbox row shows the last real message instead of "no
 * messages yet" on a conversation that clearly has history.
 */
export function buildPreviewFromMessage(
	message: Message,
	t: TranslateFn,
): NonNullable<ConversationEntry["data"]["preview"]> {
	return {
		conversationId: { value: message.conversationId },
		messageId: message.messageId,
		senderId: message.senderId,
		type: message.type,
		chat1Type: message.chat1Type ?? "text",
		text: getMessagePreviewLabel(message, t),
		albumId: null,
		imageHash: null,
	};
}

export function getMessageText(message: UiMessage, t: TranslateFn): string {
	if (!message.body || typeof message.body !== "object") {
		if (message.unsent) {
			return t("chat.thread.unsent");
		}
		if (message.type === "Image" || message.type === "ExpiringImage") {
			return t("chat.thread.image_placeholder");
		}
		if (message.type === "Video" || message.type === "PrivateVideo" || message.type === "NonExpiringVideo") {
			return t("chat.thread.video_placeholder");
		}
		if (message.type === "Audio") {
			return t("chat.thread.audio_placeholder");
		}
		if (message.type === "Location") {
			return t("chat.thread.location_placeholder");
		}
		return t("chat.thread.unsupported_placeholder");
	}

	const body = message.body as Record<string, unknown>;
	if (typeof body.text === "string" && body.text.trim().length > 0) {
		return body.text;
	}

	if (
		message.type === "Album" ||
		message.type === "ExpiringAlbum" ||
		message.type === "ExpiringAlbumV2"
	) {
		return t("chat.preview.shared_album");
	}

	if (message.type === "Image" || message.type === "ExpiringImage") {
		return t("chat.thread.shared_image");
	}

	if (message.type === "Giphy") {
		return t("chat.thread.shared_gif");
	}

	if (message.type === "Gaymoji") {
		return "";
	}

	if (message.type === "Video" || message.type === "PrivateVideo" || message.type === "NonExpiringVideo") {
		return t("chat.thread.shared_video");
	}

	if (message.type === "Audio") {
		return t("chat.thread.shared_audio");
	}

	if (message.type === "Location") {
		return t("chat.preview.sent_location");
	}

	if (message.type === "AlbumContentReaction") {
		return t("chat.preview.reacted_album_content");
	}

	if (message.type === "ProfilePhotoReply") {
		const body = message.body as Record<string, unknown> | null | undefined;
		const replyContent = body?.photoContentReply;
		if (typeof replyContent === "string" && replyContent.trim().length > 0) {
			return replyContent.trim();
		}
		return t("chat.preview.replied_profile_photo");
	}

	if (message.type === "AlbumContentReply") {
		const body = message.body as Record<string, unknown> | null | undefined;
		const replyText = body?.albumContentReply;
		if (typeof replyText === "string" && replyText.trim().length > 0) {
			return replyText.trim();
		}
		return t("chat.preview.reacted_album_content");
	}

	return `[${message.type}]`;
}

export function getMessageImageUrl(message: UiMessage): string | null {
	const imageType = message.chat1Type?.toLowerCase();
	const isImageMessage =
		message.type === "Image" ||
		message.type === "ExpiringImage" ||
		message.type === "Giphy" ||
		imageType === "image" ||
		imageType === "expiring_image";

	if (!isImageMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const imageRecord =
		typeof body.image === "object" && body.image
			? (body.image as Record<string, unknown>)
			: null;

	const collectStringValues = (
		value: unknown,
		depth: number,
		out: string[],
	): void => {
		if (depth > 3) {
			return;
		}

		if (typeof value === "string") {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				out.push(trimmed);
			}
			return;
		}

		if (!value || typeof value !== "object") {
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				collectStringValues(item, depth + 1, out);
			}
			return;
		}

		for (const nested of Object.values(value)) {
			collectStringValues(nested, depth + 1, out);
		}
	};

	const normalizeUrlCandidate = (candidate: string): string | null => {
		if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
			return candidate;
		}

		if (candidate.startsWith("/")) {
			return `https://cdns.grindr.com${candidate}`;
		}

		// Some payloads return CloudFront path without scheme.
		if (candidate.startsWith("d2wxe7lth7kp8g.cloudfront.net/")) {
			return `https://${candidate}`;
		}

		return null;
	};
	const urlCandidates: unknown[] = [
		body.url,
		body.imageUrl,
		body.mediaUrl,
		body.previewUrl,
		body.thumbUrl,
		body.signedUrl,
		body.cdnUrl,
		body.urlPath,
		imageRecord?.url,
		imageRecord?.imageUrl,
		imageRecord?.mediaUrl,
		imageRecord?.thumbUrl,
		imageRecord?.previewUrl,
		imageRecord?.signedUrl,
		imageRecord?.cdnUrl,
	];

	for (const candidate of urlCandidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			const normalized = normalizeUrlCandidate(candidate);
			if (normalized) {
				// appLog.debug("Found image URL candidate:", { candidate, normalized });
				return normalized;
			}
		}
	}

	const discoveredStrings: string[] = [];
	collectStringValues(body, 0, discoveredStrings);
	for (const value of discoveredStrings) {
		const normalized = normalizeUrlCandidate(value);
		if (normalized) {
			return normalized;
		}
	}

	const hashCandidates: unknown[] = [
		body.imageHash,
		body.mediaHash,
		body.hash,
		body.fileCacheKey,
		imageRecord?.imageHash,
		imageRecord?.mediaHash,
		imageRecord?.hash,
		imageRecord?.fileCacheKey,
	];

	for (const hashCandidate of hashCandidates) {
		if (typeof hashCandidate !== "string") {
			continue;
		}

		const normalized = hashCandidate.trim();
		if (!normalized) {
			continue;
		}

		if (validateMediaHash(normalized)) {
			return getThumbImageUrl(normalized, "480x480");
		}

		// Fallback: some payloads send non-canonical hash-like values.
		if (/^[a-z0-9_-]{16,}$/i.test(normalized)) {
			return getThumbImageUrl(normalized, "480x480");
		}
	}

	return null;
}

export function getMessageTakenOnGrindr(message: UiMessage): boolean {
	if (!message.body || typeof message.body !== "object") {
		return false;
	}

	const body = message.body as Record<string, unknown>;
	return body.takenOnGrindr === true;
}

export function getMessageImageCreatedAt(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidate = body.createdAt;
	const parsed =
		typeof candidate === "number"
			? candidate
			: typeof candidate === "string"
				? Number(candidate)
				: NaN;

	if (!Number.isFinite(parsed)) {
		return null;
	}

	// Some payloads use seconds while others use milliseconds.
	return parsed < 100_000_000_000 ? parsed * 1000 : parsed;
}

export function getMessageMediaId(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidate = body.mediaId;
	if (typeof candidate === "number" && Number.isFinite(candidate)) {
		return candidate;
	}
	if (typeof candidate === "string" && candidate.trim().length > 0) {
		const parsed = Number(candidate);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function extractImageHashFromSignedUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		const pathParts = parsed.pathname.split("/").filter(Boolean);
		// Chat media URL format is typically /{uploaderProfileId}/{mediaHash}
		const hashCandidate = pathParts[pathParts.length - 1] ?? "";
		if (!hashCandidate) {
			return null;
		}
		if (validateMediaHash(hashCandidate)) {
			return hashCandidate;
		}
		return /^[a-z0-9_-]{16,}$/i.test(hashCandidate) ? hashCandidate : null;
	} catch {
		return null;
	}
}

export function getMessageAudioUrl(message: UiMessage): string | null {
	const isAudioMessage =
		message.type === "Audio" || message.chat1Type?.toLowerCase() === "audio";
	if (!isAudioMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidates: unknown[] = [
		body.audioUrl,
		body.url,
		body.mediaUrl,
		(body.audio as Record<string, unknown> | null)?.url,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			return candidate;
		}
	}

	return null;
}

export function getMessageVideoUrl(message: UiMessage): string | null {
	const mediaType = message.chat1Type?.toLowerCase();
	const isVideoMessage = message.type === "Video" || message.type === "PrivateVideo" || message.type === "NonExpiringVideo" || mediaType === "video" ||mediaType === "privatevideo" || mediaType === "nonexpiringvideo";
	if (!isVideoMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const videoRecord =
		typeof body.video === "object" && body.video
			? (body.video as Record<string, unknown>)
			: null;

	const normalizeUrl = (candidate: string): string | null => {
		if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
			return candidate;
		}
		if (candidate.startsWith("/")) {
			return `https://cdns.grindr.com${candidate}`;
		}
		if (candidate.startsWith("d2wxe7lth7kp8g.cloudfront.net/")) {
			return `https://${candidate}`;
		}
		return null;
	};

	const candidates: unknown[] = [
		body.videoUrl,
		body.url,
		body.mediaUrl,
		body.signedUrl,
		body.cdnUrl,
		videoRecord?.url,
		videoRecord?.videoUrl,
		videoRecord?.mediaUrl,
		videoRecord?.signedUrl,
		videoRecord?.cdnUrl,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			const normalized = normalizeUrl(candidate);
			if (normalized) {
				// appLog.debug("Found video URL candidate:", { candidate, normalized });
				return normalized;
			}
		}
	}

	return null;
}

function getMessageImageHash(message: UiMessage): string | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}
	const body = message.body as Record<string, unknown>;
	const candidates: unknown[] = [
		body.imageHash,
		body.mediaHash,
		body.hash,
		body.fileCacheKey,
	];
	for (const candidate of candidates) {
		if (typeof candidate !== "string") {
			continue;
		}
		const trimmed = candidate.trim();
		if (
			trimmed &&
			(validateMediaHash(trimmed) || /^[a-z0-9_-]{16,}$/i.test(trimmed))
		) {
			return trimmed;
		}
	}
	return null;
}

/**
 * Stable, resend-invariant key for caching a message's media bytes in
 * chatDb's media_files table. Images prefer a content hash (survives
 * resend/re-fetch since the signed URL's query string changes every time);
 * video/audio have no hash field so they fall back to mediaId or the
 * messageId itself.
 */
export function getMediaKeyForMessage(
	message: UiMessage,
	kind: "image" | "video" | "audio",
): string {
	if (kind === "image") {
		const hash = getMessageImageHash(message);
		if (hash) {
			return `image:${hash}`;
		}
		const url = getMessageImageUrl(message);
		const urlHash = url ? extractImageHashFromSignedUrl(url) : null;
		if (urlHash) {
			return `image:${urlHash}`;
		}
		const mediaId = getMessageMediaId(message);
		if (mediaId != null) {
			return `image:media:${mediaId}`;
		}
		return `image:msg:${message.messageId}`;
	}

	if (kind === "video") {
		const mediaId = getMessageMediaId(message);
		if (mediaId != null) {
			return `video:media:${mediaId}`;
		}
		return `video:msg:${message.messageId}`;
	}

	return `audio:msg:${message.messageId}`;
}

export type MediaCaptureTarget = {
	mediaKey: string;
	kind: MediaKind;
	url: string;
	viewOnce: boolean;
};

// Sender-side code (ChatPage.tsx) uses this exact sentinel for "unlimited"
// (e.g. `setAttachmentMaxViews(2147483647)`, `views = maxViews ?? 2147483647`).
// Anything below it — 1 ("view once"), 2 ("view twice"), or any other finite
// count — is a limited view, not just exactly 1.
const UNLIMITED_VIEWS = 2_147_483_647;

function isViewLimitedMessage(message: UiMessage): boolean {
	const body = message.body as Record<string, unknown> | null | undefined;
	const maxViews = typeof body?.maxViews === "number" ? body.maxViews : null;
	const viewsRemaining =
		typeof body?.viewsRemaining === "number" ? body.viewsRemaining : null;
	const candidate = maxViews ?? viewsRemaining;

	if (candidate != null) {
		return candidate > 0 && candidate < UNLIMITED_VIEWS;
	}

	// No explicit view-limit field on the body — fall back to the type string.
	return message.type === "ExpiringImage" || message.type === "PrivateVideo";
}

/**
 * Whatever this message's media is (if any) and however its URL was
 * resolved, this is what should be eagerly captured into chatDb's
 * media_files table. Giphy is intentionally excluded — it's third-party,
 * non-expiring CDN content, not Grindr media subject to URL expiry.
 */
export function getMediaCaptureTarget(message: UiMessage): MediaCaptureTarget | null {
	if (message.type === "Giphy") {
		return null;
	}

	const imageUrl = getMessageImageUrl(message);
	if (imageUrl) {
		return {
			mediaKey: getMediaKeyForMessage(message, "image"),
			kind: "image",
			url: imageUrl,
			viewOnce: isViewLimitedMessage(message),
		};
	}

	const videoUrl = getMessageVideoUrl(message);
	if (videoUrl) {
		return {
			mediaKey: getMediaKeyForMessage(message, "video"),
			kind: "video",
			url: videoUrl,
			viewOnce: isViewLimitedMessage(message),
		};
	}

	const audioUrl = getMessageAudioUrl(message);
	if (audioUrl) {
		return {
			mediaKey: getMediaKeyForMessage(message, "audio"),
			kind: "audio",
			url: audioUrl,
			viewOnce: false,
		};
	}

	return null;
}

export function getMessageLocation(
	message: UiMessage,
): { lat: number; lon: number } | null {
	const isLocation =
		message.type === "Location" || message.chat1Type?.toLowerCase() === "map";
	if (!isLocation) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const lat = Number(body.lat ?? (body.map as any)?.lat);
	const lon = Number(body.lon ?? (body.map as any)?.lon);

	if (Number.isFinite(lat) && Number.isFinite(lon)) {
		return { lat, lon };
	}

	return null;
}

export function getParticipantAvatarUrl(hash: string | null | undefined): string | null {
	if (!hash || !validateMediaHash(hash)) {
		return null;
	}

	return getProfileImageUrl(hash);
}

export function isLocalClientMessageId(messageId: string): boolean {
	return (
		messageId.startsWith("local:") || messageId.startsWith("local-upload:")
	);
}

export function getMessageAlbumId(message: UiMessage): number | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}
	const body = message.body as Record<string, unknown>;
	const rawAlbumId = body.albumId;
	const parsed =
		typeof rawAlbumId === "number"
			? rawAlbumId
			: typeof rawAlbumId === "string"
				? Number(rawAlbumId)
				: NaN;
	return Number.isFinite(parsed) ? parsed : null;
}

export function getMessageAlbumCoverUrl(message: UiMessage): string | null {
	if (!message.body || typeof message.body !== "object") {
		return null;
	}
	const body = message.body as Record<string, unknown>;
	if (typeof body.coverUrl === "string" && body.coverUrl.length > 0) {
		return body.coverUrl;
	}
	if (typeof body.previewUrl === "string" && body.previewUrl.length > 0) {
		return body.previewUrl;
	}
	return null;
}

export function getOtherParticipant(
	conversation: ConversationEntry,
	userId: number | null,
) {
	return (
		conversation.data.participants.find(
			(participant) => participant.profileId !== userId,
		) ??
		conversation.data.participants[0] ??
		null
	);
}

export function getParticipantOnlineMeta(
	lastOnline: number | null | undefined,
	onlineUntil: number | null | undefined,
	nowTimestamp: number,
	t: TranslateFn,
): { isOnline: boolean; label: string } {
	// lastOnline/onlineUntil of 0 is the server's "unknown/hidden" sentinel,
	// not a real epoch timestamp — treat it the same as null/undefined,
	// otherwise it renders as tens of thousands of days ago.
	const hasLastOnline =
		typeof lastOnline === "number" && Number.isFinite(lastOnline) && lastOnline > 0;
	const hasOnlineUntil =
		typeof onlineUntil === "number" && Number.isFinite(onlineUntil) && onlineUntil > 0;
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;
	const dayMs = 24 * hourMs;

	if (!hasLastOnline && !hasOnlineUntil) {
		return { isOnline: false, label: t("browse_page.status_offline") };
	}

	if (hasOnlineUntil && (onlineUntil as number) > nowTimestamp) {
		const minsLeft = Math.max(
			1,
			Math.ceil(((onlineUntil as number) - nowTimestamp) / minuteMs),
		);
		return {
			isOnline: true,
			label: t("browse_page.status_online_left", { count: minsLeft }),
		};
	}

	const referenceTimestamp = hasLastOnline
		? (lastOnline as number)
		: (onlineUntil as number);
	const diffMs = Math.max(0, nowTimestamp - referenceTimestamp);

	if (diffMs < hourMs) {
		const minsAgo = Math.max(1, Math.floor(diffMs / minuteMs));
		return {
			isOnline: false,
			label: t("browse_page.status_minutes_ago", { count: minsAgo }),
		};
	}

	if (diffMs < dayMs) {
		const hoursAgo = Math.floor(diffMs / hourMs);
		return {
			isOnline: false,
			label: t("browse_page.status_hours_ago", { count: hoursAgo }),
		};
	}

	const daysAgo = Math.floor(diffMs / dayMs);
	return {
		isOnline: false,
		label: t("browse_page.status_days_ago", { count: daysAgo }),
	};
}

export { useDesktopBreakpoint } from "../../../hooks/useDesktopBreakpoint";

export function getGaymojiUrl(message: UiMessage): string | null {
	if (message.type !== "Gaymoji") return null;
	const body = message.body as Record<string, unknown> | null | undefined;
	const imageHash = typeof body?.imageHash === "string" ? body.imageHash : null;
	if (!imageHash) return null;
	const path = imageHash.startsWith("/") ? imageHash : `/${imageHash}`;
	return `https://cdns.grindr.com/grindr/chat${path}`;
}
