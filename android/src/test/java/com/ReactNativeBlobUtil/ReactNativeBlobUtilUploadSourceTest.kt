package com.ReactNativeBlobUtil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
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

    // JS says what a body is. A {base64} body that starts with the file prefix was
    // read as the file it named, so bytes an app passed on could pick one of the
    // app's own files for the upload.
    @Test
    fun `a base64 or text body is never a file, whatever it starts with`() {
        val file = "ReactNativeBlobUtil-file:///data/user/0/app/files/secret.db"
        val content = "ReactNativeBlobUtil-content://media/external/images/1"
        for (body in listOf(file, content)) {
            assertFalse(ReactNativeBlobUtilBody.namesASource("base64", body))
            assertFalse(ReactNativeBlobUtilBody.namesASource("text", body))
            assertTrue(ReactNativeBlobUtilBody.namesASource("file", body))
            // No type: an older caller, told by the prefix as before.
            assertTrue(ReactNativeBlobUtilBody.namesASource(null, body))
        }
        assertFalse(ReactNativeBlobUtilBody.namesASource(null, "aGVsbG8="))
        assertFalse(ReactNativeBlobUtilBody.namesASource("base64", "aGVsbG8="))
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
