// @flow
/**
 * Path arguments as native takes them.
 */

const FILE_URL = /^file:\/\/(localhost)?/i;

/**
 * The path a `file://` URL names, decoded; any other string is returned as it
 * is. Pickers and camera libraries hand out file URLs, and native read them as
 * paths: a file named "file:///..." that does not exist, or one with "%20" in
 * its name (#295). A malformed escape leaves the path undecoded, and so does
 * one that would decode into a separator or "..": see decodedUrlPath.
 * @param  {string} path
 * @return {string}
 */
export function pathOf(path: string): string {
    if (typeof path !== 'string' || !FILE_URL.test(path)) {
        return path;
    }
    return decodedUrlPath(path.replace(FILE_URL, ''));
}

/**
 * The path part of a file URL with its escapes decoded, one segment at a
 * time. An escape names a character of a file's name, never the shape of the
 * path: a segment that would decode into a separator, into "." or "..", or
 * into a NUL leaves the whole path undecoded, as a malformed escape does. A
 * name an app joins into a URL, "..%2Fsecret.txt", then stays the one name it
 * is, where decoding the URL as a whole made it the file one folder up.
 * @param  {string} rest What follows `file://` and the host.
 * @return {string}
 */
export function decodedUrlPath(rest: string): string {
    const segments = [];
    for (const segment of rest.split('/')) {
        let decoded;
        try {
            decoded = decodeURIComponent(segment);
        } catch {
            return rest;
        }
        // A backslash is a separator on Windows, where the URL of a path has
        // them as %5C: decoded, but not into a "." or ".." between them.
        const reshapes = decoded.includes('/') || decoded.includes('\u0000')
            || decoded.split('\\').some((part) => part === '.' || part === '..');
        if (decoded !== segment && reshapes) {
            return rest;
        }
        segments.push(decoded);
    }
    return segments.join('/');
}
