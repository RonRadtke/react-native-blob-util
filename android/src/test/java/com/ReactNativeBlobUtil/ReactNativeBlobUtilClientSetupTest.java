package com.ReactNativeBlobUtil;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.Headers;
import okhttp3.OkHttpClient;

/**
 * How a request's client is set up and what JS gets back from a response, in the
 * parts ReactNativeBlobUtilReq keeps as plain static methods. The same cases as
 * the Kotlin test on master.
 */
public class ReactNativeBlobUtilClientSetupTest {

    /** React Native's base client, which every request's client derives from, has no timeouts. */
    private static OkHttpClient.Builder baseClient() {
        return new OkHttpClient.Builder()
            .connectTimeout(0, TimeUnit.MILLISECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .writeTimeout(0, TimeUnit.MILLISECONDS);
    }

    // An upload whose body the server stopped reading never timed out: the write
    // timeout was left at the base client's none (#384).
    @Test
    public void timeoutBoundsConnectingReadingAndWriting() {
        OkHttpClient client = ReactNativeBlobUtilReq.applyTimeouts(baseClient(), 1500, false).build();
        assertEquals(1500, client.connectTimeoutMillis());
        assertEquals(1500, client.readTimeoutMillis());
        assertEquals(1500, client.writeTimeoutMillis());
    }

    @Test
    public void aDownloadToAFileHasNoReadTimeoutButStillAWriteTimeout() {
        OkHttpClient client = ReactNativeBlobUtilReq.applyTimeouts(baseClient(), 1500, true).build();
        assertEquals(1500, client.connectTimeoutMillis());
        assertEquals(0, client.readTimeoutMillis());
        assertEquals(1500, client.writeTimeoutMillis());
    }

    @Test
    public void aNegativeTimeoutLeavesTheBaseClients() {
        OkHttpClient client = ReactNativeBlobUtilReq.applyTimeouts(baseClient().writeTimeout(7, TimeUnit.SECONDS), -1, false).build();
        assertEquals(0, client.connectTimeoutMillis());
        assertEquals(0, client.readTimeoutMillis());
        assertEquals(7000, client.writeTimeoutMillis());
    }

    // Each repetition of a header replaced the one before, so of two Set-Cookie
    // headers only the last reached JS (#377). iOS joins them with ", ".
    @Test
    public void aRepeatedResponseHeaderKeepsEveryValue() {
        Map<String, String> expected = new LinkedHashMap<>();
        expected.put("Content-Type", "text/plain");
        expected.put("Set-Cookie", "a=1, b=2");
        assertEquals(expected, ReactNativeBlobUtilReq.headerFields(
            Headers.of("Set-Cookie", "a=1", "Content-Type", "text/plain", "Set-Cookie", "b=2")));
    }

    @Test
    public void namesThatDifferOnlyInCaseAreOneHeader() {
        Map<String, String> fields = ReactNativeBlobUtilReq.headerFields(Headers.of("X-Id", "1", "x-id", "2"));
        assertEquals(1, fields.size());
        assertEquals("1, 2", fields.get("X-Id"));
    }

    // addAndroidDownloads without the DownloadManager lists the finished file in the
    // Downloads app. Title and description defaulted to "", which
    // DownloadManager.addCompletedDownload refuses with IllegalArgumentException, thrown
    // on OkHttp's thread: the app ended (#390).
    @Test
    public void aDownloadsEntryWithoutATitleOrDescriptionIsNamedAfterTheFile() {
        ReactNativeBlobUtilReq.CompletedDownload download =
            ReactNativeBlobUtilReq.completedDownload("", "", "text/plain", "/data/files/report.pdf");
        assertEquals("report.pdf", download.title);
        assertEquals("report.pdf", download.description);
        assertEquals("text/plain", download.mime);
        assertEquals("/data/files/report.pdf", download.path);

        download = ReactNativeBlobUtilReq.completedDownload("Report", null, null, "/data/files/report.pdf");
        assertEquals("Report", download.title);
        assertEquals("Report", download.description);
        assertEquals("text/plain", download.mime);
    }

    @Test
    public void aDownloadsEntryKeepsWhatTheConfigGives() {
        ReactNativeBlobUtilReq.CompletedDownload download =
            ReactNativeBlobUtilReq.completedDownload("Report", "Monthly", "application/pdf", "/data/files/report.pdf");
        assertEquals("Report", download.title);
        assertEquals("Monthly", download.description);
        assertEquals("application/pdf", download.mime);
    }

    @Test
    public void aResponseHeldInMemoryGetsNoDownloadsEntry() {
        assertNull(ReactNativeBlobUtilReq.completedDownload("Report", "Monthly", "text/plain", null));
        assertNull(ReactNativeBlobUtilReq.completedDownload("Report", "Monthly", "text/plain", ""));
    }
}
