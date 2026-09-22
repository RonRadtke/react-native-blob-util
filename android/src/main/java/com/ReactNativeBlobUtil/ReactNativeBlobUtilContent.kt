package com.ReactNativeBlobUtil

import android.net.Uri
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream

/**
 * content:// URIs, handled through ContentResolver and nothing else.
 *
 * Before 1.0 a content URI was first turned into a file path (the provider's
 * `_data` column, a Downloads `raw:` id, an external-storage document id joined
 * onto a directory) and that path was then opened with this app's own rights.
 * A URI another app shared could therefore name any file this app can read or
 * delete, its private files included. The provider decides what a URI may
 * reach, so every call now asks the provider: a URI it refuses fails with
 * EACCES, one it does not know with ENOENT.
 */
internal object ReactNativeBlobUtilContent {

    private val resolver get() = ReactNativeBlobUtilImpl.RCTContext.contentResolver

    fun isContent(path: String?): Boolean = ReactNativeBlobUtilUtils.isContentUri(path)

    @Throws(IOException::class)
    fun openInput(uri: String): InputStream =
        resolver.openInputStream(Uri.parse(uri)) ?: throw FileNotFoundException("No content at '$uri'")

    @Throws(IOException::class)
    fun openOutput(uri: String, append: Boolean): OutputStream =
        resolver.openOutputStream(Uri.parse(uri), if (append) "wa" else "wt")
            ?: throw FileNotFoundException("Cannot write to '$uri'")

    /** What the provider reports for the URI, in the shape statFile returns; null when it has no row. */
    fun stat(uri: String): WritableMap? {
        resolver.query(Uri.parse(uri), null, null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return null
            fun long(column: String): Long? {
                val index = cursor.getColumnIndex(column)
                return if (index >= 0 && !cursor.isNull(index)) cursor.getLong(index) else null
            }
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val modified = long(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                ?: long(MediaStore.MediaColumns.DATE_MODIFIED)?.times(1000)
            val stat = Arguments.createMap()
            stat.putString("filename", if (nameIndex >= 0) cursor.getString(nameIndex) else null)
            stat.putString("path", uri)
            stat.putString("type", "file")
            stat.putString("size", (long(OpenableColumns.SIZE) ?: 0L).toString())
            stat.putString("lastModified", (modified ?: 0L).toString())
            return stat
        }
        return null
    }

    fun exists(uri: String): Boolean = try {
        resolver.query(Uri.parse(uri), null, null, null, null)?.use { it.moveToFirst() } ?: false
    } catch (e: Exception) {
        false
    }

    /** Deletes what the URI names, if the provider lets this app; false when there was nothing to delete. */
    fun delete(uri: String): Boolean {
        val parsed = Uri.parse(uri)
        return if (DocumentsContract.isDocumentUri(ReactNativeBlobUtilImpl.RCTContext, parsed)) {
            DocumentsContract.deleteDocument(resolver, parsed)
        } else {
            resolver.delete(parsed, null, null) > 0
        }
    }
}
