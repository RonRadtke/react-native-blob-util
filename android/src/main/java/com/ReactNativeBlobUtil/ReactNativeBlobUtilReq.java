package com.ReactNativeBlobUtil;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Message;
import android.util.Base64;
import android.webkit.CookieManager;

import androidx.annotation.NonNull;

import com.ReactNativeBlobUtil.Response.ReactNativeBlobUtilDefaultResp;
import com.ReactNativeBlobUtil.Response.ReactNativeBlobUtilFileResp;
import com.ReactNativeBlobUtil.Utils.Tls12SocketFactory;
import com.ReactNativeBlobUtil.ReactNativeBlobUtilFS;
import com.facebook.common.logging.FLog;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.ReadableMapKeySetIterator;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.Proxy;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.util.ArrayList;
import java.util.HashMap;

import java.util.UUID;

import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.SSLContext;

import okhttp3.Call;
import okhttp3.ConnectionPool;
import okhttp3.ConnectionSpec;
import okhttp3.Headers;
import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.TlsVersion;


public class ReactNativeBlobUtilReq extends BroadcastReceiver implements Runnable {

    enum RequestType {
        Form,
        SingleFile,
        AsIs,
        WithoutBody,
        Others
    }

    enum ResponseType {
        KeepInMemory,
        FileStorage
    }

    enum ResponseFormat {
        Auto,
        UTF8,
        BASE64
    }

    private boolean shouldTransformFile() {
        return this.options.transformFile &&
            // Can only process if it's written to a file
            (this.options.fileCache || this.options.path != null);
    }

    public static HashMap<String, Call> taskTable = new HashMap<>();
    public static HashMap<String, Long> androidDownloadManagerTaskTable = new HashMap<>();
    static HashMap<String, ReactNativeBlobUtilProgressConfig> progressReport = new HashMap<>();
    static HashMap<String, ReactNativeBlobUtilProgressConfig> uploadProgressReport = new HashMap<>();
    static ConnectionPool pool = new ConnectionPool();

    ReactNativeBlobUtilConfig options;
    String taskId;
    String method;
    String url;
    String rawRequestBody;
    String destPath;
    String customPath;
    ReadableArray rawRequestBodyArray;
    ReadableMap headers;
    Callback callback;
    long contentLength;
    long downloadManagerId;
    ReactNativeBlobUtilBody requestBody;
    RequestType requestType;
    ResponseType responseType;
    ResponseFormat responseFormat = ResponseFormat.Auto;
    WritableMap respInfo;
    boolean timeout = false;
    ArrayList<String> redirects = new ArrayList<>();
    OkHttpClient client;
    boolean callbackfired;

    public ReactNativeBlobUtilReq(ReadableMap options, String taskId, String method, String url, ReadableMap headers, String body, ReadableArray arrayBody, OkHttpClient client, final Callback callback) {
        this.method = method.toUpperCase(Locale.ROOT);
        this.options = new ReactNativeBlobUtilConfig(options);
        this.taskId = taskId;
        this.url = url;
        this.headers = headers;
        this.callback = callback;
        this.rawRequestBody = body;
        this.rawRequestBodyArray = arrayBody;
        this.client = client;
        this.callbackfired = false;

        // If transformFile is specified, we first want to get the response back in memory so we can
        // encrypt it wholesale and at that point, write it into the file storage.
        if((this.options.fileCache || this.options.path != null) && !this.shouldTransformFile())
            responseType = ResponseType.FileStorage;
        else
            responseType = ResponseType.KeepInMemory;


        if (body != null)
            requestType = RequestType.SingleFile;
        else if (arrayBody != null)
            requestType = RequestType.Form;
        else
            requestType = RequestType.WithoutBody;
    }

    public static void cancelTask(String taskId) {
        Call call = taskTable.get(taskId);
        if (call != null) {
            call.cancel();
            taskTable.remove(taskId);
        }

        if (androidDownloadManagerTaskTable.containsKey(taskId)) {
            long downloadManagerIdForTaskId = androidDownloadManagerTaskTable.get(taskId).longValue();
            Context appCtx = ReactNativeBlobUtilImpl.RCTContext.getApplicationContext();
            DownloadManager dm = (DownloadManager) appCtx.getSystemService(Context.DOWNLOAD_SERVICE);
            dm.remove(downloadManagerIdForTaskId);
        }
    }

    private void invoke_callback(Object... args) {
        if (this.callbackfired) return;
        this.callback.invoke(args);
        this.callbackfired = true;
    }

    private final int QUERY = 1314;
    private ScheduledExecutorService scheduledExecutorService = Executors.newScheduledThreadPool(1);
    private Future<?> future;
    private Handler mHandler = new Handler(new Handler.Callback() {
        public boolean handleMessage(Message msg) {
            switch (msg.what) {

                case QUERY:

                    Bundle data = msg.getData();
                    long id = data.getLong("downloadManagerId");
                    if (id == downloadManagerId) {

                        Context appCtx = ReactNativeBlobUtilImpl.RCTContext.getApplicationContext();

                        DownloadManager downloadManager = (DownloadManager) appCtx.getSystemService(Context.DOWNLOAD_SERVICE);

                        DownloadManager.Query query = new DownloadManager.Query();
                        query.setFilterById(downloadManagerId);

                        Cursor cursor = downloadManager.query(query);

                        if (cursor != null && cursor.moveToFirst()) {

                            long written = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));

                            long total = cursor.getLong(cursor.getColumnIndex(
                                    DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                            cursor.close();

                            ReactNativeBlobUtilProgressConfig reportConfig = getReportProgress(taskId);
                            float progress = (total > 0) ? written / total : 0;

                            if (reportConfig != null && reportConfig.shouldReport(progress /* progress */)) {
                                WritableMap args = Arguments.createMap();
                                args.putString("taskId", String.valueOf(taskId));
                                args.putString("written", String.valueOf(written));
                                args.putString("total", String.valueOf(total));
                                args.putString("chunk", "");
                                ReactNativeBlobUtilImpl.RCTContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                                        .emit(ReactNativeBlobUtilConst.EVENT_PROGRESS, args);

                            }

                            if (total == written) {
                                future.cancel(true);
                            }
                        }
                    }
            }
            return true;
        }
    });

    @Override
    public void run() {
        Context appCtx = ReactNativeBlobUtilImpl.RCTContext.getApplicationContext();
        // use download manager instead of default HTTP implementation
        if (options.addAndroidDownloads != null && options.addAndroidDownloads.hasKey("useDownloadManager")) {

            if (options.addAndroidDownloads.getBoolean("useDownloadManager")) {
                Uri uri = Uri.parse(url);
                DownloadManager.Request req = new DownloadManager.Request(uri);
                if (options.addAndroidDownloads.hasKey("notification") && options.addAndroidDownloads.getBoolean("notification")) {
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                } else {
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN);
                }
                if (options.addAndroidDownloads.hasKey("title")) {
                    req.setTitle(options.addAndroidDownloads.getString("title"));
                }
                if (options.addAndroidDownloads.hasKey("description")) {
                    req.setDescription(options.addAndroidDownloads.getString("description"));
                }
                if (options.addAndroidDownloads.hasKey("path")) {
                    String path = options.addAndroidDownloads.getString("path");
                    File f = new File(path);
                    File dir = f.getParentFile();

                if (!f.exists()) {
                    if (dir != null && !dir.exists()) {
                        if (!dir.mkdirs() && !dir.exists()) {
                            invoke_callback( "Failed to create parent directory of '" + path + "'", null, null);
                            return;
                        }
                    }
                }
                    req.setDestinationUri(Uri.parse("file://" + path));

                    customPath = path;
                }


                if (options.addAndroidDownloads.hasKey("storeLocal") && options.addAndroidDownloads.getBoolean("storeLocal")) {
                    String path = (String) ReactNativeBlobUtilFS.getSystemfolders(ReactNativeBlobUtilImpl.RCTContext).get("DownloadDir");
                    path = path + UUID.randomUUID().toString();

                    File f = new File(path);
                    File dir = f.getParentFile();
                    if (!f.exists()) {
                        if (dir != null && !dir.exists()) {
                            if (!dir.mkdirs() && !dir.exists()) {
                                invoke_callback( "Failed to create parent directory of '" + path + "'", null, null);
                                return;
                            }
                        }
                    }
                    req.setDestinationUri(Uri.parse("file://" + path));
                    customPath = path;
                }

                if (options.addAndroidDownloads.hasKey("mime")) {
                    req.setMimeType(options.addAndroidDownloads.getString("mime"));
                }

                if (options.addAndroidDownloads.hasKey("mediaScannable") && options.addAndroidDownloads.getBoolean("mediaScannable")) {
                    req.allowScanningByMediaScanner();
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && options.addAndroidDownloads.hasKey("storeInDownloads") && options.addAndroidDownloads.getBoolean("storeInDownloads")) {
                    String t = options.addAndroidDownloads.getString("title");
                    if(t == null || t.isEmpty())
                        t = UUID.randomUUID().toString();
                    if(this.options.appendExt != null && !this.options.appendExt.isEmpty())
                        t += "." + this.options.appendExt;

                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, t);
                }

                // set headers
                ReadableMapKeySetIterator it = headers.keySetIterator();
                while (it.hasNextKey()) {
                    String key = it.nextKey();
                    req.addRequestHeader(key, headers.getString(key));
                }

                // Attempt to add cookie, if it exists
                URL urlObj;
                try {
                    urlObj = new URL(url);
                    String baseUrl = urlObj.getProtocol() + "://" + urlObj.getHost();
                    String cookie = CookieManager.getInstance().getCookie(baseUrl);
                    req.addRequestHeader("Cookie", cookie);
                } catch (MalformedURLException e) {
                    e.printStackTrace();
                }

                DownloadManager dm = (DownloadManager) appCtx.getSystemService(Context.DOWNLOAD_SERVICE);
                downloadManagerId = dm.enqueue(req);
                androidDownloadManagerTaskTable.put(taskId, Long.valueOf(downloadManagerId));
                if(Build.VERSION.SDK_INT >= 34 ){
                    appCtx.registerReceiver(this, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), Context.RECEIVER_EXPORTED);
                }else{
                    appCtx.registerReceiver(this, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
                }
                future = scheduledExecutorService.scheduleAtFixedRate(new Runnable() {
                    @Override
                    public void run() {
                        Message msg = mHandler.obtainMessage();
                        Bundle data = new Bundle();
                        data.putLong("downloadManagerId", downloadManagerId);
                        msg.setData(data);
                        msg.what = QUERY;
                        mHandler.sendMessage(msg);
                    }
                }, 0, 100, TimeUnit.MILLISECONDS);
                return;
            }

        }

        // find cached result if `key` property exists
        String cacheKey = this.taskId;
        String ext = (this.options.appendExt == null || this.options.appendExt.isEmpty()) ? "" : "." + this.options.appendExt;

        if (this.options.key != null) {
            cacheKey = ReactNativeBlobUtilUtils.getMD5(this.options.key);
            if (cacheKey == null) {
                cacheKey = this.taskId;
            }

            File file = new File(ReactNativeBlobUtilFS.getTmpPath(cacheKey) + ext);

            if (file.exists()) {
                invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, file.getAbsolutePath());
                return;
            }
        }

        if (this.options.path != null)
            this.destPath = this.options.path;
        else if (this.options.fileCache)
            this.destPath = ReactNativeBlobUtilFS.getTmpPath(cacheKey) + ext;


        OkHttpClient.Builder clientBuilder;

        try {
            // use trusty SSL socket
            if (this.options.trusty) {
                clientBuilder = ReactNativeBlobUtilUtils.getUnsafeOkHttpClient(client);
            } else {
                clientBuilder = client.newBuilder();
            }

            // wifi only, need ACCESS_NETWORK_STATE permission
            // and API level >= 21
            if (this.options.wifiOnly) {

                boolean found = false;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    ConnectivityManager connectivityManager = (ConnectivityManager) ReactNativeBlobUtilImpl.RCTContext.getSystemService(ReactNativeBlobUtilImpl.RCTContext.CONNECTIVITY_SERVICE);
                    Network[] networks = connectivityManager.getAllNetworks();

                    for (Network network : networks) {

                        NetworkInfo netInfo = connectivityManager.getNetworkInfo(network);
                        NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);

                        if (caps == null || netInfo == null) {
                            continue;
                        }

                        if (!netInfo.isConnected()) {
                            continue;
                        }

                        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                            clientBuilder.proxy(Proxy.NO_PROXY);
                            clientBuilder.socketFactory(network.getSocketFactory());
                            found = true;
                            break;

                        }
                    }

                    if (!found) {
                        invoke_callback("No available WiFi connections.", null, null);
                        releaseTaskResource();
                        return;
                    }
                } else {
                    ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil: wifiOnly was set, but SDK < 21. wifiOnly was ignored.");
                }
            }

            final Request.Builder builder = new Request.Builder();
            try {
                builder.url(new URL(url));
            } catch (MalformedURLException e) {
                e.printStackTrace();
            }

            HashMap<String, String> mheaders = new HashMap<>();
            // set headers
            if (headers != null) {
                ReadableMapKeySetIterator it = headers.keySetIterator();
                while (it.hasNextKey()) {
                    String key = it.nextKey();
                    String value = headers.getString(key);
                    if (key.equalsIgnoreCase("RNFB-Response")) {
                        if (value.equalsIgnoreCase("base64"))
                            responseFormat = ResponseFormat.BASE64;
                        else if (value.equalsIgnoreCase("utf8"))
                            responseFormat = ResponseFormat.UTF8;
                    } else {
                        builder.header(key.toLowerCase(Locale.ROOT), value);
                        mheaders.put(key.toLowerCase(Locale.ROOT), value);
                    }
                }
            }

            if (method.equalsIgnoreCase("post") || method.equalsIgnoreCase("put") || method.equalsIgnoreCase("patch")) {
                String cType = getHeaderIgnoreCases(mheaders, "Content-Type").toLowerCase(Locale.ROOT);

                if (rawRequestBodyArray != null) {
                    requestType = RequestType.Form;
                } else if (cType == null || cType.isEmpty()) {
                    if (!cType.equalsIgnoreCase("")) {
                        builder.header("Content-Type", "application/octet-stream");
                    }
                    requestType = RequestType.SingleFile;
                }
                if (rawRequestBody != null) {
                    if (rawRequestBody.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX)
                            || rawRequestBody.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
                        requestType = RequestType.SingleFile;
                    } else if (cType.toLowerCase(Locale.ROOT).contains(";base64") || cType.toLowerCase(Locale.ROOT).startsWith("application/octet")) {
                        cType = cType.replace(";base64", "").replace(";BASE64", "");
                        if (mheaders.containsKey("content-type"))
                            mheaders.put("content-type", cType);
                        if (mheaders.containsKey("Content-Type"))
                            mheaders.put("Content-Type", cType);
                        requestType = RequestType.SingleFile;
                    } else {
                        requestType = RequestType.AsIs;
                    }
                }
            } else {
                requestType = RequestType.WithoutBody;
            }

            boolean isChunkedRequest = getHeaderIgnoreCases(mheaders, "Transfer-Encoding").equalsIgnoreCase("chunked");

            // set request body
            switch (requestType) {
                case SingleFile:
                    requestBody = new ReactNativeBlobUtilBody(taskId)
                            .chunkedEncoding(isChunkedRequest)
                            .setRequestType(requestType)
                            .setBody(rawRequestBody)
                            .setMIME(MediaType.parse(getHeaderIgnoreCases(mheaders, "content-type")));
                    builder.method(method, requestBody);
                    break;
                case AsIs:
                    requestBody = new ReactNativeBlobUtilBody(taskId)
                            .chunkedEncoding(isChunkedRequest)
                            .setRequestType(requestType)
                            .setBody(rawRequestBody)
                            .setMIME(MediaType.parse(getHeaderIgnoreCases(mheaders, "content-type")));
                    builder.method(method, requestBody);
                    break;
                case Form:
                    String boundary = "ReactNativeBlobUtil-" + taskId;
                    requestBody = new ReactNativeBlobUtilBody(taskId)
                            .chunkedEncoding(isChunkedRequest)
                            .setRequestType(requestType)
                            .setBody(rawRequestBodyArray)
                            .setMIME(MediaType.parse("multipart/form-data; boundary=" + boundary));
                    builder.method(method, requestBody);
                    break;

                case WithoutBody:
                    if (method.equalsIgnoreCase("post") || method.equalsIgnoreCase("put") || method.equalsIgnoreCase("patch")) {
                        builder.method(method, RequestBody.create(null, new byte[0]));
                    } else
                        builder.method(method, null);
                    break;
            }

            // #156 fix cookie issue
            final Request req = builder.build();
            clientBuilder.addNetworkInterceptor(new Interceptor() {
                @NonNull
                @Override
                public Response intercept(@NonNull Chain chain) throws IOException {
                    redirects.add(chain.request().url().toString());
                    return chain.proceed(chain.request());
                }
            });
            // Add request interceptor for upload progress event
            clientBuilder.addInterceptor(new Interceptor() {
                @NonNull
                @Override
                public Response intercept(@NonNull Chain chain) throws IOException {
                    Response originalResponse = null;
                    try {
                        originalResponse = chain.proceed(req);
                        ResponseBody extended;
                        switch (responseType) {
                            case KeepInMemory:
                                extended = new ReactNativeBlobUtilDefaultResp(
                                        ReactNativeBlobUtilImpl.RCTContext,
                                        taskId,
                                        originalResponse.body(),
                                        options.increment);
                                break;
                            case FileStorage:
                                extended = new ReactNativeBlobUtilFileResp(
                                        ReactNativeBlobUtilImpl.RCTContext,
                                        taskId,
                                        originalResponse.body(),
                                        destPath,
                                        options.overwrite);
                                break;
                            default:
                                extended = new ReactNativeBlobUtilDefaultResp(
                                        ReactNativeBlobUtilImpl.RCTContext,
                                        taskId,
                                        originalResponse.body(),
                                        options.increment);
                                break;
                        }
                        return originalResponse.newBuilder().body(extended).build();
                    } catch (SocketException e) {
                        timeout = true;
                        if (originalResponse != null) {
                            originalResponse.close();
                        }
                    } catch (SocketTimeoutException e) {
                        timeout = true;
                        if (originalResponse != null) {
                            originalResponse.close();
                        }
                        //ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil error when sending request : " + e.getLocalizedMessage());
                    } catch (Exception ex) {
                        if (originalResponse != null) {
                            originalResponse.close();
                        }
                    }

                    return chain.proceed(chain.request());
                }
            });


            if (options.timeout >= 0) {
                clientBuilder.connectTimeout(options.timeout, TimeUnit.MILLISECONDS);
                clientBuilder.readTimeout(options.timeout, TimeUnit.MILLISECONDS);
            }

            clientBuilder.connectionPool(pool);
            clientBuilder.retryOnConnectionFailure(false);
            clientBuilder.followRedirects(options.followRedirect);
            clientBuilder.followSslRedirects(options.followRedirect);
            clientBuilder.retryOnConnectionFailure(true);

            OkHttpClient client = enableTls12OnPreLollipop(clientBuilder).build();

            Call call = client.newCall(req);
            taskTable.put(taskId, call);
            call.enqueue(new okhttp3.Callback() {

                @Override
                public void onFailure(@NonNull Call call, @NonNull IOException e) {
                    cancelTask(taskId);
                    if (respInfo == null) {
                        respInfo = Arguments.createMap();
                    }

                    // check if this error caused by socket timeout
                    if (e.getClass().equals(SocketTimeoutException.class)) {
                        respInfo.putBoolean("timeout", true);
                        invoke_callback("The request timed out.", null, null);
                    } else
                        invoke_callback(e.getLocalizedMessage(), null, null);
                    releaseTaskResource();
                }

                @Override
                public void onResponse(@NonNull Call call, @NonNull Response response) throws IOException {
                    ReadableMap notifyConfig = options.addAndroidDownloads;
                    // Download manager settings
                    if (notifyConfig != null) {
                        String title = "", desc = "", mime = "text/plain";
                        boolean scannable = false, notification = false;
                        if (notifyConfig.hasKey("title"))
                            title = options.addAndroidDownloads.getString("title");
                        if (notifyConfig.hasKey("description"))
                            desc = notifyConfig.getString("description");
                        if (notifyConfig.hasKey("mime"))
                            mime = notifyConfig.getString("mime");
                        if (notifyConfig.hasKey("mediaScannable"))
                            scannable = notifyConfig.getBoolean("mediaScannable");
                        if (notifyConfig.hasKey("notification"))
                            notification = notifyConfig.getBoolean("notification");
                        DownloadManager dm = (DownloadManager) ReactNativeBlobUtilImpl.RCTContext.getSystemService(ReactNativeBlobUtilImpl.RCTContext.DOWNLOAD_SERVICE);
                        dm.addCompletedDownload(title, desc, scannable, mime, destPath, contentLength, notification);
                    }

                    done(response);
                }
            });


        } catch (Exception error) {
            error.printStackTrace();
            releaseTaskResource();
            invoke_callback("ReactNativeBlobUtil request error: " + error.getMessage() + error.getCause());
        }
    }

    /**
     * Remove cached information of the HTTP task
     */
    private void releaseTaskResource() {
        if (taskTable.containsKey(taskId))
            taskTable.remove(taskId);
        if (androidDownloadManagerTaskTable.containsKey(taskId))
            androidDownloadManagerTaskTable.remove(taskId);
        if (uploadProgressReport.containsKey(taskId))
            uploadProgressReport.remove(taskId);
        if (progressReport.containsKey(taskId))
            progressReport.remove(taskId);
        if (requestBody != null)
            requestBody.clearRequestBody();
    }

    /**
     * Send response data back to javascript context.
     *
     * @param resp OkHttp response object
     */
    private void done(Response resp) {
        boolean isBlobResp = isBlobResponse(resp);
        WritableMap respmap = getResponseInfo(resp,isBlobResp);
        emitStateEvent(respmap.copy());

        emitStateEvent(getResponseInfo(resp, isBlobResp));
        switch (responseType) {
            case KeepInMemory:
                try {
                    // For XMLHttpRequest, automatic response data storing strategy, when response
                    // data is considered as binary data, write it to file system
                    if (isBlobResp && options.auto) {
                        String dest = ReactNativeBlobUtilFS.getTmpPath(taskId);
                        InputStream ins = resp.body().byteStream();
                        FileOutputStream os = new FileOutputStream(new File(dest));
                        int read;
                        byte[] buffer = new byte[10240];
                        while ((read = ins.read(buffer)) != -1) {
                            os.write(buffer, 0, read);
                        }
                        ins.close();
                        os.flush();
                        os.close();
                        invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, dest, respmap.copy());
                    }
                    // response data directly pass to JS context as string.
                    else {
                        byte[] b = resp.body().bytes();
                        // If process file option is turned on, we first keep response in memory and then stream that content
                        // after processing
                        if (this.shouldTransformFile()) {
                            if (ReactNativeBlobUtilFileTransformer.sharedFileTransformer == null) {
                                throw new IllegalStateException("Write file with transform was specified but the shared file transformer is not set");
                            }
                            this.destPath = this.destPath.replace("?append=true", "");
                            File file = new File(this.destPath);
                            if (!file.exists()) {
                                file.createNewFile();
                            }
                            try (FileOutputStream fos = new FileOutputStream(file)) {
                                fos.write(ReactNativeBlobUtilFileTransformer.sharedFileTransformer.onWriteFile(b));
                            } catch (Exception e) {
                                invoke_callback("Error from file transformer:" + e.getLocalizedMessage(),  respmap.copy());
                                return;
                            }
                            invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, this.destPath, respmap.copy());
                            return;
                        }
                        if (responseFormat == ResponseFormat.BASE64) {
                            invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_BASE64, android.util.Base64.encodeToString(b, Base64.NO_WRAP), respmap.copy());
                            return;
                        }
                        try {
                            // Attempt to decode the incoming response data to determine whether it contains a valid UTF8 string
                            Charset charSet = Charset.forName("UTF-8");
                            CharsetDecoder decoder = charSet.newDecoder();
                            decoder.decode(ByteBuffer.wrap(b));
                            // If the data contains invalid characters the following lines will be skipped.
                            String utf8 = new String(b, charSet);
                            invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_UTF8, utf8);
                        }
                        // This usually means the data contains invalid unicode characters but still valid data,
                        // it's binary data, so send it as a normal string
                        catch (CharacterCodingException ignored) {
                            if (responseFormat == ResponseFormat.UTF8) {
                                String utf8 = new String(b);
                                invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_UTF8, utf8, respmap.copy());
                            } else {
                                invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_BASE64, android.util.Base64.encodeToString(b, Base64.NO_WRAP), respmap.copy());
                            }
                        }
                    }
                } catch (IOException e) {
                    invoke_callback("ReactNativeBlobUtil failed to encode response data to BASE64 string.", respmap.copy());
                }
                break;
            case FileStorage:
                ResponseBody responseBody = resp.body();

                try {
                    // In order to write response data to `destPath` we have to invoke this method.
                    // It uses customized response body which is able to report download progress
                    // and write response data to destination path.
                    responseBody.bytes();
                } catch (Exception ignored) {
//                    ignored.printStackTrace();
                }

                ReactNativeBlobUtilFileResp ReactNativeBlobUtilFileResp;

                try {
                    ReactNativeBlobUtilFileResp = (ReactNativeBlobUtilFileResp) responseBody;
                } catch (ClassCastException ex) {
                    // unexpected response type
                    if (responseBody != null) {
                        String responseBodyString = null;
                        try {
                            boolean isBufferDataExists = responseBody.source().buffer().size() > 0;
                            boolean isContentExists = responseBody.contentLength() > 0;
                            if (isBufferDataExists && isContentExists) {
                                responseBodyString = responseBody.string();
                            }
                        } catch (IOException exception) {
                            exception.printStackTrace();
                        }
                        invoke_callback("Unexpected FileStorage response file: " + responseBodyString,  respmap.copy());
                    } else {
                        invoke_callback("Unexpected FileStorage response with no file.",  respmap.copy());
                    }
                    return;
                }

                if (ReactNativeBlobUtilFileResp != null && !ReactNativeBlobUtilFileResp.isDownloadComplete()) {
                    invoke_callback("Download interrupted.", respmap.copy());
                } else {
                    this.destPath = this.destPath.replace("?append=true", "");
                    invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, this.destPath, respmap.copy());
                }

                break;
            default:
                try {
                    invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_UTF8, new String(resp.body().bytes(), "UTF-8"), respmap.copy());
                } catch (IOException e) {
                    invoke_callback("ReactNativeBlobUtil failed to encode response data to UTF8 string.", respmap.copy());
                }
                break;
        }
//        if(!resp.isSuccessful())
        resp.body().close();
        releaseTaskResource();
    }

    /**
     * Invoke this method to enable download progress reporting.
     *
     * @param taskId Task ID of the HTTP task.
     * @return Task ID of the target task
     */
    public static ReactNativeBlobUtilProgressConfig getReportProgress(String taskId) {
        if (!progressReport.containsKey(taskId)) return null;
        return progressReport.get(taskId);
    }

    /**
     * Invoke this method to enable download progress reporting.
     *
     * @param taskId Task ID of the HTTP task.
     * @return Task ID of the target task
     */
    public static ReactNativeBlobUtilProgressConfig getReportUploadProgress(String taskId) {
        if (!uploadProgressReport.containsKey(taskId)) return null;
        return uploadProgressReport.get(taskId);
    }

    /**
     * Create response information object, contains status code, headers, etc.
     *
     * @param resp       Response object
     * @param isBlobResp If the response is binary data
     * @return Get RCT bridge object contains response information.
     */
    private WritableMap getResponseInfo(Response resp, boolean isBlobResp) {
        WritableMap info = Arguments.createMap();
        info.putInt("status", resp.code());
        info.putString("state", "2");
        info.putString("taskId", this.taskId);
        info.putBoolean("timeout", timeout);
        WritableMap headers = Arguments.createMap();
        for (int i = 0; i < resp.headers().size(); i++) {
            headers.putString(resp.headers().name(i), resp.headers().value(i));
        }
        WritableArray redirectList = Arguments.createArray();
        for (String r : redirects) {
            redirectList.pushString(r);
        }
        info.putArray("redirects", redirectList);
        info.putMap("headers", headers);
        Headers h = resp.headers();
        if (isBlobResp) {
            info.putString("respType", "blob");
        } else if (getHeaderIgnoreCases(h, "content-type").equalsIgnoreCase("text/")) {
            info.putString("respType", "text");
        } else if (getHeaderIgnoreCases(h, "content-type").contains("application/json")) {
            info.putString("respType", "json");
        } else {
            info.putString("respType", "");
        }
        return info;
    }

    /**
     * Check if response data is binary data.
     *
     * @param resp OkHttp response.
     * @return If the response data contains binary bytes
     */
    private boolean isBlobResponse(Response resp) {
        Headers h = resp.headers();
        String ctype = getHeaderIgnoreCases(h, "Content-Type");
        boolean isText = !ctype.equalsIgnoreCase("text/");
        boolean isJSON = !ctype.equalsIgnoreCase("application/json");
        boolean isCustomBinary = false;
        if (options.binaryContentTypes != null) {
            for (int i = 0; i < options.binaryContentTypes.size(); i++) {
                if (ctype.toLowerCase(Locale.ROOT).contains(options.binaryContentTypes.getString(i).toLowerCase(Locale.ROOT))) {
                    isCustomBinary = true;
                    break;
                }
            }
        }
        return (!(isJSON || isText)) || isCustomBinary;
    }

    private String getHeaderIgnoreCases(Headers headers, String field) {
        String val = headers.get(field);
        if (val != null) return val;
        return headers.get(field.toLowerCase(Locale.ROOT)) == null ? "" : headers.get(field.toLowerCase(Locale.ROOT));
    }

    private String getHeaderIgnoreCases(HashMap<String, String> headers, String field) {
        String val = headers.get(field);
        if (val != null) return val;
        String lowerCasedValue = headers.get(field.toLowerCase(Locale.ROOT));
        return lowerCasedValue == null ? "" : lowerCasedValue;
    }

    private void emitStateEvent(WritableMap args) {
        ReactNativeBlobUtilImpl.RCTContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(ReactNativeBlobUtilConst.EVENT_HTTP_STATE, args);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(action)) {
            Context appCtx = ReactNativeBlobUtilImpl.RCTContext.getApplicationContext();
            long id = intent.getExtras().getLong(DownloadManager.EXTRA_DOWNLOAD_ID);
            if (id == this.downloadManagerId) {
                releaseTaskResource(); // remove task ID from task map

                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(downloadManagerId);
                DownloadManager dm = (DownloadManager) appCtx.getSystemService(Context.DOWNLOAD_SERVICE);
                dm.query(query);
                Cursor c = dm.query(query);
                if (c == null) {
                    this.invoke_callback("Download manager failed to download from  " + this.url + ". Query was unsuccessful ", null, null);
                    return;
                }

                String filePath = null;
                try {
                    // the file exists in media content database
                    if (c.moveToFirst()) {
                        int statusCode = c.getInt(c.getColumnIndex(DownloadManager.COLUMN_STATUS));
                        if (statusCode == DownloadManager.STATUS_FAILED) {
                            this.invoke_callback("Download manager failed to download from  " + this.url + ". Status Code = " + statusCode, null, null);
                            return;
                        }
                        String contentUri = c.getString(c.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI));
                        if (contentUri != null) {
                            Uri uri = Uri.parse(contentUri);
                            Cursor cursor = appCtx.getContentResolver().query(uri, new String[]{android.provider.MediaStore.Files.FileColumns.DATA}, null, null, null);
                            // use default destination of DownloadManager
                            if (cursor != null) {
                                cursor.moveToFirst();
                                filePath = cursor.getString(0);
                                cursor.close();
                            }
                        }
                    }
                } finally {
                    if (c != null) {
                        c.close();
                    }
                }

                // When the file is not found in media content database, check if custom path exists
                if (options.addAndroidDownloads.hasKey("path") || options.addAndroidDownloads.hasKey("storeLocal")) {
                    try {
                        String customDest = customPath;
                        boolean exists = new File(customDest).exists();
                        if (!exists)
                            throw new Exception("Download manager download failed, the file does not downloaded to destination.");
                        else
                            this.invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, customDest);

                    } catch (Exception ex) {
                        ex.printStackTrace();
                        this.invoke_callback(ex.getLocalizedMessage(), null);
                    }
                }
                else if(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && options.addAndroidDownloads.hasKey("storeInDownloads") && options.addAndroidDownloads.getBoolean("storeInDownloads")){
                    Uri downloadeduri = dm.getUriForDownloadedFile(downloadManagerId);
                    if(downloadeduri == null)
                        this.invoke_callback("Download manager could not resolve downloaded file uri.", ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, null);
                    else
                        this.invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, downloadeduri.toString());
                }
                else {
                    if (filePath == null)
                        this.invoke_callback("Download manager could not resolve downloaded file path.", ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, null);
                    else
                        this.invoke_callback(null, ReactNativeBlobUtilConst.RNFB_RESPONSE_PATH, filePath);
                }

            }
        }
    }

    public static OkHttpClient.Builder enableTls12OnPreLollipop(OkHttpClient.Builder client) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN && Build.VERSION.SDK_INT <= Build.VERSION_CODES.KITKAT) {
            try {
                // Code from https://github.com/square/okhttp/issues/2372#issuecomment-244807676
                SSLContext sc = SSLContext.getInstance("TLSv1.2");
                sc.init(null, null, null);
                client.sslSocketFactory(new Tls12SocketFactory(sc.getSocketFactory()));

                ConnectionSpec cs = new ConnectionSpec.Builder(ConnectionSpec.MODERN_TLS)
                        .tlsVersions(TlsVersion.TLS_1_2)
                        .build();

                List<ConnectionSpec> specs = new ArrayList<>();
                specs.add(cs);
                specs.add(ConnectionSpec.COMPATIBLE_TLS);
                specs.add(ConnectionSpec.CLEARTEXT);

                client.connectionSpecs(specs);
            } catch (Exception exc) {
                FLog.e("OkHttpTLSCompat", "Error while setting TLS 1.2", exc);
            }
        }

        return client;
    }
}
