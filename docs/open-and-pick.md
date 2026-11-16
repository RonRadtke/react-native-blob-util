# Opening and picking files

`open` shows a file in another app, or lets the user pick files.

## open.file, open.chooser, open.optionsMenu

```ts
open.file(path, {mime?, scheme?}): Promise<void>
open.chooser(path, {mime?, scheme?, title?}): Promise<void>
open.optionsMenu(path, {scheme?}): Promise<void>
```

| Call | Android | iOS | Windows |
|---|---|---|---|
| `open.file` | opens the default app for `mime` (an `ACTION_VIEW` intent) | a full-screen preview | `ENOTSUP` |
| `open.chooser` | an app chooser titled `title` | the "open in" menu | `ENOTSUP` |
| `open.optionsMenu` | `ENOTSUP` | the options menu | `ENOTSUP` |

`mime` is used on Android and `scheme` (a URI scheme your app declares) on iOS. The path is a plain
path or a `file://` URL.

```js
import {open} from 'react-native-blob-util';

await open.file(pathToPdf, {mime: 'application/pdf'});
await open.chooser(pathToImage, {mime: 'image/png', title: 'Open with'});
```

On Android `open.file` rejects `ENOAPP` when no app can open the MIME type. It also installs an
APK the app downloaded (MIME type `application/vnd.android.package-archive`); see
[android.md](android.md#installing-an-apk).

## open.pick

```ts
open.pick(mime?: string | string[]): Promise<string | null>
open.pick({mime?: string | string[], multiple?: false}): Promise<string | null>
open.pick({mime?: string | string[], multiple: true}): Promise<string[]>
```

Shows the system file picker. `mime` is one MIME type or several, such as `'image/*'` or
`['application/pdf', 'text/plain']`; the default is any file. With `multiple: true` the user can
pick several files and the call resolves a list, `[]` when the user cancels; without it, one entry
or `null`.

What a picked file is:

| Platform | Resolves | |
|---|---|---|
| Android | a `content://` URI | read it with `fs.readFile`, `fs.cp`, `fs.readStream`, or upload it with `{file: uri}` |
| iOS | the path of a copy in the app's temporary directory | the original is outside the app's storage |
| Windows | the path of a copy in `TemporaryFolder` | the picker filters by extension; the MIME types are turned into extensions, and an unknown one offers every file |

```js
import {fs, open} from 'react-native-blob-util';

const picked = await open.pick({mime: ['image/png', 'image/jpeg'], multiple: true});
for (const file of picked) {
    const copy = fs.dirs.DocumentDir + '/' + Date.now() + '.img';
    await fs.cp(file, copy);
}
```

A malformed MIME type rejects `EINVAL`; a second `open.pick` while a picker is open rejects
`EBUSY`.
