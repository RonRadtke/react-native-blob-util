// @flow
import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

// The contract every native layer implements. A method that can fail is a
// Promise that rejects with (code, message): POSIX-style codes such as
// ENOENT, EEXIST, EISDIR, ENOTDIR, EBADF, EINVAL, ENOTSUP or EUNSPECIFIED.
// Only fetchBlob and fetchBlobForm keep a callback, because a request reports
// its outcome together with the response type, body and info in one go.
export interface Spec extends TurboModule {
    +getConstants: () => {|
        CacheDir: string,
        DocumentDir: string,
        DownloadDir: string,
        LibraryDir: string,
        MainBundleDir: string,
        MovieDir: string,
        MusicDir: string,
        PictureDir: string,
        ApplicationSupportDir: string,
        // Android Only Constants
        RingtoneDir: string,
        SDCardDir: string,
        SDCardApplicationDir: string,
        DCIMDir: string,
        // Android Only Legacy Constants
        LegacyDCIMDir: string,
        LegacyPictureDir: string,
        LegacyMusicDir: string,
        LegacyDownloadDir: string,
        LegacyMovieDir: string,
        LegacyRingtoneDir: string,
        LegacySDCardDir: string,
    |};

    // Four arguments, not one array: a JSValueArray callback marshals as one
    // argument on Windows. `err` is null on success, otherwise {code, message}.
    +fetchBlobForm: (options: Object, taskId: string, method: string, url: string, headers: Object, form: Array<any>, callback: (err: ?Object, rawType: ?string, data: ?string, responseInfo: ?Object) => void) => void;
    +fetchBlob: (options: Object, taskId: string, method: string, url: string, headers: Object, body: string, callback: (err: ?Object, rawType: ?string, data: ?string, responseInfo: ?Object) => void) => void;
    +createFile: (path: string, data: string, encoding: string) => Promise<void>;
    +createFileASCII: (path: string, data: Array<any>) => Promise<void>;
    +pathForAppGroup: (groupName: string) => Promise<string>;
    +syncPathAppGroup: (groupName: string) => string;
    // {exists: boolean, isDirectory: boolean}
    +exists: (path: string) => Promise<Object>;
    +writeFile: (path: string, encoding: string, data: string, transformFile: boolean, append: boolean) => Promise<number>;
    +writeFileArray: (path: string, data: Array<any>, append: boolean) => Promise<number>;
    // Resolves the id of the new write stream.
    +writeStream: (path: string, withEncoding: string, appendData: boolean) => Promise<string>;
    +writeArrayChunk: (streamId: string, withArray: Array<any>) => Promise<void>;
    +writeChunk: (streamId: string, withData: string) => Promise<void>;
    +closeStream: (streamId: string) => Promise<void>;
    +unlink: (path: string) => Promise<void>;
    +removeSession: (paths: Array<any>) => Promise<void>;
    +ls: (path: string) => Promise<Array<any>>;
    +stat: (target: string) => Promise<Object>;
    +lstat: (path: string) => Promise<Array<any>>;
    +cp: (src: string, dest: string) => Promise<void>;
    +mv: (path: string, dest: string) => Promise<void>;
    +mkdir: (path: string) => Promise<boolean>;
    +readFile: (path: string, encoding: string, transformFile: boolean) => Promise<Array<any>>;
    +hash: (path: string, algorithm: string) => Promise<string>;
    +readStream: (path: string, encoding: string, bufferSize: number, tick: number, streamId: string) => void;
    +cancelRequest: (taskId: string) => Promise<void>;
    +enableProgressReport: (taskId: string, interval: number, count: number) => void;
    +enableUploadProgressReport: (taskId: string, interval: number, count: number) => void;
    +slice: (src: string, dest: string, start: number, end: number) => Promise<string>;
    +presentOptionsMenu: (uri: string, scheme: ?string) => Promise<Array<any>>;
    +presentOpenInMenu: (uri: string, scheme: ?string) => Promise<Array<any>>;
    +presentPreview: (uri: string, scheme: ?string) => Promise<Array<any>>;
    +excludeFromBackupKey: (url: string) => Promise<Array<any>>;
    +df: () => Promise<Object>;
    // Android Only APIs
    +actionViewIntent: (path: string, mime: string, chooserTitle: ?string) => Promise<void>;
    +addCompleteDownload: (config: Object) => Promise<void>;
    +copyToInternal: (contentUri: string, destpath: string) => Promise<string>;
    +copyToMediaStore: (filedata: Object, mt: string, path: string) => Promise<string>;
    +createMediaFile: (filedata: Object, mt: string) => Promise<string>;
    +getBlob: (contentUri: string, encoding: string) => Promise<Array<any>>;
    +getContentIntent: (mime: string) => Promise<string>;
    +getSDCardDir: () => Promise<string>;
    +getSDCardApplicationDir: () => Promise<string>;
    +scanFile: (pairs: Array<any>) => Promise<void>;
    +writeToMediaFile: (fileUri: string, path: string, transformFile: boolean) => Promise<string>;

    // RCTEventEmitter
    +addListener: (eventName: string) => void;
    +removeListeners: (count: number) => void;
  }

  export default (TurboModuleRegistry.get<Spec>('ReactNativeBlobUtil'): ?Spec);
