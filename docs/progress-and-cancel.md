# Progress and cancel

The task `fetch` returns is a Promise with methods to follow the transfer and to stop it. They can
be called after the task has settled and do nothing then.

## progress, uploadProgress

```ts
task.progress(callback: (received: number, total: number, chunk?: string) => void): task
task.progress(config: {interval?: number, count?: number}, callback): task
task.uploadProgress(callback: (sent: number, total: number) => void): task
task.uploadProgress(config: {interval?: number, count?: number}, callback): task
```

`progress` reports the download, `uploadProgress` the upload. Both return the task, so they chain.

| Option | Default | |
|---|---|---|
| `interval` | 250 | report at most every this many milliseconds; `0` reports every chunk |
| `count` | unlimited | report this many times in all; needs a `Content-Length` |

`total` is `-1` while the length is not known (a chunked response): `received` still counts the
bytes so far, and the last event reports `(n, n)`. A [resumed download](downloads.md) counts on
from the bytes already on disk.

```js
import {fetch} from 'react-native-blob-util';

const res = await fetch('POST', 'https://example.com/upload', {
    'Content-Type': 'application/octet-stream',
}, {file: pathToFile})
    .uploadProgress({interval: 250}, (sent, total) => {
        console.log('uploaded', sent / total);
    })
    .progress({count: 10}, (received, total) => {
        console.log('downloaded', total > 0 ? received / total : received);
    });
```

## stateChange

```ts
task.stateChange(callback: (info: ReactNativeBlobUtilResponseInfo) => void): task
```

Called once, with the response info, as soon as the headers arrive and before the body is complete.

## part

```ts
task.part(callback: (chunk: string) => void): task
```

Server-push chunks, for a response sent in parts.

## cancel

```ts
task.cancel(callback?: (error?: any) => void): Promise<void>
```

Cancels the request. The task rejects right away with a `CanceledFetchError` whose `code` is
`ECANCELED`; the Promise `cancel()` returns resolves once native has cancelled. Cancelling a
finished task does nothing. A [resumable](downloads.md#resumable-downloads) download's part file is
removed; a [background](downloads.md#downloads-that-outlive-the-app) download is forgotten.

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

## pause, resume

A download to `path` can pause and resume; see [downloads.md](downloads.md#pause-and-resume).
