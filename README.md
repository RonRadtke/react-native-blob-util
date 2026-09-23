# react-native-blob-util

[![release](https://img.shields.io/github/release/RonRadtke/react-native-blob-util.svg?style=flat-square)](https://github.com/RonRadtke/react-native-blob-util/releases) [![npm](https://img.shields.io/npm/v/react-native-blob-util.svg?style=flat-square)](https://www.npmjs.com/package/react-native-blob-util) ![](https://img.shields.io/badge/PR-Welcome-brightgreen.svg?style=flat-square) [![npm](https://img.shields.io/npm/l/react-native-blob-util.svg?maxAge=2592000&style=flat-square)]()

A project committed to making file access and data transfer easier and more efficient for React Native developers.

# I forked this project to continue working on it.

This project is a fork of https://www.npmjs.com/package/rn-fetch-blob which on the other hand is a fork of https://github.com/wkh237/react-native-fetch-blob. Both the original repository and its first fork are not maintained anymore.

The project will be continued in this repository. If you want to support the project feel free to contact me or create a pull request with your feature.

# Version Compatibility Warning

react-native-blob-util version **1.0.0** and up supports the **New Architecture only** and is only compatible with react native **0.84** and up (Android `minSdk` 24, iOS 15.1). 1.0 also changes the JavaScript API: see [Migration.md](Migration.md) for what was removed, renamed or made consistent across platforms.

react-native-blob-util version **0.22.0** and up is only compatible with react native **0.76** and up.
"0.22.0" -> 0.76 RN
"0.22.1" -> 0.77 RN
"0.22.2" -> 0.78 RN

react-native-blob-util version **0.17.0** and up is only compatible with react native **0.65** and up.

react-native-blob-util version **0.10.16** and up is only compatible with react native **0.60** and up.

0.25 is the last release that also supports the Old Architecture. From 1.0 the native modules are written in Kotlin (Android), Swift (iOS) and C++/WinRT (Windows). More on the New Architecture: https://reactnative.dev/architecture/landing-page

## Features

- Download straight to a file and upload straight from a file, without passing the data through JS as base64
- Upload and download progress, cancellation, multipart forms
- A file system API that works on files natively: read, write, copy, move, hash, slice, stream
- Access to Android's MediaStore (Downloads, Pictures, Music, Movies) under scoped storage
- Open a file in another app, or let the user pick one
- Custom CA certificates per request
- Android, iOS and Windows

This README and [index.d.ts](index.d.ts) are the reference for the 1.0 API. The
[wiki](https://github.com/RonRadtke/react-native-blob-util/wiki) describes the API before 1.0.

## Table of contents

* [Installation](#installation)
* [Usage](#usage)
* [Coming from 0.x](#coming-from-0x)
* [Requests](#requests)
    * [A simple request](#a-simple-request)
    * [The response](#the-response)
    * [Download to a file](#download-to-a-file)
    * [Request bodies](#request-bodies)
    * [Multipart form data](#multipart-form-data)
    * [Progress](#progress)
    * [Cancel a request](#cancel-a-request)
    * [Config options](#config-options)
    * [Android DownloadManager](#android-downloadmanager)
    * [Self-Signed SSL Server](#self-signed-ssl-server)
    * [Custom CA Certificates](#custom-ca-certificates)
    * [Transfer encoding and caching](#transfer-encoding-and-caching)
* [File System](#file-system)
    * [Directories](#directories)
    * [Reading and writing files](#reading-and-writing-files)
    * [Encodings](#encodings)
    * [Other file operations](#other-file-operations)
    * [What the calls resolve](#what-the-calls-resolve)
    * [File streams](#file-streams)
    * [Cache file management](#cache-file-management)
    * [Assets](#assets)
    * [Platform-specific calls](#platform-specific-calls)
    * [content:// URIs on Android](#content-uris-on-android)
* [Setting A File Transformer](#setting-a-file-transformer)
* [Opening and picking files](#opening-and-picking-files)
* [Android media storage](#android-media-storage)
* [Errors](#errors)
* [Performance Tips](#performance-tips)
* [Caveats](#caveats)
* [Development](#development)

## Installation

```sh
npm install --save react-native-blob-util
```

**iOS**: run `pod install` from the `ios` directory. CocoaPods is the only supported way to add the library.

```sh
cd ios; pod install; cd ..
```

**Android**: autolinking picks the library up; there is nothing to link by hand. The library uses the OkHttp that ships with React Native (or the one your app uses).

**Expo**: the library works with a development build (`npx expo prebuild`), not in Expo Go. Its config plugin is only needed for [custom CA certificates](#setup-with-expo).

You can also install a branch straight from GitHub:

```sh
npm install --save github:RonRadtke/react-native-blob-util#<branch_name>
```

### Android permissions

The library's manifest already declares `INTERNET`, `ACCESS_NETWORK_STATE` (used by `wifiOnly`),
`READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` and `DOWNLOAD_WITHOUT_NOTIFICATION`; they are
merged into your app. The DownloadManager completion receiver is registered at runtime, so your
manifest needs no `DOWNLOAD_COMPLETE` intent filter.

Storage permissions are granted at runtime. Your app's own directories (`fs.dirs.DocumentDir`,
`CacheDir`, and the app-specific `DownloadDir`, `PictureDir` and so on) need no permission. To write
to shared storage on Android 9 and lower (the `Legacy*Dir` directories), request
`WRITE_EXTERNAL_STORAGE` with [PermissionsAndroid](https://reactnative.dev/docs/permissionsandroid).
On Android 10 and up, use the [media API](#android-media-storage) instead.

## Usage

The default export holds everything:

```js
import ReactNativeBlobUtil from 'react-native-blob-util';

const res = await ReactNativeBlobUtil.fetch('GET', 'https://example.com/data.json');
const exists = await ReactNativeBlobUtil.fs.exists(ReactNativeBlobUtil.fs.dirs.DocumentDir + '/notes.txt');
```

The same objects are also named exports:

```js
import {fetch, config, fs, open, media, wrap, session, base64} from 'react-native-blob-util';

const res = await fetch('GET', 'https://example.com/data.json');
const exists = await fs.exists(fs.dirs.DocumentDir + '/notes.txt');
```

`CanceledFetchError`, `FetchBlobResponse`, `URIUtil` and `getUUID` are named exports as well.

The API is grouped by what a call does:

| Namespace | For |
|---|---|
| `fetch`, `config` | HTTP requests |
| `fs` | files and directories |
| `open` | showing a file in another app, or letting the user pick one |
| `media` | Android's MediaStore, Downloads app and media scanner |

A call a platform cannot make rejects with `ENOTSUP`.

## Coming from 0.x

[Migration.md](Migration.md) lists everything 1.0 changes: removed APIs (the Web API polyfills,
`JSONStream`, `response.blob()`), renamed calls, values that are now the same on every platform,
error codes, request body rules and the Android `content://` security fix.

The old names keep working for now and print one deprecation warning each:

- the `android`, `ios` and `MediaCollection` namespaces (use `open.*`, `media.*` and `fs.*`);
- `fs.readFileWithTransform` and `fs.writeFileWithTransform` (use `readFile`/`writeFile` with `{transform: true}`);
- `fs.lstat`, `fs.scanFile`, `fs.pathForAppGroup`, `fs.syncPathAppGroup`;
- the config keys `transformFile`, `addAndroidDownloads`, `wifiOnly`, `targetHostIp` and `IOSBackgroundTask`.

## Requests

Requests run in native code. The response can be held in memory or written straight to a file.

### A simple request

```js
import {fetch} from 'react-native-blob-util';

async function loadItems() {
    try {
        const res = await fetch('GET', 'https://example.com/api/items', {
            Authorization: 'Bearer access-token',
        });
        if (!res.ok) {
            console.warn('Server answered', res.status);
            return null;
        }
        return await res.json();
    } catch (err) {
        // The request itself failed: no connection, timeout, TLS error, cancelled ...
        console.warn(err.code, err.message);
        return null;
    }
}
```

An HTTP error status (404, 500, ...) resolves like any other response; check `res.ok` or
`res.status`. The promise only rejects when the request fails. See [Errors](#errors).

Cookies set by other requests in the app (React Native's `fetch`, axios) are sent along.

### The response

| Member | What it is |
|---|---|
| `res.status` | the HTTP status |
| `res.ok` | `true` for a status of 200..299 |
| `res.headers` | the response headers, names in lower case |
| `res.url` | the URL the body came from, after redirects; `undefined` when unknown |
| `res.info()` | the full response info: `status`, `headers`, `redirects`, `respType`, ... |
| `res.text()` | the body as text (UTF-8) |
| `res.json()` | the body parsed as JSON |
| `res.base64()` | the body as a base64 string |
| `res.array()` | the body as byte values 0..255 |
| `res.arrayBuffer()` | the body as an `ArrayBuffer` |
| `res.path()` | the path of the response file, or `null` when the body is in memory |
| `res.flush()` | removes the response file; resolves at once when there is none |
| `res.readFile(encoding)`, `res.readStream(encoding)` | read the response file; reject `EINVAL` when the body is not a file |
| `res.session(name)` | adds the response file to a [session](#cache-file-management); throws `EINVAL` when the body is not a file |

`text()`, `json()`, `base64()`, `array()`, `arrayBuffer()` and `flush()` always return a Promise,
whether the body is in memory or in a file.

### Download to a file

A large response should not pass through JS. With `fileCache: true` it is written to a file with
a random name in the cache directory; `appendExt` gives that file an extension. With `path` it is
written where you say.

```js
import {config, fs} from 'react-native-blob-util';

const res = await config({
    path: fs.dirs.DocumentDir + '/report.pdf',
}).fetch('GET', 'https://example.com/report.pdf', {
    Authorization: 'Bearer access-token',
});

if (!res.ok) {
    // The error page was written to the file; don't keep it.
    await res.flush();
    throw new Error(`Download failed with status ${res.status}`);
}
console.log('Saved to', res.path());
```

Always check `res.ok` before using a downloaded file: an error status still resolves, and the
file then holds the server's error body.

```js
import {Image} from 'react-native';
import {config} from 'react-native-blob-util';

const res = await config({fileCache: true, appendExt: 'png'})
    .fetch('GET', 'https://example.com/image.png');

// An Image source needs the file:// prefix on Android; iOS accepts it as well.
const image = <Image source={{uri: 'file://' + res.path()}} />;
```

Files written by `fileCache` or `path` are **not** removed automatically. See
[Cache file management](#cache-file-management).

**Use a file transformer**: with `transform: true` the registered
[file transformer](#setting-a-file-transformer) runs on the response before it is written to disk
(for example to encrypt it). It only applies when the response is written to a file.

```js
const res = await config({
    path: fs.dirs.DocumentDir + '/secret.bin',
    transform: true,
}).fetch('GET', 'https://example.com/secret.bin');
```

### Request bodies

Say what a body is with one of the explicit forms. They are never guessed from anything:

| Body | Sent as |
|---|---|
| `{text: string}` | the string, as it is |
| `{base64: string}` | the bytes the base64 string encodes |
| `{file: path}` | the contents of a file: a path, or a `content://` URI on Android |
| an `ArrayBuffer` or a typed array (`Uint8Array`, ...) | the bytes |
| an array of fields | a [multipart form](#multipart-form-data) |

```js
import {fetch, fs} from 'react-native-blob-util';

// JSON, or any string that comes from a user or a server
await fetch('POST', 'https://example.com/api/notes', {
    'Content-Type': 'application/json',
}, {text: JSON.stringify({title: 'Hello'})});

// Binary data you hold as base64
await fetch('POST', 'https://content.dropboxapi.com/2/files/upload', {
    Authorization: 'Bearer access-token',
    'Dropbox-API-Arg': JSON.stringify({path: '/img-from-react-native.png', mode: 'add', autorename: true, mute: false}),
    'Content-Type': 'application/octet-stream',
}, {base64: base64ImageString});

// A file, streamed from storage
await fetch('PUT', 'https://example.com/upload/video.mp4', {
    'Content-Type': 'video/mp4',
}, {file: fs.dirs.DocumentDir + '/video.mp4'});

// Bytes
await fetch('POST', 'https://example.com/api/blob', {
    'Content-Type': 'application/octet-stream',
}, new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
```

A **plain string** body is read by the rule 0.x used, the same way on every platform:

- a string made by `wrap(path)` is a file (`wrap` works for paths and `content://` URIs);
- with a `Content-Type` that ends in `;base64` (removed before sending) or starts with
  `application/octet`, the string is base64;
- anything else is text. Without a `Content-Type` a string is text.

```js
import {fetch, wrap} from 'react-native-blob-util';

await fetch('POST', 'https://example.com/upload', {
    'Content-Type': 'application/octet-stream',
}, wrap(pathToFile));
```

Prefer `{text}` for a string you did not write yourself: a plain string that happens to start with
the file prefix is uploaded as that file's contents.

Other rules:

- `GET` and `HEAD` reject a body with `EINVAL`. `DELETE` and the other methods send it.
- A file body whose file does not exist rejects with `ENOENT`.
- A header name or value containing CR, LF or NUL rejects with `EINVAL`. `null` and `undefined`
  header values are sent as `""`.

### Multipart form data

Pass an array of fields as the body. The library sets `Content-Type: multipart/form-data` with
its boundary.

Each field has a `name` and `data`, and optionally a `filename` and a `type` (the part's MIME
type). `data` can use the explicit forms above. A plain string is text when the field has no
`filename`, and base64 (or a `wrap(path)` file) when it has one. A file part without a `filename`
is named after the file.

```js
import {fetch, fs, wrap} from 'react-native-blob-util';

const res = await fetch('POST', 'https://example.com/upload-form', {
    Authorization: 'Bearer access-token',
    'Content-Type': 'multipart/form-data',
}, [
    // text fields
    {name: 'name', data: 'user'},
    {name: 'info', data: {text: JSON.stringify({mail: 'example@example.com', tel: '12345678'})}},
    // a file from storage, with its own MIME type
    {name: 'avatar', filename: 'avatar.png', type: 'image/png', data: {file: fs.dirs.DocumentDir + '/avatar.png'}},
    // a file from the app bundle
    {name: 'ringtone', filename: 'ring.mp3', type: 'audio/mpeg', data: wrap(fs.asset('default-ringtone.mp3'))},
    // binary data held as base64
    {name: 'thumbnail', filename: 'thumb.jpg', type: 'image/jpeg', data: {base64: thumbnailBase64}},
]);
```

A `name` or `filename` containing `"`, CR or LF is escaped as browsers do (`%22`, `%0D`, `%0A`); a
`type` containing CR or LF rejects with `EINVAL`.

### Progress

`progress` reports the download, `uploadProgress` the upload. Both return the task, so they chain,
and both take an optional first argument `{interval, count}`:

- `interval`: report at most every this many milliseconds. Default 250; `0` reports every chunk.
- `count`: report this many times in total. Default unlimited. Needs a `Content-Length` from the server.

```js
import {fetch} from 'react-native-blob-util';

const res = await fetch('POST', 'https://example.com/upload', {
    'Content-Type': 'application/octet-stream',
}, {file: pathToFile})
    .uploadProgress({interval: 250}, (sent, total) => {
        console.log('uploaded', sent / total);
    })
    .progress({count: 10}, (received, total) => {
        console.log('downloaded', received / total);
    });
```

`stateChange(fn)` is called with the response info as soon as the headers arrive, before the body
is complete.

### Cancel a request

`task.cancel()` cancels the request. The task rejects right away with a `CanceledFetchError`
whose `code` is `ECANCELED`; the Promise `cancel()` returns resolves once native has cancelled.
Cancelling a finished task does nothing.

```js
import {CanceledFetchError, fetch} from 'react-native-blob-util';

const task = fetch('GET', 'https://example.com/large-file');

task.then((res) => {
    // ...
}).catch((err) => {
    if (err.code === 'ECANCELED') {
        return; // cancelled by us
    }
    console.warn(err);
});

// later
await task.cancel();
```

`err instanceof CanceledFetchError` works as well. `task.taskId` is the id native knows the task by.

### Config options

`config(options)` returns a `fetch` bound to those options:

```js
import {config} from 'react-native-blob-util';

const res = await config({fileCache: true, timeout: 30000}).fetch('GET', url);
```

| Option | Type | Description |
|---|---|---|
| `fileCache` | `boolean` | Write the response to a file with a random name in the cache directory. |
| `appendExt` | `string` | Extension for the `fileCache` file name. |
| `path` | `string` | Write the response to this path. Overrides `fileCache` and `appendExt`. |
| `overwrite` | `boolean` | Replace an existing file at `path` (default `true`). `false` appends the response to the existing file. |
| `key` | `string` | Cache the response under this key: if a file downloaded with the same key exists, it is returned without a request. |
| `session` | `string` | Add the response file to this [session](#cache-file-management). |
| `timeout` | `number` | Request timeout in milliseconds. Default 60000. |
| `followRedirect` | `boolean` | Follow redirects (default `true`). |
| `transform` | `boolean` | Run the [file transformer](#setting-a-file-transformer) on a response written to a file. |
| `trusty` | `boolean` | Skip certificate validation. For development only; see [Self-Signed SSL Server](#self-signed-ssl-server). |
| `customCACerts` | `string[]` | Trust these bundled CA certificates. See [Custom CA Certificates](#custom-ca-certificates). |
| `pinnedHosts` | `string[]` | Apply `customCACerts` to these hosts only. |
| `trustSystemCerts` | `boolean` | Keep trusting the system CAs alongside `customCACerts`. Default `false`. |
| `android.downloadManager` | object | Download through Android's DownloadManager. See [below](#android-downloadmanager). |
| `android.wifiOnly` | `boolean` | Only send the request over WiFi. Fails with `ENETUNREACH` without WiFi. |
| `android.targetHostIp` | `string` | Send the request over the network interface that can reach this IP. |
| `ios.backgroundTask` | `boolean` | Use a background session, so the download continues while the app is suspended. |

```js
config({
    android: {wifiOnly: true},
    ios: {backgroundTask: true},
}).fetch('GET', 'https://example.com/large-file.zip');
```

Options for one platform are ignored on the others.

### Android DownloadManager

For large downloads on Android, the system's DownloadManager handles the transfer, shows the
progress in a notification and makes the file visible in the Downloads app.

<img src="img/download-manager.png" width="256">

With `downloadManager`, `fileCache` and `path` do not apply: set the destination with
`downloadManager.path`. The DownloadManager only makes `GET` requests. When it completes,
`res.path()` is the downloaded file.

```js
import {config} from 'react-native-blob-util';

const res = await config({
    android: {
        downloadManager: {
            useDownloadManager: true, // required for the other options
            notification: true,
            title: 'report.pdf',
            description: 'A file downloaded by the DownloadManager.',
            // recommended: the DownloadManager fails when the URL has no file extension
            // and no MIME type is given (the default is text/plain)
            mime: 'application/pdf',
            mediaScannable: true,
        },
    },
}).fetch('GET', 'https://example.com/report.pdf');

console.log(res.path());
```

| `downloadManager` option | Description |
|---|---|
| `useDownloadManager` | Download through the DownloadManager. Required for the other options. |
| `title`, `description` | Shown in the notification and the Downloads app. |
| `path` | Destination; must be on external storage. |
| `mime` | MIME type of the file. Default `text/plain`. |
| `mediaScannable` | Let the media scanner index the file. |
| `notification` | Show a notification while downloading and when complete. |
| `storeInDownloads` | Android 10+: store the file in the Downloads collection (may override `path`). |
| `storeLocal` | Store the file in the app's own download directory. |

<img src="img/android-notification1.png" width="256">
<img src="img/android-notification2.png" width="256">

Your app might not be allowed to change or remove a file the DownloadManager created in a
location it chose; set `path` if you need to.

To install a downloaded APK, download it to a path you set (not the default location, from which
the package installer cannot read it) and open it with [`open.file`](#opening-and-picking-files):

```js
import {config, fs, open} from 'react-native-blob-util';

const res = await config({
    android: {
        downloadManager: {
            useDownloadManager: true,
            path: fs.dirs.DownloadDir + '/awesome.apk',
            title: 'awesome.apk',
            description: 'An APK that will be installed',
            mime: 'application/vnd.android.package-archive',
            mediaScannable: true,
            notification: true,
        },
    },
}).fetch('GET', 'https://www.example.com/awesome.apk');

const apk = res.path();
if (res.ok && apk) {
    await open.file(apk, {mime: 'application/vnd.android.package-archive'});
}
```

To register a file you downloaded yourself with the Downloads app, use
[`media.addDownload`](#android-media-storage).

### Self-Signed SSL Server

By default, react-native-blob-util does not connect to a server whose certificate does not chain
to a trusted CA. `trusty: true` skips that check. It is meant for development against a test
server; to trust a private CA in production use [Custom CA Certificates](#custom-ca-certificates).

What `trusty` skips differs per platform:

- **Android** uses the `X509TrustManager` your app sets as `ReactNativeBlobUtilUtils.sharedTrustManager`
  (below). The library ships none, and a `trusty` request fails without one. The host name is
  still verified; anything else, including certificate dates, is up to your trust manager (the
  example below accepts any certificate chain).
- **iOS** accepts the server's certificate whatever issued it; a certificate for another host
  name or an expired one still fails.
- **Windows** ignores an untrusted chain; a certificate for another host name or an expired one
  still fails.

#### Kotlin
````kotlin
// MainApplication.kt
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils
import java.security.cert.X509Certificate
import javax.net.ssl.X509TrustManager

class MainApplication : Application(), ReactApplication {
    override fun onCreate() {
        super.onCreate()
        // ...
        ReactNativeBlobUtilUtils.sharedTrustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}

            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}

            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }
    }
}
````

#### Java
````java
// MainApplication.java
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils;
import java.security.cert.X509Certificate;
import javax.net.ssl.X509TrustManager;

public class MainApplication extends Application implements ReactApplication {
    @Override
    public void onCreate() {
        super.onCreate();
        // ...
        ReactNativeBlobUtilUtils.sharedTrustManager = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[]{};
            }
        };
    }
}
````

```js
import {config} from 'react-native-blob-util';

const res = await config({trusty: true}).fetch('GET', 'https://mysite.test');
```

### Custom CA Certificates

If you need to connect to a server using a custom Certificate Authority (e.g., an internal CA, self-signed CA for IoT devices, or a private PKI), you can specify custom CA certificates per request without disabling all certificate validation like `trusty` does.

This is more secure than `trusty: true` because it only trusts your specific CA rather than accepting any certificate.

#### Setup with Expo

If you use Expo managed workflow, the library ships a config plugin that bundles your certificates into both platforms automatically:

```js
// app.config.js
module.exports = {
  plugins: [
    ['react-native-blob-util', {
      customCACerts: [
        { name: 'my_root_ca', path: './certs/my_root_ca.pem' }
      ]
    }]
  ]
};
```

#### Setup without Expo (bare React Native)

- **iOS:** Add your certificate file to the Xcode project's "Copy Bundle Resources" build phase.
- **Android:** Place the certificate in `android/app/src/main/res/raw/` (use underscores in filename, no extension for DER or keep `.cer`/`.pem`).
- **Windows:** Add the certificate to the app package so it ships next to the executable (the folder reported as `MainBundleDir`).

#### Usage

```js
import {config} from 'react-native-blob-util';

const res = await config({
    customCACerts: ['my_root_ca'],                  // resource names without extension
    pinnedHosts: ['10.10.10.10', 'gateway.local'],  // optional: only apply to these hosts
    trustSystemCerts: false,                        // optional: also trust system CAs (default: false)
}).fetch('GET', 'https://10.10.10.10/api/data');
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `customCACerts` | `string[]` | — | Array of certificate resource names (without extension). Supports `.cer`, `.der`, and `.pem` formats. |
| `pinnedHosts` | `string[]` | — | When set, custom CA trust is only applied to these hosts. Other hosts use default system trust. |
| `trustSystemCerts` | `boolean` | `false` | When true, system CAs are also trusted alongside custom CAs. When false, only custom CAs are trusted. |

#### Behaviour

The same rules apply on iOS, Android and Windows:

- **Hostname verification still applies.** A custom CA changes which issuers are
  trusted, not which names a certificate is valid for, so the server certificate
  must carry the host in its subject alternative names. Connecting to an IP
  address needs an IP SAN - a common surprise with private PKI, where
  certificates are often issued for a name the device is never reached by.
- **Failure to load a certificate fails the request.** If none of the names in
  `customCACerts` resolve to a usable certificate the connection is refused
  rather than quietly falling back to the system trust store, so a typo cannot
  silently undo the pinning.
- **`pinnedHosts` scopes the custom trust.** Requests to other hosts are
  evaluated normally against the system trust store. Host names are compared
  case-insensitively. The decision is made for each connection, so a redirect to or from a
  pinned host is covered.

A rejected certificate fails the request with the code `ESSL`.

#### Alternative: Android Network Security Config

For app-wide trust (affecting all HTTP clients, not just react-native-blob-util), consider using Android's [Network Security Configuration](https://developer.android.com/training/articles/security-config) instead. This is a declarative XML approach that applies to all network requests in your app.

### Transfer encoding and caching

`Chunked` transfer encoding is off by default, since some servers do not support it. To use it,
set the `Transfer-Encoding` header:

```js
await fetch('POST', 'https://example.com/upload', {'Transfer-Encoding': 'Chunked'}, {file: pathToFile});
```

Requests use the HTTP cache. To bypass it, send `'Cache-Control': 'no-store'`.

## File System

`fs` works on files in native code; only what you read comes into JS.

Pass plain paths, without a `file://` prefix.

### Directories

`fs.dirs` holds well-known directories. A directory that does not exist on a platform is `""`.

| Key | What it is |
|---|---|
| `DocumentDir` | the app's documents (Android: its files directory) |
| `CacheDir` | the app's cache directory |
| `MainBundleDir` | the app bundle (iOS), the app's data directory (Android), the app package (Windows) |
| `LibraryDir`, `ApplicationSupportDir` | iOS only |
| `DownloadDir`, `PictureDir`, `MusicDir`, `MovieDir`, `DCIMDir` | Android: the app-specific directories on external storage; no permission needed |
| `LegacyDownloadDir`, `LegacyPictureDir`, `LegacyMusicDir`, `LegacyMovieDir`, `LegacyDCIMDir` | Android: the shared public directories. Writable only up to Android 9, with a permission; use the [media API](#android-media-storage) on 10+ |

`SDCardDir`, `SDCardApplicationDir` and `LegacySDCardDir` are deprecated; use `fs.sdCardDir()`
and `fs.sdCardApplicationDir()`.

### Reading and writing files

Every call that takes an encoding also takes an options object; the positional forms still work.

```js
import {fs} from 'react-native-blob-util';

const path = fs.dirs.DocumentDir + '/notes.txt';

const written = await fs.writeFile(path, 'Hello');          // resolves the number of bytes
await fs.appendFile(path, ', world', {encoding: 'utf8'});
const text = await fs.readFile(path);                        // utf8 by default
const b64 = await fs.readFile(path, {encoding: 'base64'});

await fs.createFile(fs.dirs.DocumentDir + '/new.txt', 'first line', {encoding: 'utf8'}); // EEXIST if it exists

// through the registered file transformer
await fs.writeFile(path, 'secret', {encoding: 'utf8', transform: true});
const plain = await fs.readFile(path, {encoding: 'utf8', transform: true});
```

| Call | Options |
|---|---|
| `fs.readFile(path, options)` | `{encoding, transform}` |
| `fs.writeFile(path, data, options)` | `{encoding, transform}` |
| `fs.appendFile(path, data, options)` | `{encoding}` |
| `fs.createFile(path, data, options)` | `{encoding}` |
| `fs.readStream(path, options)` | `{encoding, bufferSize, tick}` |
| `fs.writeStream(path, options)` | `{encoding, append}` |

`transform: true` runs the [file transformer](#setting-a-file-transformer); it cannot be combined
with `ascii`.

### Encodings

| Encoding | Read | Write |
|---|---|---|
| `utf8` (default) | a string | a string |
| `base64` | a base64 string | a base64 string, decoded before writing |
| `ascii` | an array of byte values 0..255 | an array of byte values 0..255 |
| `uri` | — | a path: the file at that path is copied, without passing through JS |

```js
import {fs} from 'react-native-blob-util';

// bytes
const header = fs.dirs.DocumentDir + '/header.bin';
await fs.writeFile(header, [0x89, 0x50, 0x4e, 0x47], {encoding: 'ascii'});
const bytes = await fs.readFile(header, {encoding: 'ascii'}); // [137, 80, 78, 71]

// append one file to another, natively
await fs.appendFile(fs.dirs.DocumentDir + '/all.log', fs.dirs.CacheDir + '/today.log', {encoding: 'uri'});
```

An unknown encoding rejects with `EINVAL`. Reading invalid UTF-8 as `utf8` gives U+FFFD for the
bad bytes. On iOS a `utf8` read stops at the first NUL byte; read such files as `base64` or `ascii`.

### Other file operations

```js
import {fs} from 'react-native-blob-util';

const dir = fs.dirs.DocumentDir + '/photos';

await fs.mkdir(dir);                                  // creates missing parents; EEXIST if it exists
const names = await fs.ls(dir);                       // ['a.jpg', 'b.jpg']
const entries = await fs.ls(dir, {stats: true});      // a stat of each entry
const info = await fs.stat(dir + '/a.jpg');           // {filename, path, size, type, lastModified}
const there = await fs.exists(dir + '/a.jpg');        // true or false
const isDirectory = await fs.isDir(dir);
await fs.cp(dir + '/a.jpg', dir + '/copy.jpg');       // an existing destination is overwritten
await fs.mv(dir + '/copy.jpg', dir + '/moved.jpg');   // an existing destination is overwritten
await fs.slice(dir + '/a.jpg', dir + '/head.bin', 0, 1024); // bytes [start, end); negative offsets count from the end
const sha = await fs.hash(dir + '/a.jpg', 'sha256');  // md5, sha1, sha224 (not on Windows), sha256, sha384, sha512
await fs.unlink(dir);                                 // removes a file or a directory; resolves if nothing is there
const {free, total} = await fs.df();                  // bytes; Android adds internal_* and external_* fields
```

`size` is in bytes and `lastModified` in milliseconds since the epoch. `type` is `'file'`,
`'directory'` or `'asset'`.

### What the calls resolve

A call resolves `undefined` unless it returns something you do not already have:

| Resolves | Calls |
|---|---|
| `undefined` | `cp`, `mv`, `mkdir`, `createFile`, `slice`, `unlink`, `excludeFromBackup`, `media.write`, `media.copyToInternal` |
| the number of bytes written | `writeFile`, `appendFile` |
| a value | `readFile`, `stat`, `ls`, `exists`, `isDir`, `hash`, `df`, `media.createFile` (a content URI) |

### File streams

Streams read and write a file in chunks, for files too large to hold in memory.

**Read stream**: register the handlers, then call `open()`. `open()` returns a Promise that
resolves when the stream reaches the end of the file and rejects with the error when it fails.

```js
import {fs} from 'react-native-blob-util';

const stream = await fs.readStream(pathToFile, {
    encoding: 'base64',
    bufferSize: 12288, // bytes per chunk; default 12288. Use a multiple of 3 for base64.
    tick: 10,          // milliseconds between chunks; default 10
});

let data = '';
stream.onData((chunk) => {
    // a string, or an array of bytes 0..255 for 'ascii'
    data += chunk;
});
stream.onEnd(() => {
    console.log('read', data.length, 'characters');
});

try {
    await stream.open();
} catch (err) {
    console.warn('read failed', err.code, err.message);
}
```

If you do not `await open()`, set `onError` instead: with `onError` set, a failure does not
become an unhandled rejection.

```js
stream.onError((err) => console.warn(err.code, err.message));
stream.open();
```

A stream can be opened once; opening a finished stream rejects with `EBADF`.

**Write stream**: `write()` resolves the stream, so writes chain. A write stream must be closed.

```js
import {fs} from 'react-native-blob-util';

const out = await fs.writeStream(pathToFile, {encoding: 'utf8', append: true});
try {
    await out.write('foo');
    await out.write('bar');
} finally {
    await out.close();
}
```

Wait for each `write()`: a write whose Promise nobody waits for can fail without anyone noticing.
Writing to or closing a closed stream rejects with `EBADF`. For an `ascii` stream, write arrays
of bytes.

### Cache file management

Files written by `fileCache` or `path` stay until you remove them:

```js
import {config, fs} from 'react-native-blob-util';

const res = await config({fileCache: true}).fetch('GET', 'https://example.com/download/file');
// ... use the file, then
await res.flush();

// or by path
await fs.unlink(somePath);
```

A **session** is a named list of files that can be removed together. Sessions are kept in JS
memory; they do not survive an app restart.

```js
import {config, session} from 'react-native-blob-util';

// add the response file when the request completes
await config({fileCache: true, session: 'foo'}).fetch('GET', 'https://example.com/a');

// or afterwards
const res = await config({fileCache: true}).fetch('GET', 'https://example.com/b');
res.session('foo');

// or any file
session('foo').add(someFilePath);
session('foo').remove(someFilePath);
console.log(session('foo').list());

// delete every file in the session and forget it
await session('foo').dispose();
```

`fs.session(name)` is the same as `session(name)`.

### Assets

`fs.asset(name)` returns a path to a file bundled with the app (Android `assets/`, the iOS app
bundle) that the other `fs` calls and `wrap()` accept:

```js
const text = await fs.readFile(fs.asset('licenses.txt'));
await fs.cp(fs.asset('default.db'), fs.dirs.DocumentDir + '/app.db');
```

### Platform-specific calls

These reject with `ENOTSUP` on other platforms.

| Call | Platform | Description |
|---|---|---|
| `fs.sdCardDir()` | Android | the external storage root |
| `fs.sdCardApplicationDir()` | Android | the app's directory on external storage |
| `fs.excludeFromBackup(path)` | iOS | exclude a file or directory from iCloud and iTunes backups |
| `fs.appGroupDir(groupName)` | iOS | the directory shared by the apps of an app group |
| `fs.appGroupDirSync(groupName)` | iOS | the same, synchronously; `""` on other platforms instead of rejecting |

### content:// URIs on Android

A `content://` URI is opened through its content provider, which decides whether your app may
read or write it. A refusal rejects with `EACCES`.

- `readFile`, `readStream`, `hash`, `exists`, `unlink`, `cp` (as source or destination),
  `writeStream`, and uploads with `{file: uri}` or `wrap(uri)` work on a URI.
- `stat` reports what the provider reports: `filename`, `size`, `lastModified`, `type: 'file'`,
  and `path` is the URI itself, not a file path.
- `ls`, `mv`, `mkdir`, `createFile`, `writeFile` and the destination of `slice` take file paths
  only and reject a URI with `ENOTSUP`. Copy the content to a file first:

```js
import {fs, open} from 'react-native-blob-util';

const uri = await open.pick({mime: 'image/*'});
if (uri) {
    const copy = fs.dirs.CacheDir + '/picked-image';
    await fs.cp(uri, copy);
    // work with `copy` as a regular file
}
```

## Setting A File Transformer

Setting a file transformer will allow you to specify how data should be transformed whenever the library is writing into storage or reading from storage. A use case for this is if you want the files handled by this library to be encrypted.

If you want to use a file transformer, you must implement an interface defined in:

[ReactNativeBlobUtilFileTransformer.h (iOS)](/ios/ReactNativeBlobUtilFileTransformer.h)

[ReactNativeBlobUtilFileTransformer.java (Android)](/android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilFileTransformer.java)

Both stay in Objective-C and Java on purpose, so implementations written in Kotlin or Swift keep compiling as well.

Then you set the File Transformer during app startup

Android (Kotlin):
```kotlin
class MyCustomEncryptor : ReactNativeBlobUtilFileTransformer.FileTransformer {
    override fun onWriteFile(data: ByteArray): ByteArray = data // encrypt here
    override fun onReadFile(data: ByteArray): ByteArray = data // decrypt here
}

class MainApplication : Application(), ReactApplication {
    override fun onCreate() {
        super.onCreate()
        // ...
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = MyCustomEncryptor()
    }
}
```

Android (Java):
```java
public class MainApplication extends Application implements ReactApplication {
    ...
    @Override
    public void onCreate() {
       ...
       ReactNativeBlobUtilFileTransformer.sharedFileTransformer = new MyCustomEncryptor();
       ...
    }
```

iOS (Swift). The protocol imports as `FileTransformer`, the class must inherit from `NSObject`, and the methods take and return non-optional `Data`:
```swift
import react_native_blob_util

final class MyCustomEncryptor: NSObject, FileTransformer {
    func onWriteFile(_ data: Data) -> Data { data } // encrypt here
    func onReadFile(_ data: Data) -> Data { data } // decrypt here
}

// in application(_:didFinishLaunchingWithOptions:)
ReactNativeBlobUtilFileTransformer.setFileTransformer(MyCustomEncryptor())
```

iOS (Objective-C):
```m
@implementation AppDelegate
...
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    ...
    [ReactNativeBlobUtilFileTransformer setFileTransformer: MyCustomEncryptor.new];
    ...
}
```

The transformer runs only where you ask for it with `transform: true`:

- `fs.readFile(path, {transform: true})`
- `fs.writeFile(path, data, {transform: true})`
- `config({transform: true})`, for a response written to a file
- `media.write(uri, path, {transform: true})`

## Opening and picking files

`open` shows a file in another app, or lets the user pick one. Pass a path without `file://`
(a `file://` URL is accepted on iOS too). These calls are not available on Windows.

| Call | Android | iOS |
|---|---|---|
| `open.file(path, {mime, scheme})` | opens the default app for `mime` (an `ACTION_VIEW` intent) | shows a full-screen preview |
| `open.chooser(path, {mime, scheme, title})` | shows an app chooser titled `title` | shows the "open in" menu |
| `open.optionsMenu(path, {scheme})` | `ENOTSUP` | shows the options menu |
| `open.pick({mime})` | shows the system file picker; resolves the chosen file's `content://` URI, or `null` when the user cancels | `ENOTSUP` |

`mime` is used on Android and `scheme` (a URI scheme your app declares) on iOS.

```js
import {open} from 'react-native-blob-util';

await open.file(pathToPdf, {mime: 'application/pdf'});
await open.chooser(pathToImage, {mime: 'image/png', title: 'Open with'});

const uri = await open.pick({mime: 'application/pdf'});
if (uri === null) {
    // the user cancelled
}
```

On Android, `open.file` rejects with `ENOAPP` when no app can open the MIME type, and a second
`open.pick` while the picker is open rejects with `EBUSY`. React Native's `Linking` cannot open a
local file on Android, and cannot install an APK; use `open.file` for both.

## Android media storage

Android 10 introduced scoped storage: an app can no longer create directories on shared external
storage or write files outside its own directories. Files that should appear in the Downloads app,
the gallery or a music player go through the MediaStore instead, which `media` wraps. An app can
only access MediaStore entries it created itself, or that the user picked. See
https://developer.android.com/training/data-storage.

Every `media` call rejects with `ENOTSUP` on iOS and Windows.

A MediaStore entry is described by `{name, mime, parentFolder}`: the file name with its extension,
its MIME type, and an optional folder inside the collection (`'MyApp/Files'` creates `MyApp` with
`Files` inside it). The collection is `'Download'`, `'Image'`, `'Video'` or `'Audio'`.

**Copy a file into the MediaStore** in one step. Resolves the entry's `content://` URI.

```js
import {config, media} from 'react-native-blob-util';

const res = await config({fileCache: true}).fetch('GET', 'https://example.com/image.png');
const downloaded = res.path();
if (res.ok && downloaded) {
    const uri = await media.copyToMediaStore(
        {name: 'image.png', parentFolder: 'MyApp', mime: 'image/png'},
        'Download',
        downloaded,
    );
}
await res.flush();
```

Data is copied from a file; to store a string, write it to a file with `fs.writeFile` first.

**Create an entry and write it** in two steps:

```js
const uri = await media.createFile({name: 'report.pdf', mime: 'application/pdf'}, 'Download');
await media.write(uri, localPath);

// through the registered file transformer
await media.write(uri, localPath, {transform: true});
```

**Copy an entry into the app's own storage**, overwriting the destination:

```js
import {fs, media} from 'react-native-blob-util';

await media.copyToInternal('content://...', fs.dirs.CacheDir + '/image.png');
```

**Read an entry**: text, a base64 string, or bytes 0..255 for `ascii`.

```js
const b64 = await media.read('content://...', {encoding: 'base64'});
```

**Register a finished download** with the Downloads app:

```js
await media.addDownload({
    title: 'report.pdf',
    description: 'The monthly report',
    mime: 'application/pdf',
    path: localPath,
    showNotification: true,
});
```

**Media scanner**: ask the scanner to index files so they show in the gallery and other apps. The
MIME type is optional; without it the scanner goes by the file extension.

```js
import {media} from 'react-native-blob-util';

await media.scan([
    {path: pathToSong, mime: 'audio/mpeg'},
    {path: pathToPhoto},
]);
```

On Android 9 and lower, `media.createFile` and `media.copyToMediaStore` reject a `name` or
`parentFolder` containing a `..` segment.

## Errors

Every rejection is an `Error` with a `code`. A failed request also has `err.respInfo`, the
response info received before it failed. The message says what happened; match on the code.

```js
import {config} from 'react-native-blob-util';

try {
    const res = await config({timeout: 10000}).fetch('GET', 'https://example.com/data');
} catch (err) {
    switch (err.code) {
        case 'ETIMEDOUT':
            // err.respInfo.timeout is true as well
            break;
        case 'ENOTFOUND':
        case 'ECONNREFUSED':
        case 'ENETUNREACH':
            break;
        default:
            console.warn(err.code, err.message, err.respInfo);
    }
}
```

| Code | Meaning |
|---|---|
| `ENOENT` | a file or directory does not exist (or the destination's directory) |
| `EISDIR` | a directory where a file was expected |
| `ENOTDIR` | a file where a directory was expected; the download directory could not be created |
| `EEXIST` | the file or directory already exists (`mkdir`, `createFile`) |
| `EACCES` | a `content://` provider refused access (Android) |
| `EBADF` | the stream is already closed |
| `ETIMEDOUT` | the request timed out |
| `ENOTFOUND` | the host name could not be resolved |
| `ECONNREFUSED` | the host refused the connection |
| `ECONNRESET` | the connection was lost |
| `ENETUNREACH` | no usable network (Android `wifiOnly` without WiFi; iOS offline) |
| `ESSL` | the TLS handshake or certificate check failed, including `customCACerts` and `pinnedHosts` rejections |
| `ECANCELED` | the request was cancelled |
| `EINVAL` | an invalid argument: URL, method, header, encoding, a body on `GET`/`HEAD` |
| `ENOTSUP` | not available on this platform, or a `content://` URI where only a file path works |
| `EBUSY` | a file picker is already open |
| `ENOAPP` | no app can open the file (Android) |
| `EUNSPECIFIED` | anything else; the message says what |

In TypeScript, `CodedError` and `FetchError` describe these errors, and `ErrorCode` is the union
of the codes.

## Performance Tips

**Read Stream and Progress Event Overhead**

If reading a large file with `fs.readStream` keeps the JS thread busy, the chunks may be too small
for the file: each chunk is one event. The default is 12288 bytes. Try a larger `bufferSize`
(a multiple of 3 for base64, for example 102399) and a larger `tick` (default 10 ms). For request
progress, raise `interval` or set `count`.

**Reduce Bridge and BASE64 Overhead**

Data that passes between JS and native has to be converted on the way. When data is large, this has a real performance cost. Use file storage instead of BASE64 where you can: download with `fileCache` or `path`, upload with `{file}`. The following chart shows how much faster loading data from storage is than a BASE64 encoded string on iPhone 6.

<img src="img/performance_1.png" style="width : 100%"/>

**ASCII Encoding has Terrible Performance**

Converting data to a JS array of numbers takes a lot of time. Use `ascii` only when you need the bytes; the following chart shows how long reading a file takes with each encoding.

<img src="img/performance_encoding.png" style="width : 100%"/>

**Concat and Replacing Files**

To concatenate or copy files you don't have to read the data into JS: the `uri` encoding of `writeFile` and `appendFile`, and `fs.cp`, do the whole thing in native code.

<img src="img/performance_f2f.png" style="width : 100%"/>

## Caveats

* This library does not urlencode unicode characters in URL automatically, see [#146](https://github.com/wkh237/react-native-fetch-blob/issues/146).
* When passing a file path to the library, remove the `file://` prefix.
* Progress and stream events are sent to JS one by one; limit them as described in [Performance Tips](#performance-tips).

## Changes

See [release notes](https://github.com/RonRadtke/react-native-blob-util/releases)

## Development

If you're interested in working on this module, see [CONTRIBUTING.md](CONTRIBUTING.md). Please feel free to make a PR or file an issue.
