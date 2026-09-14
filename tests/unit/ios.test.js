/**
 * ReactNativeBlobUtil.ios: the document menus and the iCloud backup flag.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
rn.setNativeModule({
    presentOptionsMenu: (...args) => { calls.push(['presentOptionsMenu', ...args]); return Promise.resolve([null]); },
    presentOpenInMenu: (...args) => { calls.push(['presentOpenInMenu', ...args]); return Promise.resolve([null]); },
    presentPreview: (...args) => { calls.push(['presentPreview', ...args]); return Promise.resolve([null]); },
    excludeFromBackupKey: (...args) => { calls.push(['excludeFromBackupKey', ...args]); return Promise.resolve([]); },
});

const {default: ios} = await import('../../ios.js');

test.beforeEach(() => {
    rn.setPlatform('ios');
    calls.length = 0;
});

test('the menus resolve undefined rather than the [null] iOS returns (audit #5)', async () => {
    assert.equal(await ios.presentOptionsMenu('/docs/a.pdf'), undefined);
    assert.equal(await ios.presentOpenInMenu('/docs/a.pdf', 'com.adobe.pdf'), undefined);
    assert.equal(await ios.presentPreview('/docs/a.pdf'), undefined);

    assert.deepEqual(calls.map((c) => c.slice(0, 2)), [
        ['presentOptionsMenu', 'file:///docs/a.pdf'],
        ['presentOpenInMenu', 'file:///docs/a.pdf'],
        ['presentPreview', 'file:///docs/a.pdf'],
    ]);
    assert.equal(calls[1][2], 'com.adobe.pdf');
});

test('excludeFromBackupKey resolves undefined (audit #5)', async () => {
    assert.equal(await ios.excludeFromBackupKey('/docs/a.pdf'), undefined);
    assert.deepEqual(calls, [['excludeFromBackupKey', 'file:///docs/a.pdf']]);
});
