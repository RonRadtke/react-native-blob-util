const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HOST = process.env.E2E_SERVER_HOST || "0.0.0.0";
const PORT = Number(process.env.E2E_SERVER_PORT || 19076);
const HTTPS_PORT = Number(process.env.E2E_HTTPS_PORT || 19077);

const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOZ+9rEAAAAASUVORK5CYII=";
const PNG_BUFFER = Buffer.from(PNG_BASE64, "base64");

// A case that must be refused only means something if it performs a handshake,
// so a success must never be answered from a cache.
const sendJson = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        Pragma: "no-cache",
    });
    res.end(payload);
};

const sendText = (res, status, text) => {
    res.writeHead(status, {
        "Content-Type": "text/plain",
        "Content-Length": Buffer.byteLength(text),
    });
    res.end(text);
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
    });

const handleUpload = async (req, res, label) => {
    try {
        const body = await readBody(req);
        const hash = crypto.createHash("sha256").update(body).digest("hex");
        sendJson(res, 200, {
            ok: true,
            label,
            contentType: req.headers["content-type"] || "",
            bytes: body.length,
            sha256: hash,
        });
    } catch (err) {
        // The message only: a thrown value that is not an Error could carry a stack.
        sendJson(res, 500, { ok: false, error: err instanceof Error ? err.message : "upload could not be read" });
    }
};

const handleProgress = (res) => {
    const size = 512 * 1024;
    const payload = Buffer.alloc(size, "a");
    res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": payload.length,
    });
    res.end(payload);
};

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/**
 * Splits a multipart/form-data body into its parts. Deliberately small - it only
 * has to read what the library's own multipart builders produce - but it reports
 * every part byte-exactly, so the parity cases can pin how Android and iOS build
 * the body rather than only whether the upload returned 200.
 */
const parseMultipart = (body, contentType) => {
    const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
    if (!match) {
        return null;
    }
    const delimiter = Buffer.from(`--${match[1] || match[2]}`);
    const parts = [];

    let cursor = body.indexOf(delimiter);
    while (cursor !== -1) {
        cursor += delimiter.length;
        if (body.slice(cursor, cursor + 2).toString() === "--") {
            break;
        }
        const next = body.indexOf(delimiter, cursor);
        if (next === -1) {
            break;
        }

        // Each part is CRLF, headers, CRLF CRLF, content, CRLF, next delimiter.
        const raw = body.slice(cursor + 2, next - 2);
        const headerEnd = raw.indexOf("\r\n\r\n");
        const headerText = headerEnd === -1 ? raw.toString() : raw.slice(0, headerEnd).toString();
        const content = headerEnd === -1 ? Buffer.alloc(0) : raw.slice(headerEnd + 4);

        const headers = {};
        for (const line of headerText.split("\r\n")) {
            const colon = line.indexOf(":");
            if (colon > 0) {
                headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
            }
        }
        const disposition = headers["content-disposition"] || "";
        const name = /\bname="([^"]*)"/.exec(disposition);
        const filename = /\bfilename="([^"]*)"/.exec(disposition);

        parts.push({
            name: name ? name[1] : null,
            filename: filename ? filename[1] : null,
            contentType: headers["content-type"] || null,
            bytes: content.length,
            sha256: sha256(content),
            text: content.length <= 256 ? content.toString("utf8") : null,
        });
        cursor = next;
    }

    return parts;
};

/**
 * Describes the request exactly as it arrived. Used by the parity cases to pin
 * how each platform encodes a body - octet-stream from base64, a wrapped file, a
 * plain string, or a multipart form - and which transfer headers it sends.
 */
const handleEcho = async (req, res) => {
    const body = await readBody(req);
    const contentType = req.headers["content-type"] || "";
    sendJson(res, 200, {
        ok: true,
        method: req.method,
        contentType,
        contentLength: req.headers["content-length"] ?? null,
        transferEncoding: req.headers["transfer-encoding"] ?? null,
        custom: req.headers["x-rnbu-e2e"] ?? null,
        bytes: body.length,
        sha256: sha256(body),
        text: body.length <= 256 ? body.toString("utf8") : null,
        parts: /^multipart\//i.test(contentType) ? parseMultipart(body, contentType) : null,
    });
};

// Bytes 0..255, so a case can check that binary survives base64 and file
// responses unchanged, including the NUL and high bytes.
const BINARY_BUFFER = Buffer.from(Array.from({length: 256}, (_, i) => i));

// 256 KB of a byte pattern that does not repeat with any small period, so a
// misplaced range shows in the hash.
const RANGE_BUFFER = Buffer.from(Array.from({length: 256 * 1024}, (_, i) => (i * 31 + (i >> 8)) & 0xff));
const RANGE_LOG = new Map();
const RANGE_DROPPED = new Set();

const handleRange = (req, res, url) => {
    const token = url.searchParams.get("token") || "";
    const etag = `"range-${url.searchParams.get("etag") || "v1"}"`;
    const log = RANGE_LOG.get(token) || [];
    log.push({range: req.headers.range ?? null, ifRange: req.headers["if-range"] ?? null});
    RANGE_LOG.set(token, log);

    // size=<n> serves the first n bytes only.
    const size = Math.min(RANGE_BUFFER.length, Number(url.searchParams.get("size") || RANGE_BUFFER.length));
    const file = RANGE_BUFFER.subarray(0, size);
    let start = 0;
    let status = 200;
    // bytes=N- and bytes=N-M (BITS asks for closed ranges).
    const asked = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    let end = size - 1;
    const ifRange = req.headers["if-range"];
    if (asked && url.searchParams.get("noRange") !== "1" && (!ifRange || ifRange === etag)) {
        start = Number(asked[1]);
        if (start >= size) {
            res.writeHead(416, {"Content-Range": `bytes */${size}`, "Content-Length": 0, ETag: etag});
            res.end();
            return;
        }
        if (asked[2] !== "") {
            end = Math.min(size - 1, Number(asked[2]));
        }
        status = 206;
    }
    const body = file.subarray(start, end + 1);
    const headers = {"Content-Type": "application/octet-stream", "Content-Length": body.length, ETag: etag, "Accept-Ranges": "bytes"};
    if (status === 206) {
        headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }
    res.writeHead(status, headers);

    const ms = Math.min(Number(url.searchParams.get("ms") || 0), 2000);
    const drop = url.searchParams.has("drop") && !RANGE_DROPPED.has(token) ? Number(url.searchParams.get("drop")) : -1;
    let sent = 0;
    const pump = () => {
        if (res.destroyed) return;
        if (drop >= 0 && sent >= drop) {
            RANGE_DROPPED.add(token);
            // Closed after what was written has gone out, short of Content-Length.
            // destroy() reset the connection with data still queued, and the
            // Android emulator's network stack then garbled what it had received.
            res.socket.end();
            return;
        }
        const end = Math.min(body.length, sent + 16 * 1024, drop >= 0 ? drop : Infinity);
        res.write(body.subarray(sent, end));
        sent = end;
        if (sent >= body.length) {
            res.end();
        } else if (ms > 0) {
            setTimeout(pump, ms);
        } else {
            setImmediate(pump);
        }
    };
    pump();
};

const handler = async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const method = req.method || "GET";

    if (method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/echo") {
        return handleEcho(req, res);
    }

    // HEAD as well: BITS (Windows background downloads) asks for the size first.
    if ((method === "GET" || method === "HEAD") && url.pathname === "/binary") {
        res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Length": BINARY_BUFFER.length,
        });
        res.end(BINARY_BUFFER);
        return;
    }

    if (method === "GET" && url.pathname === "/text") {
        return sendText(res, 200, "héllo wörld ✓");
    }

    if (method === "GET" && url.pathname === "/redirect") {
        res.writeHead(302, { Location: "/health", "Content-Length": 0 });
        res.end();
        return;
    }

    if (method === "GET" && url.pathname === "/redirect-twice") {
        res.writeHead(301, { Location: "/redirect", "Content-Length": 0 });
        res.end();
        return;
    }

    // Answers after `ms` milliseconds, for the timeout and cancel cases.
    if ((method === "GET" || method === "HEAD") && url.pathname === "/slow") {
        const ms = Math.min(Number(url.searchParams.get("ms") || 3000), 30000);
        setTimeout(() => sendJson(res, 200, { ok: true, waited: ms }), ms);
        return;
    }

    // No Content-Length, so the client sees a chunked response of unknown length.
    if (method === "GET" && url.pathname === "/chunked") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("chunk-1\n");
        setTimeout(() => {
            res.write("chunk-2\n");
            setTimeout(() => res.end("chunk-3\n"), 50);
        }, 50);
        return;
    }

    // A file that honours Range and If-Range, for pause/resume and resumable
    // downloads. Query switches: ms=<n> delays every 16 KB chunk; drop=<n>
    // closes the connection after n bytes, once per token; noRange=1 ignores
    // Range; etag=<v> changes the validator. /range/log?token=t lists the Range
    // and If-Range headers the requests for that token carried.
    if (method === "GET" && url.pathname === "/range/log") {
        return sendJson(res, 200, {requests: RANGE_LOG.get(url.searchParams.get("token") || "") || []});
    }
    if ((method === "GET" || method === "HEAD") && url.pathname === "/range") {
        return handleRange(req, res, url);
    }

    const status = /^\/status\/(\d{3})$/.exec(url.pathname);
    if (method === "GET" && status) {
        return sendJson(res, Number(status[1]), { status: Number(status[1]) });
    }

    if (method === "GET" && url.pathname === "/cookie/set") {
        const payload = JSON.stringify({ ok: true });
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
            "Set-Cookie": "rnbu_e2e=cookie-value; Path=/",
        });
        res.end(payload);
        return;
    }

    if (method === "GET" && url.pathname === "/cookie/echo") {
        return sendJson(res, 200, { cookie: req.headers.cookie || "" });
    }

    if (method === "GET" && url.pathname === "/image.png") {
        res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": PNG_BUFFER.length,
        });
        res.end(PNG_BUFFER);
        return;
    }

    if (method === "POST" && url.pathname === "/upload-file") {
        return handleUpload(req, res, "upload-file");
    }

    if (method === "POST" && url.pathname === "/upload-text") {
        return handleUpload(req, res, "upload-text");
    }

    if (method === "POST" && url.pathname === "/multipart") {
        return handleUpload(req, res, "multipart");
    }

    if (method === "POST" && url.pathname === "/progress") {
        return handleProgress(res);
    }

    return sendText(res, 404, "Not Found");
};

const server = http.createServer(handler);

server.listen(PORT, HOST, () => {
    console.log(`E2E server listening on http://${HOST}:${PORT}`);
});

const certsDir = path.join(__dirname, "certs");
const keyPath = path.join(certsDir, "server.key");
const certPath = path.join(certsDir, "server.crt");

// Certificates are generated rather than committed - see certs/generate.js.
require("./certs/generate").ensureCerts({quiet: true});

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
    const httpsServer = https.createServer(httpsOptions, handler);
    httpsServer.listen(HTTPS_PORT, HOST, () => {
        console.log(`E2E HTTPS server listening on https://${HOST}:${HTTPS_PORT}`);
    });
}

process.on("SIGINT", () => {
    server.close(() => process.exit(0));
});
