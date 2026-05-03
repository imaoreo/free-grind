package dev.estopia.free_grind

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.content.res.Resources
import android.util.Log

class SpoofedPackageManager(
    private val base: PackageManager,
    private val basePackageName: String,
    private val resources: Resources
) : AbstractSpoofedPackageManager(base) {

    override fun getPackageInfo(p0: String, p1: Int): PackageInfo {
        if (p0 == "com.grindrapp.android") {
            Log.e("SpoofedPackageManager", "Returning spoofed PackageInfo for com.grindrapp.android.")
            val packageInfo = base.getPackageInfo(basePackageName, p1)
            packageInfo.packageName = "com.grindrapp.android"
            val certResId = resources.getIdentifier("grindr_cert", "string", basePackageName)
            if (certResId == 0) {
                Log.w("SpoofedPackageManager", "Optional string resource 'grindr_cert' was not found; using app signature.")
                return packageInfo
            }

            val certHex = resources.getString(certResId).trim()
            val isHex = certHex.length % 2 == 0 && certHex.matches(Regex("(?i)^[0-9a-f]+$"))
            if (!isHex) {
                Log.w("SpoofedPackageManager", "Invalid grindr_cert format; expected even-length hex string. Using app signature.")
                return packageInfo
            }

            val certBytes = certHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            packageInfo.signatures = arrayOf(Signature(certBytes))
            return packageInfo
        }
        return base.getPackageInfo(p0, p1)
    }
}
