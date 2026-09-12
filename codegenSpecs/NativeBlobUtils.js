// @flow
import type { TurboModule } from 'react-native/Libraries/TurboModule/RCTExport';
import { TurboModuleRegistry } from 'react-native';

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

    // Four arguments, not one array. Android invokes callback.invoke(err, rawType,
    // data, responseInfo) and fetch.js destructures exactly that, so declaring an
    // array made the Windows binding marshal one argument: the response body
    // arrived in the error position and every request on Windows rejected, with
    // the body as the message.
    +fetchBlobForm: (options: Object, taskId: string, method: string, url: string, headers: Object, form: Array<any>, callback: (err: ?string, rawType: ?string, data: ?string, responseInfo: ?Object) => void) => void;
    +fetchBlob: (options: Object, taskId: string, method: string, url: string, headers: Object, body: string, callback: (err: ?string, rawType: ?string, data: ?string, responseInfo: ?Object) => void) => void;
    +createFile: (path: string, data: string, encoding: string) => Promise<void>;
    +createFileASCII: (path: string, data: Array<any>) => Promise<void>;
    +pathForAppGroup: (groupName: string) => Promise<string>;
    +syncPathAppGroup: (groupName: string) => string;
    // Two arguments, not one array: Android invokes callback.invoke(exists,
    // isDirectory) and iOS callback(@[@(exists), @(isDir)]), which JavaScript
    // receives as two. Declaring an array made the Windows binding marshal one
    // array argument instead, so fs.exists() read [false, false] - truthy - and
    // answered yes for every path.
    +exists: (path: string, callback: (exists: boolean, isDirectory: boolean) => void) => void;
    +writeFile: (path: string, encoding: string, data: string, transformFile: boolean, append: boolean) => Promise<number>;
    +writeFileArray: (path: string, data: Array<any>, append: boolean) => Promise<number>;
    // The same single-array mistake as above, in the methods that report a
    // result. A JSValueArray marshals as one JS argument, so each of these put
    // its whole payload in the first parameter - the error slot for most of
    // them - and the JS wrapper rejected on success or read nonsense. The
    // shapes below are the ones Android invokes and fs.js destructures.
    +writeStream: (path: string, withEncoding: string, appendData: boolean, callback: (errCode: ?string, errMsg: ?string, streamId: ?string) => void) => void;
    +writeArrayChunk: (streamId: string, withArray: Array<any>, callback: (err: ?string) => void) => void;
    +writeChunk: (streamId: string, withData: string, callback: (err: ?string) => void) => void;
    +closeStream: (streamId: string, callback: (value: Array<any>) => void) => void;
    // (err, result), matching Android's callback.invoke(null, true). Declared as
    // an array it arrived as a single argument, so fs.unlink() read [null, true]
    // - truthy - and rejected every time the delete had succeeded.
    +unlink: (path: string, callback: (err: ?string, result: boolean) => void) => void;
    +removeSession: (paths: Array<any>, callback: (err: ?string) => void) => void;
    +ls: (path: string) => Promise<Array<any>>;
    +stat: (target: string, callback: (err: ?string, stat: ?Object) => void) => void;
    +lstat: (path: string, callback: (err: ?string, stat: ?Array<any>) => void) => void;
    +cp: (src: string, dest: string, callback: (err: ?string, res: ?boolean) => void) => void;
    +mv: (path: string, dest: string, callback: (err: ?string, res: ?boolean) => void) => void;
    +mkdir: (path: string) => Promise<boolean>;
    +readFile: (path: string, encoding: string, transformFile: boolean) => Promise<Array<any>>;
    +hash: (path: string, algorithm: string) => Promise<string>;
    +readStream: (path: string, encoding: string, bufferSize: number, tick: number, streamId: string) => void;
    +getEnvironmentDirs: (callback: (value: Array<any>) => void) => void;
    +cancelRequest: (taskId: string, callback: (value: Array<any>) => void) => void;
    +enableProgressReport: (taskId: string, interval: number, count: number) => void;
    +enableUploadProgressReport: (taskId: string, interval: number, count: number) => void;
    +slice: (src: string, dest: string, start: number, end: number) => Promise<string>;
    +presentOptionsMenu: (uri: string, scheme: string) => Promise<Array<any>>;
    +presentOpenInMenu: (uri: string, scheme: string) => Promise<Array<any>>;
    +presentPreview: (uri: string, scheme: string) => Promise<Array<any>>;
    +excludeFromBackupKey: (url: string) => Promise<Array<any>>;
    +df: (callback: (err: ?string, stat: ?Object) => void) => void;
    +emitExpiredEvent: (callback: (value: string) => void) => void; // The callback is not really used here
    // Android Only APIs
    +actionViewIntent: (path: string, mime: string, chooserTitle: string) => Promise<void>;
    +addCompleteDownload: (config: Object) => Promise<void>;
    +copyToInternal: (contentUri: string, destpath: string) => Promise<string>;
    +copyToMediaStore: (filedata: Object, mt: string, path: string) => Promise<string>;
    +createMediaFile: (filedata: Object, mt: string) => Promise<string>;
    +getBlob: (contentUri: string, encoding: string) => Promise<Array<any>>;
    +getContentIntent: (mime: string) => Promise<string>;
    +getSDCardDir: () => Promise<string>;
    +getSDCardApplicationDir: () => Promise<string>;
    +scanFile: (pairs: Array<any>, callback: (value: Array<any>) => void) => void;
    +writeToMediaFile: (fileUri: string, path: string, transformFile: boolean) => Promise<string>;

    // RCTEventEmitter
    +addListener: (eventName: string) => void;
    +removeListeners: (count: number) => void;
  }

  export default (TurboModuleRegistry.get<Spec>('ReactNativeBlobUtil'): ?Spec);


