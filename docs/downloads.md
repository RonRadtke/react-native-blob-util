# Downloads

Downloads that pause and resume, continue after a failure, or keep running after the app has been
closed. All three are for a `GET` written to a file at `path`.

## Pause and resume

```ts
task.pause(): Promise<void>
task.resume(): Promise<void>
```

`pause()` stops the transfer and keeps what has arrived; the task stays pending. `resume()` asks
the server for the rest of the file and the task settles when the download is done, with the
response that completed it (status `206` when the server continued).

```js
import {config, fs} from 'react-native-blob-util';

const task = config({path: fs.dirs.DocumentDir + '/video.mp4'})
    .fetch('GET', 'https://example.com/video.mp4');
task.progress((received, total) => setProgress(received / total));

// later
await task.pause();   // resolves once the transfer has stopped
// later still
await task.resume();  // continues from the bytes on disk

const res = await task;
```

How it continues: `resume()` sends `Range: bytes=<bytes on disk>-` with `If-Range` set to the first
response's strong `ETag`, or else its `Last-Modified`.

| The server answers | Then |
|---|---|
| `206`, continuing at the offset asked for | the file is continued |
| `200` (no range support, or the file changed) | the whole file is downloaded again and replaces the partial one |
| `416` saying the file is the size on disk | the file is already complete; the task resolves (status `416`) |
| `206` from another offset, or `416` for another size | the partial file is left as it is; the task rejects `EUNSPECIFIED` |
| an error status | the partial file is left as it is; the task resolves with that status, as any response does |

Progress counts on from the bytes already on disk, so it does not jump back to 0 (unless the
server sends the whole file again).

| | |
|---|---|
| Works with | a `GET` to `path` (also with `resumable`) |
| `pause()` rejects `ENOTSUP` for | a download to memory or to `fileCache`, any other method, `android.downloadManager`, `ios.backgroundTask`, `background`, `background.attach` |
| After the task has settled | both do nothing |

`cancel()` of a paused task rejects it with `ECANCELED`, as for a running one.

## Resumable downloads

```ts
config({path, resumable: true}).fetch('GET', url, headers)
```

A download that continues where an earlier one stopped, also in a later run of the app: after a
lost connection, a timeout, a crash or the app being ended.

```js
import {config, fs} from 'react-native-blob-util';

const path = fs.dirs.DocumentDir + '/dataset.zip';
try {
    const res = await config({path, resumable: true}).fetch('GET', url, {Authorization: token});
    console.log('complete at', res.path());
} catch (err) {
    // keep what arrived; the same call later continues from there
}
```

- While it runs, the data goes to `<path>.part`, and what is needed to continue to
  `<path>.part.json`: the URL and the validator (`ETag` or `Last-Modified`). The part file becomes
  `path` once it is complete, so an incomplete file is never at `path`.
- A failure keeps both. The next `resumable` request for the same `path` and URL continues from
  the part file's size; a request for another URL starts over.
- Headers are not stored, so nothing secret is written to disk: pass them again (a fresh
  `Authorization` token is the common case).
- `cancel()` removes the part file and its notes: cancel means the file is not wanted.
  `pause()` keeps them.
- An HTTP error status rejects with `EUNSPECIFIED` and the status in the message. When the error
  body went into the part file (a fresh start) the part file is removed; when it did not (a
  continued download) the partial data stays.
- `resumable` with a method other than `GET`, without `path`, with `overwrite: false`, with
  `transform`, with a body, or with `android.downloadManager` or `ios.backgroundTask` rejects
  `EINVAL` before the request starts.

## Downloads that outlive the app

```ts
config({path, background: {id?: string} | true}).fetch('GET', url, headers)
background.list(): Promise<BackgroundTask[]>
background.attach(id: string): StatefulPromise<FetchBlobResponse>
background.forget(id: string): Promise<void>
```

The system runs the download, so it goes on while the app is suspended or closed, and the file
lands at `path` even while the app is not running. On a later start the app finds it again by its
`id`.

```js
import {background, config, fs} from 'react-native-blob-util';

// start
config({path: fs.dirs.DocumentDir + '/invoice-42.pdf', background: {id: 'invoice-42'}})
    .fetch('GET', 'https://example.com/invoices/42.pdf', {Authorization: token})
    .then((res) => showInvoice(res.path()))
    .catch((err) => console.warn(err.code, err.message));

// on any later start of the app
for (const task of await background.list()) {
    if (task.state === 'running' || task.state === 'paused') {
        background.attach(task.id)
            .progress((received, total) => updateProgress(task.id, received, total))
            .then((res) => showInvoice(res.path()));
    } else if (task.state === 'completed') {
        showInvoice(task.path);
        await background.forget(task.id);
    } else {
        console.warn(task.id, task.error.code, task.error.message);
        await background.forget(task.id);
    }
}
```

**The id.** `background: {id}` names the download; `background: true` (or `{}`) gets a new one. The
id is the task's `taskId`. It is 1 to 100 letters, digits, `.`, `_` or `-`. Starting a download
with the id of one that still runs rejects `EEXIST`.

**`background.list()`** resolves the downloads whose outcome has not reached the app yet:

| Field | |
|---|---|
| `id`, `url`, `path` | as started |
| `state` | `running`, `paused`, `completed` or `failed` |
| `written`, `total` | bytes so far, and in all (`-1` when not known) |
| `error` | `{code, message}` of a failed one |

Reading the list removes nothing, so an app that crashes right after reading it loses no result.

**`background.attach(id)`** is a task like the one `fetch` returns, with `progress()` and
`cancel()`: it resolves with the response (`res.path()` is the file) once the download is done, at
once when it already is, and rejects with the error of a failed one, or `ENOENT` for an id there
is no record of.

**`background.forget(id)`** removes the record, cancelling the download when it still runs; a task
waiting for it rejects `ECANCELED`. A file it already wrote stays.

**When a record goes.** Once a task has received the outcome (the `fetch` that started the
download, or an `attach`), the record is removed. A download that ended while no task was waiting
stays listed until it is attached or forgotten.

**Rules.** A `GET` to `path`; a body, `transform`, `overwrite: false`, `resumable` or
`android.downloadManager` rejects `EINVAL`. `pause()` rejects `ENOTSUP`.

**Per platform**

| | Runs it | Notes |
|---|---|---|
| iOS | a background `URLSession` | Add the [AppDelegate method](installation.md#ios) (Expo's plugin does) to finish a download that ends while the app is not running; without it the download is found on the next start. A user who force-quits the app from the app switcher cancels its background downloads, an iOS rule. The system may delay downloads on low battery or a poor network. |
| Android | the DownloadManager | The file is downloaded into the app's external files directory and moved to `path` when it ends, by the app or, while the app is not running, by the library's broadcast receiver. A notification shows while it runs. The system's certificate trust applies: `customCACerts`, `pinnedHosts` and `trusty` do not. An app the user force-stops gets no broadcast until it is started again; the next `list()` or `attach()` then moves the file. |
| Windows | BITS | BITS asks the server for the size (`HEAD`) and downloads in ranges. The file is put at `path` when the app next looks (`list`, `attach`, or the running app). Custom CA certificates do not apply. |
