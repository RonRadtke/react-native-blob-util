package com.ReactNativeBlobUtil

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap

/**
 * The payload of ReactNativeBlobUtilProgress and ReactNativeBlobUtilProgress-upload
 * events, built as plain values first so a JVM test can check it against
 * tests/fixtures/native-payloads/progress-event.json. Arguments.createMap() needs
 * the native runtime and cannot run on the JVM.
 *
 * Byte counts are doubles on the wire: JS receives numbers, never strings.
 */
internal object ReactNativeBlobUtilProgressEvent {

    fun values(taskId: String?, written: Long, total: Long): LinkedHashMap<String, Any?> =
        linkedMapOf(
            "taskId" to taskId,
            "written" to written.toDouble(),
            "total" to total.toDouble(),
        )

    fun toWritableMap(values: Map<String, Any?>): WritableMap {
        val args = Arguments.createMap()
        for ((key, value) in values) {
            when (value) {
                null -> args.putNull(key)
                is String -> args.putString(key, value)
                is Double -> args.putDouble(key, value)
                else -> throw IllegalArgumentException("unsupported progress value for $key: ${value.javaClass}")
            }
        }
        return args
    }
}
