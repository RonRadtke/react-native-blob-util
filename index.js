// Copyright 2016 wkh237@github. All rights reserved.
// Use of this source code is governed by a MIT-style license that can be
// found in the LICENSE file.

import fs from './fs';
import MediaCollection from './mediacollection';
import base64 from 'base-64';
import android from './android';
import ios from './ios';
import {config, fetch} from './fetch';
import URIUtil from './utils/uri';
import CanceledFetchError from './class/ReactNativeBlobUtilCanceledFetchError';

const {session} = fs;
const wrap = URIUtil.wrap;

export type {ReactNativeBlobUtilConfig, ReactNativeBlobUtilResponseInfo, ReactNativeBlobUtilStream} from './types';
export {default as URIUtil} from './utils/uri';
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
    MediaCollection,
    CanceledFetchError
};
