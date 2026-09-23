// A usage sample compiled against index.d.ts by tests/unit/types.test.js.
// Every declared API appears here the way an app calls it. It is never run.
import ReactNativeBlobUtil, {
    CanceledFetchError,
    FetchBlobResponse,
    URIUtil,
    getUUID,
    fetch as namedFetch,
    fs as namedFs,
    open as namedOpen,
    media as namedMedia,
    config as namedConfig,
    session as namedSession,
    wrap as namedWrap,
    base64 as namedBase64,
} from '../../../index';
import type {
    Methods,
    RNFetchBlobDf,
    CodedError,
    ErrorCode,
    Encoding,
    FetchError,
    ReactNativeBlobUtilConfig,
    ReactNativeBlobUtilDf,
    ReactNativeBlobUtilResponseInfo,
    ReactNativeBlobUtilStat,
    filedescriptor,
} from '../../../index';

const {fs, open, media, android, ios, MediaCollection, base64, config, session, wrap} = ReactNativeBlobUtil;

async function capabilities(): Promise<void> {
    await open.file('/p/a.pdf', {mime: 'application/pdf'});
    await open.chooser('/p/a.pdf', {mime: 'application/pdf', title: 'Open with'});
    await open.optionsMenu('/p/a.pdf', {scheme: 'myapp'});
    const picked: string | null = await open.pick('image/*');
    void picked;

    const fd: filedescriptor = {name: 'a.png', parentFolder: 'shots', mimeType: 'image/png'};
    const uri: string = await media.createFile(fd, 'Image');
    await media.write(uri, '/p/a.png');
    await media.write(uri, '/p/a.png', {transform: true});
    const stored: string = await media.copyToMediaStore(fd, 'Download', '/p/a.png');
    await media.copyToInternal(uri, '/p/copy.png');
    const internal: string = await MediaCollection.copyToInternal(uri, '/p/copy.png');
    const bytes: number[] = await media.read(uri, 'ascii');
    const text: string = await media.read(uri);
    await media.addDownload({title: 't', description: 'd', mime: 'text/plain', path: '/p', showNotification: true});
    await media.scan([{path: '/p/a.jpg'}]);
    const sd: string = await fs.sdCardDir();
    const sdApp: string = await fs.sdCardApplicationDir();
    void stored; void internal; void bytes; void text; void sd; void sdApp;

    await fs.excludeFromBackup('/p');
    const group: string = await fs.appGroupDir('group.example');
    const groupSync: string = fs.appGroupDirSync('group.example');
    const transformed: string = await fs.readFile('/p/t.txt', 'utf8', {transform: true});
    const transformedBytes: number[] = await fs.readFile('/p/t.bin', 'ascii', {transform: true});
    const written: number = await fs.writeFile('/p/t.txt', 'secret', 'utf8', {transform: true});
    void group; void groupSync; void transformed; void transformedBytes; void written;
}
void capabilities;

async function network(): Promise<void> {
    const options: ReactNativeBlobUtilConfig = {
        fileCache: true,
        appendExt: 'bin',
        key: 'cache-key',
        path: fs.dirs.CacheDir + '/file.bin',
        session: 'downloads',
        overwrite: true,
        timeout: 30000,
        followRedirect: false,
        transformFile: false,
        trusty: false,
        customCACerts: ['my_ca'],
        pinnedHosts: ['example.test'],
        trustSystemCerts: true,
        wifiOnly: false,
        targetHostIp: '10.0.0.1',
        addAndroidDownloads: {useDownloadManager: true, title: 't', description: 'd', path: '/p', mime: 'text/plain', mediaScannable: true, storeInDownloads: false, notification: true, storeLocal: false},
        IOSBackgroundTask: false,
    };

    const task = config(options).fetch('POST', 'https://example.test/upload', {'Content-Type': 'application/octet-stream', 'X-Empty': null}, wrap('/tmp/upload.bin'))
        .progress((received: number, total: number, chunk?: string) => { void received; void total; void chunk; })
        .progress({count: 10, interval: 100}, (received: number, total: number) => { void received; void total; })
        .uploadProgress((sent: number, total: number) => { void sent; void total; })
        .uploadProgress({interval: 500}, (sent: number, total: number) => { void sent; void total; })
        .stateChange((info: ReactNativeBlobUtilResponseInfo) => { void info.status; void info.headers['content-type']; })
        .part((chunk: string) => { void chunk; });
    const taskId: string = task.taskId;
    void taskId;

    const form = ReactNativeBlobUtil.fetch('POST', 'https://example.test/form', {}, [
        {name: 'field', data: 'value'},
        {name: 'file', filename: 'a.png', type: 'image/png', data: wrap('/tmp/a.png')},
        {name: 'explicit', data: {file: '/tmp/b.pdf'}},
        {name: 'bytes', filename: 'c.bin', data: new Uint8Array([1, 2])},
    ]);
    await ReactNativeBlobUtil.fetch('PUT', 'https://example.test/put', {}, {text: 'ReactNativeBlobUtil-file://not-a-file'});
    await ReactNativeBlobUtil.fetch('PUT', 'https://example.test/put', {}, {base64: 'AAEC'});
    await ReactNativeBlobUtil.fetch('PUT', 'https://example.test/put', {}, {file: '/tmp/upload.bin'});
    await ReactNativeBlobUtil.fetch('PUT', 'https://example.test/put', {}, new Uint8Array([1, 2]).buffer);
    await form.cancel();
    form.cancel((reason?: any) => { void reason; });

    try {
        const response: FetchBlobResponse = await task;
        const info: ReactNativeBlobUtilResponseInfo = response.info();
        void info.redirects;
        const path: string | null = response.path();
        void path;
        const text: string = await response.text();
        void text;
        const json: any = await response.json();
        void json;
        const b64: string = await response.base64();
        void b64;
        const bytes: number[] = await response.array();
        void bytes;
        await response.flush();
        response.session('downloads').add('/p').remove('/p');
        const asBytes: number[] = await response.readFile('ascii');
        void asBytes;
        const asText: string = await response.readFile('utf8');
        void asText;
        (await response.readStream('base64')).open();
        const status: number = response.status;
        const ok: boolean = response.ok;
        const contentType: string | undefined = response.headers['content-type'];
        const url: string | undefined = response.url;
        const buffer: ArrayBuffer = await response.arrayBuffer();
        void status; void ok; void contentType; void url; void buffer;
    } catch (err) {
        if (err instanceof CanceledFetchError) {
            const code: 'ECANCELED' = err.code;
            void code;
        }
        const coded = err as CodedError;
        void coded.code;
    }
}

async function filesystem(): Promise<void> {
    const dir: string = fs.dirs.DocumentDir + '/' + fs.dirs.CacheDir + fs.dirs.LegacyDownloadDir;
    await fs.createFile(dir + '/a.txt', 'hello', 'utf8');
    const created = true;
    void created;
    await fs.createFile(dir + '/b.bin', [0, 255], 'ascii');
    await fs.createFile(dir + '/c.txt', dir + '/a.txt', 'uri');

    const written: number = await fs.writeFile(dir + '/a.txt', 'hello');
    void written;
    await fs.writeFile(dir + '/b.bin', [1, 2, 3], 'ascii');
    await fs.writeFileWithTransform(dir + '/t.txt', 'secret', 'utf8');
    await fs.appendFile(dir + '/a.txt', ' world', 'utf8');
    await fs.appendFile(dir + '/b.bin', [4], 'ascii');

    const text: string = await fs.readFile(dir + '/a.txt', 'utf8');
    const b64: string = await fs.readFile(dir + '/a.txt', 'base64');
    const bytes: number[] = await fs.readFile(dir + '/b.bin', 'ascii');
    const plain: string = await fs.readFile(dir + '/a.txt');
    const transformed: string = await fs.readFileWithTransform(dir + '/t.txt', 'utf8');
    void text; void b64; void bytes; void plain; void transformed;

    const exists: boolean = await fs.exists(dir + '/a.txt');
    const isDir: boolean = await fs.isDir(dir);
    const made: void = await fs.mkdir(dir + '/sub');
    const names: string[] = await fs.ls(dir);
    const moved: void = await fs.mv(dir + '/a.txt', dir + '/sub/a.txt');
    const copied: void = await fs.cp(dir + '/sub/a.txt', dir + '/a.txt');
    await fs.unlink(dir + '/sub');
    void exists; void isDir; void made; void names; void moved; void copied;

    const stat: ReactNativeBlobUtilStat = await fs.stat(dir + '/a.txt');
    const size: number = stat.size + stat.lastModified;
    const kind: 'file' | 'directory' | 'asset' = stat.type;
    const entries: ReactNativeBlobUtilStat[] = await fs.ls(dir, {stats: true});
    const legacyEntries: ReactNativeBlobUtilStat[] = await fs.lstat(dir);
    void legacyEntries;
    void size; void kind; void entries;

    const hash: string = await fs.hash(dir + '/a.txt', 'sha256');
    const sliced: void = await fs.slice(dir + '/a.txt', dir + '/part.txt', 0, 2);
    const asset: string = fs.asset('bundled.txt');
    const space: ReactNativeBlobUtilDf = await fs.df();
    const free: number = space.free + space.total + (space.internal_free ?? 0);
    void hash; void sliced; void asset; void free;

    const reader = await fs.readStream(dir + '/a.txt', 'base64', 12288, 10);
    reader.onData((chunk: string | number[]) => { void chunk; });
    reader.onError((err: CodedError) => { void err.code; });
    reader.onEnd(() => {});
    reader.open();

    const writer = await fs.writeStream(dir + '/w.txt', 'utf8', true);
    await writer.write('chunk');
    const same = await writer.write('more');
    await same.close();

    const ascii = await fs.writeStream(dir + '/w.bin', 'ascii');
    await ascii.write([1, 2, 3]);
    await ascii.close();

    const cache = session('downloads').add(dir + '/a.txt');
    const files: string[] = cache.list();
    void files;
    await fs.session('downloads').dispose();
    const stored: string[] | undefined = fs.ReactNativeBlobUtilSession.getSession('downloads');
    void stored;

    // Deprecated, still typed.
    await fs.scanFile([{path: dir + '/a.txt', mime: 'text/plain'}]);
    const group: string = await fs.pathForAppGroup('group.example');
    const groupSync: string = fs.syncPathAppGroup('group.example');
    void group; void groupSync;
}

async function platforms(): Promise<void> {
    await android.actionViewIntent('/p/a.pdf', 'application/pdf', 'Open with');
    const chosen: string | null = await android.getContentIntent('*/*');
    await android.addCompleteDownload({title: 't', description: 'd', mime: 'text/plain', path: '/p', showNotification: true});
    const sd: string = await android.getSDCardDir();
    const sdApp: string = await android.getSDCardApplicationDir();
    await android.scanFile([{path: '/p/a.jpg'}]);
    void chosen; void sd; void sdApp;

    await ios.presentOptionsMenu('/p/a.pdf');
    await ios.presentOpenInMenu('/p/a.pdf', 'com.adobe.pdf');
    await ios.presentPreview('/p/a.pdf');
    await ios.excludeFromBackupKey('/p');
    const groupDir: string = await ios.pathForAppGroup('group.example');
    const groupDirSync: string = ios.syncPathAppGroup('group.example');
    await ios.openDocument('/p/a.pdf');
    await ios.previewDocument('/p/a.pdf');
    void groupDir; void groupDirSync;

    const fd: filedescriptor = {name: 'a.png', parentFolder: 'shots', mimeType: 'image/png'};
    const uri: string = await MediaCollection.createMediaFile(fd, 'Image');
    await MediaCollection.writeToMediaFile(uri, '/p/a.png');
    await MediaCollection.writeToMediaFileWithTransform(uri, '/p/a.png');
    await MediaCollection.copyToMediaStore(fd, 'Download', '/p/a.png');
    const internal: string = await MediaCollection.copyToInternal(uri, '/p/copy.png');
    const blobBytes: number[] = await MediaCollection.getBlob(uri, 'ascii');
    const blobText: string = await MediaCollection.getBlob(uri, 'base64');
    await MediaCollection.createMediafile(fd, 'Image');
    await MediaCollection.writeToMediafile(uri, '/p/a.png');
    await MediaCollection.writeToMediafileWithTransform(uri, '/p/a.png');
    void internal; void blobBytes; void blobText;
}

function helpers(): void {
    const encoded: string = base64.encode('hi');
    const decoded: string = base64.decode(encoded);
    const wrapped: string = wrap('/p/a.txt');
    const same: string = URIUtil.wrap('/p/a.txt');
    const isFile: boolean = URIUtil.isFileURI(wrapped);
    const unwrapped: string = URIUtil.unwrapFileURI(wrapped);
    const stripped: string = URIUtil.removeURIScheme('file:///p', 1);
    const id: string = getUUID();
    const error = new ReactNativeBlobUtil.CanceledFetchError('canceled');
    void decoded; void same; void isFile; void unwrapped; void stripped; void id; void error;
}

async function namedExports(enc: Encoding): Promise<void> {
    const res = await namedFetch('GET', 'https://example.test/');
    const again = await namedConfig({fileCache: true}).fetch('GET', 'https://example.test/');
    const text: string = await namedFs.readFile('/p/a.txt', 'utf8');
    // An encoding only known at runtime.
    const either: string | number[] = await namedFs.readFile('/p/a.txt', enc);
    await namedFs.writeFile('/p/a.txt', either, enc);
    await namedOpen.file('/p/a.txt');
    const read: string | number[] = await namedMedia.read('content://x', enc);
    namedSession('s').add(namedWrap('/p/a.txt'));
    const b64: string = namedBase64.encode('x');
    void res; void again; void text; void read; void b64;
    try {
        await namedFetch('GET', 'https://example.test/');
    } catch (err) {
        const failed = err as FetchError;
        const code: ErrorCode = failed.code;
        if (code === 'ECONNREFUSED') { void failed.respInfo.status; }
    }
}

async function optionObjects(): Promise<void> {
    const text: string = await namedFs.readFile('/p/a.txt', {encoding: 'base64', transform: true});
    const bytes: number[] = await namedFs.readFile('/p/a.bin', {encoding: 'ascii'});
    await namedFs.writeFile('/p/a.txt', 'AAEC', {encoding: 'base64', transform: true});
    await namedFs.writeFile('/p/a.bin', [1, 2], {encoding: 'ascii'});
    await namedFs.appendFile('/p/a.txt', 'more', {encoding: 'utf8'});
    await namedFs.createFile('/p/b.txt', 'x', {encoding: 'utf8'});
    const reader = await namedFs.readStream('/p/a.txt', {encoding: 'base64', bufferSize: 3000, tick: 5});
    const writer = await namedFs.writeStream('/p/a.txt', {encoding: 'utf8', append: true});
    const picked: string | null = await namedOpen.pick({mime: 'image/*'});
    await namedMedia.createFile({name: 'a.png', mime: 'image/png'}, 'Image');
    const read: string | number[] = await namedMedia.read('content://x', {encoding: 'base64'});
    await namedConfig({transform: true, android: {downloadManager: {useDownloadManager: true}, wifiOnly: true}, ios: {backgroundTask: true}})
        .fetch('GET', 'https://example.test/');
    void text; void bytes; void reader; void writer; void picked; void read;
}

// OPTIONS, and the ringtone directories fs.dirs has at runtime.
const options: Methods = 'OPTIONS';
const ringtones: string = ReactNativeBlobUtil.fs.dirs.RingtoneDir + ReactNativeBlobUtil.fs.dirs.LegacyRingtoneDir;
void options; void ringtones;

// The pre-1.0 name of the df result still compiles.
const legacyDf: RNFetchBlobDf = {free: 1, total: 2};
void legacyDf;

void network; void filesystem; void platforms; void helpers; void namedExports; void optionObjects;
