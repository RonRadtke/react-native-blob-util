/**
 * ReactNativeBlobUtil.open: one namespace for showing a file in another app
 * and picking one, dispatched per platform.
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
    actionViewIntent: record('actionViewIntent', true),
    pickFiles: (options) => {
        calls.push(['pickFiles', options]);
        return Promise.resolve(picked);
    },
    presentPreview: record('presentPreview', [null]),
    presentOpenInMenu: record('presentOpenInMenu', [null]),
    presentOptionsMenu: record('presentOptionsMenu', [null]),
});

let picked = ['content://picked'];

const {default: open} = await import('../../open.js');

test.beforeEach(() => {
    calls.length = 0;
    picked = ['content://picked'];
});

test('open.file shows a view intent on Android and a preview on iOS, resolving undefined', async () => {
    rn.setPlatform('android');
    assert.equal(await open.file('/a.pdf', {mime: 'application/pdf'}), undefined);
    rn.setPlatform('ios');
    assert.equal(await open.file('/a.pdf', {scheme: 'myapp'}), undefined);

    assert.deepEqual(calls, [
        ['actionViewIntent', '/a.pdf', 'application/pdf', null],
        ['presentPreview', 'file:///a.pdf', 'myapp'],
    ]);
});

test('open.chooser shows an app chooser on Android and the open-in menu on iOS', async () => {
    rn.setPlatform('android');
    await open.chooser('/a.pdf', {mime: 'application/pdf', title: 'Send to'});
    await open.chooser('/a.pdf');
    rn.setPlatform('ios');
    await open.chooser('/a.pdf');

    assert.deepEqual(calls, [
        ['actionViewIntent', '/a.pdf', 'application/pdf', 'Send to'],
        ['actionViewIntent', '/a.pdf', '', 'Open with'],
        ['presentOpenInMenu', 'file:///a.pdf', undefined],
    ]);
});

test('open.optionsMenu is iOS only; open.pick works on every platform', async () => {
    rn.setPlatform('ios');
    await open.optionsMenu('/a.pdf');

    for (const platform of ['android', 'ios', 'windows']) {
        rn.setPlatform(platform);
        assert.equal(await open.pick('image/*'), 'content://picked', platform);
    }
    rn.setPlatform('android');
    assert.equal(await open.pick(), 'content://picked');
    await assert.rejects(open.optionsMenu('/a.pdf'), {code: 'ENOTSUP'});

    const one = (mime) => ['pickFiles', {mime, multiple: false}];
    assert.deepEqual(calls.slice(0, 3), [
        ['presentOptionsMenu', 'file:///a.pdf', undefined],
        one(['image/*']), one(['image/*']),
    ]);
    assert.equal(calls[3][1].extensions.includes('.png'), true, 'Windows gets extensions');
    assert.deepEqual(calls[4], one(['*/*']));
});

test('open.pick takes several MIME types and returns a list with multiple', async () => {
    rn.setPlatform('android');
    picked = ['content://a', 'content://b'];
    assert.deepEqual(await open.pick({mime: ['image/png', 'application/pdf'], multiple: true}), ['content://a', 'content://b']);
    assert.equal(await open.pick(['image/png', 'application/pdf']), 'content://a', 'a list of types alone picks one file');
    assert.deepEqual(calls, [
        ['pickFiles', {mime: ['image/png', 'application/pdf'], multiple: true}],
        ['pickFiles', {mime: ['image/png', 'application/pdf'], multiple: false}],
    ]);
});

test('a cancelled pick resolves null, or [] with multiple', async () => {
    rn.setPlatform('ios');
    picked = [];
    assert.equal(await open.pick(), null);
    assert.deepEqual(await open.pick({multiple: true}), []);
});

test('open.pick rejects a malformed MIME type with EINVAL before native', async () => {
    rn.setPlatform('android');
    for (const mime of ['image', [], ['image/png', 3], 'image/ png', {}]) {
        await assert.rejects(open.pick({mime}), {code: 'EINVAL'}, JSON.stringify(mime));
    }
    assert.deepEqual(calls, []);
});

test('the Windows picker gets the extensions of the MIME types', async () => {
    const {extensionsForMime} = await import('../../utils/mime.js');
    assert.deepEqual(extensionsForMime(['application/pdf']), ['.pdf']);
    assert.deepEqual(extensionsForMime(['image/jpeg', 'application/PDF; charset=x']), ['.jpg', '.jpeg', '.pdf']);
    assert.deepEqual(extensionsForMime(['*/*']), ['*']);
    assert.deepEqual(extensionsForMime(['image/png', 'application/x-unknown']), ['*'], 'an unknown type offers every file');
    const images = extensionsForMime(['image/*']);
    assert.ok(images.includes('.png') && images.includes('.jpg') && !images.includes('.pdf'));
    assert.ok(extensionsForMime(['text/*']).includes('.txt'));

    rn.setPlatform('windows');
    await open.pick({mime: ['application/pdf', 'text/plain'], multiple: true});
    assert.deepEqual(calls, [['pickFiles', {mime: ['application/pdf', 'text/plain'], multiple: true, extensions: ['.pdf', '.txt']}]]);
});

test('on Windows every open call but pick rejects with ENOTSUP without reaching native', async () => {
    rn.setPlatform('windows');
    for (const call of [() => open.file('/a'), () => open.chooser('/a'), () => open.optionsMenu('/a')]) {
        await assert.rejects(call, {code: 'ENOTSUP'});
    }
    assert.deepEqual(calls, []);
});

test('a missing path is EINVAL', async () => {
    rn.setPlatform('android');
    await assert.rejects(open.file(), {code: 'EINVAL'});
    await assert.rejects(open.chooser(undefined), {code: 'EINVAL'});
    assert.deepEqual(calls, []);
});

test('a path that already is a file URL is not prefixed again on iOS', async () => {
    rn.setPlatform('ios');
    await open.file('file:///a.pdf');
    await open.chooser('/b.pdf');
    assert.deepEqual(calls.map((c) => c[1]), ['file:///a.pdf', 'file:///b.pdf']);
});
