/**
 * What `npm publish` ships. npm builds the tarball from .npmignore, so this asks
 * `npm pack --dry-run` instead of reading the ignore file: the JS, the spec and
 * the three native modules have to be in it, and no tests may be. The Android
 * JVM tests once slipped in; they read tests/fixtures, which is not shipped, so
 * a consumer's `gradlew test` failed inside this module.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let packed;

function packedFiles() {
    if (packed) {
        return packed;
    }
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: root,
        encoding: 'utf8',
        // npm is npm.cmd on Windows, which node only spawns through a shell.
        shell: process.platform === 'win32',
    });
    assert.equal(result.status, 0, result.stderr);
    packed = JSON.parse(result.stdout)[0].files.map((file) => file.path);
    return packed;
}

test('the tarball ships the JS, the spec and the three native modules', () => {
    const files = packedFiles();
    for (const file of [
        'index.js',
        'index.d.ts',
        'app.plugin.js',
        'codegenSpecs/NativeBlobUtils.js',
        'android/build.gradle',
        'react-native-blob-util.podspec',
        'ios/ReactNativeBlobUtil/ReactNativeBlobUtil.mm',
        'windows/ReactNativeBlobUtil/ReactNativeBlobUtil.cpp',
    ]) {
        assert.ok(files.includes(file), `${file} is missing from the tarball`);
    }
});

test('the tarball ships no tests', () => {
    const tests = packedFiles().filter((file) =>
        /(^|\/)(tests?|__tests__)\//.test(file) || /\.test\.[cm]?[jt]s$/.test(file));
    assert.deepEqual(tests, []);
});
