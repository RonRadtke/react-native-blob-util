package com.ReactNativeBlobUtil;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.After;
import org.junit.Test;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.ConnectionPool;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * A request that fails once the server may have received it is not sent again,
 * except a GET or HEAD (#504). The interceptor used to proceed a second time after
 * any exception, read timeouts included; retryOnConnectionFailure(true) let OkHttp
 * resend a POST after a pooled connection dropped; and OkHttp follows a 503 with
 * Retry-After: 0. A server that acts on a POST, a payment for one, acted on it twice.
 * Without that retry, the shared pool must not hand a POST a connection the server
 * has already closed for being idle.
 *
 * The clients here are wired as ReactNativeBlobUtilReq wires its own, against a
 * local server that counts the requests it reads.
 */
public class ReactNativeBlobUtilResendTest {

    private enum Reply { OK, UNAVAILABLE, CLOSE, HOLD }

    private interface Replies {
        Reply forRequest(int indexOnConnection);
    }

    /**
     * An HTTP/1.1 server that answers the nth request on each connection as replies
     * says, and closes a connection idle for idleMillis (0: never).
     */
    private static final class Server implements AutoCloseable {
        private final Replies replies;
        private final int idleMillis;
        private final ServerSocket socket;
        private final List<Socket> accepted = Collections.synchronizedList(new ArrayList<>());
        private final List<String> methods = Collections.synchronizedList(new ArrayList<>());
        final String url;

        Server(Replies replies, int idleMillis) throws IOException {
            this.replies = replies;
            this.idleMillis = idleMillis;
            socket = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
            url = "http://127.0.0.1:" + socket.getLocalPort() + "/";
            daemon(() -> {
                while (!socket.isClosed()) {
                    Socket client;
                    try {
                        client = socket.accept();
                    } catch (IOException e) {
                        break;
                    }
                    accepted.add(client);
                    daemon(() -> serve(client));
                }
            });
        }

        private static void daemon(Runnable body) {
            Thread thread = new Thread(body);
            thread.setDaemon(true);
            thread.start();
        }

        int connections() {
            return accepted.size();
        }

        /** How many requests with method arrived, once a stray resend has had time to. */
        int received(String method) throws InterruptedException {
            Thread.sleep(300);
            synchronized (methods) {
                int count = 0;
                for (String m : methods) {
                    if (m.equals(method)) count++;
                }
                return count;
            }
        }

        private void serve(Socket client) {
            try (Socket c = client) {
                c.setSoTimeout(idleMillis);
                InputStream input = new BufferedInputStream(c.getInputStream());
                OutputStream out = c.getOutputStream();
                int index = 0;
                while (true) {
                    String method = readRequest(input);
                    if (method == null) break;
                    methods.add(method);
                    Reply reply = replies.forRequest(index++);
                    if (reply == Reply.OK) {
                        out.write("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok".getBytes(StandardCharsets.US_ASCII));
                    } else if (reply == Reply.UNAVAILABLE) {
                        out.write("HTTP/1.1 503 Service Unavailable\r\nRetry-After: 0\r\nContent-Length: 0\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                    } else if (reply == Reply.CLOSE) {
                        break;
                    } else {
                        // Read until the client gives up and closes.
                        while (input.read() != -1) {
                        }
                    }
                    out.flush();
                }
            } catch (IOException ignored) {
            }
        }

        /** Reads one request and returns its method, or null at the end of the stream. */
        private static String readRequest(InputStream input) throws IOException {
            StringBuilder head = new StringBuilder();
            while (head.length() < 4 || !head.substring(head.length() - 4).equals("\r\n\r\n")) {
                int b = input.read();
                if (b == -1) return null;
                head.append((char) b);
            }
            String[] lines = head.toString().split("\r\n");
            int length = 0;
            for (String line : lines) {
                if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) {
                    length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                }
            }
            for (int i = 0; i < length; i++) {
                input.read();
            }
            return lines[0].substring(0, lines[0].indexOf(' '));
        }

        @Override
        public void close() throws IOException {
            socket.close();
            synchronized (accepted) {
                for (Socket s : accepted) {
                    s.close();
                }
            }
        }
    }

    private final List<Server> servers = new ArrayList<>();
    private final ConnectionPool pool = ReactNativeBlobUtilReq.newConnectionPool();

    private Server server(Replies replies) throws IOException {
        return server(replies, 0);
    }

    private Server server(Replies replies, int idleMillis) throws IOException {
        Server server = new Server(replies, idleMillis);
        servers.add(server);
        return server;
    }

    @After
    public void stop() throws IOException {
        pool.evictAll();
        for (Server server : servers) {
            server.close();
        }
    }

    /** A client set up the way ReactNativeBlobUtilReq sets up the one for method. */
    private OkHttpClient client(String method, ReactNativeBlobUtilReq.ResponseWrapper wrap) {
        return new OkHttpClient.Builder()
                .connectionPool(pool)
                .readTimeout(500, TimeUnit.MILLISECONDS)
                .addNetworkInterceptor(chain -> ReactNativeBlobUtilReq.withoutRetryAfter(chain.proceed(chain.request())))
                .addInterceptor(chain -> ReactNativeBlobUtilReq.proceedOnce(chain, chain.request(), wrap))
                .retryOnConnectionFailure(ReactNativeBlobUtilReq.mayResend(method))
                .build();
    }

    private static Request request(String method, String url) {
        RequestBody body = method.equals("POST") ? RequestBody.create(null, "{}".getBytes(StandardCharsets.UTF_8)) : null;
        return new Request.Builder().url(url).method(method, body).build();
    }

    private Response send(String method, String url) throws IOException {
        return client(method, response -> response).newCall(request(method, url)).execute();
    }

    @Test
    public void aPostWhoseReplyDoesNotArriveInTimeIsSentOnce() throws Exception {
        Server server = server(index -> Reply.HOLD);
        assertThrows(SocketTimeoutException.class, () -> send("POST", server.url));
        assertEquals(1, server.received("POST"));
    }

    // Every request runs on its own client, but they share one connection pool, so
    // the second request goes out on the connection the first one opened.
    @Test
    public void aPostIsNotResentWhenAReusedConnectionDropsBeforeTheReply() throws Exception {
        Server server = server(index -> index == 0 ? Reply.OK : Reply.CLOSE);
        try (Response response = send("GET", server.url)) {
            assertEquals(200, response.code());
        }
        assertThrows(IOException.class, () -> send("POST", server.url));
        assertEquals(1, server.received("POST"));
    }

    @Test
    public void aGetIsStillResentWhenAReusedConnectionDropsBeforeTheReply() throws Exception {
        Server server = server(index -> index == 0 ? Reply.OK : Reply.CLOSE);
        try (Response response = send("GET", server.url)) {
            assertEquals(200, response.code());
        }
        try (Response response = send("GET", server.url)) {
            assertEquals(200, response.code());
        }
        assertEquals(3, server.received("GET"));
    }

    @Test
    public void aPostAnsweredWith503AndRetryAfter0IsSentOnce() throws Exception {
        Server server = server(index -> Reply.UNAVAILABLE);
        try (Response response = send("POST", server.url)) {
            assertEquals(503, response.code());
        }
        assertEquals(1, server.received("POST"));
    }

    @Test
    public void aGetAnsweredWith503AndRetryAfter0IsStillResent() throws Exception {
        Server server = server(index -> Reply.UNAVAILABLE);
        try (Response response = send("GET", server.url)) {
            assertEquals(503, response.code());
        }
        assertEquals(2, server.received("GET"));
    }

    // Node's http server closes a connection after 5s idle by default. OkHttp only
    // checks a pooled connection before a POST once it has been idle for 10s, so
    // a POST 7s after the last request went out on the closed connection and
    // failed, and the server never saw it.
    @Test
    public void aPostSevenSecondsAfterTheLastRequestIsNotSentOnAConnectionTheServerClosed() throws Exception {
        Server server = server(index -> Reply.OK, 5000);
        try (Response response = send("GET", server.url)) {
            assertEquals(200, response.code());
        }
        Thread.sleep(7000);
        try (Response response = send("POST", server.url)) {
            assertEquals(200, response.code());
        }
        assertEquals(1, server.received("POST"));
        assertEquals(2, server.connections());
    }

    @Test
    public void aPostTwoSecondsAfterTheLastRequestReusesTheConnection() throws Exception {
        Server server = server(index -> Reply.OK, 5000);
        try (Response response = send("GET", server.url)) {
            assertEquals(200, response.code());
        }
        Thread.sleep(2000);
        try (Response response = send("POST", server.url)) {
            assertEquals(200, response.code());
        }
        assertEquals(1, server.received("POST"));
        assertEquals(1, server.connections());
    }

    // OkHttp rethrows anything but an IOException on its dispatcher thread after
    // onFailure, which crashes the app, so the interceptor hands it on as one.
    @Test
    public void anExceptionWhileWrappingTheResponseFailsTheCallWithAnIOException() throws Exception {
        Server server = server(index -> Reply.OK);
        CompletableFuture<Throwable> failure = new CompletableFuture<>();
        Call call = client("POST", response -> {
            throw new IllegalStateException("wrap failed");
        }).newCall(request("POST", server.url));
        call.enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                failure.complete(e);
            }

            @Override
            public void onResponse(Call call, Response response) {
                response.close();
                failure.complete(new AssertionError("onResponse was called"));
            }
        });
        Throwable e = failure.get(5, TimeUnit.SECONDS);
        assertTrue(e.toString(), e instanceof IOException && e.getCause() instanceof IllegalStateException);
        assertEquals(1, server.received("POST"));
    }
}
