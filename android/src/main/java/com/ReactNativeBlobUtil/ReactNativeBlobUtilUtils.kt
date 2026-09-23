package com.ReactNativeBlobUtil

import android.content.Context
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.OkHttpClient
import java.io.BufferedReader
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.io.InputStreamReader
import java.nio.charset.Charset
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.Certificate
import java.security.cert.CertificateFactory
import java.util.Locale
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * A class with a companion rather than an object, so the public members keep the
 * shape apps already use from Java and Kotlin: `ReactNativeBlobUtilUtils.sharedTrustManager = ...`.
 */
class ReactNativeBlobUtilUtils {

    companion object {

        /**
         * Trust manager for requests made with `trusty: true`. The library ships
         * none; an app that needs trusty sets its own (see the README).
         */
        @JvmField
        var sharedTrustManager: X509TrustManager? = null

        private val SCHEME = Regex("\\w+\\:.*")

        @JvmStatic
        fun getMD5(input: String?): String? {
            if (input == null) {
                return null
            }
            return try {
                val md = MessageDigest.getInstance("MD5")
                md.update(input.toByteArray())
                md.digest().joinToString("") { String.format(Locale.ROOT, "%02x", it.toInt() and 0xff) }
            } catch (ex: Exception) {
                ex.printStackTrace()
                null
            }
        }

        @JvmStatic
        fun emitWarningEvent(data: String?) {
            val args = Arguments.createMap()
            args.putString("event", "warn")
            args.putString("detail", data)

            // emit event to js context
            ReactNativeBlobUtilImpl.RCTContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(ReactNativeBlobUtilConst.EVENT_MESSAGE, args)
        }

        @JvmStatic
        fun getUnsafeOkHttpClient(client: OkHttpClient): OkHttpClient.Builder {
            try {
                val trustManager = sharedTrustManager
                    ?: throw IllegalStateException("Use of own trust manager but none defined")

                val trustAllCerts = arrayOf<TrustManager>(trustManager)

                // Install the all-trusting trust manager
                val sslContext = SSLContext.getInstance("SSL")
                sslContext.init(null, trustAllCerts, SecureRandom())
                // Create an ssl socket factory with our all-trusting manager
                val sslSocketFactory = sslContext.socketFactory

                val builder = client.newBuilder()
                builder.sslSocketFactory(sslSocketFactory, trustManager)
                // The hostname is still verified. trusty used to switch that off too, so
                // an app whose trust manager validated a private CA properly still
                // accepted that CA's certificate for any name.

                return builder
            } catch (e: Exception) {
                throw RuntimeException(e)
            }
        }

        /**
         * A client that trusts the custom CAs. With pinnedHosts, only for those hosts,
         * decided per handshake so redirects are covered (ReactNativeBlobUtilPinnedTrustManager);
         * every other host gets the system's trust, which is what the README documents
         * and what iOS does by returning NSURLSessionAuthChallengePerformDefaultHandling.
         */
        @JvmStatic
        fun getCustomCACertOkHttpClient(
            client: OkHttpClient,
            context: Context,
            certNames: List<String?>,
            trustSystemCerts: Boolean,
            pinnedHosts: List<String?>? = null,
        ): OkHttpClient.Builder {
            try {
                val cf = CertificateFactory.getInstance("X.509")
                val keyStore = KeyStore.getInstance(KeyStore.getDefaultType())
                keyStore.load(null, null)

                if (trustSystemCerts) {
                    val defaultTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
                    defaultTmf.init(null as KeyStore?)
                    var systemIndex = 0
                    for (tm in defaultTmf.trustManagers) {
                        if (tm is X509TrustManager) {
                            for (cert in tm.acceptedIssuers) {
                                keyStore.setCertificateEntry("system_${systemIndex++}", cert)
                            }
                        }
                    }
                }

                var loaded = 0
                for (certName in certNames) {
                    val cert = loadCertificateFromResources(context, cf, certName)
                    if (cert != null) {
                        keyStore.setCertificateEntry(certName, cert)
                        loaded++
                    }
                }

                // Fail closed. Without this the keystore is empty, every connection fails
                // trust evaluation, and the developer sees a generic handshake error rather
                // than the actual problem: the certificate is not in res/raw under that name.
                if (loaded == 0) {
                    throw IllegalStateException("customCACerts: none of $certNames could be loaded from res/raw")
                }

                val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
                tmf.init(keyStore)

                val caTrustManager = tmf.trustManagers.firstOrNull { it is X509TrustManager } as X509TrustManager?
                    ?: throw IllegalStateException("No X509TrustManager found")
                val customTrustManager: X509TrustManager = if (pinnedHosts.isNullOrEmpty()) {
                    caTrustManager
                } else {
                    val systemTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
                    systemTmf.init(null as KeyStore?)
                    val systemTrustManager = systemTmf.trustManagers.firstOrNull { it is X509TrustManager } as X509TrustManager?
                        ?: throw IllegalStateException("No system X509TrustManager found")
                    ReactNativeBlobUtilPinnedTrustManager(caTrustManager, systemTrustManager, pinnedHosts)
                }

                val sslContext = SSLContext.getInstance("TLS")
                sslContext.init(null, arrayOf<TrustManager>(customTrustManager), SecureRandom())

                val builder = client.newBuilder()
                builder.sslSocketFactory(sslContext.socketFactory, customTrustManager)

                // No hostnameVerifier override: the default verifier still applies, so a
                // certificate is only accepted for the names it actually carries.

                return builder
            } catch (e: Exception) {
                throw RuntimeException("Failed to configure custom CA certificates", e)
            }
        }

        private fun loadCertificateFromResources(context: Context, cf: CertificateFactory, certName: String?): Certificate? {
            var resId = context.resources.getIdentifier(certName, "raw", context.packageName)
            if (resId == 0) {
                for (suffix in arrayOf("_pem", "_der", "_cer")) {
                    resId = context.resources.getIdentifier(certName + suffix, "raw", context.packageName)
                    if (resId != 0) break
                }
            }
            if (resId == 0) return null

            try {
                context.resources.openRawResource(resId).use { return cf.generateCertificate(it) }
            } catch (e: Exception) {
                // DER parsing failed — try PEM-to-DER conversion
            }

            try {
                context.resources.openRawResource(resId).use {
                    val derBytes = pemToDer(it)
                    if (derBytes != null) {
                        return cf.generateCertificate(ByteArrayInputStream(derBytes))
                    }
                }
            } catch (e: Exception) {
                // PEM conversion also failed
            }

            return null
        }

        private fun pemToDer(input: InputStream): ByteArray? {
            return try {
                val reader = BufferedReader(InputStreamReader(input))
                val base64 = StringBuilder()
                while (true) {
                    val line = reader.readLine() ?: break
                    if (line.startsWith("-----")) continue
                    // Java's String.trim: only characters up to ' ', unlike Kotlin's trim().
                    base64.append(line.trim { it <= ' ' })
                }
                Base64.decode(base64.toString(), Base64.DEFAULT)
            } catch (e: Exception) {
                null
            }
        }

        /**
         * String to byte converter method
         *
         * @param data     Raw data in string format
         * @param encoding Decoder name
         * @return Converted data byte array
         */
        @JvmStatic
        private val BASE64_ALPHABET = Regex("[A-Za-z0-9+/=\\s]*")

        fun stringToBytes(data: String, encoding: String): ByteArray {
            if (encoding.equals("ascii", ignoreCase = true)) {
                return data.toByteArray(Charset.forName("US-ASCII"))
            } else if (encoding.lowercase(Locale.ROOT).contains("base64")) {
                // Android's decoder skips characters outside the alphabet, so
                // "@@@@" decoded to nothing and a write of it succeeded with 0 bytes.
                // iOS rejects such input; so does Android now.
                if (!BASE64_ALPHABET.matches(data)) {
                    throw IllegalArgumentException("Invalid base64 data")
                }
                return Base64.decode(data, Base64.NO_WRAP)
            } else if (encoding.equals("utf8", ignoreCase = true)) {
                return data.toByteArray(Charset.forName("UTF-8"))
            }
            return data.toByteArray(Charset.forName("US-ASCII"))
        }

        /**
         * The file path a string names: a plain path as it is, a file:// URI without
         * its scheme, a bundle-assets:// URI unchanged. Any other URI, content://
         * above all, is not a file path and yields null; callers open it through
         * ContentResolver (ReactNativeBlobUtilContent). Resolving a content URI to
         * a path let a URI shared by another app name this app's private files.
         *
         * @param path URI string.
         * @return The path, or null for a URI that is not one.
         */
        @JvmStatic
        fun normalizePath(path: String?): String? {
            if (path == null) return null
            if (!SCHEME.matches(path)) return path
            if (path.startsWith("file://")) {
                return path.replace("file://", "")
            }

            return if (path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) path else null
        }

        @JvmStatic
        fun isAsset(path: String?): Boolean =
            path != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)

        @JvmStatic
        fun isContentUri(path: String?): Boolean =
            path != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_CONTENT)
    }
}
