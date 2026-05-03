package dev.estopia.free_grind

import android.Manifest
import android.content.Intent
import android.os.Handler
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.util.Log
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.lang.ref.WeakReference

class MainActivity : TauriActivity() {
  companion object {
    private var activityRef: WeakReference<MainActivity>? = null
    private val pendingPushPayloads = mutableListOf<String>()

    fun enqueuePushNotification(payloadJson: String) {
      val activity = activityRef?.get()
      if (activity == null) {
        Log.d("FCM", "MainActivity unavailable, queueing push payload for React")
        synchronized(pendingPushPayloads) {
          pendingPushPayloads.add(payloadJson)
        }
        return
      }

      activity.dispatchPushNotificationToWebview(payloadJson, 0)
    }

    fun hasActiveWebView(): Boolean {
      return activityRef?.get()?.webViewRef != null
    }
  }

  private var webViewRef: WebView? = null
  private var pendingFcmToken: String? = null
  private var latestFcmToken: String? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private val requestNotificationPermission = registerForActivityResult(
    ActivityResultContracts.RequestPermission()
  ) { isGranted ->
    if (isGranted) {
      Log.d("FCM", "Notification permission granted")
    } else {
      Log.d("FCM", "Notification permission denied")
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    activityRef = WeakReference(this)
    requestNotificationPermissionIfNeeded()
    initFirebase()
    handleNotificationIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleNotificationIntent(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webViewRef = webView
    pendingFcmToken?.let {
      dispatchFcmTokenToWebview(it, 0)
      pendingFcmToken = null
    }
    dispatchPendingPushNotifications()
    handleNotificationIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    latestFcmToken?.let {
      Log.d("FCM", "onResume: retrying token dispatch to WebView")
      dispatchFcmTokenToWebview(it, 0)
    }
    dispatchPendingPushNotifications()
    handleNotificationIntent(intent)
  }

  override fun onDestroy() {
    if (activityRef?.get() === this) {
      activityRef = null
    }
    super.onDestroy()
  }

  private fun requestNotificationPermissionIfNeeded() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      val hasPermission = ContextCompat.checkSelfPermission(
        this,
        Manifest.permission.POST_NOTIFICATIONS
      ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      Log.d("FCM", "POST_NOTIFICATIONS permission granted=$hasPermission")
      if (!hasPermission) {
        requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }
  }

  private fun initFirebase() {
    val spoofedContext = SpoofedContext(applicationContext)
    if (FirebaseApp.getApps(spoofedContext).isEmpty()) {
      val options = FirebaseOptions.Builder()
        .setApplicationId(getString(R.string.fcm_google_app_id))
        .setProjectId(getString(R.string.fcm_project_id))
        .setApiKey(getString(R.string.fcm_google_api_key))
        .setGcmSenderId(getString(R.string.fcm_gcm_default_sender_id))
        .build()

      FirebaseApp.initializeApp(spoofedContext, options)
      Log.d("FCM", "Firebase initialized with spoofed context")
    } else {
      Log.d("FCM", "Firebase app already initialized")
    }

    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (task.isSuccessful) {
        val token = task.result
        latestFcmToken = token
        Log.d("FCM", "Push token fetched successfully (len=${token.length})")
        Log.v("FCM", "Push token value: $token")
        dispatchFcmTokenToWebview(token, 0)
      } else {
        Log.w("FCM", "Failed to get push token", task.exception)
      }
    }
  }

  private fun dispatchFcmTokenToWebview(token: String, attempt: Int) {
    val script =
      "(function(){" +
      "var token = ${JSONObject.quote(token)};" +
      "var href = String(location && location.href || '');" +
      "if (href.indexOf('tauri.localhost') === -1) { return 'retry:not-ready:' + href; }" +
      "try { localStorage.setItem('fg-fcm-token', token); } catch (e) { return 'retry:storage'; }" +
      "window.__FG_FCM_TOKEN = token;" +
      "window.dispatchEvent(new CustomEvent('fg:fcm-token', { detail: { token: token } }));" +
      "return 'ok';" +
      "})();"

    runOnUiThread {
      val webView = webViewRef
      if (webView == null) {
        Log.d("FCM", "WebView not ready, queueing FCM token dispatch")
        pendingFcmToken = token
        return@runOnUiThread
      }

      Log.d("FCM", "Dispatching FCM token event to WebView (attempt=$attempt)")
      webView.evaluateJavascript(script) { result ->
        Log.d("FCM", "WebView token dispatch callback result=$result")
        val shouldRetry = result.contains("retry")
        if (shouldRetry && attempt < 12) {
          mainHandler.postDelayed({
            dispatchFcmTokenToWebview(token, attempt + 1)
          }, 400)
        }
      }
    }
  }

  private fun dispatchPendingPushNotifications() {
    val queuedPayloads = synchronized(pendingPushPayloads) {
      if (pendingPushPayloads.isEmpty()) {
        return
      }

      val snapshot = pendingPushPayloads.toList()
      pendingPushPayloads.clear()
      snapshot
    }

    Log.d("FCM", "Dispatching ${queuedPayloads.size} queued push payload(s) to WebView")
    queuedPayloads.forEach { payloadJson ->
      dispatchPushNotificationToWebview(payloadJson, 0)
    }
  }

  private fun handleNotificationIntent(intent: Intent?) {
    val payloadJson = intent?.getStringExtra("push_payload") ?: return
    intent.removeExtra("push_payload")
    dispatchPushNotificationToWebview(toOpenedPushPayload(payloadJson), 0)
  }

  private fun toOpenedPushPayload(payloadJson: String): String {
    return try {
      val payload = JSONObject(payloadJson)
      payload.put("event", "opened")
      payload.put("openedAt", System.currentTimeMillis())
      payload.toString()
    } catch (error: Exception) {
      Log.w("FCM", "Failed to promote push payload to opened event", error)
      payloadJson
    }
  }

  private fun dispatchPushNotificationToWebview(payloadJson: String, attempt: Int) {
    val script =
      "(function(){" +
      "var payload = ${JSONObject.quote(payloadJson)};" +
      "var href = String(location && location.href || '');" +
      "if (href.indexOf('tauri.localhost') === -1) { return 'retry:not-ready:' + href; }" +
      "try { payload = JSON.parse(payload); } catch (e) { return 'retry:json'; }" +
      "var queue = Array.isArray(window.__FG_PUSH_NOTIFICATIONS) ? window.__FG_PUSH_NOTIFICATIONS : [];" +
      "queue.push(payload);" +
      "window.__FG_PUSH_NOTIFICATIONS = queue;" +
      "try { localStorage.setItem('fg-last-push-notification', JSON.stringify(payload)); } catch (e) {}" +
      "window.dispatchEvent(new CustomEvent('fg:push-notification', { detail: payload }));" +
      "return 'ok';" +
      "})();"

    runOnUiThread {
      val webView = webViewRef
      if (webView == null) {
        Log.d("FCM", "WebView not ready, queueing push payload dispatch")
        synchronized(pendingPushPayloads) {
          pendingPushPayloads.add(payloadJson)
        }
        return@runOnUiThread
      }

      Log.d("FCM", "Dispatching push payload event to WebView (attempt=$attempt)")
      webView.evaluateJavascript(script) { result ->
        Log.d("FCM", "WebView push payload dispatch callback result=$result")
        val shouldRetry = result.contains("retry")
        if (shouldRetry && attempt < 12) {
          mainHandler.postDelayed({
            dispatchPushNotificationToWebview(payloadJson, attempt + 1)
          }, 400)
        }
      }
    }
  }
}
