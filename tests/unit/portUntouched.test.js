/**
 * The CI guard for the native port (.github/scripts/check-port-untouched.js): a pull
 * request labelled `port` may rewrite android/ and ios/, but not the Windows module,
 * the codegen spec, the Expo plugin or the JavaScript the package ships.
 */
import {createRequire} from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const {protectedPaths, packageJsonOutsideScripts} = require('../../.github/scripts/check-port-untouched.js');

test('native, build, test and doc changes pass', () => {
    assert.deepEqual(protectedPaths([
        'android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilFS.kt',
        'ios/ReactNativeBlobUtilFS.swift',
        'react-native-blob-util.podspec',
        'examples/ReactNativeBlobUtil/parity/cases.js',
        'tests/unit/byteCount.test.js',
        'tests/native/run-android-unit-tests.js',
        '.github/workflows/ci.yml',
        'README.md',
        'babel.config.js',
    ]), []);
});

test('Windows, codegen, the plugin and the shipped JavaScript are flagged', () => {
    const touched = [
        'windows/ReactNativeBlobUtil/ReactNativeBlobUtil.cpp',
        'codegenSpecs/NativeBlobUtils.js',
        'plugin/src/withCustomCACerts.js',
        'app.plugin.js',
        'class/ReactNativeBlobUtilSession.js',
        'utils/byteCount.js',
        'polyfill/Blob.js',
        'lib/oboe-browser.min.js',
        'index.js',
        'fs.js',
        'index.d.ts',
        'index.js.flow',
    ];
    assert.deepEqual(protectedPaths(touched), touched);
});

test('package.json may change its scripts and nothing else', () => {
    const base = {
        name: 'react-native-blob-util',
        version: '0.25.0',
        scripts: {test: 'node --test'},
        peerDependencies: {'react-native': '*'},
    };

    assert.equal(packageJsonOutsideScripts(base, {...base, scripts: {...base.scripts, 'test:ios': 'node tests/native/run-ios-unit-tests.js'}}), false);
    assert.equal(packageJsonOutsideScripts(base, {...base, version: '0.26.0'}), true);
    assert.equal(packageJsonOutsideScripts(base, {...base, peerDependencies: {'react-native': '>=0.84'}}), true);
});
