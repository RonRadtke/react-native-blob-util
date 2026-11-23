/**
 * Behavioural parity cases for the native layers.
 *
 * Each case calls the library the way an app would and returns a signature of
 * what came back - resolved values, rejection codes and messages, payload keys
 * and types - normalised so that it is stable from run to run: absolute
 * directories, server addresses, UUIDs, hashes and timestamps are masked, and
 * everything else is kept exactly.
 *
 * tests/e2e/appium/scenarios/parity.js compares the signatures with goldens
 * recorded from the native code before the Kotlin/Swift port. The cases record
 * behaviour, including behaviour that looks wrong: fixing it is a separate,
 * deliberate change with its own golden update, never part of the port.
 *
 * Add a case by appending a `define` call. Keep signatures deterministic - a
 * value that legitimately varies between runs (a timestamp, a free-space figure,
 * a directory size) goes in as its type or magnitude, not its value.
 */
import {Platform} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';

const {fs, base64} = ReactNativeBlobUtil;

const ALL = ['android', 'ios', 'windows'];
const CASE_TIMEOUT_MS = 45000;

// The same 1x1 PNG the e2e server serves at /image.png.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOZ+9rEAAAAASUVORK5CYII=';

const DIR_KEYS = [
    'DocumentDir',
    'CacheDir',
    'DownloadDir',
    'LibraryDir',
    'MainBundleDir',
    'MovieDir',
    'MusicDir',
    'PictureDir',
    'ApplicationSupportDir',
    'DCIMDir',
    'SDCardDir',
    'SDCardApplicationDir',
    'LegacyDCIMDir',
    'LegacyPictureDir',
    'LegacyMusicDir',
    'LegacyDownloadDir',
    'LegacyMovieDir',
    'LegacySDCardDir',
    // Last on purpose. On Android the temporary directory IS the cache
    // directory, so CacheDir above already masks it and android.json keeps
    // recording <CacheDir>; on iOS it is the container's tmp/, which nothing
    // else masks - without this the golden carries a real
    // /Users/<name>/Library/Developer/CoreSimulator/... path and only compares
    // on the machine that recorded it.
    'TemporaryDir',
];

// ---------------------------------------------------------------------------
// Normalisation

let maskTable = null;

// Wraps a value that must reach the golden exactly as it is - a hash, or the
// server's description of what it received - so normalisation leaves it alone.
class Raw {
    constructor(value) {
        this.value = value;
    }
}

const raw = (value) => new Raw(value);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMaskTable() {
    const entries = [];
    for (const key of DIR_KEYS) {
        const value = fs.dirs[key];
        if (typeof value !== 'string' || value.length < 2) {
            continue;
        }
        const variants = new Set([value.replace(/\/+$/, '')]);
        // iOS reports the same container as /var/... or /private/var/... depending
        // on the API, and messages mix both.
        if (value.startsWith('/var/')) {
            variants.add('/private' + value.replace(/\/+$/, ''));
        }
        if (value.startsWith('/private/var/')) {
            variants.add(value.slice('/private'.length).replace(/\/+$/, ''));
        }
        // Android reports app storage as /data/user/0/<package>/... or through its
        // /data/data/<package>/... alias, depending on which API built the path.
        if (value.startsWith('/data/user/0/')) {
            variants.add('/data/data/' + value.slice('/data/user/0/'.length).replace(/\/+$/, ''));
        }
        for (const variant of variants) {
            entries.push([variant, `<${key}>`]);
        }
    }
    // Longest first, so a directory inside another is masked as itself.
    entries.sort((a, b) => b[0].length - a[0].length);
    return entries.map(([raw, token]) => [new RegExp(escapeRegExp(raw), 'g'), token]);
}

function mask(value) {
    if (typeof value !== 'string') {
        return value;
    }
    if (maskTable == null) {
        maskTable = buildMaskTable();
    }
    let out = value;
    for (const [pattern, token] of maskTable) {
        out = out.replace(pattern, token);
    }
    return out
        .replace(/(?:10\.0\.2\.2|127\.0\.0\.1|localhost):19076/g, '<http-server>')
        .replace(/(?:10\.0\.2\.2|127\.0\.0\.1|localhost):19077/g, '<https-server>')
        .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<uuid>')
        // iOS rejects with [NSError description], which embeds heap addresses such as
        // NSUnderlyingError=0x121f668e0 that change on every launch. Six or more hex
        // digits, so a short literal like 0x1 in a message survives.
        .replace(/\b0x[0-9a-fA-F]{6,}\b/g, '<ptr>')
        // Not \b: a word boundary does not fire after the "_" in ReactNativeBlobUtilTmp_<md5>.
        .replace(/(^|[^0-9a-fA-F])[0-9a-f]{32}(?![0-9a-fA-F])/g, '$1<md5>')
        .replace(/(content:\/\/[^\s"']*?\/)\d+\b/g, '$1<n>')
        .replace(/\d{10,}/g, '<n>');
}

function describeValue(value) {
    if (value instanceof Raw) {
        return value.value;
    }
    if (value === undefined) {
        return '<undefined>';
    }
    if (value === null || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : String(value);
    }
    if (typeof value === 'string') {
        return mask(value);
    }
    if (typeof value === 'function') {
        return '<function>';
    }
    if (Array.isArray(value)) {
        return value.map(describeValue);
    }
    if (typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            out[key] = describeValue(value[key]);
        }
        return out;
    }
    return `<${typeof value}>`;
}

function describeError(err) {
    if (err && typeof err === 'object') {
        return {
            name: err.name === undefined ? '<undefined>' : String(err.name),
            code: describeValue(err.code),
            message: mask(String(err.message === undefined ? '<undefined>' : err.message)),
        };
    }
    return {thrown: typeof err, message: mask(String(err))};
}

async function settle(run) {
    try {
        return {resolved: describeValue(await run())};
    } catch (err) {
        return {rejected: describeError(err)};
    }
}

// Like settle, but keeps the resolved value exactly as it is.
async function settleRaw(run) {
    try {
        return {resolved: raw(await run())};
    } catch (err) {
        return {rejected: describeError(err)};
    }
}

// Timestamps vary between runs; their unit is what callers depend on.
function timeKind(value) {
    const number = typeof value === 'string' ? Number(value) : value;
    if (typeof number !== 'number' || Number.isNaN(number)) {
        return `${typeof value}:not-a-number`;
    }
    const unit = number > 1e11 ? 'epoch-ms' : number > 1e8 ? 'epoch-s' : 'small';
    return `${typeof value}:${unit}`;
}

function fnv1a(codes) {
    let hash = 0x811c9dc5;
    for (const code of codes) {
        hash ^= code & 0xffff;
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

const bytesToBase64 = (bytes) => {
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return base64.encode(binary);
};

const base64ToBytes = (value) => Array.from(base64.decode(value), (c) => c.charCodeAt(0));

const range = (length, map) => Array.from({length}, (_, i) => map(i));

// ---------------------------------------------------------------------------
// Fixtures

const parityRoot = () => `${fs.dirs.DocumentDir}/parity`;

async function freshDir(id) {
    const root = parityRoot();
    if (!(await fs.isDir(root))) {
        await fs.mkdir(root);
    }
    const dir = `${root}/${id}`;
    if (await fs.exists(dir)) {
        await fs.unlink(dir);
    }
    await fs.mkdir(dir);
    return dir;
}

function readStreamSummary(path, encoding, bufferSize, check) {
    return new Promise((resolve) => {
        const chunks = [];
        let done = false;
        let timer = null;

        const finish = (outcome) => {
            if (done) {
                return;
            }
            done = true;
            clearTimeout(timer);
            const summary = {
                outcome,
                chunkCount: chunks.length,
                chunkKinds: [...new Set(chunks.map((c) => (Array.isArray(c) ? 'array' : typeof c)))].sort(),
                chunkLengths: chunks.map((c) => (c == null ? null : c.length)),
            };
            if (check) {
                summary.check = check(chunks);
            }
            resolve(summary);
        };

        timer = setTimeout(() => finish('timeout'), 20000);

        fs.readStream(path, encoding, bufferSize, 5)
            .then((stream) => {
                stream.onData((chunk) => chunks.push(chunk));
                stream.onError((err) => finish({error: describeError(err)}));
                stream.onEnd(() => finish('end'));
                stream.open();
            })
            .catch((err) => finish({openError: describeError(err)}));
    });
}

function headerSummary(headers) {
    const keys = Object.keys(headers || {});
    const pick = (name) => keys.find((key) => key.toLowerCase() === name);
    const interesting = ['content-type', 'content-length', 'location', 'set-cookie', 'transfer-encoding'];
    const out = {};
    for (const name of interesting) {
        const key = pick(name);
        if (key !== undefined) {
            out[name] = {key, value: name === 'content-length' || name === 'content-type' ? describeValue(headers[key]) : typeof headers[key]};
        }
    }
    return out;
}

/**
 * Android records a URL in `redirects` for every network attempt - a network
 * interceptor in ReactNativeBlobUtilReq.java - and lets OkHttp retry on a
 * connection failure. A request that lands on a stale pooled connection is retried
 * silently, so the same URL sometimes appears twice in a row and sometimes once.
 * A real redirect adds a different URL, so collapsing adjacent repeats keeps the
 * chain while dropping the retry.
 */
function collapseRepeats(list) {
    if (!Array.isArray(list)) {
        return describeValue(list);
    }
    return list.filter((entry, i) => i === 0 || entry !== list[i - 1]).map(describeValue);
}

function infoSummary(info) {
    if (!info) {
        return describeValue(info);
    }
    return {
        keys: Object.keys(info).sort(),
        status: describeValue(info.status),
        state: describeValue(info.state),
        respType: describeValue(info.respType),
        rnfbEncode: describeValue(info.rnfbEncode),
        taskId: typeof info.taskId,
        redirects: collapseRepeats(info.redirects),
        headers: headerSummary(info.headers),
    };
}

// The server echoes what it received; the random multipart boundary makes the
// whole-body hash and length vary, so those are only kept for plain bodies.
function echoSummary(echo) {
    const multipart = Array.isArray(echo.parts);
    return {
        method: echo.method,
        contentType: String(echo.contentType).replace(/boundary=[^;]+/i, 'boundary=<boundary>'),
        contentLength: multipart ? typeof echo.contentLength : echo.contentLength,
        transferEncoding: echo.transferEncoding,
        custom: echo.custom,
        bytes: multipart ? '<multipart>' : echo.bytes,
        sha256: multipart ? '<multipart>' : raw(echo.sha256),
        text: multipart ? '<multipart>' : raw(echo.text),
        parts: raw(echo.parts),
    };
}

// ---------------------------------------------------------------------------
// Cases

const cases = [];
const define = (id, run, platforms = ALL) => cases.push({id, run, platforms});

define('constants', async () => {
    const out = {};
    for (const key of DIR_KEYS) {
        const value = fs.dirs[key];
        out[key] = typeof value === 'string' && value !== '' ? mask(value) : describeValue(value);
    }
    return out;
});

define('stat-file', async () => {
    const dir = await freshDir('stat-file');
    const file = `${dir}/a.txt`;
    await fs.createFile(file, 'stat', 'utf8');
    const stat = await fs.stat(file);
    return {
        keys: Object.keys(stat).sort(),
        filename: describeValue(stat.filename),
        path: describeValue(stat.path),
        size: describeValue(stat.size),
        type: describeValue(stat.type),
        lastModified: timeKind(stat.lastModified),
    };
});

define('stat-dir', async () => {
    const dir = await freshDir('stat-dir');
    const stat = await fs.stat(dir);
    return {
        keys: Object.keys(stat).sort(),
        filename: describeValue(stat.filename),
        path: describeValue(stat.path),
        size: typeof stat.size,
        type: describeValue(stat.type),
        lastModified: timeKind(stat.lastModified),
    };
});

define('lstat-dir', async () => {
    const dir = await freshDir('lstat-dir');
    await fs.createFile(`${dir}/a.txt`, 'aa', 'utf8');
    await fs.createFile(`${dir}/b.txt`, 'bbb', 'utf8');
    await fs.mkdir(`${dir}/sub`);
    const entries = await fs.ls(dir, {stats: true});
    return {
        kind: Array.isArray(entries) ? 'array' : typeof entries,
        entries: [...entries]
            .sort((a, b) => String(a.filename).localeCompare(String(b.filename)))
            .map((entry) => ({
                keys: Object.keys(entry).sort(),
                filename: describeValue(entry.filename),
                path: describeValue(entry.path),
                type: describeValue(entry.type),
                size: entry.type === 'directory' ? typeof entry.size : [typeof entry.size, describeValue(entry.size)],
                lastModified: timeKind(entry.lastModified),
            })),
    };
});

define('ls-dir', async () => {
    const dir = await freshDir('ls-dir');
    await fs.createFile(`${dir}/b.txt`, 'b', 'utf8');
    await fs.createFile(`${dir}/a.txt`, 'a', 'utf8');
    await fs.mkdir(`${dir}/sub`);
    const names = await fs.ls(dir);
    return {
        kind: Array.isArray(names) ? 'array' : typeof names,
        sorted: [...names].map(describeValue).sort(),
        elementTypes: [...new Set(names.map((n) => typeof n))],
    };
});

define('exists-isdir', async () => {
    const dir = await freshDir('exists-isdir');
    const file = `${dir}/file.txt`;
    const missing = `${dir}/missing.txt`;
    await fs.createFile(file, 'x', 'utf8');
    return {
        fileExists: await fs.exists(file),
        fileIsDir: await fs.isDir(file),
        dirExists: await fs.exists(dir),
        dirIsDir: await fs.isDir(dir),
        missingExists: await fs.exists(missing),
        missingIsDir: await fs.isDir(missing),
    };
});

define('df', async () => {
    const result = await fs.df();
    const out = {};
    for (const key of Object.keys(result || {}).sort()) {
        out[key] = typeof result[key];
    }
    return out;
});

define('write-returns', async () => {
    const dir = await freshDir('write-returns');
    const read = (file, encoding) => settle(() => fs.readFile(`${dir}/${file}`, encoding));
    return {
        writeUtf8: await settle(() => fs.writeFile(`${dir}/u.txt`, 'héllo', 'utf8')),
        appendUtf8: await settle(() => fs.appendFile(`${dir}/u.txt`, '!', 'utf8')),
        writeBase64: await settle(() => fs.writeFile(`${dir}/b.bin`, 'AAECAw==', 'base64')),
        appendBase64: await settle(() => fs.appendFile(`${dir}/b.bin`, 'BA==', 'base64')),
        writeAscii: await settle(() => fs.writeFile(`${dir}/a.bin`, [104, 105], 'ascii')),
        appendAscii: await settle(() => fs.appendFile(`${dir}/a.bin`, [33], 'ascii')),
        writeUri: await settle(() => fs.writeFile(`${dir}/copy.txt`, `${dir}/u.txt`, 'uri')),
        appendUri: await settle(() => fs.appendFile(`${dir}/copy.txt`, `${dir}/u.txt`, 'uri')),
        createUtf8: await settle(() => fs.createFile(`${dir}/c1.txt`, 'c', 'utf8')),
        createAscii: await settle(() => fs.createFile(`${dir}/c2.txt`, [99], 'ascii')),
        createBase64: await settle(() => fs.createFile(`${dir}/c3.bin`, 'Yw==', 'base64')),
        createUri: await settle(() => fs.createFile(`${dir}/c4.txt`, `${dir}/c1.txt`, 'uri')),
        writeNested: await settle(() => fs.writeFile(`${dir}/x/y/z.txt`, 'z', 'utf8')),
        contents: {
            u: await read('u.txt', 'utf8'),
            b: await read('b.bin', 'base64'),
            a: await read('a.bin', 'ascii'),
            copy: await read('copy.txt', 'utf8'),
            c2: await read('c2.txt', 'utf8'),
            c3: await read('c3.bin', 'utf8'),
            c4: await read('c4.txt', 'utf8'),
            nested: await read('x/y/z.txt', 'utf8'),
        },
    };
});

define('read-encodings', async () => {
    const dir = await freshDir('read-encodings');
    const file = `${dir}/bytes.bin`;
    // 68 c3 a9 00 ff 41: "h", "é" in UTF-8, NUL, a byte that is never valid UTF-8, "A"
    await fs.createFile(file, 'aMOpAP9B', 'base64');
    return {
        base64: await settle(() => fs.readFile(file, 'base64')),
        ascii: await settle(() => fs.readFile(file, 'ascii')),
        utf8CodePoints: await settle(async () => Array.from(await fs.readFile(file, 'utf8'), (c) => c.codePointAt(0))),
    };
});

define('errors-read', async () => {
    const dir = await freshDir('errors-read');
    const file = `${dir}/file.txt`;
    const missing = `${dir}/missing.txt`;
    await fs.createFile(file, 'x', 'utf8');
    return {
        readFileMissing: await settle(() => fs.readFile(missing, 'utf8')),
        readFileDir: await settle(() => fs.readFile(dir, 'utf8')),
        statMissing: await settle(() => fs.stat(missing)),
        lstatMissing: await settle(() => fs.ls(missing, {stats: true})),
        lsMissing: await settle(() => fs.ls(missing)),
        lsFile: await settle(() => fs.ls(file)),
        hashMissing: await settle(() => fs.hash(missing, 'md5')),
        hashDir: await settle(() => fs.hash(dir, 'md5')),
        hashUnknownAlgorithm: await settle(() => fs.hash(file, 'sha999')),
        sliceMissing: await settle(() => fs.slice(missing, `${dir}/slice.txt`, 1, 2)),
        readStreamMissing: await readStreamSummary(missing, 'utf8', 4096),
    };
});

define('errors-write', async () => {
    const dir = await freshDir('errors-write');
    const file = `${dir}/file.txt`;
    const other = `${dir}/other.txt`;
    const missing = `${dir}/missing.txt`;
    await fs.createFile(file, 'x', 'utf8');
    await fs.createFile(other, 'y', 'utf8');
    return {
        unlinkMissing: await settle(() => fs.unlink(missing)),
        mkdirExistingDir: await settle(() => fs.mkdir(dir)),
        mkdirExistingFile: await settle(() => fs.mkdir(file)),
        cpMissing: await settle(() => fs.cp(missing, `${dir}/cp.txt`)),
        cpOntoExisting: await settle(() => fs.cp(file, other)),
        mvMissing: await settle(() => fs.mv(missing, `${dir}/mv.txt`)),
        createFileExisting: await settle(() => fs.createFile(file, 'z', 'utf8')),
        createFileUriMissing: await settle(() => fs.createFile(`${dir}/from-uri.txt`, missing, 'uri')),
        writeFileOntoDir: await settle(() => fs.writeFile(dir, 'z', 'utf8')),
        writeStreamOntoDir: await settle(() => fs.writeStream(dir, 'utf8', false)),
        writeInvalidBase64: await settle(() => fs.writeFile(`${dir}/bad.bin`, '@@@@', 'base64')),
        afterwards: {
            other: await settle(() => fs.readFile(other, 'utf8')),
            file: await settle(() => fs.readFile(file, 'utf8')),
            bad: await settle(() => fs.readFile(`${dir}/bad.bin`, 'base64')),
        },
    };
});

define('cp-mv', async () => {
    const dir = await freshDir('cp-mv');
    const file = `${dir}/file.txt`;
    await fs.createFile(file, 'payload', 'utf8');
    return {
        cp: await settle(() => fs.cp(file, `${dir}/copy.txt`)),
        cpIntoMissingDir: await settle(() => fs.cp(file, `${dir}/nested/copy.txt`)),
        mv: await settle(() => fs.mv(`${dir}/copy.txt`, `${dir}/moved.txt`)),
        mvIntoMissingDir: await settle(() => fs.mv(`${dir}/moved.txt`, `${dir}/nested2/moved.txt`)),
        listing: (await fs.ls(dir)).map(describeValue).sort(),
        nested: await settle(() => fs.ls(`${dir}/nested`)),
        nested2: await settle(() => fs.ls(`${dir}/nested2`)),
    };
});

define('slice', async () => {
    const dir = await freshDir('slice');
    const file = `${dir}/letters.txt`;
    await fs.createFile(file, 'abcdefghij', 'utf8');
    const sliceTo = async (name, start, end) => {
        const result = await settle(() => fs.slice(file, `${dir}/${name}`, start, end));
        return {result, content: await settle(() => fs.readFile(`${dir}/${name}`, 'utf8'))};
    };
    return {
        middle: await sliceTo('middle.txt', 2, 5),
        pastEnd: await sliceTo('past-end.txt', 5, 100),
        negativeStart: await sliceTo('negative.txt', -3),
        empty: await sliceTo('empty.txt', 4, 4),
    };
});

define('hash-algorithms', async () => {
    const dir = await freshDir('hash-algorithms');
    const empty = `${dir}/empty.txt`;
    const bytes = `${dir}/bytes.bin`;
    await fs.createFile(empty, '', 'utf8');
    await fs.createFile(bytes, bytesToBase64(range(256, (i) => i)), 'base64');
    const out = {};
    for (const algorithm of ['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512']) {
        out[algorithm] = {
            empty: await settleRaw(() => fs.hash(empty, algorithm)),
            bytes: await settleRaw(() => fs.hash(bytes, algorithm)),
        };
    }
    out.upperCaseName = await settleRaw(() => fs.hash(bytes, 'SHA256'));
    return out;
});

define('readstream-base64', async () => {
    const dir = await freshDir('readstream-base64');
    const file = `${dir}/bytes.bin`;
    const bytes = range(3000, (i) => i % 256);
    const full = bytesToBase64(bytes);
    await fs.createFile(file, full, 'base64');
    const check = (chunks) => ({
        concatenationIsFileBase64: chunks.join('') === full,
        decodedChunksAreFileBytes: fnv1a(chunks.flatMap(base64ToBytes)) === fnv1a(bytes),
    });
    return {
        buffer1000: await readStreamSummary(file, 'base64', 1000, check),
        buffer1002: await readStreamSummary(file, 'base64', 1002, check),
        buffer4096: await readStreamSummary(file, 'base64', 4096, check),
    };
});

define('readstream-ascii', async () => {
    const dir = await freshDir('readstream-ascii');
    const file = `${dir}/bytes.bin`;
    const bytes = range(3000, (i) => i % 256);
    await fs.createFile(file, bytesToBase64(bytes), 'base64');
    const check = (chunks) => ({
        flattenedAreFileBytes: fnv1a(chunks.flat()) === fnv1a(bytes),
        elementTypes: [...new Set(chunks.flat().map((b) => typeof b))],
    });
    return {
        buffer1000: await readStreamSummary(file, 'ascii', 1000, check),
    };
});

define('readstream-utf8', async () => {
    const dir = await freshDir('readstream-utf8');
    const file = `${dir}/text.txt`;
    // 700 two-byte characters, so a 1001-byte buffer splits one of them.
    const text = 'é'.repeat(700) + 'abc';
    await fs.writeFile(file, text, 'utf8');
    const check = (chunks) => ({
        joinedIsText: chunks.join('') === text,
        replacementCharacters: (chunks.join('').match(/�/g) || []).length,
    });
    return {
        buffer1001: await readStreamSummary(file, 'utf8', 1001, check),
        buffer4096: await readStreamSummary(file, 'utf8', 4096, check),
    };
});

define('writestream', async () => {
    const dir = await freshDir('writestream');
    const out = {};

    // Writing to a closed stream is deliberately not a case: Android's writeChunk
    // dereferences the removed stream outside its try block, and the resulting
    // NullPointerException takes the whole app down, which no golden can record.
    const utf8 = await fs.writeStream(`${dir}/utf8.txt`, 'utf8', false);
    out.utf8Write = await settle(async () => (await utf8.write('ab')) === utf8);
    await utf8.write('cd');
    out.utf8Close = await settle(() => utf8.close());

    const appended = await fs.writeStream(`${dir}/utf8.txt`, 'utf8', true);
    await appended.write('ef');
    await appended.close();
    out.utf8Content = await settle(() => fs.readFile(`${dir}/utf8.txt`, 'utf8'));

    const b64 = await fs.writeStream(`${dir}/b64.bin`, 'base64', false);
    await b64.write('AAE=');
    await b64.write('Ag==');
    await b64.close();
    out.base64Content = await settle(() => fs.readFile(`${dir}/b64.bin`, 'base64'));

    const ascii = await fs.writeStream(`${dir}/ascii.bin`, 'ascii', false);
    out.asciiWrite = await settle(async () => (await ascii.write([1, 2])) === ascii);
    await ascii.write([3]);
    out.asciiNonArray = await settle(() => ascii.write('not an array'));
    await ascii.close();
    out.asciiContent = await settle(() => fs.readFile(`${dir}/ascii.bin`, 'base64'));

    out.nestedParents = await settle(async () => {
        const nested = await fs.writeStream(`${dir}/n1/n2/file.txt`, 'utf8', false);
        await nested.write('nested');
        await nested.close();
        return fs.readFile(`${dir}/n1/n2/file.txt`, 'utf8');
    });
    return out;
});

// A base64 chunk is read by the rule fs.writeFile uses (1.2.0): a line break and
// missing padding are accepted, and a chunk that is not base64 rejects EINVAL and
// writes nothing, so the stream goes on with the next chunk.
define('writestream-base64-chunks', async () => {
    const dir = await freshDir('writestream-base64-chunks');
    const file = `${dir}/b64.bin`;
    const stream = await fs.writeStream(file, 'base64', false);
    const out = {};
    out.wrappedUnpadded = await settle(async () => (await stream.write('QUJD\nRA')) === stream);
    out.notBase64 = await settle(() => stream.write('@@@@'));
    out.next = await settle(async () => (await stream.write('RQ==')) === stream);
    await stream.close();
    out.content = await settle(() => fs.readFile(file, 'base64'));
    return out;
});

define('session-dispose', async () => {
    const dir = await freshDir('session-dispose');
    const a = `${dir}/a.txt`;
    const b = `${dir}/b.txt`;
    await fs.createFile(a, 'a', 'utf8');
    await fs.createFile(b, 'b', 'utf8');
    const session = ReactNativeBlobUtil.session(`parity-session-${Date.now()}`);
    session.add(a).add(b);
    const listed = session.list().map(describeValue);
    const dispose = await settle(() => session.dispose());
    return {
        listed,
        dispose,
        aExists: await fs.exists(a),
        bExists: await fs.exists(b),
        disposeMissing: await settle(() => ReactNativeBlobUtil.session(`parity-missing-${Date.now()}`).add(`${dir}/never.txt`).dispose()),
    };
});

define('fetch-text', async (ctx) => {
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/text'));
    return {info: infoSummary(res.info()), type: res.type, dataType: typeof res.data, text: describeValue(await res.text())};
});

define('fetch-json', async (ctx) => {
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/health'));
    return {info: infoSummary(res.info()), type: res.type, json: describeValue(await res.json())};
});

define('fetch-binary-base64', async (ctx) => {
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/binary'));
    const expected = bytesToBase64(range(256, (i) => i));
    const b64 = await res.base64();
    return {info: infoSummary(res.info()), type: res.type, base64MatchesBytes: b64 === expected, length: b64.length};
});

define('fetch-file-cache', async (ctx) => {
    const res = await ReactNativeBlobUtil.config({fileCache: true, appendExt: 'bin'}).fetch('GET', ctx.url('/binary'));
    const path = res.path();
    const expected = bytesToBase64(range(256, (i) => i));
    return {
        info: infoSummary(res.info()),
        type: res.type,
        path: describeValue(path),
        extension: String(path).split('.').pop(),
        size: (await fs.stat(path)).size,
        contentMatches: (await fs.readFile(path, 'base64')) === expected,
        flush: await settle(() => res.flush()),
        existsAfterFlush: await fs.exists(path),
    };
});

define('fetch-path', async (ctx) => {
    const dir = await freshDir('fetch-path');
    const target = `${dir}/nested/download.bin`;
    const res = await ReactNativeBlobUtil.config({path: target}).fetch('GET', ctx.url('/binary'));
    return {
        info: infoSummary(res.info()),
        type: res.type,
        path: describeValue(res.path()),
        exists: await fs.exists(target),
        size: (await fs.stat(target)).size,
    };
});

define('fetch-key-cache', async (ctx) => {
    const key = `parity-key-${Date.now()}`;
    const first = await ReactNativeBlobUtil.config({fileCache: true, key}).fetch('GET', ctx.url('/binary'));
    const second = await ReactNativeBlobUtil.config({fileCache: true, key}).fetch('GET', ctx.url('/binary'));
    return {
        firstType: first.type,
        firstPath: describeValue(first.path()),
        secondType: second.type,
        secondInfo: infoSummary(second.info()),
        samePath: first.path() === second.path(),
    };
});

// A `key` keeps a response that arrived whole with a success status, nothing
// else. The response was written to the key's file as it came in, so a download
// cut short, or a 404 with its error page, was the cached file from then on:
// every later request with the key resolved with it and asked no server.
define('fetch-key-cache-incomplete', async (ctx) => {
    const stamp = Date.now();
    const keyed = (key, url) => settle(async () => {
        const res = await ReactNativeBlobUtil.config({fileCache: true, key}).fetch('GET', url);
        const status = res.info().status;
        return {status: status == null ? null : status, size: (await fs.stat(res.path())).size};
    });

    const errorToken = `parity-key-404-${stamp}`;
    const errorUrl = ctx.url(`/count?token=${errorToken}&status=404`);
    const notFound = await keyed(errorToken, errorUrl);
    const notFoundAgain = await keyed(errorToken, errorUrl);
    const errorHits = (await (await ReactNativeBlobUtil.fetch('GET', ctx.url(`/count/hits?token=${errorToken}`))).json()).hits;

    // The server closes the connection after 3000 of 8192 bytes, once.
    const cutToken = `parity-key-cut-${stamp}`;
    const cutUrl = ctx.url(`/range?token=${cutToken}&size=8192&drop=3000&ms=20`);
    const cut = await keyed(cutToken, cutUrl);
    const whole = await keyed(cutToken, cutUrl);
    const cached = await keyed(cutToken, cutUrl);
    return {
        notFound,
        notFoundAgain,
        errorRequests: errorHits,
        cutRejected: 'rejected' in cut,
        whole,
        cached,
        cutRequests: (await rangeLog(ctx, cutToken)).length,
    };
});

define('fetch-status', async (ctx) => {
    const fetchStatus = (code) => settle(async () => {
        const res = await ReactNativeBlobUtil.fetch('GET', ctx.url(`/status/${code}`));
        return {status: res.info().status, respType: res.info().respType, text: await res.text()};
    });
    return {s201: await fetchStatus(201), s404: await fetchStatus(404), s500: await fetchStatus(500)};
});

define('fetch-redirect', async (ctx) => {
    const follow = await settle(async () => {
        const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/redirect-twice'));
        return {status: res.info().status, redirects: collapseRepeats(res.info().redirects), text: await res.text()};
    });
    const noFollow = await settle(async () => {
        const res = await ReactNativeBlobUtil.config({followRedirect: false}).fetch('GET', ctx.url('/redirect'));
        return {status: res.info().status, redirects: collapseRepeats(res.info().redirects), headers: headerSummary(res.info().headers), text: await res.text()};
    });
    return {follow, noFollow};
});

// Authorization follows a redirect within one origin and no further: not to
// another port or scheme of the same host. Windows compared the host only, so
// the header went on to the other server. Any other header follows.
define('fetch-redirect-authorization', async (ctx) => {
    const seen = (to) => settle(async () => {
        const res = await ReactNativeBlobUtil.config({trusty: true})
            .fetch('GET', ctx.url(`/redirect-to?to=${encodeURIComponent(to)}`), {Authorization: 'Bearer parity', 'X-RNBU-E2E': 'kept'});
        const echo = await res.json();
        return {status: res.info().status, authorization: echo.authorization, custom: echo.custom};
    });
    return {sameOrigin: await seen('/echo'), otherPortAndScheme: await seen(ctx.httpsUrl('/echo'))};
});

define('fetch-timeout', async (ctx) => {
    const started = Date.now();
    const result = await settle(async () => {
        const res = await ReactNativeBlobUtil.config({timeout: 1000}).fetch('GET', ctx.url('/slow?ms=5000'));
        return {status: res.info().status, text: await res.text()};
    });
    return {result, gaveUpBeforeServerAnswered: Date.now() - started < 4500};
});

define('fetch-cancel', async (ctx) => {
    const task = ReactNativeBlobUtil.fetch('GET', ctx.url('/slow?ms=3000'));
    setTimeout(() => task.cancel(), 300);
    try {
        const res = await task;
        return {resolved: {status: res.info().status}};
    } catch (err) {
        return {rejected: describeError(err), isCanceledFetchError: err instanceof ReactNativeBlobUtil.CanceledFetchError};
    }
});

/**
 * The native task registry after a task has finished. Both of these reach a
 * native method with a taskId it no longer knows about - cancelRequest and
 * enableProgressReport - which nothing else in this suite exercises. Neither
 * should throw, and neither should affect the response that already arrived.
 */
define('net-after-completion', async (ctx) => {
    // cancelRequest for a task the native registry has already dropped. Nothing
    // else in this suite reaches it: fetch-cancel cancels a task that is still
    // running. It must not throw, and must not disturb the response that has
    // already arrived.
    //
    // enableProgressReport for an unknown task is deliberately absent. The task
    // object only carries `progress` while the request is in flight - once the
    // promise has settled, `typeof task.progress` is "undefined" - so there is
    // no route to that native method through the public API, and reaching it
    // another way would not describe anything an app can do.
    const task = ReactNativeBlobUtil.fetch('GET', ctx.url('/text'));
    const res = await task;

    return {
        status: res.info().status,
        cancelAfterFinish: await settle(async () => {
            task.cancel();
            return 'returned';
        }),
        // A second cancel of the same finished task.
        cancelTwice: await settle(async () => {
            task.cancel();
            return 'returned';
        }),
        textStillReadable: await settle(() => res.text()),
    };
});

define('fetch-chunked', async (ctx) => {
    const totals = new Set();
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/chunked')).progress((written, total) => totals.add(total));
    return {
        info: infoSummary(res.info()),
        text: await res.text(),
        knownTotalReported: [...totals].some((total) => total >= 0),
    };
});

define('fetch-state-change', async (ctx) => {
    const states = [];
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/health')).stateChange((state) => states.push(state));
    return {
        sawStateChange: states.length > 0,
        stateCount: states.length,
        firstState: states.length > 0 ? infoSummary(states[0]) : null,
        info: infoSummary(res.info()),
    };
});

define('fetch-cookies', async (ctx) => {
    await ReactNativeBlobUtil.fetch('GET', ctx.url('/cookie/set'));
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/cookie/echo'));
    return {cookieSentBack: (await res.json()).cookie.includes('rnbu_e2e=cookie-value')};
});

define('fetch-errors', async () => ({
    invalidUrl: await settle(() => ReactNativeBlobUtil.fetch('GET', 'http://')),
    refused: await settle(() => ReactNativeBlobUtil.config({timeout: 5000}).fetch('GET', 'http://127.0.0.1:9/')),
}));

// The e2e server's certificate is signed by the test CA, which the app does not
// trust unless customCACerts names it: the handshake must fail with ESSL.
define('fetch-untrusted-cert', async (ctx) => ({
    untrusted: await settle(async () => {
        const res = await ReactNativeBlobUtil.config({timeout: 5000}).fetch('GET', ctx.httpsUrl('/health'));
        return {status: res.info().status};
    }),
}));

define('upload-bodies', async (ctx) => {
    const dir = await freshDir('upload-bodies');
    const file = `${dir}/upload.txt`;
    await fs.createFile(file, 'file body ✓', 'utf8');
    const echo = async (method, headers, body) => echoSummary(await (await ReactNativeBlobUtil.fetch(method, ctx.url('/echo'), headers, body)).json());
    return {
        plainNoHeaders: await settle(() => echo('POST', {'X-RNBU-E2E': 'hello'}, 'plain body ✓')),
        octetBase64: await settle(() => echo('POST', {'Content-Type': 'application/octet-stream'}, 'AAEC/w==')),
        textPlainBase64: await settle(() => echo('POST', {'Content-Type': 'text/plain'}, 'AAEC/w==')),
        wrappedFile: await settle(() => echo('POST', {'Content-Type': 'application/octet-stream'}, ReactNativeBlobUtil.wrap(file))),
        chunked: await settle(() => echo('POST', {'Content-Type': 'text/plain', 'Transfer-Encoding': 'Chunked'}, 'chunked body')),
        put: await settle(() => echo('PUT', {'Content-Type': 'text/plain'}, 'put body')),
        emptyPost: await settle(() => echo('POST', {}, '')),
    };
});

define('upload-multipart', async (ctx) => {
    const dir = await freshDir('upload-multipart');
    const file = `${dir}/wrapped.txt`;
    await fs.createFile(file, 'wrapped file content', 'utf8');
    const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'multipart/form-data'}, [
        {name: 'text', data: 'plain value'},
        {name: 'json', data: JSON.stringify({a: 1})},
        {name: 'base64file', filename: 'bytes.bin', type: 'application/octet-stream', data: 'AAEC/w=='},
        {name: 'wrapped', filename: 'wrapped.txt', type: 'text/plain', data: ReactNativeBlobUtil.wrap(file)},
        {name: 'untyped', filename: 'untyped.dat', data: 'AAEC/w=='},
        {name: 'unicode', data: 'héllo ✓'},
    ]);
    return echoSummary(await res.json());
});

// What a part holds is the part's, whatever it looks like. Windows sent the
// constant boundary "-----", so a row of dashes at the start of a line ended a
// part: the Markdown rule below cut the upload short there, and the note added
// a "role" field of its own. iOS used the time in milliseconds, which content
// written for an upload can guess. The boundary is random on every platform.
define('upload-multipart-dashes', async (ctx) => {
    const dir = await freshDir('upload-multipart-dashes');
    const file = `${dir}/notes.md`;
    await fs.createFile(file, 'Title\r\n-------\r\nBody\r\n---------\r\nEnd', 'utf8');
    const note = 'before\r\n-------\r\nContent-Disposition: form-data; name="role"\r\n\r\nadmin\r\n-------\r\nafter';
    const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'multipart/form-data'}, [
        {name: 'note', data: {text: note}},
        {name: 'notes', filename: 'notes.md', type: 'text/markdown', data: {file}},
        {name: 'last', data: {text: 'still here'}},
    ]);
    const echo = await res.json();
    return {
        method: echo.method,
        names: Array.isArray(echo.parts) ? echo.parts.map((part) => part.name) : null,
        noteArrivedWhole: Array.isArray(echo.parts) && echo.parts.length > 0 && echo.parts[0].text === note,
        parts: raw(echo.parts),
    };
});

// 1.0: JS decides what a body is and native obeys. The explicit forms are never
// guessed from the Content-Type or a prefix, bytes go as base64, DELETE sends its
// body, a missing file fails instead of uploading an empty one, GET with a body
// is refused, and a multipart part's kind decides its content.
define('upload-explicit', async (ctx) => {
    const dir = await freshDir('upload-explicit');
    const file = `${dir}/explicit.txt`;
    await fs.createFile(file, 'explicit file ✓', 'utf8');
    const echo = async (method, headers, body) => echoSummary(await (await ReactNativeBlobUtil.fetch(method, ctx.url('/echo'), headers, body)).json());
    return {
        // The body names a real file, so the bytes sent depend on the absolute path
        // (a new container UUID per iOS install, the home directory on CI): record
        // that it went out as exactly that text, not the text itself.
        textThatLooksLikeAFile: await settle(async () => {
            const sent = `ReactNativeBlobUtil-file://${file}`;
            const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'application/octet-stream'}, {text: sent});
            const received = await res.json();
            return {
                method: received.method,
                contentType: received.contentType,
                textIsThePath: received.text === sent,
                // The path is ASCII, so its length is its byte count.
                bytesMatchText: received.bytes === sent.length,
            };
        }),
        base64WithoutType: await settle(() => echo('POST', {}, {base64: 'AAEC/w=='})),
        bytes: await settle(() => echo('POST', {'Content-Type': 'application/octet-stream'}, new Uint8Array([0, 1, 2, 255]))),
        file: await settle(() => echo('PUT', {'Content-Type': 'text/plain'}, {file})),
        deleteWithBody: await settle(() => echo('DELETE', {'Content-Type': 'text/plain'}, 'delete body')),
        missingFile: await settle(() => echo('POST', {'Content-Type': 'text/plain'}, {file: `${dir}/missing.txt`})),
        getWithBody: await settle(() => echo('GET', {}, 'x')),
        multipart: await settle(() => echo('POST', {'Content-Type': 'multipart/form-data'}, [
            {name: 'base64NoName', data: {base64: 'AAEC/w=='}},
            {name: 'textWithName', filename: 't.txt', type: 'text/plain', data: {text: 'AAEC/w=='}},
            {name: 'fileNoName', type: 'text/plain', data: {file}},
        ])),
    };
});

// A {base64} body is bytes, whatever it starts with. One that starts with the
// file prefix was read as the file it named on Android, so data an app passed
// on as bytes could pick one of the app's own files for the upload. What a
// platform makes of the text as base64 differs and is not recorded; that the
// file stays where it is, is.
define('upload-base64-file-prefix', async (ctx) => {
    const dir = await freshDir('upload-base64-file-prefix');
    const file = `${dir}/private.txt`;
    await fs.createFile(file, 'private file content', 'utf8');
    const sent = async (body) => {
        try {
            const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'application/octet-stream'}, body);
            return {sentTheFile: String((await res.json()).text).includes('private file content')};
        } catch (err) {
            return {sentTheFile: false};
        }
    };
    return {
        base64: await sent({base64: `ReactNativeBlobUtil-file://${file}`}),
        text: await sent({text: `ReactNativeBlobUtil-file://${file}`}),
        file: await sent({file}),
    };
});

define('android-media-store', async (ctx) => {
    const source = await ReactNativeBlobUtil.config({fileCache: true}).fetch('GET', ctx.url('/image.png'));
    const dir = await freshDir('android-media-store');
    const MC = ReactNativeBlobUtil.media;
    const stamp = Date.now();

    const copied = await settle(() => MC.copyToMediaStore({name: `parity-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download', source.path()));
    const uri = copied.resolved;
    const out = {copied};
    if (typeof uri === 'string') {
        const raw = await MC.copyToMediaStore({name: `parity-b-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download', source.path());
        out.getBlobBase64 = await settle(async () => {
            const blob = await MC.read(raw, 'base64');
            return {kind: Array.isArray(blob) ? 'array' : typeof blob, matchesPng: blob === PNG_BASE64};
        });
        out.copyToInternal = await settle(() => MC.copyToInternal(raw, `${dir}/copy.png`));
        out.internalCopyMatches = await settle(async () => (await fs.readFile(`${dir}/copy.png`, 'base64')) === PNG_BASE64);
        // Error codes: these rejected with the call's name, or the whole message, as the code.
        out.copyToInternalExists = await settle(() => MC.copyToInternal(raw, `${dir}/copy.png`));
    }
    out.created = await settle(async () => {
        const created = await MC.createFile({name: `parity-c-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download');
        const written = await settle(() => MC.write(created, source.path()));
        const blob = await MC.read(created, 'base64');
        return {created, written, matchesPng: blob === PNG_BASE64};
    });
    out.createWithoutType = await settle(() => MC.createFile({name: `parity-d-${stamp}.png`, parentFolder: 'parity'}, 'Download'));
    return out;
}, ['android']);

// content:// URIs are opened through ContentResolver, never turned into a file
// path first. The forged URIs are what another app could share: a Downloads
// "raw:" id and an external-storage id that climbs out of its directory, both
// naming a private file of this app. Resolving them to paths read that file.
define('android-content-uri', async (ctx) => {
    const dir = await freshDir('android-content-uri');
    const src = `${dir}/source.txt`;
    await fs.writeFile(src, 'content via resolver ✓', 'utf8');
    const name = `parity-cu-${Date.now()}.txt`;
    const uri = await ReactNativeBlobUtil.media.copyToMediaStore({name, parentFolder: 'parity', mimeType: 'text/plain'}, 'Download', src);
    const secret = `${dir}/secret.txt`;
    await fs.writeFile(secret, 'private', 'utf8');
    const forgedRaw = 'content://com.android.providers.downloads.documents/document/' + encodeURIComponent(`raw:${secret}`);
    const forgedPrimary = 'content://com.android.externalstorage.documents/document/' + encodeURIComponent(`primary:../../../../../..${secret}`);
    return {
        readUtf8: await settle(() => fs.readFile(uri, 'utf8')),
        readBase64: await settle(() => fs.readFile(uri, 'base64')),
        stat: await settle(async () => {
            const s = await fs.stat(uri);
            return {filename: s.filename === name, pathIsUri: s.path === uri, size: s.size, type: s.type};
        }),
        exists: await settle(() => fs.exists(uri)),
        isDir: await settle(() => fs.isDir(uri)),
        hash: await settle(() => fs.hash(uri, 'md5')),
        cp: await settle(async () => {
            await fs.cp(uri, `${dir}/cp.txt`);
            return fs.readFile(`${dir}/cp.txt`, 'utf8');
        }),
        ls: await settle(() => fs.ls(uri)),
        mv: await settle(() => fs.mv(uri, `${dir}/mv.txt`)),
        uploadWrapped: await settle(async () => {
            const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'text/plain'}, ReactNativeBlobUtil.wrap(uri));
            return (await res.json()).text;
        }),
        uploadMultipart: await settle(async () => {
            const res = await ReactNativeBlobUtil.fetch('POST', ctx.url('/echo'), {'Content-Type': 'multipart/form-data'}, [
                {name: 'file', filename: 'cu.txt', type: 'text/plain', data: ReactNativeBlobUtil.wrap(uri)},
                // The file prefix in front of a content URI, as apps wrote it by hand
                // before wrap() learned the content prefix.
                {name: 'prefixed', filename: 'cu2.txt', type: 'text/plain', data: `ReactNativeBlobUtil-file://${uri}`},
            ]);
            return (await res.json()).parts.map((part) => part.text);
        }),
        forgedRawRead: await settle(() => fs.readFile(forgedRaw, 'utf8')),
        forgedRawStat: await settle(async () => (await fs.stat(forgedRaw)).size),
        forgedPrimaryRead: await settle(() => fs.readFile(forgedPrimary, 'utf8')),
        forgedRawUnlink: await settle(async () => {
            await fs.unlink(forgedRaw);
            return fs.exists(secret);
        }),
        unlink: await settle(() => fs.unlink(uri)),
        existsAfterUnlink: await settle(() => fs.exists(uri)),
    };
}, ['android']);

define('android-misc', async () => {
    const dir = await freshDir('android-misc');
    const file = `${dir}/scan.txt`;
    await fs.createFile(file, 'scan me', 'utf8');
    return {
        sdCardDir: await settle(() => ReactNativeBlobUtil.fs.sdCardDir()),
        sdCardApplicationDir: await settle(() => ReactNativeBlobUtil.fs.sdCardApplicationDir()),
        scanFile: await settle(() => ReactNativeBlobUtil.media.scan([{path: file, mime: 'text/plain'}])),
        addCompleteDownload: await settle(() => ReactNativeBlobUtil.media.addDownload({
            title: 'parity',
            description: 'parity',
            mime: 'text/plain',
            path: file,
            showNotification: false,
        })),
    };
}, ['android']);

// A download through the DownloadManager resolves with the file the DownloadManager
// wrote. It never replaces a file, so a second download to one path went to
// `name-1` and resolved with the old file; a "#" or "%20" in the name sent the file
// to another name and the request failed; without a path it resolved with a path in
// the DownloadManager's own cache, which the app cannot open; and a destination the
// DownloadManager refuses ended the app.
define('android-download-manager', async (ctx) => {
    const dir = `${fs.dirs.DownloadDir}/parity-dm`;
    if (await fs.exists(dir)) {
        await fs.unlink(dir);
    }
    await fs.mkdir(dir);
    const expected = bytesToBase64(range(256, (i) => i));
    const download = (downloadManager, extra = {}, route = '/binary') => ReactNativeBlobUtil.config({
        ...extra,
        android: {
            downloadManager: {
                useDownloadManager: true,
                notification: true,
                title: 'parity-dm',
                mime: 'application/octet-stream',
                ...downloadManager,
            },
        },
    }).fetch('GET', ctx.url(route));
    const matches = async (path) => (await fs.readFile(path, 'base64')) === expected;
    const listing = async () => [...await fs.ls(dir)].sort();
    const target = `${dir}/a b#1 %20.bin`;

    return {
        named: await settle(async () => {
            const path = (await download({path: target})).path();
            return {atTarget: path === target, matches: await matches(path)};
        }),
        again: await settle(async () => {
            const path = (await download({path: target})).path();
            return {atTarget: path === target, matches: await matches(path), files: await listing()};
        }),
        keepExisting: await settle(async () => {
            const path = (await download({path: target}, {overwrite: false})).path();
            return {path: describeValue(path), matches: await matches(path), files: await listing()};
        }),
        noPath: await settle(async () => {
            const uri = (await download({})).path();
            const out = {uri: String(uri).replace(/\d+$/, '<id>'), matches: await matches(uri)};
            await fs.unlink(uri);
            return out;
        }),
        storeLocal: await settle(async () => {
            const path = (await download({storeLocal: true})).path();
            const out = {insideDownloadDir: path.startsWith(`${fs.dirs.DownloadDir}/`), matches: await matches(path)};
            await fs.unlink(path);
            return out;
        }),
        httpError: await settle(() => download({path: `${dir}/missing.bin`}, {}, '/status/404')),
        refusedDestination: await settle(() => download({path: `${fs.dirs.DocumentDir}/parity-dm.bin`})),
        cancel: await settle(() => {
            const task = download({path: `${dir}/cancelled.bin`}, {}, '/slow?ms=5000');
            setTimeout(() => task.cancel(), 300);
            return task;
        }),
    };
}, ['android']);

// ---------------------------------------------------------------------------
// 1.2.0 file-system additions

// A Uint8Array reaches the golden as its kind and its bytes.
const bytesSummary = (value) => ({
    kind: value instanceof Uint8Array ? 'Uint8Array' : Array.isArray(value) ? 'array' : typeof value,
    bytes: value instanceof Uint8Array || Array.isArray(value) ? Array.from(value) : describeValue(value),
});

define('fs-read-range', async () => {
    const dir = await freshDir('fs-read-range');
    const file = `${dir}/bytes.bin`;
    // 68 c3 a9 00 ff 41
    await fs.createFile(file, 'aMOpAP9B', 'base64');
    const read = (options) => settle(() => fs.read(file, options));
    return {
        all: await settle(async () => Array.from(await fs.read(file), (c) => c.codePointAt(0))),
        allBase64: await read({encoding: 'base64'}),
        middle: await read({position: 1, length: 2, encoding: 'base64'}),
        tail: await read({position: 4, encoding: 'base64'}),
        brokenCharacter: await settle(async () => Array.from(await fs.read(file, {length: 2}), (c) => c.codePointAt(0))),
        ascii: await read({position: 3, encoding: 'ascii'}),
        bytes: await settle(async () => bytesSummary(await fs.read(file, {position: 1, length: 3, encoding: 'bytes'}))),
        zeroLength: await read({position: 2, length: 0, encoding: 'base64'}),
        pastTheEnd: await read({position: 100, encoding: 'base64'}),
        lengthPastTheEnd: await read({position: 5, length: 100, encoding: 'base64'}),
        missing: await settle(() => fs.read(`${dir}/missing.bin`)),
        directory: await settle(() => fs.read(dir)),
        negative: await settle(() => fs.read(file, {position: -1})),
    };
});

define('fs-write-range', async () => {
    const dir = await freshDir('fs-write-range');
    const file = `${dir}/text.txt`;
    await fs.writeFile(file, 'abcdef', 'utf8');
    const content = () => settle(() => fs.readFile(file, 'base64'));
    const out = {};
    out.overwrite = await settle(() => fs.write(file, 'XY', {position: 2}));
    out.afterOverwrite = await settle(() => fs.readFile(file, 'utf8'));
    out.append = await settle(() => fs.write(file, '!'));
    out.afterAppend = await settle(() => fs.readFile(file, 'utf8'));
    out.pastTheEnd = await settle(() => fs.write(file, [0x7a], {position: 9, encoding: 'ascii'}));
    out.afterPastTheEnd = await content();
    out.bytes = await settle(() => fs.write(file, new Uint8Array([1, 2]), {position: 0}));
    out.afterBytes = await content();
    out.utf8 = await settle(() => fs.write(file, 'é', {position: 3}));
    out.afterUtf8 = await content();
    out.newFile = await settle(() => fs.write(`${dir}/new.txt`, 'fresh', {position: 0}));
    out.newFileContent = await settle(() => fs.readFile(`${dir}/new.txt`, 'utf8'));
    out.missingDirectory = await settle(() => fs.write(`${dir}/no/such/dir.txt`, 'x'));
    out.directory = await settle(() => fs.write(dir, 'x'));
    out.badPosition = await settle(() => fs.write(file, 'x', {position: 1.5}));
    return out;
});

define('fs-touch', async () => {
    const dir = await freshDir('fs-touch');
    const file = `${dir}/touched.txt`;
    const statOf = async (path) => {
        const stat = await fs.stat(path);
        return {size: stat.size, lastModified: stat.lastModified, created: stat.created};
    };
    const out = {};
    out.create = await settle(() => fs.touch(file, {mtime: 1500000000000}));
    // Without a ctime the creation time is the platform's own: none on Android,
    // pulled back to the mtime on iOS, the moment the file was made on Windows,
    // which differs on every run.
    out.created = await settle(async () => {
        const stat = await statOf(file);
        const created = stat.created === null || stat.created === 1500000000000 ? stat.created : timeKind(stat.created);
        return {...stat, created};
    });
    await fs.writeFile(file, 'kept', 'utf8');
    out.times = await settle(() => fs.touch(file, {mtime: new Date(1600000000000), ctime: 1400000000000}));
    out.afterTimes = await settle(() => statOf(file));
    out.contentKept = await settle(() => fs.readFile(file, 'utf8'));
    out.directory = await settle(() => fs.touch(dir, {mtime: 1500000000000}));
    out.directoryTime = await settle(async () => (await fs.stat(dir)).lastModified);
    out.now = await settle(async () => {
        await fs.touch(file);
        return timeKind((await fs.stat(file)).lastModified);
    });
    out.missingDirectory = await settle(() => fs.touch(`${dir}/no/such.txt`));
    out.badTime = await settle(() => fs.touch(file, {mtime: 'yesterday'}));
    return out;
});

define('fs-created', async () => {
    const dir = await freshDir('fs-created');
    await fs.createFile(`${dir}/a.txt`, 'a', 'utf8');
    const kind = (value) => (value === null ? null : timeKind(value));
    const [entry] = await fs.ls(dir, {stats: true});
    return {
        file: kind((await fs.stat(`${dir}/a.txt`)).created),
        directory: kind((await fs.stat(dir)).created),
        lsEntry: kind(entry.created),
    };
});

define('fs-bytes', async () => {
    const dir = await freshDir('fs-bytes');
    const file = `${dir}/bytes.bin`;
    const out = {};
    out.writeTyped = await settle(() => fs.writeFile(file, new Uint8Array([0, 1, 254, 255])));
    out.appendBuffer = await settle(() => fs.appendFile(file, new Uint8Array([7, 8]).buffer));
    out.appendView = await settle(() => fs.appendFile(file, new Uint8Array([1, 2, 3, 4]).subarray(1, 3)));
    out.readBytes = await settle(async () => bytesSummary(await fs.readFile(file, 'bytes')));
    out.readBytesOption = await settle(async () => bytesSummary(await fs.readFile(file, {encoding: 'bytes'})));
    out.createBytes = await settle(() => fs.createFile(`${dir}/created.bin`, new Uint8Array([104, 105])));
    out.created = await settle(() => fs.readFile(`${dir}/created.bin`, 'utf8'));
    out.empty = await settle(async () => {
        await fs.writeFile(`${dir}/empty.bin`, new Uint8Array(0));
        return bytesSummary(await fs.readFile(`${dir}/empty.bin`, 'bytes'));
    });
    return out;
});

define('fs-file-urls', async () => {
    const dir = await freshDir('fs-file-urls');
    const path = `${dir}/a b#1 %20.txt`;
    const url = 'file://' + encodeURI(path).replace(/#/g, '%23');
    const out = {};
    out.write = await settle(() => fs.writeFile(url, 'by url', 'utf8'));
    out.readByPath = await settle(() => fs.readFile(path, 'utf8'));
    out.readByUrl = await settle(() => fs.readFile(url, 'utf8'));
    out.exists = await settle(() => fs.exists(url));
    out.stat = await settle(async () => (await fs.stat(url)).filename);
    out.ls = await settle(() => fs.ls('file://' + encodeURI(dir)));
    out.cp = await settle(() => fs.cp(url, `file://${encodeURI(dir)}/copy.txt`));
    out.copy = await settle(() => fs.readFile(`${dir}/copy.txt`, 'utf8'));
    out.hash = await settle(() => fs.hash(url, 'md5'));
    out.unlink = await settle(() => fs.unlink(url));
    out.gone = await settle(() => fs.exists(path));
    return out;
});

define('fs-cp-dir', async () => {
    const dir = await freshDir('fs-cp-dir');
    const src = `${dir}/src`;
    await fs.mkdir(`${src}/sub/deeper`);
    await fs.writeFile(`${src}/a.txt`, 'a', 'utf8');
    await fs.writeFile(`${src}/sub/b.txt`, 'bb', 'utf8');
    await fs.writeFile(`${src}/sub/deeper/c.bin`, 'AAEC', 'base64');
    const tree = async (root) => {
        const out = {};
        const walk = async (relative) => {
            for (const name of [...(await fs.ls(relative ? `${root}/${relative}` : root))].sort()) {
                const child = relative ? `${relative}/${name}` : name;
                if (await fs.isDir(`${root}/${child}`)) {
                    out[child + '/'] = 'dir';
                    await walk(child);
                } else {
                    out[child] = await fs.readFile(`${root}/${child}`, 'base64');
                }
            }
        };
        await walk('');
        return out;
    };
    const out = {};
    out.copy = await settle(() => fs.cp(src, `${dir}/copy`));
    out.tree = await settle(() => tree(`${dir}/copy`));
    out.sourceKept = await settle(() => tree(src));
    out.ontoDirectory = await settle(() => fs.cp(src, `${dir}/copy`));
    await fs.writeFile(`${dir}/file.txt`, 'f', 'utf8');
    out.ontoFile = await settle(() => fs.cp(src, `${dir}/file.txt`));
    out.ontoFileResult = await settle(() => fs.isDir(`${dir}/file.txt`));
    out.missingParent = await settle(() => fs.cp(src, `${dir}/no/such/copy`));
    out.emptyDirectory = await settle(async () => {
        await fs.mkdir(`${dir}/empty`);
        await fs.cp(`${dir}/empty`, `${dir}/empty-copy`);
        return fs.ls(`${dir}/empty-copy`);
    });
    return out;
});

define('fs-dirs-1.2', async () => {
    const out = {};
    for (const key of ['TemporaryDir', 'ExternalCacheDir', 'RoamingDir']) {
        const value = fs.dirs[key];
        out[key] = typeof value === 'string' && value !== '' ? mask(value) : describeValue(value);
    }
    out.temporaryWritable = await settle(async () => {
        const file = `${fs.dirs.TemporaryDir}/rnbu-parity.txt`;
        await fs.writeFile(file, 'tmp', 'utf8');
        const text = await fs.readFile(file, 'utf8');
        await fs.unlink(file);
        return text;
    });
    // Removable volumes depend on the device; the primary directory does not.
    out.externalDirs = await settle(async () => {
        const found = await fs.externalDirs();
        return {
            kind: Array.isArray(found) ? 'array' : typeof found,
            allStrings: found.every((dir) => typeof dir === 'string'),
            first: found.length > 0 ? found[0] : null,
        };
    });
    return out;
});

define('android-assets-resources', async () => {
    const dir = await freshDir('android-assets-resources');
    const out = {};
    out.lsAssets = await settle(async () => [...(await fs.ls(fs.asset('parity')))].sort());
    out.lsNested = await settle(() => fs.ls(fs.asset('parity/nested')));
    out.lsStats = await settle(async () => (await fs.ls(fs.asset('parity'), {stats: true}))
        .map((entry) => ({filename: entry.filename, type: entry.type, size: entry.size}))
        .sort((a, b) => a.filename.localeCompare(b.filename)));
    out.lsAssetFile = await settle(() => fs.ls(fs.asset('parity/hello.txt')));
    out.lsMissing = await settle(() => fs.ls(fs.asset('parity/missing')));
    // .txt assets are stored compressed in the APK.
    out.existsCompressed = await settle(() => fs.exists(fs.asset('parity/hello.txt')));
    out.isDirAssetDir = await settle(() => fs.isDir(fs.asset('parity')));
    out.existsMissing = await settle(() => fs.exists(fs.asset('parity/missing.txt')));
    out.statCompressed = await settle(async () => {
        const stat = await fs.stat(fs.asset('parity/hello.txt'));
        return {filename: stat.filename, type: stat.type, size: stat.size, created: stat.created};
    });
    out.statAssetDir = await settle(async () => (await fs.stat(fs.asset('parity'))).type);
    out.readAsset = await settle(() => fs.readFile(fs.asset('parity/nested/deep.txt'), 'utf8'));
    out.readRangeAsset = await settle(() => fs.read(fs.asset('parity/hello.txt'), {position: 6, length: 5}));
    // res/raw/parity_sample.txt, "hello resource" and a line break; .txt is stored compressed.
    const resource = fs.resource('raw/parity_sample');
    out.resourcePath = resource;
    out.resourceExists = await settle(() => fs.exists(resource));
    out.resourceStat = await settle(async () => {
        const stat = await fs.stat(resource);
        return {filename: stat.filename, type: stat.type, size: stat.size};
    });
    out.resourceHash = await settleRaw(() => fs.hash(resource, 'sha256'));
    out.resourceRead = await settle(() => fs.readFile(resource, 'utf8'));
    out.resourceRange = await settle(() => fs.read(resource, {position: 6, length: 8}));
    out.resourceCopy = await settle(async () => {
        await fs.cp(resource, `${dir}/copy.txt`);
        return fs.readFile(`${dir}/copy.txt`, 'utf8');
    });
    out.resourceStream = await readStreamSummary(resource, 'utf8', 6, (chunks) => chunks.join(''));
    out.missingResource = await settle(() => fs.readFile(fs.resource('raw/no_such_resource'), 'base64'));
    out.missingResourceExists = await settle(() => fs.exists(fs.resource('raw/no_such_resource')));
    out.badType = await settle(() => fs.exists(fs.resource('nosuchtype/parity_sample')));
    out.valueResource = await settle(() => fs.readFile(fs.resource('string/app_name'), 'utf8'));
    return out;
}, ['android']);

define('ios-attributes', async () => {
    const dir = await freshDir('ios-attributes');
    const file = `${dir}/secret.txt`;
    const out = {};
    out.writeProtected = await settle(() => fs.writeFile(file, 'secret', {encoding: 'utf8', protection: 'complete'}));
    out.setAttributes = await settle(() => fs.setAttributes(file, {protection: 'completeUnlessOpen', excludeFromBackup: true}));
    out.setNone = await settle(() => fs.setAttributes(file, {protection: 'none'}));
    out.mkdirProtected = await settle(() => fs.mkdir(`${dir}/vault`, {protection: 'untilFirstAuth'}));
    out.cpProtected = await settle(() => fs.cp(file, `${dir}/vault/copy.txt`, {protection: 'complete'}));
    out.readBack = await settle(() => fs.readFile(`${dir}/vault/copy.txt`, 'utf8'));
    out.missing = await settle(() => fs.setAttributes(`${dir}/missing.txt`, {protection: 'complete'}));
    out.badProtection = await settle(() => fs.setAttributes(file, {protection: 'secret'}));
    out.bundlePathMissing = await settle(() => fs.bundlePath('NoSuchBundleForParity'));
    return out;
}, ['ios']);

define('fs-platform-only-1.2', async () => ({
    setAttributes: await settle(() => fs.setAttributes('/x', {protection: 'complete'})),
    bundlePath: await settle(() => fs.bundlePath('Settings')),
    resource: await settle(async () => fs.resource('raw/parity_sample')),
}), ['android', 'windows']);

// ---------------------------------------------------------------------------
// 1.2.0 pause, resume and resumable downloads, against the server's /range.

const RANGE_SIZE = 256 * 1024;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(check, timeoutMs) {
    const start = Date.now();
    while (!check()) {
        if (Date.now() - start > timeoutMs) {
            return false;
        }
        await pause(50);
    }
    return true;
}

// The Range and If-Range headers the server received for a token.
async function rangeLog(ctx, token) {
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url(`/range/log?token=${token}`));
    return (await res.json()).requests;
}

// The server keeps state per token; a new one per run keeps runs apart.
const rangeToken = (name) => `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

define('fetch-pause-resume', async (ctx) => {
    const dir = await freshDir('fetch-pause-resume');
    const path = `${dir}/big.bin`;
    const token = rangeToken('pause');
    const task = ReactNativeBlobUtil.config({path}).fetch('GET', ctx.url(`/range?token=${token}&ms=40`));
    const progress = [];
    task.progress({interval: 0}, (written, total) => progress.push([written, total]));
    const started = await waitUntil(() => progress.length > 0 && progress[progress.length - 1][0] > 0, 15000);
    const paused = await settle(() => task.pause());
    await pause(300);
    const partial = (await fs.stat(path)).size;
    const resumed = await settle(() => task.resume());
    const result = await settle(async () => (await task).info().status);
    const log = await rangeLog(ctx, token);
    return {
        started,
        paused,
        resumed,
        result,
        partialBetween: partial > 0 && partial < RANGE_SIZE,
        hash: await settleRaw(() => fs.hash(path, 'sha256')),
        size: (await fs.stat(path)).size,
        requests: log.length,
        resumedFrom: log.length >= 2 && log[1].range === `bytes=${partial}-`,
        ifRange: log.length >= 2 ? log[1].ifRange : null,
        lastProgress: progress[progress.length - 1],
        // Counting on from the bytes on disk after the resume, never back to 0.
        progressMonotonic: progress.every(([written], i) => i === 0 || written >= progress[i - 1][0]),
    };
});

define('fetch-pause-unsupported', async (ctx) => {
    const memory = ReactNativeBlobUtil.fetch('GET', ctx.url('/health'));
    const cached = ReactNativeBlobUtil.config({fileCache: true}).fetch('GET', ctx.url('/health'));
    const out = {
        memory: await settle(() => memory.pause()),
        fileCache: await settle(() => cached.pause()),
    };
    await Promise.allSettled([memory, cached]);
    out.resumableWithPost = await settle(() => ReactNativeBlobUtil.config({path: `${fs.dirs.DocumentDir}/x`, resumable: true})
        .fetch('POST', ctx.url('/echo'), {}, 'x'));
    return out;
});

define('fetch-resumable', async (ctx) => {
    const dir = await freshDir('fetch-resumable');
    const path = `${dir}/big.bin`;
    const token = rangeToken('resumable');
    // Paced: the emulator's network loses bytes of a fast burst, which is not what this checks.
    const url = ctx.url(`/range?token=${token}&drop=100000&ms=20`);
    const first = await settle(() => ReactNativeBlobUtil.config({path, resumable: true}).fetch('GET', url));
    const partSize = await settle(async () => (await fs.stat(`${path}.part`)).size);
    const notes = await settle(async () => JSON.parse(await fs.readFile(`${path}.part.json`, 'utf8')).validator);
    const targetAfterFailure = await fs.exists(path);
    const second = await settle(async () => {
        const res = await ReactNativeBlobUtil.config({path, resumable: true}).fetch('GET', url);
        return {status: res.info().status, path: res.path()};
    });
    const log = await rangeLog(ctx, token);
    const size = typeof partSize.resolved === 'number' ? partSize.resolved : -1;
    return {
        firstRejected: 'rejected' in first,
        partKept: size > 0 && size < RANGE_SIZE,
        notes,
        targetAfterFailure,
        second,
        hash: await settleRaw(() => fs.hash(path, 'sha256')),
        partGone: !(await fs.exists(`${path}.part`)),
        notesGone: !(await fs.exists(`${path}.part.json`)),
        requests: log.length,
        firstAskedForNoRange: log.length > 0 && log[0].range === null,
        resumedFrom: log.length >= 2 && log[1].range === `bytes=${size}-`,
        ifRange: log.length >= 2 ? log[1].ifRange : null,
    };
});

define('fetch-resumable-restart', async (ctx) => {
    const dir = await freshDir('fetch-resumable-restart');
    const out = {};
    for (const [name, query, validator] of [
        ['changedFile', '', '"range-old"'],
        ['noRangeSupport', '&noRange=1', '"range-v1"'],
    ]) {
        const path = `${dir}/${name}.bin`;
        const token = rangeToken(name);
        const url = ctx.url(`/range?token=${token}${query}&ms=20`);
        // A part file that cannot be continued: junk, under notes for this URL.
        await fs.writeFile(`${path}.part`, 'x'.repeat(5000), 'utf8');
        await fs.writeFile(`${path}.part.json`, JSON.stringify({url, validator}), 'utf8');
        const result = await settle(async () => (await ReactNativeBlobUtil.config({path, resumable: true}).fetch('GET', url)).info().status);
        out[name] = {
            result,
            hash: await settleRaw(() => fs.hash(path, 'sha256')),
            size: (await fs.stat(path)).size,
            log: await rangeLog(ctx, token),
        };
    }
    return out;
});

define('fetch-resumable-cancel', async (ctx) => {
    const dir = await freshDir('fetch-resumable-cancel');
    const path = `${dir}/big.bin`;
    const task = ReactNativeBlobUtil.config({path, resumable: true}).fetch('GET', ctx.url(`/range?token=${rangeToken('cancel')}&ms=40`));
    let received = 0;
    task.progress({interval: 0}, (written) => {
        received = written;
    });
    const started = await waitUntil(() => received > 0, 15000);
    const cancelled = await settle(() => task.cancel());
    const rejected = await settle(() => task);
    await pause(300);
    return {
        started,
        cancelled,
        rejected,
        partGone: !(await fs.exists(`${path}.part`)),
        notesGone: !(await fs.exists(`${path}.part.json`)),
        target: await fs.exists(path),
    };
});

// A download run by the system: it lands at path and its record goes once the
// task that started it has settled. Ending the app in the middle is a manual
// check (tests/e2e/README.md); here the app stays.
define('background-download', async (ctx) => {
    const {background} = ReactNativeBlobUtil;
    const dir = await freshDir('background-download');
    const path = `${dir}/bg.bin`;
    const id = rangeToken('bg');
    // Small: the DownloadManager waits long before it retries a download the emulator's
    // network cut short. /range answers HEAD and ranges, which BITS asks for on Windows.
    const task = ReactNativeBlobUtil.config({path, background: {id}}).fetch('GET', ctx.url(`/range?token=${id}&size=4096`));
    const listed = await settle(async () => (await background.list()).filter((t) => t.id === id)
        .map((t) => ({samePath: t.path === path, url: t.url.endsWith(`/range?token=${id}&size=4096`), state: typeof t.state})));
    const result = await settle(async () => {
        const res = await task;
        return {taskId: res.taskId === id, samePath: res.path() === path, status: res.info().status};
    });
    const out = {
        listed,
        result,
        hash: await settleRaw(() => fs.hash(path, 'sha256')),
        goneFromListOnceSettled: !(await background.list()).some((t) => t.id === id),
        attachUnknown: await settle(() => background.attach('no-such-background-download')),
        startTwice: null,
    };

    // forget() of a running one cancels it and settles the task waiting for it.
    const slowId = rangeToken('bg-forget');
    const slow = ReactNativeBlobUtil.config({path: `${dir}/slow.bin`, background: {id: slowId}})
        .fetch('GET', ctx.url('/slow?ms=8000'));
    out.startTwice = await settle(async () => {
        try {
            await ReactNativeBlobUtil.config({path: `${dir}/again.bin`, background: {id: slowId}}).fetch('GET', ctx.url('/binary'));
            return 'started';
        } catch (err) {
            return err.code;
        }
    });
    out.forget = await settle(() => background.forget(slowId));
    out.forgottenTask = await settle(() => slow);
    out.forgottenListed = (await background.list()).some((t) => t.id === slowId);
    await pause(500);
    out.forgottenFile = await fs.exists(`${dir}/slow.bin`);

    // cancel() of a running one is the same.
    const cancelId = rangeToken('bg-cancel');
    const cancelled = ReactNativeBlobUtil.config({path: `${dir}/cancel.bin`, background: {id: cancelId}})
        .fetch('GET', ctx.url('/slow?ms=8000'));
    out.cancel = await settle(() => cancelled.cancel());
    out.cancelledTask = await settle(() => cancelled);
    out.cancelledListed = (await background.list()).some((t) => t.id === cancelId);
    return out;
});

// A request that fails after the server may have received it is not sent again
// (#504, 1.1.1): a POST whose connection drops before an answer, and one that
// times out, each reach the server once.
define('fetch-no-resend', async (ctx) => {
    const hits = async (token) => (await (await ReactNativeBlobUtil.fetch('GET', ctx.url(`/count/hits?token=${token}`))).json()).hits;
    const reset = rangeToken('reset');
    const dropped = await settle(async () => (await ReactNativeBlobUtil.fetch('POST', ctx.url(`/count?token=${reset}&reset=1`), {'Content-Type': 'text/plain'}, 'once')).info().status);
    await pause(500);
    const slow = rangeToken('timeout');
    const timedOut = await settle(async () => (await ReactNativeBlobUtil.config({timeout: 1000})
        .fetch('POST', ctx.url(`/count?token=${slow}&ms=3000`), {'Content-Type': 'text/plain'}, 'once')).info().status);
    await pause(2500);
    return {
        droppedRejected: 'rejected' in dropped,
        droppedHits: await hits(reset),
        timedOut: timedOut.rejected ? timedOut.rejected.code : timedOut,
        timedOutHits: await hits(slow),
    };
});

// A download through OkHttp listed in the Downloads app (android.downloadManager
// without useDownloadManager) resolves; with the defaults it ended the app (#390).
define('android-download-listed', async (ctx) => {
    const fetchListed = (downloadManager) => settle(async () => {
        const res = await ReactNativeBlobUtil.config({fileCache: true, android: {downloadManager}}).fetch('GET', ctx.url('/binary'));
        const size = (await fs.stat(res.path())).size;
        await fs.unlink(res.path());
        return {status: res.info().status, size};
    });
    return {
        defaults: await fetchListed({}),
        named: await fetchListed({title: 'parity', description: 'parity', mime: 'application/octet-stream'}),
    };
}, ['android']);

define('ios-misc', async () => {
    const dir = await freshDir('ios-misc');
    const file = `${dir}/backup.txt`;
    await fs.createFile(file, 'backup', 'utf8');
    return {
        excludeFromBackupKey: await settle(() => fs.excludeFromBackup(file)),
        excludeMissing: await settle(() => fs.excludeFromBackup(`${dir}/missing.txt`)),
        pathForAppGroup: await settle(() => fs.appGroupDir('group.invalid.rnbu.parity')),
        syncPathAppGroup: await settle(() => fs.appGroupDirSync('group.invalid.rnbu.parity')),
    };
}, ['ios']);

export const PARITY_CASES = cases;

/**
 * Runs one case and returns the line the app logs for it. Never throws: a case
 * that fails outright records how it failed, which is behaviour too.
 */
export async function runParityCase(id, ctx) {
    const found = cases.find((c) => c.id === id);
    if (!found) {
        return `ERROR unknown parity case "${id}"`;
    }
    if (!found.platforms.includes(Platform.OS)) {
        return `ERROR parity case "${id}" does not run on ${Platform.OS}`;
    }

    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve({caseTimeout: CASE_TIMEOUT_MS}), CASE_TIMEOUT_MS);
    });

    try {
        const signature = await Promise.race([found.run(ctx), timeout]);
        return 'RESULT ' + JSON.stringify(describeValue(signature));
    } catch (err) {
        return 'RESULT ' + JSON.stringify({caseError: describeError(err)});
    } finally {
        clearTimeout(timer);
    }
}
