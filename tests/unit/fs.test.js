/**
 * The fs wrappers' argument handling: what they reject, what they never let
 * reach native, and that every failure is a rejection rather than a throw.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
const resolving = (name) => (...args) => {
    calls.push({name, args});
    return Promise.resolve(`${name} result`);
};

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    readFile: resolving('readFile'),
    writeFile: resolving('writeFile'),
    writeFileArray: resolving('writeFileArray'),
    createFile: resolving('createFile'),
    createFileASCII: resolving('createFileASCII'),
    readStream: (...args) => calls.push({name: 'readStream', args}),
    writeStream: (path, encoding, append, callback) => {
        calls.push({name: 'writeStream', args: [path, encoding, append]});
        callback(null, null, 'stream-1');
    },
});

const {default: fs} = await import('../../fs.js');

test.beforeEach(() => {
    calls.length = 0;
});

test('appendFile rejects, rather than throws, for non-string data (audit #3)', async () => {
    let task;
    assert.doesNotThrow(() => {
        task = fs.appendFile('/docs/a.txt', 123);
    });
    await assert.rejects(task, {code: 'EINVAL'});
    assert.deepEqual(calls, []);
});

test('a null encoding means utf8 instead of throwing (audit #3)', async () => {
    await fs.writeFile('/docs/a.txt', 'x', null);
    await fs.writeFileWithTransform('/docs/a.txt', 'x', null);
    await fs.appendFile('/docs/a.txt', 'x', null);
    await fs.readFile('/docs/a.txt', null);

    assert.deepEqual(calls.map((c) => c.args[1]), ['utf8', 'utf8', 'utf8', 'utf8']);
});

test('an encoding native does not know is rejected here, not left to hang (audit #2)', async () => {
    for (const call of [
        () => fs.readFile('/docs/a', 'latin1'),
        () => fs.readFileWithTransform('/docs/a', 'hex'),
        () => fs.writeFile('/docs/a', 'x', 'latin1'),
        () => fs.writeFileWithTransform('/docs/a', 'x', 'latin1'),
        () => fs.appendFile('/docs/a', 'x', 'latin1'),
        () => fs.createFile('/docs/a', 'x', 'latin1'),
        () => fs.writeStream('/docs/a', 'latin1'),
        () => fs.readStream('/docs/a', 'latin1'),
    ]) {
        await assert.rejects(call, {code: 'EINVAL'});
    }
    assert.deepEqual(calls, []);
});

test('uri is a write encoding but not a read encoding', async () => {
    await fs.writeFile('/docs/a', 'file:///tmp/src', 'uri');
    await fs.createFile('/docs/b', 'file:///tmp/src', 'uri');
    assert.deepEqual(calls.map((c) => c.name), ['writeFile', 'createFile']);

    await assert.rejects(() => fs.readFile('/docs/a', 'uri'), {code: 'EINVAL'});
});

test('encodings are matched case-insensitively', async () => {
    await fs.readFile('/docs/a', 'UTF8');
    await fs.writeFile('/docs/a', [1, 2], 'ASCII');
    assert.deepEqual(calls.map((c) => c.name), ['readFile', 'writeFileArray']);
});

test('readStream and writeStream resolve stream objects for valid encodings', async () => {
    const reader = await fs.readStream('/docs/a', 'base64');
    assert.equal(reader.encoding, 'base64');

    const writer = await fs.writeStream('/docs/a', 'ascii', true);
    assert.equal(writer.id, 'stream-1');
    assert.deepEqual(calls.at(-1).args, ['/docs/a', 'ascii', true]);
});
