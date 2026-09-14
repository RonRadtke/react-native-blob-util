/**
 * The loader harness itself: the package's Flow-annotated ES modules load
 * under node, `react-native` is the fake, and nothing reaches native until a
 * call needs it. Every other unit test of package code relies on this.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

test('package files load with their Flow syntax stripped', async () => {
    const {default: fs} = await import('../../fs.js');
    assert.equal(typeof fs.readFile, 'function');
    assert.equal(typeof fs.dirs, 'object');
});

test('importing the package does not touch native', async () => {
    rn.setNativeModule(null);
    const {default: ReactNativeBlobUtil} = await import('../../index.js');
    assert.equal(typeof ReactNativeBlobUtil.fetch, 'function');
});

test('native constants come from the fake module on first use', async () => {
    const {default: fs} = await import('../../fs.js');

    rn.setNativeModule(null);
    assert.throws(() => fs.dirs.DocumentDir, /native module is not available/);

    rn.setNativeModule({getConstants: () => ({DocumentDir: '/data/app/files'})});
    assert.equal(fs.dirs.DocumentDir, '/data/app/files');
});

test('Platform and events are driven by the test', async () => {
    const {Platform, NativeEventEmitter} = await import('react-native');

    rn.setPlatform('ios');
    assert.equal(Platform.OS, 'ios');

    const seen = [];
    const subscription = new NativeEventEmitter({}).addListener('ReactNativeBlobUtilState', (e) => seen.push(e));
    rn.emit('ReactNativeBlobUtilState', {taskId: 't1'});
    assert.equal(rn.listenerCount('ReactNativeBlobUtilState'), 1);
    subscription.remove();
    rn.emit('ReactNativeBlobUtilState', {taskId: 't2'});

    assert.deepEqual(seen, [{taskId: 't1'}]);
    assert.equal(rn.listenerCount('ReactNativeBlobUtilState'), 0);
});
