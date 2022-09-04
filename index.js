// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import {AppState, DeviceEventEmitter, NativeModules, Platform,} from 'react-native';

//import StatefulPromise from './class/StatefulPromise.js'
import fs from './fs';
import MediaCollection from './mediacollection';
import base64 from 'base-64';
import polyfill from './polyfill';
import android from './android';
import ios from './ios';
import JSONStream from './json-stream';
import {config, fetch} from './fetch';
import URIUtil from "./utils/uri";

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
const emitter = DeviceEventEmitter;
const ReactNativeBlobUtil = NativeModules.ReactNativeBlobUtil;
const wrap = URIUtil.wrap;

// when app resumes, check if there's any expired network task and trigger
// their .expire event
if (Platform.OS === 'ios') {
    AppState.addEventListener('change', (e) => {
        if (e === 'active')
            ReactNativeBlobUtil.emitExpiredEvent(() => {
            });
    });
}

// Show warning if native module not detected
if (!ReactNativeBlobUtil || !ReactNativeBlobUtil.fetchBlobForm || !ReactNativeBlobUtil.fetchBlob) {
    console.warn(
        'react-native-blob-util could not find valid native module.',
        'please make sure you have linked native modules using `rnpm link`,',
        'and restart RN packager or manually compile IOS/Android project.'
    );
}

export {ReactNativeBlobUtilConfig, ReactNativeBlobUtilResponseInfo, ReactNativeBlobUtilStream} from './types';
export * as URIUtil from './utils/uri';
export {FetchBlobResponse} from './class/ReactNativeBlobUtilBlobResponse';
export * as getUUID from './utils/uuid';
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
    MediaCollection
};
