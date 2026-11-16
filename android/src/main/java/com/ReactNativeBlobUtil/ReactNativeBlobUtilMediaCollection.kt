package com.ReactNativeBlobUtil

import android.content.ContentValues
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
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
import java.io.FileNotFoundException
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

    /**
     * How copyToInternal scales an image: to fit within width x height (0: no
     * limit on that side), written as JPEG at `compression` (0..1; below 0 means
     * the default, 0.9). Inactive when nothing was asked for.
     */
    class ScaleOptions private constructor(val width: Int, val height: Int, val compression: Double) {
        val active: Boolean
            get() = width > 0 || height > 0 || compression >= 0

        val quality: Int
            get() = Math.round((if (compression >= 0) compression else 0.9) * 100).toInt().coerceIn(0, 100)

        companion object {
            @JvmStatic
            fun of(width: Int, height: Int, compression: Double) = ScaleOptions(width, height, compression)
        }
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
                            promise.reject("EUNSPECIFIED", "Failed to get output stream.")
                            return false
                        }

                        //contentValues.clear();
                        //contentValues.put(MediaStore.Video.Media.IS_PENDING, 0);
                        //appCtx.getContentResolver().update(fileUri, contentValues, null, null);
                        stream = resolver.openOutputStream(fileUri)
                        if (stream == null) {
                            promise.reject("EUNSPECIFIED", "Failed to get output stream.")
                            return false
                        }
                    } catch (e: IOException) {
                        // Don't leave an orphan entry in the MediaStore
                        // (uri is always null here, so this throws, exactly as it did in Java)
                        resolver.delete(uri!!, null, null)
                        promise.reject("EUNSPECIFIED", e.localizedMessage)
                        return false
                    } finally {
                        stream?.close()
                    }

                    // remove pending
                    //contentValues = new ContentValues();
                    //contentValues.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    //resolver.update(fileUri, contentValues, null, null);

                } catch (e: IOException) {
                    promise.reject("EUNSPECIFIED", "Cannot write to file, file might not exist")
                    return false
                }
                return true
            } else {
                return ReactNativeBlobUtilFS.writeFile(ReactNativeBlobUtilUtils.normalizePath(fileUri.toString()), ReactNativeBlobUtilConst.DATA_ENCODE_URI, data, false)
            }
        }

        /**
         * The size a srcWidth x srcHeight image takes to fit within maxWidth x
         * maxHeight (0: no limit on that side), keeping its aspect ratio. Never
         * larger than the source. Pure, so it is unit-testable.
         */
        @JvmStatic
        fun fitWithin(srcWidth: Int, srcHeight: Int, maxWidth: Int, maxHeight: Int): Pair<Int, Int> {
            if (srcWidth <= 0 || srcHeight <= 0) return srcWidth to srcHeight
            var scale = 1.0
            if (maxWidth > 0) scale = minOf(scale, maxWidth.toDouble() / srcWidth)
            if (maxHeight > 0) scale = minOf(scale, maxHeight.toDouble() / srcHeight)
            return maxOf(1, Math.round(srcWidth * scale).toInt()) to maxOf(1, Math.round(srcHeight * scale).toInt())
        }

        /**
         * The largest power of two to decode a srcWidth x srcHeight image with, so
         * that it still is at least targetWidth x targetHeight. Pure.
         */
        @JvmStatic
        fun sampleSize(srcWidth: Int, srcHeight: Int, targetWidth: Int, targetHeight: Int): Int {
            var sample = 1
            while (srcWidth / (sample * 2) >= targetWidth && srcHeight / (sample * 2) >= targetHeight) {
                sample *= 2
            }
            return sample
        }

        /** The rotation in degrees an image's EXIF orientation asks for. */
        private fun rotationOf(open: () -> InputStream?): Int = try {
            open()?.use {
                when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                    ExifInterface.ORIENTATION_ROTATE_90 -> 90
                    ExifInterface.ORIENTATION_ROTATE_180 -> 180
                    ExifInterface.ORIENTATION_ROTATE_270 -> 270
                    else -> 0
                }
            } ?: 0
        } catch (e: Exception) {
            0
        }

        /**
         * Writes the image behind `open` scaled as `scale` says, as JPEG. False when
         * it is not an image Android can decode; the caller then copies the bytes.
         */
        @Throws(IOException::class)
        private fun writeScaledImage(open: () -> InputStream?, dest: File, scale: ScaleOptions): Boolean {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            open()?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return false
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return false
            val rotation = rotationOf(open)
            val turned = rotation == 90 || rotation == 270
            val shownWidth = if (turned) bounds.outHeight else bounds.outWidth
            val shownHeight = if (turned) bounds.outWidth else bounds.outHeight
            val (targetWidth, targetHeight) = fitWithin(shownWidth, shownHeight, scale.width, scale.height)
            val decode = BitmapFactory.Options().apply {
                inSampleSize = if (turned) sampleSize(bounds.outWidth, bounds.outHeight, targetHeight, targetWidth)
                else sampleSize(bounds.outWidth, bounds.outHeight, targetWidth, targetHeight)
            }
            val decoded = open()?.use { BitmapFactory.decodeStream(it, null, decode) } ?: return false
            val matrix = Matrix()
            if (rotation != 0) matrix.postRotate(rotation.toFloat())
            val upright = if (rotation != 0) Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true) else decoded
            val scaled = if (upright.width != targetWidth || upright.height != targetHeight) {
                Bitmap.createScaledBitmap(upright, targetWidth, targetHeight, true)
            } else {
                upright
            }
            try {
                FileOutputStream(dest).use { out ->
                    if (!scaled.compress(Bitmap.CompressFormat.JPEG, scale.quality, out)) {
                        throw IOException("Could not encode the image as JPEG")
                    }
                }
            } finally {
                if (scaled !== decoded) scaled.recycle()
                if (upright !== decoded && upright !== scaled) upright.recycle()
                decoded.recycle()
            }
            return true
        }

        @JvmStatic
        fun copyToInternal(contenturi: Uri, destpath: String?, promise: Promise) {
            copyToInternal(contenturi, destpath, ScaleOptions.of(0, 0, -1.0), promise)
        }

        /**
         * Copies an entry into the app's storage. With `scale` active an image is
         * scaled down and written as JPEG; anything Android cannot decode as an
         * image, a video say, is copied as it is.
         */
        @JvmStatic
        fun copyToInternal(contenturi: Uri, destpath: String?, scale: ScaleOptions, promise: Promise) {
            if (destpath == null) {
                promise.reject("EINVAL", "Missing argument \"destpath\"")
                return
            }
            val resolver = ReactNativeBlobUtilImpl.RCTContext.applicationContext.contentResolver
            val f = File(destpath)
            // Settles exactly once; Java rejected and then resolved "" anyway. An existing
            // destination is overwritten, as fs.cp does.
            try {
                val parent = f.parentFile
                if (parent != null && !parent.isDirectory && !parent.mkdirs()) {
                    promise.reject("ENOENT", "Cannot create the directory of '$destpath'")
                    return
                }
                if (scale.active && writeScaledImage({ resolver.openInputStream(contenturi) }, f, scale)) {
                    promise.resolve("")
                    return
                }
                val input = resolver.openInputStream(contenturi)
                if (input == null) {
                    promise.reject("ENOENT", "No content at '$contenturi'")
                    return
                }
                input.use { source -> FileOutputStream(f).use { out -> source.copyTo(out, 10240) } }
            } catch (e: SecurityException) {
                promise.reject("EACCES", "Not allowed to read '$contenturi'")
                return
            } catch (e: FileNotFoundException) {
                promise.reject("ENOENT", e.localizedMessage)
                return
            } catch (e: IOException) {
                promise.reject("EUNSPECIFIED", "Could not write data: " + e.localizedMessage)
                return
            }
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
