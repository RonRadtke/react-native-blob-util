package com.ReactNativeBlobUtil;

import android.os.Build;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.facebook.fbreact.specs.NativeBlobUtilsSpec;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReactMethod;

import java.util.HashMap;
import java.util.Map;

import javax.annotation.Nullable;

public class ReactNativeBlobUtil extends NativeBlobUtilsSpec {

    private final ReactNativeBlobUtilImpl delegate;

    public ReactNativeBlobUtil(ReactApplicationContext reactContext) {
        super(reactContext);
        delegate = new ReactNativeBlobUtilImpl(reactContext);
    }

    // Required for rn built in EventEmitter Calls.
    @ReactMethod
    public void addListener(String eventName) {

    }

    @ReactMethod
    public void removeListeners(double count) {

    }

    @Override
    protected Map<String, Object> getTypedExportedConstants() {
        Map<String, Object> res = new HashMap<>();
        res.putAll(ReactNativeBlobUtilFS.getSystemfolders(this.getReactApplicationContext()));
        res.putAll(ReactNativeBlobUtilFS.getLegacySystemfolders(this.getReactApplicationContext()));
        return res;
    }

    @NonNull
    @Override
    public String getName() {
        return ReactNativeBlobUtilImpl.NAME;
    }

    @Override
    public void fetchBlobForm(ReadableMap options, String taskId, String method, String url, ReadableMap headers, ReadableArray form, Callback callback) {
        delegate.fetchBlobForm(options, taskId, method, url, headers, form, callback);
    }

    @Override
    public void fetchBlob(ReadableMap options, String taskId, String method, String url, ReadableMap headers, String body, Callback callback) {
        delegate.fetchBlob(options, taskId, method, url, headers, body, callback);
    }

    @Override
    public void createFile(String path, String data, String encoding, Promise promise) {
        delegate.createFile(path, data, encoding, promise);
    }

    @Override
    public void createFileASCII(String path, ReadableArray data, Promise promise) {
        delegate.createFileASCII(path, data, promise);
    }


    @Override
    public void pathForAppGroup(String groupName, Promise promise) {
        // Not implemented as ReactNativeBlobUtil.pathForAppGroup only supports IOS
        // This will be rejected at the iOS layer
    }

    @Override
    public String syncPathAppGroup(String groupName) {
        // Not implemented as ReactNativeBlobUtil.syncPathAppGroup only supports IOS
        // This will be rejected at the iOS layer
        return null;
    }

    @Override
    public void exists(String path, Callback callback) {
        delegate.exists(path, callback);
    }

    @Override
    public void writeFile(String path, String encoding, String data, boolean transformFile, boolean append, Promise promise) {
        delegate.writeFile(path, encoding, data, transformFile, append, promise);
    }

    @Override
    public void writeFileArray(String path, ReadableArray data, boolean append, Promise promise) {
        delegate.writeFileArray(path, data, append, promise);
    }

    @Override
    public void writeStream(String path, String withEncoding, boolean appendData, Callback callback) {
        delegate.writeStream(path, withEncoding, appendData, callback);
    }

    @Override
    public void writeArrayChunk(String streamId, ReadableArray withArray, Callback callback) {
        delegate.writeArrayChunk(streamId, withArray, callback);
    }

    @Override
    public void writeChunk(String streamId, String withData, Callback callback) {
        delegate.writeChunk(streamId, withData, callback);
    }

    @Override
    public void closeStream(String streamId, Callback callback) {
        delegate.closeStream(streamId, callback);
    }

    @Override
    public void unlink(String path, Callback callback) {
        delegate.unlink(path, callback);
    }

    @Override
    public void removeSession(ReadableArray paths, Callback callback) {
        delegate.removeSession(paths, callback);
    }

    @Override
    public void ls(String path, Promise promise) {
        delegate.ls(path, promise);
    }

    @Override
    public void stat(String target, Callback callback) {
        delegate.stat(target, callback);
    }

    @Override
    public void lstat(String path, Callback callback) {
        delegate.lstat(path, callback);
    }

    @Override
    public void cp(String src, String dest, Callback callback) {
        delegate.cp(src, dest, callback);
    }

    @Override
    public void mv(String path, String dest, Callback callback) {
        delegate.mv(path, dest, callback);
    }

    @Override
    public void mkdir(String path, Promise promise) {
        delegate.mkdir(path, promise);
    }

    @Override
    public void readFile(String path, String encoding, boolean transformFile, Promise promise) {
        delegate.readFile(path, encoding, transformFile, promise);
    }

    @Override
    public void hash(String path, String algorithm, Promise promise) {
        delegate.hash(path, algorithm, promise);
    }

    @Override
    public void readStream(String path, String encoding, double bufferSize, double tick, String streamId) {
         delegate.readStream(path, encoding, (int) bufferSize, (int) tick, streamId);
    }

    @Override
    public void getEnvironmentDirs(Callback callback) {
        // Not implemented as ReactNativeBlobUtil.getEnvironmentDirs only supports IOS
    }

    @Override
    public void cancelRequest(String taskId, Callback callback) {
        delegate.cancelRequest(taskId, callback);
    }

    @Override
    public void enableProgressReport(String taskId, double interval, double count) {
        delegate.enableProgressReport(taskId, (int) interval, (int) count);
    }

    @Override
    public void enableUploadProgressReport(String taskId, double interval, double count) {
        delegate.enableUploadProgressReport(taskId, (int) interval, (int) count);
    }

    @Override
    public void slice(String src, String dest, double start, double end, Promise promise) {
       delegate.slice(src, dest, (long) start, (long) end, promise);
    }

    @Override
    public void presentOptionsMenu(String uri, String scheme, Promise promise) {
        // Not implemented as ReactNativeBlobUtil.presentOptionsMenu only supports IOS
        // This will be rejected at the iOS layer
    }

    @Override
    public void presentOpenInMenu(String uri, String scheme, Promise promise) {
        // Not implemented as ReactNativeBlobUtil.presentOpenInMenu only supports IOS
        // This will be rejected at the iOS layer
    }

    @Override
    public void presentPreview(String uri, String scheme, Promise promise) {
        // Not implemented as ReactNativeBlobUtil.presentPreview only supports IOS
        // This will be rejected at the iOS layer
    }

    @Override
    public void excludeFromBackupKey(String url, Promise promise) {
        // Not implemented as ReactNativeBlobUtil.excludeFromBackupKey only supports IOS
    }

    @Override
    public void df(Callback callback) {
        delegate.df(callback);
    }

    @Override
    public void emitExpiredEvent(Callback callback) {
        // Not implemented as ReactNativeBlobUtil.emitExpiredEvent only supports IOS
    }

    @Override
    public void actionViewIntent(String path, String mime, String chooserTitle, Promise promise) {
        delegate.actionViewIntent(path, mime, chooserTitle, promise);
    }

    @Override
    public void addCompleteDownload(ReadableMap config, Promise promise) {
        delegate.addCompleteDownload(config, promise);
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    @Override
    public void copyToInternal(String contentUri, String destpath, Promise promise) {
        delegate.copyToInternal(contentUri, destpath, promise);
    }

    @Override
    public void copyToMediaStore(ReadableMap filedata, String mt, String path, Promise promise) {
        delegate.copyToMediaStore(filedata, mt, path, promise);
    }

    @Override
    public void createMediaFile(ReadableMap filedata, String mt, Promise promise) {
        delegate.createMediaFile(filedata, mt, promise);
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    @Override
    public void getBlob(String contentUri, String encoding, Promise promise) {
        delegate.getBlob(contentUri, encoding, promise);
    }

    @Override
    public void getContentIntent(String mime, Promise promise) {
        delegate.getContentIntent(mime, promise);
    }

    @Override
    public void getSDCardDir(Promise promise) {
        delegate.getSDCardDir(promise);
    }

    @Override
    public void getSDCardApplicationDir(Promise promise) {
        delegate.getSDCardApplicationDir(promise);
    }

    @Override
    public void scanFile(final ReadableArray pairs, final Callback callback) {
        delegate.scanFile(pairs, callback);
    }

    @Override
    public void writeToMediaFile(String fileUri, String path, boolean transformFile, Promise promise) {
        delegate.writeToMediaFile(fileUri, path, transformFile, promise);
    }
}
