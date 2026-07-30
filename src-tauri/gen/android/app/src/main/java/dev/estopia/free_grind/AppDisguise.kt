package dev.estopia.free_grind

import android.app.Activity
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.util.Log

/**
 * Swaps the app's launcher icon/name between the real "Free Grind" identity
 * and a decoy (Calculator/Notes/Weather), by enabling exactly one of the
 * activity-alias entries declared in AndroidManifest.xml and disabling the
 * rest. All aliases target the same MainActivity, so this never affects
 * which code runs — only what the home screen/app drawer show before the
 * app is opened.
 *
 * PackageManager.DONT_KILL_APP is passed so this can be called from a
 * running JsBridge call without the process dying mid-call; the system
 * still notifies launchers of the icon/label change via a package-changed
 * broadcast. Some launchers only pick this up after returning to the home
 * screen (or a launcher restart) — a known limitation of this technique,
 * not a bug here.
 */
object AppDisguise {
  // Shared with MainActivity.ensureNotificationChannels and NotificationPoster,
  // which both need to (re)create these same two channel ids.
  const val CHAT_CHANNEL_ID = "free_grind_chat_notifications_v2"
  const val TAPS_CHANNEL_ID = "free_grind_taps_notifications_v2"

  enum class Identity(
    val id: String,
    val aliasSimpleName: String,
    // Notification channel names shown in Android's per-app notification
    // settings — kept generic (not "Free Grind"-themed) for the decoy
    // identities so that surface doesn't give the disguise away either.
    val chatChannelName: String,
    val tapsChannelName: String,
    // Same label/icon shown on the launcher alias — reused for the Recents
    // (task switcher) card and the custom splash dialog, the two other
    // places that otherwise keep showing the real "Free Grind" identity
    // regardless of which alias is enabled.
    val labelRes: Int,
    val iconRes: Int,
  ) {
    DEFAULT("default", "DisguiseDefaultAlias", "Chat Messages", "Taps", R.string.app_name, R.mipmap.ic_launcher),
    CALCULATOR(
      "calculator", "DisguiseCalculatorAlias", "Reminders", "Alerts",
      R.string.disguise_name_calculator, R.mipmap.ic_launcher_calculator,
    ),
    NOTES(
      "notes", "DisguiseNotesAlias", "Reminders", "Alerts",
      R.string.disguise_name_notes, R.mipmap.ic_launcher_notes,
    ),
    WEATHER(
      "weather", "DisguiseWeatherAlias", "Reminders", "Alerts",
      R.string.disguise_name_weather, R.mipmap.ic_launcher_weather,
    );

    companion object {
      fun fromId(id: String): Identity? = entries.find { it.id == id }
    }
  }

  private fun aliasComponent(context: Context, identity: Identity): ComponentName =
    ComponentName(context.packageName, "${context.packageName}.${identity.aliasSimpleName}")

  /** Enables the alias for [identity] and disables all the others. Returns true on success. */
  fun applyDisguise(context: Context, identity: Identity): Boolean {
    return try {
      val pm = context.packageManager
      for (candidate in Identity.entries) {
        val state = if (candidate == identity) {
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        } else {
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED
        }
        pm.setComponentEnabledSetting(aliasComponent(context, candidate), state, PackageManager.DONT_KILL_APP)
      }
      refreshChannelNames(context, identity)
      Log.d("AppDisguise", "Applied disguise: ${identity.id}")
      true
    } catch (t: Throwable) {
      Log.e("AppDisguise", "Failed to apply disguise ${identity.id}", t)
      false
    }
  }

  /** Reads back which alias is currently enabled; falls back to DEFAULT if none/multiple report enabled. */
  fun currentDisguise(context: Context): Identity {
    val pm = context.packageManager
    for (candidate in Identity.entries) {
      val setting = pm.getComponentEnabledSetting(aliasComponent(context, candidate))
      val isEnabled = setting == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
        (setting == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && candidate == Identity.DEFAULT)
      if (isEnabled) {
        return candidate
      }
    }
    return Identity.DEFAULT
  }

  /** The channel display name to use for the currently active disguise. */
  fun channelName(context: Context, isTap: Boolean): String {
    val identity = currentDisguise(context)
    return if (isTap) identity.tapsChannelName else identity.chatChannelName
  }

  /**
   * Updates this task's Recents/multitasking-switcher card (icon + label) to
   * match [identity]. Without this, Recents falls back to the app's real
   * <application> icon/label ("Free Grind") regardless of which launcher
   * alias is enabled — arguably the most visible remaining leak, since
   * Recents is commonly glanced at by anyone else holding the phone. Safe
   * to call repeatedly (on every cold start and right after switching).
   */
  fun applyTaskDescription(activity: Activity, identity: Identity) {
    try {
      val label = activity.getString(identity.labelRes)
      val icon = BitmapFactory.decodeResource(activity.resources, identity.iconRes)
      @Suppress("DEPRECATION")
      activity.setTaskDescription(ActivityManager.TaskDescription(label, icon))
    } catch (t: Throwable) {
      Log.e("AppDisguise", "Failed to update task description for ${identity.id}", t)
    }
  }

  // Renaming an *existing* channel just means calling createNotificationChannel
  // again with a new name for the same id — per-channel fields the user could
  // have customized (importance, sound) are left alone by the system on
  // repeat calls; only name/description apply. So this is safe to call both
  // at startup and right after switching disguises, without needing to
  // delete+recreate the channel (which would reset those user customizations).
  private fun refreshChannelNames(context: Context, identity: Identity) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(
      NotificationChannel(CHAT_CHANNEL_ID, identity.chatChannelName, NotificationManager.IMPORTANCE_HIGH)
    )
    nm.createNotificationChannel(
      NotificationChannel(TAPS_CHANNEL_ID, identity.tapsChannelName, NotificationManager.IMPORTANCE_HIGH)
    )
  }
}
