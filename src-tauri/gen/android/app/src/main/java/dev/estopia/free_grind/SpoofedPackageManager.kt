package dev.estopia.free_grind

import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
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

    override fun getPackageInfo(p0: String, p1: Int): PackageInfo {
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
