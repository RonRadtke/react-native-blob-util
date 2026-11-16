/**
 * Pausing, resuming and resumable downloads in JavaScript: which native
 * requests a task makes, what each asks for, and what the task settles with.
 * The native module is the harness fake; a request completes when the test
 * invokes the callback it captured, and fs is a small in-memory stand-in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
let pending = [];
// path -> {size, text}
let files = new Map();

const fsCall = (name, run) => (...args) => {
    calls.push({name, args});
    try {
        return Promise.resolve(run(...args));
    } catch (err) {
        return Promise.reject(err);
    }
};
const enoent = (path) => Object.assign(new Error(`No such file '${path}'`), {code: 'ENOENT'});

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    fetchBlob(options, taskId, method, url, headers, body, callback) {
        calls.push({name: 'fetchBlob', options, taskId, method, url});
        pending.push({taskId, callback});
    },
    enableProgressReport: (...args) => calls.push({name: 'enableProgressReport', args}),
    enableUploadProgressReport: (...args) => calls.push({name: 'enableUploadProgressReport', args}),
    cancelRequest: (taskId) => {
        calls.push({name: 'cancelRequest', taskId});
        return Promise.resolve();
    },
    stat: fsCall('stat', (path) => {
        if (!files.has(path)) throw enoent(path);
        return {filename: path, path, size: String(files.get(path).size), type: 'file', lastModified: 1};
    }),
    readFile: fsCall('readFile', (path) => {
        if (!files.has(path)) throw enoent(path);
        return files.get(path).text;
    }),
    writeFile: fsCall('writeFile', (path, encoding, data) => {
        files.set(path, {size: data.length, text: data});
        return data.length;
    }),
    mv: fsCall('mv', (from, to) => {
        if (!files.has(from)) throw enoent(from);
        files.set(to, files.get(from));
        files.delete(from);
    }),
    unlink: fsCall('unlink', (path) => {
        files.delete(path);
    }),
});

const {config} = await import('../../fetch.js');
const {validatorOf, completeAt, continuesAt, invalidResumable} = await import('../../utils/resume.js');

const URL_A = 'https://example.test/big.bin';
const nativeCalls = (name) => calls.filter((c) => c.name === name);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Delivers the state event and completes the native request with this id. */
function respond(taskId, info, {data = '/docs/big.bin', err = null} = {}) {
    rn.emit('ReactNativeBlobUtilState', {taskId, state: '2', ...info});
    const found = pending.find((p) => p.taskId === taskId);
    pending = pending.filter((p) => p !== found);
    found.callback(err, err ? null : 'path', err ? null : data, {taskId, ...info});
}

/** The state event only: the response has started, the body is still coming. */
function startResponse(taskId, info) {
    rn.emit('ReactNativeBlobUtilState', {taskId, state: '2', ...info});
}

test.beforeEach(() => {
    calls.length = 0;
    pending = [];
    files = new Map();
});

test('pause cancels the request; resume asks for the rest with If-Range and the task settles with it', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    const first = nativeCalls('fetchBlob')[0];
    assert.equal(first.taskId, task.taskId);
    assert.equal(first.options.range, undefined);
    startResponse(first.taskId, {status: 200, headers: {ETag: '"v1"', 'Content-Length': '1000'}});

    files.set('/docs/big.bin', {size: 400});
    await task.pause();
    assert.deepEqual(nativeCalls('cancelRequest').map((c) => c.taskId), [task.taskId]);

    await task.resume();
    const second = nativeCalls('fetchBlob')[1];
    assert.notEqual(second.taskId, task.taskId, 'a new native request');
    assert.deepEqual(second.options.range, {from: 400, ifRange: '"v1"'});
    assert.equal(second.options.path, '/docs/big.bin');

    // The paused request ending late changes nothing.
    pending.find((p) => p.taskId === first.taskId).callback({code: 'ECANCELED', message: 'canceled'}, null, null, {});
    respond(second.taskId, {status: 206, headers: {'Content-Range': 'bytes 400-999/1000'}});
    const res = await task;
    assert.equal(res.path(), '/docs/big.bin');
    assert.equal(res.info().status, 206);
});

test('progress settings are sent again for the resumed request, and only its events count', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    const seen = [];
    task.progress({interval: 100, count: 10}, (written, total) => seen.push([written, total]));
    startResponse(task.taskId, {status: 200, headers: {}});
    files.set('/docs/big.bin', {size: 10});
    await task.pause();
    await task.resume();
    const second = nativeCalls('fetchBlob')[1];
    assert.deepEqual(nativeCalls('enableProgressReport').map((c) => c.args), [[task.taskId, 100, 10], [second.taskId, 100, 10]]);

    rn.emit('ReactNativeBlobUtilProgress', {taskId: task.taskId, written: 5, total: 100});
    rn.emit('ReactNativeBlobUtilProgress', {taskId: second.taskId, written: 50, total: 100});
    assert.deepEqual(seen, [[50, 100]]);
    respond(second.taskId, {status: 206, headers: {'Content-Range': 'bytes 10-99/100'}});
    await task;
});

test('without an ETag, Last-Modified is the validator; a weak ETag is not used; with neither, Range goes alone', async () => {
    for (const [headers, expected] of [
        [{'Last-Modified': 'Tue, 10 Nov 2026 10:00:00 GMT'}, {from: 3, ifRange: 'Tue, 10 Nov 2026 10:00:00 GMT'}],
        [{etag: 'W/"weak"', 'last-modified': 'Mon, 09 Nov 2026 10:00:00 GMT'}, {from: 3, ifRange: 'Mon, 09 Nov 2026 10:00:00 GMT'}],
        [{}, {from: 3}],
    ]) {
        calls.length = 0;
        const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
        startResponse(task.taskId, {status: 200, headers});
        files.set('/docs/big.bin', {size: 3});
        await task.pause();
        await task.resume();
        const second = nativeCalls('fetchBlob')[1];
        assert.deepEqual(second.options.range, expected, JSON.stringify(headers));
        respond(second.taskId, {status: 206, headers: {'Content-Range': 'bytes 3-9/10'}});
        await task;
    }
});

test('resume with nothing on disk starts over with a plain request', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    await task.pause();
    await task.resume();
    const second = nativeCalls('fetchBlob')[1];
    assert.equal(second.options.range, undefined);
    respond(second.taskId, {status: 200, headers: {}});
    await task;
});

test('a 416 that says the file on disk is complete resolves; any other 416 rejects', async () => {
    const complete = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    files.set('/docs/big.bin', {size: 1000});
    await complete.pause();
    await complete.resume();
    respond(nativeCalls('fetchBlob')[1].taskId, {status: 416, headers: {'Content-Range': 'bytes */1000'}});
    assert.equal((await complete).path(), '/docs/big.bin');

    calls.length = 0;
    const wrong = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    await wrong.pause();
    await wrong.resume();
    respond(nativeCalls('fetchBlob')[1].taskId, {status: 416, headers: {'Content-Range': 'bytes */2000'}});
    await assert.rejects(wrong, {code: 'EUNSPECIFIED'});
});

test('pause rejects ENOTSUP for a download to memory, an upload, or the DownloadManager', async () => {
    for (const [options, method] of [[{}, 'GET'], [{fileCache: true}, 'GET'], [{path: '/docs/a'}, 'POST'],
        [{path: '/docs/a', android: {downloadManager: {useDownloadManager: true}}}, 'GET']]) {
        const task = config(options).fetch(method, URL_A);
        await assert.rejects(task.pause(), {code: 'ENOTSUP'}, JSON.stringify(options));
        task.cancel();
        await task.catch(() => undefined);
    }
});

test('pause and resume of a settled task do nothing', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    respond(task.taskId, {status: 200, headers: {}});
    await task;
    calls.length = 0;
    await task.pause();
    await task.resume();
    assert.deepEqual(calls, []);
});

test('cancel while paused rejects the task and sends nothing more', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    await task.pause();
    calls.length = 0;
    await task.cancel();
    await assert.rejects(task, {code: 'ECANCELED'});
    assert.deepEqual(calls, []);
});

// resumable

test('a resumable download writes to a part file, notes what it needs, and moves it into place', async () => {
    const task = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    const first = nativeCalls('fetchBlob')[0];
    assert.equal(first.options.path, '/docs/big.bin.part');
    assert.equal(first.options.range, undefined);
    assert.equal('resumable' in first.options, false, 'native is not told');

    startResponse(first.taskId, {status: 200, headers: {ETag: '"v2"'}});
    await tick();
    assert.deepEqual(JSON.parse(files.get('/docs/big.bin.part.json').text), {url: URL_A, validator: '"v2"'});

    files.set('/docs/big.bin.part', {size: 1000});
    respond(first.taskId, {status: 200, headers: {ETag: '"v2"'}}, {data: '/docs/big.bin.part'});
    const res = await task;
    assert.equal(res.path(), '/docs/big.bin');
    assert.equal(files.has('/docs/big.bin.part'), false);
    assert.equal(files.has('/docs/big.bin.part.json'), false);
    assert.equal(files.get('/docs/big.bin').size, 1000);
});

test('a resumable download continues a part file left for the same URL', async () => {
    files.set('/docs/big.bin.part', {size: 600});
    files.set('/docs/big.bin.part.json', {size: 1, text: JSON.stringify({url: URL_A, validator: '"v3"'})});
    const task = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    const first = nativeCalls('fetchBlob')[0];
    assert.deepEqual(first.options.range, {from: 600, ifRange: '"v3"'});
    respond(first.taskId, {status: 206, headers: {'Content-Range': 'bytes 600-999/1000'}}, {data: '/docs/big.bin.part'});
    assert.equal((await task).path(), '/docs/big.bin');
});

test('a part file left for another URL, or without its notes, is started over', async () => {
    for (const notes of [JSON.stringify({url: 'https://example.test/other', validator: '"x"'}), null, 'not json']) {
        calls.length = 0;
        files = new Map([['/docs/big.bin.part', {size: 600}]]);
        if (notes !== null) {
            files.set('/docs/big.bin.part.json', {size: 1, text: notes});
        }
        const task = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
        await tick();
        const first = nativeCalls('fetchBlob')[0];
        assert.equal(first.options.range, undefined, String(notes));
        task.cancel();
        await task.catch(() => undefined);
    }
});

test('cancel removes the part file and its notes; a failure keeps them', async () => {
    files.set('/docs/big.bin.part', {size: 600});
    files.set('/docs/big.bin.part.json', {size: 1, text: JSON.stringify({url: URL_A, validator: null})});
    const cancelled = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    await cancelled.cancel();
    await assert.rejects(cancelled, {code: 'ECANCELED'});
    assert.equal(files.has('/docs/big.bin.part'), false);
    assert.equal(files.has('/docs/big.bin.part.json'), false);

    files.set('/docs/big.bin.part', {size: 600});
    files.set('/docs/big.bin.part.json', {size: 1, text: JSON.stringify({url: URL_A, validator: null})});
    const failed = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    const id = nativeCalls('fetchBlob').at(-1).taskId;
    respond(id, {status: 0, headers: {}}, {err: {code: 'ECONNRESET', message: 'reset'}});
    await assert.rejects(failed, {code: 'ECONNRESET'});
    assert.equal(files.has('/docs/big.bin.part'), true);
    assert.equal(files.has('/docs/big.bin.part.json'), true);
});

test('an HTTP error rejects a resumable download; the part file goes only if the error body went into it', async () => {
    const fresh = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    files.set('/docs/big.bin.part', {size: 20});
    respond(nativeCalls('fetchBlob')[0].taskId, {status: 500, headers: {}}, {data: '/docs/big.bin.part'});
    await assert.rejects(fresh, (err) => err.code === 'EUNSPECIFIED' && /HTTP 500/.test(err.message));
    assert.equal(files.has('/docs/big.bin.part'), false);

    calls.length = 0;
    files.set('/docs/big.bin.part', {size: 600});
    files.set('/docs/big.bin.part.json', {size: 1, text: JSON.stringify({url: URL_A, validator: '"v"'})});
    const continued = config({path: '/docs/big.bin', resumable: true}).fetch('GET', URL_A);
    await tick();
    respond(nativeCalls('fetchBlob')[0].taskId, {status: 503, headers: {}}, {data: '/docs/big.bin.part'});
    await assert.rejects(continued, {code: 'EUNSPECIFIED'});
    assert.equal(files.get('/docs/big.bin.part').size, 600, 'the partial data stays');
});

test('resumable refuses what it cannot continue, with EINVAL and no request', async () => {
    for (const [options, method, body] of [
        [{path: '/docs/a', resumable: true}, 'POST', undefined],
        [{resumable: true}, 'GET', undefined],
        [{fileCache: true, resumable: true}, 'GET', undefined],
        [{path: '/docs/a', resumable: true, overwrite: false}, 'GET', undefined],
        [{path: '/docs/a', resumable: true, transform: true}, 'GET', undefined],
        [{path: '/docs/a', resumable: true, ios: {backgroundTask: true}}, 'GET', undefined],
    ]) {
        await assert.rejects(config(options).fetch(method, URL_A, {}, body), {code: 'EINVAL'}, JSON.stringify(options));
    }
    assert.deepEqual(nativeCalls('fetchBlob'), []);
});

test('a 206 from another offset rejects: the file was left as it was', async () => {
    const task = config({path: '/docs/big.bin'}).fetch('GET', URL_A);
    files.set('/docs/big.bin', {size: 400});
    await task.pause();
    await task.resume();
    respond(nativeCalls('fetchBlob')[1].taskId, {status: 206, headers: {'Content-Range': 'bytes 0-999/1000'}});
    await assert.rejects(task, {code: 'EUNSPECIFIED'});
});

test('validatorOf, completeAt and invalidResumable', () => {
    assert.equal(validatorOf({ETag: '"abc"'}), '"abc"');
    assert.equal(validatorOf({etag: ' W/"weak" ', 'Last-Modified': 'X'}), 'X');
    assert.equal(validatorOf({}), null);
    assert.equal(validatorOf(null), null);
    assert.equal(completeAt({'Content-Range': 'bytes */1000'}, 1000), true);
    assert.equal(completeAt({'content-range': 'bytes */1000'}, 999), false);
    assert.equal(completeAt({'Content-Range': 'bytes 0-9/1000'}, 1000), false);
    assert.equal(completeAt({}, 0), false);
    assert.equal(continuesAt({'Content-Range': 'bytes 400-999/1000'}, 400), true);
    assert.equal(continuesAt({'content-range': 'bytes 0-999/1000'}, 400), false);
    assert.equal(continuesAt({}, 400), false);
    assert.equal(invalidResumable('get', {path: '/a'}, null), null);
    assert.match(invalidResumable('PUT', {path: '/a'}, null), /GET/);
});
