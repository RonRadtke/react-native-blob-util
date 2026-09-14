import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
rn.setNativeModule({
    createMediaFile: (fd, mediatype) => {
        calls.push({fd, mediatype});
        return Promise.resolve('content://media/1');
    },
});

const {default: MediaCollection} = await import('../../mediacollection.js');

test.beforeEach(() => {
    calls.length = 0;
});

test('createMediafile defaults a missing parentFolder to "" (audit #19)', async () => {
    const fd = {name: 'a.png', mimeType: 'image/png'};
    await MediaCollection.createMediafile(fd, 'Image');

    assert.deepEqual(calls[0].fd, {name: 'a.png', mimeType: 'image/png', parentFolder: ''});
    assert.equal(calls[0].mediatype, 'Image');
    assert.equal('parentFolder' in fd, false, 'the caller\'s object is not mutated');
});

test('createMediafile keeps a parentFolder that is given', async () => {
    await MediaCollection.createMediafile({name: 'a.png', mimeType: 'image/png', parentFolder: 'shots'}, 'Image');
    assert.equal(calls[0].fd.parentFolder, 'shots');
});
