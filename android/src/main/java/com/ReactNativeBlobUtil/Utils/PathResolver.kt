package com.ReactNativeBlobUtil.Utils

import android.annotation.TargetApi
import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils
import java.io.File
import java.io.FileOutputStream
import java.util.regex.Pattern

class PathResolver {

    companion object {

        private val COLON = Pattern.compile(":")

        // Java's String.split drops trailing empty strings and Kotlin's does not, so a
        // document id like "primary:" keeps the shape - and the failure - it had in Java.
        private fun splitId(id: String): Array<String> = COLON.split(id)

        @JvmStatic
        @TargetApi(19)
        fun getRealPathFromURI(context: Context, uri: Uri): String? {

            val isKitKat = Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT

            // DocumentProvider
            if (isKitKat && DocumentsContract.isDocumentUri(context, uri)) {
                // ExternalStorageProvider
                if (isExternalStorageDocument(uri)) {
                    val docId = DocumentsContract.getDocumentId(uri)
                    val split = splitId(docId)
                    val type = split[0]

                    if ("primary".equals(type, ignoreCase = true)) {
                        val dir = context.getExternalFilesDir(null)
                        if (dir != null) return "$dir/${split[1]}"
                        return ""
                    }

                    // TODO handle non-primary volumes
                }
                // DownloadsProvider
                else if (isDownloadsDocument(uri)) {
                    try {
                        val id = DocumentsContract.getDocumentId(uri)
                        //Starting with Android O, this "id" is not necessarily a long (row number),
                        //but might also be a "raw:/some/file/path" URL
                        if (id != null && id.startsWith("raw:/")) {
                            val rawuri = Uri.parse(id)
                            return rawuri.path
                        }

                        //Since Android 10, uri can start with msf scheme like "msf:12345"
                        val docId: Long = if (id != null && id.startsWith("msf:")) {
                            splitId(id)[1].toLong()
                        } else {
                            // A null id fails to parse, as Long.valueOf(null) did, and is caught below.
                            id!!.toLong()
                        }

                        val contentUri = ContentUris.withAppendedId(
                            Uri.parse("content://downloads/public_downloads"), docId
                        )
                        return getDataColumn(context, contentUri, null, null)
                    } catch (ex: Exception) {
                        //something went wrong, but android should still be able to handle the original uri by returning null here (see readFile(...))
                        return null
                    }

                }
                // MediaProvider
                else if (isMediaDocument(uri)) {
                    val docId = DocumentsContract.getDocumentId(uri)
                    val split = splitId(docId)
                    val type = split[0]

                    var contentUri: Uri? = null
                    if ("image" == type) {
                        contentUri = MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    } else if ("video" == type) {
                        contentUri = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    } else if ("audio" == type) {
                        contentUri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                    }

                    val selection = "_id=?"
                    val selectionArgs = arrayOf(split[1])

                    return getDataColumn(context, contentUri, selection, selectionArgs)
                } else if ("content".equals(uri.scheme, ignoreCase = true)) {

                    // Return the remote address
                    if (isGooglePhotosUri(uri)) return uri.lastPathSegment

                    return getDataColumn(context, uri, null, null)
                }
                // Other Providers
                else {
                    try {
                        val attachment = context.contentResolver.openInputStream(uri)
                        if (attachment != null) {
                            val filename = getContentName(context.contentResolver, uri)
                            if (filename != null) {
                                val file = File(context.cacheDir, filename)
                                val tmp = FileOutputStream(file)
                                val buffer = ByteArray(1024)
                                while (attachment.read(buffer) > 0) {
                                    tmp.write(buffer)
                                }
                                tmp.close()
                                attachment.close()
                                return file.absolutePath
                            }
                        }
                    } catch (e: Exception) {
                        ReactNativeBlobUtilUtils.emitWarningEvent(e.toString())
                        return null
                    }
                }
            }
            // MediaStore (and general)
            else if ("content".equals(uri.scheme, ignoreCase = true)) {

                // Return the remote address
                if (isGooglePhotosUri(uri)) return uri.lastPathSegment

                return getDataColumn(context, uri, null, null)
            }
            // File
            else if ("file".equals(uri.scheme, ignoreCase = true)) {
                return uri.path
            }

            return null
        }

        private fun getContentName(resolver: ContentResolver, uri: Uri): String? {
            // A null cursor throws, as it did in Java; the caller catches it.
            val cursor = resolver.query(uri, null, null, null, null)!!
            cursor.moveToFirst()
            val nameIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
            if (nameIndex >= 0) {
                val name = cursor.getString(nameIndex)
                cursor.close()
                return name
            }
            return null
        }

        /**
         * Get the value of the data column for this Uri. This is useful for
         * MediaStore Uris, and other file-based ContentProviders.
         *
         * @param context       The context.
         * @param uri           The Uri to query.
         * @param selection     (Optional) Filter used in the query.
         * @param selectionArgs (Optional) Selection arguments used in the query.
         * @return The value of the _data column, which is typically a file path.
         */
        @JvmStatic
        fun getDataColumn(
            context: Context,
            uri: Uri?,
            selection: String?,
            selectionArgs: Array<String>?,
        ): String? {

            var cursor: Cursor? = null
            var result: String? = null
            val column = "_data"
            val projection = arrayOf(column)

            try {
                // A null uri throws inside the try, as it did in Java, and yields null.
                cursor = context.contentResolver.query(uri!!, projection, selection, selectionArgs, null)
                if (cursor != null && cursor.moveToFirst()) {
                    val index = cursor.getColumnIndexOrThrow(column)
                    result = cursor.getString(index)
                }
            } catch (ex: Exception) {
                ex.printStackTrace()
                return null
            } finally {
                cursor?.close()
            }
            return result
        }


        /**
         * @param uri The Uri to check.
         * @return Whether the Uri authority is ExternalStorageProvider.
         */
        @JvmStatic
        fun isExternalStorageDocument(uri: Uri): Boolean =
            "com.android.externalstorage.documents" == uri.authority

        /**
         * @param uri The Uri to check.
         * @return Whether the Uri authority is DownloadsProvider.
         */
        @JvmStatic
        fun isDownloadsDocument(uri: Uri): Boolean =
            "com.android.providers.downloads.documents" == uri.authority

        /**
         * @param uri The Uri to check.
         * @return Whether the Uri authority is MediaProvider.
         */
        @JvmStatic
        fun isMediaDocument(uri: Uri): Boolean =
            "com.android.providers.media.documents" == uri.authority

        /**
         * @param uri The Uri to check.
         * @return Whether the Uri authority is Google Photos.
         */
        @JvmStatic
        fun isGooglePhotosUri(uri: Uri): Boolean =
            "com.google.android.apps.photos.content" == uri.authority
    }
}
