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
import fs from 'node:fs';
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

// 1.0.0 was packed from a checkout holding .claude/settings.local.json and five
// local planning notes, and .npmignore, a list of what to leave out, let them
// through. package.json's `files` now lists what goes in, but a directory entry
// still takes whatever sits in it: an ios/build/ left by Xcode, say. So every
// packed file has to match one of these, and prepublishOnly runs this file, which
// makes `npm publish` fail instead of shipping a stray file.
const SHIPPED = [
    /^(index|index\.web|android|ios|fetch|fs|media|mediacollection|open|types|app\.plugin)\.js$/,
    /^index\.d\.ts$/,
    /^(package\.json|README\.md|LICENSE|Migration\.md|NuGet\.config|react-native-blob-util\.podspec)$/,
    /^(class|utils|codegenSpecs)\/[\w.]+\.js$/,
    /^plugin\/([\w]+\/)*[\w.]+\.(js|d\.ts)$/,
    /^ios\/(ReactNativeBlobUtil\/)?[\w]+\.(swift|h|m|mm)$/,
    /^ios\/PrivacyInfo\.xcprivacy$/,
    /^android\/(build\.gradle|gradle\.properties)$/,
    /^android\/src\/main\/AndroidManifest\.xml$/,
    /^android\/src\/main\/java\/com\/ReactNativeBlobUtil\/([\w]+\/)*[\w]+\.(kt|java)$/,
    /^android\/src\/main\/res\/(values|xml)\/[\w]+\.xml$/,
    /^windows\/(README\.md|ExperimentalFeatures\.props|ReactNativeBlobUtil\.sln)$/,
    /^windows\/ReactNativeBlobUtil\/[\w.]+\.(cpp|h|def|rc|idl|props|vcxproj|filters|config|json)$/,
    /^windows\/ReactNativeBlobUtil\/codegen\/([\w.]+\.g\.h|\.clang-format)$/,
];

test('the tarball ships only package files', () => {
    const stray = packedFiles().filter((file) => !SHIPPED.some((pattern) => pattern.test(file)));
    assert.deepEqual(stray, [], 'not part of the package; delete it, or add it to `files` and to SHIPPED here');
});

// The README states the React Native floor; the peer dependency enforces it at
// install time. The two are written in different files, like index.d.ts and
// index.js.flow were, and drift the same way unless something ties them together.
test('the react-native peer floor is the version the README promises', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const promised = readme.match(/version \*\*1\.0\.\d+\*\* and up[^\n]*?react native \*\*(\d+\.\d+)\*\* and up/);
    assert.ok(promised, 'README no longer states the 1.0 compatibility line');
    assert.equal(pkg.peerDependencies['react-native'], `>=${promised[1]}.0`);
});
