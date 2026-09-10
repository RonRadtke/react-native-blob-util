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

import okhttp3.HttpUrl;
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

    /**
     * Whether a request to {@code url} should use the custom CA trust store.
     *
     * When pinnedHosts is set the custom CA only covers those hosts; anything else
     * falls through to the platform trust store, which is what the README documents
     * and what iOS does by returning NSURLSessionAuthChallengePerformDefaultHandling.
     */
    public static boolean customCACertsApplyTo(List<String> certNames, List<String> pinnedHosts, String url) {
        if (certNames == null || certNames.isEmpty()) return false;
        if (pinnedHosts == null || pinnedHosts.isEmpty()) return true;

        HttpUrl parsed = HttpUrl.parse(url);
        if (parsed == null) return false;

        return pinnedHosts.contains(parsed.host());
    }

    public static OkHttpClient.Builder getCustomCACertOkHttpClient(OkHttpClient client, Context context, List<String> certNames, boolean trustSystemCerts) {
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            KeyStore keyStore = KeyStore.getInstance(KeyStore.getDefaultType());
            keyStore.load(null, null);

            if (trustSystemCerts) {
                TrustManagerFactory defaultTmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
                defaultTmf.init((KeyStore) null);
                int systemIndex = 0;
                for (TrustManager tm : defaultTmf.getTrustManagers()) {
                    if (tm instanceof X509TrustManager) {
                        for (java.security.cert.X509Certificate cert : ((X509TrustManager) tm).getAcceptedIssuers()) {
                            keyStore.setCertificateEntry("system_" + (systemIndex++), cert);
                        }
                    }
                }
            }

            int loaded = 0;
            for (String certName : certNames) {
                Certificate cert = loadCertificateFromResources(context, cf, certName);
                if (cert != null) {
                    keyStore.setCertificateEntry(certName, cert);
                    loaded++;
                }
            }

            // Fail closed. Without this the keystore is empty, every connection fails
            // trust evaluation, and the developer sees a generic handshake error rather
            // than the actual problem: the certificate is not in res/raw under that name.
            if (loaded == 0) {
                throw new IllegalStateException(
                    "customCACerts: none of " + certNames + " could be loaded from res/raw");
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

            // No hostnameVerifier override: the default verifier still applies, so a
            // certificate is only accepted for the names it actually carries. Scoping to
            // pinnedHosts happens before this client is built - see ReactNativeBlobUtilReq.

            return builder;
        } catch (Exception e) {
            throw new RuntimeException("Failed to configure custom CA certificates", e);
        }
    }

    private static Certificate loadCertificateFromResources(Context context, CertificateFactory cf, String certName) {
        int resId = context.getResources().getIdentifier(certName, "raw", context.getPackageName());
        if (resId == 0) {
            String[] suffixes = {"_pem", "_der", "_cer"};
            for (String suffix : suffixes) {
                resId = context.getResources().getIdentifier(certName + suffix, "raw", context.getPackageName());
                if (resId != 0) break;
            }
        }
        if (resId == 0) return null;

        try (InputStream is = context.getResources().openRawResource(resId)) {
            return cf.generateCertificate(is);
        } catch (Exception e) {
            // DER parsing failed — try PEM-to-DER conversion
        }

        try (InputStream is = context.getResources().openRawResource(resId)) {
            byte[] derBytes = pemToDer(is);
            if (derBytes != null) {
                return cf.generateCertificate(new ByteArrayInputStream(derBytes));
            }
        } catch (Exception e) {
            // PEM conversion also failed
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
