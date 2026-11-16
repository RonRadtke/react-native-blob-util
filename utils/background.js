// @flow
/**
 * The rules for downloads that outlive the app: their ids, and what they can
 * be asked to do.
 */

// Used in a file name on Android and in records on every platform.
const ID = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The id of a background download from the `background` option: the one
 * given, or a new one for `true`; null when the option is not set; an
 * `error` when it cannot be used.
 * @param  {any} option `true` or `{id?: string}`
 * @param  {Function} newId
 * @return {?{id: string, error?: string}}
 */
export function backgroundIdOf(option: any, newId: () => string): ?{id: string, error?: string} {
    if (option === undefined || option === null || option === false) {
        return null;
    }
    if (option === true) {
        return {id: newId()};
    }
    if (typeof option !== 'object' || Array.isArray(option)) {
        return {id: '', error: '`background` is true or {id}'};
    }
    if (option.id === undefined || option.id === null) {
        return {id: newId()};
    }
    if (typeof option.id !== 'string' || !ID.test(option.id)) {
        return {id: '', error: '`background.id` is 1 to 100 letters, digits, ".", "_" or "-"'};
    }
    return {id: option.id};
}

/**
 * Why a background download cannot be made with these options, or null: a
 * GET to a path, run by the system, so nothing the library itself would do
 * to the bytes on the way.
 * @param  {string} method
 * @param  {Object} options config() options, after normalizeConfig
 * @param  {any} body
 * @return {?string}
 */
export function invalidBackground(method: string, options: Object, body: any): ?string {
    if (String(method).toUpperCase() !== 'GET') return 'A background download needs a GET request';
    if (typeof options.path !== 'string' || options.path === '') return 'A background download needs `path`';
    if (body !== undefined && body !== null && body !== '') return 'A background download takes no request body';
    if (options.transformFile) return 'A background download cannot run the file transformer';
    if (options.addAndroidDownloads) return 'A background download is not also an android.downloadManager download';
    if (options.overwrite === false) return 'A background download replaces the file at `path`; `overwrite: false` cannot be used';
    if (options.resumable) return 'A background download continues by itself; `resumable` cannot be used';
    return null;
}
