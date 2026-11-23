// @flow
import {FetchBlobResponse} from './class/ReactNativeBlobUtilBlobResponse';
import CanceledFetchError from './class/ReactNativeBlobUtilCanceledFetchError';
import fs from './fs';
import {backgroundIdOf, invalidBackground} from './utils/background';
import toByteCount from './utils/byteCount';
import {normalizeConfig} from './utils/config';
import {addCode} from './utils/errors';
import {getEventEmitter, requireNativeModule} from './utils/nativeModule';
import {escapeForm, invalidAppendExt, invalidFormField, invalidHeader, nativeOptions, prepareBody} from './utils/request';
import {completeAt, continuesAt, invalidResumable, validatorOf} from './utils/resume';
import getUUID from './utils/uuid';
import type {ReactNativeBlobUtilConfig} from './types';

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
 *                   Only do requests through WiFi. Android only.
 *         @property {boolean} overwrite
 *                   Overwrite an existing file at `path`, default true.
 *         @property {Array<string>} customCACerts
 *                   PEM certificates to trust in addition to, or instead of, the
 *                   system's (see the README).
 *         @property {Array<string>} pinnedHosts
 *                   Hosts the custom CA certificates apply to.
 *         @property {boolean} trustSystemCerts
 *                   Keep trusting the system certificates when customCACerts is set.
 *         @property {boolean} transformFile
 *                   Run the registered file transformer on the downloaded file.
 *         @property {boolean} auto
 *                   Write a binary response to a cache file and keep text and
 *                   JSON in memory; binary is anything but text/* and JSON, or
 *                   a type listed in binaryContentTypes (Android and iOS).
 *         @property {Array<string>} binaryContentTypes
 *                   Content-Type fragments that count as binary.
 *
 * @return {function} This method returns a `fetch` method instance.
 */
export function config(options: ReactNativeBlobUtilConfig) {
    return {fetch: (...args: any) => fetchWithOptions(options || {}, ...args)};
}

/**
 * Create a HTTP request with the default configuration. Use `config(options).fetch`
 * to configure it.
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
    return fetchWithOptions({}, ...args);
}

/**
 * A task for a background download started earlier, maybe before the app was
 * last ended: background.attach(id). It settles when the download does, and
 * reports progress and cancels like any task.
 */
export function attachBackground(id: string): Promise {
    return fetchWithOptions({}, 'GET', '', null, null, id);
}

function fetchWithOptions(options: ReactNativeBlobUtilConfig, method: string, url: string, headers: ?Object, body: any, attachId: ?string = null): Promise {
    options = normalizeConfig(options);

    // A background download is known by its id, also to native after a restart;
    // any other task by a fresh one. The id is used for events, too.
    const background = attachId === null ? backgroundIdOf(options.background, getUUID) : null;
    const taskId = attachId ?? (background && background.id) ?? getUUID();
    let respInfo = {'uninit': true};

    // A body passed in the headers' place (#334) was copied key by key below:
    // one header per character, and for a long string more properties than
    // Hermes allows, which threw from fetch itself.
    const headersNotAnObject = headers != null && (typeof headers !== 'object' || Array.isArray(headers))
        ? 'headers must be an object of header names and values' : null;
    if (headersNotAnObject) {
        headers = null;
    }

    // # 241 normalize null or undefined headers, in case nil or null string
    // pass to native context. Only those: any other value that is not a string
    // (0 and false included) is refused by invalidHeader below.
    headers = headers && Object.keys(headers).reduce((result, key) => {
        result[key] = headers[key] ?? '';
        return result;
    }, {});

    // Refused here, before any listener exists, so all platforms agree.
    const prepared = prepareBody(method, headers, body);
    const resumable = Boolean(options.resumable);
    const invalid = headersNotAnObject || invalidAppendExt(options) || prepared.error || invalidHeader(headers)
        || (Array.isArray(body) ? invalidFormField(body) : null)
        || (resumable ? invalidResumable(method, options, body) : null)
        || (background ? background.error || invalidBackground(method, options, body, url) : null);
    headers = prepared.headers;
    body = Array.isArray(prepared.body) ? escapeForm(prepared.body) : prepared.body;
    // `range` is set here for a resumed request only; `resumable` is handled here.
    delete options.range;
    delete options.resumable;
    delete options.background;
    if (background && !background.error) {
        options.background = {id: taskId};
    }
    // The kind of a single body travels in the options; native no longer infers it.
    options = nativeOptions(prepared.bodyType ? {...options, bodyType: prepared.bodyType} : options);

    // A download to a path can pause and resume: GET, written to a file the
    // caller named, by the library rather than the DownloadManager or an iOS
    // background session.
    const pausable = attachId === null && !background && String(method).toUpperCase() === 'GET' && typeof options.path === 'string'
        && !options.addAndroidDownloads && !options.IOSBackgroundTask;
    // A resumable download writes to <path>.part, with what it needs to continue
    // in <path>.part.json, and moves the part file to path once it is complete.
    const target = options.path;
    const part = resumable ? target + '.part' : null;
    const meta = resumable ? target + '.part.json' : null;

    // Every listener this task registers, so that settling or cancelling removes
    // all of them: a task must leave nothing behind for the life of the app.
    const subscriptions = [];
    let settled = false;

    function settle() {
        settled = true;
        while (subscriptions.length > 0) {
            subscriptions.pop().remove();
        }
    }

    let promiseResolve;
    let promiseReject;

    // One task can take several native requests: the first, and one per resume.
    // Only the one in `nativeId` counts; events and the callback of any other
    // (paused, or replaced) are ignored. null while paused.
    let nativeId = null;
    let attempts = 0;
    let paused = false;
    // What the server identified the file by, for If-Range: a strong ETag, or
    // else Last-Modified, from the response that started the download.
    let validator = null;
    // The progress settings, sent again for each resumed request.
    const progressSettings = {};

    function fail(error) {
        if (settled) return;
        settle();
        promiseReject(error);
    }

    // from remote HTTP(S)
    const promise = new Promise((resolve, reject) => {
        promiseResolve = resolve;
        promiseReject = reject;

        if (invalid) {
            settled = true;
            reject(addCode('EINVAL', new Error(invalid)));
            return;
        }

        const emitter = getEventEmitter();

        // Listens for an event of the request that counts; iOS sends events as JSON strings.
        function listen(eventName, handler) {
            subscriptions.push(emitter.addListener(eventName, (e) => {
                if (typeof e === 'string') e = JSON.parse(e);
                if (nativeId !== null && e.taskId === nativeId) handler(e);
            }));
        }

        listen('ReactNativeBlobUtilProgress', (e) => {
            if (promise.onProgress) promise.onProgress(toByteCount(e.written), toByteCount(e.total), e.chunk);
        });
        listen('ReactNativeBlobUtilProgress-upload', (e) => {
            if (promise.onUploadProgress) promise.onUploadProgress(toByteCount(e.written), toByteCount(e.total));
        });
        listen('ReactNativeBlobUtilState', (e) => {
            respInfo = e;
            started(e);
            if (promise.onStateChange) promise.onStateChange(e);
        });
        listen('ReactNativeBlobUtilServerPush', (e) => {
            if (promise.onPartData) promise.onPartData(e.chunk);
        });

        if (!resumable) {
            send(null);
            return;
        }
        // A part file left by an earlier request for the same URL is continued.
        partToContinue(url, part, meta).then((found) => {
            validator = found ? found.validator : null;
            if (!settled && !paused) {
                send(found ? {from: found.size, ifRange: validator} : null);
            }
        }, fail);
    });

    /**
     * Sends a native request: the first one, or a resumed one asking for the
     * bytes from `range.from` on.
     */
    function send(range: ?{from: number, ifRange: ?string}) {
        const id = attempts === 0 ? taskId : `${taskId}-${attempts}`;
        attempts++;
        nativeId = id;
        // The first request gets its settings from progress() itself.
        if (attempts > 1) {
            if (progressSettings.enableProgressReport) {
                requireNativeModule().enableProgressReport(id, ...progressSettings.enableProgressReport);
            }
            if (progressSettings.enableUploadProgressReport) {
                requireNativeModule().enableUploadProgressReport(id, ...progressSettings.enableUploadProgressReport);
            }
        }
        const sendOptions = {...options};
        if (resumable) {
            sendOptions.path = part;
        }
        if (range) {
            sendOptions.range = range.ifRange ? range : {from: range.from};
        }
        const nativeMethodName = Array.isArray(body) ? 'fetchBlobForm' : 'fetchBlob';
        // An attached background download has no request to send: native hands
        // over its outcome when it has one.
        const req = attachId === null
            ? requireNativeModule()[nativeMethodName]
            : (o, i, m, u, h, b, callback) => requireNativeModule().attachBackgroundTask(attachId, callback);

        /**
         * Send request via native module, the response callback accepts four arguments
         * @callback
         * @param err {?{code: string, message: string}} null when the request succeeded.
         * @param rawType { 'utf8' | 'base64' | 'path'} RNFB request will be stored
         *                  as UTF8 string, BASE64 string, or a file path reference
         *                  in JS context, and this parameter indicates which one
         *                  dose the response data presents.
         * @param data {string} Response data or its reference.
         * @param responseInfo {Object.<>}
         */
        req(sendOptions, id, method, url, headers || {}, body, (err, rawType, data, responseInfo) => {
            // A paused or replaced request: its outcome is not the task's.
            if (id !== nativeId || settled) {
                return;
            }
            finish(range, err, rawType, data, responseInfo);
        });
    }

    /** The response of a request has started: note what identifies the file. */
    function started(info: Object) {
        const status = Number(info.status);
        const continuable = status === 200 || status === 206;
        if (!pausable || !continuable) {
            return;
        }
        const found = validatorOf(info.headers);
        if (status === 200 || found) {
            validator = found;
        }
        if (resumable && status === 200) {
            // Written while the body arrives; without it a later request starts over.
            fs.writeFile(meta, JSON.stringify({url, validator}), 'utf8').catch(() => undefined);
        }
    }

    /** The native callback of the request that counts. */
    function finish(range, err, rawType, data, responseInfo) {
        // task done, remove event listeners
        settle();

        if (!responseInfo) responseInfo = {}; // should not be null / undefined

        if (err) {
            // {code, message} from native; a plain string is tolerated.
            const message = typeof err === 'string' ? err : String(err.message);
            const code = typeof err === 'object' && err.code || 'EUNSPECIFIED';
            const error = addCode(code, new Error(message));
            error.respInfo = 'uninit' in respInfo ? responseInfo : respInfo;
            promiseReject(error);
            return;
        }
        if ('uninit' in respInfo && respInfo.uninit) // event didn't fire yet so we override it here
            respInfo = responseInfo;
        respInfo.rnfbEncode = rawType;

        const status = Number(respInfo.status);
        // A range the server got wrong left the file as it was (native wrote none of it).
        const wrongRange = range && (status === 416 && !completeAt(respInfo.headers, range.from)
            || status === 206 && !continuesAt(respInfo.headers, range.from));
        if (wrongRange) {
            const error = addCode('EUNSPECIFIED', new Error(`The server did not continue the download from byte ${range.from}`));
            error.respInfo = respInfo;
            promiseReject(error);
            return;
        }
        if (resumable) {
            const complete = status >= 200 && status < 300 || range && status === 416;
            if (!complete) {
                // An error status: nothing to continue from when the body was
                // written to the part file, the partial data kept when it was not.
                const error = addCode('EUNSPECIFIED', new Error(`The download failed with HTTP ${status}`));
                error.respInfo = respInfo;
                const cleanup = range ? Promise.resolve() : removePart(part, meta);
                cleanup.then(() => promiseReject(error));
                return;
            }
            fs.mv(part, target)
                .then(() => fs.unlink(meta).catch(() => undefined))
                .then(() => promiseResolve(new FetchBlobResponse(taskId, respInfo, target)), promiseReject);
            return;
        }
        // response data is saved to storage, create a session for it
        if (options.path || options.fileCache || options.addAndroidDownloads
            || options.key || options.auto && respInfo.respType === 'blob') {
            if (options.session)
                fs.session(options.session).add(data);
        }
        promiseResolve(new FetchBlobResponse(taskId, respInfo, data));
    }

    // Extend the promise with `progress`, `uploadProgress`, `stateChange`, `part`,
    // `cancel`, `pause` and `resume`. They stay callable after the task has
    // settled and do nothing then, so a handler registered late, or a cancel of
    // a finished task, is not an error.
    // `progress` and `uploadProgress` take an optional first argument #140: when
    // there is only one argument, the default `interval` and `count` are used.
    function progressReporter(handlerName, nativeMethodName) {
        return (...args) => {
            if (settled) return promise;
            let interval = 250;
            let count = -1;
            let fn = args[0];
            if (args.length === 2) {
                // Only a missing value falls back to the default; 0 is a valid
                // interval ("every chunk") and used to become 250.
                const settings = args[0] || {};
                interval = settings.interval === undefined || settings.interval === null ? interval : settings.interval;
                count = settings.count === undefined || settings.count === null ? count : settings.count;
                fn = args[1];
            }
            promise[handlerName] = fn;
            progressSettings[nativeMethodName] = [interval, count];
            requireNativeModule()[nativeMethodName](nativeId ?? taskId, interval, count);
            return promise;
        };
    }

    promise.progress = progressReporter('onProgress', 'enableProgressReport');
    promise.uploadProgress = progressReporter('onUploadProgress', 'enableUploadProgressReport');
    promise.part = (fn) => {
        promise.onPartData = fn;
        return promise;
    };
    promise.stateChange = (fn) => {
        promise.onStateChange = fn;
        return promise;
    };
    // Resolves once native has cancelled the task. The task itself rejects
    // with CanceledFetchError right away. A resumable download's part file
    // goes too: cancel means the file is not wanted.
    promise.cancel = (fn: ?Function): Promise<void> => {
        if (settled) return Promise.resolve();
        settle();
        const id = nativeId;
        nativeId = null;
        let cancelled = id === null ? Promise.resolve() : requireNativeModule().cancelRequest(id).then(() => undefined);
        if (resumable) {
            cancelled = cancelled.then(() => removePart(part, meta));
        }
        if (typeof fn === 'function') {
            cancelled.then(() => fn(), (err) => fn(err));
        }
        promiseReject(new CanceledFetchError('canceled'));
        return cancelled;
    };
    // Stops the transfer and keeps what has arrived; the task stays pending
    // until resume() finishes it (or cancel() ends it).
    promise.pause = (): Promise<void> => {
        if (settled || paused) return Promise.resolve();
        if (!pausable) {
            return Promise.reject(addCode('ENOTSUP', new Error('Only a GET downloading to `path` can pause')));
        }
        paused = true;
        const id = nativeId;
        nativeId = null;
        return id === null ? Promise.resolve() : requireNativeModule().cancelRequest(id).then(() => undefined);
    };
    // Continues a paused download from the bytes on disk: the server is asked
    // for the rest (Range, with If-Range), and one that cannot continue sends
    // the whole file again, which replaces the partial one.
    promise.resume = (): Promise<void> => {
        if (settled || !paused) return Promise.resolve();
        paused = false;
        return fs.stat(resumable ? part : target)
            .then((stat) => stat.size, () => 0)
            .then((from) => {
                if (!settled && !paused) {
                    send(from > 0 ? {from, ifRange: validator} : null);
                }
            });
    };
    promise.taskId = taskId;

    return promise;

}

/**
 * The part file of an earlier request for the same URL, and the validator it
 * started with; null when there is nothing to continue.
 */
function partToContinue(url: string, part: string, meta: string): Promise<?{size: number, validator: ?string}> {
    return fs.readFile(meta, 'utf8')
        .then(parseNotes, () => null)
        .then((saved) => {
            if (!saved || saved.url !== url) {
                return null;
            }
            return fs.stat(part).then(
                (stat) => stat.size > 0 ? {size: stat.size, validator: typeof saved.validator === 'string' ? saved.validator : null} : null,
                () => null,
            );
        });
}

/** The notes of a part file; null when they are not JSON, as after a crash mid-write. */
function parseNotes(text: string): ?Object {
    try {
        const notes = JSON.parse(text);
        return notes !== null && typeof notes === 'object' ? notes : null;
    } catch {
        return null;
    }
}

/** Removes a part file and its JSON; a missing one is fine. */
function removePart(part: string, meta: string): Promise<void> {
    return Promise.all([fs.unlink(part).catch(() => undefined), fs.unlink(meta).catch(() => undefined)]).then(() => undefined);
}
