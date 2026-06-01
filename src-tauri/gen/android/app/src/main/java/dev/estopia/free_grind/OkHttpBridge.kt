package dev.estopia.free_grind

import android.util.Base64
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object OkHttpBridge {
  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .followRedirects(false)
      .followSslRedirects(false)
      .retryOnConnectionFailure(true)
      .connectTimeout(15, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS)
      .writeTimeout(30, TimeUnit.SECONDS)
      .build()
  }

  @JvmStatic
  fun execute(
    method: String,
    url: String,
    headersJson: String,
    bodyBase64: String?,
    contentType: String?
  ): String {
    return try {
      val headersObj = JSONObject(headersJson)
      val builder = Request.Builder().url(url)

      val it = headersObj.keys()
      while (it.hasNext()) {
        val key = it.next()
        val value = headersObj.optString(key, "")
        if (value.isNotEmpty()) {
          builder.addHeader(key, value)
        }
      }

      val hasBody = !bodyBase64.isNullOrEmpty()
      val upperMethod = method.uppercase()
      val requestBody = if (hasBody) {
        val decoded = Base64.decode(bodyBase64, Base64.NO_WRAP)
        val mediaType = (contentType ?: "application/json").toMediaTypeOrNull()
        decoded.toRequestBody(mediaType)
      } else {
        null
      }

      val request = when {
        upperMethod == "GET" || upperMethod == "HEAD" -> builder.method(upperMethod, null).build()
        else -> builder.method(upperMethod, requestBody ?: ByteArray(0).toRequestBody(null)).build()
      }

      client.newCall(request).execute().use { response ->
        val bytes = response.body?.bytes() ?: ByteArray(0)
        JSONObject()
          .put("status", response.code)
          .put("bodyBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
          .toString()
      }
    } catch (t: Throwable) {
      JSONObject()
        .put("status", 0)
        .put("bodyBase64", "")
        .put("error", t.message ?: t.toString())
        .toString()
    }
  }
}
