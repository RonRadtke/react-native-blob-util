# Installation

How to add react-native-blob-util to a React Native app on Android, iOS and Windows, with or
without Expo, and what each platform needs.

## Requirements

| | |
|---|---|
| React Native | 0.84 and up, New Architecture |
| Android | `minSdk` 24 |
| iOS | 15.1 |
| Windows | React Native for Windows 0.84 and up |

Version 1.x supports the New Architecture only. 0.25 is the last release line for the Old
Architecture; [Migration.md](../Migration.md) lists what changed in 1.x.

## npm

```sh
npm install --save react-native-blob-util
```

A branch straight from GitHub:

```sh
npm install --save github:RonRadtke/react-native-blob-util#<branch>
```

## iOS

Run `pod install` from the `ios` directory:

```sh
cd ios && pod install && cd ..
```

On React Native 0.87 and newer, Swift Package Manager autolinking works as well: the library
ships a `Package.swift`, and an app set up with `react-native spm` picks it up with nothing to
configure. CocoaPods remains the default.

To finish [background downloads](downloads.md#downloads-that-outlive-the-app) that end while the
app is not running, add one method to your `AppDelegate` (Expo's config plugin does this for you):

```swift
import react_native_blob_util

// inside class AppDelegate
func application(_ application: UIApplication,
                 handleEventsForBackgroundURLSession identifier: String,
                 completionHandler: @escaping () -> Void) {
    _ = ReactNativeBlobUtilBackground.handleEvents(forBackgroundURLSession: identifier,
                                                   completionHandler: completionHandler)
}
```

The call returns `false` for a session that is not the library's; pass those on if your app has
other background sessions. When your `AppDelegate` subclasses `RCTAppDelegate` (or Expo's
`ExpoAppDelegate`), the method is an `override`, and the other sessions go to `super`:

```swift
override func application(_ application: UIApplication,
                          handleEventsForBackgroundURLSession identifier: String,
                          completionHandler: @escaping () -> Void) {
    if !ReactNativeBlobUtilBackground.handleEvents(forBackgroundURLSession: identifier,
                                                   completionHandler: completionHandler) {
        super.application(application, handleEventsForBackgroundURLSession: identifier,
                          completionHandler: completionHandler)
    }
}
```

Without the method, a background download still finishes and is found on the next start of the
app.

## Android

Autolinking picks the library up; there is nothing to link by hand. Requests use the OkHttp that
ships with React Native (or the one your app uses).

The library's manifest declares `INTERNET`, `ACCESS_NETWORK_STATE` (used by `wifiOnly`),
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and `DOWNLOAD_WITHOUT_NOTIFICATION`, and a
receiver for `DOWNLOAD_COMPLETE` that finishes [background downloads](downloads.md#downloads-that-outlive-the-app)
while the app is not running; all are merged into your app.

Storage permissions are granted at runtime. The app's own directories (`fs.dirs.DocumentDir`,
`CacheDir`, and the app-specific `DownloadDir`, `PictureDir` and so on) need no permission. To
write to shared storage on Android 9 and lower (the `Legacy*Dir` directories), request
`WRITE_EXTERNAL_STORAGE` with [PermissionsAndroid](https://reactnative.dev/docs/permissionsandroid).
On Android 10 and up, use the [media API](android.md#media-storage) instead.

## Windows

The library builds with the app's solution through autolinking, in a packaged app (MSIX) as the
React Native for Windows templates create. See [windows.md](windows.md).

## Expo

The library works in a development build (`npx expo prebuild`), not in Expo Go. Add its config
plugin to `app.json` or `app.config.js`:

```js
// app.config.js
module.exports = {
    plugins: [
        ['react-native-blob-util', {
            // optional: CA certificates to bundle, see requests.md
            customCACerts: [{name: 'my_root_ca', path: './certs/my_root_ca.pem'}],
            // optional: leave the iOS AppDelegate alone (default true)
            iosBackgroundSessions: true,
        }],
    ],
};
```

| Plugin option | Default | What it does |
|---|---|---|
| `customCACerts` | none | Copies the certificates into the iOS bundle and Android `res/raw`. |
| `iosBackgroundSessions` | `true` | Adds the `AppDelegate` method for background downloads (above). |

## Importing

The default export holds everything; the same objects are named exports:

```js
import ReactNativeBlobUtil from 'react-native-blob-util';
import {fetch, config, fs, open, media, background, wrap, session, base64} from 'react-native-blob-util';
```

`CanceledFetchError`, `FetchBlobResponse`, `URIUtil` and `getUUID` are named exports as well.
The TypeScript declarations are in [index.d.ts](../index.d.ts).
