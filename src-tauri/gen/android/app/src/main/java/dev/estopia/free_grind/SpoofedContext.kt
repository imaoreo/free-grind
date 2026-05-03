package dev.estopia.free_grind

import android.app.Application
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.util.Log

class SpoofedContext(base: Context) : Application() {
    init {
        attachBaseContext(base)
    }

    override fun getApplicationContext(): Context {
        return this
    }

    override fun getPackageName(): String {
        val stackTrace = Thread.currentThread().stackTrace

        if (stackTrace.any { it.className.contains("FirebaseInstallationServiceClient") }) {
            Log.d("SpoofedContext", "getPackageName() spoofed for FirebaseInstallation")
            return "com.grindrapp.android"
        }

        if (stackTrace.any {
            it.className.contains("com.google.firebase.messaging.Metadata") ||
            it.className.contains("FirebaseMessaging")
        }) {
            Log.d("SpoofedContext", "getPackageName() spoofed for FirebaseMessaging")
            return "com.grindrapp.android"
        }

        return baseContext.packageName
    }

    override fun getApplicationInfo(): ApplicationInfo {
        val info = super.getApplicationInfo()
        val stackTrace = Thread.currentThread().stackTrace
        if (stackTrace.any {
            it.className.contains("FirebaseInstallationServiceClient") ||
            it.className.contains("com.google.firebase.messaging")
        }) {
            Log.d("SpoofedContext", "getApplicationInfo() spoofed")
            info.packageName = "com.grindrapp.android"
        }
        return info
    }

    override fun getPackageManager(): PackageManager {
        return SpoofedPackageManager(super.getPackageManager(), baseContext.packageName, baseContext.resources)
    }
}
