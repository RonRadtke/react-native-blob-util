import {after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks, stripTypeScriptTypes} from 'node:module';

// fetch.js only uses type annotations that Node's built-in type stripper can
// erase. Load the real adapter without Babel or a device; stub native callbacks
// and unrelated file/response helpers, not the listener lifecycle under test.
const fetchURL = new URL('../../fetch.js', import.meta.url).href;
const nativeURL = 'blob-util-test:native';
const fakeModules = {
    [nativeURL]: `
        const listeners = new Map();
        export const requests = [];
        export const cancellations = [];
        let nextId = 0;
        export const uuid = () => 'task-' + ++nextId;
        export function listenerCount(name) {
            if (name) return listeners.get(name)?.size || 0;
            return [...listeners.entries()].filter(([event]) => event !== 'ReactNativeBlobUtilMessage')
                .reduce((sum, [, set]) => sum + set.size, 0);
        }
        export function emit(name, event) {
            for (const handler of listeners.get(name) || []) handler(event);
        }
        export function reset() {
            for (const [name, set] of listeners) if (name !== 'ReactNativeBlobUtilMessage') set.clear();
            requests.length = 0;
            cancellations.length = 0;
        }
        export const getEventEmitter = () => ({
            addListener(name, callback) {
                if (!listeners.has(name)) listeners.set(name, new Set());
                const set = listeners.get(name);
                set.add(callback);
                return { remove: () => set.delete(callback) };
            }
        });
        const request = (...args) => requests.push({id: args[1], callback: args[6]});
        export const requireNativeModule = () => ({
            fetchBlob: request,
            fetchBlobForm: request,
            enableProgressReport() {},
            enableUploadProgressReport() {},
            cancelRequest(id, callback) { cancellations.push(id); callback(); }
        });
    `,
    'blob-util-test:react-native': `import {getEventEmitter} from '${nativeURL}'; export class NativeEventEmitter {constructor() {return getEventEmitter();}}`,
    'blob-util-test:codegen': `import {requireNativeModule} from '${nativeURL}'; export default requireNativeModule();`,
    'blob-util-test:types': 'export const ReactNativeBlobUtilConfig = undefined;',
    'blob-util-test:uri': 'export default {isFileURI: value => value.startsWith("file://")};',
    'blob-util-test:fs': 'export default {};',
    'blob-util-test:uuid': `export {uuid as default} from '${nativeURL}';`,
    'blob-util-test:response': 'export class FetchBlobResponse {constructor(taskId, info, data) {this.taskId = taskId; this.data = data;}}',
};
const replacements = {
    './types': 'blob-util-test:types',
    './utils/uri': 'blob-util-test:uri',
    './fs': 'blob-util-test:fs',
    './utils/uuid': 'blob-util-test:uuid',
    './class/ReactNativeBlobUtilBlobResponse': 'blob-util-test:response',
    'react-native': 'blob-util-test:react-native',
    './codegenSpecs/NativeBlobUtils': 'blob-util-test:codegen',
};
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier in fakeModules) return {url: specifier, shortCircuit: true};
        if (context.parentURL === fetchURL) {
            return {url: replacements[specifier] || new URL(specifier + '.js', fetchURL).href, shortCircuit: true};
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url === fetchURL) {
            return {format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')), shortCircuit: true};
        }
        if (url in fakeModules) return {format: 'module', source: fakeModules[url], shortCircuit: true};
        return nextLoad(url, context);
    },
});
after(() => hooks.deregister());
const {fetch} = await import(fetchURL);
const native = await import(nativeURL);
beforeEach(() => {
    native.reset();
    assert.equal(native.listenerCount('ReactNativeBlobUtilMessage'), 1);
});
const request = (body) => fetch('POST', 'https://example.test/upload', {}, body);
const complete = (entry, error = null) => entry.callback(error, 'utf8', 'done', {status: 200});

for (const body of ['text', [{name: 'field', data: 'value'}]]) {
    test(`completion removes all listeners for ${Array.isArray(body) ? 'multipart' : 'single'} requests`, async () => {
        for (let i = 0; i < 3; i++) {
            const task = request(body);
            assert.equal(native.listenerCount(), 5);
            complete(native.requests[i]);
            assert.equal((await task).data, 'done');
            assert.equal(native.listenerCount(), 0);
        }
    });
}

test('an error removes every task listener', async () => {
    const task = request('text');
    complete(native.requests[0], 'failed');
    await assert.rejects(task, /failed/);
    assert.equal(native.listenerCount(), 0);
});

test('cancelling removes every listener before any native completion callback', async () => {
    const task = request('text');
    const rejected = assert.rejects(task, {name: 'ReactNativeBlobUtilCanceledFetch'});
    task.cancel();
    await rejected;
    assert.deepEqual(native.cancellations, [task.taskId]);
    assert.equal(native.listenerCount(), 0);
    // Native may still deliver its completion after cancellation.
    complete(native.requests[0]);
    assert.equal(native.listenerCount(), 0);
});

test('settling one task preserves another task and its progress/expiry callbacks', async () => {
    const first = request('first');
    const second = request('second');
    const progress = [];
    const expired = [];
    second.progress((written, total) => progress.push([written, total]));
    second.expire((event) => expired.push(event.taskId));
    assert.equal(native.listenerCount(), 10);
    complete(native.requests[0]);
    await first;
    assert.equal(native.listenerCount(), 5);
    native.emit('ReactNativeBlobUtilProgress', {taskId: first.taskId, written: 1, total: 2});
    native.emit('ReactNativeBlobUtilExpire', {taskId: first.taskId});
    assert.deepEqual(progress, []);
    assert.deepEqual(expired, []);
    native.emit('ReactNativeBlobUtilProgress', JSON.stringify({taskId: second.taskId, written: '1', total: '2'}));
    native.emit('ReactNativeBlobUtilExpire', JSON.stringify({taskId: second.taskId}));
    assert.deepEqual(progress, [[1, 2]]);
    assert.deepEqual(expired, [second.taskId]);
    complete(native.requests[1]);
    await second;
    assert.equal(native.listenerCount(), 0);
});

test('keeps the module message listener after request cleanup', async () => {
    const task = request('text');
    complete(native.requests[0]);
    await task;
    assert.equal(native.listenerCount('ReactNativeBlobUtilMessage'), 1);
});
