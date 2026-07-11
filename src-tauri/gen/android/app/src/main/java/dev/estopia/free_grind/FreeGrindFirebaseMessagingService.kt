package dev.estopia.free_grind

import android.util.Log
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
            NotificationPoster.postNotification(this, payload)
        } catch (e: Exception) {
            Log.e("FCM", "Failed to parse message data", e)
        }
    }

    private fun buildPushPayload(data: Map<String, String>): JSONObject {
        val titleStr = data["title"] ?: data["senderDisplayName"]
        val senderName = NotificationPoster.normalizeSenderName(titleStr)

        val topBody = data["body"]
        val deeplinkAction = data["action"]

        var isTap = false
        var messageText = "Sent you a message"
        var conversationId: String? = null
        var senderId: String? = NotificationPoster.normalizeNullableString(data["senderId"])
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
            // A malformed `message` blob shouldn't take down the whole payload
            // (and with it the notification's tap/deeplink info) — degrade to
            // the action/senderId-derived fields below instead.
            try {
                val json = JSONObject(messageJsonStr)
                if (json.has("conversationId")) {
                    conversationId = NotificationPoster.normalizeNullableString(json.optString("conversationId"))
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
            } catch (e: Exception) {
                Log.e("FCM", "Failed to parse message payload, continuing without it", e)
            }
        }

        val actionValues = NotificationPoster.parseConversationAndSenderFromAction(deeplinkAction)
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

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "Refreshed token (len=${token.length}), dispatching to webview")
        MainActivity.onFcmTokenRefreshed(token)
    }
}
