// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import {addCode} from './utils/errors';
import {requireNativeModule} from './utils/nativeModule';
import {platformOnly} from './utils/platform';

// Every call here rejects with ENOTSUP on other platforms.
const androidOnly = (name, fn) => platformOnly('android', `ReactNativeBlobUtil.android.${name}`, fn);

/**
 * Send an intent to open the file.
 * @param  {string} path Path of the file to be open.
 * @param  {string} mime MIME type string
 * @param  {string} chooserTitle for chooser, if not set the chooser won't be displayed (see https://developer.android.com/reference/android/content/Intent.html#createChooser(android.content.Intent,%20java.lang.CharSequence))
 * @return {Promise}
 */
const actionViewIntent = androidOnly('actionViewIntent', (path: string, mime: string, chooserTitle: ?string) => {
    return requireNativeModule().actionViewIntent(path, mime, chooserTitle === undefined ? null : chooserTitle);
});

const getContentIntent = androidOnly('getContentIntent', (mime: string) => {
    return requireNativeModule().getContentIntent(mime);
});

const addCompleteDownload = androidOnly('addCompleteDownload', (config: Object) => {
    return requireNativeModule().addCompleteDownload(config);
});

const getSDCardDir = androidOnly('getSDCardDir', () => {
    return requireNativeModule().getSDCardDir();
});

const getSDCardApplicationDir = androidOnly('getSDCardApplicationDir', () => {
    return requireNativeModule().getSDCardApplicationDir();
});

/**
 * Request the media scanner to scan files, so they show up in the gallery
 * and other apps.
 * @param  {Array<{path: string, mime?: string}>} pairs Files to scan.
 * @return {Promise}
 */
const scanFile = androidOnly('scanFile', (pairs: Array<Object>) => {
    return new Promise((resolve, reject) => {
        if (pairs === undefined) {
            return reject(addCode('EINVAL', new TypeError('Missing argument')));
        }
        requireNativeModule().scanFile(pairs, (err) => {
            if (err)
                reject(addCode('EUNSPECIFIED', new Error(err)));
            else
                resolve();
        });
    });
});

export default {
    actionViewIntent,
    getContentIntent,
    addCompleteDownload,
    getSDCardDir,
    getSDCardApplicationDir,
    scanFile,
};
