# Migrating to 1.0

1.0.0 rewrites the native layers and cleans up the JavaScript API. Android moves from
Java to Kotlin, and iOS from Objective-C++ to Swift; Windows stays C++. Before the old
Android and iOS code was removed, the new code was checked call by call against
recordings of how 0.25 behaved on the same device. On top of that, the JavaScript
surface loses what never worked, and the platforms are brought to one behaviour where
they disagreed. Every change to what your code sees is listed under
[JavaScript API](#javascript-api).

Most apps only need to meet the new requirements below and check the removed APIs.

## Requirements

| | 0.25 | 1.0 |
|---|---|---|
| React Native architecture | Old or New | **New Architecture only** |
| React Native | 0.76 and up | 0.84 and up (tested on 0.84 and the newest release) |
| Android `minSdk` | the app's (library fallback 16) | 24 |
| Android build | Java 8 bytecode | Java 17 bytecode, Kotlin compiled with the app's Kotlin setup |
| iOS deployment target | 11.0 | 15.1 |
| Xcode | | 16.1 or newer |
| iOS integration | CocoaPods or the bundled Xcode project | CocoaPods only |

If your app still runs on the Old Architecture, stay on 0.25 until it moves to the New
Architecture.

## JavaScript API

### One namespace per capability

The API is grouped by what a call does, not by which platform implements it. A call a
platform cannot make rejects with `ENOTSUP`. The old names keep working for one release
and print one deprecation warning each.

| Before | 1.0 |
|---|---|
| `android.actionViewIntent(path, mime)` / `ios.presentPreview(path)` | `open.file(path, {mime, scheme})` |
| `android.actionViewIntent(path, mime, title)` / `ios.presentOpenInMenu(path)` | `open.chooser(path, {mime, scheme, title})` |
| `ios.presentOptionsMenu(path)` | `open.optionsMenu(path, {scheme})` |
| `android.getContentIntent(mime)` | `open.pick(mime)` (resolves `null` when cancelled) |
| `MediaCollection.createMediaFile` | `media.createFile(fd, collection)` |
| `MediaCollection.writeToMediaFile` / `...WithTransform` | `media.write(uri, path, {transform})` (resolves `undefined`; the old names keep resolving `"Success"`) |
| `MediaCollection.copyToMediaStore`, `copyToInternal` | `media.copyToMediaStore`, `media.copyToInternal` |
| `MediaCollection.getBlob(uri, encoding)` | `media.read(uri, encoding)` |
| `android.addCompleteDownload(options)` | `media.addDownload(options)` |
| `android.scanFile(files)`, `fs.scanFile` | `media.scan(files)` |
| `android.getSDCardDir()`, `getSDCardApplicationDir()` | `media.sdCardDir()`, `media.sdCardApplicationDir()` |
| `ios.excludeFromBackupKey(path)` | `fs.excludeFromBackup(path)` |
| `ios.pathForAppGroup`, `syncPathAppGroup`, `fs.pathForAppGroup`, `fs.syncPathAppGroup` | `fs.appGroupDir(name)`, `fs.appGroupDirSync(name)` |
| `fs.readFileWithTransform(path, encoding)` | `fs.readFile(path, encoding, {transform: true})` |
| `fs.writeFileWithTransform(path, data, encoding)` | `fs.writeFile(path, data, encoding, {transform: true})` |

### Removed

- **The Web API polyfills** (`ReactNativeBlobUtil.polyfill`: Blob, File, XMLHttpRequest,
  FileReader, Fetch, ProgressEvent, Event). They were experimental since 0.8 and no
  longer worked: FileReader's read methods were stubs, and XMLHttpRequest never
  completed `json` or `arraybuffer` responses. Use React Native's own `Blob`,
  `XMLHttpRequest` and `fetch`; for file bodies and file downloads, use
  `ReactNativeBlobUtil.fetch` with `wrap(path)` and `config({path})`.
- **`ReactNativeBlobUtil.JSONStream`** and the bundled oboe.js. It replaced the global
  XMLHttpRequest when used. Stream the response to a file with `config({path})` and
  parse it, or use a streaming JSON parser of your choice on `fs.readStream`.
- **`response.blob()`** on the result of `fetch`. It returned the polyfill Blob.
  Use `response.base64()`, `response.path()` (with `config({fileCache: true})` or
  `config({path})`) or the new `response.array()`.
- **`fetch` of a `ReactNativeBlobUtil-file://` URL.** It read the file through the
  stream API without `cancel`, `taskId` or progress. Use `fs.readFile` or
  `fs.readStream`.

### Resolved values

The same call resolved different values per platform. 1.0 resolves one value everywhere:

| Call | 0.25 | 1.0 |
|---|---|---|
| `fs.createFile` | the path (Android), `[null]` (iOS), `undefined` (Windows) | the path |
| `fs.cp`, `fs.mv` | `undefined` (Android), `true` (iOS, Windows) | `true` |
| `fs.df` | four strings `internal_free`, `internal_total`, `external_free`, `external_total` (Android); `{free, total}` numbers (iOS, Windows) | `{free, total}` as numbers on every platform; Android keeps its four fields, as numbers |
| `fs.lstat` entries | `size` a string; `lastModified` a string (Android) or number (iOS) | `size` and `lastModified` numbers, like `fs.stat` |
| `fs.readFile(path, 'ascii')`, ascii `readStream` chunks, `response.array()` | bytes -128..127 (Android, iOS) or 0..255 (Windows) | bytes 0..255 |
| `ios.presentOptionsMenu`, `ios.presentOpenInMenu`, `ios.presentPreview`, `ios.excludeFromBackupKey` | `[null]` (iOS), `[]` (Windows) | `undefined` |

If you compared ascii bytes against negative values, or read `df().internal_free` as a
string, adjust those comparisons.

### Platform-specific calls

- A call that only exists on one platform now rejects on the others with an `Error`
  whose `code` is `ENOTSUP`. Before, `android.*` and `ios.present*` rejected with a
  bare string, `fs.pathForAppGroup` and `ios.excludeFromBackupKey` never settled on
  Android, and MediaCollection resolved `""` or `[]` on Windows as if it had worked.
- `fs.scanFile` is now `android.scanFile`; `fs.pathForAppGroup` and
  `fs.syncPathAppGroup` are now `ios.pathForAppGroup` and `ios.syncPathAppGroup`. The
  `fs` names still work and print one deprecation warning.
- `ios.openDocument` and `ios.previewDocument` were crossed: `openDocument` showed the
  preview and `previewDocument` the options menu. They now do what their names say
  (`presentOptionsMenu` and `presentPreview`), and are deprecated in favour of those.
- `MediaCollection.createMediaFile`, `writeToMediaFile` and
  `writeToMediaFileWithTransform` are the spellings that match native; the old
  `...Mediafile` names still work and warn once.
- A cancelled `fetch` rejects with `CanceledFetchError`, which now has `code:
  'ECANCELED'` and is also a named export: `import {CanceledFetchError} from
  'react-native-blob-util'`.

### Types

- `index.js.flow` is gone; `index.d.ts` is the only declaration file and now matches
  the JavaScript. Names that changed: `RNFetchBlobDf` is `ReactNativeBlobUtilDf`
  (the old name stays as a deprecated alias), `ReactNativeBlobUtilStream` is
  `ReactNativeBlobUtilReadStream` (alias kept), `ReactNativeBlobUtilFile` and `Net`
  are removed (nothing implemented them), and `config()` returns `{fetch}` rather than
  the whole API. `StatefulPromise` gains `stateChange`, `part` and `taskId`;
  `readFile`, `createFile` and `writeFile` are typed per encoding.

### Error codes

Every rejection now carries a `code`. Before, the native methods that reported through a
callback (`exists`, `writeStream`, the write stream's `write` and `close`, `unlink`,
`session.dispose`, `stat`, `lstat`, `cp`, `mv`, `df`, `scanFile`, `cancelRequest`)
either stamped `EUNSPECIFIED` on every failure or gave no code at all, and a `fetch`
error had neither a code nor the response info. Now:

- `stat`, `lstat`, `cp` and `mv` reject with `ENOENT` when the source, or the
  destination's directory, is missing. `writeStream` rejects with `EISDIR` for a
  directory, `ENOENT` when the file cannot be created and `ENOTDIR` when its parent
  cannot. Writing to or closing a stream that was already closed rejects with `EBADF`
  (on Android this used to crash the app). Anything else keeps `EUNSPECIFIED`.
- A failed `fetch` rejects with an `Error` whose `respInfo` holds the response info
  received so far and whose `code` names the failure the same way on every platform:

  | Code | Meaning |
  |---|---|
  | `ETIMEDOUT` | the request timed out (`respInfo.timeout` is also true) |
  | `ENOTFOUND` | the host name could not be resolved |
  | `ECONNREFUSED` | the host refused the connection |
  | `ECONNRESET` | the connection was lost |
  | `ENETUNREACH` | no usable network (Android `wifiOnly` without WiFi; iOS offline) |
  | `ESSL` | the TLS handshake or certificate check failed, including `customCACerts` and `pinnedHosts` rejections |
  | `ECANCELED` | the task was cancelled |
  | `EINVAL` | the URL or method is invalid |
  | `ENOTDIR` | the download directory could not be created |
  | `EUNSPECIFIED` | anything else; the message says what |
- `task.cancel(callback)`: the callback is called once native has cancelled, with an
  error argument if that failed. It used to receive `(null, taskId)`.
- Messages are unchanged where they existed, so string matching on messages keeps
  working; switch to `err.code` when you can.

### Behaviour brought in line across platforms

Where the platforms disagreed, 1.0 picks one behaviour:

| Operation | Before | 1.0 |
|---|---|---|
| `fs.unlink` on a missing path | rejected on Android, resolved on iOS | resolves everywhere |
| `session.dispose` with a missing file | resolved on Android, rejected on iOS | resolves everywhere |
| `fs.cp` / `fs.mv` onto an existing file | Android overwrote, iOS and Windows rejected (cp) | overwrite everywhere |
| `fs.writeFile` onto a directory | ENOENT (Android), EISDIR (iOS) | EISDIR |
| `fs.writeStream` onto a directory | EUNSPECIFIED (Android), EISDIR (iOS) | EISDIR |
| `fs.writeFile` with invalid base64 | resolved 0 (Android), EINVAL (iOS) | EINVAL |
| `fs.readFile` on a directory | EISDIR (Android), resolved "" (iOS) | EISDIR |
| `fs.readFile` utf8 of invalid bytes | U+FFFD (Android), null (iOS) | U+FFFD |
| utf8 `readStream` with a character split across chunks | ok (Android), error (iOS) | ok |
| `fs.createFile(path, src, 'uri')` with a missing source | ENOENT (Android), empty file (iOS) | ENOENT |
| `fs.hash` / `fs.slice` on a missing file | ENOENT (Android), EUNSPECIFIED (iOS) | ENOENT |
| `fs.mkdir` on an existing directory | EEXIST (Android, iOS), resolved (Windows) | EEXIST |
| `fs.ls` on a missing path | ENOENT (Android, iOS), ENOTDIR (Windows) | ENOENT |
| `lstat` `lastModified` on Windows | seconds | milliseconds, like the other platforms |
| `android.getContentIntent` when the user cancels | never settled | resolves `null`; a second call while the picker is open rejects `EBUSY` |
| `android.actionViewIntent` | resolved `true`, then `null` again on resume | resolves `true` once |
| `respInfo.respType` on Android | `""` for every text response (a broken header check) | `text`, `json` or `blob` by Content-Type, as on iOS |
| `fs.slice` on Windows | wrote the slice into the source file, from an empty buffer | writes the range to the destination |
| `fs.ls` on Windows | listed the parent directory | lists the directory itself |
| `session.dispose` on Windows | failed on every file | removes the files; missing ones are skipped |
| `fs.dirs` on Windows | 7 directories set | every key set (Android-only ones are `""`) |

Network-level differences stay documented rather than aligned: a URL without a host
(`http://`) is `EINVAL` on Android, which rejects it before connecting, and
`ECONNREFUSED` on iOS, which tries to connect; only iOS puts `rnfbEncode` on the first
`stateChange`, and a request body without a Content-Type is sent chunked on Android and
with a Content-Length as `application/octet-stream` on iOS.

### Always a Promise

`response.text()`, `response.json()` and `response.base64()` returned a value when the
body was held in memory and a Promise when it was a file, so code worked or broke depending
on `config()`. They always return a Promise now; `await` them. `response.flush()` always
returns a Promise (resolved at once when there is no file). `task.cancel()` returns a
Promise that resolves once native has cancelled; the optional callback still works.

### Options and defaults

- The config keys `Progress`, `UploadProgress` and `indicator` are gone. Nothing read
  the first two (use `task.progress({interval, count}, fn)`), and the iOS network
  activity indicator has not existed since iOS 13.
- `task.expire(fn)` is gone. No platform ever emitted the event it listened for.
- `key` is now declared in the config types; it was always honoured.
- `fs.readStream` reads 12288 bytes per chunk by default (a multiple of 3, so base64
  chunks concatenate) instead of 10240, and `tick` defaults to 10 ms in both the
  wrapper and the stream.

## Android

Apps that follow the README don't need to change anything.

- `ReactNativeBlobUtilUtils.sharedTrustManager` is still a static field. Java and
  Kotlin code that sets it compiles unchanged.
- `ReactNativeBlobUtilFileTransformer` stays a Java class, so existing
  `FileTransformer` implementations in Java or Kotlin keep compiling, whatever
  nullability a Kotlin implementation declared.
- `ReactNativeBlobUtilPackage` keeps its name and no-argument constructor, for apps
  that register it by hand.
- The library no longer applies `kotlin-android` when the app already provides Kotlin
  (AGP 9 with `android.builtInKotlin=true`).
- The library no longer depends on `commons-lang3`. If your app used it without
  declaring it, add it to your own dependencies.
- `ReactNativeBlobUtilReq.enableTls12OnPreLollipop` returns the builder unchanged.
  It only ever did something on Android 4.1 to 4.4, which `minSdk` 24 excludes.

Classes that were package-private in Java (`ReactNativeBlobUtilFS`,
`ReactNativeBlobUtilImpl`, `ReactNativeBlobUtilConfig`, `ReactNativeBlobUtilBody`) are
now `internal` Kotlin classes. Code outside the library couldn't use them before either.

## iOS

Apps that follow the README don't need to change anything.

- `ReactNativeBlobUtilFileTransformer.h` stays Objective-C. The `FileTransformer`
  protocol and `+setFileTransformer:` are unchanged and work from an Objective-C or a
  Swift `AppDelegate`.
- The pod now contains Swift (`swift_version` 5.0) and defines a module. CocoaPods
  handles this under static libraries, static frameworks and dynamic frameworks alike.
- The only public headers are `ReactNativeBlobUtilFileTransformer.h` and
  `ReactNativeBlobUtilExceptionCatch.h`. The other headers, including
  `ReactNativeBlobUtilConst.h`, are gone: those classes are Swift now. App code that
  imported them has to stop, and apps had no documented reason to.
- `ios/ReactNativeBlobUtil.xcodeproj` is deleted. It no longer matched the sources, so
  linking the library through that project stopped working long ago. Use CocoaPods.

## Windows

No changes.
