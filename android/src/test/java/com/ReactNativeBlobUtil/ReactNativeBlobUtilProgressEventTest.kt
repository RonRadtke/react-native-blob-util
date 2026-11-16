package com.ReactNativeBlobUtil

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The progress payload every Android emitter builds - the download response
 * bodies and the upload request body - checked against the shared fixture the JS
 * normaliser is tested with.
 */
class ReactNativeBlobUtilProgressEventTest {

    @Test
    fun `byte counts go out as numbers, in the shape the fixture describes for Android`() {
        val cases = NativePayloadFixtures.cases("progress-event")
        assertTrue("no current Android progress cases in the fixture", cases.isNotEmpty())
        for (case in cases) {
            val written = (case.get("written") as Number).toLong()
            val total = (case.get("total") as Number).toLong()

            val values = ReactNativeBlobUtilProgressEvent.values("task-1", written, total)

            assertEquals(listOf("taskId", "written", "total"), values.keys.toList())
            assertEquals("task-1", values["taskId"])
            assertTrue("written must be a double: ${values["written"]}", values["written"] is Double)
            assertTrue("total must be a double: ${values["total"]}", values["total"] is Double)
            assertEquals(written.toDouble(), values["written"])
            assertEquals(total.toDouble(), values["total"])
        }
    }

    @Test
    fun `an unknown length stays -1`() {
        assertEquals(-1.0, ReactNativeBlobUtilProgressEvent.values("t", 900, -1)["total"])
    }

    @Test
    fun `byte counts past 32 bits survive as exact doubles`() {
        val fiveGigabytes = 5L * 1024 * 1024 * 1024
        assertEquals(fiveGigabytes.toDouble(), ReactNativeBlobUtilProgressEvent.values("t", fiveGigabytes, fiveGigabytes)["written"])
    }

    @Test
    fun `a download without a length reports the bytes so far, then (n, n) at the end (#235, #292)`() {
        val values = com.ReactNativeBlobUtil.Response.ReactNativeBlobUtilFileResp.Companion::progressValues
        assertEquals(900L to -1L, values(900, -1, false))
        assertEquals(1200L to 1200L, values(1200, -1, true))
        assertEquals(900L to 1000L, values(900, 1000, false))
        assertEquals(1000L to 1000L, values(1000, 1000, true))
    }
}
