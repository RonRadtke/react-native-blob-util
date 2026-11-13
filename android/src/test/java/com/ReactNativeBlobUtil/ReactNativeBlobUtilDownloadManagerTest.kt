package com.ReactNativeBlobUtil

import android.app.DownloadManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.net.URI

/**
 * A download through the DownloadManager (`android.downloadManager`), in the parts
 * ReactNativeBlobUtilReq keeps as plain functions: the destination it asks for, and
 * how it settles from what the DownloadManager reports.
 *
 * Android's Uri cannot run on the JVM; java.net.URI decodes a path the same way
 * (percent escapes as UTF-8), so it stands in for Uri.getPath().
 */
class ReactNativeBlobUtilDownloadManagerTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val downloads = "/storage/emulated/0/Android/data/com.example/files/Download"

    // File names that came back wrong: "%20" became a space, "#" and "?" cut the
    // name short (#330). The rest are characters a URI gives a meaning to.
    private val names = listOf(
        "report.pdf",
        "my report.pdf",
        "my%20report.pdf",
        "100%.pdf",
        "a#b.pdf",
        "a?b=c.pdf",
        "a+b;c=d&e,f@g\$h.pdf",
        "[x]{y}<z>|.pdf",
        "Bericht über Größe 中文.pdf",
    )

    /** COLUMN_LOCAL_URI of a download to [path], as Uri.fromFile encodes it. */
    private fun reportedUri(path: String): String {
        val unreserved = ('A'..'Z') + ('a'..'z') + ('0'..'9') + listOf('_', '-', '!', '.', '~', '\'', '(', ')', '*', '/')
        val encoded = StringBuilder()
        for (byte in path.toByteArray(Charsets.UTF_8)) {
            val c = (byte.toInt() and 0xff).toChar()
            if (byte >= 0 && c in unreserved) encoded.append(c) else encoded.append("%%%02X".format(byte.toInt() and 0xff))
        }
        return "file://$encoded"
    }

    @Test
    fun `the destination names the file exactly`() {
        for (name in names) {
            val path = "$downloads/$name"
            val destination = ReactNativeBlobUtilReq.downloadDestination(path)
            val uri = URI(destination)
            assertEquals(name, "file", uri.scheme)
            assertEquals(name, path, uri.path)
            assertNull(name, uri.rawQuery)
            assertNull(name, uri.rawFragment)
            assertTrue(name, destination.startsWith("file:///storage/"))
            assertTrue("$name is sent as ASCII", destination.all { it.code < 128 })
        }
    }

    @Test
    fun `the file the DownloadManager reports is read back from its URI`() {
        for (name in names) {
            val path = "$downloads/$name"
            assertEquals(name, path, ReactNativeBlobUtilReq.downloadedFile(reportedUri(path)))
        }
    }

    @Test
    fun `a reported file URI that is not encoded is read as it stands`() {
        assertEquals("$downloads/my report.pdf", ReactNativeBlobUtilReq.downloadedFile("file://$downloads/my report.pdf"))
    }

    @Test
    fun `a reported content URI is kept as it is`() {
        assertEquals("content://downloads/my_downloads/42", ReactNativeBlobUtilReq.downloadedFile("content://downloads/my_downloads/42"))
        assertNull(ReactNativeBlobUtilReq.downloadedFile(null))
        assertNull(ReactNativeBlobUtilReq.downloadedFile(""))
    }

    // With a file in the way the DownloadManager writes report-1.pdf, and the request
    // resolved with the old report.pdf (#325, #249).
    @Test
    fun `a finished download resolves with the file the DownloadManager wrote`() {
        val outcome = ReactNativeBlobUtilReq.downloadManagerOutcome(
            DownloadManager.STATUS_SUCCESSFUL, 0, reportedUri("$downloads/report-1.pdf"),
        )
        assertEquals("$downloads/report-1.pdf", outcome.result)
        assertNull(outcome.code)
    }

    // Without a destination the file is in the DownloadManager's own cache. The
    // request resolved with its path there, which the app cannot open (#299).
    @Test
    fun `a download without a destination resolves with the URI the app can read`() {
        val outcome = ReactNativeBlobUtilReq.downloadManagerOutcome(
            DownloadManager.STATUS_SUCCESSFUL, 0, "content://downloads/my_downloads/42",
        )
        assertEquals("content://downloads/my_downloads/42", outcome.result)
        assertNull(outcome.code)
    }

    @Test
    fun `a failed download rejects with the reason the DownloadManager gives`() {
        val http = ReactNativeBlobUtilReq.downloadManagerOutcome(DownloadManager.STATUS_FAILED, 404, null)
        assertNull(http.result)
        assertEquals("EUNSPECIFIED", http.code)
        assertTrue(http.message, http.message!!.endsWith("HTTP 404"))

        val space = ReactNativeBlobUtilReq.downloadManagerOutcome(DownloadManager.STATUS_FAILED, DownloadManager.ERROR_INSUFFICIENT_SPACE, null)
        assertEquals("EUNSPECIFIED", space.code)
        assertTrue(space.message, space.message!!.endsWith("there is not enough space"))

        val other = ReactNativeBlobUtilReq.downloadManagerOutcome(DownloadManager.STATUS_FAILED, 1234, null)
        assertTrue(other.message, other.message!!.endsWith("reason 1234"))
    }

    @Test
    fun `a download that is gone rejects as cancelled`() {
        val outcome = ReactNativeBlobUtilReq.downloadManagerOutcome(null, 0, null)
        assertEquals("ECANCELED", outcome.code)
        assertNull(outcome.result)
    }

    @Test
    fun `a download that has not finished, or reports no file, rejects`() {
        val running = ReactNativeBlobUtilReq.downloadManagerOutcome(DownloadManager.STATUS_RUNNING, 0, reportedUri("$downloads/a.pdf"))
        assertEquals("EUNSPECIFIED", running.code)
        assertNull(running.result)

        val nowhere = ReactNativeBlobUtilReq.downloadManagerOutcome(DownloadManager.STATUS_SUCCESSFUL, 0, null)
        assertEquals("EUNSPECIFIED", nowhere.code)
        assertNull(nowhere.result)
    }

    // The DownloadManager never replaces a file, so a second download to one path
    // went to report-1.pdf (#325, #249).
    @Test
    fun `a file at the destination is deleted, so the download keeps the name`() {
        val target = tmp.newFile("report.pdf")
        target.writeText("the first download")

        assertNull(ReactNativeBlobUtilReq.prepareDownloadTarget(target, overwrite = true))
        assertFalse(target.exists())
    }

    @Test
    fun `with overwrite false the file at the destination stays`() {
        val target = tmp.newFile("report.pdf")
        target.writeText("the first download")

        assertNull(ReactNativeBlobUtilReq.prepareDownloadTarget(target, overwrite = false))
        assertEquals("the first download", target.readText())
    }

    @Test
    fun `a missing directory is created`() {
        val target = File(tmp.root, "a/b/report.pdf")

        assertNull(ReactNativeBlobUtilReq.prepareDownloadTarget(target, overwrite = true))
        assertTrue(target.parentFile!!.isDirectory)
        assertFalse(target.exists())
    }

    @Test
    fun `a directory at the destination is left alone`() {
        val target = tmp.newFolder("report.pdf")
        File(target, "inside.txt").writeText("x")

        assertNull(ReactNativeBlobUtilReq.prepareDownloadTarget(target, overwrite = true))
        assertTrue(File(target, "inside.txt").exists())
    }

    @Test
    fun `a file where the directory belongs is an error`() {
        val notADir = tmp.newFile("Download")
        val error = ReactNativeBlobUtilReq.prepareDownloadTarget(File(notADir, "report.pdf"), overwrite = true)

        assertNotNull(error)
        assertTrue(notADir.isFile)
    }

    // The name was appended without a separator: files/Download3f2a... next to the
    // download directory instead of inside it.
    @Test
    fun `storeLocal puts the file inside the download directory`() {
        assertEquals("$downloads/3f2a", ReactNativeBlobUtilReq.storeLocalPath(downloads, "3f2a"))
        assertEquals("$downloads/3f2a", ReactNativeBlobUtilReq.storeLocalPath("$downloads/", "3f2a"))
    }
}
