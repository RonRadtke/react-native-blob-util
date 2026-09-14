import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../native/run-android-unit-tests.js', import.meta.url), 'utf8');

function run(platform, result = {status: 7}) {
    const paths = platform === 'win32' ? path.win32 : path.posix;
    const calls = [];
    const errors = [];
    let exitCode;
    vm.runInNewContext(source, {
        __dirname: paths.join(platform === 'win32' ? 'C:\\repo with spaces' : '/repo with spaces', 'tests', 'native'),
        console: {error: (message) => errors.push(message)},
        process: {
            platform,
            argv: ['node', 'runner.js', '--tests', '*Progress Config*'],
            env: {ComSpec: 'cmd.exe'},
            exit: (code) => { exitCode = code; },
        },
        require(name) {
            if (name === 'path') return paths;
            if (name === 'child_process') {
                return {spawnSync(command, args, options) {
                    calls.push({command, args: Array.from(args), options});
                    // A fresh checkout gives gradlew mode 100644. Executing that
                    // file directly fails before Gradle sees any arguments.
                    if (platform !== 'win32' && paths.basename(command) === 'gradlew') {
                        return {status: null, error: new Error('spawnSync gradlew EACCES')};
                    }
                    return result;
                }};
            }
            throw new Error(`Unexpected dependency: ${name}`);
        },
    });
    return {calls, errors, exitCode};
}

for (const platform of ['linux', 'darwin']) {
    test(`${platform}: run a non-executable Gradle wrapper and preserve arguments and exit status`, () => {
        const {calls, errors, exitCode} = run(platform);
        assert.equal(exitCode, 7, 'return the Gradle result, not an EACCES launch failure');
        assert.deepEqual(errors, []);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].command, 'bash');
        assert.deepEqual(calls[0].args, [
            '/repo with spaces/examples/ReactNativeBlobUtil/android/gradlew',
            ':react-native-blob-util:testDebugUnitTest', '--console=plain', '--tests', '*Progress Config*',
        ]);
        assert.equal(calls[0].options.stdio, 'inherit');
    });
}

test('Windows still launches the batch wrapper through cmd.exe', () => {
    const {calls, exitCode} = run('win32');
    assert.equal(exitCode, 7);
    assert.equal(calls[0].command, 'cmd.exe');
    assert.deepEqual(calls[0].args.slice(0, 4), [
        '/d', '/s', '/c', 'C:\\repo with spaces\\examples\\ReactNativeBlobUtil\\android\\gradlew.bat',
    ]);
});

test('a missing shell is reported as a launch failure', () => {
    const {errors, exitCode} = run('linux', {status: null, error: new Error('spawnSync bash ENOENT')});
    assert.equal(exitCode, 1);
    assert.deepEqual(errors, ['spawnSync bash ENOENT']);
});
