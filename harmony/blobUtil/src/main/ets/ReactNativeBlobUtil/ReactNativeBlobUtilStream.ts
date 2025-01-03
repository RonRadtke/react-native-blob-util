/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

import fs from '@ohos.file.fs';
import util from '@ohos.util';
import HashMap from '@ohos.util.HashMap';
import { Descriptor, TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import { buffer } from '@kit.ArkTS';

export type BlobUtilViewDescriptor = Descriptor<"RNCBlobUtil">
export const FAST_BLOB_UTIL = "BlobUtil"
const FILE_OR_DIR_NOT_EXIST: number = 13900002;

export type Encoding = "utf8" | "ascii" | "base64";
export type Stream = {encoding:string,stream:fs.Stream | undefined}

export interface ReactNativeBlobUtilReadStream {
  path: string;
  encoding: Encoding;
  bufferSize?: number;
  closed: boolean;
  tick: number;

  open(): void;

  onData(fn: (chunk: string | number[]) => void): void;

  onError(fn: (err: any) => void): void;

  onEnd(fn: () => void): void;
}

export default class ReactNativeBlobUtilStream {
  private ctx: TurboModuleContext | undefined = undefined
  private stream: fs.Stream | undefined = undefined;
  private encoding: string = 'base64'
  private static fileStreams = new HashMap<string, Stream>();
  private descriptor: BlobUtilViewDescriptor = {} as BlobUtilViewDescriptor

  constructor(ctx: TurboModuleContext) {
    this.ctx = ctx;
  }


  async writeStream(filePath: string, encoding: string, append: boolean,
    callback: (errCode, errMsg, streamId?: string) => void) {
    let accessRes = fs.accessSync(filePath);
    let file = fs.openSync(filePath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
    if (append && accessRes) {
      file = fs.openSync(filePath, fs.OpenMode.READ_WRITE | fs.OpenMode.APPEND);
    }
    this.encoding = encoding;
    let appends = append ? 'a+' : 'w+';
    try {
      let stream = await fs.createStreamSync(filePath, appends);
      let uuid = util.generateRandomUUID(true);
      ReactNativeBlobUtilStream.fileStreams.set(uuid, {
        stream: stream,
        encoding: encoding
      });
      this.stream = stream;
      fs.closeSync(file);
      callback(null, null, uuid);
    } catch (err) {
      if (err.code === FILE_OR_DIR_NOT_EXIST) {
        try {
          fs.mkdirSync(filePath.substring(0, filePath.lastIndexOf('/')), true);
          await this.writeStream(filePath, encoding, append, callback);
        } catch (e) {
          callback("EUNSPECIFIED", "Failed to create write stream at path `" + filePath + "`; " + err.code);
        }
      } else {
        callback("EUNSPECIFIED", "Failed to create write stream at path `" + filePath + "`; " + err.code);
      }
    }
  }

  readStream(filePath: string, encoding: string, bufferSize: number, tick: number, streamId: string): void {
    try {
      let inputStream = fs.createStreamSync(filePath, 'r+');
      let buf = new ArrayBuffer(bufferSize);
      let readSize = 0;
      let readLen = inputStream.readSync(buf, {
        offset: readSize
      });
      readSize += readLen;
      if (readLen === bufferSize) {
        while (readLen > 0) {
          readLen = inputStream.readSync(buf, {
            offset: readSize
          });
          readSize += readLen
        }
      }
      inputStream.closeSync();
      let bytes = buffer.from(buf, 0, readLen);
      let detail = null;

      if (encoding.toLowerCase() === 'utf8') {
        detail = bytes.toString('utf-8');
      } else if (encoding.toLowerCase() === 'base64') {
        detail = buffer.transcode(bytes, 'utf-8', 'base64');
      } else if (encoding.toLowerCase() === 'ascii') {
        detail = buffer.transcode(bytes, 'utf-8', 'ascii');
      }

      this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilFilesystem', {
        event: 'data',
        streamId: streamId,
        detail: detail
      })

      this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilFilesystem', {
        event: 'end',
        streamId: streamId,
        detail: ''
      })
    } catch (err) {
      let errMsg = '';
      if (Number(err.code) === 13900042) {
        errMsg = 'readStream failed with error message: No such file or directory' + ', error code: 13900002';
      } else {
        errMsg = 'readStream failed with error message: ' + err.message + ', error code: ' + err.code;
      }
      this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilFilesystem', {
        event: 'err',
        streamId: streamId,
        detail: errMsg
      })
    }
  }


  writeChunk(streamId: string, data: string, callback: (err: any) => void) {
    let ss = ReactNativeBlobUtilStream.fileStreams.get(streamId)
    if (!ss) {
      return;
    }
    try{
      ss.stream.write(data, {
        encoding: ((ss.encoding === 'utf8') ? 'utf-8' : ss.encoding)
      }, (err, bytesWritten) => {
        if (err) {
          callback("writeChunk failed with error message: " + err.message + ", error code: " + err.code);
        } else {
          bytesWritten && callback('');
        }
      });
    }catch (err){
      console.log(err,'err')
    }
  }

  writeArrayChunk(streamId: string, data: Array<any>, callback: (err: any) => void) {
    let ss = ReactNativeBlobUtilStream.fileStreams.get(streamId)
    if (!ss) {
      return;
    }
    let buf = buffer.from(data)
    ss.stream.write(buf.toString('utf-8'),{
      encoding: 'utf-8'
    }, (err, bytesWritten) => {
      if (err) {
        callback("writeArrayChunk failed with error message: " + err.message + ", error code: " + err.code);
      } else {
        if (bytesWritten) {
          callback('');
        }
      }
    });
  }

  close(streamId: string, callback: (err: any) => void){
    let ss = ReactNativeBlobUtilStream.fileStreams.get(streamId)
    if(!ss){
      return;
    }
    ReactNativeBlobUtilStream.fileStreams.remove(streamId)
    ss.stream.close((err)=>{ if (err) {
      console.error("close stream failed with error message: " + err.message + ", error code: " + err.code);
      callback("close failed with error message: " + err.message + ", error code: " + err.code);
    } else {
      console.info("close stream succeed");
      callback('')
    }
    })
  }
}