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
    const entries = await fs.lstat(dir);
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
        lstatMissing: await settle(() => fs.lstat(missing)),
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
        // iOS invokes the writeStream callback twice on this path - once with the
        // error, then again after falling through - and React Native reports the
        // second call as an error of its own. Skipped there until that is fixed.
        writeStreamOntoDir: Platform.OS === 'ios'
            ? '<skipped: iOS invokes the callback twice>'
            : await settle(() => fs.writeStream(dir, 'utf8', false)),
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
    return {info: infoSummary(res.info()), type: res.type, dataType: typeof res.data, text: describeValue(res.text())};
});

define('fetch-json', async (ctx) => {
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/health'));
    return {info: infoSummary(res.info()), type: res.type, json: describeValue(res.json())};
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

define('fetch-status', async (ctx) => {
    const fetchStatus = (code) => settle(async () => {
        const res = await ReactNativeBlobUtil.fetch('GET', ctx.url(`/status/${code}`));
        return {status: res.info().status, respType: res.info().respType, text: res.text()};
    });
    return {s201: await fetchStatus(201), s404: await fetchStatus(404), s500: await fetchStatus(500)};
});

define('fetch-redirect', async (ctx) => {
    const follow = await settle(async () => {
        const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/redirect-twice'));
        return {status: res.info().status, redirects: collapseRepeats(res.info().redirects), text: res.text()};
    });
    const noFollow = await settle(async () => {
        const res = await ReactNativeBlobUtil.config({followRedirect: false}).fetch('GET', ctx.url('/redirect'));
        return {status: res.info().status, redirects: collapseRepeats(res.info().redirects), headers: headerSummary(res.info().headers), text: res.text()};
    });
    return {follow, noFollow};
});

define('fetch-timeout', async (ctx) => {
    const started = Date.now();
    const result = await settle(async () => {
        const res = await ReactNativeBlobUtil.config({timeout: 1000}).fetch('GET', ctx.url('/slow?ms=5000'));
        return {status: res.info().status, text: res.text()};
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

define('fetch-chunked', async (ctx) => {
    const totals = new Set();
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/chunked')).progress((written, total) => totals.add(total));
    return {
        info: infoSummary(res.info()),
        text: res.text(),
        knownTotalReported: [...totals].some((total) => total >= 0),
    };
});

define('fetch-state-change', async (ctx) => {
    const states = [];
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/health')).stateChange((state) => states.push(state));
    return {sawStateChange: states.length > 0, firstState: states.length > 0 ? infoSummary(states[0]) : null, info: infoSummary(res.info())};
});

define('fetch-cookies', async (ctx) => {
    await ReactNativeBlobUtil.fetch('GET', ctx.url('/cookie/set'));
    const res = await ReactNativeBlobUtil.fetch('GET', ctx.url('/cookie/echo'));
    return {cookieSentBack: res.json().cookie.includes('rnbu_e2e=cookie-value')};
});

define('fetch-errors', async () => ({
    invalidUrl: await settle(() => ReactNativeBlobUtil.fetch('GET', 'http://')),
    refused: await settle(() => ReactNativeBlobUtil.config({timeout: 5000}).fetch('GET', 'http://127.0.0.1:9/')),
}));

define('upload-bodies', async (ctx) => {
    const dir = await freshDir('upload-bodies');
    const file = `${dir}/upload.txt`;
    await fs.createFile(file, 'file body ✓', 'utf8');
    const echo = async (method, headers, body) => echoSummary((await ReactNativeBlobUtil.fetch(method, ctx.url('/echo'), headers, body)).json());
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
    return echoSummary(res.json());
});

define('android-media-store', async (ctx) => {
    const source = await ReactNativeBlobUtil.config({fileCache: true}).fetch('GET', ctx.url('/image.png'));
    const dir = await freshDir('android-media-store');
    const MC = ReactNativeBlobUtil.MediaCollection;
    const stamp = Date.now();

    const copied = await settle(() => MC.copyToMediaStore({name: `parity-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download', source.path()));
    const uri = copied.resolved;
    const out = {copied};
    if (typeof uri === 'string') {
        const raw = await MC.copyToMediaStore({name: `parity-b-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download', source.path());
        out.getBlobBase64 = await settle(async () => {
            const blob = await MC.getBlob(raw, 'base64');
            return {kind: Array.isArray(blob) ? 'array' : typeof blob, matchesPng: blob === PNG_BASE64};
        });
        out.copyToInternal = await settle(() => MC.copyToInternal(raw, `${dir}/copy.png`));
        out.internalCopyMatches = await settle(async () => (await fs.readFile(`${dir}/copy.png`, 'base64')) === PNG_BASE64);
    }
    out.created = await settle(async () => {
        const created = await MC.createMediafile({name: `parity-c-${stamp}.png`, parentFolder: 'parity', mimeType: 'image/png'}, 'Download');
        const written = await settle(() => MC.writeToMediafile(created, source.path()));
        const blob = await MC.getBlob(created, 'base64');
        return {created, written, matchesPng: blob === PNG_BASE64};
    });
    return out;
}, ['android']);

define('android-misc', async () => {
    const dir = await freshDir('android-misc');
    const file = `${dir}/scan.txt`;
    await fs.createFile(file, 'scan me', 'utf8');
    return {
        sdCardDir: await settle(() => ReactNativeBlobUtil.android.getSDCardDir()),
        sdCardApplicationDir: await settle(() => ReactNativeBlobUtil.android.getSDCardApplicationDir()),
        scanFile: await settle(() => fs.scanFile([{path: file, mime: 'text/plain'}])),
        addCompleteDownload: await settle(() => ReactNativeBlobUtil.android.addCompleteDownload({
            title: 'parity',
            description: 'parity',
            mime: 'text/plain',
            path: file,
            showNotification: false,
        })),
    };
}, ['android']);

define('ios-misc', async () => {
    const dir = await freshDir('ios-misc');
    const file = `${dir}/backup.txt`;
    await fs.createFile(file, 'backup', 'utf8');
    return {
        excludeFromBackupKey: await settle(() => ReactNativeBlobUtil.ios.excludeFromBackupKey(file)),
        excludeMissing: await settle(() => ReactNativeBlobUtil.ios.excludeFromBackupKey(`${dir}/missing.txt`)),
        pathForAppGroup: await settle(() => fs.pathForAppGroup('group.invalid.rnbu.parity')),
        syncPathAppGroup: await settle(() => fs.syncPathAppGroup('group.invalid.rnbu.parity')),
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
