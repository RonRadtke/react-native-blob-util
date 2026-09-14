// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

// import type {ReactNativeBlobUtilConfig, ReactNativeBlobUtilNative, ReactNativeBlobUtilStream} from './types'

import {Platform} from 'react-native';
import android from './android';
import ios from './ios';
import ReactNativeBlobUtilSession from './class/ReactNativeBlobUtilSession';
import ReactNativeBlobUtilWriteStream from './class/ReactNativeBlobUtilWriteStream';
import ReactNativeBlobUtilReadStream from './class/ReactNativeBlobUtilReadStream';
import {toUnsignedBytes} from './utils/bytes';
import {deprecatedAlias} from './utils/deprecate';
import {addCode} from './utils/errors';
import toExistsResult from './utils/existsResult';
import {requireNativeModule} from './utils/nativeModule';
import type {ReactNativeBlobUtilStat} from './types';

/**
 * Native constants are read on first access rather than at import. On the New
 * Architecture the module may not be registered when this file is evaluated,
 * and reaching native here would throw while the package is being imported.
 */
let constants = null;

function getConstants() {
    if (constants == null) {
        constants = requireNativeModule().getConstants();
    }

    return constants;
}

const dirs = {};

for (const name of [
    'DocumentDir',
    'CacheDir',
    'PictureDir',
    'MusicDir',
    'MovieDir',
    'DownloadDir',
    'DCIMDir',
    'SDCardDir', // Depracated
    'SDCardApplicationDir', // Deprecated
    'MainBundleDir',
    'LibraryDir',
    'ApplicationSupportDir',

    'LegacyPictureDir',
    'LegacyMusicDir',
    'LegacyMovieDir',
    'LegacyDownloadDir',
    'LegacyDCIMDir',
    'LegacySDCardDir', // Depracated
]) {
    Object.defineProperty(dirs, name, {
        enumerable: true,
        get: () => getConstants()[name],
    });
}

/** Native reports size and lastModified as strings on some platforms. */
function normalizeStat(entry: Object): ReactNativeBlobUtilStat {
    return {...entry, size: Number(entry.size), lastModified: Number(entry.lastModified)};
}

/**
 * Android reports internal and external storage as four strings; iOS and
 * Windows report {free, total} numbers. Every platform resolves numeric
 * `free` and `total`; Android keeps its four fields as numbers as well.
 */
function normalizeDf(space: Object): Object {
    const numbers = {};
    for (const key of Object.keys(space)) {
        numbers[key] = Number(space[key]);
    }
    if ('internal_free' in numbers && !('free' in numbers)) {
        return {free: numbers.internal_free, total: numbers.internal_total, ...numbers};
    }
    return numbers;
}

/** ascii reads resolve bytes 0..255; Android and iOS return them signed. */
function withUnsignedBytes(encoding: string, promise: Promise<any>): Promise<any> {
    return encoding === 'ascii' ? promise.then(toUnsignedBytes) : promise;
}

const READ_ENCODINGS = ['utf8', 'ascii', 'base64'];
const WRITE_ENCODINGS = ['utf8', 'ascii', 'base64', 'uri'];

/**
 * The encoding native will receive: lower-cased, with null and undefined
 * meaning utf8. An encoding native does not know yields an EINVAL error
 * instead, so the caller rejects here rather than hand it on - iOS readFile
 * never completed for an unknown encoding, and Android silently read utf8.
 */
function normalizeEncoding(encoding: ?string, allowed: Array<string>): string | Error {
    if (encoding === null || encoding === undefined) {
        return 'utf8';
    }
    const lowered = String(encoding).toLowerCase();
    if (allowed.includes(lowered)) {
        return lowered;
    }
    return addCode('EINVAL', new TypeError(`Unsupported encoding "${encoding}", expected one of ${allowed.join(', ')}`));
}

/**
 * Get a file cache session
 * @param  {string} name Stream ID
 * @return {ReactNativeBlobUtilSession}
 */
function session(name: string): ReactNativeBlobUtilSession {
    let s = ReactNativeBlobUtilSession.getSession(name);
    if (s)
        return new ReactNativeBlobUtilSession(name);
    else {
        ReactNativeBlobUtilSession.setSession(name, []);
        return new ReactNativeBlobUtilSession(name, []);
    }
}

function asset(path: string): string {
    if (Platform.OS === 'ios') {
        // path from camera roll
        if (/^assets-library\:\/\//.test(path))
            return path;
    }
    return 'bundle-assets://' + path;
}

function createFile(path: string, data: string, encoding: 'base64' | 'ascii' | 'utf8' | 'uri' = 'utf8'): Promise<string> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    // Resolves the path on every platform (Android did, iOS resolved [null],
    // Windows undefined).
    if (encoding === 'ascii') {
        return Array.isArray(data) ?
            requireNativeModule().createFileASCII(path, data).then(() => path) :
            Promise.reject(addCode('EINVAL', new TypeError('`data` of ASCII file must be an array with 0..255 numbers')));
    }
    else {
        return requireNativeModule().createFile(path, data, encoding).then(() => path);
    }
}

/**
 * Create write stream to a file.
 * @param  {string} path Target path of file stream.
 * @param  {string} encoding Encoding of input data.
 * @param  {boolean} [append]  A flag represent if data append to existing ones.
 * @return {Promise<ReactNativeBlobUtilWriteStream>} A promise resolves a `WriteStream` object.
 */
function writeStream(
    path: string,
    encoding?: 'utf8' | 'ascii' | 'base64' = 'utf8',
    append?: boolean = false,
): Promise<ReactNativeBlobUtilWriteStream> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return new Promise((resolve, reject) => {
        requireNativeModule().writeStream(path, encoding, append, (errCode, errMsg, streamId: string) => {
            if (errMsg) {
                const err = new Error(errMsg);
                err.code = errCode;
                reject(err);
            }
            else
                resolve(new ReactNativeBlobUtilWriteStream(streamId, encoding));
        });
    });
}

/**
 * Create file stream from file at `path`.
 * @param  {string} path   The file path.
 * @param  {string} encoding Data encoding, should be one of `base64`, `utf8`, `ascii`
 * @param  {boolean} bufferSize Size of stream buffer.
 * @param  {number} [tick=10] Interval in milliseconds between reading chunks of data
 * @return {ReactNativeBlobUtilStream} ReactNativeBlobUtilStream stream instance.
 */
function readStream(
    path: string,
    encoding: 'utf8' | 'ascii' | 'base64' = 'utf8',
    bufferSize?: number,
    tick?: number = 10
): Promise<ReactNativeBlobUtilReadStream> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return Promise.resolve(new ReactNativeBlobUtilReadStream(path, encoding, bufferSize, tick));
}

/**
 * Create a directory.
 * @param  {string} path Path of directory to be created
 * @return {Promise}
 */
function mkdir(path: string): Promise {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().mkdir(path);
}

/**
 * Wrapper method of readStream.
 * @param  {string} path Path of the file.
 * @param  {'base64' | 'utf8' | 'ascii'} encoding Encoding of read stream.
 * @return {Promise<Array<number> | string>}
 */
function readFile(path: string, encoding: string = 'utf8'): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return withUnsignedBytes(encoding, requireNativeModule().readFile(path, encoding, false));
}

/**
 * Reads the file, then transforms it before returning the content
 * @param  {string} path Path of the file.
 * @param  {'base64' | 'utf8' | 'ascii'} encoding Encoding of read stream.
 * @return {Promise<Array<number> | string>}
 */
function readFileWithTransform(path: string, encoding: string = 'utf8'): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return withUnsignedBytes(encoding, requireNativeModule().readFile(path, encoding, true));
}

/**
 * Write data to file.
 * @param  {string} path  Path of the file.
 * @param  {string | number[]} data Data to write to the file.
 * @param  {string} encoding Encoding of data (Optional).
 * @return {Promise}
 */
function writeFile(path: string, data: string | Array<number>, encoding: ?string = 'utf8'): Promise {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    if (encoding === 'ascii') {
        if (!Array.isArray(data)) {
            return Promise.reject(addCode('EINVAL', new TypeError('"data" must be an Array when encoding is "ascii"')));
        }
        else
            return requireNativeModule().writeFileArray(path, data, false);
    }
    else {
        if (typeof data !== 'string') {
            return Promise.reject(addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "utf8" or "base64", but it is "${typeof data}"`)));
        }
        else
            return requireNativeModule().writeFile(path, encoding, data, false, false);
    }
}

/**
 * Transforms the data and then writes to the file.
 * @param  {string} path  Path of the file.
 * @param  {string | number[]} data Data to write to the file.
 * @param  {string} encoding Encoding of data (Optional).
 * @return {Promise}
 */
function writeFileWithTransform(path: string, data: string | Array<number>, encoding: ?string = 'utf8'): Promise {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    if (encoding === 'ascii') {
        return Promise.reject(addCode('EINVAL', new TypeError('ascii is not supported for converted files')));
    }
    else {
        if (typeof data !== 'string') {
            return Promise.reject(addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "utf8" or "base64", but it is "${typeof data}"`)));
        }

        else
            return requireNativeModule().writeFile(path, encoding, data, true, false);
    }
}

function appendFile(path: string, data: string | Array<number>, encoding?: string = 'utf8'): Promise<number> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    if (encoding === 'ascii') {
        if (!Array.isArray(data)) {
            return Promise.reject(addCode('EINVAL', new TypeError('`data` of ASCII file must be an array with 0..255 numbers')));
        }
        else
            return requireNativeModule().writeFileArray(path, data, true);
    }
    else {
        if (typeof data !== 'string') {
            return Promise.reject(addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "utf8" or "base64", but it is "${typeof data}"`)));
        }
        else
            return requireNativeModule().writeFile(path, encoding, data, false, true);
    }
}

/**
 * Show statistic data of a path.
 * @param  {string} path Target path
 * @return {Promise<ReactNativeBlobUtilStat>}
 */
function stat(path: string): Promise<ReactNativeBlobUtilStat> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
        }
        requireNativeModule().stat(path, (err, stat) => {
            if (err)
                reject(new Error(err));
            else {
                resolve(stat ? normalizeStat(stat) : stat);
            }
        });
    });
}

/**
 * Calculate a cryptographic hash sum over the contents of a file.
 *
 * `sha224` is unavailable on Windows - neither WinRT's hash providers nor CNG
 * offer SHA-224 - so the promise rejects there. Android and iOS support all of
 * md5, sha1, sha224, sha256, sha384 and sha512.
 *
 * @param  {string} path Path of the file.
 * @param  {string} algorithm md5, sha1, sha224, sha256, sha384 or sha512.
 * @return {Promise<string>} The hash, hex encoded.
 */
function hash(path: string, algorithm: string): Promise<string> {
    if (typeof path !== 'string' || typeof algorithm !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "algorithm"')));
    }
    return requireNativeModule().hash(path, algorithm);
}

function cp(path: string, dest: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string' || typeof dest !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
        }
        requireNativeModule().cp(path, dest, (err) => {
            if (err)
                reject(addCode('EUNSPECIFIED', new Error(err)));
            else
                resolve(true); // Android resolves undefined, iOS and Windows true
        });
    });
}

function mv(path: string, dest: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string' || typeof dest !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
        }
        requireNativeModule().mv(path, dest, (err) => {
            if (err)
                reject(addCode('EUNSPECIFIED', new Error(err)));
            else
                resolve(true); // Android resolves undefined, iOS and Windows true
        });
    });
}

function lstat(path: string): Promise<Array<ReactNativeBlobUtilStat>> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
        }
        requireNativeModule().lstat(path, (err, stat) => {
            if (err)
                reject(addCode('EUNSPECIFIED', new Error(err)));
            else
                resolve(Array.isArray(stat) ? stat.map(normalizeStat) : stat);
        });
    });
}

function ls(path: string): Promise<Array<String>> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().ls(path);
}

/**
 * Remove file at path.
 * @param  {string}   path:string Path of target file.
 * @return {Promise}
 */
function unlink(path: string): Promise {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
        }
        requireNativeModule().unlink(path, (err) => {
            if (err) {
                reject(addCode('EUNSPECIFIED', new Error(err)));
            }
            else
                resolve();
        });
    });
}

/**
 * Check if file exists and if it is a folder.
 * @param  {string} path Path to check
 * @return {Promise<boolean>}
 */
function exists(path: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
        }
        try {
            requireNativeModule().exists(path, (...args) => {
                resolve(toExistsResult(...args).exists);
            });
        } catch (err) {
            reject(addCode('EUNSPECIFIED', new Error(err)));
        }
    });

}

function slice(src: string, dest: string, start: number, end: number): Promise {
    if (typeof src !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "src" and/or "destination"')));
    }

    let p = Promise.resolve();
    let size = 0;

    function normalize(num, size) {
        if (num < 0)
            return Math.max(0, size + num);
        if (!num && num !== 0)
            return size;
        return num;
    }

    if (start < 0 || end < 0 || !start || !end) {
        p = p.then(() => stat(src))
            .then((stat) => {
                size = Math.floor(stat.size);
                start = normalize(start || 0, size);
                end = normalize(end, size);
            });
    }
    return p.then(() => requireNativeModule().slice(src, dest, start, end));
}

function isDir(path: string): Promise<bool> {
    return new Promise((resolve, reject) => {
        if (typeof path !== 'string') {
            return reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
        }
        try {
            requireNativeModule().exists(path, (...args) => {
                resolve(toExistsResult(...args).isDirectory);
            });
        } catch (err) {
            reject(addCode('EUNSPECIFIED', new Error(err)));
        }
    });

}

function df(): Promise<{ free: number, total: number }> {
    return new Promise((resolve, reject) => {
        requireNativeModule().df((err, stat) => {
            if (err)
                reject(addCode('EUNSPECIFIED', new Error(err)));
            else
                resolve(stat ? normalizeDf(stat) : stat);
        });
    });
}

export default {
    ReactNativeBlobUtilSession,
    unlink,
    mkdir,
    session,
    ls,
    readStream,
    mv,
    cp,
    writeStream,
    writeFile,
    writeFileWithTransform,
    readFileWithTransform,
    appendFile,
    readFile,
    hash,
    exists,
    createFile,
    isDir,
    stat,
    lstat,
    dirs,
    slice,
    asset,
    df,
    // Platform-specific calls moved to android.* and ios.*; these names warn once.
    scanFile: deprecatedAlias('fs.scanFile', 'android.scanFile', android.scanFile),
    pathForAppGroup: deprecatedAlias('fs.pathForAppGroup', 'ios.pathForAppGroup', ios.pathForAppGroup),
    syncPathAppGroup: deprecatedAlias('fs.syncPathAppGroup', 'ios.syncPathAppGroup', ios.syncPathAppGroup),
};
