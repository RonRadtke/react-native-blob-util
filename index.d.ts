// Type definitions for react-native-fetch-blob 0.10
// Project: https://github.com/wkh237/react-native-fetch-blob#readme
// Definitions by: MNB <https://github.com/MNBuyskih>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare const ReactNativeBlobUtil: ReactNativeBlobUtilStatic;
export default ReactNativeBlobUtil;
export type ReactNativeBlobUtil = ReactNativeBlobUtilStatic;
import { filedescriptor } from "./types";
import CanceledFetchError from "./class/ReactNativeBlobUtilCanceledFetchError";

interface ReactNativeBlobUtilStatic {
    fetch(method: Methods, url: string, headers?: { [key: string]: string }, body?: any | null): StatefulPromise<FetchBlobResponse>;

    base64: { encode(input: string): string; decode(input: string): string };
    android: AndroidApi;
    ios: IOSApi;

    config(options: ReactNativeBlobUtilConfig): ReactNativeBlobUtilStatic;

    session(name: string): ReactNativeBlobUtilSession;

    fs: FS;
    MediaCollection: MediaCollection;

    wrap(path: string): string;

    net: Net;
    CanceledFetchError: CanceledFetchError;
}

/**
 * ReactNativeBlobUtil response object class.
 */
export interface FetchBlobResponse {
    taskId: string;

    /**
     * get path of response temp file
     * @return File path of temp file.
     */
    path(): string;

    type: "base64" | "path" | "utf8";
    data: any;

    /**
     * Convert result to text.
     * @return Decoded base64 string.
     */
    text(): string | Promise<any>;

    /**
     * Convert result to JSON object.
     * @return Parsed javascript object.
     */
    json(): any;

    /**
     * Return BASE64 string directly.
     * @return BASE64 string of response body.
     */
    base64(): any;

    /**
     * Remove cahced file
     */
    flush(): void;

    respInfo: ReactNativeBlobUtilResponseInfo;

    info(): ReactNativeBlobUtilResponseInfo;

    session(name: string): ReactNativeBlobUtilSession | null;

    /**
     * Read file content with given encoding, if the response does not contains
     * a file path, show warning message
     * @param  encode Encode type, should be one of `base64`, `ascrii`, `utf8`.
     */
    readFile(encode: Encoding): Promise<any> | null;

    /**
     * Start read stream from cached file
     * @param  encode Encode type, should be one of `base64`, `ascrii`, `utf8`.
     */
    readStream(encode: Encoding): ReactNativeBlobUtilStream | null;
}

export interface Net {
    /**
     * Get cookie according to the given url.
     * @param  domain Domain of the cookies to be removed, remove all
     * @return     Cookies of a specific domain.
     */
    getCookies(domain: string): Promise<string[]>;

    /**
     * Remove cookies for a specific domain
     * @param  domain Domain of the cookies to be removed, remove all
     * cookies when this is null.
     */
    removeCookies(domain?: string): Promise<null>;
}

type HashAlgorithm = "md5" | "sha1" | "sha224" | "sha256" | "sha384" | "sha512";

export interface FS {
    ReactNativeBlobUtilSession: ReactNativeBlobUtilSession;

    /**
     * Remove file at path.
     * @param    path:string Path of target file.
     */
    unlink(path: string): Promise<void>;

    /**
     * Create a directory.
     * @param  path Path of directory to be created
     */
    mkdir(path: string): Promise<void>;

    /**
     * Get a file cache session
     * @param  name Stream ID
     */
    session(name: string): ReactNativeBlobUtilSession;

    ls(path: string): Promise<string[]>;

    /**
     * Read the file from the given path and calculate a cryptographic hash sum over its contents.
     *
     * Note: `sha224` is not available on Windows. Neither WinRT's hash providers
     * nor CNG offer SHA-224, so the call rejects there. Android and iOS support
     * every algorithm listed.
     *
     * @param path Path to the file
     * @param algorithm The hash algorithm to use
     */
    hash(path: string, algorithm: HashAlgorithm): Promise<string>;

    /**
     * Create file stream from file at `path`.
     * @param  path   The file path.
     * @param  encoding Data encoding, should be one of `base64`, `utf8`, `ascii`
     * @param  bufferSize Size of stream buffer.
     * @return ReactNativeBlobUtilStream stream instance.
     */
    readStream(path: string, encoding: Encoding, bufferSize?: number, tick?: number): Promise<ReactNativeBlobUtilReadStream>;

    mv(path: string, dest: string): Promise<boolean>;

    cp(path: string, dest: string): Promise<boolean>;

    /**
     * Create write stream to a file.
     * @param  path Target path of file stream.
     * @param  encoding Encoding of input data.
     * @param  append  A flag represent if data append to existing ones.
     * @return A promise resolves a `WriteStream` object.
     */
    writeStream(path: string, encoding: Encoding, append?: boolean): Promise<ReactNativeBlobUtilWriteStream>;

    /**
     * Write data to file.
     * @param  path  Path of the file.
     * @param  data Data to write to the file.
     * @param  encoding Encoding of data (Optional).
     */
    writeFile(path: string, data: string | number[], encoding?: Encoding): Promise<void>;

    /**
     * Processes the data and then writes to the file.
     * @param  path  Path of the file.
     * @param  data Data to write to the file.
     * @param  encoding Encoding of data (Optional).
     */
    writeFileWithTransform(path: string, data: string | number[], encoding?: Encoding): Promise<void>;

    appendFile(path: string, data: string | number[], encoding?: Encoding | "uri"): Promise<number>;

    /**
     * Wrapper method of readStream.
     * @param  path Path of the file.
     * @param  encoding Encoding of read stream.
     */
    readFile(path: string, encoding: Encoding, bufferSize?: number): Promise<any>;

    /**
     * Reads from a file and then processes the data before returning
     * @param  path Path of the file.
     * @param  encoding Encoding of read stream.
     */
    readFileWithTransform(path: string, encoding: Encoding, bufferSize?: number): Promise<any>;

    /**
     * Check if file exists and if it is a folder.
     * @param  path Path to check
     */
    exists(path: string): Promise<boolean>;

    /**
     * Create a file with the given content.
     * @return The path of the created file.
     */
    createFile(path: string, data: string | number[], encoding: Encoding | 'uri'): Promise<string>;

    isDir(path: string): Promise<boolean>;

    /**
     * Show statistic data of a path.
     * @param  path Target path
     */
    stat(path: string): Promise<ReactNativeBlobUtilStat>;

    lstat(path: string): Promise<ReactNativeBlobUtilStat[]>;

    /**
     * Android only method, request media scanner to scan the file.
     * @param  pairs Array contains Key value pairs with key `path` and `mime`.
     */
    scanFile(pairs: Array<{ [key: string]: string }>): Promise<void>;

    dirs: Dirs;

    slice(src: string, dest: string, start: number, end: number): Promise<string>;

    asset(path: string): string;

    /**
     * Free and total storage in bytes. Android also reports the internal and
     * external volumes separately.
     */
    df(): Promise<ReactNativeBlobUtilDf>;

    /**
     * Returns the path for the app group.
     * @param  {string} groupName Name of app group
     */
    pathForAppGroup(groupName: string): Promise<string>;
}

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

/** @deprecated use ReactNativeBlobUtilDf */
export type RNFetchBlobDf = ReactNativeBlobUtilDf;

export interface Dirs {
    DocumentDir: string;
    CacheDir: string;
    PictureDir: string;
    LibraryDir: string;
    MusicDir: string;
    MovieDir: string;
    DownloadDir: string;
    DCIMDir: string;
    SDCardDir: string;
    MainBundleDir: string;

    LegacyPictureDir: string;
    LegacyMusicDir: string;
    LegacyMovieDir: string;
    LegacyDownloadDir: string;
    LegacyDCIMDir: string;
    LegacySDCardDir: string; // Depracated
}

export interface ReactNativeBlobUtilWriteStream {
    id: string;
    encoding: string;
    append: boolean;

    write(data: string): Promise<void>;

    close(): Promise<void>;
}

export interface ReactNativeBlobUtilReadStream {
    path: string;
    encoding: Encoding;
    bufferSize?: number;
    closed: boolean;
    tick: number;

    open(): void;

    onData(fn: (chunk: string | number[]) => void): void;

    onError(fn: (err: any) => void): void;

    onEnd(fn: () => void): void;
}

export type Encoding = "utf8" | "ascii" | "base64";

/* tslint:disable-next-line interface-name*/
export interface IOSApi {
    /**
     * Open a file in {@link https://developer.apple.com/reference/uikit/uidocumentinteractioncontroller UIDocumentInteractionController},
     * this is the default document viewer of iOS, supports several kinds of files. On Android, there's an similar method {@link android.actionViewIntent}.
     * @param path This is a required field, the path to the document. The path should NOT contain any scheme prefix.
     * @param  {string} scheme URI scheme that needs to support, optional
     */
    previewDocument(path: string, scheme?: string): void;

    /**
     * Show options menu for interact with the file.
     * @param path This is a required field, the path to the document. The path should NOT contain any scheme prefix.
     * @param  {string} scheme URI scheme that needs to support, optional
     */
    openDocument(path: string, scheme?: string): Promise<void>;

    /**
     * Displays an options menu using [UIDocumentInteractionController](https://developer.apple.com/reference/uikit/uidocumentinteractioncontroller).[presentOptionsMenu](https://developer.apple.com/documentation/uikit/uidocumentinteractioncontroller/1616814-presentoptionsmenu)
     * @param  {string} path Path of the file to be open.
     * @param  {string} scheme URI scheme that needs to support, optional
     */
    presentOptionsMenu(path: string, scheme?: string): Promise<void>;

    /**
     * Displays a menu for opening the document using [UIDocumentInteractionController](https://developer.apple.com/reference/uikit/uidocumentinteractioncontroller).[presentOpenInMenu](https://developer.apple.com/documentation/uikit/uidocumentinteractioncontroller/1616807-presentopeninmenu)
     * @param  {string} path Path of the file to be open.
     * @param  {string} scheme URI scheme that needs to support, optional
     */
    presentOpenInMenu(path: string, scheme?: string): Promise<void>;

    /**
     * Displays a full-screen preview of the target document using [UIDocumentInteractionController](https://developer.apple.com/reference/uikit/uidocumentinteractioncontroller).[presentPreview](https://developer.apple.com/documentation/uikit/uidocumentinteractioncontroller/1616828-presentpreview)
     * @param  {string} path Path of the file to be open.
     * @param  {string} scheme URI scheme that needs to support, optional
     */
    presentPreview(path: string, scheme?: string): Promise<void>;

    /**
     * Marks the file to be excluded from icloud/itunes backup. Works recursively if path is to a directory
     * @param {string} path  Path to a file or directory to mark to be excluded.
     */
    excludeFromBackupKey(path: string): Promise<void>;
}

export interface AndroidDownloadOption {
    /**
     * Title string to be displayed when the file added to Downloads app.
     */
    title: string;

    /**
     * File description to be displayed when the file added to Downloads app.
     */
    description: string;

    /**
     * MIME string of the file.
     */
    mime: string;

    /**
     * URI string of the file.
     */
    path: string;

    /**
     * Boolean value that determines if notification will be displayed.
     */
    showNotification: boolean;
}

export interface AndroidApi {
    /**
     * When sending an ACTION_VIEW intent with given file path and MIME type, system will try to open an
     * App to handle the file. For example, open Gallery app to view an image, or install APK.
     * @param path Path of the file to be opened.
     * @param mime Basically system will open an app according to this MIME type.
     * @param chooserTitle title for chooser, if not set the chooser won't be displayed (see [Android docs](https://developer.android.com/reference/android/content/Intent.html#createChooser(android.content.Intent,%20java.lang.CharSequence)))
     */
    actionViewIntent(path: string, mime: string, chooserTitle?: string): Promise<boolean | null>;

    /**
     *
     * This method brings up OS default file picker and resolves a file URI when the user selected a file.
     * However, it does not resolve or reject when user dismiss the file picker via pressing hardware back button,
     * but you can still handle this behavior via AppState.
     * @param mime MIME type filter, only the files matches the MIME will be shown.
     */
    getContentIntent(mime: string): Promise<any>;

    /**
     * Using this function to add an existing file to Downloads app.
     * @param options An object that for setting the title, description, mime, and notification of the item.
     */
    addCompleteDownload(options: AndroidDownloadOption): Promise<void>;

    getSDCardDir(): Promise<string>;

    getSDCardApplicationDir(): Promise<string>;
}

type Methods = "POST" | "GET" | "DELETE" | "PUT" | "PATCH" | "HEAD" | "post" | "get" | "delete" | "put" | "patch" | "head";

/**
 * A declare class inherits Promise, it has extra method like progress, uploadProgress,
 * and cancel which can help managing an asynchronous task's state.
 */
export interface StatefulPromise<T> extends Promise<T> {
    /**
     * Cancel the request when invoke this method.
     */
    cancel(cb?: (reason: any) => void): StatefulPromise<FetchBlobResponse>;

    /**
     * Add an event listener which triggers when data receiving from server.
     */
    progress(callback: (received: number, total: number) => void): StatefulPromise<FetchBlobResponse>;

    /**
     * Add an event listener with custom configuration
     */
    progress(config: { count?: number; interval?: number }, callback: (received: number, total: number) => void): StatefulPromise<FetchBlobResponse>;

    /**
     * Add an event listener with custom configuration.
     */
    uploadProgress(callback: (sent: number, total: number) => void): StatefulPromise<FetchBlobResponse>;

    /**
     * Add an event listener with custom configuration
     */
    uploadProgress(config: { count?: number; interval?: number }, callback: (sent: number, total: number) => void): StatefulPromise<FetchBlobResponse>;
}

export declare class ReactNativeBlobUtilSession {
    constructor(name: string, list: string[]);

    add(path: string): ReactNativeBlobUtilSession;

    remove(path: string): ReactNativeBlobUtilSession;

    dispose(): Promise<void>;

    list(): string[];

    name: string;

    static getSession(name: string): any;

    static setSession(name: string): void;

    static removeSession(name: string): void;
}

/**
 * A set of configurations that will be injected into a fetch method, with the following properties.
 */
export interface ReactNativeBlobUtilConfig {
    /**
     * Cache the response under this key: when a file downloaded with the same key
     * exists, it is returned without a request. Implies fileCache.
     */
    key?: string;

    /**
     * When this property is true, the downloaded data will overwrite the existing file. (true by default)
     */
    overwrite?: boolean;

    /**
     * Set timeout of the request (in milliseconds).
     */
    timeout?: number;

    /**
     * Set this property to true will allow the request create connection with server have self-signed SSL
     * certification. This is not recommended to use in production.
     */
    trusty?: boolean;

    /**
     * Set this property to true will only do requests through the WiFi interface, and fail otherwise.
     */
    wifiOnly?: boolean;

    /**
     * Set this property to search for the WiFi interface that uses this targetHostIp
     */
    targetHostIp?: string;

    /**
     * Set this property so redirects are not automatically followed.
     */
    followRedirect?: boolean;

    /**
     * Set this property to true will makes response data of the fetch stored in a temp file, by default the temp
     * file will stored in App's own root folder with file name template ReactNativeBlobUtil_tmp${timestamp}.
     */
    fileCache?: boolean;

    /**
     * Set this property to true if you want the data to be processed before it gets written onto disk.
     * This only has effect if the FileTransformer has been registered and the library is configured to write
     * response onto disk.
     */
    transformFile?: boolean;

    /**
     * Set this property to change temp file extension that created by fetch response data.
     */
    appendExt?: string;

    /**
     * When this property has value, fetch API will try to store response data in the path ignoring fileCache and
     * appendExt property.
     */
    path?: string;

    session?: string;

    addAndroidDownloads?: AddAndroidDownloads;

    /**
     * Fix IOS request timeout issue #368 by change default request setting to defaultSessionConfiguration, and make backgroundSessionConfigurationWithIdentifier optional
     */
    IOSBackgroundTask?: boolean;

    /**
     * An array of custom CA certificate resource names (without file extension) bundled
     * in the app. These certificates will be used as trust anchors when evaluating the
     * server's TLS certificate. Supports .cer, .der, and .pem files.
     *
     * On iOS, certificates are loaded from the main bundle.
     * On Android, certificates are loaded from res/raw/.
     * On Windows, certificates are loaded from the app package (MainBundleDir).
     *
     * Hostname verification still applies on every platform, so the server
     * certificate must carry the host as a subject alternative name - including
     * an IP SAN when connecting to an address rather than a name.
     *
     * If none of the named certificates can be loaded the request fails rather
     * than falling back to system trust.
     */
    customCACerts?: string[];

    /**
     * When set, custom CA trust evaluation is only applied to connections matching
     * these hosts. Other hosts fall through to default system trust evaluation.
     * If not set, custom CAs apply to all hosts.
     */
    pinnedHosts?: string[];

    /**
     * When true, the system's default trusted CAs are included alongside the custom
     * CAs specified in customCACerts. When false (default), only the custom CAs are
     * trusted as anchors.
     */
    trustSystemCerts?: boolean;
}

export interface AddAndroidDownloads {
    /**
     * download file using Android download manager or not.
     */
    useDownloadManager?: boolean;
    /**
     * title of the file
     */
    title?: string;
    /**
     * File description of the file.
     */
    description?: string;
    /**
     * The destination which the file will be downloaded, it SHOULD be a location on external storage (DCIMDir). CacheDir and DocumentDir don't work
     */
    path?: string;
    /**
     * MIME type of the file. By default is text/plain
     */
    mime?: string;
    /**
     * A boolean value, see Official Document
     * (https://developer.android.com/reference/android/app/DownloadManager.html#addCompletedDownload(java.lang.String, java.lang.String, boolean, java.lang.String, java.lang.String, long, boolean))
     */
    mediaScannable?: boolean;
    /**
     * Only for Android >= Q; Enforces the file being stored to the MediaCollection Downloads. This might overwrite any value given in "path"
     */
    storeInDownloads?: boolean;
    /**
     * A boolean value decide whether show a notification when download complete.
     */
    notification?: boolean;

    /**
     * If true android download manager will try to save the file to the apps Download direcotry
     */
    storeLocal?: boolean;
}

export interface ReactNativeBlobUtilResponseInfo {
    taskId: string;
    state: string;
    headers: any;
    redirects: string[];
    status: number;
    respType: "text" | "blob" | "" | "json";
    rnfbEncode: "path" | "base64" | "ascii" | "utf8";
    timeout: boolean;
}

export interface ReactNativeBlobUtilStream {
    onData(): void;

    onError(): void;

    onEnd(): void;
}

export declare class ReactNativeBlobUtilFile {}

export declare class ReactNativeBlobUtilStat {
    lastModified: number;
    size: number;
    type: "directory" | "file";
    path: string;
    filename: string;
}

export type Mediatype = "Audio" | "Image" | "Video" | "Download";

export interface MediaCollection {
    /**
     * Creates a new File in the collection.
     * Promise will resolve to content UIR or error message
     * @param filedata descriptor for the media store entry
     * @param mediatype
     * @param path path of the file being copied
     */
    copyToMediaStore(filedata: filedescriptor, mediatype: Mediatype, path: string): Promise<string>;

    /**
     * Creates a new File in the collection.
     * @param filedata
     * @param mediatype
     */
    createMediafile(filedata: filedescriptor, mediatype: Mediatype): Promise<string>;

    /**
     * Copies an existing file to a mediastore file
     * @param uri URI of the destination mediastore file
     * @param path Path to the existing file which should be copied
     */
    writeToMediafile(uri: string, path: string): Promise<string>;

    /**
     * Copies and transforms an existing file to a mediastore file. Make sure FileTransformer is set
     * @param uri URI of the destination mediastore file
     * @param path Path to the existing file which should be copied
     */
    writeToMediafileWithTransform(uri: string, path: string): Promise<string>;

    /**
     * Copies a file from the mediastore to the apps internal storage
     * @param contenturi URI of the mediastore file
     * @param destpath Path for the file in the internal storage
     */
    copyToInternal(contenturi: string, destpath: string): Promise<string>;

    /**
     * Gets the blob data for a given URI in the mediastore
     * @param contenturi
     * @param encoding
     */
    getBlob(contenturi: string, encoding: string): Promise<string>;
}
