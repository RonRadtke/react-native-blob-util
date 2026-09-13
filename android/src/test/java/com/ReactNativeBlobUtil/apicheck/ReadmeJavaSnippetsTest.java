package com.ReactNativeBlobUtil.apicheck;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertSame;

import com.ReactNativeBlobUtil.ReactNativeBlobUtilFileTransformer;
import com.ReactNativeBlobUtil.ReactNativeBlobUtilPackage;
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils;
import com.facebook.react.ReactPackage;

import org.junit.After;
import org.junit.Test;

import java.security.cert.X509Certificate;

import javax.net.ssl.X509TrustManager;

/**
 * The README's Android setup, written the way a Java app writes it and from a
 * package outside the library, so only public API is reachable. The file compiling
 * is most of the check: it breaks if the Kotlin port drops a static field or
 * narrows the visibility of something apps use.
 */
public class ReadmeJavaSnippetsTest {

    @After
    public void clearSharedState() {
        ReactNativeBlobUtilUtils.sharedTrustManager = null;
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = null;
    }

    @Test
    public void appsSetTheTrustManagerForTrustyRequests() {
        X509TrustManager x509TrustManager = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[]{};
            }
        };
        ReactNativeBlobUtilUtils.sharedTrustManager = x509TrustManager;
        assertSame(x509TrustManager, ReactNativeBlobUtilUtils.sharedTrustManager);
    }

    @Test
    public void appsSetTheFileTransformer() {
        ReactNativeBlobUtilFileTransformer.FileTransformer encryptor = new ReactNativeBlobUtilFileTransformer.FileTransformer() {
            @Override
            public byte[] onWriteFile(byte[] data) {
                return data;
            }

            @Override
            public byte[] onReadFile(byte[] data) {
                return data;
            }
        };
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = encryptor;
        assertArrayEquals(new byte[]{1, 2}, ReactNativeBlobUtilFileTransformer.sharedFileTransformer.onReadFile(new byte[]{1, 2}));
    }

    @Test
    public void appsRegisterThePackageByHand() {
        ReactPackage blobUtil = new ReactNativeBlobUtilPackage();
        assertSame(ReactNativeBlobUtilPackage.class, blobUtil.getClass());
    }
}
