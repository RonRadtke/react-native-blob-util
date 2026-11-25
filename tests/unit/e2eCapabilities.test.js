// Which device an e2e run drives. The Android driver takes the first device adb
// lists unless it is given a udid, so with two emulators attached a run could land
// on the wrong one.

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {buildCapabilities} = require('../e2e/appium/lib/capabilities');

const withEnv = (values, run) => {
    const before = {};
    for (const [name, value] of Object.entries(values)) {
        before[name] = process.env[name];
        if (value === undefined) {
            delete process.env[name];
        } else {
            process.env[name] = value;
        }
    }
    try {
        return run();
    } finally {
        for (const [name, value] of Object.entries(before)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
    }
};

test('ANDROID_UDID pins the Android run to one device', () => {
    const caps = withEnv(
        {E2E_APP_PATH: 'app-debug.apk', ANDROID_UDID: 'emulator-5556', IOS_UDID: undefined},
        () => buildCapabilities('android'),
    );
    assert.equal(caps['appium:udid'], 'emulator-5556');
});

test('without ANDROID_UDID the Android run names no device', () => {
    const caps = withEnv(
        {E2E_APP_PATH: 'app-debug.apk', ANDROID_UDID: undefined, IOS_UDID: 'an-ios-simulator'},
        () => buildCapabilities('android'),
    );
    assert.equal('appium:udid' in caps, false);
});

test('ANDROID_UDID does not reach an iOS run', () => {
    const caps = withEnv(
        {E2E_APP_PATH: 'App.app', ANDROID_UDID: 'emulator-5556', IOS_UDID: undefined},
        () => buildCapabilities('ios'),
    );
    assert.equal('appium:udid' in caps, false);
});
