/**
 * Request headers as native reads them: every value a string.
 *
 * A header value of another type reached native as it was. Android reads each
 * one with ReadableMap.getString, so an object ended the app with "Value for
 * <key> cannot be cast from ReadableNativeMap to String" (#472), and a number
 * the same way. Windows already sent a number or a boolean as its text, so that
 * is what every platform does now; an object or an array has no text a server
 * would expect, and is refused before anything reaches native.
 *
 * Expects the values fetch() has already normalised: null, undefined and the
 * other falsy values are "" by then (#241), as they always were.
 *
 * Plain JavaScript without Flow annotations, so the unit tests can import it
 * with node alone.
 *
 * @param  {?Object} headers The request headers.
 * @return {{headers: ?Object, error: ?string}} The headers to send, or why they cannot be sent.
 */
export function headerValues(headers) {
    if (!headers) {
        return {headers, error: null};
    }
    const result = {};
    for (const key of Object.keys(headers)) {
        const value = headers[key];
        if (value === null || value === undefined) {
            result[key] = '';
        } else if (typeof value === 'object' || typeof value === 'function') {
            return {headers: null, error: `Header "${key}" must be a string`};
        } else {
            result[key] = String(value);
        }
    }
    return {headers: result, error: null};
}
