package com.ReactNativeBlobUtil

import android.app.DownloadManager
import com.ReactNativeBlobUtil.ReactNativeBlobUtilBackground.Record
import com.ReactNativeBlobUtil.ReactNativeBlobUtilBackground.Report
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The records of downloads that outlive the app, and what a DownloadManager
 * report does to one.
 */
class ReactNativeBlobUtilBackgroundTest {

    private val running = Record("invoice-42", "https://example.test/a?x=1", "/data/files/a b.pdf", 7, ReactNativeBlobUtilBackground.RUNNING)

    @Test
    fun `a record survives being stored, line breaks in a value included`() {
        val record = running.copy(written = 10, total = 100, errorCode = "ECONNRESET", errorMessage = "two\nlines")
        val back = Record.decode("invoice-42", record.encode())!!
        assertEquals(record.copy(errorMessage = "two lines"), back)
        assertEquals(running, Record.decode("invoice-42", running.encode()))
    }

    @Test
    fun `a stored value that is not a record is ignored`() {
        assertNull(Record.decode("x", null))
        assertNull(Record.decode("x", "just one line"))
    }

    @Test
    fun `a report moves a running download on`() {
        val next = { status: Int?, written: Long, total: Long -> ReactNativeBlobUtilBackground.next(running, Report(status, 0, null, written, total)) }
        assertEquals(running.copy(written = 10, total = 100), next(DownloadManager.STATUS_RUNNING, 10, 100))
        assertEquals(running.copy(written = 0, total = -1), next(DownloadManager.STATUS_PENDING, 0, -1))
        assertEquals(running.copy(state = ReactNativeBlobUtilBackground.PAUSED, written = 10, total = 100), next(DownloadManager.STATUS_PAUSED, 10, 100))
        assertEquals(running.copy(state = ReactNativeBlobUtilBackground.COMPLETED, written = 100, total = 100), next(DownloadManager.STATUS_SUCCESSFUL, 100, 100))
    }

    @Test
    fun `a failed or removed download is failed, with the reason`() {
        val failed = ReactNativeBlobUtilBackground.next(running, Report(DownloadManager.STATUS_FAILED, 404, null, 0, -1))
        assertEquals(ReactNativeBlobUtilBackground.FAILED, failed.state)
        assertEquals("EUNSPECIFIED", failed.errorCode)
        assertEquals("The DownloadManager could not download the file: HTTP 404", failed.errorMessage)
        val removed = ReactNativeBlobUtilBackground.next(running, Report(null, 0, null, 0, -1))
        assertEquals("ECANCELED", removed.errorCode)
    }

    @Test
    fun `a finished record stays as it is`() {
        val done = running.copy(state = ReactNativeBlobUtilBackground.COMPLETED, written = 5, total = 5)
        assertEquals(done, ReactNativeBlobUtilBackground.next(done, Report(DownloadManager.STATUS_FAILED, 1, null, 0, 0)))
    }
}
