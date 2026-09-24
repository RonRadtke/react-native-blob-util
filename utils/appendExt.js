/**
 * `appendExt` is appended to the file name the library generates for a
 * `fileCache` or `key` download (ReactNativeBlobUtilTmp_<id>.<ext>). Nothing
 * checked it, so an extension such as "/../../shared_prefs/auth.xml" turned the
 * generated name into a path out of the cache, and the response replaced any
 * file the app can write.
 *
 * An extension may contain dots ("tar.gz", ".jpg"), but not "/", "\", ":" or
 * a control character: those are what make a file name a path.
 *
 * Plain JavaScript without Flow annotations, so the unit tests can import it
 * with node alone.
 *
 * @param  {Object} options The config() options.
 * @return {?string} Why appendExt cannot be used, or null when it can.
 */
export default function invalidAppendExt(options) {
    const ext = options ? options.appendExt : undefined;
    if (ext === undefined || ext === null || ext === '') {
        return null;
    }
    // eslint-disable-next-line no-control-regex
    if (typeof ext !== 'string' || /[/\\:\u0000-\u001f]/.test(ext)) {
        return 'appendExt must be a file extension, without path separators';
    }
    return null;
}
