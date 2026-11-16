package com.ReactNativeBlobUtil

import com.ReactNativeBlobUtil.Response.ReactNativeBlobUtilFileResp
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * What a resumed download (pause/resume, resumable) does with the server's
 * answer: continue the file, replace it, or leave it alone.
 */
class ReactNativeBlobUtilRangeTest {

    private val mode = ReactNativeBlobUtilFileResp.Companion::rangeMode
    private val replace = ReactNativeBlobUtilFileResp.REPLACE
    private val discard = ReactNativeBlobUtilFileResp.DISCARD

    @Test
    fun `a request that is not a resumed download writes the whole file, whatever the status`() {
        for (status in listOf(200, 206, 404, 500)) {
            assertEquals(replace, mode(-1, status, null))
        }
    }

    @Test
    fun `206 from the offset asked for continues the file there`() {
        assertEquals(400L, mode(400, 206, "bytes 400-999/1000"))
        assertEquals(400L, mode(400, 206, "bytes 400-999/*"))
        assertEquals(0L, mode(0, 206, "bytes 0-9/10"))
    }

    @Test
    fun `200 means the server sent the whole file again, which replaces the partial one`() {
        assertEquals(replace, mode(400, 200, null))
    }

    @Test
    fun `a 206 from another offset, a 416 and an error status leave the file alone`() {
        assertEquals(discard, mode(400, 206, "bytes 0-999/1000"))
        assertEquals(discard, mode(400, 206, null))
        assertEquals(discard, mode(400, 206, "garbage"))
        assertEquals(discard, mode(1000, 416, "bytes */1000"))
        assertEquals(discard, mode(400, 404, null))
        assertEquals(discard, mode(400, 503, null))
    }
}
