package com.ReactNativeBlobUtil;

import android.net.Uri;
import android.util.Base64;

import com.ReactNativeBlobUtil.Utils.PathResolver;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import android.content.Context;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.util.List;
import java.util.Locale;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

import okhttp3.OkHttpClient;

public class ReactNativeBlobUtilUtils {

    public static X509TrustManager sharedTrustManager;

    public static String getMD5(String input) {
        String result = null;

        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            md.update(input.getBytes());
            byte[] digest = md.digest();

            StringBuilder sb = new StringBuilder();

            for (byte b : digest) {
                sb.append(String.format(Locale.ROOT, "%02x", b & 0xff));
            }

            result = sb.toString();
        } catch (Exception ex) {
            ex.printStackTrace();
        } finally {
            // TODO: Is discarding errors the intent? (https://www.owasp.org/index.php/Return_Inside_Finally_Block)
            return result;
        }

    }

    public static void emitWarningEvent(String data) {
        WritableMap args = Arguments.createMap();
        args.putString("event", "warn");
        args.putString("detail", data);

        // emit event to js context
        ReactNativeBlobUtilImpl.RCTContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit(ReactNativeBlobUtilConst.EVENT_MESSAGE, args);
    }

    public static OkHttpClient.Builder getUnsafeOkHttpClient(OkHttpClient client) {
        try {

            if (sharedTrustManager == null) throw new IllegalStateException("Use of own trust manager but none defined");

            final TrustManager[] trustAllCerts = new TrustManager[]{sharedTrustManager};

            // Install the all-trusting trust manager
            final SSLContext sslContext = SSLContext.getInstance("SSL");
            sslContext.init(null, trustAllCerts, new java.security.SecureRandom());
            // Create an ssl socLket factory with our all-trusting manager
            final SSLSocketFactory sslSocketFactory = sslContext.getSocketFactory();

            OkHttpClient.Builder builder = client.newBuilder();
            builder.sslSocketFactory(sslSocketFactory, sharedTrustManager);
            builder.hostnameVerifier(new HostnameVerifier() {
                @Override
                public boolean verify(String hostname, SSLSession session) {
                    return true;
                }
            });

            return builder;
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static OkHttpClient.Builder getCustomCACertOkHttpClient(OkHttpClient client, Context context, List<String> certNames, List<String> pinnedHosts, boolean trustSystemCerts) {
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
            keyStore.load(null, null);

            if (trustSystemCerts) {
                TrustManagerFactory defaultTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                defaultTmf.init((KeyStore) null);
                KeyStore systemKeyStore = KeyStore.getInstance(KeyStore.getDefaultType());
                systemKeyStore.load(null, null);
                for (TrustManager tm : defaultTmf.getTrustManagers()) {
                    if (tm instanceof X509TrustManager) {
                        for (java.security.cert.X509Certificate cert : ((X509TrustManager) tm).getAcceptedIssuers()) {
                            keyStore.setCertificateEntry("system_" + cert.getSubjectDN().getName().hashCode(), cert);
                        }
                    }
                }
            }

            for (String certName : certNames) {
                Certificate cert = loadCertificateFromResources(context, cf, certName);
                if (cert != null) {
                    keyStore.setCertificateEntry(certName, cert);
                }
            }

            TrustManagerFactory tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
            tmf.init(keyStore);

            X509TrustManager customTrustManager = null;
            for (TrustManager tm : tmf.getTrustManagers()) {
                if (tm instanceof X509TrustManager) {
                    customTrustManager = (X509TrustManager) tm;
                    break;
                }
            }

            if (customTrustManager == null) {
                throw new IllegalStateException("No X509TrustManager found");
            }

            SSLContext sslContext = SSLContext.getInstance("TLS");
            sslContext.init(null, new TrustManager[]{customTrustManager}, new java.security.SecureRandom());

            OkHttpClient.Builder builder = client.newBuilder();
            builder.sslSocketFactory(sslContext.getSocketFactory(), customTrustManager);

            if (pinnedHosts != null && !pinnedHosts.isEmpty()) {
                builder.hostnameVerifier(new HostnameVerifier() {
                    @Override
                    public boolean verify(String hostname, SSLSession session) {
                        return pinnedHosts.contains(hostname);
                    }
                });
            }

            return builder;
        } catch (Exception e) {
            throw new RuntimeException("Failed to configure custom CA certificates", e);
        }
    }

    private static Certificate loadCertificateFromResources(Context context, CertificateFactory cf, String certName) {
        String[] extensions = {"cer", "der", "pem"};
        for (String ext : extensions) {
            int resId = context.getResources().getIdentifier(certName, "raw", context.getPackageName());
            if (resId == 0) {
                resId = context.getResources().getIdentifier(certName + "_" + ext, "raw", context.getPackageName());
            }
            if (resId == 0) continue;

            try (InputStream is = context.getResources().openRawResource(resId)) {
                if ("pem".equals(ext)) {
                    byte[] derBytes = pemToDer(is);
                    if (derBytes != null) {
                        return cf.generateCertificate(new ByteArrayInputStream(derBytes));
                    }
                } else {
                    return cf.generateCertificate(is);
                }
            } catch (Exception e) {
                // Try next extension
            }
        }
        return null;
    }

    private static byte[] pemToDer(InputStream is) {
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));
            StringBuilder base64 = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.startsWith("-----")) continue;
                base64.append(line.trim());
            }
            return Base64.decode(base64.toString(), Base64.DEFAULT);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * String to byte converter method
     *
     * @param data     Raw data in string format
     * @param encoding Decoder name
     * @return Converted data byte array
     */
    public static byte[] stringToBytes(String data, String encoding) {
        if (encoding.equalsIgnoreCase("ascii")) {
            return data.getBytes(Charset.forName("US-ASCII"));
        } else if (encoding.toLowerCase(Locale.ROOT).contains("base64")) {
            return Base64.decode(data, Base64.NO_WRAP);

        } else if (encoding.equalsIgnoreCase("utf8")) {
            return data.getBytes(Charset.forName("UTF-8"));
        }
        return data.getBytes(Charset.forName("US-ASCII"));
    }

    /**
     * Normalize the path, remove URI scheme (xxx://) so that we can handle it.
     *
     * @param path URI string.
     * @return Normalized string
     */
    public static String normalizePath(String path) {
        if (path == null)
            return null;
        if (!path.matches("\\w+\\:.*"))
            return path;
        if (path.startsWith("file://")) {
            return path.replace("file://", "");
        }

        Uri uri = Uri.parse(path);
        if (path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET)) {
            return path;
        } else
            return PathResolver.getRealPathFromURI(ReactNativeBlobUtilImpl.RCTContext, uri);
    }

    public static boolean isAsset(String path) {
        return path != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_BUNDLE_ASSET);
    }

    public static boolean isContentUri(String path) {
        return path != null && path.startsWith(ReactNativeBlobUtilConst.FILE_PREFIX_CONTENT);
    }
}
