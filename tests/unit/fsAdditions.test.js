/**
 * The fs calls added in 1.2.0, and what 1.2.0 changed in the existing ones:
 * read and write at an offset, touch, bytes in and out, file:// paths, the
 * iOS protection option, the new directories, resources and bundles. What
 * reaches native, and what each call resolves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import rn from './harness/react-native.js';

const calls = [];
let results = {};
const recording = (name) => (...args) => {
    calls.push([name, ...args]);
    const result = results[name];
    return result instanceof Error ? Promise.reject(result) : Promise.resolve(typeof result === 'function' ? result(...args) : result);
};

const NATIVE = [
    'readFile', 'readRange', 'writeRange', 'writeFile', 'writeFileArray', 'createFile', 'createFileASCII', 'touch',
    'setAttributes', 'bundlePath', 'getExternalDirs', 'mkdir', 'cp', 'mv', 'stat', 'lstat', 'ls', 'exists', 'unlink',
    'hash', 'slice', 'writeStream', 'excludeFromBackupKey',
];
const native = {getConstants: () => ({DocumentDir: '/docs', TemporaryDir: '/tmp', ExternalCacheDir: '/ext/cache'})};
for (const name of NATIVE) {
    native[name] = recording(name);
}
rn.setNativeModule(native);

const {default: fs} = await import('../../fs.js');

test.beforeEach(() => {
    rn.setPlatform('android');
    calls.length = 0;
    results = {};
});

// "héllo" as UTF-8: 68 c3 a9 6c 6c 6f
const HELLO_BASE64 = 'aMOpbGxv';

test('read hands native the range and decodes base64 as the encoding asks', async () => {
    results.readRange = HELLO_BASE64;
    assert.equal(await fs.read('/docs/a', {position: 2, length: 6}), 'héllo');
    assert.equal(await fs.read('/docs/a', {encoding: 'base64'}), HELLO_BASE64);
    assert.deepEqual(await fs.read('/docs/a', {encoding: 'ascii'}), [0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f]);
    const bytes = await fs.read('/docs/a', {encoding: 'bytes'});
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual([...bytes], [0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f]);
    assert.deepEqual(calls, [
        ['readRange', '/docs/a', 2, 6],
        ['readRange', '/docs/a', 0, -1],
        ['readRange', '/docs/a', 0, -1],
        ['readRange', '/docs/a', 0, -1],
    ]);
});

test('read of a range that ends inside a character decodes the broken tail as U+FFFD', async () => {
    results.readRange = 'aMM='; // 68 c3
    assert.equal(await fs.read('/docs/a', {length: 2}), 'h�');
});

test('read of nothing resolves an empty value of the asked type', async () => {
    results.readRange = '';
    assert.equal(await fs.read('/docs/a', {position: 100}), '');
    assert.deepEqual([...(await fs.read('/docs/a', {position: 100, encoding: 'bytes'}))], []);
});

test('read rejects a bad position, length or encoding with EINVAL before native', async () => {
    for (const options of [{position: -1}, {position: 1.5}, {position: '1'}, {length: -2}, {length: NaN}, {encoding: 'latin1'}]) {
        await assert.rejects(fs.read('/docs/a', options), {code: 'EINVAL'}, JSON.stringify(options));
    }
    await assert.rejects(fs.read(), {code: 'EINVAL'});
    assert.deepEqual(calls, []);
});

test('write encodes the data as base64 and appends without a position', async () => {
    results.writeRange = (path, data) => Buffer.from(data, 'base64').length;
    assert.equal(await fs.write('/docs/a', 'héllo', {position: 3}), 6);
    assert.equal(await fs.write('/docs/a', HELLO_BASE64, {encoding: 'base64'}), 6);
    assert.equal(await fs.write('/docs/a', [1, 2, 255], {encoding: 'ascii', position: 0}), 3);
    assert.equal(await fs.write('/docs/a', new Uint8Array([1, 2, 3, 4])), 4);
    assert.equal(await fs.write('/docs/a', new Uint8Array([9, 8, 7]).buffer), 3);
    assert.deepEqual(calls, [
        ['writeRange', '/docs/a', HELLO_BASE64, 3],
        ['writeRange', '/docs/a', HELLO_BASE64, -1],
        ['writeRange', '/docs/a', 'AQL/', 0],
        ['writeRange', '/docs/a', 'AQIDBA==', -1],
        ['writeRange', '/docs/a', 'CQgH', -1],
    ]);
});

test('write writes only the bytes a typed array views', async () => {
    const buffer = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
    await fs.write('/docs/a', new Uint8Array(buffer, 2, 3));
    assert.deepEqual(calls, [['writeRange', '/docs/a', Buffer.from([2, 3, 4]).toString('base64'), -1]]);
});

test('write rejects bad data, position or encoding with EINVAL before native', async () => {
    for (const [data, options] of [
        ['x', {position: -1}], ['x', {position: 2.5}], ['x', {encoding: 'uri'}], [42, {}],
        ['x', {encoding: 'ascii'}], [[1], {encoding: 'utf8'}],
    ]) {
        await assert.rejects(fs.write('/docs/a', data, options), {code: 'EINVAL'}, JSON.stringify([data, options]));
    }
    assert.deepEqual(calls, []);
});

test('touch sends milliseconds, defaults mtime to now and leaves ctime alone without one', async () => {
    const before = Date.now();
    await fs.touch('/docs/a');
    const after = Date.now();
    await fs.touch('/docs/a', {mtime: new Date(1600000000123), ctime: 1500000000000});
    assert.equal(calls[0][0], 'touch');
    assert.ok(calls[0][2] >= before && calls[0][2] <= after);
    assert.equal(calls[0][3], -1);
    assert.deepEqual(calls[1], ['touch', '/docs/a', 1600000000123, 1500000000000]);
    assert.equal(await fs.touch('/docs/a'), undefined);
});

test('touch rejects a time that is not a Date or milliseconds with EINVAL', async () => {
    for (const options of [{mtime: 'yesterday'}, {mtime: new Date(NaN)}, {ctime: -5}, {mtime: Infinity}]) {
        await assert.rejects(fs.touch('/docs/a', options), {code: 'EINVAL'}, String(options.mtime ?? options.ctime));
    }
    assert.deepEqual(calls, []);
});

test('readFile with bytes resolves a Uint8Array read as base64', async () => {
    results.readFile = HELLO_BASE64;
    const bytes = await fs.readFile('/docs/a', 'bytes');
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual([...bytes], [0x68, 0xc3, 0xa9, 0x6c, 0x6c, 0x6f]);
    await fs.readFile('/docs/a', {encoding: 'bytes', transform: true});
    assert.deepEqual(calls, [['readFile', '/docs/a', 'base64', false], ['readFile', '/docs/a', 'base64', true]]);
});

test('writeFile, appendFile and createFile take a Uint8Array or an ArrayBuffer and send it as base64', async () => {
    results.writeFile = 3;
    const data = new Uint8Array([104, 105, 33]);
    assert.equal(await fs.writeFile('/docs/a', data), 3);
    await fs.writeFile('/docs/a', data.buffer, 'utf8', {transform: true});
    await fs.appendFile('/docs/a', data);
    await fs.createFile('/docs/b', data);
    assert.deepEqual(calls, [
        ['writeFile', '/docs/a', 'base64', 'aGkh', false, false],
        ['writeFile', '/docs/a', 'base64', 'aGkh', true, false],
        ['writeFile', '/docs/a', 'base64', 'aGkh', false, true],
        ['createFile', '/docs/b', 'aGkh', 'base64'],
    ]);
});

test('every fs call reads a file:// URL as the path it names (#295)', async () => {
    results.exists = {exists: true, isDirectory: false};
    results.stat = {filename: 'a b', size: '1', lastModified: 1, type: 'file'};
    results.writeStream = 'stream-1';
    const url = 'file:///docs/a%20b.txt';
    const path = '/docs/a b.txt';
    await fs.readFile(url);
    await fs.writeFile(url, 'x');
    await fs.writeFile(url, 'file:///docs/src%231.txt', 'uri');
    await fs.appendFile(url, 'x');
    await fs.createFile(url, 'x');
    await fs.read(url);
    await fs.write(url, 'x');
    await fs.touch(url, {mtime: 1});
    await fs.mkdir(url);
    await fs.cp(url, 'file://localhost/docs/c.txt');
    await fs.mv(url, 'file:///docs/c.txt');
    await fs.stat(url);
    await fs.ls(url);
    await fs.ls(url, {stats: true});
    await fs.exists(url);
    await fs.isDir(url);
    await fs.unlink(url);
    await fs.hash(url, 'md5');
    await fs.slice(url, 'file:///docs/c.txt', 0, 1);
    await fs.writeStream(url);
    const stream = await fs.readStream(url);
    assert.equal(stream.path, path);

    const paths = calls.map(([, first]) => first);
    assert.deepEqual([...new Set(paths)], [path]);
    assert.equal(calls.find((c) => c[0] === 'writeFile' && c[2] === 'uri')[3], '/docs/src#1.txt');
    assert.deepEqual(calls.filter((c) => c[0] === 'cp' || c[0] === 'mv' || c[0] === 'slice').map((c) => c[2]),
        ['/docs/c.txt', '/docs/c.txt', '/docs/c.txt']);
});

test('a path that is not a file URL, or has a malformed escape, is passed on as it is', async () => {
    await fs.readFile('/docs/100%.txt');
    await fs.readFile('file:///docs/100%.txt');
    await fs.readFile('content://media/1');
    await fs.readFile('bundle-assets://a.txt');
    assert.deepEqual(calls.map((c) => c[1]), ['/docs/100%.txt', '/docs/100%.txt', 'content://media/1', 'bundle-assets://a.txt']);
});

// "%2F" decoded as part of the whole URL became a separator, so a name joined
// into a URL, "..%2Fsecret.txt", named the file one folder up.
test('an escape in a file:// URL cannot become a separator or a parent folder', async () => {
    const names = ['..%2Fsecret.txt', '%2E%2E/secret.txt', '..%5Csecret.txt', 'a%00b.txt'];
    for (const name of names) {
        await fs.readFile(`file:///docs/inbox/${name}`);
        await fs.unlink(`file:///docs/inbox/${name}`);
    }
    assert.deepEqual([...new Set(calls.map((c) => c[1]))], names.map((name) => `/docs/inbox/${name}`));
});

test('protection is applied on iOS after the call succeeds, and ignored elsewhere', async () => {
    results.writeFile = 1;
    for (const platform of ['ios', 'android', 'windows']) {
        rn.setPlatform(platform);
        calls.length = 0;
        await fs.writeFile('/docs/a', 'x', {protection: 'complete'});
        await fs.writeFile('/docs/a', 'x', 'utf8', {protection: 'untilFirstAuth'});
        await fs.createFile('/docs/b', 'x', {protection: 'completeUnlessOpen'});
        await fs.mkdir('/docs/d', {protection: 'complete'});
        await fs.cp('/docs/a', '/docs/c', {protection: 'none'});
        await fs.mv('/docs/c', '/docs/e', {protection: 'complete'});
        const applied = calls.filter((c) => c[0] === 'setAttributes').map((c) => [c[1], c[2].protection]);
        assert.deepEqual(applied, platform !== 'ios' ? [] : [
            ['/docs/a', 'complete'], ['/docs/a', 'untilFirstAuth'], ['/docs/b', 'completeUnlessOpen'],
            ['/docs/d', 'complete'], ['/docs/c', 'none'], ['/docs/e', 'complete'],
        ], platform);
    }
});

test('an unknown protection rejects with EINVAL on every platform, before native', async () => {
    for (const platform of ['ios', 'android', 'windows']) {
        rn.setPlatform(platform);
        await assert.rejects(fs.writeFile('/docs/a', 'x', {protection: 'secret'}), {code: 'EINVAL'});
        await assert.rejects(fs.mkdir('/docs/d', {protection: 'Complete'}), {code: 'EINVAL'});
        await assert.rejects(fs.cp('/a', '/b', {protection: 1}), {code: 'EINVAL'});
    }
    assert.deepEqual(calls, []);
});

test('writeFile resolves the bytes written after protecting the file; a failed protect rejects', async () => {
    rn.setPlatform('ios');
    results.writeFile = 5;
    assert.equal(await fs.writeFile('/docs/a', 'hello', {protection: 'complete'}), 5);
    results.setAttributes = Object.assign(new Error('nope'), {code: 'EUNSPECIFIED'});
    await assert.rejects(fs.writeFile('/docs/a', 'hello', {protection: 'complete'}), {code: 'EUNSPECIFIED'});
});

test('setAttributes is iOS only and sends only the attributes given', async () => {
    rn.setPlatform('ios');
    assert.equal(await fs.setAttributes('/docs/a', {protection: 'complete', excludeFromBackup: true}), undefined);
    await fs.setAttributes('file:///docs/a', {excludeFromBackup: false});
    await assert.rejects(fs.setAttributes('/docs/a', {excludeFromBackup: 'yes'}), {code: 'EINVAL'});
    await assert.rejects(fs.setAttributes('/docs/a', {protection: 'secret'}), {code: 'EINVAL'});
    await assert.rejects(fs.setAttributes('/docs/a'), {code: 'EINVAL'});
    assert.deepEqual(calls, [
        ['setAttributes', '/docs/a', {protection: 'complete', excludeFromBackup: true}],
        ['setAttributes', '/docs/a', {excludeFromBackup: false}],
    ]);
    for (const platform of ['android', 'windows']) {
        rn.setPlatform(platform);
        await assert.rejects(fs.setAttributes('/docs/a', {protection: 'complete'}), {code: 'ENOTSUP'});
    }
});

test('bundlePath is iOS only and takes the name with or without .bundle', async () => {
    rn.setPlatform('ios');
    results.bundlePath = '/app/Settings.bundle';
    assert.equal(await fs.bundlePath('Settings'), '/app/Settings.bundle');
    await fs.bundlePath('Settings.bundle');
    await assert.rejects(fs.bundlePath(''), {code: 'EINVAL'});
    assert.deepEqual(calls, [['bundlePath', 'Settings'], ['bundlePath', 'Settings']]);
    for (const platform of ['android', 'windows']) {
        rn.setPlatform(platform);
        await assert.rejects(fs.bundlePath('Settings'), {code: 'ENOTSUP'});
    }
});

test('externalDirs resolves what native lists, and [] for anything else', async () => {
    results.getExternalDirs = ['/ext/0', '/ext/sd'];
    assert.deepEqual(await fs.externalDirs(), ['/ext/0', '/ext/sd']);
    results.getExternalDirs = null;
    assert.deepEqual(await fs.externalDirs(), []);
});

test('the new directories read the constants, "" where a native build does not report them', () => {
    assert.equal(fs.dirs.TemporaryDir, '/tmp');
    assert.equal(fs.dirs.ExternalCacheDir, '/ext/cache');
    assert.equal(fs.dirs.RoamingDir, '');
    assert.ok(Object.keys(fs.dirs).includes('RoamingDir'));
});

test('resource names an Android app resource, and throws ENOTSUP elsewhere', () => {
    assert.equal(fs.resource('raw/sample'), 'bundle-res://raw/sample');
    for (const name of ['sample', 'raw/a/b', '', 7]) {
        assert.throws(() => fs.resource(name), {code: 'EINVAL'}, String(name));
    }
    for (const platform of ['ios', 'windows']) {
        rn.setPlatform(platform);
        assert.throws(() => fs.resource('raw/sample'), (err) => err.code === 'ENOTSUP' && /Android/.test(err.message));
    }
});
