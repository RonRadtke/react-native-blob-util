package com.ReactNativeBlobUtil

import okio.Buffer
import okio.BufferedSink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * The request body's stream handling (#490). A body built from a string needs no
 * React context, and the two copy loops take any stream, so the failure paths are
 * reachable here. Uploads from files, content URIs and multipart forms need the
 * context and stay with the e2e upload cases.
 */
class ReactNativeBlobUtilBodyTest {

    @get:Rule
    val tmp = TemporaryFolder()

    /** A source that remembers whether it was closed. */
    private class WatchedSource(bytes: ByteArray) : ByteArrayInputStream(bytes) {
        var closed = false

        override fun close() {
            closed = true
            super.close()
        }
    }

    /** A sink that fails on the first write, like a socket the server has closed. */
    private class BrokenSink : BufferedSink by Buffer() {
        override fun write(source: ByteArray, offset: Int, byteCount: Int): BufferedSink =
            throw IOException("Connection reset")
    }

    /** A file stream that fails on the first write, like a full cache partition. */
    private class BrokenFileStream(file: File) : FileOutputStream(file) {
        override fun write(b: ByteArray, off: Int, len: Int) {
            throw IOException("No space left on device")
        }
    }

    private fun body() = ReactNativeBlobUtilBody("body-test")
        .setRequestType(ReactNativeBlobUtilReq.RequestType.AsIs)
        .setBody("payload")

    @Test
    fun `a body writes its bytes to the sink`() {
        val sink = Buffer()
        body().writeTo(sink)
        assertEquals("payload", sink.readUtf8())
    }

    @Test
    fun `a write failure closes the upload source`() {
        val source = WatchedSource(ByteArray(64))
        assertThrows(IOException::class.java) { body().pipeStreamToSink(source, BrokenSink()) }
        assertTrue(source.closed)
    }

    @Test
    fun `a failed copy into the form cache closes its source`() {
        val source = WatchedSource(ByteArray(64))
        BrokenFileStream(tmp.newFile()).use { cache ->
            assertThrows(IOException::class.java) { body().pipeStreamToFileStream(source, cache) }
        }
        assertTrue(source.closed)
    }

    @Test
    fun `a write failure fails the request instead of sending a short body`() {
        val error = assertThrows(IOException::class.java) { body().writeTo(BrokenSink()) }
        assertEquals("Connection reset", error.message)
    }
}
