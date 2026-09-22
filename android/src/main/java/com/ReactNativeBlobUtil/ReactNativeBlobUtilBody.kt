package com.ReactNativeBlobUtil

import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream

internal class ReactNativeBlobUtilBody(private val mTaskId: String?) : RequestBody() {

    private var contentLength: Long = 0
    private var form: ReadableArray? = null
    private var rawBody: String? = null
    private var requestType: ReactNativeBlobUtilReq.RequestType? = null
    private var mime: MediaType? = null
    private var bodyCache: File? = null
    private var chunkedEncoding = false

    fun chunkedEncoding(value: Boolean): ReactNativeBlobUtilBody {
        this.chunkedEncoding = value
        return this
    }

    fun setMIME(mime: MediaType?): ReactNativeBlobUtilBody {
        this.mime = mime
        return this
    }

    fun setRequestType(type: ReactNativeBlobUtilReq.RequestType?): ReactNativeBlobUtilBody {
        this.requestType = type
        return this
    }

    /**
     * Set request body
     *
     * @param body A string represents the request body
     * @return object itself
     */
    fun setBody(body: String?): ReactNativeBlobUtilBody {
        this.rawBody = body
        if (rawBody == null) {
            this.rawBody = ""
            requestType = ReactNativeBlobUtilReq.RequestType.AsIs
        }
        try {
            // A missing request type throws here, as the switch did in Java, and is
            // reported below.
            when (requestType!!) {
                ReactNativeBlobUtilReq.RequestType.SingleFile -> contentLength = sourceLength(getRequestStream()!!)
                ReactNativeBlobUtilReq.RequestType.AsIs -> contentLength = this.rawBody!!.toByteArray().size.toLong()
                ReactNativeBlobUtilReq.RequestType.Others -> {}
                // No case for these in the Java switch either.
                ReactNativeBlobUtilReq.RequestType.Form, ReactNativeBlobUtilReq.RequestType.WithoutBody -> {}
            }
        } catch (ex: Exception) {
            ex.printStackTrace()
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create single content request body :" + ex.localizedMessage + "\r\n")
        }
        return this
    }

    /**
     * Set request body (Array)
     *
     * @param body A Readable array contains form data
     * @return object itself
     */
    fun setBody(body: ReadableArray?): ReactNativeBlobUtilBody {
        this.form = body
        try {
            val cache = createMultipartBodyCache()
            bodyCache = cache
            contentLength = cache.length()
        } catch (ex: Exception) {
            ex.printStackTrace()
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create request multipart body :" + ex.localizedMessage)
        }
        return this
    }

    // This organizes the input stream initialization logic into a method. This allows:
    // 1) Initialization to be deferred until it's needed (when we are ready to pipe it into the BufferedSink)
    // 2) The stream to be initialized and used as many times as necessary. When okhttp runs into
    //    a connection error, it will retry the request which will require a new stream to write into
    //    the sink once again.
    fun getInputStreamForRequestBody(): InputStream? {
        try {
            if (this.form != null) {
                return FileInputStream(bodyCache)
            } else {
                when (requestType!!) {
                    ReactNativeBlobUtilReq.RequestType.SingleFile -> return getRequestStream()
                    ReactNativeBlobUtilReq.RequestType.AsIs -> return ByteArrayInputStream(this.rawBody!!.toByteArray())
                    ReactNativeBlobUtilReq.RequestType.Others -> ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil could not create input stream for request type others")
                    // No case for these in the Java switch either: fall through to null.
                    ReactNativeBlobUtilReq.RequestType.Form, ReactNativeBlobUtilReq.RequestType.WithoutBody -> {}
                }
            }
        } catch (ex: Exception) {
            ex.printStackTrace()
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create input stream for request:" + ex.localizedMessage)
        }

        return null
    }

    override fun contentLength(): Long = if (chunkedEncoding) -1 else contentLength

    override fun contentType(): MediaType? = mime

    override fun writeTo(sink: BufferedSink) {
        try {
            pipeStreamToSink(getInputStreamForRequestBody(), sink)
        } catch (ex: Exception) {
            ex.printStackTrace()
            // OkHttp fails the call on an IOException from here, so the request
            // rejects with the source's own error. Swallowing it, as Java did,
            // left the body short: with a known length the connection died with
            // "unexpected end of stream", and a chunked upload went through
            // truncated and succeeded (#490). Anything other than an IOException
            // would be rethrown on OkHttp's executor thread and kill the app, so
            // it travels wrapped.
            throw ex as? IOException
                ?: IOException(ex.localizedMessage ?: "ReactNativeBlobUtil could not read the request body", ex)
        }
    }

    fun clearRequestBody(): Boolean {
        try {
            val cache = bodyCache
            if (cache != null && cache.exists()) {
                cache.delete()
            }
        } catch (e: Exception) {
            ReactNativeBlobUtilUtils.emitWarningEvent(e.localizedMessage)
            return false
        }
        return true
    }

    @Throws(Exception::class)
    private fun getRequestStream(): InputStream? {
        val body = rawBody!!

        // upload from storage
        if (body.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX)) {
            var orgPath: String? = body.substring(ReactNativeBlobUtilConst.FILE_PREFIX.length)
            if (ReactNativeBlobUtilContent.isContent(orgPath)) return ReactNativeBlobUtilContent.openInput(orgPath!!)
            orgPath = ReactNativeBlobUtilUtils.normalizePath(orgPath)
            // upload file from assets
            if (ReactNativeBlobUtilUtils.isAsset(orgPath)) {
                try {
                    val assetName = orgPath!!.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "")
                    return ReactNativeBlobUtilImpl.RCTContext.assets.open(assetName)
                } catch (e: Exception) {
                    throw Exception("error when getting request stream from asset : " + e.localizedMessage)
                }
            } else {
                // An unresolvable path throws here, outside the try, as it did in Java.
                val f = File(ReactNativeBlobUtilUtils.normalizePath(orgPath))
                try {
                    // A missing file is an error; it used to be created empty and sent.
                    return FileInputStream(f)
                } catch (e: Exception) {
                    throw Exception("error when getting request stream: " + e.localizedMessage)
                }
            }
        } else if (body.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
            val contentURI = body.substring(ReactNativeBlobUtilConst.CONTENT_PREFIX.length)
            try {
                return ReactNativeBlobUtilImpl.RCTContext.contentResolver.openInputStream(Uri.parse(contentURI))
            } catch (e: Exception) {
                throw Exception("error when getting request stream for content URI: $contentURI", e)
            }
        }
        // base 64 encoded
        else {
            try {
                val bytes = Base64.decode(body, 0)
                return ByteArrayInputStream(bytes)
            } catch (ex: Exception) {
                throw Exception("error when getting request stream: " + ex.localizedMessage)
            }
        }
    }

    /**
     * Create a temp file that contains content of multipart form data content
     *
     * @return The cache file object
     * @throws IOException .
     */
    @Throws(IOException::class)
    private fun createMultipartBodyCache(): File {
        val boundary = "ReactNativeBlobUtil-$mTaskId"

        val outputDir = ReactNativeBlobUtilImpl.RCTContext.cacheDir // context being the Activity pointer
        val outputFile = File.createTempFile("rnfb-form-tmp", "", outputDir)
        // The cache file is closed on failure too, and removed: a half-written form
        // is never sent, so it would only be left behind in the cache.
        try {
            FileOutputStream(outputFile).use { os -> writeForm(os, boundary) }
        } catch (e: Exception) {
            outputFile.delete()
            throw e
        }
        return outputFile
    }

    @Throws(IOException::class)
    private fun writeForm(os: FileOutputStream, boundary: String) {
        for (field in formFields()) {
            val data = field.data
            val name = field.name
            // skip invalid fields
            if (name == null || data == null) continue
            // form begin
            var header = "--$boundary\r\n"
            header += if (field.filename != null) {
                "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + field.filename + "\"\r\n"
            } else {
                "Content-Disposition: form-data; name=\"" + name + "\"\r\n"
            }
            header += "Content-Type: " + field.mime + "\r\n\r\n"
            os.write(header.toByteArray())
            // The part's kind decides its content, whether or not it has a filename.
            when (field.kind) {
                "file" -> writeFileContent(data, os)
                "base64" -> {
                    // A field whose data is not valid base64 must not sink the
                    // whole request. The header above is already written, so
                    // skipping just the content leaves the part in place with
                    // an empty body - the same shape the missing-file and
                    // bad-URI branches leave behind, and the same shape iOS
                    // produces, where initWithBase64EncodedString: yields nil
                    // and the append is a no-op.
                    try {
                        os.write(Base64.decode(data, 0))
                    } catch (e: IllegalArgumentException) {
                        ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data from base64 for field `$name`, the content is not valid base64 and will be empty.")
                    }
                }
                else -> os.write(data.toByteArray())
            }
            // form end
            os.write("\r\n".toByteArray())
        }
        // close the form
        val end = "--$boundary--\r\n".toByteArray()
        os.write(end)
        os.flush()
    }

    /**
     * The content of a file part: a wrapped path, a bundled asset or a content URI.
     * One that cannot be read leaves the part empty and warns, as before.
     */
    private fun writeFileContent(data: String, os: FileOutputStream) {
        val ctx = ReactNativeBlobUtilImpl.RCTContext
        if (data.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
            val contentURI = data.substring(ReactNativeBlobUtilConst.CONTENT_PREFIX.length)
            try {
                pipeStreamToFileStream(ReactNativeBlobUtilContent.openInput(contentURI), os)
            } catch (e: Exception) {
                ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data from content URI:" + contentURI + ", " + e.localizedMessage)
            }
            return
        }
        val rawPath = data.removePrefix(ReactNativeBlobUtilConst.FILE_PREFIX)
        val orgPath: String? = ReactNativeBlobUtilUtils.normalizePath(rawPath)
        if (ReactNativeBlobUtilContent.isContent(rawPath)) {
            // a content:// URI behind the file prefix is read through its provider too
            try {
                pipeStreamToFileStream(ReactNativeBlobUtilContent.openInput(rawPath), os)
            } catch (e: Exception) {
                ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data from content URI:$rawPath, " + e.localizedMessage)
            }
        } else if (ReactNativeBlobUtilUtils.isAsset(orgPath)) {
            try {
                val assetName = orgPath!!.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "")
                pipeStreamToFileStream(ctx.assets.open(assetName), os)
            } catch (e: IOException) {
                ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data asset :" + orgPath + ", " + e.localizedMessage)
            }
        } else {
            val file = if (orgPath == null) null else File(orgPath)
            if (file != null && file.exists()) {
                pipeStreamToFileStream(FileInputStream(file), os)
            } else {
                ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data from path :$orgPath, file not exists.")
            }
        }
    }

    /**
     * Pipe input stream to request body output stream
     *
     * @param stream The input stream
     * @param sink   The request body buffer sink
     * @throws IOException .
     *
     * Internal rather than private so the unit test can hand it a source it watches.
     */
    @Throws(IOException::class)
    internal fun pipeStreamToSink(stream: InputStream?, sink: BufferedSink) {
        // A null stream throws here, as it did in Java, and writeTo reports it.
        val input = stream!!
        // The source is closed whether or not the copy completes. Java closed it
        // after the loop only, so a failed read or write leaked the upload's file
        // descriptor (#490).
        input.use {
            val chunk = ByteArray(10240)
            var totalWritten: Long = 0
            var read: Int
            while (input.read(chunk, 0, 10240).also { read = it } > 0) {
                sink.write(chunk, 0, read)
                totalWritten += read
                emitUploadProgress(totalWritten)
            }
        }
    }

    /**
     * The number of bytes [input] has left, for Content-Length. The stream is only
     * opened to be measured, so it is closed here; Java left it open on every
     * single-file and asset upload.
     *
     * A file-backed stream reports its size as a Long. available() is an Int, so on
     * its own it capped a file over 2 GB at Int.MAX_VALUE, and the request then
     * declared the wrong length. Streams that are not files, or whose channel has
     * no size (a pipe from a content provider), keep available().
     *
     * Internal rather than private so the unit test can hand it a source it watches.
     */
    internal fun sourceLength(input: InputStream): Long = input.use {
        val fromChannel = (input as? FileInputStream)?.let {
            runCatching { it.channel.size() - it.channel.position() }.getOrNull()
        }
        if (fromChannel != null && fromChannel > 0) fromChannel else input.available().toLong()
    }

    /**
     * Pipe input stream to a file
     *
     * @param input The input stream
     * @param os The output stream to a file
     * @throws IOException
     *
     * Internal rather than private so the unit test can hand it a source it watches.
     */
    @Throws(IOException::class)
    internal fun pipeStreamToFileStream(input: InputStream?, os: FileOutputStream) {
        // A null stream throws here, as it did in Java; the callers catch it.
        val source = input!!
        // Closed on failure too, as in pipeStreamToSink (#490).
        source.use {
            val buf = ByteArray(10240)
            var len: Int
            while (source.read(buf).also { len = it } > 0) {
                os.write(buf, 0, len)
            }
        }
    }

    /**
     * The form's fields. The body's length is the finished cache file's, so
     * nothing is estimated here any more; Java measured every source twice.
     */
    private fun formFields(): ArrayList<FormField> {
        val list = ArrayList<FormField>()
        val fields = form!!
        for (i in 0 until fields.size()) {
            val field = FormField(fields.getMap(i))
            list.add(field)
            if (field.data == null) {
                ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil multipart request builder has found a field without `data` property, the field `" + field.name + "` will be removed implicitly.")
            }
        }
        return list
    }

    /**
     * Since ReadableMap could only be access once, we have to store the field into a map for
     * repeatedly access.
     */
    private class FormField(rawData: ReadableMap?) {
        var name: String? = null
        var filename: String? = null
        var mime: String? = null
        var data: String? = null
        var kind: String? = null

        init {
            // A null entry in the form throws here, as it did in Java; setBody reports it.
            val map = rawData!!
            if (map.hasKey("name")) name = map.getString("name")
            if (map.hasKey("filename")) filename = map.getString("filename")
            mime = if (map.hasKey("type")) {
                map.getString("type")
            } else {
                if (filename == null) "text/plain" else "application/octet-stream"
            }
            if (map.hasKey("data")) {
                data = map.getString("data")
            }
            // JS sends the kind; without it, the rule Android always applied.
            kind = if (map.hasKey("kind")) {
                map.getString("kind")
            } else if (filename == null) {
                "text"
            } else if (data?.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX) == true || data?.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX) == true) {
                "file"
            } else {
                "base64"
            }
        }
    }

    /**
     * Emit progress event
     *
     * @param written Integer
     */
    private fun emitUploadProgress(written: Long) {
        val config = ReactNativeBlobUtilReq.getReportUploadProgress(mTaskId)
        if (config != null && contentLength != 0L && config.shouldReport(written.toFloat() / contentLength)) {
            val args = ReactNativeBlobUtilProgressEvent.toWritableMap(
                ReactNativeBlobUtilProgressEvent.values(mTaskId, written, contentLength)
            )

            // emit event to js context
            ReactNativeBlobUtilImpl.RCTContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(ReactNativeBlobUtilConst.EVENT_UPLOAD_PROGRESS, args)
        }
    }

}
