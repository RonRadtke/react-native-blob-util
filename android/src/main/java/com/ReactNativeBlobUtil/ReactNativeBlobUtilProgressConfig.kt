package com.ReactNativeBlobUtil

import kotlin.math.floor

/**
 * Decides whether a progress event is emitted, so JS receives at most one event
 * per [interval] milliseconds and, when [count] is set, at most [count] events
 * over the whole transfer.
 *
 * Created by wkh237 on 2016/9/24.
 */
class ReactNativeBlobUtilProgressConfig internal constructor(
    private val enable: Boolean,
    private val interval: Int,
    private val count: Int,
    @Suppress("unused") private val type: ReportType,
) {

    internal enum class ReportType {
        Upload,
        Download,
    }

    private var lastTick: Long = 0
    private var tick = 0

    fun shouldReport(progress: Float): Boolean {
        var checkCount = true
        if (count > 0 && progress > 0) {
            checkCount = floor((progress * count).toDouble()) > tick
        }
        var result = (System.currentTimeMillis() - lastTick > interval) && enable && checkCount
        // Always report completion. Otherwise the final event of a transfer is
        // dropped whenever it lands inside the interval window, and a caller
        // watching progress never sees 100%. Measured on Windows: the last
        // upload event (written == total) was thrown away and the only survivor
        // carried zero bytes.
        if (!result && enable && progress >= 1) {
            result = true
        }
        if (result) {
            tick++
            lastTick = System.currentTimeMillis()
        }
        return result
    }
}
