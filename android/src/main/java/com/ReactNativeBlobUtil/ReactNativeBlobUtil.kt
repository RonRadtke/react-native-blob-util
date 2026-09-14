package com.ReactNativeBlobUtil

import android.os.Build
import androidx.annotation.RequiresApi
import com.facebook.fbreact.specs.NativeBlobUtilsSpec
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap

class ReactNativeBlobUtil(reactContext: ReactApplicationContext) : NativeBlobUtilsSpec(reactContext) {

    private val delegate = ReactNativeBlobUtilImpl(reactContext)

    // Required for rn built in EventEmitter Calls.
    @ReactMethod
    override fun addListener(eventName: String?) {

    }

    @ReactMethod
    override fun removeListeners(count: Double) {

    }

    override fun getTypedExportedConstants(): Map<String, Any> {
        val res = HashMap<String, Any>()
        res.putAll(ReactNativeBlobUtilFS.getSystemfolders(reactApplicationContext))
        res.putAll(ReactNativeBlobUtilFS.getLegacySystemfolders(reactApplicationContext))
        return res
    }

    override fun getName(): String = ReactNativeBlobUtilImpl.NAME

    override fun fetchBlobForm(options: ReadableMap?, taskId: String?, method: String?, url: String?, headers: ReadableMap?, form: ReadableArray?, callback: Callback) {
        delegate.fetchBlobForm(options, taskId, method, url, headers, form, callback)
    }

    override fun fetchBlob(options: ReadableMap?, taskId: String?, method: String?, url: String?, headers: ReadableMap?, body: String?, callback: Callback) {
        delegate.fetchBlob(options, taskId, method, url, headers, body, callback)
    }

    override fun createFile(path: String?, data: String?, encoding: String?, promise: Promise) {
        delegate.createFile(path, data, encoding, promise)
    }

    override fun createFileASCII(path: String?, data: ReadableArray?, promise: Promise) {
        delegate.createFileASCII(path, data, promise)
    }


    override fun pathForAppGroup(groupName: String?, promise: Promise) {
        // Not implemented as ReactNativeBlobUtil.pathForAppGroup only supports IOS
        // This will be rejected at the iOS layer
    }

    override fun syncPathAppGroup(groupName: String?): String? {
        // Not implemented as ReactNativeBlobUtil.syncPathAppGroup only supports IOS
        // This will be rejected at the iOS layer
        return null
    }

    override fun exists(path: String?, promise: Promise) {
        delegate.exists(path, promise)
    }

    override fun writeFile(path: String?, encoding: String?, data: String?, transformFile: Boolean, append: Boolean, promise: Promise) {
        delegate.writeFile(path, encoding, data, transformFile, append, promise)
    }

    override fun writeFileArray(path: String?, data: ReadableArray?, append: Boolean, promise: Promise) {
        delegate.writeFileArray(path, data, append, promise)
    }

    override fun writeStream(path: String?, withEncoding: String?, appendData: Boolean, promise: Promise) {
        delegate.writeStream(path, withEncoding, appendData, promise)
    }

    override fun writeArrayChunk(streamId: String?, withArray: ReadableArray?, promise: Promise) {
        delegate.writeArrayChunk(streamId, withArray, promise)
    }

    override fun writeChunk(streamId: String?, withData: String?, promise: Promise) {
        delegate.writeChunk(streamId, withData, promise)
    }

    override fun closeStream(streamId: String?, promise: Promise) {
        delegate.closeStream(streamId, promise)
    }

    override fun unlink(path: String?, promise: Promise) {
        delegate.unlink(path, promise)
    }

    override fun removeSession(paths: ReadableArray?, promise: Promise) {
        delegate.removeSession(paths, promise)
    }

    override fun ls(path: String?, promise: Promise) {
        delegate.ls(path, promise)
    }

    override fun stat(target: String?, promise: Promise) {
        delegate.stat(target, promise)
    }

    override fun lstat(path: String?, promise: Promise) {
        delegate.lstat(path, promise)
    }

    override fun cp(src: String?, dest: String?, promise: Promise) {
        delegate.cp(src, dest, promise)
    }

    override fun mv(path: String?, dest: String?, promise: Promise) {
        delegate.mv(path, dest, promise)
    }

    override fun mkdir(path: String?, promise: Promise) {
        delegate.mkdir(path, promise)
    }

    override fun readFile(path: String?, encoding: String?, transformFile: Boolean, promise: Promise) {
        delegate.readFile(path, encoding, transformFile, promise)
    }

    override fun hash(path: String?, algorithm: String?, promise: Promise) {
        delegate.hash(path, algorithm, promise)
    }

    override fun readStream(path: String?, encoding: String?, bufferSize: Double, tick: Double, streamId: String?) {
        delegate.readStream(path, encoding, bufferSize.toInt(), tick.toInt(), streamId)
    }

    override fun cancelRequest(taskId: String?, promise: Promise) {
        delegate.cancelRequest(taskId, promise)
    }

    override fun enableProgressReport(taskId: String?, interval: Double, count: Double) {
        delegate.enableProgressReport(taskId, interval.toInt(), count.toInt())
    }

    override fun enableUploadProgressReport(taskId: String?, interval: Double, count: Double) {
        delegate.enableUploadProgressReport(taskId, interval.toInt(), count.toInt())
    }

    override fun slice(src: String?, dest: String?, start: Double, end: Double, promise: Promise) {
        delegate.slice(src, dest, start.toLong(), end.toLong(), promise)
    }

    override fun presentOptionsMenu(uri: String?, scheme: String?, promise: Promise) {
        // Not implemented as ReactNativeBlobUtil.presentOptionsMenu only supports IOS
        // This will be rejected at the iOS layer
    }

    override fun presentOpenInMenu(uri: String?, scheme: String?, promise: Promise) {
        // Not implemented as ReactNativeBlobUtil.presentOpenInMenu only supports IOS
        // This will be rejected at the iOS layer
    }

    override fun presentPreview(uri: String?, scheme: String?, promise: Promise) {
        // Not implemented as ReactNativeBlobUtil.presentPreview only supports IOS
        // This will be rejected at the iOS layer
    }

    override fun excludeFromBackupKey(url: String?, promise: Promise) {
        // Not implemented as ReactNativeBlobUtil.excludeFromBackupKey only supports IOS
    }

    override fun df(promise: Promise) {
        delegate.df(promise)
    }

    override fun actionViewIntent(path: String?, mime: String?, chooserTitle: String?, promise: Promise) {
        delegate.actionViewIntent(path, mime, chooserTitle, promise)
    }

    override fun addCompleteDownload(config: ReadableMap?, promise: Promise) {
        delegate.addCompleteDownload(config, promise)
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    override fun copyToInternal(contentUri: String?, destpath: String?, promise: Promise) {
        delegate.copyToInternal(contentUri, destpath, promise)
    }

    override fun copyToMediaStore(filedata: ReadableMap?, mt: String?, path: String?, promise: Promise) {
        delegate.copyToMediaStore(filedata, mt, path, promise)
    }

    override fun createMediaFile(filedata: ReadableMap?, mt: String?, promise: Promise) {
        delegate.createMediaFile(filedata, mt, promise)
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    override fun getBlob(contentUri: String?, encoding: String?, promise: Promise) {
        delegate.getBlob(contentUri, encoding, promise)
    }

    override fun getContentIntent(mime: String?, promise: Promise) {
        delegate.getContentIntent(mime, promise)
    }

    override fun getSDCardDir(promise: Promise) {
        delegate.getSDCardDir(promise)
    }

    override fun getSDCardApplicationDir(promise: Promise) {
        delegate.getSDCardApplicationDir(promise)
    }

    override fun scanFile(pairs: ReadableArray?, promise: Promise) {
        delegate.scanFile(pairs, promise)
    }

    override fun writeToMediaFile(fileUri: String?, path: String?, transformFile: Boolean, promise: Promise) {
        delegate.writeToMediaFile(fileUri, path, transformFile, promise)
    }
}
