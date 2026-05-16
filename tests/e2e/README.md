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
5. For Android, auto-build `tests/e2e/android-app` if no APK/package target is provided and no APK already exists.
6. Execute the scenario suite.

## Required app config

### Android

By default, Android tests use the included app at `tests/e2e/android-app`:

- Existing APK: `tests/e2e/android-app/android/app/build/outputs/apk/debug/app-debug.apk`
- If missing, the runner installs app dependencies and builds it automatically.

You can still override by setting one of:

- `E2E_APP_PATH` (or `E2E_APP_PATH_ANDROID`) to an `.apk`
- `ANDROID_APP_PACKAGE` (+ usually `ANDROID_APP_ACTIVITY`) for an already installed app

To force a fresh Android app build even when an APK exists:

```sh
E2E_REBUILD_ANDROID_APP=1 npm run e2e:android
```

### iOS

Set one of:

- `E2E_APP_PATH` (or `E2E_APP_PATH_IOS`) to a `.app`/`.ipa`
- `IOS_BUNDLE_ID` for an installed simulator app

## Scenario selection

Default scenarios:

- `filesystem`
- `network`

Run only filesystem checks:

```sh
E2E_SCENARIOS=filesystem npm run e2e:android
```

Per-platform override:

- `E2E_SCENARIOS_ANDROID`
- `E2E_SCENARIOS_IOS`

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
- `IOS_BUNDLE_ID`
- `WINDOWS_APP_ID`, `WINDOWS_APP_PATH`
- `DEVICE_NAME`: generic device name
- `DEVICE_NAME_ANDROID`, `DEVICE_NAME_IOS`, `DEVICE_NAME_WINDOWS`
- `E2E_PLATFORMS`: default `android,ios,windows`
- `E2E_FORCE_IOS`: allow iOS run on non-mac host
- `E2E_FORCE_WINDOWS`: allow Windows run on non-Windows host
- `E2E_SCENARIOS`: comma-separated scenario list
- `E2E_SCENARIOS_ANDROID`, `E2E_SCENARIOS_IOS`, `E2E_SCENARIOS_WINDOWS`: per-platform scenario list
- `E2E_REBUILD_ANDROID_APP`: when truthy (`1`, `true`, `yes`, `on`), rebuild included Android E2E app before running
