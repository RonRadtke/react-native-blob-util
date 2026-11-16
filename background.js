// @flow
// Downloads that outlive the app: started with config({path, background: {id}}),
// run by the system (a background URLSession on iOS, the DownloadManager on
// Android, BackgroundDownloader on Windows), and found again by id on a later
// start of the app.

import {attachBackground} from './fetch';
import {addCode} from './utils/errors';
import {requireNativeModule} from './utils/nativeModule';

export type BackgroundTask = {
    id: string,
    url: string,
    path: string,
    state: 'running' | 'paused' | 'completed' | 'failed',
    written: number,
    total: number,
    error?: {code: string, message: string},
};

const STATES = ['running', 'paused', 'completed', 'failed'];

/** A record as native reports it, with numbers as numbers and a known state. */
function normalize(record: Object): BackgroundTask {
    const task: Object = {
        id: String(record.id),
        url: String(record.url ?? ''),
        path: String(record.path ?? ''),
        state: STATES.includes(record.state) ? record.state : 'failed',
        written: Number(record.written ?? 0),
        total: Number(record.total ?? -1),
    };
    if (task.state === 'failed') {
        task.error = {
            code: String(record.errorCode || 'EUNSPECIFIED'),
            message: String(record.errorMessage || 'The download failed'),
        };
    }
    return task;
}

/**
 * The background downloads whose outcome has not been handed to the app yet:
 * running, and finished while the app was not there to hear of it. One stays
 * listed until a task attached to it (or the fetch that started it) settles,
 * or until forget(id); reading the list does not remove anything.
 * @return {Promise<Array<BackgroundTask>>}
 */
function list(): Promise<Array<BackgroundTask>> {
    return requireNativeModule().listBackgroundTasks()
        .then((records) => Array.isArray(records) ? records.map(normalize) : []);
}

/**
 * A task for a background download by its id, with progress() and cancel()
 * like the one fetch returns: it resolves with the response (res.path() is the
 * file) once the download is done, at once when it already is, and rejects
 * with the error of one that failed, ENOENT for an id there is no record of.
 * @param  {string} id
 * @return {StatefulPromise<FetchBlobResponse>}
 */
function attach(id: string): Promise<any> {
    if (typeof id !== 'string' || id === '') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "id"')));
    }
    return attachBackground(id);
}

/**
 * Removes the record of a background download, cancelling it when it is still
 * running. A file it already wrote stays.
 * @param  {string} id
 * @return {Promise<void>}
 */
function forget(id: string): Promise<void> {
    if (typeof id !== 'string' || id === '') {
        return Promise.reject(addCode('EINVAL', new TypeError('Missing argument "id"')));
    }
    return requireNativeModule().forgetBackgroundTask(id).then(() => undefined);
}

export default {list, attach, forget};
