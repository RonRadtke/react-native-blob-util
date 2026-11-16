# File system

`fs` works on files in native code; only what you read comes into JavaScript. Every call takes a
plain path or a `file://` URL (decoded, so `%20` is a space), and on Android also an
[asset](#assets-and-resources), a [resource](#assets-and-resources) or a
[content URI](android.md#content-uris) where noted. A rejection carries a [code](errors.md).

## Directories

`fs.dirs` holds well-known directories. One a platform does not have is `""`.

| Key | iOS | Android | Windows |
|---|---|---|---|
| `DocumentDir` | Documents | files directory | LocalFolder |
| `CacheDir` | Caches | cache directory | LocalCacheFolder |
| `TemporaryDir` | tmp | cache directory | TemporaryFolder |
| `MainBundleDir` | the app bundle | the app's data directory | the app package |
| `LibraryDir` | Library | `""` | LocalFolder |
| `ApplicationSupportDir` | Application Support | `""` | RoamingFolder |
| `RoamingDir` | `""` | `""` | RoamingFolder |
| `DownloadDir`, `PictureDir`, `MusicDir`, `MovieDir` | the sandbox's Downloads, Pictures, Music, Movies | app-specific directories on external storage; no permission needed | the user's folders |
| `DCIMDir` | `""` | app-specific DCIM directory on external storage | the user's camera roll |
| `RingtoneDir` | `""` | app-specific Ringtones directory on external storage | `""` |
| `ExternalCacheDir` | `""` | the cache directory on external storage | `""` |
| `LegacyDownloadDir`, `LegacyPictureDir`, `LegacyMusicDir`, `LegacyMovieDir`, `LegacyDCIMDir`, `LegacyRingtoneDir` | `""` | the shared public directories; writable up to Android 9 with a permission, see [android.md](android.md#media-storage) for 10+ | `""` |

`SDCardDir`, `SDCardApplicationDir` and `LegacySDCardDir` are deprecated; use `fs.sdCardDir()` and
`fs.sdCardApplicationDir()` (Android). `fs.externalDirs()` lists every app-specific directory on
external storage, removable volumes included (Android; `[]` elsewhere).

## Encodings

| Encoding | Read | Write |
|---|---|---|
| `utf8` (default) | a string | a string |
| `base64` | a base64 string | a base64 string; line breaks, spaces and missing padding are accepted |
| `ascii` | an array of byte values 0..255 | an array of byte values 0..255 |
| `bytes` | a `Uint8Array` (`readFile`, `read`) | — |
| `uri` | — | a path: the file at that path is copied, without passing through JS (`writeFile`, `appendFile`, `createFile`) |

Every write also takes **binary data**, an `ArrayBuffer` or a typed array such as `Uint8Array`,
written as it is whatever the encoding says; a typed array writes only the bytes it views.

An unknown encoding rejects `EINVAL`. Reading invalid UTF-8 as `utf8` gives U+FFFD for the bad
bytes. On iOS a `utf8` read of a whole file stops at the first NUL byte; read such files as
`base64`, `ascii` or `bytes`.

## readFile, writeFile, appendFile, createFile

```ts
fs.readFile(path, encoding | {encoding, transform}): Promise<string | number[] | Uint8Array>
fs.writeFile(path, data, encoding | {encoding, transform, protection}): Promise<number>
fs.appendFile(path, data, encoding | {encoding}): Promise<number>
fs.createFile(path, data, encoding | {encoding, protection}): Promise<void>
```

`writeFile` replaces the file and `appendFile` adds to it; both resolve the number of bytes
written. Android and iOS create missing parent directories; on Windows the directory must exist. `createFile` rejects `EEXIST` when the file exists.
`transform: true` runs the [file transformer](file-transformer.md); it cannot be combined with
`ascii`. `protection` sets the iOS [data protection class](ios.md#data-protection) and is ignored
elsewhere (an unknown value rejects `EINVAL` everywhere).

```js
import {fs} from 'react-native-blob-util';

const path = fs.dirs.DocumentDir + '/notes.txt';

const written = await fs.writeFile(path, 'Hello');               // 5
await fs.appendFile(path, ', world', {encoding: 'utf8'});
const text = await fs.readFile(path);                             // 'Hello, world'
const bytes = await fs.readFile(path, 'bytes');                   // Uint8Array
await fs.writeFile(fs.dirs.DocumentDir + '/copy.bin', bytes);     // binary data as it is

// append one file to another, natively
await fs.appendFile(fs.dirs.DocumentDir + '/all.log', fs.dirs.CacheDir + '/today.log', {encoding: 'uri'});
```

## read, write: part of a file

```ts
fs.read(path, {position?, length?, encoding?}): Promise<string | number[] | Uint8Array>
fs.write(path, data, {position?, encoding?}): Promise<number>
```

`read` reads `length` bytes from `position` (default 0), or to the end without a length. A range
past the end of the file reads what is there, possibly nothing. A range that ends inside a UTF-8
character decodes the broken tail as U+FFFD. It reads files and assets, and on Android also
resources and content URIs.

`write` writes at `position`, overwriting what is there and keeping the rest of the file; without
a position the data is appended. A missing file is created (its directory must exist, else
`ENOENT`); a position past the end leaves zero bytes in between. Resolves the number of bytes
written. `data` is a string (utf8 or base64 by `encoding`), byte values for `ascii`, or binary
data.

```js
const head = await fs.read(path, {length: 16, encoding: 'bytes'});      // the first 16 bytes
const tail = await fs.read(path, {position: 1024});                     // from byte 1024 on, as text
await fs.write(path, 'PATCH', {position: 3});                           // overwrite 5 bytes at 3
await fs.write(path, new Uint8Array([0x0a]));                           // append
```

A negative or fractional `position` or `length` rejects `EINVAL`; reading a directory rejects
`EISDIR`, a missing file `ENOENT`.

## touch

```ts
fs.touch(path, {mtime?: Date | number, ctime?: Date | number}): Promise<void>
```

Sets the modification time (default now) and, where the platform keeps a settable one (iOS,
Windows), the creation time; without `ctime` the creation time stays. On iOS the file system keeps
no creation time later than the modification time, so an `mtime` before the creation time moves the
creation time back to it. A missing file is created empty, as `touch` does; its directory must
exist (`ENOENT`). Works on a directory too. Times are a `Date` or milliseconds since the epoch.

```js
await fs.touch(path);                                          // now
await fs.touch(path, {mtime: new Date('2026-01-01'), ctime: 1700000000000});
```

## stat, ls

```ts
fs.stat(path): Promise<ReactNativeBlobUtilStat>
fs.ls(path): Promise<string[]>
fs.ls(path, {stats: true}): Promise<ReactNativeBlobUtilStat[]>
```

| Field | |
|---|---|
| `filename` | the name |
| `path` | the path |
| `size` | bytes |
| `type` | `'file'`, `'directory'` or `'asset'` |
| `lastModified` | milliseconds since the epoch |
| `created` | milliseconds since the epoch on iOS and Windows; `null` on Android, whose file systems do not report it to apps, and for assets |

`ls` lists the names in a directory, or with `{stats: true}` a stat of each. A missing path rejects
`ENOENT`, a file `ENOTDIR`.

## exists, isDir

```ts
fs.exists(path): Promise<boolean>
fs.isDir(path): Promise<boolean>
```

## mkdir, cp, mv, unlink

```ts
fs.mkdir(path, {protection?}): Promise<void>
fs.cp(path, dest, {protection?}): Promise<void>
fs.mv(path, dest, {protection?}): Promise<void>
fs.unlink(path): Promise<void>
```

- `mkdir` creates missing parents and rejects `EEXIST` when the path exists.
- `cp` copies a file, or a directory with everything in it. An existing destination file is
  replaced; an existing destination directory rejects `EEXIST`, and the destination's directory
  must exist (`ENOENT`). On Android the source can also be an asset, a resource or a content URI.
- `mv` moves a file or a directory, with the same rules for the destination.
- `unlink` removes a file or a directory with its contents, and resolves when nothing is there.
- `protection` sets the iOS data protection class of the result; a directory's class is inherited
  by files created in it.

## hash, slice, df

```ts
fs.hash(path, algorithm): Promise<string>
fs.slice(src, dest, start?, end?): Promise<void>
fs.df(): Promise<{free, total, internal_free?, internal_total?, external_free?, external_total?}>
```

- `hash`: `md5`, `sha1`, `sha224` (not on Windows), `sha256`, `sha384` or `sha512`, hex encoded.
- `slice` copies the bytes `[start, end)` into a new file; negative offsets count from the end.
- `df` reports free and total bytes; Android adds the internal and external volumes.

## Assets and resources

```ts
fs.asset(path: string): string
fs.resource(name: string): string   // Android
```

`fs.asset` names a file bundled with the app (Android `assets/`, the iOS app bundle) for the other
calls and for `wrap()`. `ls` lists an asset directory, and on Android `exists` and `stat` see
compressed assets as well.

`fs.resource('<type>/<name>')` names an Android app resource without its extension, such as
`fs.resource('raw/sample')` for `res/raw/sample.json`, for `readFile`, `read`, `exists`, `stat`,
`hash`, `cp` (as the source) and `readStream`. It throws an error with code `ENOTSUP` on iOS and
Windows.

```js
const text = await fs.readFile(fs.asset('licenses.txt'));
await fs.cp(fs.asset('default.db'), fs.dirs.DocumentDir + '/app.db');
const names = await fs.ls(fs.asset('templates'));
const config = await fs.readFile(fs.resource('raw/defaults'));      // Android
```

## Platform calls

These reject `ENOTSUP` on the other platforms.

| Call | Platform | |
|---|---|---|
| `fs.setAttributes(path, {protection, excludeFromBackup})` | iOS | see [ios.md](ios.md#data-protection) |
| `fs.excludeFromBackup(path)` | iOS | leave a file or directory out of iCloud and iTunes backups |
| `fs.appGroupDir(group)` | iOS | the directory an app group shares |
| `fs.appGroupDirSync(group)` | iOS | the same, synchronously; `""` elsewhere instead of rejecting |
| `fs.bundlePath(name)` | iOS | the path of `<name>.bundle` in the main bundle; `ENOENT` when there is none |
| `fs.sdCardDir()` | Android | the external storage root |
| `fs.sdCardApplicationDir()` | Android | the app's directory on external storage |
| `fs.externalDirs()` | Android | resolves `[]` elsewhere instead of rejecting |

## What the calls resolve

A call resolves `undefined` unless it returns something you do not already have:

| Resolves | Calls |
|---|---|
| `undefined` | `cp`, `mv`, `mkdir`, `createFile`, `slice`, `unlink`, `touch`, `setAttributes`, `excludeFromBackup` |
| the number of bytes written | `writeFile`, `appendFile`, `write` |
| a value | `readFile`, `read`, `stat`, `ls`, `exists`, `isDir`, `hash`, `df`, `bundlePath`, `externalDirs` |

For streaming a large file in chunks, see [streams.md](streams.md).
