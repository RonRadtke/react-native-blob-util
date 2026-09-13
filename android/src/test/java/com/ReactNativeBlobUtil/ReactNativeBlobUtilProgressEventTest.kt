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
}
