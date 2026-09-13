package com.ReactNativeBlobUtil.apicheck

import com.ReactNativeBlobUtil.ReactNativeBlobUtilFileTransformer
import com.ReactNativeBlobUtil.ReactNativeBlobUtilPackage
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils
import com.facebook.react.ReactPackage
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertSame
import org.junit.Test
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

/**
 * The README's Android setup as a Kotlin app writes it, from outside the library's
 * package. Like ReadmeJavaSnippetsTest, compiling is most of the check.
 */
class ReadmeKotlinSnippetsTest {

    @After
    fun clearSharedState() {
        ReactNativeBlobUtilUtils.sharedTrustManager = null
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = null
    }

    @Test
    fun `apps set the trust manager for trusty requests`() {
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}

            override fun getAcceptedIssuers(): Array<X509Certificate> {
                return arrayOf()
            }
        }
        ReactNativeBlobUtilUtils.sharedTrustManager = trustManager
        assertSame(trustManager, ReactNativeBlobUtilUtils.sharedTrustManager)
    }

    @Test
    fun `apps set the file transformer`() {
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = object : ReactNativeBlobUtilFileTransformer.FileTransformer {
            override fun onWriteFile(data: ByteArray): ByteArray = data

            override fun onReadFile(data: ByteArray): ByteArray = data
        }
        assertArrayEquals(byteArrayOf(1, 2), ReactNativeBlobUtilFileTransformer.sharedFileTransformer.onReadFile(byteArrayOf(1, 2)))
    }

    @Test
    fun `apps register the package by hand`() {
        val blobUtil: ReactPackage = ReactNativeBlobUtilPackage()
        assertSame(ReactNativeBlobUtilPackage::class.java, blobUtil.javaClass)
    }
}
