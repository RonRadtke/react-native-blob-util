package com.ReactNativeBlobUtil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * What a `key` keeps. The response was written to the key's file as it came in,
 * so a download cut short, or an error page, was the cached file from then on:
 * every later request with the key resolved with it and asked no server.
 */
class ReactNativeBlobUtilKeyCacheTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private fun written(text: String = "the response") = tmp.newFile("ReactNativeBlobUtilTmp_task").apply { writeText(text) }

    private val keyFile get() = File(tmp.root, "ReactNativeBlobUtilTmp_key")

    @Test
    fun `a whole response with a success status becomes the key's file`() {
        val written = written()
        val kept = ReactNativeBlobUtilReq.keptForKey(written, keyFile.path, 200, true)
        assertEquals(keyFile, kept)
        assertEquals("the response", keyFile.readText())
        assertFalse(written.exists())
    }

    @Test
    fun `it replaces a file that is in the key's place`() {
        keyFile.writeText("older")
        val kept = ReactNativeBlobUtilReq.keptForKey(written("newer"), keyFile.path, 206, true)
        assertEquals("newer", kept.readText())
    }

    @Test
    fun `an error status keeps its body in the request's own file`() {
        for (status in listOf(301, 404, 500)) {
            val written = File(tmp.root, "task-$status").apply { writeText("error page") }
            assertEquals(written, ReactNativeBlobUtilReq.keptForKey(written, keyFile.path, status, true))
            assertTrue(written.exists())
            assertFalse(keyFile.exists())
        }
    }

    @Test
    fun `a response cut short is not kept`() {
        val written = written("half")
        assertEquals(written, ReactNativeBlobUtilReq.keptForKey(written, keyFile.path, 200, false))
        assertFalse(keyFile.exists())
    }

    @Test
    fun `without a key the file stays where it was written`() {
        val written = written()
        assertEquals(written, ReactNativeBlobUtilReq.keptForKey(written, null, 200, true))
        assertTrue(written.exists())
    }
}
