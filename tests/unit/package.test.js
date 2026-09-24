/**
 * What `npm publish` ships. 1.0.0 was packed from a checkout holding
 * .claude/settings.local.json and local planning notes, and .npmignore, a list of
 * what to leave out, let them through. package.json's `files` now lists what goes
 * in, but a directory entry still takes whatever sits in it, so this rejects
 * anything that is plainly not package source. prepublishOnly runs this file:
 * a stray file fails `npm publish` instead of shipping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function packedFiles() {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: root,
        encoding: 'utf8',
        // npm is npm.cmd on Windows, which node only spawns through a shell.
        shell: process.platform === 'win32',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout)[0].files.map((file) => file.path);
}

test('the tarball ships only package files', () => {
    const files = packedFiles();
    for (const file of ['index.js', 'index.d.ts', 'android/build.gradle', 'react-native-blob-util.podspec',
        'windows/ReactNativeBlobUtil/ReactNativeBlobUtil.cpp']) {
        assert.ok(files.includes(file), `${file} is missing from the tarball`);
    }
    const stray = files.filter((file) =>
        // dotfiles and dot-directories (.claude/, .idea/, .eslintrc.json), bar one committed codegen file
        (/(^|\/)\./.test(file) && file !== 'windows/ReactNativeBlobUtil/codegen/.clang-format') ||
        /(^|\/)(build|obj|bin|x64|x86|Debug|Release|tests?|__tests__)\//.test(file) ||
        /\.test\.[cm]?[jt]s$/.test(file) ||
        /\.(key|pem|crt|p12|keystore|log|tgz)$/.test(file) ||
        (/\.md$/.test(file) && !['README.md', 'Migration.md', 'windows/README.md'].includes(file)));
    assert.deepEqual(stray, [], 'not part of the package; delete it before publishing');
});
