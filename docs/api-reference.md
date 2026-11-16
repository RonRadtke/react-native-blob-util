# API reference

Every export of react-native-blob-util on one page, with a link to where it is explained. The
TypeScript declarations are in [index.d.ts](../index.d.ts). A call a platform cannot make rejects
`ENOTSUP`; the Platforms column says where a call does its work (A Android, I iOS, W Windows).

```js
import ReactNativeBlobUtil from 'react-native-blob-util';
import {fetch, config, fs, open, media, background, session, wrap, base64} from 'react-native-blob-util';
import {CanceledFetchError, FetchBlobResponse, URIUtil, getUUID} from 'react-native-blob-util';
```

The default export holds `fetch`, `config`, `fs`, `open`, `media`, `background`, `session`,
`wrap`, `base64` and `CanceledFetchError`.

## Requests

| Call | Resolves | Platforms | Page |
|---|---|---|---|
| `fetch(method, url, headers?, body?)` | a task that resolves a response | A I W | [requests](requests.md#fetch) |
| `config(options).fetch(...)` | the same, with options | A I W | [requests](requests.md#config) |
| `wrap(path)` | a string that makes a plain string body a file | A I W | [requests](requests.md#request-bodies) |
| `base64.encode(text)`, `base64.decode(b64)` | a string | A I W | |

## The task `fetch` returns

| Member | | Page |
|---|---|---|
| `task.taskId` | the id native knows the task by | [progress-and-cancel](progress-and-cancel.md#cancel) |
| `task.progress(config?, fn)` | download progress `fn(received, total)` | [progress-and-cancel](progress-and-cancel.md#progress-uploadprogress) |
| `task.uploadProgress(config?, fn)` | upload progress `fn(sent, total)` | [progress-and-cancel](progress-and-cancel.md#progress-uploadprogress) |
| `task.stateChange(fn)` | the response info when the headers arrive | [progress-and-cancel](progress-and-cancel.md#statechange) |
| `task.part(fn)` | server-push chunks | [progress-and-cancel](progress-and-cancel.md#part) |
| `task.cancel(fn?)` | cancels; the task rejects `ECANCELED` | [progress-and-cancel](progress-and-cancel.md#cancel) |
| `task.pause()` | stops a download to `path`, keeping what arrived | [downloads](downloads.md#pause-and-resume) |
| `task.resume()` | continues a paused download | [downloads](downloads.md#pause-and-resume) |

## The response

| Member | | Page |
|---|---|---|
| `res.status`, `res.ok`, `res.headers`, `res.url` | status, 200..299, headers, final URL | [responses](responses.md#the-response) |
| `res.taskId`, `res.type`, `res.data`, `res.respInfo` | the task's id, the body's form, the body, the response info | [responses](responses.md#the-response) |
| `res.info()` | the response info | [responses](responses.md#the-response) |
| `res.path()` | the response file, or `null` | [responses](responses.md#the-response) |
| `res.text()`, `res.json()`, `res.base64()`, `res.array()`, `res.arrayBuffer()` | the body | [responses](responses.md#the-response) |
| `res.flush()` | removes the response file | [responses](responses.md#cleaning-up) |
| `res.readFile(encoding)`, `res.readStream(encoding)` | reads the response file | [responses](responses.md#the-response) |
| `res.session(name)` | adds the response file to a session | [responses](responses.md#sessions) |

## Background downloads

| Call | Resolves | Platforms | Page |
|---|---|---|---|
| `config({path, background}).fetch('GET', url)` | a task, for a download that outlives the app | A I W | [downloads](downloads.md#downloads-that-outlive-the-app) |
| `background.list()` | the downloads not yet handed to the app | A I W | [downloads](downloads.md#downloads-that-outlive-the-app) |
| `background.attach(id)` | a task for one of them | A I W | [downloads](downloads.md#downloads-that-outlive-the-app) |
| `background.forget(id)` | `undefined`; cancels and removes it | A I W | [downloads](downloads.md#downloads-that-outlive-the-app) |

## Files

| Call | Resolves | Platforms | Page |
|---|---|---|---|
| `fs.dirs` | well-known directories (a value, not a call) | A I W | [file-system](file-system.md#directories) |
| `fs.readFile(path, encoding \| options)` | the contents | A I W | [file-system](file-system.md#readfile-writefile-appendfile-createfile) |
| `fs.writeFile(path, data, encoding \| options)` | bytes written | A I W | [file-system](file-system.md#readfile-writefile-appendfile-createfile) |
| `fs.appendFile(path, data, encoding \| options)` | bytes written | A I W | [file-system](file-system.md#readfile-writefile-appendfile-createfile) |
| `fs.createFile(path, data, encoding \| options)` | `undefined`; `EEXIST` if it exists | A I W | [file-system](file-system.md#readfile-writefile-appendfile-createfile) |
| `fs.read(path, {position, length, encoding})` | part of a file | A I W | [file-system](file-system.md#read-write-part-of-a-file) |
| `fs.write(path, data, {position, encoding})` | bytes written | A I W | [file-system](file-system.md#read-write-part-of-a-file) |
| `fs.touch(path, {mtime, ctime})` | `undefined` | A I W | [file-system](file-system.md#touch) |
| `fs.stat(path)` | a stat | A I W | [file-system](file-system.md#stat-ls) |
| `fs.ls(path, {stats})` | names, or stats | A I W | [file-system](file-system.md#stat-ls) |
| `fs.exists(path)` | `boolean` | A I W | [file-system](file-system.md#exists-isdir) |
| `fs.isDir(path)` | `boolean` | A I W | [file-system](file-system.md#exists-isdir) |
| `fs.mkdir(path, {protection})` | `undefined` | A I W | [file-system](file-system.md#mkdir-cp-mv-unlink) |
| `fs.cp(path, dest, {protection})` | `undefined` | A I W | [file-system](file-system.md#mkdir-cp-mv-unlink) |
| `fs.mv(path, dest, {protection})` | `undefined` | A I W | [file-system](file-system.md#mkdir-cp-mv-unlink) |
| `fs.unlink(path)` | `undefined` | A I W | [file-system](file-system.md#mkdir-cp-mv-unlink) |
| `fs.hash(path, algorithm)` | a hex string | A I W | [file-system](file-system.md#hash-slice-df) |
| `fs.slice(src, dest, start, end)` | `undefined` | A I W | [file-system](file-system.md#hash-slice-df) |
| `fs.df()` | free and total bytes | A I W | [file-system](file-system.md#hash-slice-df) |
| `fs.readStream(path, options)` | a read stream | A I W | [streams](streams.md#readstream) |
| `fs.writeStream(path, options)` | a write stream | A I W | [streams](streams.md#writestream) |
| `fs.session(name)` | the same as `session(name)` | A I W | [responses](responses.md#sessions) |
| `fs.asset(path)` | a path naming a bundled asset (synchronous) | A I | [file-system](file-system.md#assets-and-resources) |
| `fs.resource(name)` | a path naming an app resource (synchronous) | A | [file-system](file-system.md#assets-and-resources) |
| `fs.externalDirs()` | the app's directories on external volumes; `[]` elsewhere | A | [android](android.md#external-storage) |
| `fs.sdCardDir()` | the external storage root | A | [file-system](file-system.md#platform-calls) |
| `fs.sdCardApplicationDir()` | the app's external storage directory | A | [file-system](file-system.md#platform-calls) |
| `fs.setAttributes(path, {protection, excludeFromBackup})` | `undefined` | I | [ios](ios.md#data-protection) |
| `fs.excludeFromBackup(path)` | `undefined` | I | [ios](ios.md#backups) |
| `fs.appGroupDir(group)` | the app group's directory | I | [ios](ios.md#app-groups) |
| `fs.appGroupDirSync(group)` | the same, synchronously; `""` elsewhere | I | [ios](ios.md#app-groups) |
| `fs.bundlePath(name)` | the path of `<name>.bundle` | I | [ios](ios.md#resource-bundles) |

### Streams

`reader` is the `ReactNativeBlobUtilReadStream` that `fs.readStream` resolves, `writer` the
`ReactNativeBlobUtilWriteStream` that `fs.writeStream` resolves.

| Member | | Page |
|---|---|---|
| `reader.open()` | starts reading; resolves at the end | [streams](streams.md#readstream) |
| `reader.onData(fn)`, `reader.onEnd(fn)`, `reader.onError(fn)` | the handlers | [streams](streams.md#readstream) |
| `writer.write(data)` | writes a chunk; resolves the stream | [streams](streams.md#writestream) |
| `writer.close()` | closes the stream | [streams](streams.md#writestream) |

### Sessions

| Member | | Page |
|---|---|---|
| `session(name)` | a named list of files | [responses](responses.md#sessions) |
| `session(name).add(path)`, `session(name).remove(path)` | adds or removes a path; returns the session | [responses](responses.md#sessions) |
| `session(name).list()` | the paths | [responses](responses.md#sessions) |
| `session(name).dispose()` | deletes the files and forgets the session | [responses](responses.md#sessions) |
| `ReactNativeBlobUtilSession.getSession(name)`, `ReactNativeBlobUtilSession.setSession(name, list)`, `ReactNativeBlobUtilSession.removeSession(name)` | the session store, through `fs.ReactNativeBlobUtilSession` | |

## Opening and picking

| Call | Resolves | Platforms | Page |
|---|---|---|---|
| `open.file(path, {mime, scheme})` | `undefined` | A I | [open-and-pick](open-and-pick.md#openfile-openchooser-openoptionsmenu) |
| `open.chooser(path, {mime, scheme, title})` | `undefined` | A I | [open-and-pick](open-and-pick.md#openfile-openchooser-openoptionsmenu) |
| `open.optionsMenu(path, {scheme})` | `undefined` | I | [open-and-pick](open-and-pick.md#openfile-openchooser-openoptionsmenu) |
| `open.pick({mime, multiple})` | what the user picked | A I W | [open-and-pick](open-and-pick.md#openpick) |

## Media

| Call | Resolves | Platforms | Page |
|---|---|---|---|
| `media.copyToMediaStore(fd, collection, path)` | the entry's content URI | A | [android](android.md#media-storage) |
| `media.createFile(fd, collection)` | the entry's content URI | A | [android](android.md#media-storage) |
| `media.write(uri, path, {transform})` | `undefined` | A | [android](android.md#media-storage) |
| `media.read(uri, encoding)` | the contents | A | [android](android.md#media-storage) |
| `media.copyToInternal(uri, dest, {width, height, compression})` | `undefined` | A I | [android](android.md#media-storage), [ios](ios.md#photo-library) |
| `media.addDownload({title, description, mime, path})` | `undefined` | A | [android](android.md#media-storage) |
| `media.scan([{path, mime}])` | `undefined` | A | [android](android.md#media-storage) |

## Errors and helpers

| Export | | Page |
|---|---|---|
| `CanceledFetchError` | the rejection of a cancelled task, `code: 'ECANCELED'` | [errors](errors.md) |
| `FetchBlobResponse` | the class of a response | [responses](responses.md) |
| `URIUtil.isFileURI(uri)` | whether a string is a `wrap(path)` reference | |
| `URIUtil.unwrapFileURI(uri)` | the path inside a `wrap(path)` reference | |
| `URIUtil.removeURIScheme(uri, iterations)` | the URI without its scheme | |
| `URIUtil.wrap(path)` | the same as `wrap(path)` | |
| `getUUID()` | a random UUID v4 | |

TypeScript types: `ErrorCode`, `CodedError`, `FetchError`, `ReactNativeBlobUtilConfig`,
`ReactNativeBlobUtilStat`, `BackgroundTask`, `Encoding`, `ReadEncoding`, `BinaryData`,
`Protection` and the rest in [index.d.ts](../index.d.ts).

## Deprecated names

They keep working and print one warning each. [Migration.md](../Migration.md) lists them with
their replacements.

| Old | New |
|---|---|
| `fs.readFileWithTransform(path, encoding)` | `fs.readFile(path, {encoding, transform: true})` |
| `fs.writeFileWithTransform(path, data, encoding)` | `fs.writeFile(path, data, {encoding, transform: true})` |
| `fs.lstat(path)` | `fs.ls(path, {stats: true})` |
| `fs.scanFile(files)` | `media.scan(files)` |
| `fs.pathForAppGroup(group)` | `fs.appGroupDir(group)` |
| `fs.syncPathAppGroup(group)` | `fs.appGroupDirSync(group)` |
| `android.actionViewIntent(path, mime, title)` | `open.file` / `open.chooser` |
| `android.getContentIntent(mime)` | `open.pick({mime})` |
| `android.addCompleteDownload(options)` | `media.addDownload(options)` |
| `android.getSDCardDir()` | `fs.sdCardDir()` |
| `android.getSDCardApplicationDir()` | `fs.sdCardApplicationDir()` |
| `android.scanFile(files)` | `media.scan(files)` |
| `ios.presentOptionsMenu(path, scheme)`, `ios.openDocument(path, scheme)` | `open.optionsMenu(path, {scheme})` |
| `ios.presentOpenInMenu(path, scheme)` | `open.chooser(path, {scheme})` |
| `ios.presentPreview(path, scheme)`, `ios.previewDocument(path, scheme)` | `open.file(path, {scheme})` |
| `ios.excludeFromBackupKey(path)` | `fs.excludeFromBackup(path)` |
| `ios.pathForAppGroup(group)` | `fs.appGroupDir(group)` |
| `ios.syncPathAppGroup(group)` | `fs.appGroupDirSync(group)` |
| `MediaCollection.copyToMediaStore(fd, type, path)` | `media.copyToMediaStore` |
| `MediaCollection.createMediaFile(fd, type)`, `MediaCollection.createMediafile(fd, type)` | `media.createFile` |
| `MediaCollection.writeToMediaFile(uri, path)`, `MediaCollection.writeToMediafile(uri, path)` | `media.write(uri, path)` |
| `MediaCollection.writeToMediaFileWithTransform(uri, path)`, `MediaCollection.writeToMediafileWithTransform(uri, path)` | `media.write(uri, path, {transform: true})` |
| `MediaCollection.copyToInternal(uri, dest)` | `media.copyToInternal` |
| `MediaCollection.getBlob(uri, encoding)` | `media.read` |
| config `transformFile`, `addAndroidDownloads`, `wifiOnly`, `targetHostIp`, `IOSBackgroundTask` | `transform`, `android.downloadManager`, `android.wifiOnly`, `android.targetHostIp`, `ios.backgroundTask` |
