/**
 * FetchBlobResponse: the accessors that convert a response held as utf8
 * text, a base64 string or a file path.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

// What the fake native readFile returns for a base64 read. The module is looked
// up once and kept, so a test changes this rather than registering a new fake.
let fileBase64 = 'aGk=';

rn.setNativeModule({
    getConstants: () => ({DocumentDir: '/docs'}),
    readFile: (path, encoding) => Promise.resolve(encoding === 'ascii' ? [104, 105] : fileBase64),
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

// A body held as base64 or in a file is bytes, and text() has to decode them as
// UTF-8. It decoded one character per byte, so é came back as Ã©.
test('text() and json() decode UTF-8 for base64 and file bodies', async () => {
    const text = 'héllo € 😀';
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    assert.equal(await new FetchBlobResponse('t', info('base64'), b64).text(), text);
    fileBase64 = b64;
    try {
        assert.equal(await new FetchBlobResponse('t', info('path'), '/docs/f').text(), text);
    } finally {
        fileBase64 = 'aGk=';
    }

    const json = Buffer.from(JSON.stringify({name: text}), 'utf8').toString('base64');
    assert.deepEqual(await new FetchBlobResponse('t', info('base64'), json).json(), {name: text});
});

test('text() keeps an embedded NUL and replaces invalid UTF-8 with U+FFFD', async () => {
    const bytes = Buffer.from([0x61, 0x00, 0x62, 0xff, 0xc3, 0x28, 0xe2, 0x82]);
    const res = new FetchBlobResponse('t', info('base64'), bytes.toString('base64'));
    // What TextDecoder (and Node's utf8 decoder) produce for the same bytes.
    assert.equal(await res.text(), new TextDecoder().decode(bytes));
});

test('text() and json() drop a leading byte order mark, as fetch does', async () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":"é"}', 'utf8')]).toString('base64');
    assert.deepEqual(await new FetchBlobResponse('t', info('base64'), withBom).json(), {a: 'é'});
    assert.deepEqual(await new FetchBlobResponse('t', info('utf8'), '﻿{"a":1}').json(), {a: 1});
});

test('base64() of a utf8 body encodes its UTF-8 bytes', async () => {
    const text = 'héllo € 😀';
    assert.equal(await new FetchBlobResponse('t', info('utf8'), text).base64(), Buffer.from(text, 'utf8').toString('base64'));
});

test('flush() is a Promise whether or not there is a file', async () => {
    assert.equal(await new FetchBlobResponse('t', info('utf8'), 'x').flush(), undefined);
});
