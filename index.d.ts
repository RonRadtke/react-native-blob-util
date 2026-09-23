// Type definitions for react-native-blob-util
// Project: https://github.com/RonRadtke/react-native-blob-util
//
// Declared against the JavaScript in this package: index.js, fetch.js, fs.js,
// open.js, media.js, the deprecated android.js, ios.js and mediacollection.js,
// and class/. Every method here exists
// at runtime with this signature, and every runtime method is declared here.

declare const ReactNativeBlobUtil: ReactNativeBlobUtilStatic;
export default ReactNativeBlobUtil;
export type ReactNativeBlobUtil = ReactNativeBlobUtilStatic;

// The same objects as the default export's members.
export declare const fetch: ReactNativeBlobUtilStatic['fetch'];
export declare const config: ReactNativeBlobUtilStatic['config'];
export declare const fs: FS;
export declare const open: OpenApi;
export declare const media: MediaApi;
export declare const session: ReactNativeBlobUtilStatic['session'];
export declare const wrap: ReactNativeBlobUtilStatic['wrap'];
export declare const base64: ReactNativeBlobUtilStatic['base64'];

export interface ReactNativeBlobUtilStatic {
    /**
     * Send an HTTP request with the default configuration. Use
     * `config(options).fetch(...)` to configure it.
     * @param method HTTP method.
     * @param url Request URL.
     * @param headers Request headers. `null` and `undefined` values are sent as "".
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

    base64: { encode(input: string): string; decode(input: string): string };
    fs: FS;
    open: OpenApi;
    media: MediaApi;
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

    CanceledFetchError: typeof CanceledFetchError;
}

export type Methods = 'POST' | 'GET' | 'DELETE' | 'PUT' | 'PATCH' | 'HEAD' | 'OPTIONS'
    | 'post' | 'get' | 'delete' | 'put' | 'patch' | 'head' | 'options';

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
    name: string;
    data: string | ExplicitBody;
    filename?: string;
    type?: string;
}

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
     * the returned promise resolves once native has cancelled.
     */
    cancel(callback?: (reason?: any) => void): Promise<void>;
}

export interface ProgressConfig {
    count?: number;
    interval?: number;
}

export type ProgressHandler = (received: number, total: number, chunk?: string) => void;
export type UploadProgressHandler = (sent: number, total: number) => void;

/**
 * The result of a `fetch`: the response body, held as utf8 text, a base64
 * string, or the path of the file it was written to (`type`).
 */
export declare class FetchBlobResponse {
    constructor(taskId: string, info: ReactNativeBlobUtilResponseInfo, data: any);

    taskId: string;
    type: 'base64' | 'path' | 'utf8';
    data: any;
    respInfo: ReactNativeBlobUtilResponseInfo;

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

export interface ReactNativeBlobUtilResponseInfo {
    taskId: string;
    state: string;
    headers: { [name: string]: string };
    status: number;
    /** Every URL a redirect went through. */
    redirects?: string[];
    respType: 'text' | 'blob' | '' | 'json';
    rnfbEncode: 'path' | 'base64' | 'utf8';
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
     * The extension of the random file name `fileCache` creates.
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
        /** Use a background session so the download continues when the app is suspended. */
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
    encoding?: E;
    /** Run the registered file transformer (not for ascii). */
    transform?: boolean;
}

export interface AddAndroidDownloads {
    /** Download through the DownloadManager (required for the other options). */
    useDownloadManager?: boolean;
    /** Title shown in the Downloads app. */
    title?: string;
    /** Description shown in the Downloads app. */
    description?: string;
    /** Destination path; must be on external storage (e.g. DCIMDir). */
    path?: string;
    /** MIME type of the file. Default text/plain. */
    mime?: string;
    /** Let the media scanner index the file. */
    mediaScannable?: boolean;
    /** Android 10+: store the file in the Downloads collection (may override path). */
    storeInDownloads?: boolean;
    /** Show a notification while downloading and when complete. */
    notification?: boolean;
    /** Store the file in the app's own download directory. */
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
    code: ErrorCode;
}

/**
 * The rejection of a failed `fetch`: the code, and the response info received
 * before it failed.
 */
export interface FetchError extends CodedError {
    respInfo: ReactNativeBlobUtilResponseInfo;
}

/**
 * The rejection of a cancelled `fetch`.
 */
export declare class CanceledFetchError extends Error {
    constructor(message?: string);
    name: 'ReactNativeBlobUtilCanceledFetch';
    code: 'ECANCELED';
}

export type Encoding = 'utf8' | 'ascii' | 'base64';

/** Write encodings: `uri` copies the file the data string points at. */
export type WriteEncoding = Encoding | 'uri';

export type HashAlgorithm = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512';

export interface FS {
    /**
     * Remove the file or directory at path.
     */
    unlink(path: string): Promise<void>;

    /**
     * Create a directory, including missing parents. Rejects EEXIST when it exists.
     */
    mkdir(path: string): Promise<void>;

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
     * Move a file. An existing destination is overwritten.
     */
    mv(path: string, dest: string): Promise<void>;

    /**
     * Copy a file. An existing destination is overwritten.
     */
    cp(path: string, dest: string): Promise<void>;

    /**
     * A write stream to the file.
     * @param append Append to the file instead of replacing it. Default false.
     */
    writeStream(path: string, encoding?: Encoding, append?: boolean): Promise<ReactNativeBlobUtilWriteStream>;
    writeStream(path: string, options: {encoding?: Encoding; append?: boolean}): Promise<ReactNativeBlobUtilWriteStream>;

    /**
     * Write data to a file, replacing it.
     * @param data A string, or byte values 0..255 for the ascii encoding.
     * @return The number of bytes written.
     */
    writeFile(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;
    writeFile(path: string, data: number[], encoding: 'ascii'): Promise<number>;

    writeFile(path: string, data: string, encoding: 'utf8' | 'base64' | 'uri' | undefined, options: {transform?: boolean}): Promise<number>;
    // An encoding only known at runtime.
    writeFile(path: string, data: string | number[], encoding?: WriteEncoding, options?: {transform?: boolean}): Promise<number>;
    writeFile(path: string, data: number[], options: FileOptions<'ascii'> & {encoding: 'ascii'}): Promise<number>;
    writeFile(path: string, data: string, options: FileOptions<'utf8' | 'base64' | 'uri'>): Promise<number>;

    /** @deprecated use `writeFile(path, data, encoding, {transform: true})` */
    writeFileWithTransform(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;

    /**
     * Append data to a file.
     * @return The number of bytes written.
     */
    appendFile(path: string, data: string, encoding?: 'utf8' | 'base64' | 'uri'): Promise<number>;
    appendFile(path: string, data: number[], encoding: 'ascii'): Promise<number>;
    appendFile(path: string, data: string | number[], encoding?: WriteEncoding): Promise<number>;
    appendFile(path: string, data: string | number[], options: {encoding?: WriteEncoding}): Promise<number>;

    /**
     * Read a file: text for utf8, a base64 string, or byte values 0..255 for ascii.
     */
    readFile(path: string, encoding: 'ascii'): Promise<number[]>;
    readFile(path: string, encoding?: 'utf8' | 'base64'): Promise<string>;

    readFile(path: string, encoding: 'ascii', options: {transform?: boolean}): Promise<number[]>;
    readFile(path: string, encoding: 'utf8' | 'base64' | undefined, options: {transform?: boolean}): Promise<string>;
    // An encoding only known at runtime.
    readFile(path: string, encoding?: Encoding, options?: {transform?: boolean}): Promise<string | number[]>;
    readFile(path: string, options: FileOptions<'ascii'> & {encoding: 'ascii'}): Promise<number[]>;
    readFile(path: string, options: FileOptions<'utf8' | 'base64'>): Promise<string>;

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
    createFile(path: string, data: string | number[], options: {encoding?: WriteEncoding}): Promise<void>;

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
     * The path of a bundled asset, for use with the other fs calls.
     */
    asset(path: string): string;

    /**
     * Free and total storage in bytes. Android also reports the internal and
     * external volumes separately.
     */
    df(): Promise<ReactNativeBlobUtilDf>;

    dirs: Dirs;

    /** Android: the external storage root. ENOTSUP elsewhere. */
    sdCardDir(): Promise<string>;

    /** Android: the app's directory on external storage. ENOTSUP elsewhere. */
    sdCardApplicationDir(): Promise<string>;

    ReactNativeBlobUtilSession: typeof ReactNativeBlobUtilSession;

    /**
     * iOS: exclude the file or directory from iCloud and iTunes backups. ENOTSUP elsewhere.
     */
    excludeFromBackup(path: string): Promise<void>;

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
     * Android: the system file picker. Resolves the chosen file's content URI,
     * or null when the user cancels.
     */
    pick(mime?: string | {mime?: string}): Promise<string | null>;
}

/**
 * The device's shared media library (Android: MediaStore, Downloads app,
 * media scanner). Every call rejects with ENOTSUP elsewhere.
 */
export interface MediaApi {
    /** Create an empty entry in a collection; resolves its content URI. */
    createFile(fd: filedescriptor, collection: Mediatype): Promise<string>;
    /** Copy a file into an existing entry, optionally through the file transformer. */
    write(uri: string, path: string, options?: {transform?: boolean}): Promise<void>;
    /** Create an entry and copy a file into it; resolves its content URI. */
    copyToMediaStore(fd: filedescriptor, collection: Mediatype, path: string): Promise<string>;
    /** Copy an entry into the app's own storage, overwriting the destination. */
    copyToInternal(uri: string, dest: string): Promise<void>;
    /** Read an entry: text, a base64 string, or bytes 0..255. */
    read(uri: string, encoding: 'ascii'): Promise<number[]>;
    read(uri: string, encoding?: 'utf8' | 'base64'): Promise<string>;
    read(uri: string, encoding?: Encoding | {encoding?: Encoding}): Promise<string | number[]>;
    /** Register a finished download with the Downloads app. */
    addDownload(options: AndroidDownloadOption): Promise<void>;
    /** Ask the media scanner to index files. */
    scan(files: Array<{ path: string; mime?: string }>): Promise<void>;
}

export interface ReactNativeBlobUtilStat {
    filename: string;
    path: string;
    /** Bytes. */
    size: number;
    type: 'file' | 'directory' | 'asset';
    /** Milliseconds since the epoch. */
    lastModified: number;
}

/** @deprecated use ReactNativeBlobUtilDf */
export type RNFetchBlobDf = ReactNativeBlobUtilDf;

export interface ReactNativeBlobUtilDf {
    free: number;
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
    DocumentDir: string;
    CacheDir: string;
    MainBundleDir: string;
    LibraryDir: string;
    ApplicationSupportDir: string;
    PictureDir: string;
    MusicDir: string;
    MovieDir: string;
    DownloadDir: string;
    DCIMDir: string;
    /** Android: the ringtone directory; "" elsewhere. */
    RingtoneDir: string;
    /** @deprecated */
    SDCardDir: string;
    /** @deprecated */
    SDCardApplicationDir: string;
    LegacyPictureDir: string;
    LegacyMusicDir: string;
    LegacyMovieDir: string;
    LegacyDownloadDir: string;
    LegacyDCIMDir: string;
    LegacyRingtoneDir: string;
    /** @deprecated */
    LegacySDCardDir: string;
}

export declare class ReactNativeBlobUtilWriteStream {
    id: string;
    encoding: string;
    append: boolean;

    /**
     * Write a chunk: a string, or byte values 0..255 for an ascii stream.
     */
    write(data: string | number[]): Promise<ReactNativeBlobUtilWriteStream>;

    close(): Promise<void>;
}

export declare class ReactNativeBlobUtilReadStream {
    path: string;
    encoding: Encoding;
    bufferSize?: number;
    tick: number;
    closed: boolean;
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

    onError(fn: (err: CodedError) => void): void;

    onEnd(fn: () => void): void;
}

/** @deprecated use ReactNativeBlobUtilReadStream */
export type ReactNativeBlobUtilStream = ReactNativeBlobUtilReadStream;

/**
 * A named list of files that can be removed together.
 */
export declare class ReactNativeBlobUtilSession {
    constructor(name: string, list?: string[]);

    name: string;

    add(path: string): ReactNativeBlobUtilSession;

    remove(path: string): ReactNativeBlobUtilSession;

    list(): string[];

    /**
     * Delete every file in the session and forget the session.
     */
    dispose(): Promise<void>;

    static getSession(name: string): string[] | undefined;

    static setSession(name: string, list: string[]): void;

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

    getSDCardDir(): Promise<string>;

    getSDCardApplicationDir(): Promise<string>;

    /**
     * Ask the media scanner to index files, so they show in the gallery and
     * other apps.
     */
    scanFile(pairs: Array<{ path: string; mime?: string }>): Promise<void>;
}

export interface AndroidDownloadOption {
    /** Title shown in the Downloads app. */
    title: string;
    /** Description shown in the Downloads app. */
    description: string;
    /** MIME type of the file. */
    mime: string;
    /** Path of the file. */
    path: string;
    /** Show a notification. */
    showNotification: boolean;
}

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

export declare const URIUtil: {
    /** Whether a string is a `wrap(path)` reference. */
    isFileURI(uri: string): boolean;
    /** Strip the `ReactNativeBlobUtil-file://` prefix. */
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
