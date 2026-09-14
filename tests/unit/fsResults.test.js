/**
 * What the fs wrappers resolve, whatever the platform handed back. Native
 * layers disagreed on these (audit #5), so the wrappers normalise them: the
 * fixtures below are the shapes each platform actually returns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

let native = {};
rn.setNativeModule(new Proxy({}, {get: (_, name) => native[name]}));

const {default: fs} = await import('../../fs.js');

const cb = (...result) => (...args) => args.at(-1)(...result);

test('createFile resolves the path on every platform', async () => {
    for (const [platform, resolved] of [['android', '/docs/a'], ['ios', [null]], ['windows', undefined]]) {
        native = {createFile: () => Promise.resolve(resolved), createFileASCII: () => Promise.resolve(resolved)};
        assert.equal(await fs.createFile('/docs/a', 'x', 'utf8'), '/docs/a', platform);
        assert.equal(await fs.createFile('/docs/a', [1], 'ascii'), '/docs/a', platform);
    }
});

test('cp and mv resolve true on every platform', async () => {
    for (const [platform, res] of [['android', undefined], ['ios', true], ['windows', true]]) {
        native = {cp: cb(null, res), mv: cb(null, res)};
        assert.equal(await fs.cp('/a', '/b'), true, platform);
        assert.equal(await fs.mv('/a', '/b'), true, platform);
    }
});

test('df resolves numeric free and total, plus the Android internal/external split', async () => {
    native = {df: cb(null, {internal_free: '100', internal_total: '200', external_free: '10', external_total: '20'})};
    assert.deepEqual(await fs.df(), {
        free: 100, total: 200,
        internal_free: 100, internal_total: 200, external_free: 10, external_total: 20,
    });

    native = {df: cb(null, {free: 300, total: 400})};
    assert.deepEqual(await fs.df(), {free: 300, total: 400});
});

test('lstat entries carry numeric size and lastModified', async () => {
    const android = {filename: 'a', path: '/a', size: '2', lastModified: '1700000000000', type: 'file'};
    const ios = {filename: 'a', path: '/a', size: '2', lastModified: 1700000000000, type: 'file'};
    for (const entry of [android, ios]) {
        native = {lstat: cb(null, [entry])};
        assert.deepEqual(await fs.lstat('/'), [{filename: 'a', path: '/a', size: 2, lastModified: 1700000000000, type: 'file'}]);
    }
});

test('stat keeps its numeric size and lastModified', async () => {
    native = {stat: cb(null, {filename: 'a', path: '/a', size: '2', lastModified: '1700000000000', type: 'file'})};
    assert.deepEqual(await fs.stat('/a'), {filename: 'a', path: '/a', size: 2, lastModified: 1700000000000, type: 'file'});
});

test('readFile ascii resolves bytes 0..255, not the signed bytes Android and iOS return', async () => {
    native = {readFile: () => Promise.resolve([104, -61, -87, 0, -1, 65])};
    assert.deepEqual(await fs.readFile('/a', 'ascii'), [104, 195, 169, 0, 255, 65]);
    assert.deepEqual(await fs.readFileWithTransform('/a', 'ascii'), [104, 195, 169, 0, 255, 65]);

    native = {readFile: () => Promise.resolve([104, 195, 169, 0, 255, 65])};
    assert.deepEqual(await fs.readFile('/a', 'ascii'), [104, 195, 169, 0, 255, 65], 'Windows bytes pass through');

    native = {readFile: () => Promise.resolve('text')};
    assert.equal(await fs.readFile('/a', 'utf8'), 'text', 'other encodings are untouched');
});
