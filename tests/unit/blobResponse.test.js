/**
 * FetchBlobResponse: the accessors that convert a response held as utf8
 * text, a base64 string or a file path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    readFile: (path, encoding) => Promise.resolve(encoding === 'ascii' ? [104, 105] : 'aGk='),
});

const {FetchBlobResponse} = await import('../../class/ReactNativeBlobUtilBlobResponse.js');

const info = (rnfbEncode) => ({status: 200, headers: {'Content-Type': 'text/plain'}, rnfbEncode});

test('array() resolves the bytes for every response type (audit #2)', async () => {
    assert.deepEqual(await new FetchBlobResponse('t', info('utf8'), 'hi').array(), [104, 105]);
    assert.deepEqual(await new FetchBlobResponse('t', info('base64'), 'aGk=').array(), [104, 105]);
    assert.deepEqual(await new FetchBlobResponse('t', info('path'), '/docs/f').array(), [104, 105]);
});

test('array() encodes non-ASCII text as UTF-8', async () => {
    assert.deepEqual(await new FetchBlobResponse('t', info('utf8'), 'é').array(), [0xc3, 0xa9]);
});

test('text(), json() and base64() convert between the three types, always as Promises', async () => {
    const utf8 = new FetchBlobResponse('t', info('utf8'), '{"a":1}');
    assert.equal(utf8.text() instanceof Promise, true);
    assert.equal(await utf8.text(), '{"a":1}');
    assert.deepEqual(await utf8.json(), {a: 1});
    assert.equal(await utf8.base64(), 'eyJhIjoxfQ==');

    const b64 = new FetchBlobResponse('t', info('base64'), 'eyJhIjoxfQ==');
    assert.equal(await b64.text(), '{"a":1}');
    assert.deepEqual(await b64.json(), {a: 1});

    const path = new FetchBlobResponse('t', info('path'), '/docs/f');
    assert.equal(path.path(), '/docs/f');
    assert.equal(await path.base64(), 'aGk=');
    assert.equal(await path.text(), 'hi');
});

test('flush() is a Promise whether or not there is a file', async () => {
    assert.equal(await new FetchBlobResponse('t', info('utf8'), 'x').flush(), undefined);
});
