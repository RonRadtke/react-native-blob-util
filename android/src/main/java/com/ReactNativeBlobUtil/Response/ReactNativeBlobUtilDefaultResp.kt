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
import java.io.IOException
import java.nio.charset.Charset

/**
 * Created by wkh237 on 2016/7/11.
 */
class ReactNativeBlobUtilDefaultResp(
    private val rctContext: ReactApplicationContext,
    private val mTaskId: String?,
    private val originalBody: ResponseBody,
    private val isIncrement: Boolean,
) : ResponseBody() {

    override fun contentType(): MediaType? = originalBody.contentType()

    override fun contentLength(): Long = originalBody.contentLength()

    override fun source(): BufferedSource = ProgressReportingSource(originalBody.source()).buffer()

    private inner class ProgressReportingSource(private val mOriginalSource: BufferedSource) : Source {

        var bytesRead: Long = 0

        @Throws(IOException::class)
        override fun read(sink: Buffer, byteCount: Long): Long {

            val read = mOriginalSource.read(sink, byteCount)
            bytesRead += if (read > 0) read else 0
            val reportConfig = ReactNativeBlobUtilReq.getReportProgress(mTaskId)
            val cLen = contentLength()
            if (reportConfig != null && cLen != 0L && reportConfig.shouldReport(if (cLen > 0) bytesRead.toFloat() / cLen else 0f)) {
                val values = ReactNativeBlobUtilProgressEvent.values(mTaskId, bytesRead, contentLength())
                if (isIncrement) {
                    values["chunk"] = sink.readString(Charset.defaultCharset())
                } else {
                    values["chunk"] = ""
                }

                rctContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(ReactNativeBlobUtilConst.EVENT_PROGRESS, ReactNativeBlobUtilProgressEvent.toWritableMap(values))
            }
            return read
        }

        // The Java source returned null here. A Kotlin override cannot, and nothing
        // that reads this body asks for its timeout; NONE is the no-timeout value.
        override fun timeout(): Timeout = Timeout.NONE

        @Throws(IOException::class)
        override fun close() {

        }
    }

}
