// The device's shared media library: Android's MediaStore, the Downloads
// app and the media scanner. Every call rejects with ENOTSUP elsewhere.

import {toUnsignedBytes} from './utils/bytes';
import {addCode} from './utils/errors';
import {requireNativeModule} from './utils/nativeModule';
import {platformOnly} from './utils/platform';
import type {filedescriptor} from './types';

const androidOnly = (name, fn) => platformOnly('android', `ReactNativeBlobUtil.media.${name}`, fn);

function withParentFolder(fd: filedescriptor): filedescriptor {
    if (fd && typeof fd === 'object' && !('parentFolder' in fd)) {
        return {...fd, parentFolder: ''};
    }
    return fd;
}

/**
 * Create an empty entry in a collection.
 * @param  {filedescriptor} fd {name, mimeType, parentFolder?}
 * @param  {'Audio' | 'Image' | 'Video' | 'Download'} collection
 * @return {Promise<string>} The entry's content URI.
 */
const createFile = androidOnly('createFile', (fd: filedescriptor, collection: string) => {
    return requireNativeModule().createMediaFile(withParentFolder(fd), collection);
});

/**
 * Copy a file from the app's storage into an existing entry.
 * @param  {string} uri The entry's content URI.
 * @param  {string} path The file to copy.
 * @param  {{transform?: boolean}} options Run the registered file transformer first.
 * @return {Promise<void>}
 */
const write = androidOnly('write', (uri: string, path: string, options: ?{transform?: boolean} = null) => {
    return requireNativeModule().writeToMediaFile(uri, path, Boolean(options && options.transform)).then(() => undefined);
});

/**
 * Create an entry and copy a file into it in one step.
 * @return {Promise<string>} The entry's content URI.
 */
const copyToMediaStore = androidOnly('copyToMediaStore', (fd: filedescriptor, collection: string, path: string) => {
    return requireNativeModule().copyToMediaStore(withParentFolder(fd), collection, path);
});

/**
 * Copy an entry into the app's own storage.
 * @return {Promise<string>} The destination path.
 */
const copyToInternal = androidOnly('copyToInternal', (uri: string, dest: string) => {
    return requireNativeModule().copyToInternal(uri, dest);
});

/**
 * Read an entry: text for utf8, a base64 string, or bytes 0..255 for ascii.
 */
const read = androidOnly('read', (uri: string, encoding: string = 'utf8') => {
    const lowered = String(encoding).toLowerCase();
    const result = requireNativeModule().getBlob(uri, lowered);
    return lowered === 'ascii' ? result.then(toUnsignedBytes) : result;
});

/**
 * Register a finished download with the Downloads app.
 * @param  {{title, description, mime, path, showNotification}} options
 * @return {Promise<void>}
 */
const addDownload = androidOnly('addDownload', (options: Object) => {
    return requireNativeModule().addCompleteDownload(options).then(() => undefined);
});

/**
 * Ask the media scanner to index files so they show in the gallery and other apps.
 * @param  {Array<{path: string, mime?: string}>} files
 * @return {Promise<void>}
 */
const scan = androidOnly('scan', (files: Array<Object>) => {
    if (files === undefined) {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument')));
    }
    return requireNativeModule().scanFile(files).then(() => undefined);
});

/** The external storage root. */
const sdCardDir = androidOnly('sdCardDir', () => requireNativeModule().getSDCardDir());

/** The app's directory on external storage. */
const sdCardApplicationDir = androidOnly('sdCardApplicationDir', () => requireNativeModule().getSDCardApplicationDir());

export default {
    createFile,
    write,
    copyToMediaStore,
    copyToInternal,
    read,
    addDownload,
    scan,
    sdCardDir,
    sdCardApplicationDir,
};
