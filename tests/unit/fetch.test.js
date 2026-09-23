/**
 * The lifecycle of a fetch task in JavaScript: which native calls it makes,
 * which events it listens to, and what is left once it settles or is
 * cancelled. The native module is the fake from the harness, so every
 * request "completes" when the test invokes the callback it captured.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const EVENTS = [
    'ReactNativeBlobUtilProgress',
    'ReactNativeBlobUtilProgress-upload',
    'ReactNativeBlobUtilState',
    'ReactNativeBlobUtilExpire',
    'ReactNativeBlobUtilServerPush',
];

const calls = [];
let pending = [];

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    fetchBlob(options, taskId, method, url, headers, body, callback) {
        calls.push({name: 'fetchBlob', options, taskId, method, url, headers, body});
        pending.push({taskId, callback});
    },
    fetchBlobForm(options, taskId, method, url, headers, form, callback) {
        calls.push({name: 'fetchBlobForm', options, taskId, method, url, headers, form});
        pending.push({taskId, callback});
    },
    enableProgressReport: (...args) => calls.push({name: 'enableProgressReport', args}),
    enableUploadProgressReport: (...args) => calls.push({name: 'enableUploadProgressReport', args}),
    cancelRequest: (taskId) => {
        calls.push({name: 'cancelRequest', taskId});
        return Promise.resolve();
    },
});

const {default: ReactNativeBlobUtil} = await import('../../index.js');
const {fetch, config} = await import('../../fetch.js');

function listenerCounts() {
    return Object.fromEntries(EVENTS.map((event) => [event, rn.listenerCount(event)]));
}

function noListeners() {
    return Object.fromEntries(EVENTS.map((event) => [event, 0]));
}

/** Completes the most recent request the way native does on success. */
function completeLast(data = 'body', info = {status: 200, headers: {}, respType: 'text'}) {
    const {taskId, callback} = pending.pop();
    callback(null, 'utf8', data, {...info, taskId});
}

test.beforeEach(() => {
    calls.length = 0;
    pending = [];
});

test('a settled task leaves no listeners behind (audit #1)', async () => {
    const before = listenerCounts();
    const task = fetch('GET', 'https://example.test/a');
    task.progress(() => {});

    completeLast();
    await task;

    assert.deepEqual(listenerCounts(), before);
    assert.deepEqual(before, noListeners());
});

test('cancel removes every listener, including the part listener (audit #1)', async () => {
    const task = fetch('GET', 'https://example.test/a');
    task.part(() => {});

    task.cancel();
    await assert.rejects(task, {name: 'ReactNativeBlobUtilCanceledFetch'});

    assert.deepEqual(listenerCounts(), noListeners());
    assert.equal(calls.filter((c) => c.name === 'cancelRequest').length, 1);
});

test('stateChange only reports the task it belongs to (audit #1)', async () => {
    const seenA = [];
    const seenB = [];
    const a = fetch('GET', 'https://example.test/a').stateChange((e) => seenA.push(e.taskId));
    const b = fetch('GET', 'https://example.test/b').stateChange((e) => seenB.push(e.taskId));
    const [{taskId: idA}, {taskId: idB}] = pending;

    rn.emit('ReactNativeBlobUtilState', {taskId: idA, state: '2', status: 200, headers: {}});
    rn.emit('ReactNativeBlobUtilState', JSON.stringify({taskId: idB, state: '2', status: 201, headers: {}}));

    assert.deepEqual(seenA, [idA]);
    assert.deepEqual(seenB, [idB]);

    completeLast();
    completeLast();
    const [resA, resB] = await Promise.all([a, b]);
    assert.equal(resA.respInfo.status, 200);
    assert.equal(resB.respInfo.status, 201);
});

// An interval of 0 ("every chunk") went through `||` and became 250.
test('a progress interval or count of 0 is kept', async () => {
    const task = fetch('GET', 'https://example.test/a').progress({interval: 0, count: 0}, () => {});
    const {taskId} = pending[pending.length - 1];
    assert.deepEqual(calls.find((c) => c.name === 'enableProgressReport').args, [taskId, 0, 0]);
    completeLast();
    await task;
});

test('progress events reach the handler with numeric counts', async () => {
    const seen = [];
    const task = fetch('GET', 'https://example.test/a').progress({interval: 100, count: 5}, (w, t, chunk) => seen.push([w, t, chunk]));
    const {taskId} = pending[0];

    rn.emit('ReactNativeBlobUtilProgress', {taskId, written: '10', total: '20', chunk: 'x'});
    rn.emit('ReactNativeBlobUtilProgress', {taskId: 'someone-else', written: 1, total: 2});

    assert.deepEqual(seen, [[10, 20, 'x']]);
    assert.deepEqual(calls.find((c) => c.name === 'enableProgressReport').args, [taskId, 100, 5]);

    completeLast();
    await task;
});

test('task methods survive settling as no-ops (audit #8)', async () => {
    const task = fetch('GET', 'https://example.test/a');
    completeLast();
    await task;

    assert.equal(task.progress(() => {}), task);
    assert.equal(task.uploadProgress(() => {}), task);
    assert.equal(task.stateChange(() => {}), task);
    assert.equal(task.part(() => {}), task);
    assert.equal(typeof task.taskId, 'string');
    assert.doesNotThrow(() => task.cancel());

    assert.equal(calls.some((c) => c.name === 'enableProgressReport'), false, 'no native call after settle');
    assert.equal(calls.some((c) => c.name === 'cancelRequest'), false, 'no native cancel after settle');
});

test('there is no expire(): nothing ever emitted the event it listened for (audit #12)', async () => {
    const task = fetch('GET', 'https://example.test/a');
    assert.equal(task.expire, undefined);
    assert.equal(rn.listenerCount('ReactNativeBlobUtilExpire'), 0);
    completeLast();
    await task;
});

test('a plain fetch sends no options; config() sends exactly its options (audit #9)', async () => {
    const plain = ReactNativeBlobUtil.fetch('GET', 'https://example.test/a');
    completeLast();
    await plain;
    assert.deepEqual(calls[0].options, {});

    const configured = ReactNativeBlobUtil.config({fileCache: true, appendExt: 'bin'}).fetch('GET', 'https://example.test/b');
    completeLast();
    await configured;
    assert.deepEqual(calls.at(-1).options, {fileCache: true, appendExt: 'bin'});
});

test('headers with empty values are sent as empty strings', async () => {
    const task = fetch('POST', 'https://example.test/a', {'X-Empty': null, 'X-Set': 'v'}, 'data');
    // A text body without a Content-Type gets text/plain (see requestBody.test.js).
    assert.deepEqual(calls[0].headers, {'X-Empty': '', 'X-Set': 'v', 'Content-Type': 'text/plain;charset=UTF-8'});
    completeLast();
    await task;
});

test('an array body goes through fetchBlobForm', async () => {
    const task = fetch('POST', 'https://example.test/a', {}, [{name: 'f', data: 'x'}]);
    assert.equal(calls[0].name, 'fetchBlobForm');
    completeLast();
    await task;
});

test('a native error rejects with an Error carrying the message', async () => {
    const task = fetch('GET', 'https://example.test/a');
    const {callback} = pending.pop();
    callback('connection refused', null, null, null);
    await assert.rejects(task, {message: 'connection refused', code: 'EUNSPECIFIED'});
});

test('a native {code, message} error rejects with the code and the response info (audit #7)', async () => {
    const task = fetch('GET', 'https://example.test/a');
    const {taskId, callback} = pending.pop();
    rn.emit('ReactNativeBlobUtilState', {taskId, state: '2', status: 504, headers: {}});
    callback({code: 'ETIMEDOUT', message: 'request timed out'}, null, null, null);
    await assert.rejects(task, (err) => {
        assert.equal(err.code, 'ETIMEDOUT');
        assert.equal(err.message, 'request timed out');
        assert.equal(err.respInfo.status, 504);
        return true;
    });
});

test('cancel resolves the optional callback once native has cancelled', async () => {
    const task = fetch('GET', 'https://example.test/a');
    let called = 0;
    task.cancel(() => { called++; });
    await assert.rejects(task, {code: 'ECANCELED'});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(called, 1);
});
