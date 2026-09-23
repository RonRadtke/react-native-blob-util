package com.ReactNativeBlobUtil

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import android.util.Base64
import com.ReactNativeBlobUtil.Utils.FileDescription
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.Locale

class ReactNativeBlobUtilMediaCollection {

    enum class MediaType {
        Audio,
        Image,
        Video,
        Download,
    }

    companion object {

        private fun getMediaUri(mt: MediaType): Uri? {
            var res: Uri? = null
            if (mt == MediaType.Audio) {
                res = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                } else {
                    MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                }
            } else if (mt == MediaType.Video) {
                res = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                } else {
                    MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                }
            } else if (mt == MediaType.Image) {
                res = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                } else {
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                }
            } else if (mt == MediaType.Download) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    res = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                }
            }

            return res
        }

        private fun getRelativePath(mt: MediaType, ctx: ReactApplicationContext): String {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                if (mt == MediaType.Audio) return Environment.DIRECTORY_MUSIC
                if (mt == MediaType.Video) return Environment.DIRECTORY_MOVIES
                if (mt == MediaType.Image) return Environment.DIRECTORY_PICTURES
                if (mt == MediaType.Download) return Environment.DIRECTORY_DOWNLOADS
                return Environment.DIRECTORY_DOWNLOADS
            } else {
                // Missing keys throw, as get(...).toString() did in Java.
                val legacy = ReactNativeBlobUtilFS.getLegacySystemfolders(ctx)
                if (mt == MediaType.Audio) return legacy["LegacyMusicDir"]!!.toString()
                if (mt == MediaType.Video) return legacy["LegacyMovieDir"]!!.toString()
                if (mt == MediaType.Image) return legacy["LegacyPictureDir"]!!.toString()
                if (mt == MediaType.Download) return legacy["LegacyDownloadDir"]!!.toString()
                return legacy["LegacyDownloadDir"]!!.toString()
            }
        }

        /**
         * Whether a name or folder climbs out of where it is put. Before Android 10
         * the media file is created at a joined path, so "../" reached any
         * directory the app can write to.
         */
        @JvmStatic
        internal fun hasParentSegment(value: String?): Boolean =
            value != null && value.split('/', '\\').any { it == ".." }

        @JvmStatic
        fun createNewMediaFile(file: FileDescription, mt: MediaType, ctx: ReactApplicationContext): Uri? {
            if (hasParentSegment(file.name) || hasParentSegment(file.partentFolder)) return null
            // Add a specific media item.
            val appCtx = ReactNativeBlobUtilImpl.RCTContext.applicationContext
            val resolver = appCtx.contentResolver

            val fileDetails = ContentValues()
            val relativePath = getRelativePath(mt, ctx)
            val mimeType = file.mimeType

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                fileDetails.put(MediaStore.MediaColumns.DATE_ADDED, System.currentTimeMillis() / 1000)
                fileDetails.put(MediaStore.MediaColumns.DATE_MODIFIED, System.currentTimeMillis() / 1000)
                fileDetails.put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
                fileDetails.put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
                fileDetails.put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath + '/' + file.partentFolder)

                val mediauri = getMediaUri(mt)

                try {
                    // Keeps a handle to the new file's URI in case we need to modify it later.
                    // A null media uri throws here and yields null, as it did in Java.
                    return resolver.insert(mediauri!!, fileDetails)
                } catch (e: Exception) {
                    return null
                }
            } else {
                val f = File(relativePath + file.fullPath)
                if (!f.exists()) {
                    val parent = f.parentFile
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        return null
                    }
                    try {
                        // The Java code ignored createNewFile's result and returned the uri either way.
                        f.createNewFile()
                        return Uri.fromFile(f)
                    } catch (ioException: IOException) {
                        return null
                    }

                } else {
                    return Uri.fromFile(f)
                }
            }
        }

        @JvmStatic
        fun writeToMediaFile(fileUri: Uri, data: String?, transformFile: Boolean, promise: Promise, ctx: ReactApplicationContext): Boolean {
            // A content URI target goes through the provider on every version; before
            // Android 10 it used to be turned into a file path.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || ReactNativeBlobUtilContent.isContent(fileUri.toString())) {
                try {
                    val appCtx = ctx.applicationContext
                    val resolver = appCtx.contentResolver

                    // set pending doesn't work right now. We would have to requery for the item
                    //ContentValues contentValues = new ContentValues();
                    //contentValues.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    //resolver.update(fileUri, contentValues, null, null);

                    // write data
                    var stream: OutputStream? = null
                    // Never assigned, as in Java: the delete below always receives null.
                    val uri: Uri? = null

                    try {
                        val descr: ParcelFileDescriptor?
                        try {
                            descr = appCtx.contentResolver.openFileDescriptor(fileUri, "w")
                            val fin: InputStream = if (ReactNativeBlobUtilContent.isContent(data)) {
                                ReactNativeBlobUtilContent.openInput(data!!)
                            } else {
                                val normalizedData = ReactNativeBlobUtilUtils.normalizePath(data)
                                val src = File(normalizedData)
                                if (!src.exists()) {
                                    promise.reject("ENOENT", "No such file ('$normalizedData')")
                                    return false
                                }
                                FileInputStream(src)
                            }
                            val out = FileOutputStream(descr!!.fileDescriptor)

                            if (transformFile) {
                                // in order to transform file, we must load the entire file onto memory
                                // (one read() could return less than the whole file)
                                val bytes = fin.readBytes()
                                val transformer = ReactNativeBlobUtilFileTransformer.sharedFileTransformer
                                    ?: throw IllegalStateException("Write to media file with transform was specified but the shared file transformer is not set")
                                val transformedBytes = transformer.onWriteFile(bytes)
                                out.write(transformedBytes)
                            } else {
                                val buf = ByteArray(10240)
                                var read: Int

                                while (fin.read(buf).also { read = it } > 0) {
                                    out.write(buf, 0, read)
                                }
                            }


                            fin.close()
                            out.close()
                            descr.close()
                        } catch (e: Exception) {
                            e.printStackTrace()
                            promise.reject(IOException("Failed to get output stream."))
                            return false
                        }

                        //contentValues.clear();
                        //contentValues.put(MediaStore.Video.Media.IS_PENDING, 0);
                        //appCtx.getContentResolver().update(fileUri, contentValues, null, null);
                        stream = resolver.openOutputStream(fileUri)
                        if (stream == null) {
                            promise.reject(IOException("Failed to get output stream."))
                            return false
                        }
                    } catch (e: IOException) {
                        // Don't leave an orphan entry in the MediaStore
                        // (uri is always null here, so this throws, exactly as it did in Java)
                        resolver.delete(uri!!, null, null)
                        promise.reject(e)
                        return false
                    } finally {
                        stream?.close()
                    }

                    // remove pending
                    //contentValues = new ContentValues();
                    //contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    //resolver.update(fileUri, contentValues, null, null);

                } catch (e: IOException) {
                    promise.reject("ReactNativeBlobUtil.createMediaFile", "Cannot write to file, file might not exist")
                    return false
                }
                return true
            } else {
                return ReactNativeBlobUtilFS.writeFile(ReactNativeBlobUtilUtils.normalizePath(fileUri.toString()), ReactNativeBlobUtilConst.DATA_ENCODE_URI, data, false)
            }
        }

        @JvmStatic
        fun copyToInternal(contenturi: Uri, destpath: String?, promise: Promise) {
            val appCtx = ReactNativeBlobUtilImpl.RCTContext.applicationContext
            val resolver = appCtx.contentResolver

            var input: InputStream? = null
            var out: OutputStream? = null
            val f = File(destpath)

            if (!f.exists()) {
                try {
                    val parent = f.parentFile
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        promise.reject("ReactNativeBlobUtil.copyToInternal: Cannot create parent folders<'$destpath")
                        return
                    }
                    val result = f.createNewFile()
                    if (!result) {
                        promise.reject("ReactNativeBlobUtil.copyToInternal: Destination file at '$destpath' already exists")
                        return
                    }
                } catch (ioException: IOException) {
                    promise.reject("ReactNativeBlobUtil.copyToInternal: Could not create file: " + ioException.localizedMessage)
                }
            }

            try {
                input = resolver.openInputStream(contenturi)
                out = FileOutputStream(destpath)

                val buf = ByteArray(10240)
                var len: Int
                // A null input stream throws here and is not caught below, as in Java.
                while (input!!.read(buf).also { len = it } > 0) {
                    out.write(buf, 0, len)
                }

            } catch (e: IOException) {
                promise.reject("ReactNativeBlobUtil.copyToInternal:  Could not write data: " + e.localizedMessage)
            } finally {
                if (input != null) {
                    try {
                        input.close()
                    } catch (ioException: IOException) {
                        ioException.printStackTrace()
                    }
                }
                if (out != null) {
                    try {
                        out.close()
                    } catch (ioException: IOException) {
                        ioException.printStackTrace()
                    }
                }
            }

            // Settled even after a reject above, as it was in Java.
            promise.resolve("")
        }

        @JvmStatic
        fun getBlob(contentUri: Uri, encoding: String?, promise: Promise) {
            val appCtx = ReactNativeBlobUtilImpl.RCTContext.applicationContext
            val resolver = appCtx.contentResolver
            try {
                // A null input stream throws here and is not caught below, as in Java.
                val input = resolver.openInputStream(contentUri)!!
                val length = input.available()

                val bytes = ByteArray(length)
                val bytesRead = input.read(bytes)
                input.close()

                if (bytesRead < length) {
                    promise.reject("EUNSPECIFIED", "Read only $bytesRead bytes of $length")
                    return
                }

                // Default-locale lowercasing, as String.toLowerCase() did in Java. A null
                // encoding throws here, after the read and outside the catch, as in Java.
                when (encoding!!.lowercase(Locale.getDefault())) {
                    "base64" -> promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP))
                    "ascii" -> {
                        val asciiResult = Arguments.createArray()
                        for (b in bytes) {
                            // Signed, as in Java: bytes above 127 reach JS as negative numbers.
                            asciiResult.pushInt(b.toInt())
                        }
                        promise.resolve(asciiResult)
                    }
                    else -> // covers utf-8; the platform charset, as new String(bytes) used in Java
                        promise.resolve(String(bytes, Charset.defaultCharset()))
                }
            } catch (ioException: IOException) {
                // Never settles the promise, as in Java.
                ioException.printStackTrace()
            }
        }
    }
}
