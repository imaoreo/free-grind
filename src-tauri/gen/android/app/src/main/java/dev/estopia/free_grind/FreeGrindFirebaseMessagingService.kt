package dev.estopia.free_grind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class FreeGrindFirebaseMessagingService : FirebaseMessagingService() {
    companion object {
        private const val PUBLIC_MEDIA_BASE_URL = "https://cdns.grindr.com"
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
        val senderName = titleStr ?: "Someone"

        val topBody = data["body"]

        var isTap = false
        var messageText = "Sent you a message"
        var conversationId: String? = null
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
                conversationId = json.getString("conversationId")
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
        val title = payload.optString("senderName", "Someone")
        val text = payload.optString("bodyText", "Sent you a message")
        val conversationId = payload.optString("conversationId").ifBlank { null }
        val isTap = payload.optBoolean("isTap", false)
        val rawData = payload.optJSONObject("rawData")
        val channelId = if (isTap) "free_grind_taps_notifications" else "free_grind_chat_notifications"
        val channelName = if (isTap) "Taps" else "Chat Messages"
        val notificationId = if (isTap) title.hashCode() else (conversationId?.hashCode() ?: 0)

        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val channel = NotificationChannel(
            channelId,
            channelName,
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = if (isTap) "Notifications for incoming taps" else "Notifications for new chat messages"
        }
        notificationManager.createNotificationChannel(channel)
        Log.d("FCM", "Using notification channel=$channelId notificationId=$notificationId action=${if (isTap) "taps" else conversationId}")

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

        val activeNotification =
            notificationManager.activeNotifications.find { it.id == notificationId }

        val messagingStyle = if (activeNotification != null) {
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(activeNotification.notification)
                ?: NotificationCompat.MessagingStyle(Person.Builder().setName("Me").build())
        } else {
            NotificationCompat.MessagingStyle(Person.Builder().setName("Me").build())
        }

        val senderAvatarBitmap = loadSenderAvatarBitmap(rawData)
        val senderBuilder = Person.Builder().setName(title)
        if (senderAvatarBitmap != null) {
            senderBuilder.setIcon(IconCompat.createWithBitmap(senderAvatarBitmap))
        }
        val sender = senderBuilder.build()
        messagingStyle.addMessage(text, System.currentTimeMillis(), sender)

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification_small)
            .setColor(0xFFFFCC00.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(messagingStyle)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        if (senderAvatarBitmap != null) {
            builder.setLargeIcon(senderAvatarBitmap)
        }

        notificationManager.notify(notificationId, builder.build())
        Log.d("FCM", "Local notification posted successfully")
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
