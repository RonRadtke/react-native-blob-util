// Type definitions for react-native-blob-util
// Project: https://github.com/RonRadtke/react-native-blob-util
//
// Declared against the JavaScript in this package: index.js, fetch.js, fs.js,
// open.js, media.js, the deprecated android.js, ios.js and mediacollection.js,
// and class/. Every method here exists
// at runtime with this signature, and every runtime method is declared here.
//
// The documentation, one page per subject, is in docs/ next to this file (and
// on GitHub); docs/api-reference.md lists every export.

/**
 * File system access, downloads and uploads for React Native on Android, iOS
 * and Windows. Holds every namespace; the same objects are named exports.
 * @see https://github.com/RonRadtke/react-native-blob-util/blob/master/docs/README.md
 */
declare const ReactNativeBlobUtil: ReactNativeBlobUtilStatic;
export default ReactNativeBlobUtil;
/** The type of the default export. */
export type ReactNativeBlobUtil = ReactNativeBlobUtilStatic;

// The same objects as the default export's members.
/** Send an HTTP request; see `ReactNativeBlobUtilStatic.fetch`. */
export declare const fetch: ReactNativeBlobUtilStatic['fetch'];
/** A `fetch` bound to options; see `ReactNativeBlobUtilConfig`. */
export declare const config: ReactNativeBlobUtilStatic['config'];
/** Files and directories. */
export declare const fs: FS;
/** Opening files in other apps, and the file picker. */
export declare const open: OpenApi;
/** The shared media library: Android's MediaStore, the iOS photo library. */
export declare const media: MediaApi;
/** Downloads that outlive the app. */
export declare const background: BackgroundApi;
/** A named list of files that are removed together. */
export declare const session: ReactNativeBlobUtilStatic['session'];
/** Mark a path as a file for a plain string request body. */
export declare const wrap: ReactNativeBlobUtilStatic['wrap'];
/** Base64 for strings, UTF-8 encoded. */
export declare const base64: ReactNativeBlobUtilStatic['base64'];

/** The default export: every namespace and function of the library. */
export interface ReactNativeBlobUtilStatic {
    /**
     * Send an HTTP request with the default configuration. Use
     * `config(options).fetch(...)` to configure it.
     * @param method HTTP method.
     * @param url Request URL.
     * @param headers Request headers. `null` and `undefined` values are sent as "".
     *                `RNFB-Response: 'base64' | 'utf8'` is read by the library
     *                rather than sent: it forces the form a body held in memory
     *                takes (Android and iOS), instead of utf8 when the bytes decode
     *                as UTF-8 and base64 otherwise.
     * @param body The request body. `{text}`, `{base64}`, `{file}` and bytes say
     *             what the body is. A plain string is read by the rule 0.x used: a
     *             `wrap(path)` string is a file, a Content-Type ending in `;base64`
     *             or starting with `application/octet` makes it base64, anything
     *             else is text. An array is a multipart form. GET and HEAD reject
     *             a body with `EINVAL`.
     */
    fetch(method: Methods, url: string, headers?: RequestHeaders, body?: RequestBody): StatefulPromise<FetchBlobResponse>;

    /**
     * A `fetch` bound to the given options.
     */
    config(options: ReactNativeBlobUtilConfig): { fetch: ReactNativeBlobUtilStatic['fetch'] };

    /** Base64 for strings: `encode` takes text and UTF-8 encodes it, `decode` returns text. */
    base64: { encode(input: string): string; decode(input: string): string };
    /** Files and directories. */
    fs: FS;
    /** Opening files in other apps, and the file picker. */
    open: OpenApi;
    /** The shared media library: Android's MediaStore, the iOS photo library. */
    media: MediaApi;
    /** Downloads that outlive the app. */
    background: BackgroundApi;
    /** @deprecated every member forwards to `open.*` or `media.*` */
    android: AndroidApi;
    /** @deprecated every member forwards to `open.*` or `fs.*` */
    ios: IOSApi;
    /** @deprecated every member forwards to `media.*` */
    MediaCollection: MediaCollection;

    /**
     * Get a file cache session; created when it does not exist yet.
     */
    session(name: string): ReactNativeBlobUtilSession;

    /**
     * Prefix a path so that `fetch` reads a request body from that file
     * (`ReactNativeBlobUtil-file://...`, or `ReactNativeBlobUtil-content://...`
     * for a content URI).
     */
    wrap(path: string): string;

    /** The rejection of a cancelled task. */
    CanceledFetchError: typeof CanceledFetchError;
}

/** The HTTP methods `fetch` sends, in either case. */
export type Methods = 'POST' | 'GET' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD' | 'OPTIONS'
    | 'post' | 'get' | 'delete' | 'put' | 'patch' | 'head' | 'options';

/**
 * Request headers. `null` and `undefined` values are sent as "". A name or
 * value with CR, LF or NUL rejects EINVAL.
 */
export type RequestHeaders = { [name: string]: string | null | undefined };

/** A body sent as it is, never read as base64 or as a file reference. */
export interface TextBody { text: string }
/** A body given as base64, sent as the bytes it encodes. */
export interface Base64Body { base64: string }
/** The contents of a file: a path, or a `content://` URI on Android. */
export interface FileBody { file: string }

/** A body stated explicitly: text, base64, a file, or bytes. */
export type ExplicitBody = TextBody | Base64Body | FileBody | ArrayBuffer | ArrayBufferView;

/**
 * One field of a multipart request. `data` is either explicit or, as a plain
 * string, text without a `filename` and base64 (or `wrap(path)` for a file)
 * with one. A file part without a `filename` is named after the file.
 */
export interface FormField {
    /** The field name. */
    name: string;
    /** The field's content. */
    data: string | ExplicitBody;
    /** Makes the part a file part, with this file name. */
    filename?: string;
    /** The part's MIME type. */
    type?: string;
}

/**
 * What `fetch` sends: an explicit body, a multipart form (an array of
 * fields), a plain string (read by the 0.x rule, see `fetch`), or nothing.
 */
export type RequestBody = string | ExplicitBody | FormField[] | null;

/**
 * The promise `fetch` returns: a Promise with methods to observe and cancel
 * the task. They can be called after the task has settled and do nothing then.
 */
export interface StatefulPromise<T> extends Promise<T> {
    /** The id native knows the task by. */
    readonly taskId: string;

    /**
     * Register a download progress handler. Reports at most every `interval`
     * milliseconds (default 250), or `count` times in total (default unlimited).
     * `chunk` carries the received data when native reports it.
     */
    progress(callback: ProgressHandler): this;
    progress(config: ProgressConfig, callback: ProgressHandler): this;

    /**
     * Register an upload progress handler, with the same options as `progress`.
     */
    uploadProgress(callback: UploadProgressHandler): this;
    uploadProgress(config: ProgressConfig, callback: UploadProgressHandler): this;

    /**
     * Register a handler for the response headers, called when they arrive and
     * before the body is complete.
     */
    stateChange(callback: (info: ReactNativeBlobUtilResponseInfo) => void): this;

    /**
     * Register a handler for server-push chunks.
     */
    part(callback: (chunk: string) => void): this;

    /**
     * Cancel the request. The task rejects with `CanceledFetchError` at once;
     * the returned promise resolves once native has cancelled. A `resumable`
     * download's part file is removed.
     */
    cancel(callback?: (reason?: any) => void): Promise<void>;

    /**
     * Stop a download to `path` and keep what has arrived; the task stays
     * pending until `resume()` finishes it or `cancel()` ends it. Resolves
     * once the transfer has stopped. Rejects ENOTSUP for anything but a GET to
     * `path` (a download to memory or `fileCache`, an upload, the Android
     * DownloadManager, an iOS background task, a `background` download).
     */
    pause(): Promise<void>;

    /**
     * Continue a paused download: the server is asked for the rest of the file
     * (Range, with If-Range set to the first response's ETag or
     * Last-Modified). A server that cannot continue, or whose file has
     * changed, sends all of it again, which replaces the partial file. The
     * task settles with the response that completed it (206 when the server
     * continued). Progress counts on from the bytes already on disk.
     */
    resume(): Promise<void>;
}

/** How often progress is reported. */
export interface ProgressConfig {
    /** Report this many times in all; needs a Content-Length. Default unlimited. */
    count?: number;
    /** Report at most every this many milliseconds; 0 reports every chunk. Default 250. */
    interval?: number;
}

/**
 * Download progress: bytes received and the total, -1 while the length is not
 * known (the last event then reports (n, n)). A resumed download counts on
 * from the bytes already on disk.
 */
export type ProgressHandler = (received: number, total: number, chunk?: string) => void;
/** Upload progress: bytes sent and the total. */
export type UploadProgressHandler = (sent: number, total: number) => void;

/**
 * The result of a `fetch`: the response body, held as utf8 text, a base64
 * string, or the path of the file it was written to (`type`).
 */
export declare class FetchBlobResponse {
    constructor(taskId: string, info: ReactNativeBlobUtilResponseInfo, data: any);

    /** The id of the task that made the request. */
    taskId: string;
    /** The form of `data`: utf8 text, a base64 string, or the path of the response file. */
    type: 'base64' | 'path' | 'utf8';
    /** The body as `type` says; prefer `text()`, `base64()`, `path()` and the rest. */
    data: any;
    /** The response info; the same as `info()`. */
    respInfo: ReactNativeBlobUtilResponseInfo;

    /** The response info: status, headers, redirects, respType. */
    info(): ReactNativeBlobUtilResponseInfo;

    /** The HTTP status. An error status resolves like any other response. */
    readonly status: number;

    /** Whether the status is 200..299. */
    readonly ok: boolean;

    /** The response headers, names in lower case. */
    readonly headers: { [name: string]: string };

    /** The URL the body came from, after redirects; undefined when unknown. */
    readonly url: string | undefined;

    /**
     * The path of the response file, or null when the body is held in memory.
     */
    path(): string | null;

    /**
     * The body as text.
     */
    text(): Promise<string>;

    /**
     * The body parsed as JSON.
     */
    json(): Promise<any>;

    /**
     * The body as a base64 string.
     */
    base64(): Promise<string>;

    /**
     * The body as byte values 0..255.
     */
    array(): Promise<number[]>;

    /**
     * The body as an ArrayBuffer.
     */
    arrayBuffer(): Promise<ArrayBuffer>;

    /**
     * Remove the response file. Resolves without doing anything when the body
     * is not a file.
     */
    flush(): Promise<void>;

    /**
     * Add the response file to a session. Throws an error with code EINVAL when
     * the body is not a file.
     */
    session(name: string): ReactNativeBlobUtilSession;

    /**
     * Read the response file with the given encoding. Rejects with EINVAL when
     * the body is not a file.
     */
    readFile(encoding: 'ascii'): Promise<number[]>;
    readFile(encoding: 'utf8' | 'base64'): Promise<string>;

    /**
     * A read stream over the response file. Rejects with EINVAL when the body is
     * not a file.
     */
    readStream(encoding: Encoding): Promise<ReactNativeBlobUtilReadStream>;
}

/** What native reports about a response, as `stateChange` and `res.info()` give it. */
export interface ReactNativeBlobUtilResponseInfo {
    /** The id of the native request. */
    taskId: string;
    /** The native request's state; "2" once the headers have arrived. */
    state: string;
    /** The response headers. */
    headers: { [name: string]: string };
    /** The HTTP status. */
    status: number;
    /** Every URL a redirect went through. */
    redirects?: string[];
    /** What the Content-Type says the body is: `blob` for binary data. */
    respType: 'text' | 'blob' | '' | 'json';
    /** The form the body is held in, as `res.type`. */
    rnfbEncode: 'path' | 'base64' | 'utf8';
    /** True when the request timed out. */
    timeout?: boolean;
}

/**
 * Options for `config()`.
 */
export interface ReactNativeBlobUtilConfig {
    /**
     * Write the response to a file with a random name in the cache directory
     * instead of holding it in memory; `response.path()` is then set.
     */
    fileCache?: boolean;

    /**
     * The extension of the random file name `fileCache` creates, e.g. "png" or
     * "tar.gz". A value containing "/", "\\", ":" or a control character
     * rejects EINVAL: it is appended to a file name, and must not make it a path.
     */
    appendExt?: string;

    /**
     * Write the response to this path. Overrides fileCache and appendExt.
     */
    path?: string;

    /**
     * Cache the response under this key: when a file downloaded with the same
     * key exists, it is returned without a request.
     */
    key?: string;

    /**
     * Add the response file to this session.
     */
    session?: string;

    /**
     * Replace an existing file at `path`. Default true; false appends the
     * response to the existing file.
     */
    overwrite?: boolean;

    /**
     * Download to `path` so that an interrupted download can continue: the
     * data goes to `<path>.part`, with what is needed to continue in
     * `<path>.part.json`, and the part file becomes `path` once it is
     * complete. A failure (a lost connection, the app ended) keeps both, and
     * the next resumable request for the same URL and path continues from
     * there; headers are not stored, so pass them again. `cancel()` removes
     * them. An HTTP error status rejects. Needs GET and `path`; rejects
     * EINVAL with `overwrite: false`, `transform`, a body, or the
     * DownloadManager.
     */
    resumable?: boolean;

    /**
     * Run the download in the background: it goes on while the app is
     * suspended or ended, and is found again on a later start by its id
     * (`background.list()`, `background.attach(id)`). `true` gets a new id,
     * which is the task's `taskId`. The file lands at `path` even while the app
     * is not running. Run by a background URLSession on iOS, the DownloadManager
     * on Android (which shows a notification while it runs, and uses the
     * system's certificate trust, so customCACerts and trusty do not apply),
     * and BITS on Windows. Needs GET and `path`; an id is 1 to 100 letters,
     * digits, ".", "_" or "-", and one still running rejects EEXIST. A body,
     * `transform`, `overwrite: false`, `resumable` or the DownloadManager
     * option rejects EINVAL. A user who force-quits an iOS app from the app
     * switcher cancels its background downloads.
     */
    background?: boolean | {id?: string};

    /**
     * Request timeout in milliseconds. Default 60000.
     */
    timeout?: number;

    /**
     * Follow redirects. Default true.
     */
    followRedirect?: boolean;

    /**
     * Run the registered file transformer on the response before it is written
     * to disk. Only applies when the response is written to a file.
     */
    transform?: boolean;

    /** @deprecated use `transform` */
    transformFile?: boolean;

    /**
     * Trust every server certificate. Not for production.
     */
    trusty?: boolean;

    /**
     * Resource names (without extension) of CA certificates bundled with the
     * app, used as trust anchors instead of the system's: res/raw on Android,
     * the main bundle on iOS, the app package on Windows. Hostname
     * verification still applies. When none can be loaded the request fails.
     */
    customCACerts?: string[];

    /**
     * Apply customCACerts to these hosts only; other hosts use system trust.
     */
    pinnedHosts?: string[];

    /**
     * Keep trusting the system's CAs alongside customCACerts. Default false.
     */
    trustSystemCerts?: boolean;

    /**
     * Write a binary response to a cache file, as `fileCache` does, and keep
     * text and JSON in memory. Binary is any Content-Type other than `text/*`
     * and `application/json`, or one listed in `binaryContentTypes`. Android
     * and iOS; Windows keeps every response in memory.
     */
    auto?: boolean;

    /**
     * Content-Type fragments, matched case-insensitively, that count as
     * binary: `respType` is `blob` for them, and the response is written to a
     * cache file with `auto` (Android) or always (iOS).
     */
    binaryContentTypes?: string[];

    /** Options only Android reads. */
    android?: {
        /** Download through the DownloadManager. */
        downloadManager?: AddAndroidDownloads;
        /** Only send the request over WiFi. */
        wifiOnly?: boolean;
        /** Pick the network interface that can reach this IP. */
        targetHostIp?: string;
    };

    /** Options only iOS reads. */
    ios?: {
        /**
         * Run the request in the background session, so it continues while the
         * app is suspended; it is handed to this task when it ends.
         */
        backgroundTask?: boolean;
    };

    /** @deprecated use `android.wifiOnly` */
    wifiOnly?: boolean;

    /** @deprecated use `android.targetHostIp` */
    targetHostIp?: string;

    /** @deprecated use `android.downloadManager` */
    addAndroidDownloads?: AddAndroidDownloads;

    /** @deprecated use `ios.backgroundTask` */
    IOSBackgroundTask?: boolean;
}

/** Options of fs.readFile and fs.writeFile. */
export interface FileOptions<E> {
    /** Default utf8. */
    encoding?: E;
    /** Run the registered file transformer (not for ascii). */
    transform?: boolean;
}

/** Options of `android.downloadManager`: a download run by Android's DownloadManager. */
export interface AddAndroidDownloads {
    /** Download through the DownloadManager (required for the other options). */
    useDownloadManager?: boolean;
    /** Title shown in the Downloads app. */
    title?: string;
    /** Description shown in the Downloads app. */
    description?: string;
    /**
     * Destination path on external storage (e.g. `fs.dirs.DownloadDir + '/report.pdf'`).
     * A file already there is replaced, unless `overwrite` is false: then the
     * download goes to a new name (`report-1.pdf`), which `res.path()` returns.
     * Without a destination, `res.path()` is a `content://` URI.
     */
    path?: string;
    /** MIME type of the file. Default text/plain. */
    mime?: string;
    /** Let the media scanner index the file. */
    mediaScannable?: boolean;
    /** Android 10+: store the file in the Downloads collection (may override path). */
    storeInDownloads?: boolean;
    /** Show a notification while downloading and when complete. */
    notification?: boolean;
    /** Store the file in the app's own download directory (`fs.dirs.DownloadDir`), under a generated name. */
    storeLocal?: boolean;
}

/**
 * The codes a rejection of this library carries. File system: ENOENT, EISDIR,
 * ENOTDIR, EEXIST, EACCES (a content:// provider refused), EBADF (a closed
 * stream). Requests: ETIMEDOUT, ENOTFOUND, ECONNREFUSED, ECONNRESET,
 * ENETUNREACH, ESSL, ECANCELED. Everywhere: EINVAL (bad argument), ENOTSUP (not
 * on this platform), EBUSY (a picker is already open), ENOAPP (no app can open
 * the file), EUNSPECIFIED (anything else; the message says what).
 */
export type ErrorCode =
    | 'ENOENT' | 'EISDIR' | 'ENOTDIR' | 'EEXIST' | 'EACCES' | 'EBADF'
    | 'ETIMEDOUT' | 'ENOTFOUND' | 'ECONNREFUSED' | 'ECONNRESET' | 'ENETUNREACH' | 'ESSL' | 'ECANCELED'
    | 'EINVAL' | 'ENOTSUP' | 'EBUSY' | 'ENOAPP' | 'EUNSPECIFIED';

/**
 * An error rejected by this library.
 */
export interface CodedError extends Error {
    /** What failed; match on this rather than on the message. */
    code: ErrorCode;
}

/**
 * The rejection of a failed `fetch`: the code, and the response info received
 * before it failed.
 */
export interface FetchError extends CodedError {
    /** The response info received before the request failed. */
    respInfo: ReactNativeBlobUtilResponseInfo;
}

/**
 * The rejection of a cancelled `fetch`.
 */
export declare class CanceledFetchError extends Error {
    constructor(message?: string);
    /** The error's name. */
    name: 'ReactNativeBlobUtilCanceledFetch';
    /** Always ECANCELED. */
    code: 'ECANCELED';
}

/**
 * How data is passed: `utf8` text, a `base64` string, or `ascii`, an array of
 * byte values 0..255. An unknown encoding rejects EINVAL.
 */
export type Encoding = 'utf8' | 'ascii' | 'base64';

/** Write encodings: `uri` copies the file the data string points at. */
export type WriteEncoding = Encoding | 'uri';

/** Read encodings of `readFile` and `read`: `bytes` resolves a Uint8Array. */
export type ReadEncoding = Encoding | 'bytes';

/**
 * Binary data: written as it is, whatever the encoding says. A typed array
 * writes only the bytes it views.
 */
export type BinaryData = ArrayBuffer | ArrayBufferView;

/**
 * An iOS data protection class (`NSFileProtectionType`): `complete`, readable
 * only while the device is unlocked; `completeUnlessOpen`, a file open when
 * the device locks stays readable; `untilFirstAuth`, readable after the first
 * unlock since boot (the system default); `none`. Android and Windows have no
 * such classes and ignore the option; an unknown value rejects EINVAL
 * everywhere.
 */
export type Protection = 'complete' | 'completeUnlessOpen' | 'untilFirstAuth' | 'none';

/** Options of the calls that create or move a file or directory. */
export interface ProtectionOptions {
    /** iOS: the data protection class of the result. Ignored elsewhere. */
    protection?: Protection;
}

/** Options of `fs.read`. */
export interface ReadOptions<E extends ReadEncoding = ReadEncoding> {
    /** The first byte to read. Default 0. */
    position?: number;
    /** How many bytes to read; default to the end of the file. */
    length?: number;
    /** Default utf8. A range that ends inside a UTF-8 character decodes the broken tail as U+FFFD. */
    encoding?: E;
}

/** Options of `fs.write`. */
export interface WriteOptions {
    /** The byte to start writing at; default the end of the file (append). */
    position?: number;
    /** How a string is encoded (default utf8), or `ascii` for byte values. Ignored for binary data. */
    encoding?: Encoding;
}

/** Options of `fs.touch`. */
export interface TouchOptions {
    /** The modification time, a Date or ms since the epoch. Default now. */
    mtime?: Date | number;
    /**
     * The creation time (iOS, Windows). Without it the creation time stays;
     * Android keeps no settable creation time and ignores it.
     */
    ctime?: Date | number;
}

/** Options of `open.pick`. */
export interface PickOptions {
    /** One MIME type or several, such as "image/*" or ["application/pdf", "text/plain"]. Default any. */
    mime?: string | string[];
    /** Let the user pick several files; the call then resolves a list. */
    multiple?: boolean;
}

/** The hashes `fs.hash` computes; `sha224` is not available on Windows. */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512';

/**
 * Files and directories, worked on in native code. Paths are plain paths or
 * `file://` URLs; Android also takes assets, resources and `content://` URIs
 * where a call says so.
 * @see https://github.com/RonRadtke/react-native-blob-util/blob/master/docs/file-system.md
 */
export interface FS {
    /**
     * Remove the file or directory at path.
     */
    unlink(path: string): Promise<void>;

    /**
     * Create a directory, including missing parents. Rejects EEXIST when it
     * exists. On iOS, `protection` sets the directory's data protection class,
     * which files created in it inherit.
     */
    mkdir(path: string, options?: ProtectionOptions): Promise<void>;

    /**
     * Get a file cache session; created when it does not exist yet.
     */
    session(name: string): ReactNativeBlobUtilSession;

    /**
     * The names of the entries in a directory, or with `{stats: true}` a stat of
     * each entry.
     */
    ls(path: string, options?: {stats?: false}): Promise<string[]>;
    ls(path: string, options: {stats: true}): Promise<ReactNativeBlobUtilStat[]>;

    /**
     * A cryptographic hash over the file's contents, hex encoded.
     * `sha224` is not available on Windows.
     */
    hash(path: string, algorithm: HashAlgorithm): Promise<string>;

    /**
     * A read stream over the file. Call `open()` on the result.
     * @param bufferSize Bytes per chunk. Default 12288; use a multiple of 3 for base64.
     * @param tick Milliseconds between chunks. Default 10.
     */
    readStream(path: string, encoding?: Encoding, bufferSize?: number, tick?: number): Promise<ReactNativeBlobUtilReadStream>;
    readStream(path: string, options: {encoding?: Encoding; bufferSize?: number; tick?: number}): Promise<ReactNativeBlobUtilReadStream>;

    /**
     * Move a file or directory. An existing destination file is overwritten.
     */
    mv(path: string, dest: string, options?: ProtectionOptions): Promise<void>;

    /**
     * Copy a file, or a directory with everything in it. An existing
     * destination file is overwritten; an existing destination directory
     * rejects EEXIST. Android also copies from a `content://` URI, an asset or
     * a resource.
     */
    cp(path: string, dest: string, options?: ProtectionOptions): Promise<void>;

    /**
     * A write stream to the file.
     * @param append Append to the file instead of replacing it. Default false.
     */
    writeStream(path: string, encoding?: Encoding, append?: boolean): Promise<ReactNativeBlobUtilWriteStream>;
    writeStream(path: string, options: {encoding?: Encoding; append?: boolean}): Promise<ReactNativeBlobUtilWriteStream>;

    /**
     * Write data to a file, replacing it. Android and iOS create missing parent
     * directories; on Windows the directory must exist.
     * @param data A string, byte values 0..255 for the ascii encoding, or binary data.
     * @return The number of bytes written.
     */
    writeFile(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;
    writeFile(path: string, data: number[], encoding: 'ascii'): Promise<number>;
    writeFile(path: string, data: BinaryData, encoding?: Encoding): Promise<number>;

    writeFile(path: string, data: string, encoding: 'utf8' | 'base64' | 'uri' | undefined, options: {transform?: boolean} & ProtectionOptions): Promise<number>;
    writeFile(path: string, data: BinaryData, encoding: Encoding | undefined, options: {transform?: boolean} & ProtectionOptions): Promise<number>;
    // An encoding only known at runtime.
    writeFile(path: string, data: string | number[] | BinaryData, encoding?: WriteEncoding, options?: {transform?: boolean} & ProtectionOptions): Promise<number>;
    writeFile(path: string, data: number[], options: FileOptions<'ascii'> & ProtectionOptions & {encoding: 'ascii'}): Promise<number>;
    writeFile(path: string, data: string, options: FileOptions<'utf8' | 'base64' | 'uri'> & ProtectionOptions): Promise<number>;
    writeFile(path: string, data: BinaryData, options: FileOptions<Encoding> & ProtectionOptions): Promise<number>;

    /** @deprecated use `writeFile(path, data, encoding, {transform: true})` */
    writeFileWithTransform(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;

    /**
     * Append data to a file.
     * @return The number of bytes written.
     */
    appendFile(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;
    appendFile(path: string, data: number[], encoding: 'ascii'): Promise<number>;
    appendFile(path: string, data: BinaryData, encoding?: Encoding): Promise<number>;
    appendFile(path: string, data: string | number[] | BinaryData, encoding?: WriteEncoding): Promise<number>;
    appendFile(path: string, data: string | number[] | BinaryData, options: {encoding?: WriteEncoding}): Promise<number>;

    /**
     * Read a file: text for utf8, a base64 string, byte values 0..255 for
     * ascii, or a Uint8Array for bytes.
     */
    readFile(path: string, encoding: 'ascii'): Promise<number[]>;
    readFile(path: string, encoding: 'bytes'): Promise<Uint8Array>;
    readFile(path: string, encoding?: 'utf8' | 'base64'): Promise<string>;

    readFile(path: string, encoding: 'ascii', options: {transform?: boolean}): Promise<number[]>;
    readFile(path: string, encoding: 'bytes', options: {transform?: boolean}): Promise<Uint8Array>;
    readFile(path: string, encoding: 'utf8' | 'base64' | undefined, options: {transform?: boolean}): Promise<string>;
    // An encoding only known at runtime.
    readFile(path: string, encoding?: Encoding, options?: {transform?: boolean}): Promise<string | number[]>;
    readFile(path: string, encoding?: ReadEncoding, options?: {transform?: boolean}): Promise<string | number[] | Uint8Array>;
    readFile(path: string, options: FileOptions<'ascii'> & {encoding: 'ascii'}): Promise<number[]>;
    readFile(path: string, options: FileOptions<'bytes'> & {encoding: 'bytes'}): Promise<Uint8Array>;
    readFile(path: string, options: FileOptions<'utf8' | 'base64'>): Promise<string>;

    /**
     * Read part of a file: `length` bytes from `position`, or to the end
     * without a length. A range past the end reads what is there, possibly
     * nothing. Rejects ENOENT for a missing file, EISDIR for a directory.
     */
    read(path: string, options: ReadOptions<'ascii'> & {encoding: 'ascii'}): Promise<number[]>;
    read(path: string, options: ReadOptions<'bytes'> & {encoding: 'bytes'}): Promise<Uint8Array>;
    read(path: string, options?: ReadOptions<'utf8' | 'base64'>): Promise<string>;
    // An encoding only known at runtime.
    read(path: string, options?: ReadOptions): Promise<string | number[] | Uint8Array>;

    /**
     * Write into a file at `position`, overwriting what is there and keeping
     * the rest; without a position the data is appended. A missing file is
     * created (its directory must exist, or ENOENT); a position past the end
     * leaves zero bytes in between.
     * @param data A string, byte values 0..255 for `encoding: 'ascii'`, or binary data.
     * @return The number of bytes written.
     */
    write(path: string, data: string | number[] | BinaryData, options?: WriteOptions): Promise<number>;

    /**
     * Set the modification time, and the creation time where one can be set
     * (iOS, Windows), as `touch` does: a missing file is created empty.
     */
    touch(path: string, options?: TouchOptions): Promise<void>;

    /** @deprecated use `readFile(path, encoding, {transform: true})` */
    readFileWithTransform(path: string, encoding: 'ascii'): Promise<number[]>;
    /** @deprecated use `readFile(path, encoding, {transform: true})` */
    readFileWithTransform(path: string, encoding?: 'utf8' | 'base64'): Promise<string>;

    /**
     * Whether a file or directory exists at path.
     */
    exists(path: string): Promise<boolean>;

    /**
     * Whether a directory exists at path.
     */
    isDir(path: string): Promise<boolean>;

    /**
     * Create a file with the given content. Rejects with EEXIST when it exists.
     */
    createFile(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<void>;
    createFile(path: string, data: number[], encoding: 'ascii'): Promise<void>;
    createFile(path: string, data: BinaryData, encoding?: Encoding): Promise<void>;
    createFile(path: string, data: string | number[] | BinaryData, options: {encoding?: WriteEncoding} & ProtectionOptions): Promise<void>;

    /**
     * Information about a file or directory.
     */
    stat(path: string): Promise<ReactNativeBlobUtilStat>;

    /** @deprecated use `ls(path, {stats: true})` */
    lstat(path: string): Promise<ReactNativeBlobUtilStat[]>;

    /**
     * Copy the bytes `start` (inclusive) to `end` (exclusive) of a file into a
     * new file. Negative offsets count from the end.
     */
    slice(src: string, dest: string, start?: number, end?: number): Promise<void>;

    /**
     * The path of a bundled asset, for use with the other fs calls. On Android
     * `ls` lists an asset directory, and `exists` and `stat` see compressed
     * assets too.
     */
    asset(path: string): string;

    /**
     * Android: the path of an app resource, "<type>/<name>" without the
     * extension (`fs.resource('raw/sample')` for res/raw/sample.json), for
     * `readFile`, `read`, `exists`, `stat`, `hash`, `cp` (as the source) and
     * `readStream`. Throws an error with code ENOTSUP on iOS and Windows.
     */
    resource(name: string): string;

    /**
     * iOS: the path of a resource bundle (`<name>.bundle`) in the main bundle.
     * Rejects ENOENT when there is none, ENOTSUP on Android and Windows.
     */
    bundlePath(name: string): Promise<string>;

    /**
     * Android: every app-specific directory on external storage, the primary
     * one first, then one per removable volume such as an SD card. Resolves []
     * on iOS and Windows.
     */
    externalDirs(): Promise<string[]>;

    /**
     * Free and total storage in bytes. Android also reports the internal and
     * external volumes separately.
     */
    df(): Promise<ReactNativeBlobUtilDf>;

    /** Well-known directories; "" for one the platform does not have. */
    dirs: Dirs;

    /** Android: the external storage root. ENOTSUP elsewhere. */
    sdCardDir(): Promise<string>;

    /** Android: the app's directory on external storage. ENOTSUP elsewhere. */
    sdCardApplicationDir(): Promise<string>;

    /** The session class, for its static session store. */
    ReactNativeBlobUtilSession: typeof ReactNativeBlobUtilSession;

    /**
     * iOS: exclude the file or directory from iCloud and iTunes backups. ENOTSUP elsewhere.
     */
    excludeFromBackup(path: string): Promise<void>;

    /**
     * iOS: set the data protection class and whether the item is left out of
     * backups. Only the attributes given change. ENOTSUP elsewhere.
     */
    setAttributes(path: string, attributes: ProtectionOptions & {excludeFromBackup?: boolean}): Promise<void>;

    /**
     * iOS: the directory shared by the apps of an app group. ENOTSUP elsewhere.
     */
    appGroupDir(groupName: string): Promise<string>;

    /**
     * iOS: the app group directory, synchronously. "" elsewhere.
     */
    appGroupDirSync(groupName: string): string;

    /** @deprecated use `media.scan` */
    scanFile: MediaApi['scan'];
    /** @deprecated use `fs.appGroupDir` */
    pathForAppGroup: FS['appGroupDir'];
    /** @deprecated use `fs.appGroupDirSync` */
    syncPathAppGroup: FS['appGroupDirSync'];
}

/**
 * Opening files in other apps, and picking files. A call a platform cannot
 * make rejects with ENOTSUP.
 */
export interface OpenApi {
    /**
     * Open the file in another app: the default app for its MIME type on
     * Android, a full-screen preview on iOS.
     */
    file(path: string, options?: {mime?: string; scheme?: string}): Promise<void>;

    /**
     * Let the user choose the app: an app chooser on Android (`title`), the
     * "open in" menu on iOS.
     */
    chooser(path: string, options?: {mime?: string; scheme?: string; title?: string}): Promise<void>;

    /**
     * iOS: the options menu of UIDocumentInteractionController.
     */
    optionsMenu(path: string, options?: {scheme?: string}): Promise<void>;

    /**
     * The system file picker. Resolves what the user picked: a `content://`
     * URI on Android; on iOS and Windows the path of a copy in the temporary
     * directory. With `multiple` a list, [] when the user cancels; otherwise
     * one entry, or null. Rejects EBUSY while another picker is open.
     */
    pick(options: PickOptions & {multiple: true}): Promise<string[]>;
    pick(mime?: string | string[] | (PickOptions & {multiple?: false})): Promise<string | null>;
    pick(options: PickOptions): Promise<string | string[] | null>;
}

/** A background download, as `background.list()` reports it. */
export interface BackgroundTask {
    /** The id the download was started with; also its `taskId`. */
    id: string;
    /** The URL it downloads. */
    url: string;
    /** Where the file goes, and is once the download is completed. */
    path: string;
    /** `paused` is a download the system holds back, for example while offline. */
    state: 'running' | 'paused' | 'completed' | 'failed';
    /** Bytes so far. */
    written: number;
    /** Bytes in all; -1 when not known. */
    total: number;
    /** Why a failed download failed. */
    error?: {code: ErrorCode; message: string};
}

/**
 * Downloads that outlive the app, started with `config({path, background})`.
 * @see https://github.com/RonRadtke/react-native-blob-util/blob/master/docs/downloads.md
 */
export interface BackgroundApi {
    /**
     * The background downloads whose outcome has not been handed to the app
     * yet: running ones, and ones that finished while the app was not there.
     * One stays listed until a task for it settles (`attach`, or the fetch that
     * started it) or until `forget(id)`; reading the list removes nothing.
     */
    list(): Promise<BackgroundTask[]>;

    /**
     * A task for a background download by its id, with `progress()` and
     * `cancel()`: it resolves with the response (`res.path()`) once the file is
     * there, at once when it already is, and rejects with the error of a failed
     * one, or ENOENT for an id there is no record of.
     */
    attach(id: string): StatefulPromise<FetchBlobResponse>;

    /**
     * Remove the record of a background download, cancelling it if it still
     * runs. A file it already wrote stays.
     */
    forget(id: string): Promise<void>;
}

/**
 * The device's shared media library (Android: MediaStore, Downloads app,
 * media scanner). Every call but `copyToInternal`, which iOS has as well,
 * rejects with ENOTSUP elsewhere.
 */
export interface MediaApi {
    /** Create an empty entry in a collection; resolves its content URI. */
    createFile(fd: filedescriptor, collection: Mediatype): Promise<string>;
    /** Copy a file into an existing entry, optionally through the file transformer. */
    write(uri: string, path: string, options?: {transform?: boolean}): Promise<void>;
    /** Create an entry and copy a file into it; resolves its content URI. */
    copyToMediaStore(fd: filedescriptor, collection: Mediatype, path: string): Promise<string>;
    /**
     * Copy an entry into the app's own storage, overwriting the destination:
     * a `content://` URI on Android, a photo library item on iOS (`ph://<local
     * identifier>` or `assets-library://`). Without options the entry is
     * copied as it is; with `width`, `height` or `compression` an image is
     * written as JPEG at `compression` (0..1, default 0.9), scaled down to fit
     * `width` x `height` when they are given. A video is copied as it is.
     * ENOTSUP on Windows.
     */
    copyToInternal(uri: string, dest: string, options?: {width?: number; height?: number; compression?: number}): Promise<void>;
    /** Read an entry: text, a base64 string, or bytes 0..255. */
    read(uri: string, encoding: 'ascii'): Promise<number[]>;
    read(uri: string, encoding?: 'utf8' | 'base64'): Promise<string>;
    read(uri: string, encoding?: Encoding | {encoding?: Encoding}): Promise<string | number[]>;
    /** Register a finished download with the Downloads app. */
    addDownload(options: AndroidDownloadOption): Promise<void>;
    /** Ask the media scanner to index files. */
    scan(files: Array<{ path: string; mime?: string }>): Promise<void>;
}

/** What `fs.stat` and `fs.ls(path, {stats: true})` report about a file or directory. */
export interface ReactNativeBlobUtilStat {
    /** The name, without the directory. */
    filename: string;
    /** The path; for a content URI, the URI itself. */
    path: string;
    /** Bytes. */
    size: number;
    /** `asset` for a file bundled with the app. */
    type: 'file' | 'directory' | 'asset';
    /** Milliseconds since the epoch. */
    lastModified: number;
    /**
     * When the file was created, in milliseconds since the epoch: iOS and
     * Windows. null on Android, whose file systems do not report it to apps,
     * and for assets.
     */
    created: number | null;
}

/** @deprecated use ReactNativeBlobUtilDf */
export type RNFetchBlobDf = ReactNativeBlobUtilDf;

/** Storage space in bytes, from `fs.df`. */
export interface ReactNativeBlobUtilDf {
    /** Free bytes. */
    free: number;
    /** Total bytes. */
    total: number;
    /** Android only */
    internal_free?: number;
    /** Android only */
    internal_total?: number;
    /** Android only */
    external_free?: number;
    /** Android only */
    external_total?: number;
}

/**
 * Well-known directories. A directory that does not exist on the platform is "".
 */
export interface Dirs {
    /** The app's documents: iOS Documents, the Android files directory, Windows LocalFolder. */
    DocumentDir: string;
    /** The app's cache: iOS Caches, the Android cache directory, Windows LocalCacheFolder. */
    CacheDir: string;
    /** The app bundle (iOS), the app's data directory (Android), the app package (Windows). */
    MainBundleDir: string;
    /** iOS Library; Windows LocalFolder; "" on Android. */
    LibraryDir: string;
    /** iOS Application Support; Windows RoamingFolder; "" on Android. */
    ApplicationSupportDir: string;
    /** Pictures: the app-specific directory on Android external storage (no permission needed), the user's folder on Windows. */
    PictureDir: string;
    /** Music, as `PictureDir`. */
    MusicDir: string;
    /** Movies, as `PictureDir`. */
    MovieDir: string;
    /** Downloads, as `PictureDir`. */
    DownloadDir: string;
    /** Android: the app-specific DCIM directory; Windows: the camera roll; "" on iOS. */
    DCIMDir: string;
    /** Android: the ringtone directory; "" elsewhere. */
    RingtoneDir: string;
    /**
     * The directory for temporary files: iOS tmp, the Android cache
     * directory, Windows TemporaryFolder. The system may clear it.
     */
    TemporaryDir: string;
    /** Android: the app's cache directory on external storage; "" elsewhere or when none is mounted. */
    ExternalCacheDir: string;
    /** Windows: the roaming application data folder; "" elsewhere. */
    RoamingDir: string;
    /** @deprecated */
    SDCardDir: string;
    /** @deprecated */
    SDCardApplicationDir: string;
    /**
     * Android: the shared public Pictures directory, writable up to Android 9
     * with WRITE_EXTERNAL_STORAGE; use `media` on 10 and up. "" elsewhere.
     */
    LegacyPictureDir: string;
    /** Android: the shared public Music directory, as `LegacyPictureDir`. */
    LegacyMusicDir: string;
    /** Android: the shared public Movies directory, as `LegacyPictureDir`. */
    LegacyMovieDir: string;
    /** Android: the shared public Download directory, as `LegacyPictureDir`. */
    LegacyDownloadDir: string;
    /** Android: the shared public DCIM directory, as `LegacyPictureDir`. */
    LegacyDCIMDir: string;
    /** Android: the shared public Ringtones directory, as `LegacyPictureDir`. */
    LegacyRingtoneDir: string;
    /** @deprecated */
    LegacySDCardDir: string;
}

/** A stream writing a file in chunks, from `fs.writeStream`. Close it when done. */
export declare class ReactNativeBlobUtilWriteStream {
    /** The id native knows the stream by. */
    id: string;
    /** The encoding of the chunks. */
    encoding: string;
    /** Whether the stream appends to the file. */
    append: boolean;

    /**
     * Write a chunk: a string, or byte values 0..255 for an ascii stream.
     * Resolves the stream, so writes chain; rejects EBADF once it is closed.
     */
    write(data: string | number[]): Promise<ReactNativeBlobUtilWriteStream>;

    /** Close the stream. Rejects EBADF when it is already closed. */
    close(): Promise<void>;
}

/** A stream reading a file in chunks, from `fs.readStream`. */
export declare class ReactNativeBlobUtilReadStream {
    /** The file being read. */
    path: string;
    /** The encoding of the chunks. */
    encoding: Encoding;
    /** Bytes per chunk. */
    bufferSize?: number;
    /** Milliseconds between chunks. */
    tick: number;
    /** Whether the stream has ended or failed; it cannot be opened again. */
    closed: boolean;
    /** The id native knows the stream by. */
    streamId: string;

    /**
     * Start reading. Register the handlers first. Resolves when the stream
     * ends and rejects with the error when it fails; with `onError` set the
     * rejection counts as handled.
     */
    open(): Promise<void>;

    /**
     * Called per chunk: a string, or byte values 0..255 for an ascii stream.
     */
    onData(fn: (chunk: string | number[]) => void): void;

    /** Called when reading fails; with it set, the rejection of `open()` counts as handled. */
    onError(fn: (err: CodedError) => void): void;

    /** Called once the end of the file is reached. */
    onEnd(fn: () => void): void;
}

/** @deprecated use ReactNativeBlobUtilReadStream */
export type ReactNativeBlobUtilStream = ReactNativeBlobUtilReadStream;

/**
 * A named list of files that can be removed together.
 */
export declare class ReactNativeBlobUtilSession {
    constructor(name: string, list?: string[]);

    /** The session's name. */
    name: string;

    /** Add a path to the session. */
    add(path: string): ReactNativeBlobUtilSession;

    /** Take a path out of the session; the file stays. */
    remove(path: string): ReactNativeBlobUtilSession;

    /** The paths in the session. */
    list(): string[];

    /**
     * Delete every file in the session and forget the session.
     */
    dispose(): Promise<void>;

    /** The paths of a session, or undefined when there is none. Sessions live in memory only. */
    static getSession(name: string): string[] | undefined;

    /** Replace the paths of a session. */
    static setSession(name: string, list: string[]): void;

    /** Forget a session; its files stay. */
    static removeSession(name: string): void;
}

/**
 * @deprecated The names from before 1.0; each forwards to `open.*` or `fs.*`.
 */
export interface IOSApi {
    /**
     * Show the options menu of UIDocumentInteractionController for the file.
     * @param path Path without a scheme.
     * @param scheme A URI scheme the app declares, if any.
     */
    presentOptionsMenu(path: string, scheme?: string): Promise<void>;

    /**
     * Show the "open in" menu of UIDocumentInteractionController for the file.
     */
    presentOpenInMenu(path: string, scheme?: string): Promise<void>;

    /**
     * Show a full-screen preview of the file.
     */
    presentPreview(path: string, scheme?: string): Promise<void>;

    /**
     * Exclude the file or directory from iCloud and iTunes backups.
     */
    excludeFromBackupKey(path: string): Promise<void>;

    /**
     * The directory shared by the apps of an app group.
     */
    pathForAppGroup(groupName: string): Promise<string>;

    /**
     * The directory shared by the apps of an app group, synchronously. "" on
     * other platforms.
     */
    syncPathAppGroup(groupName: string): string;

    /** @deprecated use `open.optionsMenu` */
    openDocument(path: string, scheme?: string): Promise<void>;

    /** @deprecated use `open.file` */
    previewDocument(path: string, scheme?: string): Promise<void>;
}

/**
 * @deprecated The names from before 1.0; each forwards to `open.*` or `media.*`.
 */
export interface AndroidApi {
    /**
     * Open the file in another app with an ACTION_VIEW intent.
     * @param chooserTitle Show an app chooser with this title.
     * @deprecated use `open.file` or `open.chooser`
     */
    actionViewIntent(path: string, mime: string, chooserTitle?: string): Promise<void>;

    /**
     * Show the system file picker and resolve the URI of the chosen file, or
     * null when the user cancels.
     */
    getContentIntent(mime: string): Promise<string | null>;

    /**
     * Register an existing file with the Downloads app.
     */
    addCompleteDownload(options: AndroidDownloadOption): Promise<void>;

    /** The external storage root. Use `fs.sdCardDir`. */
    getSDCardDir(): Promise<string>;

    /** The app's directory on external storage. Use `fs.sdCardApplicationDir`. */
    getSDCardApplicationDir(): Promise<string>;

    /**
     * Ask the media scanner to index files, so they show in the gallery and
     * other apps.
     */
    scanFile(pairs: Array<{ path: string; mime?: string }>): Promise<void>;
}

/** A finished download to list in the Downloads app (`media.addDownload`). */
export interface AndroidDownloadOption {
    /** Title shown in the Downloads app. */
    title: string;
    /** Description shown in the Downloads app. */
    description: string;
    /** MIME type of the file. */
    mime: string;
    /** Path of the file. */
    path: string;
    /** Show a notification, as `android.downloadManager.notification` does. */
    notification?: boolean;
    /** @deprecated use `notification` */
    showNotification?: boolean;
}

/** A MediaStore collection. */
export type Mediatype = 'Audio' | 'Image' | 'Video' | 'Download';

/**
 * A file in the Android MediaStore.
 */
export interface filedescriptor {
    /** File name, with extension. */
    name: string;
    /** Sub-directory inside the collection; "" (the default) for the collection itself. */
    parentFolder?: string;
    /** The MIME type. */
    mime?: string;
    /** @deprecated use `mime` */
    mimeType?: string;
}

/**
 * @deprecated The names from before 1.0; each forwards to `media.*`.
 */
export interface MediaCollection {
    /**
     * Create an entry in the collection and copy a file into it.
     * @return The content URI of the entry.
     */
    copyToMediaStore(filedata: filedescriptor, mediatype: Mediatype, path: string): Promise<string>;

    /**
     * Create an empty entry in the collection.
     * @return The content URI of the entry.
     */
    createMediaFile(filedata: filedescriptor, mediatype: Mediatype): Promise<string>;

    /**
     * Copy a file into an existing entry.
     * @param uri The entry's content URI.
     * @param path The file to copy.
     */
    writeToMediaFile(uri: string, path: string): Promise<string>;

    /**
     * Run the registered file transformer on a file and copy the result into
     * an existing entry.
     */
    writeToMediaFileWithTransform(uri: string, path: string): Promise<string>;

    /**
     * Copy an entry into the app's own storage.
     */
    copyToInternal(contenturi: string, destpath: string): Promise<string>;

    /**
     * Read an entry: text for utf8, a base64 string, or byte values for ascii.
     */
    getBlob(contenturi: string, encoding: 'ascii'): Promise<number[]>;
    getBlob(contenturi: string, encoding: 'utf8' | 'base64'): Promise<string>;

    /** @deprecated use `media.createFile` */
    createMediafile(filedata: filedescriptor, mediatype: Mediatype): Promise<string>;
    /** @deprecated use `media.write` */
    writeToMediafile(uri: string, path: string): Promise<string>;
    /** @deprecated use `media.write(uri, path, {transform: true})` */
    writeToMediafileWithTransform(uri: string, path: string): Promise<string>;
}

/** Helpers for the `wrap(path)` references of request bodies. */
export declare const URIUtil: {
    /** Whether a string is a `wrap(path)` reference, to a file or to a content URI. */
    isFileURI(uri: string): boolean;
    /** Strip the `ReactNativeBlobUtil-file://` or `ReactNativeBlobUtil-content://` prefix. */
    unwrapFileURI(uri: string): string;
    /** Strip `iterations` URI schemes (default 1). */
    removeURIScheme(uri: string, iterations?: number): string;
    /** The same as `ReactNativeBlobUtil.wrap`. */
    wrap(path: string): string;
};

/**
 * A random UUID v4 string.
 */
export declare function getUUID(): string;
