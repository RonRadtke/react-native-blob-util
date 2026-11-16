// @flow
/**
 * The rules for continuing a download: when it may, what identifies the file
 * on the server, and what a server's answer to a range request means.
 */

/**
 * Why `resumable` cannot be used with these options, or null: it continues a
 * GET downloading to a path, written by the library.
 * @param  {string} method
 * @param  {Object} options config() options, after normalizeConfig
 * @param  {any} body
 * @return {?string}
 */
export function invalidResumable(method: string, options: Object, body: any): ?string {
    if (String(method).toUpperCase() !== 'GET') return '`resumable` needs a GET request';
    if (typeof options.path !== 'string' || options.path === '') return '`resumable` needs `path`';
    if (options.overwrite === false) return '`resumable` cannot append to an existing file (`overwrite: false`)';
    if (options.transformFile) return '`resumable` cannot run the file transformer';
    if (options.addAndroidDownloads || options.IOSBackgroundTask) {
        return '`resumable` downloads are not run by the DownloadManager or an iOS background session';
    }
    if (body !== undefined && body !== null && body !== '') return '`resumable` takes no request body';
    return null;
}

/** A header's value by its name, in any case; null when it is not there. */
function header(headers: ?Object, name: string): ?string {
    if (!headers) return null;
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key === undefined ? null : String(headers[key]);
}

/**
 * The If-Range validator of a response: a strong ETag, or else Last-Modified;
 * null when it has neither. A weak ETag (W/"...") cannot be used with If-Range.
 * @param  {?Object} headers
 * @return {?string}
 */
export function validatorOf(headers: ?Object): ?string {
    const etag = header(headers, 'etag');
    if (etag && etag.trim() !== '' && !/^W\//i.test(etag.trim())) {
        return etag.trim();
    }
    const lastModified = header(headers, 'last-modified');
    return lastModified && lastModified.trim() !== '' ? lastModified.trim() : null;
}

/**
 * Whether a 206 answer continues the file at `from` (Content-Range: bytes
 * from-...): native writes only such a body into the file.
 * @param  {?Object} headers
 * @param  {number} from
 * @return {boolean}
 */
export function continuesAt(headers: ?Object, from: number): boolean {
    const range = header(headers, 'content-range');
    const match = range ? /^bytes\s+(\d+)-/i.exec(range.trim()) : null;
    return match !== null && Number(match[1]) === from;
}

/**
 * Whether a 416 answer to a range request says the file is `size` bytes long
 * (Content-Range: bytes * /size), so what is on disk already is all of it.
 * @param  {?Object} headers
 * @param  {number} size
 * @return {boolean}
 */
export function completeAt(headers: ?Object, size: number): boolean {
    const range = header(headers, 'content-range');
    const match = range ? /^bytes \*\/(\d+)$/i.exec(range.trim()) : null;
    return match !== null && Number(match[1]) === size;
}
