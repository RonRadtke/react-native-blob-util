# Troubleshooting

Common problems with react-native-blob-util and what to do about them.

## The native module is not found

`TurboModuleRegistry: 'ReactNativeBlobUtil' could not be found`, or `undefined is not an object`
on the first call:

- Rebuild the app after installing: `pod install` on iOS, then a native build (`npx react-native
  run-android`, `run-ios`, or Xcode / Android Studio). A JavaScript reload is not enough.
- Expo Go cannot load it; use a development build (`npx expo prebuild`).
- 1.x needs the New Architecture and React Native 0.84 or newer. On the Old Architecture use 0.25.
- 1.0.0 was published by mistake and is deprecated; install a later version.

## A download resolves, but the file holds an error page

An HTTP error status resolves like any other response, and the server's error body is written to
the file. Check `res.ok` (or `res.status`) before using the file, and `res.flush()` it otherwise.

## An image of a downloaded file does not show

An `Image` source needs the `file://` prefix on Android: `{uri: 'file://' + res.path()}`.

## Requests other than HTTPS fail

- iOS: App Transport Security blocks plain HTTP. Allow the host in `NSAppTransportSecurity` in
  `Info.plist`.
- Android 9 and up block cleartext traffic. Allow the host in a
  [Network Security Configuration](https://developer.android.com/training/articles/security-config).

## A URL with non-ASCII characters fails

The URL is sent as it is given. Encode it first: `encodeURI(url)`, or `encodeURIComponent` for
each part.

## A file still shows in the gallery or the Downloads app after deleting it

The media library keeps its own index. After `fs.unlink`, run `media.scan([{path}])` on the path,
or remove the entry through the MediaStore if your app created it (Android).

## A DownloadManager file cannot be removed

The DownloadManager may put the file where your app cannot change it. Set
`android.downloadManager.path` to a location you control, such as
`fs.dirs.DownloadDir + '/name.ext'`.

## A DownloadManager download fails without a reason

Set `mime`: when the URL has no file extension and no MIME type is given, the DownloadManager may
refuse the file (the default is `text/plain`).

## Reading a large file freezes the UI

Each chunk of a read stream is one event to JavaScript. Use a larger `bufferSize` (a multiple of 3
for base64, such as 102399) and a larger `tick`; for request progress, a larger `interval` or a
`count`. To read only part of a file, use `fs.read`.

## Large data is slow

Data passing between JavaScript and native is converted on the way, base64 for binary data. Keep
large data in files: download with `path` or `fileCache`, upload with `{file}`, copy and append
files with `fs.cp` and the `uri` encoding instead of reading them into JavaScript. The `ascii`
encoding (an array of numbers) is the slowest; `bytes` is the faster way to get bytes.

## An asset cannot be read on Android

Put assets in `android/app/src/main/assets/` and name them with
`fs.asset('path/inside/assets')`, without `assets/`. They are read-only: copy one with `fs.cp`
before changing it. Files in `res/` are resources, named with `fs.resource('raw/name')`.

## A background download is gone on iOS

A user who force-quits the app from the app switcher cancels its background downloads; iOS does
not continue them. Ending the app any other way, or the system ending it, lets them continue.
See [downloads.md](downloads.md#downloads-that-outlive-the-app).

## A background download does not finish on Android while the app is closed

An app the user force-stopped (Settings, "Force stop") receives no broadcasts until it is started
again, so the file is moved into place on the next start, when the app calls `background.list()` or
`background.attach()`.
