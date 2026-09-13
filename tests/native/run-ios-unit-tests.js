/**
 * Runs the Swift/XCTest unit tests of the library's iOS module.
 *
 * The module has no Xcode project of its own - it is compiled as a pod inside an
 * app - so the tests live in a hosted test target of the example app and run
 * through its workspace, exactly as the e2e build compiles it. A simulator is
 * needed because the target is hosted: XCTest launches the app and loads the
 * test bundle into it.
 *
 * `pod install` must have run in examples/ReactNativeBlobUtil/ios first, the
 * same as for the e2e build.
 *
 *   npm run test:ios
 *   IOS_SIMULATOR_NAME='iPhone 16' npm run test:ios
 *   npm run test:ios -- -only-testing:ReactNativeBlobUtilE2ETests/HashTests
 */
const {spawnSync} = require('child_process');
const path = require('path');

if (process.platform !== 'darwin') {
    console.error('The iOS unit tests need macOS and Xcode.');
    process.exit(1);
}

const iosDir = path.join(__dirname, '..', '..', 'examples', 'ReactNativeBlobUtil', 'ios');
const simulator = process.env.IOS_SIMULATOR_NAME || 'iPhone 17 Pro';
// A name alone matches on the newest installed runtime. Pin the runtime with
// IOS_PLATFORM_VERSION when several are installed and the newest is not wanted.
const platformVersion = process.env.IOS_PLATFORM_VERSION;
const destination = `platform=iOS Simulator,name=${simulator}` +
    (platformVersion ? `,OS=${platformVersion}` : '');

const args = [
    'test',
    '-workspace', 'ReactNativeBlobUtilE2E.xcworkspace',
    '-scheme', 'ReactNativeBlobUtilE2E',
    '-configuration', 'Debug',
    '-destination', destination,
    // Keep the build products out of the e2e app's derived data, so running the
    // unit tests never invalidates a .app the e2e suite is about to install.
    '-derivedDataPath', 'build-tests',
    ...process.argv.slice(2),
];

console.log(`xcodebuild ${args.join(' ')}`);

const result = spawnSync('xcodebuild', args, {cwd: iosDir, stdio: 'inherit'});

if (result.error) {
    console.error(result.error.message);
}
process.exit(result.status ?? 1);
