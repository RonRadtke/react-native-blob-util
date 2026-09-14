/**
 * ReactNativeBlobUtilWriteStream: chunks go to the right native method for
 * the encoding, and every native rejection reaches the caller with its code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
let fail = null;
const answer = (name) => (...args) => {
    calls.push([name, ...args]);
    return fail ? Promise.reject(Object.assign(new Error(fail.message), {code: fail.code})) : Promise.resolve();
};

rn.setNativeModule({
    getConstants: () => ({}),
    writeStream: (path, encoding, append) => { calls.push(['writeStream', path, encoding, append]); return Promise.resolve('stream-7'); },
    writeChunk: answer('writeChunk'),
    writeArrayChunk: answer('writeArrayChunk'),
    closeStream: answer('closeStream'),
});

const {default: fs} = await import('../../fs.js');

test.beforeEach(() => {
    calls.length = 0;
    fail = null;
});

test('a utf8 stream writes strings through writeChunk and closes', async () => {
    const stream = await fs.writeStream('/a.txt', 'utf8', true);
    assert.equal(stream.id, 'stream-7');
    assert.equal(stream.append, true);
    assert.equal(await stream.write('hello'), stream, 'write resolves the stream for chaining');
    await stream.close();
    assert.deepEqual(calls, [['writeStream', '/a.txt', 'utf8', true], ['writeChunk', 'stream-7', 'hello'], ['closeStream', 'stream-7']]);
});

test('an ascii stream writes byte arrays through writeArrayChunk and rejects other data', async () => {
    const stream = await fs.writeStream('/a.bin', 'ascii');
    await stream.write([1, 2, 3]);
    await assert.rejects(stream.write('not bytes'), {code: 'EINVAL'});
    assert.deepEqual(calls.at(-1), ['writeArrayChunk', 'stream-7', [1, 2, 3]]);
});

test('a write or close on an unknown stream rejects with the native code (audit #7)', async () => {
    const stream = await fs.writeStream('/a.txt', 'utf8');
    fail = {code: 'EBADF', message: "No such write stream 'stream-7'"};
    await assert.rejects(stream.write('x'), {code: 'EBADF'});
    await assert.rejects(stream.close(), {code: 'EBADF', message: "No such write stream 'stream-7'"});
});
