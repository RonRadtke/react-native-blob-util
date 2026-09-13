import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import toExistsResult from '../../utils/existsResult.js';

/**
 * Fixtures mirror what each native layer actually passes to the callback, so
 * they fail if a platform ever changes shape. They are shared with the native
 * unit tests, which check each layer still passes exactly these arguments.
 */
const {cases: NATIVE_CALLBACKS} = JSON.parse(
    readFileSync(new URL('../fixtures/native-payloads/exists-callback.json', import.meta.url), 'utf8'),
);

test('toExistsResult', async (t) => {
    for (const {platform, args, expected} of NATIVE_CALLBACKS) {
        await t.test(`reads what ${platform} passes: ${JSON.stringify(args)}`, () => {
            assert.deepEqual(toExistsResult(...args), expected);
        });
    }

    await t.test('always returns real booleans', () => {
        for (const result of [toExistsResult(1, 0), toExistsResult([1, 0]), toExistsResult(undefined)]) {
            assert.equal(typeof result.exists, 'boolean');
            assert.equal(typeof result.isDirectory, 'boolean');
        }
    });

    await t.test('treats a missing second argument as not a directory', () => {
        assert.deepEqual(toExistsResult(true), {exists: true, isDirectory: false});
    });
});

test('regressions this fixes on Windows', async (t) => {
    await t.test('exists() no longer reports every path as present', () => {
        // The array [false, false] is truthy, so reading the first argument
        // directly made fs.exists() answer yes for paths that were not there -
        // which sent fs.unlink() at a directory that did not exist.
        const windowsSaysMissing = [false, false];

        assert.equal(Boolean(windowsSaysMissing), true, 'the raw value really is truthy');
        assert.equal(toExistsResult(windowsSaysMissing).exists, false);
    });

    await t.test('isDir() no longer reports every path as a file', () => {
        // Windows passes one argument, so the second was always undefined.
        const windowsSaysDirectory = [true, true];

        assert.equal(windowsSaysDirectory[1], true);
        assert.equal(toExistsResult(windowsSaysDirectory).isDirectory, true);
    });
});
