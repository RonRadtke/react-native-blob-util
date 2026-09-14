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

test('events for other streams are ignored', async () => {
    const stream = await fs.readStream('/a', 'utf8');
    const done = collect(stream);
    const [, , , , streamId] = calls[0];

    rn.emit('ReactNativeBlobUtilFilesystem', {streamId: 'RNFBRSother', event: 'data', detail: 'not mine'});
    rn.emit('ReactNativeBlobUtilFilesystem', {streamId, event: 'end', detail: ''});

    assert.deepEqual(await done, []);
});
