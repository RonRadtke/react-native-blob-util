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

function pack() {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: root,
        encoding: 'utf8',
        // npm is npm.cmd on Windows, which node only spawns through a shell.
        shell: process.platform === 'win32',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout)[0].files.map((file) => file.path);
}

function packedFiles() {
    if (!packed) {
        packed = pack();
    }
    return packed;
}

test('the tarball ships the JS, the spec, the three native modules and the docs', () => {
    const files = packedFiles();
    for (const file of [
        'index.js',
        'index.d.ts',
        'app.plugin.js',
        'codegenSpecs/NativeBlobUtils.js',
        'android/build.gradle',
        'react-native-blob-util.podspec',
        'Package.swift',
        'ios/ReactNativeBlobUtil/ReactNativeBlobUtil.mm',
        'ios/ReactNativeBlobUtilObjC/ReactNativeBlobUtilFileTransformer.h',
        'windows/ReactNativeBlobUtil/ReactNativeBlobUtil.cpp',
        'llms.txt',
        'docs/api-reference.md',
        'docs/img/request.svg',
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
    /^(index|index\.web|android|background|ios|fetch|fs|media|mediacollection|open|types|app\.plugin)\.js$/,
    /^index\.d\.ts$/,
    /^(package\.json|README\.md|LICENSE|Migration\.md|NuGet\.config|react-native-blob-util\.podspec|llms\.txt)$/,
    /^docs\/[\w-]+\.md$/,
    /^docs\/img\/[\w-]+\.svg$/,
    /^Package\.swift$/,
    /^(class|utils|codegenSpecs)\/[\w.]+\.js$/,
    /^plugin\/([\w]+\/)*[\w.]+\.(js|d\.ts)$/,
    /^ios\/(ReactNativeBlobUtil(ObjC)?\/)?[\w]+\.(swift|h|m|mm)$/,
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

// `files` listed `ios/` as a directory until 1.2.0, and a directory entry takes
// whatever sits in it. Xcode writes ReactNativeBlobUtil.xcodeproj/ into the
// module folder the first time it is opened there, and a `files` entry wins over
// .gitignore, so the maintainer's window state packed with the sources. The
// entries name the iOS sources now. The decoy is what makes this fail on a clean
// checkout as well, where there is nothing for Xcode to have left behind yet -
// the test above can only catch it on the machine that has the folder.
test('the tarball leaves out what Xcode drops into ios/', () => {
    const decoy = path.join(root, 'ios', 'npm-pack-decoy.xcodeproj');
    assert.ok(!fs.existsSync(decoy), `${decoy} already exists; refusing to remove it`);
    fs.mkdirSync(path.join(decoy, 'xcuserdata'), {recursive: true});
    try {
        fs.writeFileSync(path.join(decoy, 'project.pbxproj'), 'decoy\n');
        fs.writeFileSync(path.join(decoy, 'xcuserdata', 'window.plist'), 'decoy\n');
        assert.deepEqual(pack().filter((file) => file.includes('npm-pack-decoy')), []);
    } finally {
        fs.rmSync(decoy, {recursive: true, force: true});
    }
});

// The README states the React Native floor; the peer dependency enforces it at
// install time. The two are written in different files, like index.d.ts and
// index.js.flow were, and drift the same way unless something ties them together.
test('the react-native peer floor is the version the README promises', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    // The 1.x row of the compatibility table: | 1.0.1 and up | 0.84 and up, ... |
    const promised = readme.match(/^\| 1\.0\.\d+ and up \| (\d+\.\d+) and up\b/m);
    assert.ok(promised, 'README no longer states the 1.x compatibility row');
    assert.equal(pkg.peerDependencies['react-native'], `>=${promised[1]}.0`);
});
