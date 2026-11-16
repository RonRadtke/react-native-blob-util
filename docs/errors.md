# Errors

Every rejection of react-native-blob-util is an `Error` with a `code`, the same on Android, iOS
and Windows. Match on the code; the message says what happened and may change.

- A failed request adds `err.respInfo`: the response info received before it failed.
- A cancelled request rejects a `CanceledFetchError` with `code: 'ECANCELED'`.
- In TypeScript, `CodedError` and `FetchError` describe these errors, and `ErrorCode` is the union
  of the codes.

```js
import {config} from 'react-native-blob-util';

try {
    const res = await config({timeout: 10000}).fetch('GET', 'https://example.com/data');
    if (!res.ok) {
        // an HTTP error status is a response, not a rejection
    }
} catch (err) {
    switch (err.code) {
        case 'ETIMEDOUT':      // err.respInfo.timeout is true as well
        case 'ENOTFOUND':
        case 'ECONNREFUSED':
        case 'ENETUNREACH':
            showOffline();
            break;
        case 'ECANCELED':
            break;
        default:
            console.warn(err.code, err.message, err.respInfo);
    }
}
```

## The codes

| Code | Meaning |
|---|---|
| `ENOENT` | a file or directory does not exist, or the destination's directory does not; a background download with an unknown id |
| `EISDIR` | a directory where a file was expected |
| `ENOTDIR` | a file where a directory was expected; the download directory could not be created |
| `EEXIST` | the file or directory already exists (`mkdir`, `createFile`, `cp` or `mv` onto a directory); a background download with this id is already running |
| `EACCES` | access refused: a `content://` provider, the file's permissions, Photos access on iOS, a DownloadManager destination |
| `EBADF` | the stream is already closed |
| `ETIMEDOUT` | the request timed out (`respInfo.timeout` is true as well) |
| `ENOTFOUND` | the host name could not be resolved |
| `ECONNREFUSED` | the host refused the connection |
| `ECONNRESET` | the connection was lost |
| `ENETUNREACH` | no usable network (Android `wifiOnly` without WiFi; iOS offline) |
| `ESSL` | the TLS handshake or the certificate check failed, including `customCACerts` and `pinnedHosts` rejections |
| `ECANCELED` | the request was cancelled; a background download was forgotten or removed by the user |
| `EINVAL` | an invalid argument: URL, method, header, encoding, a body on `GET`/`HEAD`, options that do not go together |
| `ENOTSUP` | not available on this platform, a `content://` URI where only a file path works, `pause()` of a task that cannot pause |
| `EBUSY` | a file picker is already open |
| `ENOAPP` | no app can open the file (Android) |
| `EUNSPECIFIED` | anything else; the message says what (a DownloadManager failure, an HTTP error status of a `resumable` download, a server that did not continue a range) |

## Where the rule bends

- `fs.appGroupDirSync` is synchronous, so it cannot reject: it returns `""` off iOS.
- `res.session(name)` returns a session, so it throws an `Error` with `code: 'EINVAL'` when the
  body is not a file. `res.readFile()` and `res.readStream()` reject with the same code.
- `fs.resource(name)` and `fs.asset(name)` return a path; `fs.resource` throws an error with
  code `ENOTSUP` on iOS and Windows.
- Options for one platform (`android: {...}` on iOS) are ignored, not refused.
