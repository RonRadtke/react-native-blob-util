package com.ReactNativeBlobUtil

import com.facebook.react.bridge.JavaOnlyArray
import com.facebook.react.bridge.JavaOnlyMap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

/**
 * Pins how the fetch config is read from JS, including the defaults and the nulls
 * the request code has always relied on. Written against the Java class and kept
 * unchanged through the port.
 */
class ReactNativeBlobUtilConfigTest {

    @Test
    fun `null options leave the fields at their declared defaults`() {
        val config = ReactNativeBlobUtilConfig(null)
        assertNull(config.fileCache)
        assertNull(config.transformFile)
        assertNull(config.path)
        assertNull(config.appendExt)
        assertNull(config.trusty)
        assertEquals(false, config.wifiOnly)
        assertEquals(true, config.overwrite)
        assertEquals(60000L, config.timeout)
        assertEquals(false, config.increment)
        assertEquals(true, config.followRedirect)
        assertNull(config.customCACerts)
        assertEquals(false, config.trustSystemCerts)
    }

    @Test
    fun `empty options fill in the documented defaults`() {
        val config = ReactNativeBlobUtilConfig(JavaOnlyMap())
        assertEquals(false, config.fileCache)
        assertEquals(false, config.transformFile)
        assertNull(config.path)
        assertEquals("", config.appendExt)
        assertEquals(false, config.trusty)
        assertEquals(false, config.wifiOnly)
        assertEquals("", config.targetHostIp)
        assertNull(config.key)
        assertNull(config.mime)
        assertEquals(false, config.auto)
        assertEquals(true, config.overwrite)
        assertEquals(60000L, config.timeout)
        assertEquals(true, config.followRedirect)
        assertNull(config.addAndroidDownloads)
        assertNull(config.binaryContentTypes)
    }

    @Test
    fun `values are read from their keys`() {
        val downloads = JavaOnlyMap.of("useDownloadManager", true)
        val config = ReactNativeBlobUtilConfig(
            JavaOnlyMap.of(
                "fileCache", true,
                "transformFile", true,
                "path", "/tmp/a.bin",
                "appendExt", "png",
                "trusty", true,
                "wifiOnly", true,
                "key", "cache-key",
                "contentType", "image/png",
                "auto", true,
                "increment", true,
                "timeout", 1234,
                "followRedirect", false,
                "addAndroidDownloads", downloads,
            )
        )
        assertEquals(true, config.fileCache)
        assertEquals(true, config.transformFile)
        assertEquals("/tmp/a.bin", config.path)
        assertEquals("png", config.appendExt)
        assertEquals(true, config.trusty)
        assertEquals(true, config.wifiOnly)
        assertEquals("cache-key", config.key)
        assertEquals("image/png", config.mime)
        assertEquals(true, config.auto)
        assertEquals(true, config.increment)
        assertEquals(1234L, config.timeout)
        assertEquals(false, config.followRedirect)
        assertSame(downloads, config.addAndroidDownloads)
    }

    @Test
    fun `append in the path turns overwrite off unless overwrite is given`() {
        assertEquals(false, ReactNativeBlobUtilConfig(JavaOnlyMap.of("path", "/tmp/a.bin?append=true")).overwrite)
        assertEquals(false, ReactNativeBlobUtilConfig(JavaOnlyMap.of("path", "/tmp/a.bin?APPEND=TRUE")).overwrite)
        assertEquals(true, ReactNativeBlobUtilConfig(JavaOnlyMap.of("path", "/tmp/a.bin?append=true", "overwrite", true)).overwrite)
    }

    @Test
    fun `custom CA settings are read as lists`() {
        val config = ReactNativeBlobUtilConfig(
            JavaOnlyMap.of(
                "customCACerts", JavaOnlyArray.of("test_ca", "other_ca"),
                "pinnedHosts", JavaOnlyArray.of("10.0.2.2"),
                "trustSystemCerts", true,
            )
        )
        assertEquals(listOf("test_ca", "other_ca"), config.customCACerts)
        assertEquals(listOf("10.0.2.2"), config.pinnedHosts)
        assertEquals(true, config.trustSystemCerts)
    }

    @Test
    fun `empty custom CA lists stay null`() {
        val config = ReactNativeBlobUtilConfig(
            JavaOnlyMap.of("customCACerts", JavaOnlyArray(), "pinnedHosts", JavaOnlyArray())
        )
        assertNull(config.customCACerts)
        assertNull(config.pinnedHosts)
    }
}
