package com.ReactNativeBlobUtil.Response

import com.ReactNativeBlobUtil.ReactNativeBlobUtilConst
import com.ReactNativeBlobUtil.ReactNativeBlobUtilProgressEvent
import com.ReactNativeBlobUtil.ReactNativeBlobUtilReq
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.MediaType
import okhttp3.ResponseBody
import okio.Buffer
import okio.BufferedSource
import okio.Source
import okio.Timeout
import okio.buffer
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.RandomAccessFile

/**
 * Created by wkh237 on 2016/7/11.
 */
class ReactNativeBlobUtilFileResp : ResponseBody {

    private var mTaskId: String? = null
    private var originalBody: ResponseBody
    private var mPath: String? = null
    private var bytesDownloaded: Long = 0
    private var rctContext: ReactApplicationContext? = null
    private var ofStream: FileOutputStream? = null
    private var isEndMarkerReceived = false
    /** Bytes already on disk that a resumed download continues after; progress counts on from them. */
    private var progressOffset: Long = 0
    /** A resumed download whose answer is not the file: the body is read but not written. */
    private var discard = false

    constructor(body: ResponseBody) : super() {
        this.originalBody = body
    }

    /**
     * @param rangeMode for a resumed download, what to do with the body (rangeMode());
     *                  REPLACE for any other request.
     */
    @Throws(IOException::class)
    constructor(
        ctx: ReactApplicationContext?,
        taskId: String?,
        body: ResponseBody,
        path: String?,
        overwrite: Boolean,
        rangeMode: Long = REPLACE,
    ) : super() {
        this.rctContext = ctx
        this.mTaskId = taskId
        this.originalBody = body
        this.mPath = path
        this.isEndMarkerReceived = false
        if (path != null) {
            val cleaned = path.replace("?append=true", "")
            mPath = cleaned
            when {
                // An error status, or a range the server got wrong: the file on disk stays as it is.
                rangeMode == DISCARD -> discard = true
                rangeMode >= 0 -> {
                    // 206 from the offset asked for: the body continues the file there.
                    val f = prepareOutputFile(cleaned)
                    RandomAccessFile(f, "rw").use { it.setLength(rangeMode) }
                    progressOffset = rangeMode
                    ofStream = FileOutputStream(f, true)
                }
                else -> {
                    val f = prepareOutputFile(cleaned)
                    ofStream = FileOutputStream(f, !overwrite)
                }
            }
        }
    }

    override fun contentType(): MediaType? = originalBody.contentType()

    override fun contentLength(): Long {

        /**
         *
         * Okio buffer issue in current version seems to be fixed in the latest versions
         *
         * limiting this was causing the download progress to stop at 2GB size but files still was downloading
         *
         */

        // if (originalBody.contentLength() > Integer.MAX_VALUE) {
        // This is a workaround for a bug Okio buffer where it can't handle larger than int.
        // return Integer.MAX_VALUE;
        // }
        return originalBody.contentLength()
    }

    fun isDownloadComplete(): Boolean =
        (bytesDownloaded == contentLength()) || // Case of non-chunked downloads
            (contentLength() == -1L && isEndMarkerReceived) // Case of chunked downloads

    override fun source(): BufferedSource = ProgressReportingSource().buffer()

    private inner class ProgressReportingSource : Source {

        @Throws(IOException::class)
        override fun read(sink: Buffer, byteCount: Long): Long {
            try {
                val bytes = ByteArray(byteCount.toInt())
                val read = originalBody.byteStream().read(bytes, 0, byteCount.toInt()).toLong()
                bytesDownloaded += if (read > 0) read else 0
                if (read > 0) {
                    // A body without an output file fails here, as the Java version
                    // did, and the catch below turns that into an IOException.
                    if (!discard) ofStream!!.write(bytes, 0, read.toInt())
                    // Forward bytes into the Okio sink too. Without this the buffer
                    // stays empty and buffered consumers (byteStream()/source().read())
                    // hit a false EOF after the first 8 KB segment, so any file larger
                    // than one segment fails with "Download interrupted." (0.24.10 regression).
                    sink.write(bytes, 0, read.toInt())
                } else if (contentLength() == -1L && read == -1L) {
                    // End marker has been received for chunked download
                    isEndMarkerReceived = true
                }
                val reportConfig = ReactNativeBlobUtilReq.getReportProgress(mTaskId)

                if (contentLength() != 0L) {

                    // For non-chunked download, progress is received / total
                    // For chunked download, progress can be either 0 (started) or 1 (ended)
                    val progress = if (contentLength() != -1L) bytesDownloaded.toFloat() / contentLength() else if (isEndMarkerReceived) 1f else 0f

                    if (reportConfig != null && reportConfig.shouldReport(progress /* progress */)) {
                        val (written, total) = progressValues(bytesDownloaded, contentLength(), isEndMarkerReceived)
                        reportProgress(mTaskId, written + progressOffset, if (total < 0) total else total + progressOffset)
                    }

                }

                return read
            } catch (ex: IOException) {
                throw ex
            } catch (ex: Exception) {
                throw IOException(ex)
            }
        }

        private fun reportProgress(taskId: String?, bytesDownloaded: Long, contentLength: Long) {
            val args = ReactNativeBlobUtilProgressEvent.toWritableMap(
                ReactNativeBlobUtilProgressEvent.values(taskId, bytesDownloaded, contentLength)
            )
            rctContext!!.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(ReactNativeBlobUtilConst.EVENT_PROGRESS, args)
        }

        // The Java source returned null here. A Kotlin override cannot, and nothing
        // that reads this body asks for its timeout; NONE is the no-timeout value.
        override fun timeout(): Timeout = Timeout.NONE

        @Throws(IOException::class)
        override fun close() {
            // Without an output file this throws, as the Java version did.
            if (!discard) ofStream!!.close()

        }
    }

    internal companion object {
        /** rangeMode: write the body as the whole file. */
        const val REPLACE = -1L

        /** rangeMode: read the body and write none of it. */
        const val DISCARD = -2L

        /**
         * What a resumed download does with a response, from its status. Not a
         * resumed download (rangeFrom -1): REPLACE. 200: the server sent the whole
         * file (no range support, or If-Range found it changed), so it replaces the
         * partial one: REPLACE. 206 starting at rangeFrom: continue the file there,
         * returning rangeFrom. Anything else - an error status, 416, a 206 from
         * another offset - DISCARD, and fetch.js decides. Pure, so it is unit-tested.
         */
        @JvmStatic
        fun rangeMode(rangeFrom: Long, status: Int, contentRange: String?): Long {
            if (rangeFrom < 0 || status == 200) return REPLACE
            if (status == 206) {
                val start = contentRange?.let { Regex("^\\s*bytes\\s+(\\d+)-").find(it)?.groupValues?.get(1)?.toLongOrNull() }
                return if (start == rangeFrom) rangeFrom else DISCARD
            }
            return DISCARD
        }

        /**
         * The (written, total) a download to a file reports. With a known length,
         * the bytes so far of that length. Without one (a chunked response), the
         * bytes so far with total -1, and (n, n) once the body has ended. It used to
         * report 0 written until the end, so a caller showing the bytes received saw
         * nothing move (#235, #292); a download to memory already reported them.
         */
        @JvmStatic
        fun progressValues(bytesDownloaded: Long, contentLength: Long, ended: Boolean): Pair<Long, Long> = when {
            contentLength != -1L -> bytesDownloaded to contentLength
            ended -> bytesDownloaded to bytesDownloaded
            else -> bytesDownloaded to -1L
        }

        @Throws(IOException::class)
        private fun prepareOutputFile(path: String): File {
            val file = File(path).canonicalFile
            val parent = file.parentFile ?: throw IOException("Invalid output path: $path")

            if (!parent.exists() && !parent.mkdirs() && !parent.exists()) {
                throw IOException("Couldn't create dir: $parent")
            }

            if (file.exists() && file.isDirectory) {
                throw IOException("Output path is a directory: $file")
            }

            if (!file.exists() && !file.createNewFile() && !file.exists()) {
                throw IOException("Couldn't create file: $file")
            }

            return file
        }
    }

}
