/**
 * Runs the Kotlin/JVM unit tests of the library's Android module.
 *
 * The module has no Gradle build of its own - it is compiled as part of an app -
 * so the tests run through the example app's Gradle project, exactly as the e2e
 * build compiles it. No emulator is needed: these are plain JVM tests.
 *
 *   npm run test:android
 *   npm run test:android -- --tests '*ProgressConfig*'
 */
const {spawnSync} = require('child_process');
const path = require('path');

const androidDir = path.join(__dirname, '..', '..', 'examples', 'ReactNativeBlobUtil', 'android');
const isWin = process.platform === 'win32';
const wrapper = path.join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

const args = [':react-native-blob-util:testDebugUnitTest', '--console=plain', ...process.argv.slice(2)];

const result = isWin
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', wrapper, ...args], {cwd: androidDir, stdio: 'inherit'})
    : spawnSync(wrapper, args, {cwd: androidDir, stdio: 'inherit'});

if (result.error) {
    console.error(result.error.message);
}
process.exit(result.status ?? 1);
