# react-native-blob-util documentation

One page per subject. Each says what the calls do, their signatures and options, what they
resolve, their errors and their platform differences, with examples.

| Page | About |
|---|---|
| [installation](installation.md) | install, iOS / Android / Windows / Expo setup, imports |
| [requests](requests.md) | `fetch`, `config` options, request bodies, multipart forms, TLS: self-signed servers and custom CAs |
| [responses](responses.md) | the response, downloading to a file, cleaning up, sessions |
| [progress-and-cancel](progress-and-cancel.md) | upload and download progress, `stateChange`, `cancel` |
| [downloads](downloads.md) | pause and resume, resumable downloads, downloads that outlive the app (`background`) |
| [file-system](file-system.md) | every `fs` call: directories, encodings, read and write (whole or in part), stat, copy, move, hash, assets |
| [streams](streams.md) | read and write streams for large files |
| [open-and-pick](open-and-pick.md) | open a file in another app, the system file picker |
| [android](android.md) | DownloadManager, MediaStore, content URIs, resources, permissions |
| [ios](ios.md) | data protection, backups, app groups, resource bundles, photo library, background transfers |
| [windows](windows.md) | packaging, BITS background downloads, differences from Android and iOS |
| [file-transformer](file-transformer.md) | transform files on their way to and from storage (for example to encrypt them) |
| [errors](errors.md) | the error codes |
| [troubleshooting](troubleshooting.md) | common problems |
| [api-reference](api-reference.md) | every export in one place |

Coming from 0.x: [Migration.md](../Migration.md).
