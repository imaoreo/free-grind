package dev.estopia.free_grind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.ContentResolver
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

class FreeGrindFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private const val PUBLIC_MEDIA_BASE_URL = "https://cdns.grindr.com"
        private const val NOTIFICATION_INSTANCE_ID = 1
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d("FCM", "Received message from: ${message.from}")
        Log.d("FCM", "Message id=${message.messageId}, sentTime=${message.sentTime}, dataSize=${message.data.size}")

        if (message.data.isNotEmpty()) {
            Log.d("FCM", "Message data payload: ${message.data}")
            handleDataPayload(message.data)
        }

        message.notification?.let {
            Log.d("FCM", "Message Notification Body: ${it.body}")
        }
    }

    private fun handleDataPayload(data: Map<String, String>) {
        try {
            val payload = buildPushPayload(data)
            val payloadJson = payload.toString()
            Log.d(
                "FCM",
                "Forwarding push payload to React event=${payload.optString("event")} action=${payload.optString("action")}",
            )
            MainActivity.enqueuePushNotification(payloadJson)
            showNotification(payload)
        } catch (e: Exception) {
            Log.e("FCM", "Failed to parse message data", e)
        }
    }

    private fun buildPushPayload(data: Map<String, String>): JSONObject {
        val titleStr = data["title"] ?: data["senderDisplayName"]
        val senderName = normalizeSenderName(titleStr)

        val topBody = data["body"]
        val deeplinkAction = data["action"]

        var isTap = false
        var messageText = "Sent you a message"
        var conversationId: String? = null
        var senderId: String? = normalizeNullableString(data["senderId"])
        var messageType: String? = null

        if (topBody == "TAP_NOTIFICATION_BODY") {
            isTap = true
            messageText = "Tapped you"
        } else if (topBody != null && topBody.startsWith("CHAT_")) {
            messageText = "Sent you a message"
        } else if (!topBody.isNullOrBlank()) {
            messageText = topBody
        }

        val messageJsonStr = data["message"]
        if (messageJsonStr != null) {
            val json = JSONObject(messageJsonStr)
            if (json.has("conversationId")) {
                conversationId = normalizeNullableString(json.optString("conversationId"))
            }

            val type = json.optString("type")
            if (type.isNotEmpty()) {
                messageType = type
                messageText = when (type) {
                    "Text" -> extractTextMessage(json, messageText)
                    "Image" -> "Sent you a picture"
                    "Giphy" -> "Sent you a gif"
                    "Location" -> "Sent you their location"
                    "Audio" -> "Sent you a voice message"
                    "Gaymoji" -> "Sent you a gaymoji"
                    "ExpiringImage" -> "Sent you an expiring picture"
                    "Album" -> "Shared an album with you"
                    "AlbumContentReaction" -> "Liked your album picture"
                    "Video" -> "Sent you a video"
                    else -> messageText
                }
            }
        }

        val actionValues = parseConversationAndSenderFromAction(deeplinkAction)
        if (conversationId.isNullOrBlank()) {
            conversationId = actionValues.first
        }
        if (senderId.isNullOrBlank()) {
            senderId = actionValues.second
        }

        messageText = messageText.trim().ifBlank { "Sent you a message" }

        val action = if (isTap) "taps" else conversationId?.let { "chat:$it" }

        return JSONObject().apply {
            put("event", "received")
            put("source", "fcm")
            put("receivedAt", System.currentTimeMillis())
            put("senderName", senderName)
            put("bodyText", messageText)
            put("isTap", isTap)
            put("action", action ?: JSONObject.NULL)
            put("conversationId", conversationId ?: JSONObject.NULL)
            put("senderId", senderId ?: JSONObject.NULL)
            put("messageType", messageType ?: JSONObject.NULL)
            put("rawData", JSONObject(data))
        }
    }

    private fun extractTextMessage(messageJson: JSONObject, fallbackText: String): String {
        val body = messageJson.optJSONObject("body")
        val directText = body?.optString("text")?.trim().orEmpty()
        if (directText.isNotEmpty()) {
            return directText
        }

        val plainBody = messageJson.optString("body").trim()
        if (plainBody.isNotEmpty() && plainBody != "{}") {
            return plainBody
        }

        return fallbackText
    }

    private fun showNotification(payload: JSONObject) {
        val title = normalizeSenderName(payload.optString("senderName"))
        val text = payload.optString("bodyText", "Sent you a message")
        val isTap = payload.optBoolean("isTap", false)
        val rawData = payload.optJSONObject("rawData")
        val conversationId = normalizeNullableString(payload.optString("conversationId"))
            ?: extractConversationId(rawData)

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
        val notificationKey = resolveNotificationKey(
            isTap = isTap,
            conversationId = conversationId,
            senderName = title,
            rawData = rawData,
        )
        val notificationId = notificationKey.hashCode()

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val soundUri: Uri = Uri.parse(
            "${ContentResolver.SCHEME_ANDROID_RESOURCE}://${packageName}/${R.raw.free_grind_message}"
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

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            if (actionStr != null) {
                putExtra("action", actionStr)
            }
            putExtra("push_payload", payload.toString())
        }
        val pendingIntent: PendingIntent = PendingIntent.getActivity(
            this, notificationId, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val senderAvatarBitmap = getNotificationAvatarBitmap(rawData)

        val me = Person.Builder().setName("Me").build()
        val senderIcon = IconCompat.createWithBitmap(senderAvatarBitmap)
        val sender = Person.Builder()
            .setName(title)
            .setIcon(senderIcon)
            .setImportant(true)
            .build()
        val messagingStyle = NotificationCompat.MessagingStyle(me)
            .addMessage(text, System.currentTimeMillis(), sender)
            .setConversationTitle(if (isTap) "Taps" else null)

        if (!conversationId.isNullOrBlank()) {
            val shortcut = ShortcutInfoCompat.Builder(this, conversationId)
                .setShortLabel(title)
                .setPerson(sender)
                .setIcon(senderIcon)
                .setIntent(intent.apply { action = Intent.ACTION_VIEW })
                .setLongLived(true)
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(this, shortcut)
        }

        val builder = NotificationCompat.Builder(this, channelId)
            // Status-bar icon: monochrome stencil with transparent background only.
            .setSmallIcon(R.drawable.ic_notification_silhouette)
            .setShortcutId(conversationId)
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
            .setStyle(messagingStyle)

        notificationManager.notify(notificationKey, NOTIFICATION_INSTANCE_ID, builder.build())
        Log.d("FCM", "Local notification posted successfully")
    }

    private fun getNotificationAvatarBitmap(rawData: JSONObject?): Bitmap {
        val senderBitmap = loadSenderAvatarBitmap(rawData)
        if (senderBitmap != null) {
            return senderBitmap
        }

        val fallback = BitmapFactory.decodeResource(resources, R.drawable.blank_profile)
            ?: Bitmap.createBitmap(128, 128, Bitmap.Config.ARGB_8888)
        return makeBlackPixelsTransparent(fallback)
    }

    private fun makeBlackPixelsTransparent(source: Bitmap): Bitmap {
        val mutable = source.copy(Bitmap.Config.ARGB_8888, true)
        val width = mutable.width
        val height = mutable.height

        for (x in 0 until width) {
            for (y in 0 until height) {
                val pixel = mutable.getPixel(x, y)
                val alpha = Color.alpha(pixel)
                if (alpha == 0) {
                    continue
                }

                val red = Color.red(pixel)
                val green = Color.green(pixel)
                val blue = Color.blue(pixel)
                if (red < 28 && green < 28 && blue < 28) {
                    mutable.setPixel(x, y, Color.TRANSPARENT)
                }
            }
        }

        return mutable
    }

    private fun loadSenderAvatarBitmap(rawData: JSONObject?): Bitmap? {
        val avatarUrl = extractSenderAvatarUrl(rawData)
        if (avatarUrl.isNullOrBlank()) {
            return null
        }

        return try {
            val connection = URL(avatarUrl).openConnection() as HttpURLConnection
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            connection.instanceFollowRedirects = true
            connection.doInput = true
            connection.connect()
            connection.inputStream.use { stream -> BitmapFactory.decodeStream(stream) }
        } catch (error: Exception) {
            Log.w("FCM", "Failed to load sender avatar for notification", error)
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

    private fun normalizeNullableString(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        if (trimmed.isEmpty() || trimmed.equals("null", ignoreCase = true)) {
            return null
        }
        return trimmed
    }

    private fun normalizeSenderName(value: String?): String {
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

    private fun parseConversationAndSenderFromAction(action: String?): Pair<String?, String?> {
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

    private fun extractConversationId(rawData: JSONObject?): String? {
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

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "Refreshed token: $token")
    }
}
