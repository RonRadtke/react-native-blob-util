import type {ReactNativeBlobUtilNative, filedescriptor} from "./types";
import {requireNativeModule} from './utils/nativeModule';
function createMediafile(fd: filedescriptor, mediatype: string): Promise {
    if ((!'parentFolder' in fd)) fd['parentFolder'] = '';
    return requireNativeModule().createMediaFile(fd, mediatype);
}

function writeToMediafile(uri: string, path: string) {
    return requireNativeModule().writeToMediaFile(uri, path, false);
}

function writeToMediafileWithTransform(uri: string, path: string) {
    return requireNativeModule().writeToMediaFile(uri, path, true);
}

function copyToInternal(contenturi: string, destpath: string) {
    return requireNativeModule().copyToInternal(contenturi, destpath);
}

function getBlob(contenturi: string, encoding: string) {
    return requireNativeModule().getBlob(contenturi, encoding);
}

function copyToMediaStore(fd: filedescriptor, mediatype: string, path: string) {
    return requireNativeModule().copyToMediaStore(fd, mediatype, path);
}

export default {
    createMediafile,
    writeToMediafile,
    writeToMediafileWithTransform,
    copyToInternal,
    getBlob,
    copyToMediaStore
};
