// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

// import type {ReactNativeBlobUtilConfig, ReactNativeBlobUtilNative, ReactNativeBlobUtilStream} from './types'

import {Platform} from 'react-native';
import ReactNativeBlobUtilSession from './class/ReactNativeBlobUtilSession';
import ReactNativeBlobUtilWriteStream from './class/ReactNativeBlobUtilWriteStream';
import ReactNativeBlobUtilReadStream from './class/ReactNativeBlobUtilReadStream';
import media from './media';
import {toUnsignedBytes} from './utils/bytes';
import {deprecatedAlias} from './utils/deprecate';
import {addCode} from './utils/errors';
import {requireNativeModule} from './utils/nativeModule';
import {platformOnly} from './utils/platform';
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
    'RingtoneDir',

    'LegacyPictureDir',
    'LegacyMusicDir',
    'LegacyMovieDir',
    'LegacyDownloadDir',
    'LegacyDCIMDir',
    'LegacyRingtoneDir',
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
    return requireNativeModule().writeStream(path, encoding, append)
        .then((streamId: string) => new ReactNativeBlobUtilWriteStream(streamId, encoding, append));
}

/**
 * Create file stream from file at `path`.
 * @param  {string} path   The file path.
 * @param  {string} encoding Data encoding, should be one of `base64`, `utf8`, `ascii`
 * @param  {number} [bufferSize=12288] Size of stream buffer, in bytes. Use a multiple of 3 for base64.
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
 * Read a file.
 * @param  {string} path Path of the file.
 * @param  {'base64' | 'utf8' | 'ascii'} encoding Encoding of the result.
 * @param  {{transform?: boolean}} options Run the registered file transformer on the data.
 * @return {Promise<Array<number> | string>}
 */
function readFile(path: string, encoding: string = 'utf8', options: ?{transform?: boolean} = null): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return withUnsignedBytes(encoding, requireNativeModule().readFile(path, encoding, Boolean(options && options.transform)));
}

/**
 * Write data to a file, replacing it.
 * @param  {string} path  Path of the file.
 * @param  {string | number[]} data Data to write to the file.
 * @param  {string} encoding Encoding of data (Optional).
 * @param  {{transform?: boolean}} options Run the registered file transformer on the data first (not for ascii).
 * @return {Promise<number>} The number of bytes written.
 */
function writeFile(path: string, data: string | Array<number>, encoding: ?string = 'utf8', options: ?{transform?: boolean} = null): Promise<number> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    const transform = Boolean(options && options.transform);
    if (encoding === 'ascii') {
        if (transform) {
            return Promise.reject(addCode('EINVAL', new TypeError('ascii is not supported for converted files')));
        }
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
            return requireNativeModule().writeFile(path, encoding, data, transform, false);
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
 * Exclude a file or directory from iCloud and iTunes backups (iOS).
 * @param  {string} path Path of the file or directory.
 * @return {Promise<void>}
 */
const excludeFromBackup = platformOnly('ios', 'ReactNativeBlobUtil.fs.excludeFromBackup', (path: string) => {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().excludeFromBackupKey('file://' + path).then(() => undefined);
});

/**
 * The directory shared by the apps of an app group (iOS).
 * @param  {string} groupName
 * @return {Promise<string>}
 */
const appGroupDir = platformOnly('ios', 'ReactNativeBlobUtil.fs.appGroupDir', (groupName: string) => {
    return requireNativeModule().pathForAppGroup(groupName);
});

/**
 * The directory shared by the apps of an app group, synchronously (iOS); '' elsewhere.
 * @param  {string} groupName
 * @return {string}
 */
function appGroupDirSync(groupName: string): string {
    return Platform.OS === 'ios' ? requireNativeModule().syncPathAppGroup(groupName) : '';
}

/**
 * Show statistic data of a path.
 * @param  {string} path Target path
 * @return {Promise<ReactNativeBlobUtilStat>}
 */
function stat(path: string): Promise<ReactNativeBlobUtilStat> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().stat(path).then((entry) => entry ? normalizeStat(entry) : entry);
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
    if (typeof path !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
    }
    return requireNativeModule().cp(path, dest).then(() => true);
}

function mv(path: string, dest: string): Promise<boolean> {
    if (typeof path !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
    }
    return requireNativeModule().mv(path, dest).then(() => true);
}

function lstat(path: string): Promise<Array<ReactNativeBlobUtilStat>> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().lstat(path)
        .then((entries) => Array.isArray(entries) ? entries.map(normalizeStat) : entries);
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
function unlink(path: string): Promise<void> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().unlink(path).then(() => undefined);
}

/**
 * Check if file exists and if it is a folder.
 * @param  {string} path Path to check
 * @return {Promise<boolean>}
 */
function exists(path: string): Promise<boolean> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().exists(path).then((result) => Boolean(result && result.exists));
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

function isDir(path: string): Promise<boolean> {
    if (typeof path !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" ')));
    }
    return requireNativeModule().exists(path).then((result) => Boolean(result && result.isDirectory));
}

function df(): Promise<{ free: number, total: number }> {
    return requireNativeModule().df().then((space) => space ? normalizeDf(space) : space);
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
    appendFile,
    readFile,
    excludeFromBackup,
    appGroupDir,
    appGroupDirSync,
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
    // Names from before 1.0; each warns once.
    readFileWithTransform: deprecatedAlias('fs.readFileWithTransform', 'fs.readFile(path, encoding, {transform: true})',
        (path: string, encoding: string = 'utf8') => readFile(path, encoding, {transform: true})),
    writeFileWithTransform: deprecatedAlias('fs.writeFileWithTransform', 'fs.writeFile(path, data, encoding, {transform: true})',
        (path: string, data: any, encoding: ?string = 'utf8') => writeFile(path, data, encoding, {transform: true})),
    scanFile: deprecatedAlias('fs.scanFile', 'media.scan', media.scan),
    pathForAppGroup: deprecatedAlias('fs.pathForAppGroup', 'fs.appGroupDir', appGroupDir),
    syncPathAppGroup: deprecatedAlias('fs.syncPathAppGroup', 'fs.appGroupDirSync', appGroupDirSync),
};
