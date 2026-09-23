package com.ReactNativeBlobUtil

import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509TrustManager

/**
 * Which trust a request gets: trusty, customCACerts with and without pinnedHosts,
 * and the media file names that could climb out of their directory.
 */
class ReactNativeBlobUtilTrustTest {

    /** A trust manager that only records that it was asked. */
    private class Recording(private val name: String, private val log: MutableList<String>) : X509TrustManager {
        override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
            log.add(name)
        }

        override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}

        override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    }

    @After
    fun clearSharedTrustManager() {
        ReactNativeBlobUtilUtils.sharedTrustManager = null
    }

    // trusty replaced the hostname verifier with one that accepts every name, so
    // an app trust manager that validated a private CA still let that CA's
    // certificate stand in for any host.
    @Test
    fun `trusty keeps OkHttp's hostname verification`() {
        ReactNativeBlobUtilUtils.sharedTrustManager = Recording("app", mutableListOf())
        val client = ReactNativeBlobUtilUtils.getUnsafeOkHttpClient(OkHttpClient()).build()
        assertSame(OkHttpClient().hostnameVerifier, client.hostnameVerifier)
    }

    // The request used to choose its trust from the first URL only, so a redirect
    // to a pinned host was checked against the system store. The choice is now
    // made per handshake, from the host that handshake is for.
    @Test
    fun `pinned hosts are checked against the custom CAs, other hosts against the system's`() {
        val log = mutableListOf<String>()
        val tm = ReactNativeBlobUtilPinnedTrustManager(Recording("custom", log), Recording("system", log), listOf("API.Example.com"))
        val chain = arrayOf<X509Certificate>()
        fun engineFor(host: String): SSLEngine = SSLContext.getDefault().createSSLEngine(host, 443)

        tm.checkServerTrusted(chain, "RSA", engineFor("api.example.com"))
        tm.checkServerTrusted(chain, "RSA", engineFor("other.example.com"))
        // Without a host, the custom CAs decide: fail closed.
        tm.checkServerTrusted(chain, "RSA", null as SSLEngine?)
        tm.checkServerTrusted(chain, "RSA")

        assertEquals(listOf("custom", "system", "custom", "custom"), log)
    }

    // Before Android 10 a media file is created at relativePath + folder + name,
    // so "../" in either reached any directory the app can write to.
    @Test
    fun `a media name or folder may not climb out with dot-dot`() {
        assertTrue(ReactNativeBlobUtilMediaCollection.hasParentSegment("../secret.txt"))
        assertTrue(ReactNativeBlobUtilMediaCollection.hasParentSegment("a/../../b"))
        assertTrue(ReactNativeBlobUtilMediaCollection.hasParentSegment("a\\..\\b"))
        assertFalse(ReactNativeBlobUtilMediaCollection.hasParentSegment("a..b.png"))
        assertFalse(ReactNativeBlobUtilMediaCollection.hasParentSegment("..hidden"))
        assertFalse(ReactNativeBlobUtilMediaCollection.hasParentSegment("photos/2026"))
        assertFalse(ReactNativeBlobUtilMediaCollection.hasParentSegment(null))
    }
}
