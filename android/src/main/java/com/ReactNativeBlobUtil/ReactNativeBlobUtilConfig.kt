package com.ReactNativeBlobUtil

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.util.Locale

/**
 * The fetch config passed from JS, read once into fields.
 *
 * The fields keep the boxed, nullable types of the Java class: with null options
 * the constructor returns early and leaves most of them null, and the request code
 * reads them as it always has.
 */
internal class ReactNativeBlobUtilConfig(options: ReadableMap?) {

    @JvmField var fileCache: Boolean? = null
    @JvmField var transformFile: Boolean? = null
    @JvmField var path: String? = null
    @JvmField var appendExt: String? = null
    @JvmField var addAndroidDownloads: ReadableMap? = null
    @JvmField var trusty: Boolean? = null
    @JvmField var wifiOnly: Boolean? = false
    @JvmField var targetHostIp: String? = null
    @JvmField var key: String? = null
    @JvmField var mime: String? = null
    @JvmField var auto: Boolean? = null
    @JvmField var overwrite: Boolean? = true
    @JvmField var timeout: Long = 60000
    @JvmField var increment: Boolean? = false
    @JvmField var followRedirect: Boolean? = true
    @JvmField var binaryContentTypes: ReadableArray? = null
    @JvmField var customCACerts: MutableList<String?>? = null
    @JvmField var pinnedHosts: MutableList<String?>? = null
    @JvmField var trustSystemCerts: Boolean? = false

    init {
        if (options != null) {
            fileCache = options.hasKey("fileCache") && options.getBoolean("fileCache")
            transformFile = if (options.hasKey("transformFile")) options.getBoolean("transformFile") else false
            path = if (options.hasKey("path")) options.getString("path") else null
            appendExt = if (options.hasKey("appendExt")) options.getString("appendExt") else ""
            trusty = options.hasKey("trusty") && options.getBoolean("trusty")
            wifiOnly = options.hasKey("wifiOnly") && options.getBoolean("wifiOnly")
            targetHostIp = if (options.hasKey("targetHostIp")) options.getString("targetHostIp") else ""
            if (options.hasKey("addAndroidDownloads")) {
                addAndroidDownloads = options.getMap("addAndroidDownloads")
            }
            if (options.hasKey("binaryContentTypes")) {
                binaryContentTypes = options.getArray("binaryContentTypes")
            }
            val currentPath = path
            if (currentPath != null && currentPath.lowercase(Locale.ROOT).contains("?append=true")) {
                overwrite = false
            }
            if (options.hasKey("overwrite")) {
                overwrite = options.getBoolean("overwrite")
            }
            if (options.hasKey("followRedirect")) {
                followRedirect = options.getBoolean("followRedirect")
            }
            key = if (options.hasKey("key")) options.getString("key") else null
            mime = if (options.hasKey("contentType")) options.getString("contentType") else null
            increment = options.hasKey("increment") && options.getBoolean("increment")
            auto = options.hasKey("auto") && options.getBoolean("auto")
            if (options.hasKey("timeout")) {
                timeout = options.getInt("timeout").toLong()
            }
            if (options.hasKey("customCACerts")) {
                val certsArray = options.getArray("customCACerts")
                if (certsArray != null && certsArray.size() > 0) {
                    customCACerts = MutableList(certsArray.size()) { certsArray.getString(it) }
                }
            }
            if (options.hasKey("pinnedHosts")) {
                val hostsArray = options.getArray("pinnedHosts")
                if (hostsArray != null && hostsArray.size() > 0) {
                    pinnedHosts = MutableList(hostsArray.size()) { hostsArray.getString(it) }
                }
            }
            if (options.hasKey("trustSystemCerts")) {
                trustSystemCerts = options.getBoolean("trustSystemCerts")
            }
        }
    }
}
