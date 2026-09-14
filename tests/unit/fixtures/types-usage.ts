// A usage sample compiled against index.d.ts by tests/unit/types.test.js.
// Every declared API appears here the way an app calls it. It is never run.
import ReactNativeBlobUtil, {
    CanceledFetchError,
    FetchBlobResponse,
    URIUtil,
    getUUID,
} from '../../../index';
import type {
    CodedError,
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
    const internal: string = await media.copyToInternal(uri, '/p/copy.png');
    const bytes: number[] = await media.read(uri, 'ascii');
    const text: string = await media.read(uri);
    await media.addDownload({title: 't', description: 'd', mime: 'text/plain', path: '/p', showNotification: true});
    await media.scan([{path: '/p/a.jpg'}]);
    const sd: string = await media.sdCardDir();
    const sdApp: string = await media.sdCardApplicationDir();
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
    ]);
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
        const s = response.session('downloads');
        if (s) { s.add('/p').remove('/p'); }
        const asBytes: Promise<number[]> | null = response.readFile('ascii');
        void asBytes;
        const asText: Promise<string> | null = response.readFile('utf8');
        void asText;
        const stream = response.readStream('base64');
        if (stream) { (await stream).open(); }
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
    const created: string = await fs.createFile(dir + '/a.txt', 'hello', 'utf8');
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
    const made: boolean = await fs.mkdir(dir + '/sub');
    const names: string[] = await fs.ls(dir);
    const moved: boolean = await fs.mv(dir + '/a.txt', dir + '/sub/a.txt');
    const copied: boolean = await fs.cp(dir + '/sub/a.txt', dir + '/a.txt');
    await fs.unlink(dir + '/sub');
    void exists; void isDir; void made; void names; void moved; void copied;

    const stat: ReactNativeBlobUtilStat = await fs.stat(dir + '/a.txt');
    const size: number = stat.size + stat.lastModified;
    const kind: 'file' | 'directory' | 'asset' = stat.type;
    const entries: ReactNativeBlobUtilStat[] = await fs.lstat(dir);
    void size; void kind; void entries;

    const hash: string = await fs.hash(dir + '/a.txt', 'sha256');
    const sliced: string = await fs.slice(dir + '/a.txt', dir + '/part.txt', 0, 2);
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
    const opened: boolean | null = await android.actionViewIntent('/p/a.pdf', 'application/pdf', 'Open with');
    const chosen: string | null = await android.getContentIntent('*/*');
    await android.addCompleteDownload({title: 't', description: 'd', mime: 'text/plain', path: '/p', showNotification: true});
    const sd: string = await android.getSDCardDir();
    const sdApp: string = await android.getSDCardApplicationDir();
    await android.scanFile([{path: '/p/a.jpg'}]);
    void opened; void chosen; void sd; void sdApp;

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

void network; void filesystem; void platforms; void helpers;
