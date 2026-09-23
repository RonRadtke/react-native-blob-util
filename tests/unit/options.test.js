/**
 * 1.0: every call that took positional flags also takes one options object,
 * `mime` is the key for a MIME type everywhere, and config groups the
 * platform-only options. The positional forms and the old keys keep working.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
const record = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve(result);
};

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    readFile: record('readFile', 'text'),
    writeFile: record('writeFile', 4),
    writeFileArray: record('writeFileArray', 2),
    createFile: record('createFile', null),
    writeStream: record('writeStream', 'stream-1'),
    readStream: (...args) => calls.push(['readStream', ...args]),
    getContentIntent: record('getContentIntent', 'content://picked'),
    createMediaFile: record('createMediaFile', 'content://media/1'),
    copyToMediaStore: record('copyToMediaStore', 'content://media/2'),
    getBlob: record('getBlob', 'blob'),
    fetchBlob(options, taskId, method, url, headers, body, callback) {
        calls.push(['fetchBlob', options]);
        callback(null, 'utf8', 'ok', {status: 200});
    },
});

const {default: fs} = await import('../../fs.js');
const {default: open} = await import('../../open.js');
const {default: media} = await import('../../media.js');
const {config} = await import('../../fetch.js');

test.beforeEach(() => {
    calls.length = 0;
    rn.setPlatform('android');
});

test('readFile, writeFile, appendFile and createFile take {encoding, transform}', async () => {
    await fs.readFile('/docs/a', {encoding: 'base64', transform: true});
    await fs.readFile('/docs/a', 'base64', {transform: true});
    await fs.writeFile('/docs/a', 'AAEC', {encoding: 'base64', transform: true});
    await fs.appendFile('/docs/a', [1, 2], {encoding: 'ascii'});
    await fs.createFile('/docs/b', 'AAEC', {encoding: 'base64'});
    await fs.readFile('/docs/a', {});
    assert.deepEqual(calls, [
        ['readFile', '/docs/a', 'base64', true],
        ['readFile', '/docs/a', 'base64', true],
        ['writeFile', '/docs/a', 'base64', 'AAEC', true, false],
        ['writeFileArray', '/docs/a', [1, 2], true],
        ['createFile', '/docs/b', 'AAEC', 'base64'],
        // No encoding in the object means utf8, as without it.
        ['readFile', '/docs/a', 'utf8', false],
    ]);
});

test('an invalid encoding in an options object rejects like a positional one', async () => {
    await assert.rejects(fs.readFile('/docs/a', {encoding: 'latin1'}), {code: 'EINVAL'});
    assert.deepEqual(calls, []);
});

test('readStream and writeStream take {encoding, bufferSize, tick} and {encoding, append}', async () => {
    const reader = await fs.readStream('/docs/a', {encoding: 'base64', bufferSize: 3000, tick: 5});
    assert.deepEqual([reader.encoding, reader.bufferSize, reader.tick], ['base64', 3000, 5]);
    const writer = await fs.writeStream('/docs/b', {encoding: 'ascii', append: true});
    assert.deepEqual([writer.encoding, writer.append], ['ascii', true]);
    assert.deepEqual(calls, [['writeStream', '/docs/b', 'ascii', true]]);
});

test('open.pick takes {mime}', async () => {
    await open.pick({mime: 'image/*'});
    await open.pick('text/*');
    await open.pick();
    assert.deepEqual(calls.map((c) => c[1]), ['image/*', 'text/*', '*/*']);
});

test('media descriptors take mime as well as mimeType', async () => {
    await media.createFile({name: 'a.png', mime: 'image/png'}, 'Image');
    await media.copyToMediaStore({name: 'b.png', mimeType: 'image/png'}, 'Image', '/docs/b.png');
    assert.equal(calls[0][1].mimeType, 'image/png');
    assert.equal(calls[1][1].mimeType, 'image/png');
});

test('media.read takes {encoding} and rejects an unknown encoding like fs.readFile', async () => {
    await media.read('content://x', {encoding: 'base64'});
    await assert.rejects(media.read('content://x', 'latin1'), {code: 'EINVAL'});
    assert.deepEqual(calls, [['getBlob', 'content://x', 'base64']]);
});

test('config groups the platform options, and the old flat keys still work', async () => {
    await config({transform: true, android: {downloadManager: {useDownloadManager: true}, wifiOnly: true, targetHostIp: '10.0.0.1'}, ios: {backgroundTask: true}}).fetch('GET', 'https://example.com');
    await config({transformFile: true, addAndroidDownloads: {useDownloadManager: true}, wifiOnly: true, targetHostIp: '10.0.0.1', IOSBackgroundTask: true}).fetch('GET', 'https://example.com');
    const expected = {transformFile: true, addAndroidDownloads: {useDownloadManager: true}, wifiOnly: true, targetHostIp: '10.0.0.1', IOSBackgroundTask: true};
    assert.deepEqual(calls[0][1], expected);
    assert.deepEqual(calls[1][1], expected);
});
