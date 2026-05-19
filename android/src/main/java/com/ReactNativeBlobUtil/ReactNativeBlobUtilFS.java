package com.ReactNativeBlobUtil;

import android.content.res.AssetFileDescriptor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.AsyncTask;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.util.Base64;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Callback;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.EventDispatcher;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

class ReactNativeBlobUtilFS {

    private ReactApplicationContext mCtx;
    private DeviceEventManagerModule.RCTDeviceEventEmitter emitter;

    ReactNativeBlobUtilFS(ReactApplicationContext ctx) {
        this.mCtx = ctx;
        this.emitter = ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class);
    }

    /**
     * Write string with encoding to file (used for mediastore)
     *
     * @param path     Destination file path.
     * @param encoding Encoding of the string.
     * @param data     Array passed from JS context.
     */
    static boolean writeFile(String path, String encoding, String data, final boolean append) {
        try {
            int written;
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            File f = new File(path);
            File dir = f.getParentFile();
            if (!f.exists()) {
                if (dir != null && !dir.exists()) {
                    if (!dir.mkdirs() && !dir.exists()) {
                        return false;
                    }
                }
                if (!f.createNewFile()) {
                    return false;
                }
            }

            // write data from a file
            if (encoding.equalsIgnoreCase(ReactNativeBlobUtilConst.DATA_ENCODE_URI)) {
                String normalizedData = ReactNativeBlobUtilUtils.normalizePath(data);
                File src = new File(normalizedData);
                if (!src.exists()) {
                    return false;
                }
                byte[] buffer = new byte[10240];
                int read;
                written = 0;
                FileInputStream fin = null;
                FileOutputStream fout = null;
                try {
                    fin = new FileInputStream(src);
                    fout = new FileOutputStream(f, append);
                    while ((read = fin.read(buffer)) > 0) {
                        fout.write(buffer, 0, read);
                        written += read;
                    }
                } finally {
                    if (fin != null) {
                        fin.close();
                    }
                    if (fout != null) {
                        fout.close();
                    }
                }
            } else {
                byte[] bytes = ReactNativeBlobUtilUtils.stringToBytes(data, encoding);
                FileOutputStream fout = new FileOutputStream(f, append);
                try {
                    fout.write(bytes);
                    written = bytes.length;
                } finally {
                    fout.close();
                }
            }
            return true;
        } catch (FileNotFoundException e) {
            // According to https://docs.oracle.com/javase/7/docs/api/java/io/FileOutputStream.html
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Write string with encoding to file
     *
     * @param path     Destination file path.
     * @param encoding Encoding of the string.
     * @param data     Array passed from JS context.
     * @param promise  RCT Promise
     */
    static void writeFile(String path, String encoding, String data, final boolean transformFile, final boolean append, final Promise promise) {
        try {
            int written;
            File f = new File(path);
            File dir = f.getParentFile();
            if (!f.exists()) {
                if (dir != null && !dir.exists()) {
                    if (!dir.mkdirs() && !dir.exists()) {
                        promise.reject("EUNSPECIFIED", "Failed to create parent directory of '" + path + "'");
                        return;
                    }
                }
                if (!f.createNewFile()) {
                    promise.reject("ENOENT", "File '" + path + "' does not exist and could not be created");
                    return;
                }
            }

            // write data from a file
            if (encoding.equalsIgnoreCase(ReactNativeBlobUtilConst.DATA_ENCODE_URI)) {
                String normalizedData = ReactNativeBlobUtilUtils.normalizePath(data);
                File src = new File(normalizedData);
                if (!src.exists()) {
                    promise.reject("ENOENT", "No such file '" + path + "' " + "('" + normalizedData + "')");
                    return;
                }
                byte[] buffer = new byte[10240];
                int read;
                written = 0;
                FileInputStream fin = null;
                FileOutputStream fout = null;
                try {
                    fin = new FileInputStream(src);
                    fout = new FileOutputStream(f, append);
                    while ((read = fin.read(buffer)) > 0) {
                        fout.write(buffer, 0, read);
                        written += read;
                    }
                } finally {
                    if (fin != null) {
                        fin.close();
                    }
                    if (fout != null) {
                        fout.close();
                    }
                }
            } else {
                byte[] bytes = ReactNativeBlobUtilUtils.stringToBytes(data, encoding);
                if (transformFile) {
                    if (ReactNativeBlobUtilFileTransformer.sharedFileTransformer == null) {
                        throw new IllegalStateException("Write file with transform was specified but the shared file transformer is not set");
                    }
                    bytes = ReactNativeBlobUtilFileTransformer.sharedFileTransformer.onWriteFile(bytes);
                }
                FileOutputStream fout = new FileOutputStream(f, append);
                try {
                    fout.write(bytes);
                    written = bytes.length;
                } finally {
                    fout.close();
                }
            }
            promise.resolve(written);
        } catch (FileNotFoundException e) {
            // According to https://docs.oracle.com/javase/7/docs/api/java/io/FileOutputStream.html
            promise.reject("ENOENT", "File '" + path + "' does not exist and could not be created, or it is a directory");
        } catch (Exception e) {
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
        }
    }

    /**
     * Write array of bytes into file
     *
     * @param path    Destination file path.
     * @param data    Array passed from JS context.
     * @param promise RCT Promise
     */
    static void writeFile(String path, ReadableArray data, final boolean append, final Promise promise) {
        try {
            File f = new File(path);
            File dir = f.getParentFile();

            if (!f.exists()) {
                if (dir != null && !dir.exists()) {
                    if (!dir.mkdirs() && !dir.exists()) {
                        promise.reject("ENOTDIR", "Failed to create parent directory of '" + path + "'");
                        return;
                    }
                }
                if (!f.createNewFile()) {
                    promise.reject("ENOENT", "File '" + path + "' does not exist and could not be created");
                    return;
                }
            }

            FileOutputStream os = new FileOutputStream(f, append);
            try {
                byte[] bytes = new byte[data.size()];
                for (int i = 0; i < data.size(); i++) {
                    bytes[i] = (byte) data.getInt(i);
                }
                os.write(bytes);
            } finally {
                os.close();
            }
            promise.resolve(data.size());
        } catch (FileNotFoundException e) {
            // According to https://docs.oracle.com/javase/7/docs/api/java/io/FileOutputStream.html
            promise.reject("ENOENT", "File '" + path + "' does not exist and could not be created");
        } catch (Exception e) {
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
        }
    }

    /**
     * Read file with a buffer that has the same size as the target file.
     *
     * @param path     Path of the file.
     * @param encoding Encoding of read stream.
     * @param promise  JS promise
     */
    static void readFile(String path, String encoding, final boolean transformFile, final Promise promise) {
        String resolved = ReactNativeBlobUtilUtils.normalizePath(path);
        if (resolved != null)
            path = resolved;
        try {
            byte[] bytes;

            if (resolved != null && resolved.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
                String assetName = path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                try (InputStream in = ReactNativeBlobUtilImpl.RCTContext.getAssets().open(assetName)) {
                    bytes = readBytesWithLimit(in);
                }
            }
            // issue 287
            else if (resolved == null) {
                try (InputStream in = ReactNativeBlobUtilImpl.RCTContext.getContentResolver().openInputStream(Uri.parse(path))) {
                    if (in == null) {
                        promise.reject("ENOENT", "No such file '" + path + "'");
                        return;
                    }
                    bytes = readBytesWithLimit(in);
                }
            } else {
                File f = new File(path);
                try (FileInputStream in = new FileInputStream(f)) {
                    bytes = readBytesWithLimit(in);
                }
            }

            if (transformFile) {
                if (ReactNativeBlobUtilFileTransformer.sharedFileTransformer == null) {
                    throw new IllegalStateException("Read file with transform was specified but the shared file transformer is not set");
                }
                bytes = ReactNativeBlobUtilFileTransformer.sharedFileTransformer.onReadFile(bytes);
            }

            switch (encoding.toLowerCase(Locale.ROOT)) {
                case "base64":
                    promise.resolve(Base64.encodeToString(bytes, Base64.NO_WRAP));
                    break;
                case "ascii":
                    WritableArray asciiResult = Arguments.createArray();
                    for (byte b : bytes) {
                        asciiResult.pushInt((int) b);
                    }
                    promise.resolve(asciiResult);
                    break;
                case "utf8":
                    promise.resolve(new String(bytes));
                    break;
                default:
                    promise.resolve(new String(bytes));
                    break;
            }
        } catch (FileNotFoundException err) {
            String msg = err.getLocalizedMessage();
            if (msg.contains("EISDIR")) {
                promise.reject("EISDIR", "Expecting a file but '" + path + "' is a directory; " + msg);
            } else {
                promise.reject("ENOENT", "No such file '" + path + "'; " + msg);
            }
        } catch (Exception err) {
            promise.reject("EUNSPECIFIED", err.getLocalizedMessage());
        }

    }

    private static byte[] readBytesWithLimit(InputStream in) throws IOException {
        byte[] buffer = new byte[10240];
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        int read;

        while ((read = in.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }

        return output.toByteArray();
    }

    /**
     * Static method that returns system folders to JS context
     *
     * @param ctx React Native application context
     */
    static Map<String, Object> getSystemfolders(ReactApplicationContext ctx) {
        Map<String, Object> res = new HashMap<>();

        res.put("DocumentDir", getFilesDirPath(ctx));
        res.put("CacheDir", getCacheDirPath(ctx));
        res.put("DCIMDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_DCIM));
        res.put("PictureDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_PICTURES));
        res.put("MusicDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_MUSIC));
        res.put("DownloadDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_DOWNLOADS));
        res.put("MovieDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_MOVIES));
        res.put("RingtoneDir", getExternalFilesDirPath(ctx, Environment.DIRECTORY_RINGTONES));

        String state = Environment.getExternalStorageState();
        if (state.equals(Environment.MEDIA_MOUNTED)) {
            res.put("SDCardDir", getExternalFilesDirPath(ctx, null));

            File externalDirectory = ctx.getExternalFilesDir(null);

            if (externalDirectory != null && externalDirectory.getParentFile() != null) {
                res.put("SDCardApplicationDir", externalDirectory.getParentFile().getAbsolutePath());
            } else {
                res.put("SDCardApplicationDir", "");
            }
        } else {
            res.put("SDCardDir", "");
            res.put("SDCardApplicationDir", "");
        }

        res.put("MainBundleDir", ctx.getApplicationInfo().dataDir);

        // TODO Change me with the correct path
        res.put("LibraryDir", "");
        res.put("ApplicationSupportDir", "");

        return res;
    }

    /**
     * Static method that returns legacy system folders to JS context (usage of deprecated functions since these retunr different folders)
     *
     * @param ctx React Native application context
     */

    @NonNull
    @SuppressWarnings("deprecation")
    static Map<String, Object> getLegacySystemfolders(ReactApplicationContext ctx) {
        Map<String, Object> res = new HashMap<>();

        res.put("LegacyDCIMDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM).getAbsolutePath());
        res.put("LegacyPictureDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES).getAbsolutePath());
        res.put("LegacyMusicDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC).getAbsolutePath());
        res.put("LegacyDownloadDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath());
        res.put("LegacyMovieDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES).getAbsolutePath());
        res.put("LegacyRingtoneDir", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_RINGTONES).getAbsolutePath());

        String state = Environment.getExternalStorageState();
        if (state.equals(Environment.MEDIA_MOUNTED)) {
            res.put("LegacySDCardDir", Environment.getExternalStorageDirectory().getAbsolutePath());
        } else {
            res.put("LegacySDCardDir", "");
        }

        return res;
    }

    static String getExternalFilesDirPath(ReactApplicationContext ctx, String type) {
        File dir = ctx.getExternalFilesDir(type);
        if (dir != null) return dir.getAbsolutePath();
        return "";
    }

    static String getFilesDirPath(ReactApplicationContext ctx) {
        File dir = ctx.getFilesDir();
        if (dir != null) return dir.getAbsolutePath();
        return "";
    }

    static String getCacheDirPath(ReactApplicationContext ctx) {
        File dir = ctx.getCacheDir();
        if (dir != null) return dir.getAbsolutePath();
        return "";
    }

    static public void getSDCardDir(ReactApplicationContext ctx, Promise promise) {
        if (Environment.getExternalStorageState().equals(Environment.MEDIA_MOUNTED)) {
            try {
                final String path = ctx.getExternalFilesDir(null).getAbsolutePath();
                promise.resolve(path);
            } catch (Exception e) {
                promise.reject("ReactNativeBlobUtil.getSDCardDir", e.getLocalizedMessage());
            }
        } else {
            promise.reject("ReactNativeBlobUtil.getSDCardDir", "External storage not mounted");
        }

    }

    static public void getSDCardApplicationDir(ReactApplicationContext ctx, Promise promise) {
        if (Environment.getExternalStorageState().equals(Environment.MEDIA_MOUNTED)) {
            try {
                final String path = ctx.getExternalFilesDir(null).getParentFile().getAbsolutePath();
                promise.resolve(path);
            } catch (Exception e) {
                promise.reject("ReactNativeBlobUtil.getSDCardApplicationDir", e.getLocalizedMessage());
            }
        } else {
            promise.reject("ReactNativeBlobUtil.getSDCardApplicationDir", "External storage not mounted");
        }
    }

    /**
     * Static method that returns a temp file path
     *
     * @param taskId An unique string for identify
     * @return String
     */
    static String getTmpPath(String taskId) {
        return ReactNativeBlobUtilImpl.RCTContext.getFilesDir() + "/ReactNativeBlobUtilTmp_" + taskId;
    }


    /**
     * Unlink file at path
     *
     * @param path     Path of target
     * @param callback JS context callback
     */
    static void unlink(String path, Callback callback) {
        try {
            String normalizedPath = ReactNativeBlobUtilUtils.normalizePath(path);
            ReactNativeBlobUtilFS.deleteRecursive(new File(normalizedPath));
            callback.invoke(null, true);
        } catch (Exception err) {
            callback.invoke(err.getLocalizedMessage(), false);
        }
    }

    private static void deleteRecursive(File fileOrDirectory) throws IOException {
        if (fileOrDirectory.isDirectory()) {
            File[] files = fileOrDirectory.listFiles();
            if (files == null) {
                throw new NullPointerException("Received null trying to list files of directory '" + fileOrDirectory + "'");
            } else {
                for (File child : files) {
                    deleteRecursive(child);
                }
            }
        }
        boolean result = fileOrDirectory.delete();
        if (!result) {
            throw new IOException("Failed to delete '" + fileOrDirectory + "'");
        }
    }

    /**
     * Make a folder
     *
     * @param path    Source path
     * @param promise JS promise
     */
    static void mkdir(String path, Promise promise) {
        path = ReactNativeBlobUtilUtils.normalizePath(path);
        File dest = new File(path);
        if (dest.exists()) {
            promise.reject("EEXIST", (dest.isDirectory() ? "Folder" : "File") + " '" + path + "' already exists");
            return;
        }
        try {
            boolean result = dest.mkdirs();
            if (!result) {
                promise.reject("EUNSPECIFIED", "mkdir failed to create some or all directories in '" + path + "'");
                return;
            }
        } catch (Exception e) {
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
            return;
        }
        promise.resolve(true);
    }

    /**
     * Copy file to destination path
     *
     * @param path     Source path
     * @param dest     Target path
     * @param callback JS context callback
     */
    static void cp(String path, String dest, Callback callback) {
        dest = ReactNativeBlobUtilUtils.normalizePath(dest);
        InputStream in = null;
        OutputStream out = null;
        String message = "";

        try {
            in = inputStreamFromPath(path);
            if (in == null) {
                callback.invoke("Source file at path`" + path + "` does not exist or can not be opened");
                return;
            }
            if (!new File(dest).exists()) {
                boolean result = new File(dest).createNewFile();
                if (!result) {
                    callback.invoke("Destination file at '" + dest + "' already exists");
                    return;
                }
            }

            out = new FileOutputStream(dest);

            byte[] buf = new byte[10240];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
        } catch (Exception err) {
            message += err.getLocalizedMessage();
        } finally {
            try {
                if (in != null) {
                    in.close();
                }
                if (out != null) {
                    out.close();
                }
            } catch (Exception e) {
                message += e.getLocalizedMessage();
            }
        }
        // Only call the callback once to prevent the app from crashing
        // with an 'Illegal callback invocation from native module' exception.
        if (message != "") {
            callback.invoke(message);
        } else {
            callback.invoke();
        }
    }

    /**
     * Move file
     *
     * @param path     Source file path
     * @param dest     Destination file path
     * @param callback JS context callback
     */
    static void mv(String path, String dest, Callback callback) {
        path = ReactNativeBlobUtilUtils.normalizePath(path);
        dest = ReactNativeBlobUtilUtils.normalizePath(dest);
        File src = new File(path);
        if (!src.exists()) {
            callback.invoke("Source file at path `" + path + "` does not exist");
            return;
        }

        try {
            // mv should fail if the destination directory does not exist.
            File destFile = new File(dest);
            File parentDir = destFile.getParentFile();
            if (parentDir != null && !parentDir.exists()) {
                callback.invoke("mv failed because the destination directory doesn't exist");
                return;
            }
            // mv overwrites files, so delete any existing file.
            if (destFile.exists()) {
                destFile.delete();
            }
            // mv by renaming the file.
            boolean result = src.renameTo(destFile);
            if (!result) {
                callback.invoke("mv failed for unknown reasons");
                return;
            }
        } catch (Exception e) {
            callback.invoke(e.toString());
            return;
        }

        callback.invoke();
    }

    /**
     * Check if the path exists, also check if it is a folder when exists.
     *
     * @param path     Path to check
     * @param callback JS context callback
     */
    static void exists(String path, Callback callback) {
        if (isAsset(path)) {
            try {
                String filename = path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                com.ReactNativeBlobUtil.ReactNativeBlobUtilImpl.RCTContext.getAssets().openFd(filename);
                callback.invoke(true, false);
            } catch (IOException e) {
                callback.invoke(false, false);
            }
        } else {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            if (path != null) {
                boolean exist = new File(path).exists();
                boolean isDir = new File(path).isDirectory();
                callback.invoke(exist, isDir);
            } else {
                callback.invoke(false, false);
            }
        }
    }

    /**
     * List content of folder
     *
     * @param path    Target folder
     * @param promise JS context promise
     */
    static void ls(String path, Promise promise) {
        try {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            File src = new File(path);
            if (!src.exists()) {
                promise.reject("ENOENT", "No such file '" + path + "'");
                return;
            }
            if (!src.isDirectory()) {
                promise.reject("ENOTDIR", "Not a directory '" + path + "'");
                return;
            }
            String[] files = new File(path).list();
            WritableArray arg = Arguments.createArray();
            // File => list(): "If this abstract pathname does not denote a directory, then this method returns null."
            // We excluded that possibility above - ignore the "can produce NullPointerException" warning of the IDE.
            for (String i : files) {
                arg.pushString(i);
            }
            promise.resolve(arg);
        } catch (Exception e) {
            e.printStackTrace();
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
        }
    }

    /**
     * Create a file by slicing given file path
     *
     * @param path   Source file path
     * @param dest   Destination of created file
     * @param start  Start byte offset in source file
     * @param end    End byte offset
     * @param encode NOT IMPLEMENTED
     */
    static void slice(String path, String dest, long start, long end, String encode, Promise promise) {
        try {
            dest = ReactNativeBlobUtilUtils.normalizePath(dest);

            if (!path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_CONTENT)) {
                File file = new File(ReactNativeBlobUtilUtils.normalizePath(path));
                if (file.isDirectory()) {
                    promise.reject("EISDIR", "Expecting a file but '" + path + "' is a directory");
                    return;
                }
            }

            InputStream in = inputStreamFromPath(path);
            if (in == null) {
                promise.reject("ENOENT", "No such file '" + path + "'");
                return;
            }
            FileOutputStream out = new FileOutputStream(new File(dest));
            long skipped = in.skip(start);
            if (skipped != start) {
                promise.reject("EUNSPECIFIED", "Skipped " + skipped + " instead of the specified " + start + " bytes");
                return;
            }
            byte[] buffer = new byte[10240];
            int remain = (int) (end - start);
            while (remain > 0) {
                int read = in.read(buffer, 0, 10240);
                if (read <= 0) {
                    break;
                }
                out.write(buffer, 0, (int) Math.min(remain, read));
                remain -= read;
            }
            in.close();
            out.flush();
            out.close();
            promise.resolve(dest);
        } catch (Exception e) {
            e.printStackTrace();
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
        }
    }

    static void lstat(String path, final Callback callback) {
        path = ReactNativeBlobUtilUtils.normalizePath(path);

        new AsyncTask<String, Integer, Integer>() {
            @Override
            protected Integer doInBackground(String... args) {
                WritableArray res = Arguments.createArray();
                if (args[0] == null) {
                    callback.invoke("the path specified for lstat is either `null` or `undefined`.");
                    return 0;
                }
                File src = new File(args[0]);
                if (!src.exists()) {
                    callback.invoke("failed to lstat path `" + args[0] + "` because it does not exist or it is not a folder");
                    return 0;
                }
                if (src.isDirectory()) {
                    String[] files = src.list();
                    // File => list(): "If this abstract pathname does not denote a directory, then this method returns null."
                    // We excluded that possibility above - ignore the "can produce NullPointerException" warning of the IDE.
                    for (String p : files) {
                        res.pushMap(statFile(src.getPath() + "/" + p));
                    }
                } else {
                    res.pushMap(statFile(src.getAbsolutePath()));
                }
                callback.invoke(null, res);
                return 0;
            }
        }.execute(path);
    }

    /**
     * show status of a file or directory
     *
     * @param path     Path
     * @param callback Callback
     */
    static void stat(String path, Callback callback) {
        try {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            WritableMap result = statFile(path);
            if (result == null)
                callback.invoke("failed to stat path `" + path + "` because it does not exist or it is not a folder", null);
            else
                callback.invoke(null, result);
        } catch (Exception err) {
            callback.invoke(err.getLocalizedMessage());
        }
    }

    /**
     * Basic stat method
     *
     * @param path Path
     * @return Stat  Result of a file or path
     */
    static WritableMap statFile(String path) {
        try {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            WritableMap stat = Arguments.createMap();
            if (isAsset(path)) {
                String name = path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, "");
                AssetFileDescriptor fd = ReactNativeBlobUtilImpl.RCTContext.getAssets().openFd(name);
                stat.putString("filename", name);
                stat.putString("path", path);
                stat.putString("type", "asset");
                stat.putString("size", String.valueOf(fd.getLength()));
                stat.putInt("lastModified", 0);
            } else {
                File target = new File(path);
                if (!target.exists()) {
                    return null;
                }
                stat.putString("filename", target.getName());
                stat.putString("path", target.getPath());
                stat.putString("type", target.isDirectory() ? "directory" : "file");
                stat.putString("size", String.valueOf(target.length()));
                String lastModified = String.valueOf(target.lastModified());
                stat.putString("lastModified", lastModified);

            }
            return stat;
        } catch (Exception err) {
            return null;
        }
    }

    /**
     * Media scanner scan file
     *
     * @param path     Path to file
     * @param mimes    Array of MIME type strings
     * @param callback Callback for results
     */
    void scanFile(String[] path, String[] mimes, final Callback callback) {
        try {
            MediaScannerConnection.scanFile(mCtx, path, mimes, new MediaScannerConnection.OnScanCompletedListener() {
                @Override
                public void onScanCompleted(String s, Uri uri) {
                    callback.invoke(null, true);
                }
            });
        } catch (Exception err) {
            callback.invoke(err.getLocalizedMessage(), null);
        }
    }

    static void hash(String path, String algorithm, Promise promise) {
        try {
            Map<String, String> algorithms = new HashMap<>();

            algorithms.put("md5", "MD5");
            algorithms.put("sha1", "SHA-1");
            algorithms.put("sha224", "SHA-224");
            algorithms.put("sha256", "SHA-256");
            algorithms.put("sha384", "SHA-384");
            algorithms.put("sha512", "SHA-512");

            if (!algorithms.containsKey(algorithm)) {
                promise.reject("EINVAL", "Invalid algorithm '" + algorithm + "', must be one of md5, sha1, sha224, sha256, sha384, sha512");
                return;
            }

            if (!path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_CONTENT)) {
                File file = new File(ReactNativeBlobUtilUtils.normalizePath(path));
                if (file.isDirectory()) {
                    promise.reject("EISDIR", "Expecting a file but '" + path + "' is a directory");
                    return;
                }
            }

            MessageDigest md = MessageDigest.getInstance(algorithms.get(algorithm));

            InputStream inputStream = inputStreamFromPath(path);
            if (inputStream == null) {
                promise.reject("ENOENT", "No such file '" + path + "'");
                return;
            }
            int chunkSize = 4096 * 256; // 1Mb
            byte[] buffer = new byte[chunkSize];

            int bytesRead;
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                md.update(buffer, 0, bytesRead);
            }

            StringBuilder hexString = new StringBuilder();
            for (byte digestByte : md.digest())
                hexString.append(String.format("%02x", digestByte));

            promise.resolve(hexString.toString());
        } catch (Exception e) {
            e.printStackTrace();
            promise.reject("EUNSPECIFIED", e.getLocalizedMessage());
        }
    }

    /**
     * Create new file at path
     *
     * @param path     The destination path of the new file.
     * @param data     Initial data of the new file.
     * @param encoding Encoding of initial data.
     * @param promise  Promise for Javascript
     */
    static void createFile(String path, String data, String encoding, Promise promise) {
        try {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            File dest = new File(path);
            boolean created = dest.createNewFile();
            if (encoding.equals(ReactNativeBlobUtilConst.DATA_ENCODE_URI)) {
                String orgPath = data.replace(ReactNativeBlobUtilConst.FILE_PREFIX, "");
                File src = new File(orgPath);
                if (!src.exists()) {
                    promise.reject("ENOENT", "Source file : " + data + " does not exist");
                    return;
                }
                FileInputStream fin = new FileInputStream(src);
                OutputStream ostream = new FileOutputStream(dest);
                byte[] buffer = new byte[10240];
                int read = fin.read(buffer);
                while (read > 0) {
                    ostream.write(buffer, 0, read);
                    read = fin.read(buffer);
                }
                fin.close();
                ostream.close();
            } else {
                if (!created) {
                    promise.reject("EEXIST", "File `" + path + "` already exists");
                    return;
                }
                OutputStream ostream = new FileOutputStream(dest);
                ostream.write(ReactNativeBlobUtilUtils.stringToBytes(data, encoding));
            }
            promise.resolve(path);
        } catch (Exception err) {
            promise.reject("EUNSPECIFIED", err.getLocalizedMessage());
        }
    }

    /**
     * Create file for ASCII encoding
     *
     * @param path    Path of new file.
     * @param data    Content of new file
     * @param promise JS Promise
     */
    static void createFileASCII(String path, ReadableArray data, Promise promise) {
        try {
            path = ReactNativeBlobUtilUtils.normalizePath(path);
            File dest = new File(path);
            boolean created = dest.createNewFile();
            if (!created) {
                promise.reject("EEXIST", "File at path `" + path + "` already exists");
                return;
            }
            OutputStream ostream = new FileOutputStream(dest);
            byte[] chunk = new byte[data.size()];
            for (int i = 0; i < data.size(); i++) {
                chunk[i] = (byte) data.getInt(i);
            }
            ostream.write(chunk);
            promise.resolve(path);
        } catch (Exception err) {
            promise.reject("EUNSPECIFIED", err.getLocalizedMessage());
        }
    }

    static void df(Callback callback, ReactApplicationContext ctx) {
        StatFs stat = new StatFs(ctx.getFilesDir().getPath());
        WritableMap args = Arguments.createMap();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR2) {
            args.putString("internal_free", String.valueOf(stat.getFreeBytes()));
            args.putString("internal_total", String.valueOf(stat.getTotalBytes()));
            File dir = ctx.getExternalFilesDir(null);
            if (dir != null) {
                StatFs statEx = new StatFs(dir.getPath());
                args.putString("external_free", String.valueOf(statEx.getFreeBytes()));
                args.putString("external_total", String.valueOf(statEx.getTotalBytes()));
            } else {
                args.putString("external_free", "-1");
                args.putString("external_total", "-1");
            }
        }
        callback.invoke(null, args);
    }

    /**
     * Remove files in session.
     *
     * @param paths    An array of file paths.
     * @param callback JS contest callback
     */
    static void removeSession(ReadableArray paths, final Callback callback) {
        AsyncTask<ReadableArray, Integer, Integer> task = new AsyncTask<ReadableArray, Integer, Integer>() {
            @Override
            protected Integer doInBackground(ReadableArray... paths) {
                try {
                    ArrayList<String> failuresToDelete = new ArrayList<>();
                    for (int i = 0; i < paths[0].size(); i++) {
                        String fileName = paths[0].getString(i);
                        File f = new File(fileName);
                        if (f.exists()) {
                            boolean result = f.delete();
                            if (!result) {
                                failuresToDelete.add(fileName);
                            }
                        }
                    }
                    if (failuresToDelete.isEmpty()) {
                        callback.invoke(null, true);
                    } else {
                        StringBuilder listString = new StringBuilder();
                        listString.append("Failed to delete: ");
                        for (String s : failuresToDelete) {
                            listString.append(s).append(", ");
                        }
                        callback.invoke(listString.toString());
                    }
                } catch (Exception err) {
                    callback.invoke(err.getLocalizedMessage());
                }
                return paths[0].size();
            }
        };
        task.execute(paths);
    }

    /**
     * Get input stream of the given path.
     * When the path starts with bundle-assets:// the stream is created by Assets Manager
     * When the path starts with content:// the stream is created by ContentResolver
     * otherwise use FileInputStream.
     *
     * @param path The file to open stream
     * @return InputStream instance
     * @throws IOException If the given file does not exist or is a directory FileInputStream will throw a FileNotFoundException
     */
    private static InputStream inputStreamFromPath(String path) throws IOException {
        if (path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
            return ReactNativeBlobUtilImpl.RCTContext.getAssets().open(path.replace(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, ""));
        }
        if (path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_CONTENT)) {
            return ReactNativeBlobUtilImpl.RCTContext.getContentResolver().openInputStream(Uri.parse(path));
        }
        return new FileInputStream(new File(ReactNativeBlobUtilUtils.normalizePath(path)));
    }

    /**
     * Check if the asset or the file exists
     *
     * @param path A file path URI string
     * @return A boolean value represents if the path exists.
     */
    private static boolean isPathExists(String path) {
        if (path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
            try {
                ReactNativeBlobUtilImpl.RCTContext.getAssets().open(path.replace(com.ReactNativeBlobUtil.ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET, ""));
            } catch (IOException e) {
                return false;
            }
            return true;
        } else {
            return new File(path).exists();
        }

    }

    static boolean isAsset(String path) {
        return path != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET);
    }

}
