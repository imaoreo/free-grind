package dev.estopia.free_grind

import android.app.Application
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ApplicationInfo
import android.util.Log

class SpoofedContext(base: Context) : Application() {
    init {
        attachBaseContext(base)
    }

    override fun getApplicationContext(): Context {
        return this
    }

    private fun logIdentityLookup(method: String) {
        val caller = Thread.currentThread().stackTrace
            .firstOrNull {
                !it.className.contains("SpoofedContext") &&
                    !it.className.contains("java.lang.Thread")
            }
        val callerText = if (caller != null) {
            "${caller.className}.${caller.methodName}:${caller.lineNumber}"
        } else {
            "unknown"
        }
        Log.d("SpoofedContext", "Identity lookup via $method caller=$callerText")
    }

    override fun getPackageName(): String {
        logIdentityLookup("getPackageName")
        val stackTrace = Thread.currentThread().stackTrace
        val isFirebaseCaller = stackTrace.any { 
            it.className.contains("FirebaseInstallationServiceClient") || 
            it.className.contains("com.google.firebase") 
        }
        
        // Android's ComponentDiscoveryService needs the real package name to find the registered Firebase components in the Manifest.
        // We ONLY spoof the package name if we suspect Firebase is trying to do an auth/fingerprint check.
        if (isFirebaseCaller && stackTrace.any { !it.className.contains("ComponentDiscovery") }) {
             // Let's be aggressive: if it's Firebase but NOT ComponentDiscovery, spoof it.
             // Actually, the ComponentDiscovery class is `com.google.firebase.components.ComponentDiscovery`
        }

        // A safer check matching your GrindrPlus analysis:
        if (stackTrace.any { it.className.contains("FirebaseInstallationServiceClient") }) {
            Log.d("SpoofedContext", "getPackageName() spoofed for FirebaseInstallation")
            return "com.grindrapp.android"
        }
        
        // Also required for FCM metadata fetching according to GrindrPlus analysis
        if (stackTrace.any { it.className.contains("com.google.firebase.messaging.Metadata") || it.className.contains("FirebaseMessaging") }) {
            Log.d("SpoofedContext", "getPackageName() spoofed for FirebaseMessaging")
            return "com.grindrapp.android"
        }

        return baseContext.packageName
    }

    override fun getPackageManager(): PackageManager {
        return SpoofedPackageManager(
            super.getPackageManager(),
            baseContext.packageName,
            getString(R.string.grindr_cert)
        )
    }

    override fun getApplicationInfo(): ApplicationInfo {
        logIdentityLookup("getApplicationInfo")
        val info = super.getApplicationInfo()
        val stackTrace = Thread.currentThread().stackTrace
        if (stackTrace.any { it.className.contains("FirebaseInstallationServiceClient") || it.className.contains("com.google.firebase.messaging") }) {
            Log.d("SpoofedContext", "getApplicationInfo() spoofed")
            info.packageName = "com.grindrapp.android"
        }
        return info
    }
}
