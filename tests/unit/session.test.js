/**
 * Sessions: named lists of files that dispose() removes together.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const removed = [];
let fail = null;
rn.setNativeModule({
    getConstants: () => ({}),
    removeSession: (paths) => {
        removed.push(paths);
        return fail ? Promise.reject(Object.assign(new Error(fail), {code: 'EUNSPECIFIED'})) : Promise.resolve();
    },
});

const {default: ReactNativeBlobUtil} = await import('../../index.js');

test('dispose removes every file of the session and forgets it', async () => {
    const session = ReactNativeBlobUtil.session('cache').add('/a').add('/b');
    assert.deepEqual(session.list(), ['/a', '/b']);
    await session.dispose();
    assert.deepEqual(removed, [['/a', '/b']]);
    assert.equal(ReactNativeBlobUtil.fs.ReactNativeBlobUtilSession.getSession('cache'), undefined);
});

test('a failed dispose rejects with the native code and keeps the session', async () => {
    const session = ReactNativeBlobUtil.session('other').add('/c');
    fail = 'Failed to delete: /c';
    await assert.rejects(session.dispose(), {code: 'EUNSPECIFIED', message: 'Failed to delete: /c'});
    assert.deepEqual(session.list(), ['/c']);
});
