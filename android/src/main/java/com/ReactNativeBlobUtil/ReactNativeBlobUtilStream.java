package com.ReactNativeBlobUtil;

import static com.ReactNativeBlobUtil.ReactNativeBlobUtilConst.EVENT_FILESYSTEM;

import android.net.Uri;
import android.os.SystemClock;
import android.util.Base64;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.HashMap;
import java.util.UUID;

public class ReactNativeBlobUtilStream {
    private final DeviceEventManagerModule.RCTDeviceEventEmitter emitter;
    private String encoding = "base64";
    private OutputStream writeStreamInstance = null;
    private static final HashMap<String, ReactNativeBlobUtilStream> fileStreams = new HashMap<>();

    ReactNativeBlobUtilStream(ReactApplicationContext ctx) {
        this.emitter = ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
    }

    /**
     * Create a file stream for read
     *  @param path       File stream target path
     * @param encoding   File stream decoder, should be one of `base64`, `utf8`, `ascii`
     * @param bufferSize Buffer size of read stream, default to 4096 (4095 when encode is `base64`)
     * @param RCTContext
     */
    void readStream(String path, String encoding, int bufferSize, int tick, final String streamId, ReactApplicationContext RCTContext) {
        String resolved = ReactNativeBlobUtilUtils.normalizePath(path);
        if (resolved != null)
            path = resolved;

        try {
            int chunkSize = encoding.equalsIgnoreCase("base64") ? 4095 : 4096;
            if (bufferSize > 0)
                chunkSize = bufferSize;

            InputStream fs;

            if (resolved != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
                fs = ReactNativeBlobUtilImpl.RCTContext.getAssets().open(path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, ""));
            }
            // fix issue 287
            else if (resolved == null) {
                fs = ReactNativeBlobUtilImpl.RCTContext.getContentResolver().openInputStream(Uri.parse(path));
            } else {
                fs = new FileInputStream(new File(path));
            }

            int cursor = 0;
            boolean error = false;

            if (encoding.equalsIgnoreCase("utf8")) {
                InputStreamReader isr = new InputStreamReader(fs, Charset.forName("UTF-8"));
                BufferedReader reader = new BufferedReader(isr, chunkSize);
                char[] buffer = new char[chunkSize];
                int numBytesRead;
                // read chunks of the string
                while ((numBytesRead = reader.read(buffer, 0, chunkSize)) != -1) {
                    String chunk = new String(buffer, 0, numBytesRead);
                    emitStreamEvent(streamId, "data", chunk);
                    if (tick > 0)
                        SystemClock.sleep(tick);
                }

                reader.close();
                isr.close();
            } else if (encoding.equalsIgnoreCase("ascii")) {
                byte[] buffer = new byte[chunkSize];
                while ((cursor = fs.read(buffer)) != -1) {
                    WritableArray chunk = Arguments.createArray();
                    for (int i = 0; i < cursor; i++) {
                        chunk.pushInt((int) buffer[i]);
                    }
                    emitStreamEvent(streamId, "data", chunk);
                    if (tick > 0)
                        SystemClock.sleep(tick);
                }
            } else if (encoding.equalsIgnoreCase("base64")) {
                byte[] buffer = new byte[chunkSize];
                while ((cursor = fs.read(buffer)) != -1) {
                    if (cursor < chunkSize) {
                        byte[] copy = new byte[cursor];
                        System.arraycopy(buffer, 0, copy, 0, cursor);
                        emitStreamEvent(streamId, "data", Base64.encodeToString(copy, Base64.NO_WRAP));
                    } else
                        emitStreamEvent(streamId, "data", Base64.encodeToString(buffer, Base64.NO_WRAP));
                    if (tick > 0)
                        SystemClock.sleep(tick);
                }
            } else {
                emitStreamEvent(
                        streamId,
                        "error",
                        "EINVAL",
                        "Unrecognized encoding `" + encoding + "`, should be one of `base64`, `utf8`, `ascii`"
                );
                error = true;
            }

            if (!error)
                emitStreamEvent(streamId, "end", "");
            fs.close();

        } catch (FileNotFoundException err) {
            emitStreamEvent(
                    streamId,
                    "error",
                    "ENOENT",
                    "No such file '" + path + "'"
            );
        } catch (Exception err) {
            emitStreamEvent(
                    streamId,
                    "error",
                    "EUNSPECIFIED",
                    "Failed to convert data to " + encoding + " encoded string. This might be because this encoding cannot be used for this data."
            );
            err.printStackTrace();
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
    void writeStream(String path, String encoding, boolean append, Callback callback) {
        String resolved = ReactNativeBlobUtilUtils.normalizePath(path);
        if (resolved != null)
            path = resolved;

        try {
            OutputStream fs;
            if (resolved != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
                fs = ReactNativeBlobUtilImpl.RCTContext.getAssets().openFd(path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "")).createOutputStream ();
            }
            // fix issue 287
            else if (resolved == null) {
                fs = ReactNativeBlobUtilImpl.RCTContext.getContentResolver().openOutputStream(Uri.parse(path));
            } else {
                File dest = prepareOutputFile(path);
                fs = new FileOutputStream(dest, append);
            }
            this.encoding = encoding;
            String streamId = UUID.randomUUID().toString();
            ReactNativeBlobUtilStream.fileStreams.put(streamId, this);
            this.writeStreamInstance = fs;
            callback.invoke(null, null, streamId);
        } catch (Exception err) {
            callback.invoke("EUNSPECIFIED", "Failed to create write stream at path `" + path + "`; " + err.getLocalizedMessage());
        }
    }

    private static File prepareOutputFile(String path) throws IOException {
        File file = new File(path).getCanonicalFile();
        File parent = file.getParentFile();

        if (parent == null) {
            throw new IOException("Invalid output path: " + path);
        }

        if (!parent.exists() && !parent.mkdirs() && !parent.exists()) {
            throw new IOException("Failed to create parent directory of '" + path + "'");
        }

        if (file.exists() && file.isDirectory()) {
            throw new IOException("Expecting a file but '" + path + "' is a directory");
        }

        if (!file.exists() && !file.createNewFile() && !file.exists()) {
            throw new IOException("File '" + path + "' does not exist and could not be created");
        }

        return file;
    }

    /**
     * Write a chunk of data into a file stream.
     *
     * @param streamId File stream ID
     * @param data     Data chunk in string format
     * @param callback JS context callback
     */
    static void writeChunk(String streamId, String data, Callback callback) {
        ReactNativeBlobUtilStream fs = fileStreams.get(streamId);
        assert fs != null;
        OutputStream stream = fs.writeStreamInstance;
        byte[] chunk = ReactNativeBlobUtilUtils.stringToBytes(data, fs.encoding);
        try {
            stream.write(chunk);
            callback.invoke();
        } catch (Exception e) {
            callback.invoke(e.getLocalizedMessage());
        }
    }

    /**
     * Write data using ascii array
     *
     * @param streamId File stream ID
     * @param data     Data chunk in ascii array format
     * @param callback JS context callback
     */
    static void writeArrayChunk(String streamId, ReadableArray data, Callback callback) {
        try {
            ReactNativeBlobUtilStream fs = fileStreams.get(streamId);
            assert fs != null;
            OutputStream stream = fs.writeStreamInstance;
            byte[] chunk = new byte[data.size()];
            for (int i = 0; i < data.size(); i++) {
                chunk[i] = (byte) data.getInt(i);
            }
            stream.write(chunk);
            callback.invoke();
        } catch (Exception e) {
            callback.invoke(e.getLocalizedMessage());
        }
    }

    /**
     * Close file write stream by ID
     *
     * @param streamId Stream ID
     * @param callback JS context callback
     */
    static void closeStream(String streamId, Callback callback) {
        try {
            ReactNativeBlobUtilStream fs = fileStreams.get(streamId);
            assert fs != null;
            OutputStream stream = fs.writeStreamInstance;
            fileStreams.remove(streamId);
            stream.close();
            callback.invoke();
        } catch (Exception err) {
            callback.invoke(err.getLocalizedMessage());
        }
    }

    /**
     * Private method for emit read stream event.
     *
     * @param streamName ID of the read stream
     * @param event      Event name, `data`, `end`, `error`, etc.
     * @param data       Event data
     */
    private void emitStreamEvent(String streamName, String event, String data) {
        WritableMap eventData = Arguments.createMap();
        eventData.putString("event", event);
        eventData.putString("detail", data);
        eventData.putString("streamId", streamName);
        this.emitter.emit(EVENT_FILESYSTEM, eventData);
    }

    // "event" always is "data"...
    private void emitStreamEvent(String streamName, String event, WritableArray data) {
        WritableMap eventData = Arguments.createMap();
        eventData.putString("event", event);
        eventData.putArray("detail", data);
        eventData.putString("streamId", streamName);
        this.emitter.emit(EVENT_FILESYSTEM, eventData);
    }

    // "event" always is "error"...
    private void emitStreamEvent(String streamName, String event, String code, String message) {
        WritableMap eventData = Arguments.createMap();
        eventData.putString("event", event);
        eventData.putString("code", code);
        eventData.putString("detail", message);
        eventData.putString("streamId", streamName);
        this.emitter.emit(EVENT_FILESYSTEM, eventData);
    }
}
