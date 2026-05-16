package com.ReactNativeBlobUtil.Response;

import androidx.annotation.NonNull;

import com.ReactNativeBlobUtil.ReactNativeBlobUtilConst;
import com.ReactNativeBlobUtil.ReactNativeBlobUtilProgressConfig;
import com.ReactNativeBlobUtil.ReactNativeBlobUtilReq;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

import okhttp3.MediaType;
import okhttp3.ResponseBody;
import okio.Buffer;
import okio.BufferedSource;
import okio.Okio;
import okio.Source;
import okio.Timeout;

/**
 * Created by wkh237 on 2016/7/11.
 */
public class ReactNativeBlobUtilFileResp extends ResponseBody {

    String mTaskId;
    ResponseBody originalBody;
    String mPath;
    long bytesDownloaded = 0;
    ReactApplicationContext rctContext;
    FileOutputStream ofStream;
    boolean isEndMarkerReceived;

    public ReactNativeBlobUtilFileResp(ResponseBody body) {
        super();
        this.originalBody = body;
    }

    public ReactNativeBlobUtilFileResp(ReactApplicationContext ctx, String taskId, ResponseBody body, String path, boolean overwrite) throws IOException {
        super();
        this.rctContext = ctx;
        this.mTaskId = taskId;
        this.originalBody = body;
        assert path != null;
        this.mPath = path;
        this.isEndMarkerReceived = false;
        if (path != null) {
            boolean appendToExistingFile = !overwrite;
            path = path.replace("?append=true", "");
            mPath = path;
            File f = prepareOutputFile(path);
            ofStream = new FileOutputStream(f, appendToExistingFile);
        }
    }

    private static File prepareOutputFile(String path) throws IOException {
        File file = new File(path).getCanonicalFile();
        File parent = file.getParentFile();

        if (parent == null) {
            throw new IOException("Invalid output path: " + path);
        }

        if (!parent.exists() && !parent.mkdirs() && !parent.exists()) {
            throw new IOException("Couldn't create dir: " + parent);
        }

        if (file.exists() && file.isDirectory()) {
            throw new IOException("Output path is a directory: " + file);
        }

        if (!file.exists() && !file.createNewFile() && !file.exists()) {
            throw new IOException("Couldn't create file: " + file);
        }

        return file;
    }

    @Override
    public MediaType contentType() {
        return originalBody.contentType();
    }

    @Override
    public long contentLength() {

        /**
         * 
         * Okio buffer issue in current version seems to be fixed in the latest versions
         * 
         * limiting this was causing the download progress to stop at 2GB size but files still was downloading
         * 
         */

        // if (originalBody.contentLength() > Integer.MAX_VALUE) {
            // This is a workaround for a bug Okio buffer where it can't handle larger than int.
            // return Integer.MAX_VALUE;
        // }
        return originalBody.contentLength();
    }

    public boolean isDownloadComplete() {
        return (bytesDownloaded == contentLength()) // Case of non-chunked downloads
                || (contentLength() == -1 && isEndMarkerReceived); // Case of chunked downloads
    }

    @Override
    public BufferedSource source() {
        ProgressReportingSource countable = new ProgressReportingSource();
        return Okio.buffer(countable);
    }

    private class ProgressReportingSource implements Source {
        @Override
        public long read(@NonNull Buffer sink, long byteCount) throws IOException {
            try {
                byte[] bytes = new byte[(int) byteCount];
                long read = originalBody.byteStream().read(bytes, 0, (int) byteCount);
                bytesDownloaded += read > 0 ? read : 0;
                if (read > 0) {
                    ofStream.write(bytes, 0, (int) read);
                } else if (contentLength() == -1 && read == -1) {
                    // End marker has been received for chunked download
                    isEndMarkerReceived = true;
                }
                ReactNativeBlobUtilProgressConfig reportConfig = ReactNativeBlobUtilReq.getReportProgress(mTaskId);

                if (contentLength() != 0) {

                    // For non-chunked download, progress is received / total
                    // For chunked download, progress can be either 0 (started) or 1 (ended)
                    float progress = (contentLength() != -1) ? bytesDownloaded / contentLength() : ((isEndMarkerReceived) ? 1 : 0);

                    if (reportConfig != null && reportConfig.shouldReport(progress /* progress */)) {
                        if (contentLength() != -1) {
                            // For non-chunked downloads
                            reportProgress(mTaskId, bytesDownloaded, contentLength());
                        } else {
                            // For chunked downloads
                            if (!isEndMarkerReceived) {
                                reportProgress(mTaskId, 0, contentLength());
                            } else {
                                reportProgress(mTaskId, bytesDownloaded, bytesDownloaded);
                            }
                        }
                    }

                }

                return read;
            } catch (IOException ex) {
                throw ex;
            } catch (Exception ex) {
                throw new IOException(ex);
            }
        }

        private void reportProgress(String taskId, long bytesDownloaded, long contentLength) {
            WritableMap args = Arguments.createMap();
            args.putString("taskId", taskId);
            args.putString("written", String.valueOf(bytesDownloaded));
            args.putString("total", String.valueOf(contentLength));
            rctContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(ReactNativeBlobUtilConst.EVENT_PROGRESS, args);
        }

        @Override
        public Timeout timeout() {
            return null;
        }

        @Override
        public void close() throws IOException {
            ofStream.close();

        }
    }

}
