/**
 * utils/nativeModule.js: lazy resolution of the TurboModule and the
 * ReactNativeBlobUtilMessage diagnostic channel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const {getNativeModule, requireNativeModule, getEventEmitter} = await import('../../utils/nativeModule.js');

test('the module is looked up again until it is registered', () => {
    rn.setNativeModule(null);
    assert.equal(getNativeModule(), null);
    assert.throws(() => requireNativeModule(), /native module is not available/);

    const fake = {getConstants: () => ({})};
    rn.setNativeModule(fake);
    assert.equal(requireNativeModule(), fake);
});

test('a native "error" message is reported, not thrown from the listener (audit #3)', () => {
    rn.setNativeModule({getConstants: () => ({})});
    getEventEmitter();

    const reported = [];
    const original = console.error;
    console.error = (...args) => reported.push(args);
    try {
        assert.doesNotThrow(() => rn.emit('ReactNativeBlobUtilMessage', {event: 'error', detail: 'disk full'}));
        assert.doesNotThrow(() => rn.emit('ReactNativeBlobUtilMessage', JSON.stringify({event: 'error', detail: 'from ios'})));
    } finally {
        console.error = original;
    }

    assert.deepEqual(reported.map((args) => args.at(-1)), ['disk full', 'from ios']);
});

test('the message channel is subscribed exactly once', () => {
    rn.setNativeModule({getConstants: () => ({})});
    getEventEmitter();
    getEventEmitter();
    requireNativeModule();

    assert.equal(rn.listenerCount('ReactNativeBlobUtilMessage'), 1);
});
