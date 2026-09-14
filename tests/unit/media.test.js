/**
 * ReactNativeBlobUtil.media: the device's media library, Android only.
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
    getConstants: () => ({}),
    createMediaFile: record('createMediaFile', 'content://media/1'),
    writeToMediaFile: record('writeToMediaFile', 'Success'),
    copyToMediaStore: record('copyToMediaStore', 'content://media/2'),
    copyToInternal: record('copyToInternal', '/docs/copy'),
    getBlob: record('getBlob', [104, -61, -87]),
    addCompleteDownload: record('addCompleteDownload', null),
    scanFile: record('scanFile', null),
    getSDCardDir: record('getSDCardDir', '/sdcard'),
    getSDCardApplicationDir: record('getSDCardApplicationDir', '/sdcard/app'),
});

const {default: media} = await import('../../media.js');

test.beforeEach(() => {
    rn.setPlatform('android');
    calls.length = 0;
});

test('createFile and copyToMediaStore default parentFolder and resolve the content URI', async () => {
    assert.equal(await media.createFile({name: 'a.png', mimeType: 'image/png'}, 'Image'), 'content://media/1');
    assert.equal(await media.copyToMediaStore({name: 'a.png', mimeType: 'image/png', parentFolder: 'shots'}, 'Download', '/a.png'), 'content://media/2');
    assert.deepEqual(calls, [
        ['createMediaFile', {name: 'a.png', mimeType: 'image/png', parentFolder: ''}, 'Image'],
        ['copyToMediaStore', {name: 'a.png', mimeType: 'image/png', parentFolder: 'shots'}, 'Download', '/a.png'],
    ]);
});

test('write passes the transform flag and resolves undefined', async () => {
    assert.equal(await media.write('content://media/1', '/a.png'), undefined);
    await media.write('content://media/1', '/a.png', {transform: true});
    assert.deepEqual(calls, [
        ['writeToMediaFile', 'content://media/1', '/a.png', false],
        ['writeToMediaFile', 'content://media/1', '/a.png', true],
    ]);
});

test('read returns text or bytes 0..255', async () => {
    assert.deepEqual(await media.read('content://media/1', 'ascii'), [104, 195, 169]);
    await media.read('content://media/1');
    assert.deepEqual(calls.map((c) => c[2]), ['ascii', 'utf8']);
});

test('addDownload, scan and the SD card directories', async () => {
    assert.equal(await media.addDownload({title: 't', path: '/p', mime: 'text/plain'}), undefined);
    assert.equal(await media.scan([{path: '/p'}]), undefined);
    await assert.rejects(media.scan(), {code: 'EINVAL'});
    assert.equal(await media.sdCardDir(), '/sdcard');
    assert.equal(await media.sdCardApplicationDir(), '/sdcard/app');
    assert.deepEqual(calls.map((c) => c[0]), ['addCompleteDownload', 'scanFile', 'getSDCardDir', 'getSDCardApplicationDir']);
});

test('every media call rejects with ENOTSUP on iOS and Windows', async () => {
    for (const platform of ['ios', 'windows']) {
        rn.setPlatform(platform);
        for (const call of [
            () => media.createFile({name: 'a', mimeType: 'x/y'}, 'Image'),
            () => media.write('u', '/p'),
            () => media.copyToMediaStore({name: 'a', mimeType: 'x/y'}, 'Image', '/p'),
            () => media.copyToInternal('u', '/p'),
            () => media.read('u'),
            () => media.addDownload({}),
            () => media.scan([]),
            () => media.sdCardDir(),
            () => media.sdCardApplicationDir(),
        ]) {
            await assert.rejects(call, (err) => err.code === 'ENOTSUP' && /Android/.test(err.message));
        }
    }
    assert.deepEqual(calls, []);
});
