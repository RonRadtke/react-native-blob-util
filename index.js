// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import {getNativeModule} from './utils/nativeModule';

//import StatefulPromise from './class/StatefulPromise.js'
import fs from './fs';
import MediaCollection from './mediacollection';
import base64 from 'base-64';
import polyfill from './polyfill';
import android from './android';
import ios from './ios';
import JSONStream from './json-stream';
import {config, fetch} from './fetch';
import URIUtil from './utils/uri';
import CanceledFetchError from './class/ReactNativeBlobUtilCanceledFetchError';

const {
    ReactNativeBlobUtilSession,
    readStream,
    createFile,
    unlink,
    exists,
    mkdir,
    session,
    writeStream,
    readFile,
    ls,
    isDir,
    mv,
    cp
} = fs;

const Blob = polyfill.Blob;
const wrap = URIUtil.wrap;

// Show warning if native module not detected
const nativeModule = getNativeModule();

if (!nativeModule || !nativeModule.fetchBlobForm || !nativeModule.fetchBlob) {
    console.warn(
        'react-native-blob-util could not find valid native module.',
        'please make sure you have linked native modules using `rnpm link`,',
        'and restart RN packager or manually compile IOS/Android project.'
    );
}

export {ReactNativeBlobUtilConfig, ReactNativeBlobUtilResponseInfo, ReactNativeBlobUtilStream} from './types';
export { URIUtil } from './utils/uri';
export {FetchBlobResponse} from './class/ReactNativeBlobUtilBlobResponse';
export { getUUID } from './utils/uuid';
export default {
    fetch,
    base64,
    android,
    ios,
    config,
    session,
    fs,
    wrap,
    polyfill,
    JSONStream,
    MediaCollection,
    CanceledFetchError
};
