import {ReactNativeBlobUtilConfig} from './types';
import URIUtil from './utils/uri';
import fs from './fs';
import getUUID from './utils/uuid';
import toByteCount from './utils/byteCount';
import {FetchBlobResponse} from './class/ReactNativeBlobUtilBlobResponse';
import CanceledFetchError from './class/ReactNativeBlobUtilCanceledFetchError';
import {getEventEmitter, requireNativeModule} from './utils/nativeModule';

/**
 * Calling this method will inject configurations into followed `fetch` method.
 * @param  {ReactNativeBlobUtilConfig} options
 *         Fetch API configurations, contains the following options :
 *         @property {boolean} fileCache
 *                   When fileCache is `true`, response data will be saved in
 *                   storage with a random generated file name, rather than
 *                   a BASE64 encoded string.
 *         @property {string} appendExt
 *                   Set this property to change file extension of random-
 *                   generated file name.
 *         @property {string} path
 *                   If this property has a valid string format, resonse data
 *                   will be saved to specific file path. Default string format
 *                   is : `ReactNativeBlobUtil-file://path-to-file`
 *         @property {string} key
 *                   If this property is set, it will be converted to md5, to
 *                   check if a file with this name exists.
 *                   If it exists, the absolute path is returned (no network
 *                   activity takes place )
 *                   If it doesn't exist, the file is downloaded as usual
 *         @property {number} timeout
 *                   Request timeout in millionseconds, by default it's 60000ms.
 *         @property {boolean} followRedirect
 *                   Follow redirects automatically, default true
 *         @property {boolean} trusty
 *                   Trust all certificates
 *         @property {boolean} wifiOnly
 *                   Only do requests through WiFi. Android SDK 21 or above only.
 *
 * @return {function} This method returns a `fetch` method instance.
 */
export function config(options: ReactNativeBlobUtilConfig) {
    return {fetch: fetch.bind(options)};
}

/**
 * Fetch from file system, use the same interface as RNFB.fetch
 * @param  {ReactNativeBlobUtilConfig} [options={}] Fetch configurations
 * @param  {string} method     Should be one of `get`, `post`, `put`
 * @param  {string} url        A file URI string
 * @param  {string} headers    Arguments of file system API
 * @param  {any}    body       Data to put or post to file systen.
 * @return {Promise}
 */
function fetchFile(options = {}, method, url, headers = {}, body): Promise {

    if (!URIUtil.isFileURI(url)) {
        throw `could not fetch file from an invalid URI : ${url}`;
    }

    url = URIUtil.unwrapFileURI(url);

    let promise = null,
        cursor = 0,
        total = -1,
        cacheData = '',
        info = null,
        _progress, _uploadProgress, _stateChange;

    switch (method.toLowerCase()) {

        case 'post':
            break;

        case 'put':
            break;

        // read data from file system
        default:
            promise = fs.stat(url)
                .then((stat) => {
                    total = stat.size;
                    return fs.readStream(url,
                        headers.encoding || 'utf8',
                        Math.floor(headers.bufferSize) || 409600,
                        Math.floor(headers.interval) || 100
                    );
                })
                .then((stream) => new Promise((resolve, reject) => {
                    stream.open();
                    info = {
                        state: '2',
                        headers: {'source': 'system-fs'},
                        status: 200,
                        respType: 'text',
                        rnfbEncode: headers.encoding || 'utf8'
                    };
                    _stateChange(info);
                    stream.onData((chunk) => {
                        _progress && _progress(cursor, total, chunk);
                        if (headers.noCache)
                            return;
                        cacheData += chunk;
                    });
                    stream.onError((err) => {
                        reject(err);
                    });
                    stream.onEnd(() => {
                        resolve(new FetchBlobResponse(null, info, cacheData));
                    });
                }));
            break;
    }

    promise.progress = (fn) => {
        _progress = fn;
        return promise;
    };
    promise.stateChange = (fn) => {
        _stateChange = fn;
        return promise;
    };
    promise.uploadProgress = (fn) => {
        _uploadProgress = fn;
        return promise;
    };

    return promise;
}

/**
 * Create a HTTP request by settings, the `this` context is a `ReactNativeBlobUtilConfig` object.
 * @param  {string} method HTTP method, should be `GET`, `POST`, `PUT`, `DELETE`
 * @param  {string} url Request target url string.
 * @param  {object} headers HTTP request headers.
 * @param  {string} body
 *         Request body, can be either a BASE64 encoded data string,
 *         or a file path with prefix `ReactNativeBlobUtil-file://` (can be changed)
 * @return {Promise}
 *         This promise instance also contains a Customized method `progress`for
 *         register progress event handler.
 */
export function fetch(...args: any): Promise {

    // create task ID for receiving progress event
    let taskId = getUUID();
    let options = this || {};
    let subscription, subscriptionUpload, stateEvent, partEvent;
    let respInfo = {'uninit': true};
    let [method, url, headers, body] = [...args];

    // # 241 normalize null or undefined headers, in case nil or null string
    // pass to native context
    headers = headers && Object.keys(headers).reduce((result, key) => {
        result[key] = headers[key] || '';
        return result;
    }, {});

    // fetch from file system
    if (URIUtil.isFileURI(url)) {
        return fetchFile(options, method, url, headers, body);
    }

    let promiseResolve;
    let promiseReject;

    // from remote HTTP(S)
    let promise = new Promise((resolve, reject) => {
        promiseResolve = resolve;
        promiseReject = reject;

        let nativeMethodName = Array.isArray(body) ? 'fetchBlobForm' : 'fetchBlob';

        // on progress event listener
        subscription = getEventEmitter().addListener('ReactNativeBlobUtilProgress', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.taskId === taskId && promise.onProgress) {
                promise.onProgress(toByteCount(e.written), toByteCount(e.total), e.chunk);
            }
        });

        subscriptionUpload = getEventEmitter().addListener('ReactNativeBlobUtilProgress-upload', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.taskId === taskId && promise.onUploadProgress) {
                promise.onUploadProgress(toByteCount(e.written), toByteCount(e.total));
            }
        });

        stateEvent = getEventEmitter().addListener('ReactNativeBlobUtilState', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.taskId === taskId)
                respInfo = e;
            promise.onStateChange && promise.onStateChange(e);
        });

        subscription = getEventEmitter().addListener('ReactNativeBlobUtilExpire', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.taskId === taskId && promise.onExpire) {
                promise.onExpire(e);
            }
        });

        partEvent = getEventEmitter().addListener('ReactNativeBlobUtilServerPush', (e) => {
            if (typeof e === 'string') e = JSON.parse(e);
            if (e.taskId === taskId && promise.onPartData) {
                promise.onPartData(e.chunk);
            }
        });

        // When the request body comes from Blob polyfill, we should use special its ref
        // as the request body
        if (body instanceof Blob && body.isReactNativeBlobUtilPolyfill) {
            body = body.getReactNativeBlobUtilRef();
        }

        let req = ReactNativeBlobUtil[nativeMethodName];

        /**
         * Send request via native module, the response callback accepts three arguments
         * @callback
            * @param err {any} Error message or object, when the request success, this
         *                  parameter should be `null`.
         * @param rawType { 'utf8' | 'base64' | 'path'} RNFB request will be stored
         *                  as UTF8 string, BASE64 string, or a file path reference
         *                  in JS context, and this parameter indicates which one
         *                  dose the response data presents.
         * @param data {string} Response data or its reference.
         * @param responseInfo {Object.<>}
         */
        req(options, taskId, method, url, headers || {}, body, (err, rawType, data, responseInfo) => {

            // task done, remove event listeners
            subscription.remove();
            subscriptionUpload.remove();
            stateEvent.remove();
            partEvent.remove();
            delete promise.progress;
            delete promise.uploadProgress;
            delete promise.stateChange;
            delete promise.part;
            delete promise.cancel;
            // delete promise['expire']
            promise.cancel = () => {
            };

            if(!responseInfo) responseInfo = {}; // should not be null / undefined

            if (err)
                reject(new Error(err, respInfo));
            else {
                // response data is saved to storage, create a session for it
                if (options.path || options.fileCache || options.addAndroidDownloads
                    || options.key || options.auto && respInfo.respType === 'blob') {
                    if (options.session)
                        fs.session(options.session).add(data);
                }
                if ('uninit' in respInfo && respInfo.uninit) // event didn't fire yet so we override it here
                    respInfo = responseInfo;

                respInfo.rnfbEncode = rawType;
                resolve(new FetchBlobResponse(taskId, respInfo, data));
            }

        });

    });

    // extend Promise object, add `progress`, `uploadProgress`, and `cancel`
    // method for register progress event handler and cancel request.
    // Add second parameter for performance purpose #140
    // When there's only one argument pass to this method, use default `interval`
    // and `count`, otherwise use the given on.
    // TODO : code refactor, move `uploadProgress` and `progress` to StatefulPromise
    promise.progress = (...args) => {
        let interval = 250;
        let count = -1;
        let fn = () => {
        };
        if (args.length === 2) {
            interval = args[0].interval || interval;
            count = args[0].count || count;
            fn = args[1];
        }
        else {
            fn = args[0];
        }
        promise.onProgress = fn;
        requireNativeModule().enableProgressReport(taskId, interval, count);
        return promise;
    };
    promise.uploadProgress = (...args) => {
        let interval = 250;
        let count = -1;
        let fn = () => {
        };
        if (args.length === 2) {
            interval = args[0].interval || interval;
            count = args[0].count || count;
            fn = args[1];
        }
        else {
            fn = args[0];
        }
        promise.onUploadProgress = fn;
        requireNativeModule().enableUploadProgressReport(taskId, interval, count);
        return promise;
    };
    promise.part = (fn) => {
        promise.onPartData = fn;
        return promise;
    };
    promise.stateChange = (fn) => {
        promise.onStateChange = fn;
        return promise;
    };
    promise.expire = (fn) => {
        promise.onExpire = fn;
        return promise;
    };
    promise.cancel = (fn) => {
        fn = fn || function () {
        };
        subscription.remove();
        subscriptionUpload.remove();
        stateEvent.remove();
        requireNativeModule().cancelRequest(taskId, fn);
        promiseReject(new CanceledFetchError('canceled'));
    };
    promise.taskId = taskId;

    return promise;

}
