package com.ReactNativeBlobUtil

import com.facebook.react.bridge.JavaOnlyArray
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The rule that decides whether a response is binary: respType reports "blob" for it
 * and `auto` writes it to a file. It is the rule iOS applies. The old check compared
 * the whole Content-Type with "text/" and "application/json" using equals, so only a
 * type listed in binaryContentTypes ever counted as binary, and `auto` without that
 * list did nothing on Android.
 */
class ReactNativeBlobUtilResponseTypeTest {

    private fun binary(contentType: String, vararg listed: String): Boolean =
        ReactNativeBlobUtilReq.isBinaryContentType(contentType, if (listed.isEmpty()) null else JavaOnlyArray.of(*listed))

    @Test
    fun `text, JSON and a missing Content-Type are not binary`() {
        assertFalse(binary("text/plain; charset=utf-8"))
        assertFalse(binary("Text/HTML"))
        assertFalse(binary("application/json"))
        assertFalse(binary("application/json; charset=utf-8"))
        assertFalse(binary(""))
    }

    @Test
    fun `any other Content-Type is binary`() {
        assertTrue(binary("application/octet-stream"))
        assertTrue(binary("image/png"))
        assertTrue(binary("application/pdf; name=report.pdf"))
    }

    @Test
    fun `a listed type is binary whatever it is, matched case-insensitively`() {
        assertTrue(binary("text/csv", "text/csv"))
        assertTrue(binary("Application/X-Custom; v=1", "application/x-custom"))
        assertFalse(binary("text/plain", "text/csv"))
    }
}
