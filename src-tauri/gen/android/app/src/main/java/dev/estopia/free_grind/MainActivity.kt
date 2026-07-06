package dev.estopia.free_grind

import android.Manifest
import android.animation.Animator
import android.animation.ObjectAnimator
import android.app.Dialog
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Handler
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

class MainActivity : TauriActivity() {
  companion object {
    private var activityRef: WeakReference<MainActivity>? = null
    private val pendingPushPayloads = mutableListOf<String>()

    /**
     * Active in-app route plus foreground flag, kept up to date by the
     * frontend through `FreeGrindBridge.setActiveRoute(...)`. Used by the
     * FCM service to suppress system notifications when the user is
     * already looking at the relevant screen.
     */
    @Volatile var activeRoute: String? = null
    @Volatile var inForeground: Boolean = false

    /**
     * Mirrors the NotificationsPage settings, pushed down via
     * `FreeGrindBridge.setNotificationPreferences(...)`. chat/tapNotificationsEnabled
     * are the per-category master switches; foregroundNotificationsEnabled is
     * one general switch (not per-category) for whether either kind shows
     * while foregrounded, vs. only once backgrounded/closed via FCM. Lets the
     * FCM service suppress a push notification accordingly, even when the
     * user isn't on the exact matching screen (which isOnConversation/
     * isOnTapsScreen already covers). All default to true so an install that
     * hasn't synced these yet keeps today's always-on behavior.
     */
    @Volatile var chatNotificationsEnabled: Boolean = true
    @Volatile var tapNotificationsEnabled: Boolean = true
    @Volatile var foregroundNotificationsEnabled: Boolean = true

    fun isOnTapsScreen(): Boolean {
      if (!inForeground) return false
      val r = activeRoute ?: return false
      val path = r.substringBefore('?')
      if (path != "/interest") return false
      // Taps is now the default for /interest, so it's only NOT the taps screen
      // if it explicitly says tab=views.
      return !r.contains("tab=views")
    }

    fun isOnConversation(conversationId: String?): Boolean {
      if (!inForeground) return false
      if (conversationId.isNullOrBlank()) return false
      val r = activeRoute ?: return false
      val path = r.substringBefore('?')
      return path == "/chat/$conversationId" || path.startsWith("/chat/$conversationId/")
    }

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

    fun onFcmTokenRefreshed(token: String) {
      val activity = activityRef?.get()
      if (activity != null) {
        activity.latestFcmToken = token
        activity.dispatchFcmTokenToWebview(token, 0)
      } else {
        // MainActivity not active — store so it gets dispatched on next resume.
        Log.d("FCM", "MainActivity unavailable, storing refreshed token for next resume")
        pendingRefreshedFcmToken = token
      }
    }

    private var pendingRefreshedFcmToken: String? = null
  }

  private var webViewRef: WebView? = null
  private var pendingFcmToken: String? = null
  private var latestFcmToken: String? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  // Bounded pool prevents Binder-thread exhaustion when many WebSocket messages
  // arrive simultaneously and each postLocalNotification spawns avatar+IPC work.
  private val localNotifExecutor = Executors.newFixedThreadPool(2)
  // The system SplashScreen theme only supports an icon + background — no
  // text or spinner slot. This Dialog (same background/icon, plus a "Free
  // Grind" label and an indeterminate spinner) stands in for it for as long
  // as the app takes to actually paint real content — see
  // JsBridge.notifyContentReady() and dismissSplash() below. It's a Dialog
  // (its own Window), not a View added into the Activity's own window/
  // WebView hierarchy: a hardware-accelerated WebView's surface can
  // composite above a same-window sibling View regardless of add-order, so
  // that approach got silently painted over the moment the WebView started
  // rendering. A separate Window is layered above the Activity's by the
  // WindowManager and isn't subject to that quirk. The postDelayed fallback
  // prevents it lingering forever if the JS signal never arrives (error,
  // WebView failing to load, etc.) — a real cold start (cargo/webview/JS
  // bundle init) has been observed taking ~20-25s on its own, so this must
  // stay well above that or it'll cut the splash early on every
  // normal-but-slow launch instead of only on a genuinely broken one.
  private var splashDialog: Dialog? = null
  private var splashSpinnerAnimator: Animator? = null

  private fun dismissSplash() {
    runOnUiThread {
      splashSpinnerAnimator?.cancel()
      splashSpinnerAnimator = null
      splashDialog?.dismiss()
      splashDialog = null
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // installSplashScreen() only bridges the gap before this Activity's own
    // window exists — it's left to dismiss at its own (near-immediate)
    // default timing rather than held with setKeepOnScreenCondition, because
    // the system's SplashScreenView draws *on top of* everything else,
    // including the splashDialog shown below; holding it would just hide
    // that dialog's text/spinner behind the plain system splash for the
    // entire wait. The dialog uses the same background/icon, so the handoff
    // between the two is invisible regardless.
    installSplashScreen()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    splashDialog = Dialog(this, R.style.SplashDialogTheme).apply {
      setContentView(R.layout.splash_overlay)
      setCancelable(false)
      window?.let { win ->
        win.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
        // The Dialog is its own Window, so it doesn't inherit the Activity's
        // enableEdgeToEdge() styling — left alone, it shows the system
        // default white status/nav bars instead of the splash background.
        // statusBarColor/navigationBarColor setters are deprecated on this
        // project's targetSdk (36, enforced edge-to-edge) anyway — matching
        // enableEdgeToEdge()'s own approach instead: make the dialog draw
        // behind the (already-transparent-by-default) system bars so
        // splash_overlay.xml's own full-bleed background shows through them,
        // and only control the bar *icon* color via WindowInsetsControllerCompat.
        WindowCompat.setDecorFitsSystemWindows(win, false)
        val isNightMode = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
          Configuration.UI_MODE_NIGHT_YES
        WindowInsetsControllerCompat(win, win.decorView).apply {
          isAppearanceLightStatusBars = !isNightMode
          isAppearanceLightNavigationBars = !isNightMode
        }
      }
      show()
      findViewById<View>(R.id.splash_spinner)?.let { spinner ->
        splashSpinnerAnimator = ObjectAnimator.ofFloat(spinner, View.ROTATION, 0f, 360f).apply {
          duration = 3000L
          repeatCount = ObjectAnimator.INFINITE
          interpolator = LinearInterpolator()
          start()
        }
      }
    }
    mainHandler.postDelayed({ dismissSplash() }, 45000)
    activityRef = WeakReference(this)
    // Run off the main thread — createNotificationChannel makes IPC calls to
    // NotificationManagerService that can block for several seconds on some
    // devices (OxygenOS in particular) and cause a startup ANR.
    localNotifExecutor.execute { ensureNotificationChannels() }
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

    @Suppress("AddJavascriptInterface")
    webView.addJavascriptInterface(JsBridge(), "FreeGrindBridge")
    pendingFcmToken?.let {
      dispatchFcmTokenToWebview(it, 0)
      pendingFcmToken = null
    }
    dispatchPendingPushNotifications()
    handleNotificationIntent(intent)
    setupImeInsetsListener(webView)
  }

  private var lastDispatchedImeInsetPx = -1

  /**
   * enableEdgeToEdge() (required for this project's targetSdk) means the
   * system never resizes the window/WebView for the soft keyboard the old
   * android:windowSoftInputMode="adjustResize" way, so window.innerHeight /
   * visualViewport never change when it opens — the frontend's own resize
   * listener has nothing to react to. This reads the real IME inset from the
   * window insets (the one source that does update as the keyboard
   * animates) and pushes it into the WebView as a DOM event, in CSS px so it
   * lines up with the values the frontend already works in.
   */
  private fun setupImeInsetsListener(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val imeHeightPx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      if (imeHeightPx != lastDispatchedImeInsetPx) {
        lastDispatchedImeInsetPx = imeHeightPx
        val density = resources.displayMetrics.density
        val imeHeightCss = if (density > 0f) imeHeightPx / density else imeHeightPx.toFloat()
        dispatchKeyboardInsetToWebview(imeHeightCss)
      }
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun dispatchKeyboardInsetToWebview(heightCss: Float) {
    val script =
      "(function(){" +
      "window.dispatchEvent(new CustomEvent('fg:keyboard-inset', { detail: { height: $heightCss } }));" +
      "})();"
    runOnUiThread {
      webViewRef?.evaluateJavascript(script, null)
    }
  }

  override fun onResume() {
    super.onResume()
    inForeground = true
    val refreshed = pendingRefreshedFcmToken
    if (refreshed != null) {
      pendingRefreshedFcmToken = null
      latestFcmToken = refreshed
      Log.d("FCM", "onResume: dispatching pending refreshed FCM token")
      dispatchFcmTokenToWebview(refreshed, 0)
    } else {
      latestFcmToken?.let {
        Log.d("FCM", "onResume: retrying token dispatch to WebView")
        dispatchFcmTokenToWebview(it, 0)
      }
    }
    dispatchPendingPushNotifications()
    handleNotificationIntent(intent)
  }

  override fun onPause() {
    inForeground = false
    super.onPause()
  }

  /**
   * JavaScript bridge exposed as `window.FreeGrindBridge`. Frontend calls
   * `setActiveRoute(path + search)` whenever the React route or document
   * focus changes so that the FCM service can decide whether to suppress
   * a system notification.
   */
  inner class JsBridge {
    @JavascriptInterface
    fun setActiveRoute(route: String?) {
      activeRoute = route
      Log.d("FCM", "JsBridge.setActiveRoute=$route foreground=$inForeground")
    }

    @JavascriptInterface
    fun setNotificationPreferences(json: String) {
      try {
        val obj = JSONObject(json)
        chatNotificationsEnabled = obj.optBoolean("chatEnabled", true)
        tapNotificationsEnabled = obj.optBoolean("tapsEnabled", true)
        foregroundNotificationsEnabled = obj.optBoolean("foregroundEnabled", true)
        Log.d(
          "FCM",
          "JsBridge.setNotificationPreferences chat=$chatNotificationsEnabled taps=$tapNotificationsEnabled foreground=$foregroundNotificationsEnabled",
        )
      } catch (e: Exception) {
        Log.e("FCM", "Failed to parse notification preferences", e)
      }
    }

    /**
     * Called once by main.tsx right after the first real paint (double
     * requestAnimationFrame past the initial React render) — dismisses the
     * system splash screen and the custom splash overlay installed in
     * onCreate. Until this fires (or the 45s fallback in onCreate elapses),
     * the splash stays up instead of the blank WebView background that
     * would otherwise show while the app loads.
     */
    @JavascriptInterface
    fun notifyContentReady() {
      Log.d("Splash", "JsBridge.notifyContentReady() called from JS")
      dismissSplash()
    }

    /**
     * Posts a notification straight from the chat WebSocket while it's
     * connected in the foreground, instead of waiting for the FCM push for
     * the same message/tap to arrive. Runs off the JS-interface thread since
     * NotificationPoster fetches the sender's avatar over the network.
     * NotificationPoster dedupes against the later FCM-triggered post for
     * the same conversation/tap, so it never shows twice.
     */
    @JavascriptInterface
    fun postLocalNotification(payloadJson: String) {
      localNotifExecutor.execute {
        try {
          NotificationPoster.postNotification(this@MainActivity, JSONObject(payloadJson))
        } catch (e: Exception) {
          Log.e("FCM", "Failed to post local notification", e)
        }
      }
    }

    @JavascriptInterface
    fun checkMicrophonePermission(): Boolean {
      return checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun checkNotificationPermission(): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
          android.content.pm.PackageManager.PERMISSION_GRANTED
      } else {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.areNotificationsEnabled()
      }
    }

    @JavascriptInterface
    fun checkLocationPermission(): Boolean {
      return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED ||
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ==
        android.content.pm.PackageManager.PERMISSION_GRANTED
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
          vm.defaultVibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
          @Suppress("DEPRECATION")
          val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
          } else {
            @Suppress("DEPRECATION")
            v.vibrate(durationMs)
          }
        }
      } catch (t: Throwable) {
        Log.w("Bridge", "vibrate failed", t)
      }
    }
  }

  override fun onDestroy() {
    if (activityRef?.get() === this) {
      activityRef = null
    }
    localNotifExecutor.shutdown()
    super.onDestroy()
  }

  private fun initFirebase() {
    try {
      val spoofedContext = SpoofedContext(applicationContext)
      val options = FirebaseOptions.Builder()
        .setApplicationId(getString(R.string.fcm_google_app_id))
        .setProjectId(getString(R.string.fcm_project_id))
        .setApiKey(getString(R.string.fcm_google_api_key))
        .setGcmSenderId(getString(R.string.fcm_gcm_defaultSenderId))
        .build()

      if (FirebaseApp.getApps(spoofedContext).isEmpty()) {
        FirebaseApp.initializeApp(spoofedContext, options)
      }
      Log.d("FCM", "Firebase initialized with spoofed context")

      try {
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
      } catch (t: Throwable) {
        Log.e("FCM", "Firebase Messaging unavailable; continuing without push token", t)
      }
    } catch (t: Throwable) {
      Log.e("FCM", "Firebase initialization failed; continuing without push", t)
    }
  }

  private fun ensureNotificationChannels() {
    val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

    // Note: We use the "_v2" suffix to ensure custom sound and high importance
    // settings are applied correctly even on devices that already had previous versions.
    val chatChannel = NotificationChannel(
      "free_grind_chat_notifications_v2",
      "Chat Messages",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications for new chat messages"
      enableLights(true)
      enableVibration(true)
      setShowBadge(true)
    }

    val tapsChannel = NotificationChannel(
      "free_grind_taps_notifications_v2",
      "Taps",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Notifications for incoming taps"
      enableLights(true)
      enableVibration(true)
      setShowBadge(true)
    }

    notificationManager.createNotificationChannel(chatChannel)
    notificationManager.createNotificationChannel(tapsChannel)
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
    if (intent == null) {
      return
    }

    val payloadJson = intent.getStringExtra("push_payload")
    if (!payloadJson.isNullOrBlank()) {
      intent.removeExtra("push_payload")
      val openedPayload = toOpenedPushPayload(payloadJson)
      cancelNotificationForAction(extractActionFromPayload(openedPayload))
      dispatchPushNotificationToWebview(openedPayload, 0)
      return
    }

    val rawAction = intent.getStringExtra("action")?.trim().orEmpty()
    val action = normalizeNotificationAction(rawAction)
    if (action.isBlank()) {
      return
    }

    intent.removeExtra("action")
    cancelNotificationForAction(action)
    dispatchPushNotificationToWebview(toOpenedPushPayloadFromAction(action), 0)
  }

  private fun normalizeNotificationAction(action: String): String {
    val trimmed = action.trim()
    if (trimmed.isEmpty()) {
      return ""
    }

    if (trimmed == "taps" || trimmed.startsWith("chat:")) {
      return trimmed
    }

    // Backward compatibility: some payloads may still carry raw Grindr deeplink actions.
    val conversationId = parseConversationIdFromDeeplinkAction(trimmed)
    return if (!conversationId.isNullOrBlank()) {
      "chat:$conversationId"
    } else {
      trimmed
    }
  }

  private fun parseConversationIdFromDeeplinkAction(action: String): String? {
    val queryPart = action.substringAfter('?', "")
    if (queryPart.isBlank()) {
      return null
    }

    queryPart.split('&').forEach { pair ->
      val key = pair.substringBefore('=', "").trim()
      if (key != "id") {
        return@forEach
      }

      val rawValue = pair.substringAfter('=', "").trim()
      val decoded = URLDecoder.decode(rawValue, StandardCharsets.UTF_8.name()).trim()
      if (decoded.isNotEmpty()) {
        return decoded
      }
    }

    return null
  }

  private fun toOpenedPushPayloadFromAction(action: String): String {
    val conversationId = if (action.startsWith("chat:")) {
      action.substringAfter("chat:").trim().ifBlank { null }
    } else {
      null
    }
    val isTap = action == "taps"

    return JSONObject().apply {
      put("event", "opened")
      put("source", "notification_intent")
      put("openedAt", System.currentTimeMillis())
      put("action", action)
      put("isTap", isTap)
      put("conversationId", conversationId ?: JSONObject.NULL)
    }.toString()
  }

  private fun extractActionFromPayload(payloadJson: String): String? {
    return try {
      val payload = JSONObject(payloadJson)
      payload.optString("action").trim().ifBlank { null }
    } catch (error: Exception) {
      Log.w("FCM", "Failed to read action from opened payload", error)
      null
    }
  }

  private fun cancelNotificationForAction(action: String?) {
    if (action.isNullOrBlank() || !action.startsWith("chat:")) {
      return
    }

    val conversationId = action.substringAfter("chat:").trim()
    if (conversationId.isBlank()) {
      return
    }

    val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    notificationManager.cancel(conversationId.hashCode())
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
