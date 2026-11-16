// @flow
// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

// import type {ReactNativeBlobUtilConfig, ReactNativeBlobUtilNative, ReactNativeBlobUtilStream} from './types'

import base64 from 'base-64';
import {Platform} from 'react-native';
import ReactNativeBlobUtilReadStream from './class/ReactNativeBlobUtilReadStream';
import ReactNativeBlobUtilSession from './class/ReactNativeBlobUtilSession';
import ReactNativeBlobUtilWriteStream from './class/ReactNativeBlobUtilWriteStream';
import media from './media';
import {
    binaryStringOfBytes,
    bytesOfBinaryString,
    bytesOfUtf8,
    isBinary,
    toUnsignedBytes,
    uint8Of,
    uint8OfBinaryString,
    utf8OfBytes,
} from './utils/bytes';
import {deprecatedAlias} from './utils/deprecate';
import {addCode} from './utils/errors';
import {requireNativeModule} from './utils/nativeModule';
import {pathOf} from './utils/path';
import {notSupported, platformOnly} from './utils/platform';
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
    'SDCardDir', // Deprecated
    'SDCardApplicationDir', // Deprecated
    'MainBundleDir',
    'LibraryDir',
    'ApplicationSupportDir',
    'RingtoneDir',
    'TemporaryDir',
    'ExternalCacheDir',
    'RoamingDir',

    'LegacyPictureDir',
    'LegacyMusicDir',
    'LegacyMovieDir',
    'LegacyDownloadDir',
    'LegacyDCIMDir',
    'LegacyRingtoneDir',
    'LegacySDCardDir', // Deprecated
]) {
    Object.defineProperty(dirs, name, {
        enumerable: true,
        // A constant an older native build does not report is "", as the
        // directories a platform does not have are.
        get: () => getConstants()[name] ?? '',
    });
}

/**
 * Native reports size and lastModified as strings on some platforms, and
 * `created` as null where the file system does not keep a creation time.
 */
function normalizeStat(entry: Object): ReactNativeBlobUtilStat {
    const created = entry.created === undefined || entry.created === null ? null : Number(entry.created);
    return {...entry, size: Number(entry.size), lastModified: Number(entry.lastModified), created};
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
// readFile and read also return bytes, as a Uint8Array.
const READ_FILE_ENCODINGS = [...READ_ENCODINGS, 'bytes'];

/** The base64 text of binary data. */
function base64OfBinary(data: any): string {
    return base64.encode(binaryStringOfBytes(uint8Of(data)));
}

/** A base64 string read from native, as the encoding asks for. */
function decodeBase64(data: string, encoding: string): any {
    if (encoding === 'base64') {
        return data;
    }
    const binary = base64.decode(data || '');
    if (encoding === 'bytes') {
        return uint8OfBinaryString(binary);
    }
    const bytes = bytesOfBinaryString(binary);
    return encoding === 'ascii' ? bytes : utf8OfBytes(bytes);
}

const missingPath = () => addCode('EINVAL', new TypeError('Missing argument "path" '));

/** Whether a value is a whole number of bytes or an offset: 0, 1, 2, ... */
function isCount(value: any): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** iOS data protection classes, as `protection` names them. */
const PROTECTIONS = ['complete', 'completeUnlessOpen', 'untilFirstAuth', 'none'];

/**
 * Why a `protection` option is wrong, or null. Checked on every platform, so
 * a typo fails the same way everywhere even though only iOS applies it.
 */
function checkProtection(options: ?Object): ?Error {
    const protection = options ? options.protection : undefined;
    if (protection === undefined || protection === null || PROTECTIONS.includes(protection)) {
        return null;
    }
    return addCode('EINVAL', new TypeError(`Unsupported protection "${protection}", expected one of ${PROTECTIONS.join(', ')}`));
}

/**
 * Applies `options.protection` to a path on iOS once the call that created or
 * moved it has succeeded. The other platforms have no data protection classes
 * and ignore the option.
 */
function protect(path: string, options: ?Object): Promise<void> {
    const protection = options ? options.protection : undefined;
    if (Platform.OS !== 'ios' || protection === undefined || protection === null) {
        return Promise.resolve();
    }
    return requireNativeModule().setAttributes(path, {protection}).then(() => undefined);
}

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
 * The encoding and options of a call that takes either the positional form
 * (encoding, options) or one options object ({encoding, ...rest}).
 */
function encodingAndOptions(encodingOrOptions: any, options: ?Object): [any, Object] {
    if (encodingOrOptions !== null && typeof encodingOrOptions === 'object' && !Array.isArray(encodingOrOptions)) {
        return [encodingOrOptions.encoding, encodingOrOptions];
    }
    return [encodingOrOptions, options || {}];
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
        if (/^assets-library:\/\//.test(path))
            return path;
    }
    return 'bundle-assets://' + path;
}

/**
 * The path of an Android app resource, for the calls that read a file:
 * `readFile`, `read`, `exists`, `stat`, `hash`, `cp` (as the source),
 * `readStream`. `name` is "<type>/<name>" without an extension, such as
 * "raw/sample" for res/raw/sample.json. Throws an Error with code ENOTSUP on
 * the other platforms, which have no app resources.
 * @param  {string} name
 * @return {string}
 */
function resource(name: string): string {
    if (Platform.OS !== 'android') {
        throw notSupported('android', 'ReactNativeBlobUtil.fs.resource');
    }
    if (typeof name !== 'string' || !/^[^/]+\/[^/]+$/.test(name)) {
        throw addCode('EINVAL', new TypeError(`A resource is named "<type>/<name>", such as "raw/sample", not "${String(name)}"`));
    }
    return 'bundle-res://' + name;
}

function createFile(path: string, data: any, encodingOrOptions: any = 'utf8'): Promise<void> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding, options] = encodingAndOptions(encodingOrOptions, null);
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    const invalid = checkProtection(options);
    if (invalid) {
        return Promise.reject(invalid);
    }
    // Resolves undefined on every platform: the path is the caller's own. Android
    // resolved it, iOS [null], Windows undefined.
    let created;
    if (isBinary(data) && encoding !== 'uri') {
        created = requireNativeModule().createFile(path, base64OfBinary(data), 'base64');
    }
    else if (encoding === 'ascii') {
        if (!Array.isArray(data)) {
            return Promise.reject(addCode('EINVAL', new TypeError('`data` of ASCII file must be an array with 0..255 numbers')));
        }
        created = requireNativeModule().createFileASCII(path, data);
    }
    else if (typeof data !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "${encoding}", but it is "${typeof data}"`)));
    }
    else {
        created = requireNativeModule().createFile(path, encoding === 'uri' ? pathOf(data) : data, encoding);
    }
    return created.then(() => protect(path, options));
}

/**
 * Create write stream to a file.
 * @param  {string} path Target path of file stream.
 * @param  {string | {encoding?: string, append?: boolean}} encodingOrOptions Encoding of input data, or the options.
 * @param  {boolean} [append]  A flag represent if data append to existing ones.
 * @return {Promise<ReactNativeBlobUtilWriteStream>} A promise resolves a `WriteStream` object.
 */
function writeStream(
    path: string,
    encodingOrOptions?: any = 'utf8',
    append?: boolean = false,
): Promise<ReactNativeBlobUtilWriteStream> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding, options] = encodingAndOptions(encodingOrOptions, {append});
    append = Boolean(options.append);
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
 * @param  {string | {encoding?: string, bufferSize?: number, tick?: number}} encodingOrOptions
 *         Data encoding (`base64`, `utf8`, `ascii`), or the options.
 * @param  {number} [bufferSize=12288] Size of stream buffer, in bytes. Use a multiple of 3 for base64.
 * @param  {number} [tick=10] Interval in milliseconds between reading chunks of data
 * @return {ReactNativeBlobUtilStream} ReactNativeBlobUtilStream stream instance.
 */
function readStream(
    path: string,
    encodingOrOptions: any = 'utf8',
    bufferSize?: number,
    tick?: number = 10
): Promise<ReactNativeBlobUtilReadStream> {
    // An empty path made the stream's constructor throw instead of rejecting.
    if (typeof path !== 'string' || path === '') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding, options] = encodingAndOptions(encodingOrOptions, {bufferSize, tick});
    bufferSize = options.bufferSize;
    tick = options.tick === undefined || options.tick === null ? 10 : options.tick;
    encoding = normalizeEncoding(encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return Promise.resolve(new ReactNativeBlobUtilReadStream(path, encoding, bufferSize, tick));
}

/**
 * Create a directory, with the missing parents.
 * @param  {string} path Path of directory to be created
 * @param  {{protection?: string}} options iOS: the data protection class of the directory, which new files in it inherit.
 * @return {Promise<void>}
 */
function mkdir(path: string, options: ?{protection?: string} = null): Promise<void> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    const invalid = checkProtection(options);
    if (invalid) {
        return Promise.reject(invalid);
    }
    return requireNativeModule().mkdir(path).then(() => protect(path, options));
}

/**
 * Read a file.
 * @param  {string} path Path of the file.
 * @param  {'base64' | 'utf8' | 'ascii' | 'bytes' | {encoding?: string, transform?: boolean}} encodingOrOptions
 *         Encoding of the result, or the options.
 * @param  {{transform?: boolean}} options Run the registered file transformer on the data.
 * @return {Promise<Array<number> | string | Uint8Array>}
 */
function readFile(path: string, encodingOrOptions: any = 'utf8', options: ?{transform?: boolean} = null): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding, opts] = encodingAndOptions(encodingOrOptions, options);
    encoding = normalizeEncoding(encoding, READ_FILE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    if (encoding === 'bytes') {
        return requireNativeModule().readFile(path, 'base64', Boolean(opts.transform))
            .then((data) => decodeBase64(textOf(data), 'bytes'));
    }
    const content = requireNativeModule().readFile(path, encoding, Boolean(opts.transform));
    return encoding === 'ascii' ? withUnsignedBytes(encoding, content) : content.then(textOf);
}

// The spec types readFile as Promise<Array<any>>, for ascii's byte values, and
// Windows resolves through exactly that type, so a utf8 or base64 read arrives
// there as [text]. Android and iOS resolve the text itself.
function textOf(data: any): any {
    return Array.isArray(data) && data.length === 1 && typeof data[0] === 'string' ? data[0] : data;
}

/**
 * Read part of a file: `length` bytes from `position`, or the rest of the
 * file without a length. A range past the end of the file reads what is
 * there, possibly nothing.
 * @param  {string} path Path of the file.
 * @param  {{position?: number, length?: number, encoding?: string}} options
 * @return {Promise<string | Array<number> | Uint8Array>}
 */
function read(path: string, options: ?{position?: number, length?: number, encoding?: string} = null): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    const opts = options || {};
    const encoding = normalizeEncoding(opts.encoding, READ_FILE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    const position = opts.position === undefined || opts.position === null ? 0 : opts.position;
    const length = opts.length === undefined || opts.length === null ? -1 : opts.length;
    const badLength = length !== -1 && !isCount(length);
    if (!isCount(position) || badLength) {
        return Promise.reject(addCode('EINVAL', new TypeError('"position" and "length" must be whole numbers, 0 or more')));
    }
    return requireNativeModule().readRange(path, position, length).then((data) => decodeBase64(data, encoding));
}

/**
 * The base64 text of `data` as `encoding` describes it, or an Error.
 */
function dataAsBase64(data: any, encoding: string): string | Error {
    if (isBinary(data)) {
        return base64OfBinary(data);
    }
    if (encoding === 'ascii') {
        return Array.isArray(data)
            ? base64.encode(binaryStringOfBytes(data))
            : addCode('EINVAL', new TypeError('"data" must be an Array when encoding is "ascii"'));
    }
    if (typeof data !== 'string') {
        return addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "${encoding}", but it is "${typeof data}"`));
    }
    return encoding === 'base64' ? data : base64.encode(binaryStringOfBytes(bytesOfUtf8(data)));
}

/**
 * Write data into a file at `position`, overwriting what is there and
 * keeping the rest of the file. Without a position the data is appended. The
 * file is created when it does not exist; a position past its end leaves
 * zero bytes in between.
 * @param  {string} path Path of the file.
 * @param  {string | Array<number> | ArrayBuffer | $ArrayBufferView} data
 * @param  {{position?: number, encoding?: string}} options
 * @return {Promise<number>} The number of bytes written.
 */
function write(path: string, data: any, options: ?{position?: number, encoding?: string} = null): Promise<number> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    const opts = options || {};
    const encoding = normalizeEncoding(opts.encoding, READ_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    const atEnd = opts.position === undefined || opts.position === null;
    const position = atEnd ? -1 : opts.position;
    if (!atEnd && !isCount(position)) {
        return Promise.reject(addCode('EINVAL', new TypeError('"position" must be a whole number, 0 or more')));
    }
    const encoded = dataAsBase64(data, encoding);
    if (encoded instanceof Error) {
        return Promise.reject(encoded);
    }
    return requireNativeModule().writeRange(path, encoded, position);
}

/**
 * Write data to a file, replacing it.
 * @param  {string} path  Path of the file.
 * @param  {string | number[] | ArrayBuffer | $ArrayBufferView} data Data to write to the file.
 * @param  {string | {encoding?: string, transform?: boolean, protection?: string}} encodingOrOptions Encoding of data, or the options.
 * @param  {{transform?: boolean, protection?: string}} options Run the registered file transformer on the data first (not for ascii).
 * @return {Promise<number>} The number of bytes written.
 */
function writeFile(path: string, data: any, encodingOrOptions: any = 'utf8', options: ?{transform?: boolean, protection?: string} = null): Promise<number> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding, opts] = encodingAndOptions(encodingOrOptions, options);
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    const invalid = checkProtection(opts);
    if (invalid) {
        return Promise.reject(invalid);
    }
    const written = writeData(path, data, encoding, Boolean(opts.transform), false);
    return written.then((count) => protect(path, opts).then(() => count));
}

/**
 * Hands data to native's writeFile or writeFileArray; replaces or appends.
 */
function writeData(path: string, data: any, encoding: string, transform: boolean, append: boolean): Promise<number> {
    if (isBinary(data) && encoding !== 'uri') {
        return requireNativeModule().writeFile(path, 'base64', base64OfBinary(data), transform, append);
    }
    if (encoding === 'ascii') {
        if (transform) {
            return Promise.reject(addCode('EINVAL', new TypeError('ascii is not supported for converted files')));
        }
        if (!Array.isArray(data)) {
            return Promise.reject(addCode('EINVAL', new TypeError('"data" must be an Array when encoding is "ascii"')));
        }
        return requireNativeModule().writeFileArray(path, data, append);
    }
    if (typeof data !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError(`"data" must be a String when encoding is "utf8" or "base64", but it is "${typeof data}"`)));
    }
    return requireNativeModule().writeFile(path, encoding, encoding === 'uri' ? pathOf(data) : data, transform, append);
}

function appendFile(path: string, data: any, encodingOrOptions?: any = 'utf8'): Promise<number> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    let [encoding] = encodingAndOptions(encodingOrOptions, null);
    encoding = normalizeEncoding(encoding, WRITE_ENCODINGS);
    if (encoding instanceof Error) {
        return Promise.reject(encoding);
    }
    return writeData(path, data, encoding, false, true);
}

/** Milliseconds since the epoch from a Date or a number; null for anything else. */
function millisOf(value: any): ?number {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.getTime() : null;
    }
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
}

/**
 * Set a file's modification time, and its creation time where the platform
 * keeps a settable one (iOS, Windows). A missing file is created empty, as
 * `touch` does.
 * @param  {string} path
 * @param  {{mtime?: Date | number, ctime?: Date | number}} options Default mtime: now; without ctime the creation time stays.
 * @return {Promise<void>}
 */
function touch(path: string, options: ?{mtime?: Date | number, ctime?: Date | number} = null): Promise<void> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    const opts = options || {};
    const mtime = opts.mtime === undefined || opts.mtime === null ? Date.now() : millisOf(opts.mtime);
    const ctime = opts.ctime === undefined || opts.ctime === null ? -1 : millisOf(opts.ctime);
    if (mtime == null || ctime == null) {
        return Promise.reject(addCode('EINVAL', new TypeError('"mtime" and "ctime" must be a Date or milliseconds since the epoch')));
    }
    return requireNativeModule().touch(path, mtime, ctime).then(() => undefined);
}

/**
 * Exclude a file or directory from iCloud and iTunes backups (iOS).
 * @param  {string} path Path of the file or directory.
 * @return {Promise<void>}
 */
const excludeFromBackup = platformOnly('ios', 'ReactNativeBlobUtil.fs.excludeFromBackup', (path: string) => {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    return requireNativeModule().excludeFromBackupKey('file://' + pathOf(path)).then(() => undefined);
});

/**
 * Set iOS file attributes: the data protection class, and whether the item is
 * left out of iCloud and iTunes backups (iOS).
 * @param  {string} path Path of the file or directory.
 * @param  {{protection?: string, excludeFromBackup?: boolean}} attributes
 * @return {Promise<void>}
 */
const setAttributes = platformOnly('ios', 'ReactNativeBlobUtil.fs.setAttributes',
    (path: string, attributes: ?{protection?: string, excludeFromBackup?: boolean}) => {
        if (typeof path !== 'string') {
            return Promise.reject(missingPath());
        }
        if (attributes === null || typeof attributes !== 'object') {
            return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "attributes"')));
        }
        const invalid = checkProtection(attributes);
        if (invalid) {
            return Promise.reject(invalid);
        }
        const out = {};
        if (attributes.protection !== undefined && attributes.protection !== null) {
            out.protection = attributes.protection;
        }
        if (attributes.excludeFromBackup !== undefined && attributes.excludeFromBackup !== null) {
            if (typeof attributes.excludeFromBackup !== 'boolean') {
                return Promise.reject(addCode('EINVAL', new TypeError('"excludeFromBackup" must be a boolean')));
            }
            out.excludeFromBackup = attributes.excludeFromBackup;
        }
        return requireNativeModule().setAttributes(pathOf(path), out).then(() => undefined);
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
 * The path of a resource bundle (`<name>.bundle`) in the app's main bundle (iOS).
 * @param  {string} name The bundle's name, with or without ".bundle".
 * @return {Promise<string>}
 */
const bundlePath = platformOnly('ios', 'ReactNativeBlobUtil.fs.bundlePath', (name: string) => {
    if (typeof name !== 'string' || name === '') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "name"')));
    }
    return requireNativeModule().bundlePath(name.replace(/\.bundle$/, ''));
});

/**
 * Every app-specific directory on external storage, the primary one first and
 * then one per removable volume, such as an SD card (Android). Resolves [] on
 * the other platforms.
 * @return {Promise<Array<string>>}
 */
function externalDirs(): Promise<Array<string>> {
    return requireNativeModule().getExternalDirs().then((found) => Array.isArray(found) ? found : []);
}

/**
 * Show statistic data of a path.
 * @param  {string} path Target path
 * @return {Promise<ReactNativeBlobUtilStat>}
 */
function stat(path: string): Promise<ReactNativeBlobUtilStat> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    return requireNativeModule().stat(pathOf(path)).then((entry) => entry ? normalizeStat(entry) : entry);
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
    return requireNativeModule().hash(pathOf(path), algorithm);
}

// cp and mv resolve undefined: the destination is the caller's own. They
// resolved a constant true (iOS, Windows) or undefined (Android).
function cp(path: string, dest: string, options: ?{protection?: string} = null): Promise<void> {
    if (typeof path !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
    }
    const invalid = checkProtection(options);
    if (invalid) {
        return Promise.reject(invalid);
    }
    const target = pathOf(dest);
    return requireNativeModule().cp(pathOf(path), target).then(() => protect(target, options));
}

function mv(path: string, dest: string, options: ?{protection?: string} = null): Promise<void> {
    if (typeof path !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "path" and/or "destination"')));
    }
    const invalid = checkProtection(options);
    if (invalid) {
        return Promise.reject(invalid);
    }
    const target = pathOf(dest);
    return requireNativeModule().mv(pathOf(path), target).then(() => protect(target, options));
}

/**
 * The entries of a directory: their names, or with {stats: true} a stat of
 * each (what lstat returned; lstat means something else in Node).
 */
function ls(path: string, options: ?{stats?: boolean} = null): Promise<any> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    path = pathOf(path);
    if (options && options.stats) {
        return requireNativeModule().lstat(path)
            .then((entries) => Array.isArray(entries) ? entries.map(normalizeStat) : entries);
    }
    return requireNativeModule().ls(path);
}

/** The external storage root (Android). */
const sdCardDir = platformOnly('android', 'ReactNativeBlobUtil.fs.sdCardDir', () => requireNativeModule().getSDCardDir());

/** The app's directory on external storage (Android). */
const sdCardApplicationDir = platformOnly('android', 'ReactNativeBlobUtil.fs.sdCardApplicationDir',
    () => requireNativeModule().getSDCardApplicationDir());

/**
 * Remove file at path.
 * @param  {string}   path:string Path of target file.
 * @return {Promise}
 */
function unlink(path: string): Promise<void> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    return requireNativeModule().unlink(pathOf(path)).then(() => undefined);
}

/**
 * Check if file exists and if it is a folder.
 * @param  {string} path Path to check
 * @return {Promise<boolean>}
 */
function exists(path: string): Promise<boolean> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    return requireNativeModule().exists(pathOf(path)).then((result) => Boolean(result && result.exists));
}

function slice(src: string, dest: string, start: number, end: number): Promise<void> {
    if (typeof src !== 'string' || typeof dest !== 'string') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "src" and/or "destination"')));
    }
    const from = pathOf(src);
    const to = pathOf(dest);

    let p = Promise.resolve();
    let size = 0;

    function normalize(num, length) {
        if (num < 0)
            return Math.max(0, length + num);
        if (!num && num !== 0)
            return length;
        return num;
    }

    if (start < 0 || end < 0 || !start || !end) {
        p = p.then(() => stat(from))
            .then((info) => {
                size = Math.floor(info.size);
                start = normalize(start || 0, size);
                end = normalize(end, size);
            });
    }
    // undefined: the destination is the caller's own.
    return p.then(() => requireNativeModule().slice(from, to, start, end)).then(() => undefined);
}

function isDir(path: string): Promise<boolean> {
    if (typeof path !== 'string') {
        return Promise.reject(missingPath());
    }
    return requireNativeModule().exists(pathOf(path)).then((result) => Boolean(result && result.isDirectory));
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
    read,
    write,
    touch,
    excludeFromBackup,
    setAttributes,
    appGroupDir,
    appGroupDirSync,
    bundlePath,
    externalDirs,
    hash,
    exists,
    createFile,
    isDir,
    stat,
    dirs,
    sdCardDir,
    sdCardApplicationDir,
    slice,
    asset,
    resource,
    df,
    // Names from before 1.0; each warns once.
    readFileWithTransform: deprecatedAlias('fs.readFileWithTransform', 'fs.readFile(path, encoding, {transform: true})',
        (path: string, encoding: string = 'utf8') => readFile(path, encoding, {transform: true})),
    writeFileWithTransform: deprecatedAlias('fs.writeFileWithTransform', 'fs.writeFile(path, data, encoding, {transform: true})',
        (path: string, data: any, encoding: ?string = 'utf8') => writeFile(path, data, encoding, {transform: true})),
    scanFile: deprecatedAlias('fs.scanFile', 'media.scan', media.scan),
    lstat: deprecatedAlias('fs.lstat', 'fs.ls(path, {stats: true})', (path: string) => ls(path, {stats: true})),
    pathForAppGroup: deprecatedAlias('fs.pathForAppGroup', 'fs.appGroupDir', appGroupDir),
    syncPathAppGroup: deprecatedAlias('fs.syncPathAppGroup', 'fs.appGroupDirSync', appGroupDirSync),
};
