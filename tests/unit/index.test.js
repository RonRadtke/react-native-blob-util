/**
 * The package entry point: what the default export and the named exports
 * are, and that every one of them is defined at runtime.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

rn.setNativeModule(null);
const entry = await import('../../index.js');

test('the default export carries the public API and nothing that was removed', () => {
    const api = entry.default;
    assert.deepEqual(Object.keys(api).sort(), [
        'CanceledFetchError',
        'MediaCollection',
        'android',
        'base64',
        'config',
        'fetch',
        'fs',
        'ios',
        'media',
        'open',
        'session',
        'wrap',
    ]);
    for (const [name, value] of Object.entries(api)) {
        assert.notEqual(value, undefined, `${name} is defined`);
    }
});

test('every named export is defined at runtime (audit #15)', () => {
    const named = Object.fromEntries(Object.entries(entry).filter(([name]) => name !== 'default'));
    assert.deepEqual(Object.keys(named).sort(), [
        'CanceledFetchError',
        'FetchBlobResponse',
        'URIUtil',
        'base64',
        'config',
        'fetch',
        'fs',
        'getUUID',
        'media',
        'open',
        'session',
        'wrap',
    ]);
    for (const [name, value] of Object.entries(named)) {
        assert.notEqual(value, undefined, `${name} is defined`);
    }
    assert.equal(typeof entry.URIUtil.wrap, 'function');
});

// 1.0: import {fetch, fs} from 'react-native-blob-util' works, and gives the
// same functions as the default export, so the two styles can be mixed.
test('the named exports are the default export\'s members', () => {
    for (const name of ['fetch', 'config', 'fs', 'open', 'media', 'wrap', 'session', 'base64', 'CanceledFetchError']) {
        assert.equal(entry[name], entry.default[name], name);
    }
});

test('wrap() prefixes a path the way native expects', () => {
    assert.equal(entry.default.wrap('/docs/a.txt'), 'ReactNativeBlobUtil-file:///docs/a.txt');
    assert.equal(entry.default.wrap('content://media/1'), 'ReactNativeBlobUtil-content://content://media/1');
});
