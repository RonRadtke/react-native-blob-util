const http = require('http');
const crypto = require('crypto');

const HOST = process.env.E2E_SERVER_HOST || '0.0.0.0';
const PORT = Number(process.env.E2E_SERVER_PORT || 19076);

const PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOZ+9rEAAAAASUVORK5CYII=';
const PNG_BUFFER = Buffer.from(PNG_BASE64, 'base64');

const sendJson = (res, status, body) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
};

const sendText = (res, status, text) => {
    res.writeHead(status, {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });

const handleUpload = async (req, res, label) => {
    try {
        const body = await readBody(req);
        const hash = crypto.createHash('sha256').update(body).digest('hex');
        sendJson(res, 200, {
            ok: true,
            label,
            contentType: req.headers['content-type'] || '',
            bytes: body.length,
            sha256: hash,
        });
    } catch (err) {
        sendJson(res, 500, {ok: false, error: String(err?.message || err)});
    }
};

const handleProgress = (res) => {
    const size = 512 * 1024;
    const payload = Buffer.alloc(size, 'a');
    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': payload.length,
    });
    res.end(payload);
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const method = req.method || 'GET';

    if (method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {ok: true});
    }

    if (method === 'GET' && url.pathname === '/image.png') {
        res.writeHead(200, {
            'Content-Type': 'image/png',
            'Content-Length': PNG_BUFFER.length,
        });
        res.end(PNG_BUFFER);
        return;
    }

    if (method === 'POST' && url.pathname === '/upload-file') {
        return handleUpload(req, res, 'upload-file');
    }

    if (method === 'POST' && url.pathname === '/upload-text') {
        return handleUpload(req, res, 'upload-text');
    }

    if (method === 'POST' && url.pathname === '/multipart') {
        return handleUpload(req, res, 'multipart');
    }

    if (method === 'POST' && url.pathname === '/progress') {
        return handleProgress(res);
    }

    return sendText(res, 404, 'Not Found');
});

server.listen(PORT, HOST, () => {
    console.log(`E2E server listening on http://${HOST}:${PORT}`);
});

process.on('SIGINT', () => {
    server.close(() => process.exit(0));
});
