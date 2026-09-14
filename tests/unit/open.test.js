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
    getContentIntent: record('getContentIntent', 'content://picked'),
    presentPreview: record('presentPreview', [null]),
    presentOpenInMenu: record('presentOpenInMenu', [null]),
    presentOptionsMenu: record('presentOptionsMenu', [null]),
});

const {default: open} = await import('../../open.js');

test.beforeEach(() => {
    calls.length = 0;
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

test('open.optionsMenu is iOS only and open.pick is Android only', async () => {
    rn.setPlatform('ios');
    await open.optionsMenu('/a.pdf');
    await assert.rejects(open.pick(), {code: 'ENOTSUP'});

    rn.setPlatform('android');
    assert.equal(await open.pick('image/*'), 'content://picked');
    assert.equal(await open.pick(), 'content://picked');
    await assert.rejects(open.optionsMenu('/a.pdf'), {code: 'ENOTSUP'});

    assert.deepEqual(calls, [
        ['presentOptionsMenu', 'file:///a.pdf', undefined],
        ['getContentIntent', 'image/*'],
        ['getContentIntent', '*/*'],
    ]);
});

test('on Windows every open call rejects with ENOTSUP without reaching native', async () => {
    rn.setPlatform('windows');
    for (const call of [() => open.file('/a'), () => open.chooser('/a'), () => open.optionsMenu('/a'), () => open.pick()]) {
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
