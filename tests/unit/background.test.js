/**
 * Downloads that outlive the app, in JavaScript: the id a background download
 * goes by, what it refuses, and background.list / attach / forget.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
let pending = [];
let records = [];

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    fetchBlob(options, taskId, method, url, headers, body, callback) {
        calls.push({name: 'fetchBlob', options, taskId});
        pending.push({taskId, callback});
    },
    attachBackgroundTask(id, callback) {
        calls.push({name: 'attachBackgroundTask', id});
        pending.push({taskId: id, callback});
    },
    listBackgroundTasks: () => Promise.resolve(records),
    forgetBackgroundTask: (id) => {
        calls.push({name: 'forgetBackgroundTask', id});
        return Promise.resolve(null);
    },
    enableProgressReport: (...args) => calls.push({name: 'enableProgressReport', args}),
    cancelRequest: (taskId) => {
        calls.push({name: 'cancelRequest', taskId});
        return Promise.resolve();
    },
});

const {default: ReactNativeBlobUtil, background} = await import('../../index.js');
const {backgroundIdOf, invalidBackground} = await import('../../utils/background.js');

test.beforeEach(() => {
    calls.length = 0;
    pending = [];
    records = [];
});

test('a background download goes by its id, to native and in its events', async () => {
    const task = ReactNativeBlobUtil.config({path: '/docs/a.bin', background: {id: 'invoice-42'}}).fetch('GET', 'https://example.test/a');
    assert.equal(task.taskId, 'invoice-42');
    const [call] = calls;
    assert.deepEqual(call.options.background, {id: 'invoice-42'});
    assert.equal(call.taskId, 'invoice-42');
    const seen = [];
    task.progress((written, total) => seen.push([written, total]));
    rn.emit('ReactNativeBlobUtilProgress', {taskId: 'invoice-42', written: 10, total: 100});
    pending[0].callback(null, 'path', '/docs/a.bin', {taskId: 'invoice-42', status: 200, headers: {}});
    const res = await task;
    assert.equal(res.path(), '/docs/a.bin');
    assert.deepEqual(seen, [[10, 100]]);
});

test('background: true gets a new id', async () => {
    const task = ReactNativeBlobUtil.config({path: '/docs/a.bin', background: true}).fetch('GET', 'https://example.test/a');
    assert.match(task.taskId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(calls[0].options.background, {id: task.taskId});
    task.cancel();
    await task.catch(() => undefined);
});

test('a background download cannot pause', async () => {
    const task = ReactNativeBlobUtil.config({path: '/docs/a.bin', background: true}).fetch('GET', 'https://example.test/a');
    await assert.rejects(task.pause(), {code: 'ENOTSUP'});
    task.cancel();
    await task.catch(() => undefined);
});

test('a background download refuses what the system cannot do, with EINVAL and no request', async () => {
    for (const [options, method, body] of [
        [{background: true}, 'GET', undefined],
        [{path: '/docs/a', background: true}, 'POST', 'x'],
        [{path: '/docs/a', background: true, transform: true}, 'GET', undefined],
        [{path: '/docs/a', background: true, overwrite: false}, 'GET', undefined],
        [{path: '/docs/a', background: true, resumable: true}, 'GET', undefined],
        [{path: '/docs/a', background: {id: 'has space'}}, 'GET', undefined],
        [{path: '/docs/a', background: {id: 7}}, 'GET', undefined],
        [{path: '/docs/a', background: 'yes'}, 'GET', undefined],
    ]) {
        await assert.rejects(ReactNativeBlobUtil.config(options).fetch(method, 'https://example.test/a', {}, body), {code: 'EINVAL'}, JSON.stringify(options));
    }
    assert.deepEqual(calls, []);
});

test('list hands back the records with numbers, and an error for a failed one', async () => {
    records = [
        {id: 'a', url: 'https://example.test/a', path: '/docs/a', state: 'running', written: '10', total: '100'},
        {id: 'b', url: 'https://example.test/b', path: '/docs/b', state: 'completed', written: 5, total: 5},
        {id: 'c', url: 'https://example.test/c', path: '/docs/c', state: 'failed', written: 1, total: -1, errorCode: 'ECONNRESET', errorMessage: 'reset'},
        {id: 'd', url: 'u', path: 'p', state: 'odd'},
    ];
    assert.deepEqual(await background.list(), [
        {id: 'a', url: 'https://example.test/a', path: '/docs/a', state: 'running', written: 10, total: 100},
        {id: 'b', url: 'https://example.test/b', path: '/docs/b', state: 'completed', written: 5, total: 5},
        {id: 'c', url: 'https://example.test/c', path: '/docs/c', state: 'failed', written: 1, total: -1, error: {code: 'ECONNRESET', message: 'reset'}},
        {id: 'd', url: 'u', path: 'p', state: 'failed', written: 0, total: -1, error: {code: 'EUNSPECIFIED', message: 'The download failed'}},
    ]);
});

test('attach is a task for the id: progress, and the outcome native hands over', async () => {
    const task = background.attach('invoice-42');
    assert.deepEqual(calls, [{name: 'attachBackgroundTask', id: 'invoice-42'}]);
    assert.equal(task.taskId, 'invoice-42');
    const seen = [];
    task.progress({interval: 0}, (written, total) => seen.push([written, total]));
    assert.deepEqual(calls[1], {name: 'enableProgressReport', args: ['invoice-42', 0, -1]});
    rn.emit('ReactNativeBlobUtilProgress', {taskId: 'invoice-42', written: 50, total: 100});
    pending[0].callback(null, 'path', '/docs/a.bin', {taskId: 'invoice-42', status: 200, headers: {}});
    assert.equal((await task).path(), '/docs/a.bin');
    assert.deepEqual(seen, [[50, 100]]);
});

test('attach rejects with the code native reports, and cancel cancels by id', async () => {
    const missing = background.attach('nope');
    pending[0].callback({code: 'ENOENT', message: 'No background download "nope"'}, null, null, {});
    await assert.rejects(missing, {code: 'ENOENT'});

    const running = background.attach('a');
    await running.cancel();
    await assert.rejects(running, {code: 'ECANCELED'});
    assert.deepEqual(calls.filter((c) => c.name === 'cancelRequest'), [{name: 'cancelRequest', taskId: 'a'}]);
});

test('forget removes the record; attach and forget want an id', async () => {
    assert.equal(await background.forget('a'), undefined);
    assert.deepEqual(calls, [{name: 'forgetBackgroundTask', id: 'a'}]);
    await assert.rejects(background.forget(''), {code: 'EINVAL'});
    await assert.rejects(background.attach(), {code: 'EINVAL'});
});

test('backgroundIdOf and invalidBackground', () => {
    const fresh = () => 'fresh';
    assert.equal(backgroundIdOf(undefined, fresh), null);
    assert.equal(backgroundIdOf(false, fresh), null);
    assert.deepEqual(backgroundIdOf(true, fresh), {id: 'fresh'});
    assert.deepEqual(backgroundIdOf({}, fresh), {id: 'fresh'});
    assert.deepEqual(backgroundIdOf({id: 'a.b_c-1'}, fresh), {id: 'a.b_c-1'});
    assert.ok(backgroundIdOf({id: '../x'}, fresh).error);
    assert.ok(backgroundIdOf({id: 'x'.repeat(101)}, fresh).error);
    const url = 'https://example.test/a';
    assert.equal(invalidBackground('get', {path: '/a'}, null, url), null);
    assert.match(invalidBackground('GET', {path: '/a', addAndroidDownloads: {}}, null, url), /downloadManager/);
});

// The system runs the download and decides what it trusts: a background
// URLSession, the DownloadManager and BITS all check the server against the
// system store and never ask the library. A request that limits trust to its
// own CA or to pinned hosts would run against that store with nothing saying
// so, so it is refused rather than silently widened.
test('a background download cannot bring its own trust', () => {
    const ok = {path: '/a'};
    const url = 'https://example.test/a';
    assert.equal(invalidBackground('GET', ok, null, url), null);

    assert.match(invalidBackground('GET', {...ok, customCACerts: ['my_ca']}, null, url), /customCACerts/);
    assert.match(invalidBackground('GET', {...ok, pinnedHosts: ['example.test']}, null, url), /pinnedHosts/);
    assert.match(invalidBackground('GET', {...ok, trusty: true}, null, url), /trusty/);

    // Asking for nothing is not asking: an empty list leaves the request alone.
    assert.equal(invalidBackground('GET', {...ok, customCACerts: [], pinnedHosts: []}, null, url), null);
    assert.equal(invalidBackground('GET', {...ok, trusty: false}, null, url), null);
    assert.equal(invalidBackground('GET', {...ok, trustSystemCerts: true}, null, url), null);
});

// BITS also takes file:// and a UNC name, and Windows signs in to whatever
// host a UNC name points at. Only http and https reach any of the three.
test('a background download needs an http or https URL', () => {
    const ok = {path: '/a'};
    for (const url of ['https://example.test/a', 'HTTP://example.test/a']) {
        assert.equal(invalidBackground('GET', ok, null, url), null, url);
    }
    for (const url of ['file:///etc/passwd', '\\\\attacker.test\\share\\x', 'ftp://example.test/a', '/a/b', '', undefined]) {
        assert.match(invalidBackground('GET', ok, null, url), /http or https/, String(url));
    }
});
