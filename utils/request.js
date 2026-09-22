/**
 * Checks and rewrites a request needs before it reaches native, done here so
 * that Android, iOS and Windows behave the same.
 */

const CONTROL = /[\r\n\0]/;

/**
 * Why a set of headers cannot be sent, or null. A CR, LF or NUL in a name or
 * value would start another header on the wire (Windows adds headers without
 * validating them), so it is refused rather than passed on.
 * @param  {?Object} headers
 * @return {?string}
 */
export function invalidHeader(headers: ?Object): ?string {
    for (const key of Object.keys(headers || {})) {
        if (CONTROL.test(key) || CONTROL.test(String(headers[key]))) {
            return `Header "${key.replace(/[\r\n\0]/g, ' ')}" contains a line break or NUL`;
        }
    }
    return null;
}

/**
 * A multipart field name or filename escaped the way browsers do (WHATWG
 * multipart/form-data): `"` becomes %22, CR %0D and LF %0A. Native puts both
 * between quotes in Content-Disposition, so an unescaped quote or line break,
 * say in the display name of a shared file, rewrote the part's headers.
 * @param  {any} value
 * @return {any} Strings escaped, anything else as it was.
 */
export function escapeFormValue(value: any): any {
    return typeof value === 'string'
        ? value.replace(/"/g, '%22').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
        : value;
}

/**
 * Why a multipart form cannot be sent, or null: a field type with a line break
 * would add headers to its part.
 * @param  {Array<Object>} fields
 * @return {?string}
 */
export function invalidFormField(fields: Array<Object>): ?string {
    for (const field of fields) {
        if (field && typeof field.type === 'string' && CONTROL.test(field.type)) {
            return `The type of form field "${String(field.name)}" contains a line break or NUL`;
        }
    }
    return null;
}

/**
 * The form with every name and filename escaped. The caller's objects are
 * left alone.
 * @param  {Array<Object>} fields
 * @return {Array<Object>}
 */
export function escapeForm(fields: Array<Object>): Array<Object> {
    return fields.map((field) => field && typeof field === 'object'
        ? {...field, name: escapeFormValue(field.name), filename: escapeFormValue(field.filename)}
        : field);
}

/**
 * The options as native needs them: pinnedHosts in lower case, because every
 * platform compares them with the host as its HTTP stack reports it, which is
 * lower case. The caller's object is left alone.
 * @param  {Object} options
 * @return {Object}
 */
export function nativeOptions(options: Object): Object {
    if (!Array.isArray(options.pinnedHosts)) {
        return options;
    }
    return {
        ...options,
        pinnedHosts: options.pinnedHosts.map((host) => typeof host === 'string' ? host.toLowerCase() : host),
    };
}
