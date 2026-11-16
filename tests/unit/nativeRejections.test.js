/**
 * What a native promise rejects with reaches callers as an Error on every
 * platform. Windows rejects a TurboModule promise with a plain object,
 * {code, message}; Android and iOS with an Error. In a file of its own
 * because utils/nativeModule.js keeps the first module it finds.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const {requireNativeModule} = await import('../../utils/nativeModule.js');

test('a native rejection that is not an Error becomes one, with its fields', async () => {
    const plain = {code: 'ENOENT', message: 'No such file', userInfo: {path: '/a'}};
    const native = new Error('already an Error');
    rn.setNativeModule({
        getConstants: () => ({}),
        stat: () => Promise.reject(plain),
        hash: () => Promise.reject(native),
        exists: () => Promise.resolve({exists: true}),
        appGroupDirSync: () => '/group',
    });
    const module = requireNativeModule();

    const err = await module.stat('/a').catch((e) => e);
    assert.ok(err instanceof Error);
    assert.equal(err.code, 'ENOENT');
    assert.equal(err.message, 'No such file');
    assert.deepEqual(err.userInfo, {path: '/a'});
    // An Error passes through as it is; results and synchronous calls too.
    assert.equal(await module.hash('/a').catch((e) => e), native);
    assert.deepEqual(await module.exists('/a'), {exists: true});
    assert.equal(module.appGroupDirSync('g'), '/group');
});
