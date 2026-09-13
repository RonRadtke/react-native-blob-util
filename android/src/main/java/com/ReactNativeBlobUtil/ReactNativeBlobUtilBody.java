package com.ReactNativeBlobUtil;

import android.net.Uri;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;

import okhttp3.MediaType;
import okhttp3.RequestBody;
import okio.BufferedSink;

class ReactNativeBlobUtilBody extends RequestBody {

    private long contentLength = 0;
    private ReadableArray form;
    private String mTaskId;
    private String rawBody;
    private ReactNativeBlobUtilReq.RequestType requestType;
    private MediaType mime;
    private File bodyCache;
    int reported = 0;
    private Boolean chunkedEncoding = false;

    ReactNativeBlobUtilBody(String taskId) {
        this.mTaskId = taskId;
    }

    ReactNativeBlobUtilBody chunkedEncoding(boolean val) {
        this.chunkedEncoding = val;
        return this;
    }

    ReactNativeBlobUtilBody setMIME(MediaType mime) {
        this.mime = mime;
        return this;
    }

    ReactNativeBlobUtilBody setRequestType(ReactNativeBlobUtilReq.RequestType type) {
        this.requestType = type;
        return this;
    }

    /**
     * Set request body
     *
     * @param body A string represents the request body
     * @return object itself
     */
    ReactNativeBlobUtilBody setBody(String body) {
        this.rawBody = body;
        if (rawBody == null) {
            this.rawBody = "";
            requestType = ReactNativeBlobUtilReq.RequestType.AsIs;
        }
        try {
            switch (requestType) {
                case SingleFile:
                    contentLength = getRequestStream().available();
                    break;
                case AsIs:
                    contentLength = this.rawBody.getBytes().length;
                    break;
                case Others:
                    break;
            }
        } catch (Exception ex) {
            ex.printStackTrace();
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create single content request body :" + ex.getLocalizedMessage() + "\r\n");
        }
        return this;
    }

    /**
     * Set request body (Array)
     *
     * @param body A Readable array contains form data
     * @return object itself
     */
    ReactNativeBlobUtilBody setBody(ReadableArray body) {
        this.form = body;
        try {
            bodyCache = createMultipartBodyCache();
            contentLength = bodyCache.length();
        } catch (Exception ex) {
            ex.printStackTrace();
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create request multipart body :" + ex.getLocalizedMessage());
        }
        return this;
    }

    // This organizes the input stream initialization logic into a method. This allows:
    // 1) Initialization to be deferred until it's needed (when we are ready to pipe it into the BufferedSink)
    // 2) The stream to be initialized and used as many times as necessary. When okhttp runs into
    //    a connection error, it will retry the request which will require a new stream to write into
    //    the sink once again.
    InputStream getInputStreamForRequestBody() {
        try {
            if (this.form != null) {
                return new FileInputStream(bodyCache);
            } else {
                switch (requestType) {
                    case SingleFile:
                        return getRequestStream();
                    case AsIs:
                        return new ByteArrayInputStream(this.rawBody.getBytes());
                    case Others:
                        ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil could not create input stream for request type others");
                        break;
                }
            }
        } catch (Exception ex){
            ex.printStackTrace();
            ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil failed to create input stream for request:" + ex.getLocalizedMessage());
        }

        return null;
    }

    @Override
    public long contentLength() {
        return chunkedEncoding ? -1 : contentLength;
    }

    @Override
    public MediaType contentType() {
        return mime;
    }

    @Override
    public void writeTo(@NonNull BufferedSink sink) {
        try {
            pipeStreamToSink(getInputStreamForRequestBody(), sink);
        } catch (Exception ex) {
            ReactNativeBlobUtilUtils.emitWarningEvent(ex.getLocalizedMessage());
            ex.printStackTrace();
        }
    }

    boolean clearRequestBody() {
        try {
            if (bodyCache != null && bodyCache.exists()) {
                bodyCache.delete();
            }
        } catch (Exception e) {
            ReactNativeBlobUtilUtils.emitWarningEvent(e.getLocalizedMessage());
            return false;
        }
        return true;
    }

    private InputStream getRequestStream() throws Exception {

        // upload from storage
        if (rawBody.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX)) {
            String orgPath = rawBody.substring(ReactNativeBlobUtilConst.FILE_PREFIX.length());
            orgPath = ReactNativeBlobUtilUtils.normalizePath(orgPath);
            // upload file from assets
            if (ReactNativeBlobUtilUtils.isAsset(orgPath)) {
                try {
                    String assetName = orgPath.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                    return ReactNativeBlobUtilImpl.RCTContext.getAssets().open(assetName);
                } catch (Exception e) {
                    throw new Exception("error when getting request stream from asset : " + e.getLocalizedMessage());
                }
            } else {
                File f = new File(ReactNativeBlobUtilUtils.normalizePath(orgPath));
                try {
                    if (!f.exists())
                        f.createNewFile();
                    return new FileInputStream(f);
                } catch (Exception e) {
                    throw new Exception("error when getting request stream: " + e.getLocalizedMessage());
                }
            }
        } else if (rawBody.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
            String contentURI = rawBody.substring(ReactNativeBlobUtilConst.CONTENT_PREFIX.length());
            try {
                return ReactNativeBlobUtilImpl.RCTContext.getContentResolver().openInputStream(Uri.parse(contentURI));
            } catch (Exception e) {
                throw new Exception("error when getting request stream for content URI: " + contentURI, e);
            }
        }
        // base 64 encoded
        else {
            try {
                byte[] bytes = Base64.decode(rawBody, 0);
                return new ByteArrayInputStream(bytes);
            } catch (Exception ex) {
                throw new Exception("error when getting request stream: " + ex.getLocalizedMessage());
            }
        }
    }

    /**
     * Create a temp file that contains content of multipart form data content
     *
     * @return The cache file object
     * @throws IOException .
     */
    private File createMultipartBodyCache() throws IOException {
        String boundary = "ReactNativeBlobUtil-" + mTaskId;

        File outputDir = ReactNativeBlobUtilImpl.RCTContext.getCacheDir(); // context being the Activity pointer
        File outputFile = File.createTempFile("rnfb-form-tmp", "", outputDir);
        FileOutputStream os = new FileOutputStream(outputFile);

        ArrayList<FormField> fields = countFormDataLength();
        ReactApplicationContext ctx = ReactNativeBlobUtilImpl.RCTContext;

        for (FormField field : fields) {
            String data = field.data;
            String name = field.name;
            // skip invalid fields
            if (name == null || data == null)
                continue;
            // form begin
            String header = "--" + boundary + "\r\n";
            if (field.filename != null) {
                header += "Content-Disposition: form-data; name=\"" + name + "\"; filename=\"" + field.filename + "\"\r\n";
                header += "Content-Type: " + field.mime + "\r\n\r\n";
                os.write(header.getBytes());
                // file field header end
                // upload from storage
                if (data.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX)) {
                    String orgPath = data.substring(ReactNativeBlobUtilConst.FILE_PREFIX.length());
                    orgPath = ReactNativeBlobUtilUtils.normalizePath(orgPath);
                    // path starts with content://
                    if (ReactNativeBlobUtilUtils.isAsset(orgPath)) {
                        try {
                            String assetName = orgPath.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                            InputStream in = ctx.getAssets().open(assetName);
                            pipeStreamToFileStream(in, os);
                        } catch (IOException e) {
                            ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data asset :" + orgPath + ", " + e.getLocalizedMessage());
                        }
                    }
                    // data from normal files
                    else {
                        File file = new File(ReactNativeBlobUtilUtils.normalizePath(orgPath));
                        if (file.exists()) {
                            FileInputStream fs = new FileInputStream(file);
                            pipeStreamToFileStream(fs, os);
                        } else {
                            ReactNativeBlobUtilUtils.emitWarningEvent("Failed to create form data from path :" + orgPath + ", file not exists.");
                        }
                    }
                } else if (data.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
                    String contentURI = data.substring(ReactNativeBlobUtilConst.CONTENT_PREFIX.length());
                    InputStream is = null;
                    try {
                        is = ctx.getContentResolver().openInputStream(Uri.parse(contentURI));
                        pipeStreamToFileStream(is, os);
                    } catch (Exception e) {
                        ReactNativeBlobUtilUtils.emitWarningEvent(
                                "Failed to create form data from content URI:" + contentURI + ", " + e.getLocalizedMessage());
                    } finally {
                        if (is != null) {
                            is.close();
                        }
                    }
                }
                // base64 embedded file content
                else {
                    byte[] b = Base64.decode(data, 0);
                    os.write(b);
                }

            }
            // data field
            else {
                header += "Content-Disposition: form-data; name=\"" + name + "\"\r\n";
                header += "Content-Type: " + field.mime + "\r\n\r\n";
                os.write(header.getBytes());
                byte[] fieldData = field.data.getBytes();
                os.write(fieldData);
            }
            // form end
            os.write("\r\n".getBytes());
        }
        // close the form
        byte[] end = ("--" + boundary + "--\r\n").getBytes();
        os.write(end);
        os.flush();
        os.close();
        return outputFile;
    }

    /**
     * Pipe input stream to request body output stream
     *
     * @param stream The input stream
     * @param sink   The request body buffer sink
     * @throws IOException .
     */
    private void pipeStreamToSink(InputStream stream, BufferedSink sink) throws IOException {
        byte[] chunk = new byte[10240];
        long totalWritten = 0;
        int read;
        while ((read = stream.read(chunk, 0, 10240)) > 0) {
            sink.write(chunk, 0, read);
            totalWritten += read;
            emitUploadProgress(totalWritten);
        }
        stream.close();
    }

    /**
     * Pipe input stream to a file
     *
     * @param is The input stream
     * @param os The output stream to a file
     * @throws IOException
     */
    private void pipeStreamToFileStream(InputStream is, FileOutputStream os) throws IOException {

        byte[] buf = new byte[10240];
        int len;
        while ((len = is.read(buf)) > 0) {
            os.write(buf, 0, len);
        }
        is.close();
    }

    /**
     * Compute approximate content length for form data
     *
     * @return ArrayList<FormField>
     */
    private ArrayList<FormField> countFormDataLength() throws IOException {
        long total = 0;
        ArrayList<FormField> list = new ArrayList<>();
        ReactApplicationContext ctx = ReactNativeBlobUtilImpl.RCTContext;
        for (int i = 0; i < form.size(); i++) {
            FormField field = new FormField(form.getMap(i));
            list.add(field);
            if (field.data == null) {
                ReactNativeBlobUtilUtils.emitWarningEvent("ReactNativeBlobUtil multipart request builder has found a field without `data` property, the field `" + field.name + "` will be removed implicitly.");
            } else if (field.filename != null) {
                String data = field.data;
                // upload from storage
                if (data.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX)) {
                    String orgPath = data.substring(ReactNativeBlobUtilConst.FILE_PREFIX.length());
                    orgPath = ReactNativeBlobUtilUtils.normalizePath(orgPath);
                    // path starts with asset://
                    if (ReactNativeBlobUtilUtils.isAsset(orgPath)) {
                        try {
                            String assetName = orgPath.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                            long length = ctx.getAssets().open(assetName).available();
                            total += length;
                        } catch (IOException e) {
                            ReactNativeBlobUtilUtils.emitWarningEvent(e.getLocalizedMessage());
                        }
                    }
                    // general files
                    else {
                        File file = new File(ReactNativeBlobUtilUtils.normalizePath(orgPath));
                        total += file.length();
                    }
                } else if (data.startsWith(ReactNativeBlobUtilConst.CONTENT_PREFIX)) {
                    String contentURI = data.substring(ReactNativeBlobUtilConst.CONTENT_PREFIX.length());
                    InputStream is = null;
                    try {
                        is = ctx.getContentResolver().openInputStream(Uri.parse(contentURI));
                        long length = is.available();
                        total += length;
                    } catch (Exception e) {
                        ReactNativeBlobUtilUtils.emitWarningEvent(
                                "Failed to estimate form data length from content URI:" + contentURI + ", " + e.getLocalizedMessage());
                    } finally {
                        if (is != null) {
                            is.close();
                        }
                    }
                }
                // base64 embedded file content
                else {
                    byte[] bytes = Base64.decode(data, 0);
                    total += bytes.length;
                }
            }
            // data field
            else {
                total += field.data.getBytes().length;
            }
        }
        contentLength = total;
        return list;
    }

    /**
     * Since ReadableMap could only be access once, we have to store the field into a map for
     * repeatedly access.
     */
    private class FormField {
        public String name;
        String filename;
        String mime;
        public String data;

        FormField(ReadableMap rawData) {
            if (rawData.hasKey("name"))
                name = rawData.getString("name");
            if (rawData.hasKey("filename"))
                filename = rawData.getString("filename");
            if (rawData.hasKey("type"))
                mime = rawData.getString("type");
            else {
                mime = filename == null ? "text/plain" : "application/octet-stream";
            }
            if (rawData.hasKey("data")) {
                data = rawData.getString("data");
            }
        }
    }

    /**
     * Emit progress event
     *
     * @param written Integer
     */
    private void emitUploadProgress(long written) {
        ReactNativeBlobUtilProgressConfig config = ReactNativeBlobUtilReq.getReportUploadProgress(mTaskId);
        if (config != null && contentLength != 0 && config.shouldReport((float) written / contentLength)) {
            WritableMap args = Arguments.createMap();
            args.putString("taskId", mTaskId);
            args.putDouble("written", (double) written);
            args.putDouble("total", (double) contentLength);

            // emit event to js context
            ReactNativeBlobUtilImpl.RCTContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(ReactNativeBlobUtilConst.EVENT_UPLOAD_PROGRESS, args);
        }
    }

}
