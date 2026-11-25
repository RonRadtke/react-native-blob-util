# E2E (Appium + Real Device FS)

This suite drives the example app UI with Appium/WebdriverIO and executes file operations against **real Android/iOS simulator/emulator filesystems** (not mocked fs calls).

## What changed

- Scenario-driven tests under `tests/e2e/appium/scenarios/`.
- Shared helpers under `tests/e2e/appium/lib/`.
- One-command runners that auto-start the local HTTP server, Metro for Android, and Appium:
  - `npm run e2e:android`
  - `npm run e2e:ios`
  - `npm run e2e:all`

## Quick start

From repo root:

```sh
# Android (requires emulator; app auto-builds if not provided)
npm run e2e:android

# iOS (requires macOS simulator + app path OR bundle id)
npm run e2e:ios
```

Android auto-build prerequisites:

- Java and Android SDK available on PATH.
- A running Android emulator/device.

The runner will:

1. Start `tests/e2e/server.js` if not running.
2. Start Metro for Android if not running.
3. Start Appium if not running.
4. Install missing Appium drivers for selected platforms.
5. For Android, auto-build `examples/ReactNativeBlobUtil` if no APK/package target is provided and no APK already exists.
6. Execute the scenario suite.

## Required app config

### Android

By default, Android tests use the included app at `examples/ReactNativeBlobUtil`:

- Existing APK: `examples/ReactNativeBlobUtil/android/app/build/outputs/apk/debug/app-debug.apk`
- If missing, the runner installs app dependencies and builds it automatically.

You can still override by setting one of:

- `E2E_APP_PATH` (or `E2E_APP_PATH_ANDROID`) to an `.apk`
- `ANDROID_APP_PACKAGE` (+ usually `ANDROID_APP_ACTIVITY`) for an already installed app

To force a fresh Android app build even when an APK exists:

```sh
E2E_REBUILD_ANDROID_APP=1 npm run e2e:android
```

### iOS

Unlike Android, the runner does not build the iOS app for you. Build it once:

```sh
cd examples/ReactNativeBlobUtil
npm install
cd ios && pod install
xcodebuild -workspace ReactNativeBlobUtilE2E.xcworkspace \
  -scheme ReactNativeBlobUtilE2E -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build build
```

The `Podfile` is checked in - the Xcode project links `libPods-...` and reads the
generated `.xcconfig` files, so `pod install` is not optional. Then set one of:

- `E2E_APP_PATH` (or `E2E_APP_PATH_IOS`) to the resulting
  `ios/build/Build/Products/Debug-iphonesimulator/ReactNativeBlobUtilE2E.app`
- `IOS_BUNDLE_ID` for an app already installed on the simulator

Point the run at a specific simulator with `IOS_UDID` (from `xcrun simctl list
devices`) or `IOS_PLATFORM_VERSION`. Without one of them the driver matches on
`DEVICE_NAME` alone, and when no simulator of that name exists on the newest
installed runtime it creates a throwaway one per session - a fresh boot and a
WebDriverAgent rebuild every run, several minutes each time.

### Windows

Same app as Android and iOS - `examples/ReactNativeBlobUtil` - built from its
`windows/` solution. Build and deploy it, then set one of:

- `WINDOWS_APP_ID` (or `E2E_WINDOWS_APP_ID`) for a deployed package
- `WINDOWS_APP_PATH` (or `E2E_WINDOWS_APP_PATH`) for an executable

The `tls` scenario additionally needs the app to be **packaged**. `customCACerts`
resolves from `Package::Current().InstalledLocation()`, and an unpackaged build has
no install location to resolve against, so every custom-CA case fails closed. That
is correct behaviour, but it looks like a trust bug - check the packaging first.

The `filesystem` scenario skips the **sha224** hash case on Windows. WinRT's hash
providers do not offer SHA-224 and neither does CNG, so `fs.hash()` rejects it
there by design; Android (`MessageDigest`) and iOS (`CommonCrypto`) both provide
it and still run the case.

Input is **pasted** rather than typed on Windows. WinAppDriver types through the
active keyboard layout, so on a non-US one the characters these scenarios rely on
arrive wrong - a German layout turns every `/` into `-`, which silently rewrites
every path and URL a scenario sets.

## Scenario selection

Default scenarios:

- `filesystem`
- `network`
- `tls`

Run only filesystem checks:

```sh
E2E_SCENARIOS=filesystem npm run e2e:android
```

Per-platform override:

- `E2E_SCENARIOS_ANDROID`
- `E2E_SCENARIOS_IOS`
- `E2E_SCENARIOS_WINDOWS`

## TLS / custom CA scenario

The `tls` scenario covers `customCACerts`, `pinnedHosts` and `trustSystemCerts`
against the HTTPS server in `server.js` (port 19077). It runs on all three
platforms and needs no network access beyond localhost.

Certificates are generated, never committed. `run-all.js` calls
`certs/generate.js` before the apps are built, because the CA is a build input:
Android reads `res/raw/test_ca`, iOS bundles `test_ca.pem`, and the Windows app
ships it in the package root. `openssl` must be on `PATH`; without it the HTTPS
server starts HTTP-only and these cases cannot run.

Run just this scenario:

```sh
E2E_SCENARIOS=tls npm run e2e:ios       # macOS
E2E_SCENARIOS=tls npm run e2e:android
E2E_SCENARIOS=tls npm run e2e:windows   # Windows, packaged app
```

Four of the six cases assert that a request is **refused**. That is deliberate:
a fall back to the system trust store would let them pass silently otherwise, and
that is exactly the bug class this feature had on iOS.

The wiring between these scenarios and the apps is checked by `npm test`
(`tests/unit/e2eScenarioIds.test.js`), which fails if a scenario taps a testID no
app exposes, if the two apps drift apart on the TLS cases, or if a TLS button
exists that nothing exercises. That runs anywhere, without a device.

## Background downloads, by hand

The `background-download` parity case runs a background download with the app
open. That the download goes on after the app has ended, and is found again on
the next start, is checked by hand on each platform, with two throwaway cases
added locally to `parity/cases.js` (not committed): one that starts
`config({path, background: {id}}).fetch(...)` against `/range?size=65536&ms=2000`
(eight seconds) and returns at once, and one that reads `background.list()`, then
`background.attach(id)`, then the list again and the file's hash.

1. Run the e2e server on its own (`node tests/e2e/server.js`) so it outlives the
   runs; BITS waits ten minutes before retrying a download whose server went away.
2. Run the start case.
3. End the app the way the system does, not the way a user force-quits:
   - **Android**: `adb shell run-as <package> kill -9 <pid>`. `am force-stop`, and
     Appium ending a session without `E2E_ANDROID_NO_RESET=1`, put the app in the
     stopped state, in which Android delivers no broadcasts to it; the download then
     finishes, and is moved into place on the next start instead.
   - **iOS**: a test button that calls `exit(0)`. Swiping the app away in the app
     switcher cancels its background downloads.
   - **Windows**: end the process.
4. Wait for the download to end. On Android the receiver moves the file into place
   while the app is not running (`run-as <package> ls files/...` shows it); a
   process without UI is started for it, which Appium does not then bring to the
   front, so end it before the next run.
5. Run the second case with `E2E_ANDROID_NO_RESET=1` (Appium otherwise clears the
   app's data): `list()` reports the download `completed`, `attach(id)` resolves with
   its path, and the record is gone afterwards.

On iOS the second case cannot go through the runner: an Appium session reinstalls the
app, so its data container, with the record store and the downloaded file, is a new
one. Watch the second half from the host instead: the app's process
(`pgrep -f ReactNativeBlobUtilE2E.app`), the record file under the container's
Application Support, and the destination file.

Measured on 2026-11-16: Android 14 emulator (the receiver moved the file two
seconds after the process was killed), Windows 11 (BITS completed it while the
app was closed) and the iOS 26.5 simulator (with no app process for 27 seconds the
record stayed `running`; iOS then relaunched the app for the session's events, the
record turned `completed` and the file was at its destination three seconds later).

The Android emulator's network path loses bytes of a fast burst from the host (raw
`nc` on the emulator shows it too, while the host receives the same responses
intact), so the cases pace their transfers or keep them small.

## Run-all options

`tests/e2e/run-all.js` supports:

- `--platforms android,ios`
- `--no-server` (use an already running HTTP server)
- `--no-appium` (use an already running Appium server)
- `--no-metro` (use an already running Metro server)
- `--skip-driver-install`

## GitHub Actions

A workflow template is available at `.github/workflows/e2e-mobile.yml`.

It boots:

- Android emulator on `ubuntu-latest`
- iOS simulator on `macos-14`

and runs this same suite against provided app artifacts (`android_app`, `ios_app`) or installed app IDs.

## Environment variables

- `APPIUM_HOST`: default `127.0.0.1`
- `APPIUM_PORT`: default `4723`
- `APPIUM_PATH`: default `/wd/hub`
- `E2E_SERVER_HOST`: default `127.0.0.1` in runner, `0.0.0.0` in server
- `E2E_SERVER_PORT`: default `19076`
- `E2E_SERVER_URL`: override server base URL used by the app
- `E2E_METRO_HOST`: default `127.0.0.1`
- `E2E_METRO_PORT` / `RCT_METRO_PORT`: default `8081`
- `E2E_APP_PATH`: generic app path (`.apk`, `.app`, `.ipa`)
- `E2E_APP_PATH_ANDROID`, `E2E_APP_PATH_IOS`, `E2E_APP_PATH_WINDOWS`: per-platform app paths
- `ANDROID_APP_PACKAGE`, `ANDROID_APP_ACTIVITY`
- `ANDROID_UDID`: pin the Android run to one device (a serial from `adb devices`);
  without it the driver takes the first device listed
- `IOS_BUNDLE_ID`
- `IOS_UDID`, `IOS_PLATFORM_VERSION`: pin the iOS run to one simulator
- `WINDOWS_APP_ID`, `WINDOWS_APP_PATH`
- `DEVICE_NAME`: generic device name
- `DEVICE_NAME_ANDROID`, `DEVICE_NAME_IOS`, `DEVICE_NAME_WINDOWS`
- `E2E_PLATFORMS`: default `android,ios,windows`
- `E2E_FORCE_IOS`: allow iOS run on non-mac host
- `E2E_FORCE_WINDOWS`: allow Windows run on non-Windows host
- `E2E_SCENARIOS`: comma-separated scenario list
- `E2E_SCENARIOS_ANDROID`, `E2E_SCENARIOS_IOS`, `E2E_SCENARIOS_WINDOWS`: per-platform scenario list
- `E2E_REBUILD_ANDROID_APP`: when truthy (`1`, `true`, `yes`, `on`), rebuild included Android E2E app before running
