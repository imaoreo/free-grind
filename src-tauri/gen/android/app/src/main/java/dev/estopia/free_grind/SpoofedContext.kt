package dev.estopia.free_grind

import android.app.Application
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.util.Log

class SpoofedContext(base: Context) : Application() {
    private fun shouldSpoofForCaller(): Boolean {
        val stackTrace = Thread.currentThread().stackTrace

        // Keep component discovery on the real package so Firebase can load manifest-registered components.
        if (stackTrace.any { it.className.contains("ComponentDiscovery") }) {
            return false
        }

        return stackTrace.any {
            it.className.contains("FirebaseInstallationServiceClient") ||
            it.className.contains("com.google.firebase.installations.remote") ||
            it.className.contains("com.google.firebase.messaging.Metadata") ||
            it.className.contains("FirebaseMessaging") ||
            // Obfuscated classes seen in logs during FIS auth requests.
            it.className == "r2.b"
        }
    }

    init {
        attachBaseContext(base)
    }

    override fun getApplicationContext(): Context {
        return this
    }

    override fun getPackageName(): String {
        if (shouldSpoofForCaller()) {
            Log.d("SpoofedContext", "getPackageName() spoofed for Firebase caller")
            return "com.grindrapp.android"
        }
        return baseContext.packageName
    }

    override fun getOpPackageName(): String {
        if (shouldSpoofForCaller()) {
            Log.d("SpoofedContext", "getOpPackageName() spoofed for Firebase caller")
            return "com.grindrapp.android"
        }
        return super.getOpPackageName()
    }

    override fun getApplicationInfo(): ApplicationInfo {
        val info = super.getApplicationInfo()
        if (shouldSpoofForCaller()) {
            Log.d("SpoofedContext", "getApplicationInfo() spoofed")
            info.packageName = "com.grindrapp.android"
        }
        return info
    }

    override fun getPackageManager(): PackageManager {
        return SpoofedPackageManager(super.getPackageManager(), baseContext.packageName, baseContext.resources)
    }
}
