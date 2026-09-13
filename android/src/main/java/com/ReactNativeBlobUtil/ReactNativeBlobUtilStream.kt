package com.ReactNativeBlobUtil

import android.net.Uri
import android.os.SystemClock
import android.util.Base64
import com.ReactNativeBlobUtil.ReactNativeBlobUtilConst.EVENT_FILESYSTEM
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.BufferedReader
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.io.OutputStream
import java.nio.charset.Charset
import java.util.UUID

class ReactNativeBlobUtilStream internal constructor(ctx: ReactApplicationContext) {
    private val emitter: DeviceEventManagerModule.RCTDeviceEventEmitter =
        ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    private var encoding: String? = "base64"
    private var writeStreamInstance: OutputStream? = null

    /**
     * Create a file stream for read
     *  @param path       File stream target path
     * @param encoding   File stream decoder, should be one of `base64`, `utf8`, `ascii`
     * @param bufferSize Buffer size of read stream, default to 4096 (4095 when encode is `base64`)
     * @param RCTContext
     */
    fun readStream(rawPath: String?, encoding: String?, bufferSize: Int, tick: Int, streamId: String?, @Suppress("UNUSED_PARAMETER") RCTContext: ReactApplicationContext?) {
        val resolved = ReactNativeBlobUtilUtils.normalizePath(rawPath)
        val path = resolved ?: rawPath

        try {
            // A null encoding throws here, inside the try, as it did in Java.
            var chunkSize = if (encoding!!.equals("base64", ignoreCase = true)) 4095 else 4096
            if (bufferSize > 0) chunkSize = bufferSize

            val fs: InputStream?

            if (resolved != null && resolved.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
                fs = ReactNativeBlobUtilImpl.RCTContext.assets.open(resolved.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, ""))
            }
            // fix issue 287
            else if (resolved == null) {
                // A null path throws here, inside the try, as Uri.parse(null) did in Java.
                fs = ReactNativeBlobUtilImpl.RCTContext.contentResolver.openInputStream(Uri.parse(path!!))
            } else {
                fs = FileInputStream(File(resolved))
            }

            var cursor: Int
            var error = false

            if (encoding.equals("utf8", ignoreCase = true)) {
                val isr = InputStreamReader(fs, Charset.forName("UTF-8"))
                val reader = BufferedReader(isr, chunkSize)
                val buffer = CharArray(chunkSize)
                var numBytesRead: Int
                // read chunks of the string
                while (reader.read(buffer, 0, chunkSize).also { numBytesRead = it } != -1) {
                    val chunk = String(buffer, 0, numBytesRead)
                    emitStreamEvent(streamId, "data", chunk)
                    if (tick > 0) SystemClock.sleep(tick.toLong())
                }

                reader.close()
                isr.close()
            } else if (encoding.equals("ascii", ignoreCase = true)) {
                val buffer = ByteArray(chunkSize)
                while (fs!!.read(buffer).also { cursor = it } != -1) {
                    val chunk = Arguments.createArray()
                    for (i in 0 until cursor) {
                        // Signed, as in Java: bytes above 127 reach JS as negative numbers.
                        chunk.pushInt(buffer[i].toInt())
                    }
                    emitStreamEvent(streamId, "data", chunk)
                    if (tick > 0) SystemClock.sleep(tick.toLong())
                }
            } else if (encoding.equals("base64", ignoreCase = true)) {
                val buffer = ByteArray(chunkSize)
                while (fs!!.read(buffer).also { cursor = it } != -1) {
                    if (cursor < chunkSize) {
                        val copy = ByteArray(cursor)
                        System.arraycopy(buffer, 0, copy, 0, cursor)
                        emitStreamEvent(streamId, "data", Base64.encodeToString(copy, Base64.NO_WRAP))
                    } else {
                        emitStreamEvent(streamId, "data", Base64.encodeToString(buffer, Base64.NO_WRAP))
                    }
                    if (tick > 0) SystemClock.sleep(tick.toLong())
                }
            } else {
                emitStreamEvent(
                    streamId,
                    "error",
                    "EINVAL",
                    "Unrecognized encoding `$encoding`, should be one of `base64`, `utf8`, `ascii`"
                )
                error = true
            }

            if (!error) emitStreamEvent(streamId, "end", "")
            fs!!.close()

        } catch (err: FileNotFoundException) {
            emitStreamEvent(
                streamId,
                "error",
                "ENOENT",
                "No such file '$path'"
            )
        } catch (err: Exception) {
            emitStreamEvent(
                streamId,
                "error",
                "EUNSPECIFIED",
                "Failed to convert data to $encoding encoded string. This might be because this encoding cannot be used for this data."
            )
            err.printStackTrace()
        }
    }

    /**
     * Create a write stream and store its instance in ReactNativeBlobUtilFS.fileStreams
     *
     * @param path     Target file path
     * @param encoding Should be one of `base64`, `utf8`, `ascii`
     * @param append   Flag represents if the file stream overwrite existing content
     * @param callback Callback
     */
    fun writeStream(rawPath: String?, encoding: String?, append: Boolean, callback: Callback) {
        val resolved = ReactNativeBlobUtilUtils.normalizePath(rawPath)
        val path = resolved ?: rawPath

        try {
            val fs: OutputStream?
            if (resolved != null && resolved.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
                fs = ReactNativeBlobUtilImpl.RCTContext.assets.openFd(resolved.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "")).createOutputStream()
            }
            // fix issue 287
            else if (resolved == null) {
                // A null path throws here, inside the try, as Uri.parse(null) did in Java.
                fs = ReactNativeBlobUtilImpl.RCTContext.contentResolver.openOutputStream(Uri.parse(path!!))
            } else {
                val dest = prepareOutputFile(resolved)
                fs = FileOutputStream(dest, append)
            }
            this.encoding = encoding
            val streamId = UUID.randomUUID().toString()
            fileStreams[streamId] = this
            this.writeStreamInstance = fs
            callback.invoke(null, null, streamId)
        } catch (err: Exception) {
            callback.invoke("EUNSPECIFIED", "Failed to create write stream at path `" + path + "`; " + err.localizedMessage)
        }
    }

    /**
     * Private method for emit read stream event.
     *
     * @param streamName ID of the read stream
     * @param event      Event name, `data`, `end`, `error`, etc.
     * @param data       Event data
     */
    private fun emitStreamEvent(streamName: String?, event: String, data: String?) {
        val eventData = Arguments.createMap()
        eventData.putString("event", event)
        eventData.putString("detail", data)
        eventData.putString("streamId", streamName)
        this.emitter.emit(EVENT_FILESYSTEM, eventData)
    }

    // "event" always is "data"...
    private fun emitStreamEvent(streamName: String?, event: String, data: WritableArray) {
        val eventData = Arguments.createMap()
        eventData.putString("event", event)
        eventData.putArray("detail", data)
        eventData.putString("streamId", streamName)
        this.emitter.emit(EVENT_FILESYSTEM, eventData)
    }

    // "event" always is "error"...
    private fun emitStreamEvent(streamName: String?, event: String, code: String, message: String) {
        val eventData = Arguments.createMap()
        eventData.putString("event", event)
        eventData.putString("code", code)
        eventData.putString("detail", message)
        eventData.putString("streamId", streamName)
        this.emitter.emit(EVENT_FILESYSTEM, eventData)
    }

    companion object {
        // Nullable keys, like the Java HashMap: a null stream id looks up nothing.
        private val fileStreams = HashMap<String?, ReactNativeBlobUtilStream>()

        @Throws(IOException::class)
        private fun prepareOutputFile(path: String): File {
            val file = File(path).canonicalFile
            val parent = file.parentFile ?: throw IOException("Invalid output path: $path")

            if (!parent.exists() && !parent.mkdirs() && !parent.exists()) {
                throw IOException("Failed to create parent directory of '$path'")
            }

            if (file.exists() && file.isDirectory) {
                throw IOException("Expecting a file but '$path' is a directory")
            }

            if (!file.exists() && !file.createNewFile() && !file.exists()) {
                throw IOException("File '$path' does not exist and could not be created")
            }

            return file
        }

        /**
         * Write a chunk of data into a file stream.
         *
         * @param streamId File stream ID
         * @param data     Data chunk in string format
         * @param callback JS context callback
         */
        @JvmStatic
        fun writeChunk(streamId: String?, data: String, callback: Callback) {
            // A stream that was closed or never opened throws here, outside the try,
            // exactly as the Java version did - and takes the app down with it. That
            // crash is known and deliberately not fixed as part of the port.
            val fs = fileStreams[streamId]!!
            val stream = fs.writeStreamInstance
            val chunk = ReactNativeBlobUtilUtils.stringToBytes(data, fs.encoding!!)
            try {
                stream!!.write(chunk)
                callback.invoke()
            } catch (e: Exception) {
                callback.invoke(e.localizedMessage)
            }
        }

        /**
         * Write data using ascii array
         *
         * @param streamId File stream ID
         * @param data     Data chunk in ascii array format
         * @param callback JS context callback
         */
        @JvmStatic
        fun writeArrayChunk(streamId: String?, data: ReadableArray, callback: Callback) {
            try {
                val fs = fileStreams[streamId]!!
                val stream = fs.writeStreamInstance
                val chunk = ByteArray(data.size())
                for (i in 0 until data.size()) {
                    chunk[i] = data.getInt(i).toByte()
                }
                stream!!.write(chunk)
                callback.invoke()
            } catch (e: Exception) {
                callback.invoke(e.localizedMessage)
            }
        }

        /**
         * Close file write stream by ID
         *
         * @param streamId Stream ID
         * @param callback JS context callback
         */
        @JvmStatic
        fun closeStream(streamId: String?, callback: Callback) {
            try {
                val fs = fileStreams[streamId]!!
                val stream = fs.writeStreamInstance
                fileStreams.remove(streamId)
                stream!!.close()
                callback.invoke()
            } catch (err: Exception) {
                callback.invoke(err.localizedMessage)
            }
        }
    }
}
