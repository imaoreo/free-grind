package dev.estopia.free_grind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * Shared notification-rendering pipeline, called from both the FCM service
 * (background/killed delivery) and the JS `FreeGrindBridge.postLocalNotification`
 * bridge (instant delivery while the WebView is in the foreground, sourced
 * from the chat WebSocket). `recentlyNotifiedKeys` dedupes between the two:
 * whichever channel posts a given conversation/tap first wins, the other is
 * suppressed within the window — so the user never sees the same message or
 * tap notified twice.
 */
object NotificationPoster {
    private const val PUBLIC_MEDIA_BASE_URL = "https://cdns.grindr.com"
    private const val NOTIFICATION_INSTANCE_ID = 1
    private const val DEDUP_WINDOW_MS = 45_000L

    private val recentlyNotifiedKeys = mutableMapOf<String, Long>()
    // Caches decoded sender avatars so repeated notifications from the same
    // person don't re-download the same bitmap (keyed by CDN URL).
    private val avatarCache = android.util.LruCache<String, Bitmap>(10)
    // Separate small cache for message content previews (picture/gif/gaymoji),
    // kept apart from avatarCache since these URLs are one-off per message
    // rather than reused across many notifications from the same sender.
    private val previewCache = android.util.LruCache<String, Bitmap>(5)

    @Synchronized
    private fun shouldSuppressAsDuplicate(key: String): Boolean {
        val now = System.currentTimeMillis()
        recentlyNotifiedKeys.entries.removeAll { now - it.value >= DEDUP_WINDOW_MS }
        val alreadyNotified = recentlyNotifiedKeys.containsKey(key)
        recentlyNotifiedKeys[key] = now
        return alreadyNotified
    }

    fun postNotification(context: Context, payload: JSONObject) {
        val title = normalizeSenderName(payload.optString("senderName"))
        val text = payload.optString("bodyText", "Sent you a message")
        val isTap = payload.optBoolean("isTap", false)
        val rawData = payload.optJSONObject("rawData")
        val conversationId = normalizeNullableString(payload.optString("conversationId"))
            ?: extractConversationId(rawData)

        val notificationKey = resolveNotificationKey(
            isTap = isTap,
            conversationId = conversationId,
            senderName = title,
            rawData = rawData,
        )

        if (shouldSuppressAsDuplicate(notificationKey)) {
            Log.d("FCM", "Suppressing notification (already shown via other channel) key=$notificationKey")
            return
        }

        // Per-category master switch (NotificationsPage) — this kind of
        // notification is turned off entirely, foreground or not.
        val categoryEnabled = if (isTap) MainActivity.tapNotificationsEnabled else MainActivity.chatNotificationsEnabled
        if (!categoryEnabled) {
            Log.d("FCM", "Suppressing notification (category disabled)")
            return
        }

        // Suppress while foregrounded if the user turned off "Notifications
        // While App Is Open" (a general switch, not per-category) — they only
        // want FCM delivery once the app is backgrounded/closed.
        if (MainActivity.inForeground && !MainActivity.foregroundNotificationsEnabled) {
            Log.d("FCM", "Suppressing notification (foreground notifications disabled)")
            return
        }

        // Suppress when the user is already looking at the relevant screen
        // (taps tab for tap notifications; the matching conversation for chat
        // notifications). The frontend keeps MainActivity informed via the
        // FreeGrindBridge.setActiveRoute JS hook.
        val suppress = if (isTap) {
            MainActivity.isOnTapsScreen()
        } else {
            MainActivity.isOnConversation(conversationId)
        }
        if (suppress) {
            Log.d("FCM", "Suppressing notification (user on matching screen)")
            return
        }

        // _v2 suffix forces re-creation so the custom sound takes effect on existing installs.
        val channelId = if (isTap) "free_grind_taps_notifications_v2" else "free_grind_chat_notifications_v2"
        val channelName = if (isTap) "Taps" else "Chat Messages"
        val notificationId = notificationKey.hashCode()

        val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val soundUri: Uri = Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${context.packageName}/${R.raw.free_grind_message}"
        )
        val audioAttributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build()
        val channel = NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = if (isTap) "Notifications for incoming taps" else "Notifications for new chat messages"
            setSound(soundUri, audioAttributes)
        }
        notificationManager.createNotificationChannel(channel)
        Log.d(
            "FCM",
            "Using notification channel=$channelId notificationId=$notificationId key=$notificationKey action=${if (isTap) "taps" else conversationId}",
        )

        val actionStr = payload.optString("action").ifBlank { null }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            if (actionStr != null) {
                putExtra("action", actionStr)
            }
            putExtra("push_payload", payload.toString())
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(
            context, notificationId, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val senderAvatarBitmap = getNotificationAvatarBitmap(context, rawData)
        val previewImageUrl = payload.optString("previewImageUrl").trim().ifBlank { null }
        val previewBitmap = loadMessagePreviewBitmap(previewImageUrl)

        val me = Person.Builder().setName("Me").build()
        val senderIcon = IconCompat.createWithBitmap(senderAvatarBitmap)
        val sender = Person.Builder()
            .setName(title)
            .setIcon(senderIcon)
            .setImportant(true)
            .build()

        // With an image/gif preview available, an expandable BigPictureStyle
        // shows the actual content instead of a "Sent you a picture"
        // placeholder. Without one (text, audio, location, video, taps —
        // or the download simply failed), keep the existing MessagingStyle
        // conversation bubble.
        val style: NotificationCompat.Style = if (previewBitmap != null) {
            NotificationCompat.BigPictureStyle()
                .bigPicture(previewBitmap)
                .bigLargeIcon(null as Bitmap?)
                .setBigContentTitle(title)
                .setSummaryText(text)
        } else {
            NotificationCompat.MessagingStyle(me)
                .addMessage(text, System.currentTimeMillis(), sender)
                .setConversationTitle(if (isTap) "Taps" else null)
        }

        val builder = NotificationCompat.Builder(context, channelId)
            // Status-bar icon: monochrome stencil with transparent background only.
            .setSmallIcon(R.drawable.ic_notification_silhouette)
            .addPerson(sender)
            // Keep the badge overlay neutral and avoid OEM color plates.
            .setColor(Color.TRANSPARENT)
            .setColorized(false)
            // Notification body avatar: sender profile bitmap.
            .setLargeIcon(senderAvatarBitmap)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setTicker(text)
            .setSound(soundUri)
            .setStyle(style)

        if (previewBitmap != null) {
            // BigPictureStyle doesn't infer the collapsed title/text from a
            // Person the way MessagingStyle does — set them explicitly.
            builder.setContentTitle(title).setContentText(text)
        }

        notificationManager.notify(notificationKey, NOTIFICATION_INSTANCE_ID, builder.build())
        Log.d("FCM", "Local notification posted successfully")
    }

    private fun getNotificationAvatarBitmap(context: Context, rawData: JSONObject?): Bitmap {
        val senderBitmap = loadSenderAvatarBitmap(rawData)
        if (senderBitmap != null) {
            return scaleBitmapIfNeeded(senderBitmap, 128)
        }

        val fallback = BitmapFactory.decodeResource(context.resources, R.drawable.blank_profile)
            ?: Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888)
        return scaleBitmapIfNeeded(makeBlackPixelsTransparent(fallback), 128)
    }

    private fun scaleBitmapIfNeeded(source: Bitmap, maxPx: Int): Bitmap {
        if (source.width <= maxPx && source.height <= maxPx) return source
        val scale = maxPx.toFloat() / maxOf(source.width, source.height)
        val w = (source.width * scale).toInt().coerceAtLeast(1)
        val h = (source.height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, w, h, true)
    }

    private fun makeBlackPixelsTransparent(source: Bitmap): Bitmap {
        val mutable = source.copy(Bitmap.Config.ARGB_8888, true)
        val width = mutable.width
        val height = mutable.height
        val pixels = IntArray(width * height)
        mutable.getPixels(pixels, 0, width, 0, 0, width, height)
        for (i in pixels.indices) {
            val pixel = pixels[i]
            if (Color.alpha(pixel) == 0) continue
            if (Color.red(pixel) < 28 && Color.green(pixel) < 28 && Color.blue(pixel) < 28) {
                pixels[i] = Color.TRANSPARENT
            }
        }
        mutable.setPixels(pixels, 0, width, 0, 0, width, height)
        return mutable
    }

    private fun loadSenderAvatarBitmap(rawData: JSONObject?): Bitmap? {
        val avatarUrl = extractSenderAvatarUrl(rawData)
        if (avatarUrl.isNullOrBlank()) return null
        return downloadBitmap(avatarUrl, avatarCache, "sender avatar")
    }

    // Best-effort inline preview of the message's own content (picture/gif/
    // gaymoji) for the notification. Returns null on any failure (missing
    // field, network error, decode failure) — caller falls back to a plain
    // text-only notification, same as before this existed.
    fun loadMessagePreviewBitmap(previewImageUrl: String?): Bitmap? {
        if (previewImageUrl.isNullOrBlank()) return null
        return downloadBitmap(previewImageUrl, previewCache, "message preview")
    }

    private fun downloadBitmap(url: String, cache: android.util.LruCache<String, Bitmap>, label: String): Bitmap? {
        cache.get(url)?.let { return it }

        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            connection.instanceFollowRedirects = true
            connection.doInput = true
            connection.connect()
            val bitmap = connection.inputStream.use { stream -> BitmapFactory.decodeStream(stream) }
            if (bitmap != null) cache.put(url, bitmap)
            bitmap
        } catch (error: Exception) {
            Log.w("FCM", "Failed to load $label for notification", error)
            null
        }
    }

    private fun extractSenderAvatarUrl(rawData: JSONObject?): String? {
        if (rawData == null) {
            return null
        }

        val directUrlKeys = listOf(
            "senderAvatarUrl",
            "senderProfileImageUrl",
            "profileImageUrl",
            "thumbnailUrl",
            "imageUrl",
        )
        for (key in directUrlKeys) {
            val value = rawData.optString(key).trim()
            if (value.startsWith("http://") || value.startsWith("https://")) {
                return value
            }
        }

        val hashKeys = listOf(
            "senderProfileImageMediaHash",
            "profileImageMediaHash",
            "profileMediaHash",
            "imageHash",
            "photoHash",
            "mediaHash",
        )
        for (key in hashKeys) {
            val value = rawData.optString(key).trim()
            if (isMediaHash(value)) {
                return "$PUBLIC_MEDIA_BASE_URL/images/thumb/320x320/$value"
            }
        }

        val messageRaw = rawData.optString("message").trim()
        if (messageRaw.isNotEmpty()) {
            try {
                val messageJson = JSONObject(messageRaw)
                val senderObject = messageJson.optJSONObject("sender")
                if (senderObject != null) {
                    for (key in directUrlKeys) {
                        val value = senderObject.optString(key).trim()
                        if (value.startsWith("http://") || value.startsWith("https://")) {
                            return value
                        }
                    }
                    for (key in hashKeys) {
                        val value = senderObject.optString(key).trim()
                        if (isMediaHash(value)) {
                            return "$PUBLIC_MEDIA_BASE_URL/images/thumb/320x320/$value"
                        }
                    }
                }
            } catch (_: Exception) {
                // Ignore malformed JSON and keep default notification icon.
            }
        }

        return null
    }

    // Mirrors the field-probing done client-side in chatUtils.ts's
    // getMessageImageUrl/getGaymojiUrl — the server payload shape is
    // inconsistent across message types, so several possible field names are
    // tried before giving up. `messageBody` is the message JSON's own `body`
    // object (not `rawData` — this is about the message's content, not the
    // sender's avatar). Returns null (no preview, falls back to text-only)
    // for any type not listed here, notably ExpiringImage and Video.
    fun extractMessagePreviewImageUrl(messageBody: JSONObject?, type: String?): String? {
        if (messageBody == null) return null

        return when (type) {
            "Image" -> extractBodyMediaUrl(messageBody)
            "Giphy" -> extractGiphyPreviewUrl(messageBody)
            "Gaymoji" -> extractGaymojiPreviewUrl(messageBody)
            else -> null
        }
    }

    private fun extractBodyMediaUrl(body: JSONObject): String? {
        val directUrlKeys = listOf(
            "url", "imageUrl", "mediaUrl", "previewUrl", "thumbUrl", "signedUrl", "cdnUrl", "urlPath",
        )
        for (key in directUrlKeys) {
            val value = body.optString(key).trim()
            if (value.startsWith("http://") || value.startsWith("https://")) {
                return value
            }
        }

        body.optJSONObject("image")?.let { nested ->
            for (key in directUrlKeys) {
                val value = nested.optString(key).trim()
                if (value.startsWith("http://") || value.startsWith("https://")) {
                    return value
                }
            }
        }

        val hashKeys = listOf("imageHash", "mediaHash", "hash", "fileCacheKey")
        for (key in hashKeys) {
            val value = body.optString(key).trim()
            if (isMediaHash(value)) {
                return "$PUBLIC_MEDIA_BASE_URL/images/thumb/480x480/$value"
            }
        }

        return null
    }

    private fun extractGiphyPreviewUrl(body: JSONObject): String? {
        for (key in listOf("previewPath", "stillPath", "urlPath")) {
            val value = body.optString(key).trim()
            if (value.startsWith("http://") || value.startsWith("https://")) {
                return value
            }
        }
        return null
    }

    private fun extractGaymojiPreviewUrl(body: JSONObject): String? {
        // Here imageHash is a CDN path fragment, not a content hash (same as
        // getGaymojiUrl in chatUtils.ts) — used directly, not via isMediaHash.
        val fragment = body.optString("imageHash").trim()
        if (fragment.isEmpty()) return null
        return "$PUBLIC_MEDIA_BASE_URL/grindr/chat/$fragment"
    }

    private fun resolveNotificationKey(
        isTap: Boolean,
        conversationId: String?,
        senderName: String,
        rawData: JSONObject?,
    ): String {
        if (isTap) {
            val tapSenderId = extractSenderStableId(rawData)
            return "tap:${tapSenderId ?: senderName.lowercase()}"
        }

        if (!conversationId.isNullOrBlank()) {
            return "chat:$conversationId"
        }

        val senderId = extractSenderStableId(rawData)
        if (!senderId.isNullOrBlank()) {
            return "chat:sender:$senderId"
        }

        return "chat:name:${senderName.lowercase()}"
    }

    fun normalizeNullableString(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isEmpty() || trimmed.equals("null", ignoreCase = true)) {
            return null
        }
        return trimmed
    }

    fun normalizeSenderName(value: String?): String {
        val trimmed = value?.trim().orEmpty()
        if (
            trimmed.isEmpty() ||
            trimmed.equals("null", ignoreCase = true) ||
            trimmed.equals("SOMEONE_TITLE", ignoreCase = true)
        ) {
            return "Someone"
        }
        return trimmed
    }

    fun parseConversationAndSenderFromAction(action: String?): Pair<String?, String?> {
        val normalized = normalizeNullableString(action) ?: return null to null

        val queryPart = normalized.substringAfter('?', "")
        if (queryPart.isEmpty()) {
            return null to null
        }

        var conversationId: String? = null
        var senderId: String? = null

        queryPart.split('&').forEach { pair ->
            val key = pair.substringBefore('=', "").trim()
            val rawValue = pair.substringAfter('=', "").trim()
            val decodedValue = URLDecoder.decode(rawValue, StandardCharsets.UTF_8.name())

            when (key) {
                "id" -> conversationId = normalizeNullableString(decodedValue)
                "senderId" -> senderId = normalizeNullableString(decodedValue)
            }
        }

        return conversationId to senderId
    }

    private fun extractSenderStableId(rawData: JSONObject?): String? {
        if (rawData == null) {
            return null
        }

        val senderIdKeys = listOf(
            "senderProfileId",
            "senderId",
            "profileId",
            "fromProfileId",
            "authorProfileId",
        )
        for (key in senderIdKeys) {
            val value = normalizeNullableString(rawData.optString(key))
            if (value != null) {
                return value
            }
        }

        val actionValues = parseConversationAndSenderFromAction(rawData.optString("action"))
        if (!actionValues.second.isNullOrBlank()) {
            return actionValues.second
        }

        val messageRaw = rawData.optString("message").trim()
        if (messageRaw.isNotEmpty()) {
            try {
                val messageJson = JSONObject(messageRaw)
                val senderObject = messageJson.optJSONObject("sender")
                if (senderObject != null) {
                    for (key in senderIdKeys) {
                        val value = normalizeNullableString(senderObject.optString(key))
                        if (value != null) {
                            return value
                        }
                    }
                }
            } catch (_: Exception) {
                // Ignore malformed JSON and continue with weaker fallback keys.
            }
        }

        return null
    }

    fun extractConversationId(rawData: JSONObject?): String? {
        if (rawData == null) {
            return null
        }

        val direct = normalizeNullableString(rawData.optString("conversationId"))
        if (direct != null) {
            return direct
        }

        val actionValues = parseConversationAndSenderFromAction(rawData.optString("action"))
        if (!actionValues.first.isNullOrBlank()) {
            return actionValues.first
        }

        val messageRaw = rawData.optString("message").trim()
        if (messageRaw.isNotEmpty()) {
            try {
                val messageJson = JSONObject(messageRaw)
                val id = normalizeNullableString(messageJson.optString("conversationId"))
                if (id != null) {
                    return id
                }
            } catch (_: Exception) {
                // Ignore malformed JSON and keep default fallback behavior.
            }
        }

        return null
    }

    private fun isMediaHash(value: String): Boolean {
        if (value.isBlank()) {
            return false
        }
        if (!(value.length == 32 || value.length == 40 || value.length == 64)) {
            return false
        }
        return value.all { it.isDigit() || it.lowercaseChar() in 'a'..'f' }
    }
}
