package com.ReactNativeBlobUtil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assume
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

/**
 * Which upload sources fail a request before it is sent, and with which code
 * (#502): a file part that could not be read used to go out empty.
 */
class ReactNativeBlobUtilUploadSourceTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `a readable file, also an empty one, is uploaded`() {
        assertNull(ReactNativeBlobUtilBody.fileSourceError(tmp.newFile("data.bin").apply { writeText("x") }))
        assertNull(ReactNativeBlobUtilBody.fileSourceError(tmp.newFile("empty.bin")))
    }

    @Test
    fun `a missing file is ENOENT and a directory EISDIR`() {
        assertEquals("ENOENT", ReactNativeBlobUtilBody.fileSourceError(File(tmp.root, "missing.bin"))!!.first)
        assertEquals("EISDIR", ReactNativeBlobUtilBody.fileSourceError(tmp.newFolder("dir"))!!.first)
    }

    @Test
    fun `a file the app may not read is EACCES`() {
        val file = tmp.newFile("locked.bin").apply { writeText("x") }
        // Windows ignores setReadable(false); the rule is for the Android device.
        Assume.assumeTrue(file.setReadable(false) && !file.canRead())
        try {
            assertEquals("EACCES", ReactNativeBlobUtilBody.fileSourceError(file)!!.first)
        } finally {
            file.setReadable(true)
        }
    }

    @Test
    fun `an exception opening a source maps to its code, also when wrapped`() {
        val code = { e: Throwable -> ReactNativeBlobUtilBody.sourceError(e, "content://x").first }
        assertEquals("EACCES", code(SecurityException("no permission")))
        assertEquals("ENOENT", code(FileNotFoundException("/x: open failed: ENOENT (No such file or directory)")))
        assertEquals("EACCES", code(FileNotFoundException("/x: open failed: EACCES (Permission denied)")))
        assertEquals("EACCES", code(IOException("wrapped", SecurityException("no permission"))))
        assertEquals("EUNSPECIFIED", code(IOException("disk on fire")))
        assertEquals("EISDIR", code(ReactNativeBlobUtilBody.UnreadableSource("EISDIR", "dir")))
    }
}
