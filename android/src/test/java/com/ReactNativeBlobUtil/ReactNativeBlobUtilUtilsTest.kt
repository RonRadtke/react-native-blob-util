package com.ReactNativeBlobUtil

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Written against the Java implementation and kept unchanged through the Kotlin
 * port, so passing before and after is the proof that the port changed nothing
 * here. Branches that reach android.util.Base64 or android.net.Uri are left to the
 * e2e parity scenario: android.jar only ships stubs of those on the JVM.
 */
class ReactNativeBlobUtilUtilsTest {

    @Test
    fun `getMD5 returns the lower-case hex digest`() {
        assertEquals("d41d8cd98f00b204e9800998ecf8427e", ReactNativeBlobUtilUtils.getMD5(""))
        assertEquals("acbd18db4cc2f85cedef654fccc4a4d8", ReactNativeBlobUtilUtils.getMD5("foo"))
    }

    @Test
    fun `getMD5 hashes the UTF-8 bytes of the key`() {
        // "é" is c3 a9 in UTF-8; the digest of those two bytes, computed with Node's crypto.
        assertEquals("66ddcd97cfdeabb2f6fb8a999b4bc76f", ReactNativeBlobUtilUtils.getMD5("é"))
    }

    @Test
    fun `custom CA certs do not apply without cert names`() {
        assertFalse(ReactNativeBlobUtilUtils.customCACertsApplyTo(null, null, "https://example.com/"))
        assertFalse(ReactNativeBlobUtilUtils.customCACertsApplyTo(emptyList(), listOf("example.com"), "https://example.com/"))
    }

    @Test
    fun `custom CA certs apply to every host when no hosts are pinned`() {
        assertTrue(ReactNativeBlobUtilUtils.customCACertsApplyTo(listOf("ca"), null, "https://anything.example/"))
        assertTrue(ReactNativeBlobUtilUtils.customCACertsApplyTo(listOf("ca"), emptyList(), "https://anything.example/"))
    }

    @Test
    fun `custom CA certs apply only to pinned hosts`() {
        val pinned = listOf("10.0.2.2")
        assertTrue(ReactNativeBlobUtilUtils.customCACertsApplyTo(listOf("ca"), pinned, "https://10.0.2.2:19077/health"))
        assertFalse(ReactNativeBlobUtilUtils.customCACertsApplyTo(listOf("ca"), pinned, "https://wrong.example.com/health"))
    }

    @Test
    fun `an unparseable url never gets the custom CA`() {
        assertFalse(ReactNativeBlobUtilUtils.customCACertsApplyTo(listOf("ca"), listOf("example.com"), "not a url"))
    }

    @Test
    fun `stringToBytes encodes utf8 and ascii`() {
        assertArrayEquals(byteArrayOf(0x68, 0xc3.toByte(), 0xa9.toByte()), ReactNativeBlobUtilUtils.stringToBytes("hé", "utf8"))
        assertArrayEquals(byteArrayOf(0x68, 0x69), ReactNativeBlobUtilUtils.stringToBytes("hi", "ASCII"))
        // Characters outside US-ASCII become '?' rather than being dropped.
        assertArrayEquals(byteArrayOf(0x68, 0x3f), ReactNativeBlobUtilUtils.stringToBytes("hé", "ascii"))
    }

    @Test
    fun `stringToBytes falls back to ascii for an unknown encoding`() {
        assertArrayEquals(byteArrayOf(0x68, 0x3f), ReactNativeBlobUtilUtils.stringToBytes("hé", "latin1"))
    }

    @Test
    fun `normalizePath leaves plain paths alone and strips file scheme`() {
        assertNull(ReactNativeBlobUtilUtils.normalizePath(null))
        assertEquals("/data/user/0/app/files/a.txt", ReactNativeBlobUtilUtils.normalizePath("/data/user/0/app/files/a.txt"))
        assertEquals("/sdcard/a.txt", ReactNativeBlobUtilUtils.normalizePath("file:///sdcard/a.txt"))
        assertEquals("bundle-assets://image.png", ReactNativeBlobUtilUtils.normalizePath("bundle-assets://image.png"))
    }

    @Test
    fun `normalizePath removes every file scheme occurrence, not just the first`() {
        assertEquals("/a/b", ReactNativeBlobUtilUtils.normalizePath("file:///a/file://b"))
    }

    @Test
    fun `asset and content uri checks look only at the prefix`() {
        assertTrue(ReactNativeBlobUtilUtils.isAsset("bundle-assets://x"))
        assertFalse(ReactNativeBlobUtilUtils.isAsset("/bundle-assets://x"))
        assertFalse(ReactNativeBlobUtilUtils.isAsset(null))
        assertTrue(ReactNativeBlobUtilUtils.isContentUri("content://media/external/1"))
        assertFalse(ReactNativeBlobUtilUtils.isContentUri("file:///x"))
        assertFalse(ReactNativeBlobUtilUtils.isContentUri(null))
    }

    // A content URI used to be turned into a file path (the provider's _data,
    // a Downloads raw: id, an external-storage id joined onto a directory), and
    // that path was opened with this app's rights: a URI another app shared could
    // name this app's private files. Content URIs now go to ContentResolver.
    @Test
    fun `normalizePath never turns a content URI into a file path`() {
        assertNull(ReactNativeBlobUtilUtils.normalizePath(
            "content://com.android.providers.downloads.documents/document/raw%3A%2Fdata%2Fdata%2Fapp%2Fsecret"))
        assertNull(ReactNativeBlobUtilUtils.normalizePath(
            "content://com.android.externalstorage.documents/document/primary%3A..%2F..%2Fdata"))
        assertNull(ReactNativeBlobUtilUtils.normalizePath("content://media/external/downloads/42"))
    }

    @Test
    fun `normalizePath keeps plain paths, strips file URIs and keeps assets`() {
        assertEquals("/data/x.txt", ReactNativeBlobUtilUtils.normalizePath("/data/x.txt"))
        assertEquals("/data/x.txt", ReactNativeBlobUtilUtils.normalizePath("file:///data/x.txt"))
        assertEquals("bundle-assets://a.png", ReactNativeBlobUtilUtils.normalizePath("bundle-assets://a.png"))
    }
}
