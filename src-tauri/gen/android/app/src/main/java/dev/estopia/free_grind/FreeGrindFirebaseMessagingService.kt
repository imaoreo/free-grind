package dev.estopia.free_grind

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject

class FreeGrindFirebaseMessagingService : FirebaseMessagingService() {

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

        val sender = Person.Builder().setName(title).build()
        messagingStyle.addMessage(text, System.currentTimeMillis(), sender)

        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setColor(0xFFFFCC00.toInt())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(messagingStyle)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)

        notificationManager.notify(notificationId, builder.build())
        Log.d("FCM", "Local notification posted successfully")
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "Refreshed token: $token")
    }
}
