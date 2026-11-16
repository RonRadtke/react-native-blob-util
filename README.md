# react-native-blob-util

[![release](https://img.shields.io/github/release/RonRadtke/react-native-blob-util.svg?style=flat-square)](https://github.com/RonRadtke/react-native-blob-util/releases) [![npm](https://img.shields.io/npm/v/react-native-blob-util.svg?style=flat-square)](https://www.npmjs.com/package/react-native-blob-util) ![](https://img.shields.io/badge/PR-Welcome-brightgreen.svg?style=flat-square) [![npm](https://img.shields.io/npm/l/react-native-blob-util.svg?maxAge=2592000&style=flat-square)](LICENSE)

File system access, downloads and uploads for React Native on Android, iOS and Windows, done in
native code, so large files never pass through JavaScript.

- **File system**: read, write, append, read and write parts of a file, copy and move files and
  directories, stat, hash, list, timestamps, app directories, assets and Android resources, bytes
  as `Uint8Array`.
- **Downloads and uploads** straight to and from files, or held in memory, with progress, cancel,
  multipart forms and explicit body types.
- **Downloads that pause and resume**, continue after a failure or a restart, or keep running after
  the app has closed (background URLSession, DownloadManager, BITS).
- **Streams** for files too large to hold in memory.
- **Android**: DownloadManager, MediaStore, content URIs. **iOS**: data protection, photo library,
  document menus, app groups.
- **Custom CA certificates and pinning** per request.
- **File picker** and opening files in other apps.
- New Architecture (TurboModule), an Expo config plugin, TypeScript declarations.

## Install

```sh
npm install react-native-blob-util
cd ios && pod install
```

Android needs nothing more; autolinking picks the library up. On Expo, add `react-native-blob-util`
to `plugins` and use a development build. Swift Package Manager works on React Native 0.87 and up.
Details, permissions and Windows: [docs/installation.md](docs/installation.md).

## Download a file

```js
import {config, fs} from 'react-native-blob-util';

const task = config({path: fs.dirs.DocumentDir + '/report.pdf'})
    .fetch('GET', 'https://example.com/report.pdf', {Authorization: 'Bearer token'});

task.progress((received, total) => console.log(received, total));

const res = await task;
if (res.ok) {
    console.log('saved to', res.path());
} else {
    await res.flush(); // the file holds the server's error page
}
```

The task can also `cancel()`, `pause()` and `resume()`; with `resumable: true` a failed download
continues where it stopped, and with `background: {id}` it outlives the app. See
[docs/downloads.md](docs/downloads.md).

## Upload a file

```js
import {fetch, fs} from 'react-native-blob-util';

const res = await fetch('POST', 'https://example.com/upload', {
    'Content-Type': 'multipart/form-data',
}, [
    {name: 'title', data: 'Holiday'},
    {name: 'photo', filename: 'photo.jpg', type: 'image/jpeg', data: {file: fs.dirs.DocumentDir + '/photo.jpg'}},
]).uploadProgress((sent, total) => console.log(sent / total));
```

A body is `{text}`, `{base64}`, `{file}`, bytes, or an array of form fields. See
[docs/requests.md](docs/requests.md).

## Read and write files

```js
import {fs} from 'react-native-blob-util';

const path = fs.dirs.DocumentDir + '/notes.txt';
await fs.writeFile(path, 'Hello', 'utf8');
await fs.appendFile(path, ', world', 'utf8');
const text = await fs.readFile(path, 'utf8');                  // 'Hello, world'
const head = await fs.read(path, {length: 5, encoding: 'bytes'}); // Uint8Array of the first 5 bytes
const {size, lastModified} = await fs.stat(path);
await fs.cp(path, fs.dirs.CacheDir + '/notes-copy.txt');
```

See [docs/file-system.md](docs/file-system.md).

## Documentation

| Page | About |
|---|---|
| [installation](docs/installation.md) | install, platform setup, Expo |
| [requests](docs/requests.md) | `fetch`, `config` options, bodies, multipart, TLS and custom CAs |
| [responses](docs/responses.md) | the response, downloading to a file, sessions |
| [progress-and-cancel](docs/progress-and-cancel.md) | progress, `stateChange`, `cancel` |
| [downloads](docs/downloads.md) | pause and resume, resumable and background downloads |
| [file-system](docs/file-system.md) | every `fs` call |
| [streams](docs/streams.md) | read and write streams |
| [open-and-pick](docs/open-and-pick.md) | open a file in another app, the file picker |
| [android](docs/android.md) | DownloadManager, MediaStore, content URIs |
| [ios](docs/ios.md) | data protection, photo library, app groups, background transfers |
| [windows](docs/windows.md) | Windows specifics |
| [file-transformer](docs/file-transformer.md) | encrypt or transform files on their way to storage |
| [errors](docs/errors.md) | error codes |
| [troubleshooting](docs/troubleshooting.md) | common problems |
| [api-reference](docs/api-reference.md) | every export in one place |

The same pages ship in the npm package under `docs/`, and [llms.txt](llms.txt) is a one-screen
summary for tools and AI agents. The TypeScript declarations ([index.d.ts](index.d.ts)) carry the
same descriptions.

## Compatibility

| react-native-blob-util | React Native |
|---|---|
| 1.0.1 and up | 0.84 and up, New Architecture only (Android `minSdk` 24, iOS 15.1) |
| 0.22.0 to 0.25 | 0.76 and up (0.22.0 for 0.76, 0.22.1 for 0.77, 0.22.2 for 0.78) |
| 0.17.0 to 0.21 | 0.65 and up |
| 0.10.16 to 0.16 | 0.60 and up |

0.25 is the last release line that supports the Old Architecture.
Do not install 1.0.0: it was published by mistake and is deprecated. Moving from 0.x to 1.x:
[Migration.md](Migration.md).

## Contributing

Bug reports and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Security
issues: [SECURITY.md](SECURITY.md). Release notes are on the
[releases page](https://github.com/RonRadtke/react-native-blob-util/releases).

License: MIT.
