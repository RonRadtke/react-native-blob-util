# iOS

What is particular to iOS: data protection and backups, app groups, resource bundles, the photo
library, document menus, and background transfers.

## Data protection

iOS encrypts a file with a key tied to a data protection class. Set the class when a file or
directory is written, or afterwards:

```ts
fs.writeFile(path, data, {encoding?, protection})
fs.createFile(path, data, {encoding?, protection})
fs.mkdir(path, {protection})
fs.cp(path, dest, {protection})
fs.mv(path, dest, {protection})
fs.setAttributes(path, {protection?, excludeFromBackup?}): Promise<void>
```

| `protection` | The file can be read |
|---|---|
| `complete` | only while the device is unlocked |
| `completeUnlessOpen` | while unlocked; a file open when the device locks stays readable |
| `untilFirstAuth` | after the first unlock since boot (the system's default) |
| `none` | always |

A directory's class is inherited by files created in it, so protecting a directory covers what the
app writes there later. `setAttributes` changes only the attributes given; a missing path rejects
`ENOENT`. On Android and Windows `protection` is ignored and `setAttributes` rejects `ENOTSUP`; an
unknown class rejects `EINVAL` on every platform.

```js
import {fs} from 'react-native-blob-util';

const vault = fs.dirs.DocumentDir + '/vault';
await fs.mkdir(vault, {protection: 'complete'});
await fs.writeFile(vault + '/token.txt', token, {encoding: 'utf8', protection: 'complete'});
await fs.setAttributes(fs.dirs.DocumentDir + '/cache.db', {excludeFromBackup: true});
```

## Backups

`fs.excludeFromBackup(path)` leaves a file or directory out of iCloud and iTunes backups; it is the
same as `fs.setAttributes(path, {excludeFromBackup: true})`.

## App groups

`fs.appGroupDir(group)` resolves the directory the apps of an app group share (for an extension
and its app); `fs.appGroupDirSync(group)` is the synchronous form.

## Resource bundles

`fs.bundlePath(name)` resolves the path of `<name>.bundle` in the main bundle, and rejects `ENOENT`
when there is none. Read its files with the other `fs` calls.

## Photo library

```ts
media.copyToInternal(uri, dest, {width?, height?, compression?}): Promise<void>
```

Copies a photo library item into the app's storage: `ph://<local identifier>` or an
`assets-library://` URL, also when it is stored in iCloud. Without options an image is copied as it
is. With `width`, `height` or `compression` it is written as JPEG at `compression` (0..1, default
0.9), scaled down to fit `width` x `height` when they are given (never up, keeping its aspect
ratio). A video is copied as it is. The destination is overwritten, and its missing directories are
created. The app needs Photos access;
without it the call rejects `EACCES`, and an unknown item rejects `ENOENT`.

## Document menus

`open.file` shows a full-screen preview, `open.chooser` the "open in" menu and `open.optionsMenu`
the options menu (`UIDocumentInteractionController`). `open.pick` shows the document picker and
resolves copies in the app's temporary directory. See [open-and-pick.md](open-and-pick.md).

## Background transfers

A download with [`background`](downloads.md#downloads-that-outlive-the-app) runs in the library's
background `URLSession`, so it goes on while the app is suspended or closed. Add the
[AppDelegate method](installation.md#ios) so a download that ends while the app is not running is
finished at once; without it it is found on the next start.

`ios.backgroundTask: true` runs a request in the same session, under the task's id, and is handed
to the task that started it; it does not stay in `background.list()` once delivered.

Two iOS rules apply: a user who force-quits the app from the app switcher cancels its background
downloads, and the system may delay them on low battery or a poor network.

## Notes

- A `utf8` read of a whole file stops at the first NUL byte; read such files as `base64`, `ascii`
  or `bytes`.
- `fs.asset(path)` names a file in the app bundle.
- In Swift, import the library as `react_native_blob_util`.
