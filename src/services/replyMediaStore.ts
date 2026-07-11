/**
 * replyMediaStore.ts — eager fetch-and-store of reply-quote/reaction preview
 * thumbnails into chatDb, mirroring mediaStore.ts/albumStore.ts's capture
 * pattern for a message's own media.
 *
 * Reply-to-picture, ProfilePhotoReply, and AlbumContentReply/Reaction
 * messages all render a small preview image resolved from a hash-derived
 * CDN URL or a live `previewUrl` embedded on the message body. Neither of
 * those goes through the existing media_files/album_media caches, so once
 * the referenced content is gone (hash 404s, share revoked/expired) the
 * preview breaks even though the rest of the app is built to survive that.
 * Capturing them the same way closes that gap.
 */

import { fetchAndStoreMedia } from "./mediaStore";
import { captureAlbumContentThumbFromMessage } from "./albumStore";
import { getReplyImageHashTarget, getAlbumContentReplyTarget } from "../pages/app/chat/chatUtils";
import type { UiMessage } from "../types/chat-page";

/**
 * Scans a batch of messages for reply-quote/reaction previews and eagerly
 * captures each one (fire-and-forget). Safe to call repeatedly for the same
 * messages — the underlying stores dedupe in-flight fetches and skip
 * anything already cached.
 */
export function captureReplyPreviewsForMessages(
	messages: UiMessage[],
	conversationId: string,
): void {
	for (const message of messages) {
		const hashTarget = getReplyImageHashTarget(message);
		if (hashTarget) {
			void fetchAndStoreMedia({
				mediaKey: hashTarget.mediaKey,
				kind: "image",
				url: hashTarget.url,
				conversationId,
				// Not this message's own media — it's what this message is
				// *quoting* (a reply-to-picture/ProfilePhotoReply preview).
				// Associating it with this message's id here would make
				// getMediaFileByMessageId's own-media fallback (see
				// mediaStore.ts) resolve the quoted photo as if it were this
				// message's own attached image, rendering it full-size above
				// the reply-quote bar, and would also leak it into the
				// conversation's "shared media" gallery.
				messageId: null,
				viewOnce: false,
				isOwnMessage: false,
				skipAutoDownload: true,
			});
		}

		const albumContentTarget = getAlbumContentReplyTarget(message);
		if (albumContentTarget) {
			captureAlbumContentThumbFromMessage(
				albumContentTarget.albumId,
				albumContentTarget.contentId,
				albumContentTarget.contentType,
				albumContentTarget.previewUrl,
			);
		}
	}
}
