/**
 * ReactNativeBlobUtilReadStream: the events it turns into onData/onEnd/onError
 * calls, and what it does to the chunks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
rn.setNativeModule({
    getConstants: () => ({}),
    readStream: (...args) => calls.push(args),
});

const {default: fs} = await import('../../fs.js');

function collect(stream) {
    const chunks = [];
    const done = new Promise((resolve, reject) => {
        stream.onData((chunk) => chunks.push(chunk));
        stream.onEnd(() => resolve(chunks));
        stream.onError(reject);
    });
    stream.open();
    return done;
}

test.beforeEach(() => {
    calls.length = 0;
});

test('ascii chunks arrive as bytes 0..255 whatever the platform sent', async () => {
    const stream = await fs.readStream('/a', 'ascii', 4);
    const done = collect(stream);
    const [, , , , streamId] = calls[0];

    rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'data', detail: [104, -61, -87, 0]});
    rn.emit('ReactNativeBlobUtilFilesystem', JSON.stringify({streamId, event: 'data', detail: [255, 65]}));
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'end', detail: ''});

    assert.deepEqual(await done, [[104, 195, 169, 0], [255, 65]]);
});

test('utf8 and base64 chunks pass through untouched', async () => {
    for (const encoding of ['utf8', 'base64']) {
        const stream = await fs.readStream('/a', encoding);
        const done = collect(stream);
        const [, , , , streamId] = calls.at(-1);
        rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'data', detail: 'chunk'});
        rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'end', detail: ''});
        assert.deepEqual(await done, ['chunk'], encoding);
    }
});

test('an error event rejects with its code and removes the listener', async () => {
    const stream = await fs.readStream('/a', 'utf8');
    const done = collect(stream);
    const [, , , , streamId] = calls[0];
    const before = rn.listenerCount('ReactNativeBlobUtilFilesystem');

    rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'error', code: 'ENOENT', detail: 'No such file'});

    await assert.rejects(done, {code: 'ENOENT', message: 'No such file'});
    assert.equal(rn.listenerCount('ReactNativeBlobUtilFilesystem'), before - 1);
    assert.equal(stream.closed, true);
});

test('the defaults are a 12288-byte buffer and a 10 ms tick (audit #18)', async () => {
    (await fs.readStream('/a', 'base64')).open();
    (await fs.readStream('/a', 'base64', 0, 0)).open();
    (await fs.readStream('/a', 'base64', 3000, 25)).open();

    assert.deepEqual(calls.map(([, , bufferSize, tick]) => [bufferSize, tick]), [[12288, 10], [12288, 10], [3000, 25]]);
    assert.equal(12288 % 3, 0, 'base64 chunks must not be padded mid-file');
});

test('events for other streams are ignored', async () => {
    const stream = await fs.readStream('/a', 'utf8');
    const done = collect(stream);
    const [, , , , streamId] = calls[0];

    rn.emit('ReactNativeBlobUtilFilesystem', {streamId: 'RNFBRSother', event: 'data', detail: 'not mine'});
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'end', detail: ''});

    assert.deepEqual(await done, []);
});

// 1.0: the native listener was added in the constructor, so a stream that was
// created and never opened left it behind for the life of the app.
test('the event listener exists only while the stream is open', async () => {
    // Earlier tests may leave a stream open, so count from here.
    const before = rn.listenerCount('ReactNativeBlobUtilFilesystem');
    const stream = await fs.readStream('/a', 'utf8');
    assert.equal(rn.listenerCount('ReactNativeBlobUtilFilesystem'), before);
    const done = stream.open();
    assert.equal(rn.listenerCount('ReactNativeBlobUtilFilesystem'), before + 1);
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId: calls[0][4], event: 'end', detail: ''});
    await done;
    assert.equal(rn.listenerCount('ReactNativeBlobUtilFilesystem'), before);
});

// open() returned nothing and an error without onError was dropped: the
// default handler was a no-op, so the "throw" branch never ran.
test('open() resolves at the end and rejects with the error, onError or not', async () => {
    const ok = await fs.readStream('/a', 'utf8');
    const ended = ok.open();
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId: calls[0][4], event: 'end', detail: ''});
    assert.equal(await ended, undefined);

    const failing = await fs.readStream('/b', 'utf8');
    const failed = failing.open();
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId: calls[1][4], event: 'error', code: 'ENOENT', detail: 'No such file'});
    await assert.rejects(failed, {code: 'ENOENT', message: 'No such file'});
});

test('readStream with an empty path rejects EINVAL instead of throwing', async () => {
    let task;
    assert.doesNotThrow(() => {
        task = fs.readStream('', 'utf8');
    });
    await assert.rejects(task, {code: 'EINVAL'});
});
