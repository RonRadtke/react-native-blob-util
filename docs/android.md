# Android

What is particular to Android: the DownloadManager, the shared media storage (MediaStore, the
Downloads app, the media scanner), `content://` URIs, app resources and assets, and permissions.

## Permissions

See [installation.md](installation.md#android). The app's own directories need no permission;
shared storage on Android 10 and up goes through the [media API](#media-storage).

## DownloadManager

The system's DownloadManager can run a download for the app: it shows the progress in a
notification and lists the file in the Downloads app.

```js
import {config} from 'react-native-blob-util';

const res = await config({
    android: {
        downloadManager: {
            useDownloadManager: true, // required for the other options
            notification: true,
            title: 'report.pdf',
            description: 'A file downloaded by the DownloadManager.',
            mime: 'application/pdf',
            mediaScannable: true,
        },
    },
}).fetch('GET', 'https://example.com/report.pdf');

console.log(res.path());
```

| `downloadManager` option | |
|---|---|
| `useDownloadManager` | download through the DownloadManager; required for the other options |
| `title`, `description` | shown in the notification and the Downloads app |
| `path` | destination on external storage, such as `fs.dirs.DownloadDir + '/report.pdf'`; one the DownloadManager does not accept rejects `EACCES` |
| `mime` | MIME type of the file, default `text/plain`; set it when the URL has no file extension |
| `mediaScannable` | let the media scanner index the file |
| `notification` | show a notification while downloading and when complete |
| `storeInDownloads` | Android 10+: store the file in the Downloads collection (may override `path`) |
| `storeLocal` | store the file in the app's `fs.dirs.DownloadDir`, under a generated name |

- It only makes `GET` requests, and `fileCache` and `path` (the request options) do not apply.
- `res.path()` is the file it wrote: the destination you set, or without one a `content://` URI
  that `fs.readFile`, `fs.cp` and `media.copyToMediaStore` read.
- A file already at the destination is replaced; with `overwrite: false` it is kept and the
  download goes to a new name, such as `report-1.pdf`, which `res.path()` returns.
- A failure rejects `EUNSPECIFIED` with the DownloadManager's reason (`HTTP 404`, insufficient
  space, ...); a download removed by the user rejects `ECANCELED`.
- Your app may not be allowed to change or remove a file the DownloadManager created in a place it
  chose; set `path` if you need to.

Without `useDownloadManager`, `android.downloadManager` lists a file downloaded the usual way in
the Downloads app once it is complete. To register a file you downloaded yourself, use
[`media.addDownload`](#media-storage). For downloads that outlive the app, see
[downloads.md](downloads.md#downloads-that-outlive-the-app); on Android they run through the
DownloadManager too.

The DownloadManager writes to shared storage. On Android 10 and lower, an app with the storage
permission can read a file there and replace it, so check a hash or signature before you trust a
file that must be the server's.

### Installing an APK

Download it to a path you set (the package installer cannot read the DownloadManager's default
location) and open it with `open.file`:

```js
import {config, fs, open} from 'react-native-blob-util';

const res = await config({
    android: {
        downloadManager: {
            useDownloadManager: true,
            path: fs.dirs.DownloadDir + '/update.apk',
            mime: 'application/vnd.android.package-archive',
            notification: true,
        },
    },
}).fetch('GET', 'https://example.com/update.apk');

if (res.ok && res.path()) {
    await open.file(res.path(), {mime: 'application/vnd.android.package-archive'});
}
```

## Media storage

Since Android 10 (scoped storage) an app can no longer write outside its own directories on
shared storage. Files that should appear in the Downloads app, the gallery or a music player go
through the MediaStore, which `media` wraps. An app can access only MediaStore entries it created
itself, or ones the user picked. Every `media` call but `copyToInternal` rejects `ENOTSUP` on iOS
and Windows.

An entry is described by `{name, mime, parentFolder}`: the file name with its extension, its MIME
type, and an optional folder inside the collection (`'MyApp/Files'`). The collection is
`'Download'`, `'Image'`, `'Video'` or `'Audio'`.

```ts
media.copyToMediaStore(fd, collection, path): Promise<string>      // the entry's content URI
media.createFile(fd, collection): Promise<string>
media.write(uri, path, {transform?}): Promise<void>
media.copyToInternal(uri, dest, {width?, height?, compression?}): Promise<void>
media.read(uri, encoding | {encoding}): Promise<string | number[]>
media.addDownload({title, description, mime, path, notification?}): Promise<void>
media.scan([{path, mime?}]): Promise<void>
```

```js
import {config, fs, media} from 'react-native-blob-util';

// copy a downloaded file into Downloads/MyApp
const res = await config({fileCache: true}).fetch('GET', 'https://example.com/image.png');
if (res.ok) {
    const uri = await media.copyToMediaStore(
        {name: 'image.png', parentFolder: 'MyApp', mime: 'image/png'}, 'Download', res.path());
}
await res.flush();

// two steps: create the entry, then write it
const uri = await media.createFile({name: 'report.pdf', mime: 'application/pdf'}, 'Download');
await media.write(uri, localPath);

// copy an entry into the app's storage, an image scaled to fit 1024 x 1024 as JPEG
await media.copyToInternal(pickedUri, fs.dirs.CacheDir + '/photo.jpg', {width: 1024, height: 1024, compression: 0.8});

// list a finished download in the Downloads app
await media.addDownload({title: 'report.pdf', description: 'The monthly report', mime: 'application/pdf', path: localPath});

// let the media scanner index files
await media.scan([{path: pathToSong, mime: 'audio/mpeg'}, {path: pathToPhoto}]);
```

`media.copyToInternal` overwrites the destination and creates its missing directories. Without
options it copies the entry as it is.
With `width`, `height` or `compression` an image is written as JPEG at `compression` (0..1,
default 0.9), scaled down to fit `width` x `height` when they are given (never up, keeping its
aspect ratio and its EXIF rotation); anything that does not decode as an image is copied as it is.
On iOS it copies photo library items; see [ios.md](ios.md#photo-library).

Data is copied from a file; to store a string, write it to a file with `fs.writeFile` first. On
Android 9 and lower, `createFile` and `copyToMediaStore` reject a `name` or `parentFolder` with a
`..` segment.

## content URIs

A `content://` URI is opened through its content provider, which decides whether the app may read
or write it; a refusal rejects `EACCES`. It is never turned into a file path.

- `readFile`, `read`, `readStream`, `hash`, `exists`, `unlink`, `cp` (as source or destination),
  `writeStream`, and uploads with `{file: uri}` or `wrap(uri)` work on a URI.
- `stat` reports what the provider reports: `filename`, `size`, `lastModified`, `type: 'file'`; its
  `path` is the URI itself.
- `ls`, `mv`, `mkdir`, `createFile`, `writeFile`, `write`, `touch` and the destination of `slice`
  take file paths only and reject a URI with `ENOTSUP`. Copy the content to a file first:

```js
const uri = await open.pick({mime: 'image/*'});
if (uri) {
    const copy = fs.dirs.CacheDir + '/picked-image';
    await fs.cp(uri, copy);
}
```

## Resources and assets

`fs.resource('raw/name')` names an app resource and `fs.asset('path')` a file in `assets/`; `ls`
lists an asset directory, and `exists` and `stat` see compressed assets too. See
[file-system.md](file-system.md#assets-and-resources).

## External storage

`fs.dirs.ExternalCacheDir` is the app's cache directory on external storage, and
`fs.externalDirs()` lists the app's directories on every external volume, the primary one first
and then removable ones such as an SD card.
