package com.ReactNativeBlobUtil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pins the throttling rules for progress events. JS relies on two of them: at most
 * one event per interval, and the final event of a transfer is never throttled
 * away (the network e2e scenario asserts download100 and upload100).
 */
class ReactNativeBlobUtilProgressConfigTest {

    private fun config(enable: Boolean = true, interval: Int = -1, count: Int = -1) =
        ReactNativeBlobUtilProgressConfig(enable, interval, count, ReactNativeBlobUtilProgressConfig.ReportType.Download)

    @Test
    fun `a disabled config never reports, not even completion`() {
        val progress = config(enable = false)
        assertFalse(progress.shouldReport(0.5f))
        assertFalse(progress.shouldReport(1f))
    }

    @Test
    fun `without interval or count every update is reported`() {
        val progress = config()
        assertTrue(progress.shouldReport(0.1f))
        assertTrue(progress.shouldReport(0.2f))
        assertTrue(progress.shouldReport(0.3f))
    }

    @Test
    fun `an interval suppresses updates inside the window`() {
        val progress = config(interval = 60_000)
        assertTrue("the first update has no previous tick to wait for", progress.shouldReport(0.1f))
        assertFalse(progress.shouldReport(0.2f))
        assertFalse(progress.shouldReport(0.9f))
    }

    @Test
    fun `completion is reported even inside the interval window`() {
        val progress = config(interval = 60_000)
        assertTrue(progress.shouldReport(0.1f))
        assertTrue(progress.shouldReport(1f))
    }

    @Test
    fun `a count limits reports to that many steps of the transfer`() {
        val progress = config(count = 10)
        val reported = (1..100).map { it / 100f }.filter { progress.shouldReport(it) }
        assertEquals(listOf(0.1f, 0.2f, 0.3f, 0.4f, 0.5f, 0.6f, 0.7f, 0.8f, 0.9f, 1f), reported)
    }

    @Test
    fun `a count does not hold back an update at zero progress`() {
        val progress = config(count = 10)
        assertTrue(progress.shouldReport(0f))
    }
}
