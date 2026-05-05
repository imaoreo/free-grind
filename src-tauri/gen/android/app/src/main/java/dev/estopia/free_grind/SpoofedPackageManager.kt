package dev.estopia.free_grind

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.content.pm.ApplicationInfo
import android.util.Log

class SpoofedPackageManager(
    private val base: PackageManager,
    private val basePackageName: String,
    private val grindrCertHex: String
) : AbstractSpoofedPackageManager(base) {

    private fun decodeHexString(hex: String): ByteArray {
        val cleaned = hex.trim().replace(" ", "").replace("\n", "")
        require(cleaned.length % 2 == 0) { "grindr_cert hex must have an even length" }
        return cleaned.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }

    override fun getApplicationInfo(p0: String, p1: Int): ApplicationInfo {
        Log.d("SpoofedPackageManager", "getApplicationInfo request package=$p0 flags=$p1")
        return base.getApplicationInfo(p0, p1)
    }

    override fun getPackageInfo(p0: String, p1: Int): PackageInfo {
        Log.d("SpoofedPackageManager", "getPackageInfo request package=$p0 flags=$p1")
        if (p0 == "com.grindrapp.android") {
            Log.e("SpoofedPackageManager", "Returning spoofed PackageInfo for com.grindrapp.android.")
            val packageInfo = base.getPackageInfo(basePackageName, p1)
            packageInfo.packageName = "com.grindrapp.android"
            val sha1Bytes = decodeHexString(grindrCertHex)
            packageInfo.signatures = arrayOf(Signature(sha1Bytes))
            return packageInfo
        }
        return base.getPackageInfo(p0, p1)
    }
}
