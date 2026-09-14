import {deprecatedAlias} from './utils/deprecate';
import {requireNativeModule} from './utils/nativeModule';
import {platformOnly} from './utils/platform';
import type {filedescriptor} from './types';

// The MediaStore is Android's; every call rejects with ENOTSUP elsewhere.
const androidOnly = (name, fn) => platformOnly('android', `ReactNativeBlobUtil.MediaCollection.${name}`, fn);

const createMediaFile = androidOnly('createMediaFile', (fd: filedescriptor, mediatype: string) => {
    if (fd && typeof fd === 'object' && !('parentFolder' in fd)) {
        fd = {...fd, parentFolder: ''};
    }
    return requireNativeModule().createMediaFile(fd, mediatype);
});

const writeToMediaFile = androidOnly('writeToMediaFile', (uri: string, path: string) => {
    return requireNativeModule().writeToMediaFile(uri, path, false);
});

const writeToMediaFileWithTransform = androidOnly('writeToMediaFileWithTransform', (uri: string, path: string) => {
    return requireNativeModule().writeToMediaFile(uri, path, true);
});

const copyToInternal = androidOnly('copyToInternal', (contenturi: string, destpath: string) => {
    return requireNativeModule().copyToInternal(contenturi, destpath);
});

const getBlob = androidOnly('getBlob', (contenturi: string, encoding: string) => {
    return requireNativeModule().getBlob(contenturi, encoding);
});

const copyToMediaStore = androidOnly('copyToMediaStore', (fd: filedescriptor, mediatype: string, path: string) => {
    return requireNativeModule().copyToMediaStore(fd, mediatype, path);
});

export default {
    createMediaFile,
    writeToMediaFile,
    writeToMediaFileWithTransform,
    copyToInternal,
    getBlob,
    copyToMediaStore,
    // The names as they were spelled before 1.0.
    createMediafile: deprecatedAlias('MediaCollection.createMediafile', 'MediaCollection.createMediaFile', createMediaFile),
    writeToMediafile: deprecatedAlias('MediaCollection.writeToMediafile', 'MediaCollection.writeToMediaFile', writeToMediaFile),
    writeToMediafileWithTransform: deprecatedAlias('MediaCollection.writeToMediafileWithTransform', 'MediaCollection.writeToMediaFileWithTransform', writeToMediaFileWithTransform),
};
