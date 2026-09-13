package com.ReactNativeBlobUtil.Utils

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The branches that do not reach android.webkit.MimeTypeMap, which is only a stub
 * on the JVM. Written against the Java classes and kept unchanged through the port.
 */
class MimeTypeTest {

    @Test
    fun `binary files get the bin extension without consulting MimeTypeMap`() {
        assertEquals("bin", MimeType.getExtensionFromMimeType("application/octet-stream"))
        assertEquals("photo.bin", MimeType.getFullFileName("photo", "application/octet-stream"))
    }

    @Test
    fun `a name that already carries the extension is left alone`() {
        assertEquals("photo.bin", MimeType.getFullFileName("photo.bin", "application/octet-stream"))
    }

    @Test
    fun `no mime type means no extension`() {
        assertEquals("", MimeType.getExtensionFromMimeType(null))
        assertEquals("photo", MimeType.getFullFileName("photo", null))
    }

    @Test
    fun `an unknown mime type takes the extension from the file name`() {
        assertEquals("png", MimeType.getExtensionFromMimeTypeOrFileName(null, "a.b.png"))
        assertEquals("png", MimeType.getExtensionFromMimeTypeOrFileName("*/*", "a.png"))
        assertEquals("", MimeType.getExtensionFromMimeTypeOrFileName(null, "noextension"))
        assertEquals("", MimeType.getExtensionFromMimeTypeOrFileName(null, "trailing."))
        assertNull(MimeType.getExtensionFromMimeTypeOrFileName(null, null))
    }

    @Test
    fun `bin maps back to the binary mime type`() {
        assertEquals("application/octet-stream", MimeType.getMimeTypeFromExtension("bin"))
    }

    @Test
    fun `file descriptions join the parent folder and the full file name`() {
        assertEquals("/photo.bin", FileDescription("photo", "application/octet-stream", null).fullPath)
        assertEquals("parity/photo.bin", FileDescription("photo", "application/octet-stream", "parity").fullPath)
        assertEquals("parity/photo", FileDescription("photo", null, "parity").fullPath)
    }
}
