/**
 * Platform-specific APIs: where they live, and that calling one on another
 * platform rejects with an Error carrying ENOTSUP instead of a bare string
 * or a call that never settles (audit #2, #10, #11, #19).
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
    actionViewIntent: record('actionViewIntent', null),
    getContentIntent: record('getContentIntent', 'content://x'),
    addCompleteDownload: record('addCompleteDownload', null),
    getSDCardDir: record('getSDCardDir', '/sdcard'),
    getSDCardApplicationDir: record('getSDCardApplicationDir', '/sdcard/app'),
    scanFile: (pairs) => { calls.push(['scanFile', pairs]); return Promise.resolve(); },
    presentOptionsMenu: record('presentOptionsMenu', [null]),
    presentOpenInMenu: record('presentOpenInMenu', [null]),
    presentPreview: record('presentPreview', [null]),
    excludeFromBackupKey: record('excludeFromBackupKey', [null]),
    pathForAppGroup: record('pathForAppGroup', '/groups/g'),
    syncPathAppGroup: (name) => { calls.push(['syncPathAppGroup', name]); return '/groups/g'; },
    createMediaFile: record('createMediaFile', 'content://media/1'),
    writeToMediaFile: record('writeToMediaFile', 'Success'),
    copyToInternal: record('copyToInternal', '/docs/x'),
    getBlob: record('getBlob', []),
    copyToMediaStore: record('copyToMediaStore', 'content://media/2'),
});

const {default: ReactNativeBlobUtil} = await import('../../index.js');
const {android, ios, fs, MediaCollection} = ReactNativeBlobUtil;

const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(' '));
test.after(() => {
    console.warn = originalWarn;
});

test.beforeEach(() => {
    calls.length = 0;
    warnings.length = 0;
});

const ANDROID_ONLY = {
    actionViewIntent: () => android.actionViewIntent('/a', 'text/plain'),
    getContentIntent: () => android.getContentIntent('*/*'),
    addCompleteDownload: () => android.addCompleteDownload({}),
    getSDCardDir: () => android.getSDCardDir(),
    getSDCardApplicationDir: () => android.getSDCardApplicationDir(),
    scanFile: () => android.scanFile([{path: '/a'}]),
    'MediaCollection.createMediaFile': () => MediaCollection.createMediaFile({name: 'a', mimeType: 'x/y'}, 'Image'),
    'MediaCollection.writeToMediaFile': () => MediaCollection.writeToMediaFile('content://1', '/a'),
    'MediaCollection.writeToMediaFileWithTransform': () => MediaCollection.writeToMediaFileWithTransform('content://1', '/a'),
    'MediaCollection.copyToInternal': () => MediaCollection.copyToInternal('content://1', '/a'),
    'MediaCollection.getBlob': () => MediaCollection.getBlob('content://1', 'base64'),
    'MediaCollection.copyToMediaStore': () => MediaCollection.copyToMediaStore({name: 'a', mimeType: 'x/y'}, 'Image', '/a'),
};

const IOS_ONLY = {
    presentOptionsMenu: () => ios.presentOptionsMenu('/a'),
    presentOpenInMenu: () => ios.presentOpenInMenu('/a'),
    presentPreview: () => ios.presentPreview('/a'),
    excludeFromBackupKey: () => ios.excludeFromBackupKey('/a'),
    pathForAppGroup: () => ios.pathForAppGroup('group.x'),
};

test('Android-only calls reach native on Android and reject with ENOTSUP elsewhere', async () => {
    for (const platform of ['ios', 'windows']) {
        rn.setPlatform(platform);
        for (const [name, call] of Object.entries(ANDROID_ONLY)) {
            await assert.rejects(call, (err) => err instanceof Error && err.code === 'ENOTSUP' && /Android/.test(err.message), `${name} on ${platform}`);
        }
        assert.deepEqual(calls, [], `nothing reached native on ${platform}`);
    }

    rn.setPlatform('android');
    for (const call of Object.values(ANDROID_ONLY)) {
        await call();
    }
    assert.equal(calls.length, Object.keys(ANDROID_ONLY).length);
});

test('iOS-only calls reach native on iOS and reject with ENOTSUP elsewhere', async () => {
    for (const platform of ['android', 'windows']) {
        rn.setPlatform(platform);
        for (const [name, call] of Object.entries(IOS_ONLY)) {
            await assert.rejects(call, (err) => err instanceof Error && err.code === 'ENOTSUP' && /iOS/.test(err.message), `${name} on ${platform}`);
        }
        assert.equal(ios.syncPathAppGroup('group.x'), '', `syncPathAppGroup on ${platform}`);
        assert.deepEqual(calls, [], `nothing reached native on ${platform}`);
    }

    rn.setPlatform('ios');
    for (const call of Object.values(IOS_ONLY)) {
        await call();
    }
    assert.equal(ios.syncPathAppGroup('group.x'), '/groups/g');
    assert.equal(calls.length, Object.keys(IOS_ONLY).length + 1);
});

test('the fs aliases of platform calls still work, warn once, and are the same functions', async () => {
    rn.setPlatform('android');
    await fs.scanFile([{path: '/a'}]);
    await fs.scanFile([{path: '/b'}]);
    assert.deepEqual(calls.map((c) => c[0]), ['scanFile', 'scanFile']);

    rn.setPlatform('ios');
    assert.equal(await fs.pathForAppGroup('group.x'), '/groups/g');
    assert.equal(fs.syncPathAppGroup('group.x'), '/groups/g');

    const deprecations = warnings.filter((w) => /deprecated/i.test(w));
    assert.equal(deprecations.length, 3, 'one warning per alias, not per call');
    assert.match(deprecations[0], /fs\.scanFile.*media\.scan/);
});

test('the ios.js legacy aliases point at what their names say (audit #11)', async () => {
    rn.setPlatform('ios');
    await ios.openDocument('/a.pdf');
    await ios.previewDocument('/a.pdf');
    assert.deepEqual(calls.map((c) => c[0]), ['presentOptionsMenu', 'presentPreview']);
    assert.equal(warnings.filter((w) => /deprecated/i.test(w)).length, 2);
});

test('MediaCollection has correctly cased names and keeps the old ones as deprecated aliases (audit #19)', async () => {
    rn.setPlatform('android');
    await MediaCollection.createMediaFile({name: 'a', mimeType: 'x/y'}, 'Image');
    await MediaCollection.createMediafile({name: 'a', mimeType: 'x/y'}, 'Image');
    await MediaCollection.writeToMediafile('content://1', '/a');
    await MediaCollection.writeToMediafileWithTransform('content://1', '/a');

    assert.deepEqual(calls.map((c) => c[0]), ['createMediaFile', 'createMediaFile', 'writeToMediaFile', 'writeToMediaFile']);
    assert.deepEqual(calls[2].slice(1), ['content://1', '/a', false]);
    assert.deepEqual(calls[3].slice(1), ['content://1', '/a', true]);
    // The properly cased names already warned earlier in this file; the three old spellings warn here.
    assert.equal(warnings.filter((w) => /deprecated/i.test(w)).length, 3);
});

test('a cancelled fetch rejects with CanceledFetchError carrying ECANCELED, exported by name (audit #22)', async () => {
    const {CanceledFetchError} = await import('../../index.js');
    assert.equal(CanceledFetchError, ReactNativeBlobUtil.CanceledFetchError);
    const err = new CanceledFetchError('canceled');
    assert.equal(err.code, 'ECANCELED');
    assert.equal(err.name, 'ReactNativeBlobUtilCanceledFetch');
    assert.equal(err instanceof Error, true);
});
