import i18n from "../../../i18n";
import { useEffect, useState } from "react";
import type { ConversationEntry, InboxFilters, Message } from "../../../types/messages";
import type { UiMessage } from "../../../types/chat-page";
import {
	getProfileImageUrl,
	getThumbImageUrl,
	validateMediaHash,
} from "../../../utils/media";
import blankProfileImage from "../../../images/blank-profile.png";
import { appLog } from "../../../utils/logger";

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
	locale?: string,
): string {
	if (!timestamp) {
		return "";
	}

	const lang = locale || i18n.language;
	const inboxRelativeTime = getRelativeTimeFormatter(lang, {
		numeric: "auto",
	});

	const now = Date.now();
	const diffMs = timestamp - now;
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;
	const dayMs = 24 * hourMs;

	if (Math.abs(diffMs) < hourMs) {
		return inboxRelativeTime.format(Math.round(diffMs / minuteMs), "minute");
	}

	if (Math.abs(diffMs) < dayMs) {
		return inboxRelativeTime.format(Math.round(diffMs / hourMs), "hour");
	}

	if (Math.abs(diffMs) < dayMs * 7) {
		return inboxRelativeTime.format(Math.round(diffMs / dayMs), "day");
	}

	return new Date(timestamp).toLocaleDateString();
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
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return t("chat.preview.shared_album");
		case "Audio":
			return t("chat.preview.sent_audio");
		case "AlbumContentReaction":
			return t("chat.preview.reacted_album_content");
		case "Video":
			return t("chat.preview.sent_video");
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
		case "Album":
		case "ExpiringAlbum":
		case "ExpiringAlbumV2":
			return t("chat.preview.shared_album");
		case "Audio":
			return t("chat.preview.sent_audio");
		case "AlbumContentReaction":
			return t("chat.preview.reacted_album_content");
		case "Video":
			return t("chat.preview.sent_video");
		default:
			return t("chat.preview.sent_message");
	}
}

export function getMessageText(message: UiMessage, t: TranslateFn): string {
	if (!message.body || typeof message.body !== "object") {
		if (message.unsent) {
			return t("chat.thread.unsent");
		}
		if (message.type === "Image" || message.type === "ExpiringImage") {
			return t("chat.thread.image_placeholder");
		}
		if (message.type === "Video") {
			return t("chat.thread.video_placeholder");
		}
		if (message.type === "Audio") {
			return t("chat.thread.audio_placeholder");
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

	if (message.type === "Video") {
		return t("chat.thread.shared_video");
	}

	if (message.type === "Audio") {
		return t("chat.thread.shared_audio");
	}

	if (message.type === "AlbumContentReaction") {
		return t("chat.preview.reacted_album_content");
	}

	return `[${message.type}]`;
}

export function getMessageImageUrl(message: UiMessage): string | null {
	const imageType = message.chat1Type?.toLowerCase();
	const isImageMessage =
		message.type === "Image" ||
		message.type === "ExpiringImage" ||
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
				appLog.debug("Found image URL candidate:", { candidate, normalized });
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
	const isVideoMessage = message.type === "Video" || mediaType === "video";
	if (!isVideoMessage) {
		return null;
	}

	if (!message.body || typeof message.body !== "object") {
		return null;
	}

	const body = message.body as Record<string, unknown>;
	const candidates: unknown[] = [
		body.videoUrl,
		body.url,
		body.mediaUrl,
		body.signedUrl,
		(body.video as Record<string, unknown> | null)?.url,
	];

	for (const candidate of candidates) {
		if (typeof candidate === "string" && candidate.length > 0) {
			appLog.debug("Found video URL candidate:", { candidate });
			return candidate;
		}
	}

	return null;
}

export function getParticipantAvatarUrl(hash: string | null | undefined): string {
	if (!hash || !validateMediaHash(hash)) {
		return blankProfileImage;
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
): { isOnline: boolean; label: string } {
	const hasLastOnline =
		typeof lastOnline === "number" && Number.isFinite(lastOnline);
	const hasOnlineUntil =
		typeof onlineUntil === "number" && Number.isFinite(onlineUntil);
	const minuteMs = 60 * 1000;
	const hourMs = 60 * minuteMs;
	const dayMs = 24 * hourMs;

	if (!hasLastOnline && !hasOnlineUntil) {
		return { isOnline: false, label: "Offline" };
	}

	if (hasOnlineUntil && (onlineUntil as number) > nowTimestamp) {
		const minsLeft = Math.max(
			1,
			Math.ceil(((onlineUntil as number) - nowTimestamp) / minuteMs),
		);
		return {
			isOnline: true,
			label: `Online (${minsLeft} min${minsLeft === 1 ? "" : "s"} left)`,
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
			label: `${minsAgo} min${minsAgo === 1 ? "" : "s"} ago`,
		};
	}

	if (diffMs < dayMs) {
		const hoursAgo = Math.floor(diffMs / hourMs);
		return {
			isOnline: false,
			label: `${hoursAgo} hour${hoursAgo === 1 ? "" : "s"} ago`,
		};
	}

	const daysAgo = Math.floor(diffMs / dayMs);
	return {
		isOnline: false,
		label: `${daysAgo} day${daysAgo === 1 ? "" : "s"} ago`,
	};
}

export function useDesktopBreakpoint() {
	const [isDesktop, setIsDesktop] = useState(() =>
		typeof window !== "undefined"
			? window.matchMedia("(min-width: 1024px)").matches
			: false,
	);

	useEffect(() => {
		const query = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(query.matches);
		update();
		query.addEventListener("change", update);
		return () => query.removeEventListener("change", update);
	}, []);

	return isDesktop;
}
