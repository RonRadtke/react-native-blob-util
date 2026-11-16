# Windows

What is particular to React Native for Windows: packaging, background downloads, and where Windows
behaves differently from Android and iOS.

## Packaging

The library runs in a packaged app (MSIX), which is what the React Native for Windows templates
build: `fs.dirs` names the package's folders, [custom CA certificates](requests.md#custom-ca-certificates)
are read from the package (`MainBundleDir`), and the records of
[background downloads](#background-downloads) are kept in the package's settings.

## Background downloads

A download with [`background`](downloads.md#downloads-that-outlive-the-app) runs through BITS, the
Background Intelligent Transfer Service: a system service that downloads for the user while the app
is closed, across restarts. On the next start, `background.list()` and `background.attach()` find
the job; the file is put at `path` when the app looks. BITS asks the server for the file's size
(`HEAD`) and downloads it in ranges, so the server must answer both. Custom CA certificates do not
apply to it.

## Downloads to a file

A download to a file is written as it arrives, so a paused or interrupted download keeps what has
arrived and can [continue](downloads.md).

## Differences

| | Windows |
|---|---|
| A body held in memory | always kept as text; download binary data to a file |
| `auto`, `binaryContentTypes` | ignored |
| `fs.hash` | no `sha224` (`ENOTSUP`) |
| Paths in results | Windows paths, with backslashes |
| `open.file`, `open.chooser`, `open.optionsMenu` | `ENOTSUP` |
| `open.pick` | a copy of the picked file in `TemporaryFolder`; the picker filters by file extension, derived from the MIME types |
| `media.*` | `ENOTSUP` |
| `fs.touch` | sets the creation time as well (`ctime`) |
| `fs.dirs` | `TemporaryDir` is `TemporaryFolder`, `RoamingDir` and `ApplicationSupportDir` the `RoamingFolder` |
