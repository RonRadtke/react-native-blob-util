// @flow
/**
 * Path arguments as native takes them.
 */

const FILE_URL = /^file:\/\/(localhost)?/i;

/**
 * The path a `file://` URL names, decoded; any other string is returned as it
 * is. Pickers and camera libraries hand out file URLs, and native read them as
 * paths: a file named "file:///..." that does not exist, or one with "%20" in
 * its name (#295). A malformed escape leaves the path undecoded.
 * @param  {string} path
 * @return {string}
 */
export function pathOf(path: string): string {
    if (typeof path !== 'string' || !FILE_URL.test(path)) {
        return path;
    }
    const rest = path.replace(FILE_URL, '');
    try {
        return decodeURIComponent(rest);
    } catch {
        return rest;
    }
}
