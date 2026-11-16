package com.ReactNativeBlobUtil

import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Downloads that outlive the app: config({path, background: {id}}).
 *
 * The DownloadManager runs them, so they go on while the app is suspended or
 * ended. It cannot write to the app's internal storage, so each one lands in
 * the app's external files directory (rnbu-background/<id>) and is moved to the
 * path the app asked for when it ends: by the running app, or by
 * ReactNativeBlobUtilBackgroundReceiver when the app is not running. A record
 * per id, in SharedPreferences, says where each download is; it stays until
 * its outcome has been handed to JS (the fetch that started it, or
 * background.attach) or until background.forget.
 */
internal object ReactNativeBlobUtilBackground {

    private const val PREFS = "com.ReactNativeBlobUtil.background"
    private const val DIR = "rnbu-background"

    const val RUNNING = "running"
    const val PAUSED = "paused"
    const val COMPLETED = "completed"
    const val FAILED = "failed"

    /** What is known about a background download. */
    internal data class Record(
        val id: String,
        val url: String,
        val path: String,
        val dmId: Long,
        val state: String,
        val written: Long = 0,
        val total: Long = -1,
        val errorCode: String? = null,
        val errorMessage: String? = null,
    ) {
        val finished: Boolean get() = state == COMPLETED || state == FAILED

        /** One field per line; a line break inside a value becomes a space. */
        fun encode(): String = listOf(url, path, dmId.toString(), state, written.toString(), total.toString(), errorCode ?: "", errorMessage ?: "")
            .joinToString("\n") { it.replace('\n', ' ').replace('\r', ' ') }

        companion object {
            fun decode(id: String, text: String?): Record? {
                val parts = text?.split('\n') ?: return null
                if (parts.size < 8) return null
                return Record(
                    id, parts[0], parts[1], parts[2].toLongOrNull() ?: -1, parts[3],
                    parts[4].toLongOrNull() ?: 0, parts[5].toLongOrNull() ?: -1,
                    parts[6].ifEmpty { null }, parts[7].ifEmpty { null },
                )
            }
        }
    }

    /** What the DownloadManager reports about one download; status null when it has no such download. */
    internal data class Report(val status: Int?, val reason: Int, val localUri: String?, val written: Long, val total: Long)

    /**
     * The record after a report: running, paused, or finished with the file at
     * its path (completed) or an error (failed). A finished record stays as it
     * is. Moving the file is the caller's; this only says what happened. Pure,
     * so it is unit-tested.
     */
    internal fun next(record: Record, report: Report): Record {
        if (record.finished) return record
        return when (report.status) {
            DownloadManager.STATUS_SUCCESSFUL -> record.copy(state = COMPLETED, written = report.written, total = report.written)
            DownloadManager.STATUS_FAILED -> record.copy(
                state = FAILED, written = report.written, total = report.total, errorCode = "EUNSPECIFIED",
                errorMessage = "The DownloadManager could not download the file: ${ReactNativeBlobUtilReq.downloadManagerReason(report.reason)}",
            )
            null -> record.copy(state = FAILED, errorCode = "ECANCELED", errorMessage = "The download was removed")
            DownloadManager.STATUS_PAUSED -> record.copy(state = PAUSED, written = report.written, total = report.total)
            else -> record.copy(state = RUNNING, written = report.written, total = report.total)
        }
    }

    // The fetch or attach callback of a download, while the app is there to hear of it.
    private val callbacks = ConcurrentHashMap<String, Callback>()
    private val polls = ConcurrentHashMap<String, ScheduledFuture<*>>()
    private val poller = Executors.newSingleThreadScheduledExecutor()

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    private fun read(ctx: Context, id: String): Record? = Record.decode(id, prefs(ctx).getString(id, null))

    @Synchronized
    private fun write(ctx: Context, record: Record) {
        prefs(ctx).edit().putString(record.id, record.encode()).commit()
    }

    @Synchronized
    private fun remove(ctx: Context, id: String) {
        prefs(ctx).edit().remove(id).commit()
    }

    @Synchronized
    private fun all(ctx: Context): List<Record> = prefs(ctx).all.mapNotNull { (id, text) -> Record.decode(id, text as? String) }

    private fun dm(ctx: Context) = ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

    private fun staging(ctx: Context, id: String): File? = ctx.getExternalFilesDir(null)?.let { File(it, "$DIR/$id") }

    private fun error(code: String, message: String?): WritableMap {
        val error = Arguments.createMap()
        error.putString("code", code)
        error.putString("message", message ?: "")
        return error
    }

    /** The response info a finished background download reports. */
    private fun info(record: Record): WritableMap {
        val info = Arguments.createMap()
        info.putString("taskId", record.id)
        info.putString("state", "2")
        info.putInt("status", if (record.state == COMPLETED) 200 else 0)
        info.putMap("headers", Arguments.createMap())
        val redirects = Arguments.createArray()
        redirects.pushString(record.url)
        info.putArray("redirects", redirects)
        info.putString("respType", "blob")
        info.putBoolean("timeout", false)
        return info
    }

    /** Starts a background download; `callback` hears of it if the app is still running when it ends. */
    fun start(ctx: Context, id: String, url: String?, path: String?, headers: ReadableMap?, callback: Callback) {
        if (url == null || path.isNullOrEmpty()) {
            callback.invoke(error("EINVAL", "A background download needs a URL and a path"), null, null, null)
            return
        }
        val existing = read(ctx, id)
        if (existing != null && !existing.finished) {
            callback.invoke(error("EEXIST", "A background download \"$id\" is already running"), null, null, null)
            return
        }
        try {
            val target = staging(ctx, id)
                ?: throw IllegalStateException("External storage, where the DownloadManager writes, is not available")
            target.parentFile?.mkdirs()
            // The DownloadManager never replaces a file; it would write <id>-1.
            if (target.exists()) target.delete()
            val req = DownloadManager.Request(Uri.parse(url))
            req.setDestinationUri(Uri.fromFile(target))
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
            req.setTitle(File(path).name)
            val keys = headers?.keySetIterator()
            while (keys != null && keys.hasNextKey()) {
                val key = keys.nextKey()
                if (!key.equals("RNFB-Response", ignoreCase = true)) {
                    req.addRequestHeader(key, headers.getString(key))
                }
            }
            try {
                val host = URL(url)
                val cookie = CookieManager.getInstance().getCookie(host.protocol + "://" + host.host)
                if (!cookie.isNullOrEmpty()) req.addRequestHeader("Cookie", cookie)
            } catch (e: Exception) {
                // no WebView, no cookies
            }
            val dmId = dm(ctx).enqueue(req)
            write(ctx, Record(id, url, path, dmId, RUNNING))
            callbacks[id] = callback
            watch(ctx, id)
        } catch (e: Exception) {
            callback.invoke(error(if (e is SecurityException) "EACCES" else "EINVAL", e.localizedMessage), null, null, null)
        }
    }

    /** Every record, the running ones brought up to date first. */
    fun list(ctx: Context): WritableArray {
        val out = Arguments.createArray()
        for (record in all(ctx)) {
            val current = if (record.finished) record else refresh(ctx, record)
            val map = Arguments.createMap()
            map.putString("id", current.id)
            map.putString("url", current.url)
            map.putString("path", current.path)
            map.putString("state", current.state)
            map.putDouble("written", current.written.toDouble())
            map.putDouble("total", current.total.toDouble())
            current.errorCode?.let { map.putString("errorCode", it) }
            current.errorMessage?.let { map.putString("errorMessage", it) }
            out.pushMap(map)
        }
        return out
    }

    /** Hands the outcome of a download to `callback`: at once when it is known, else when it ends. */
    fun attach(ctx: Context, id: String, callback: Callback) {
        val record = read(ctx, id)
        if (record == null) {
            callback.invoke(error("ENOENT", "No background download \"$id\""), null, null, null)
            return
        }
        callbacks[id] = callback
        val current = if (record.finished) record else refresh(ctx, record)
        if (current.finished) {
            deliver(ctx, current)
        } else {
            watch(ctx, id)
        }
    }

    /** Removes a record, cancelling the download when it still runs. */
    fun forget(ctx: Context, id: String) {
        val record = read(ctx, id) ?: return
        stopWatching(id)
        // A task still waiting for it settles; after cancel() it already has, and JS ignores this.
        callbacks.remove(id)?.invoke(error("ECANCELED", "The background download was forgotten"), null, null, info(record))
        if (!record.finished) {
            try {
                dm(ctx).remove(record.dmId)
            } catch (e: Exception) {
                // gone already
            }
        }
        staging(ctx, id)?.delete()
        remove(ctx, id)
    }

    /** cancel() of a background download: forgotten, as cancel means it is not wanted. False when it is not one. */
    fun cancel(ctx: Context, id: String): Boolean {
        if (read(ctx, id) == null) return false
        forget(ctx, id)
        return true
    }

    /** The DownloadManager announced the end of one of its downloads; ours or not. */
    fun downloadEnded(ctx: Context, dmId: Long) {
        val record = all(ctx).firstOrNull { it.dmId == dmId && !it.finished } ?: return
        refresh(ctx, record)
    }

    private fun query(ctx: Context, dmId: Long): Report {
        dm(ctx).query(DownloadManager.Query().setFilterById(dmId))?.use { c ->
            if (c.moveToFirst()) {
                return Report(
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
                    c.getString(c.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)),
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)),
                )
            }
        }
        return Report(null, 0, null, 0, -1)
    }

    /**
     * Asks the DownloadManager about a running download and acts on the answer:
     * a finished one is moved into place, recorded and handed to its callback.
     */
    @Synchronized
    private fun refresh(ctx: Context, record: Record): Record {
        val stored = read(ctx, record.id) ?: return record
        if (stored.finished) return stored
        val report = try {
            query(ctx, stored.dmId)
        } catch (e: Exception) {
            return stored
        }
        var updated = next(stored, report)
        if (updated.state == COMPLETED) {
            val moved = moveIntoPlace(ReactNativeBlobUtilReq.downloadedFile(report.localUri), updated.path)
            if (moved != null) {
                updated = updated.copy(state = FAILED, errorCode = "EUNSPECIFIED", errorMessage = moved)
            }
        }
        write(ctx, updated)
        if (updated.finished) {
            // The row goes; the file was moved out already, or is not wanted.
            try {
                dm(ctx).remove(updated.dmId)
            } catch (e: Exception) {
                // gone already
            }
            deliver(ctx, updated)
        } else {
            emitProgress(updated)
        }
        return updated
    }

    /** Moves the downloaded file to the path the app asked for; the reason when it cannot. */
    private fun moveIntoPlace(source: String?, path: String): String? {
        if (source == null || source.startsWith("content://")) return "The DownloadManager reported no file"
        return try {
            val from = File(source)
            val to = File(path)
            to.absoluteFile.parentFile?.mkdirs()
            if (to.exists() && !to.isDirectory) to.delete()
            // Across volumes (external to internal storage) a rename fails; copy then.
            if (!from.renameTo(to)) {
                FileInputStream(from).use { input -> FileOutputStream(to).use { input.copyTo(it, 65536) } }
                from.delete()
            }
            null
        } catch (e: Exception) {
            "Could not move the download to '$path': ${e.localizedMessage}"
        }
    }

    /** Hands a finished download to its callback, if JS is waiting for it; the record then goes. */
    private fun deliver(ctx: Context, record: Record) {
        val callback = callbacks.remove(record.id) ?: return
        stopWatching(record.id)
        remove(ctx, record.id)
        if (record.state == COMPLETED) {
            emitProgress(record)
            callback.invoke(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, record.path, info(record))
        } else {
            callback.invoke(error(record.errorCode ?: "EUNSPECIFIED", record.errorMessage), null, null, info(record))
        }
    }

    private fun watch(ctx: Context, id: String) {
        stopWatching(id)
        val app = ctx.applicationContext
        polls[id] = poller.scheduleWithFixedDelay({
            val record = read(app, id)
            if (record == null || record.finished) {
                stopWatching(id)
            } else {
                refresh(app, record)
            }
        }, 250, 500, TimeUnit.MILLISECONDS)
    }

    private fun stopWatching(id: String) {
        polls.remove(id)?.cancel(false)
    }

    private fun emitProgress(record: Record) {
        val config = ReactNativeBlobUtilReq.getReportProgress(record.id) ?: return
        val fraction = if (record.total > 0) record.written.toFloat() / record.total else 0f
        if (!config.shouldReport(fraction)) return
        try {
            val args = ReactNativeBlobUtilProgressEvent.toWritableMap(
                ReactNativeBlobUtilProgressEvent.values(record.id, record.written, record.total),
            )
            ReactNativeBlobUtilImpl.RCTContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(ReactNativeBlobUtilConst.EVENT_PROGRESS, args)
        } catch (e: Exception) {
            // no JS to tell
        }
    }
}

/**
 * Hears the DownloadManager end a download, also while the app is not running
 * (it addresses the broadcast to the app's package, which manifest receivers
 * still get), and moves a background download's file into place. Only
 * downloads it has a record of are touched, and their status is read from the
 * DownloadManager, not from the broadcast.
 */
class ReactNativeBlobUtilBackgroundReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != DownloadManager.ACTION_DOWNLOAD_COMPLETE) return
        val dmId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
        if (dmId < 0) return
        val pending = goAsync()
        val app = context.applicationContext
        thread {
            try {
                ReactNativeBlobUtilBackground.downloadEnded(app, dmId)
            } finally {
                pending.finish()
            }
        }
    }
}
