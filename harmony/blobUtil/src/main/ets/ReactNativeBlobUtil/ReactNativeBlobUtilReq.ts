/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

import http from '@ohos.net.http';
import fs from '@ohos.file.fs';
import buffer from '@ohos.buffer';
import util from '@ohos.util';
import wifiManage from '@ohos.wifiManager';
import { BusinessError } from '@ohos.base';
import common from '@ohos.app.ability.common';
import { RNOHContext } from '@rnoh/react-native-openharmony/ts';
import ConfigType, { ResponseInfo, RespType } from './ReactNativeBlobUtilConfig';

const FILE_PREFIX = 'ReactNativeBlobUtil-file://';
const CONTENT_PREFIX = 'ReactNativeBlobUtil-content://';
const CONTENT_FILE = 'file://';

enum RES_CODE {
  FloderExist = 13900015
}
enum ResponseFormat {
  Auto,
  UTF8,
  BASE64
}

enum ResponseType {
  KeepInMemory,
  FileStorage
}

enum RNFB_RESPONSE {
  BASE64 = 'base64',
  UTF8 = 'utf8',
  PATH = 'path'
}

interface MultiFormType {
  name?: string,
  filename?: string,
  type?: string,
  data?: any
}

class DataReceiveProgressInfo {
  receiveSize: number = 100
  totalSize: number = 100
}

class DataSendProgressInfo {
  sendSize: number = 100
  totalSize: number = 100
}

export default class ReactNativeBlobUtilReq {
  private ctx: RNOHContext | undefined = undefined
  private context: common.UIAbilityContext | undefined = undefined

  destPath: string;
  httpRequest: http.HttpRequest;
  responseType: ResponseType;
  responseFormat: ResponseFormat = ResponseFormat.Auto;
  resHeaders: Object;
  totalReceiveData: Array<ArrayBuffer> = [];
  allData: Array<any> = [];

  downloadTimer: number = 0;
  uploadTimer: number = 0;
  downloadInfo: DataReceiveProgressInfo = {
    receiveSize: 0,
    totalSize: 0
  }
  uploadInfo: DataSendProgressInfo = {
    sendSize: 0,
    totalSize: 0
  }
  taskId: string;

  constructor(ctx: RNOHContext, context: common.UIAbilityContext) {
    this.ctx = ctx;
    this.context = context;
    this.httpRequest = http.createHttp();
  }

  async startHttp(options: ConfigType, taskId: string, method: string, url: string, headers: Object, form: Array<MultiFormType> | string, callback: (err: any, rawType: string, data: string, responseInfo: any) => void) {
    options = {...new ConfigType(), ...options};
    method = method.toLowerCase();
    this.taskId = taskId;

    if ((options.fileCache || options.path) && !this.shouldTransFormFile(options)) {
      this.responseType = ResponseType.FileStorage;
    } else {
      this.responseType = ResponseType.KeepInMemory;
    }

    let ext = !options.appendExt ? '' : '.' + options.appendExt;
    let tmpPath = this.context.cacheDir + '/ReactNativeBlobUtilTmp_' + taskId;

    if (options.path) {
      this.destPath = options.path;
    } else if (options.fileCache) {
      this.destPath = tmpPath + ext;
    }

    try {
      // 仅支持wifi下的请求
      if (options.wifiOnly) {
        let isWifiConnect = false;
        if (wifiManage.isWifiActive() && wifiManage.isConnected()) {
          isWifiConnect = true;
        }
        if (!isWifiConnect) {
          callback('No available Wifi connections', '', '', null);
        }
        return;
      }

      // 判断用户是否返回指定的数据个是
      if (headers) {
        for (let name in headers) {
          if (name.toLowerCase() === 'RNFB-Response') {
            let resValue = headers[name].toLowerCase();
            if (resValue === 'base64') {
              this.responseFormat = ResponseFormat.BASE64;
            } else if (resValue === 'utf8') {
              this.responseFormat = ResponseFormat.UTF8;
            }
          }
        }
      }

      let reqOptions: http.HttpRequestOptions = {
        method: method.toUpperCase() as http.RequestMethod,
        header: headers,
        readTimeout: options.timeout,
        connectTimeout: options.timeout
      }

      // 组装http请求数据格式
      if (form) {
        let path = Array.isArray(form) ? form[0].data : form;
        let buffers: ArrayBuffer = this.getABData(this.isPathStr(path), path);
        if (buffers.byteLength === 0) {
          this.callErr('getABData fail, check file is exists', callback)
          return;
        }
        if (Array.isArray(form)) {
          reqOptions.multiFormDataList = form.map((item: MultiFormType): http.MultiFormData =>({
            name: item.name,
            contentType: item.type,
            remoteFileName: item.filename,
            data: this.getABData(this.isPathStr(item.data), item.data)
          }));
        } else {
          let buf: ArrayBuffer = this.getABData(this.isPathStr(form), form);
          reqOptions.extraData = buf;
        }
      }

      this.httpRequest.on('dataReceive', (data: ArrayBuffer) => {
        // 解码成字符串
        var decodedString = String.fromCharCode.apply(null, new Uint8Array(data))
        console.log(`decodedString: ${decodedString}`)
        this.allData.push(decodedString)
        this.totalReceiveData.push(data);
      })

      // 数据请求结束后，发送最后一次上传/下载进度，并清除定时器
      this.httpRequest.on('dataEnd', () => {
        if (this.downloadTimer) {
          this.sendDownloadProgress();
          clearInterval(this.downloadTimer)
        } else if (this.uploadTimer) {
          this.sendUploadProgress();
          clearInterval(this.uploadTimer);
        }
      })

      this.httpRequest.on('headersReceive', (header: Object) => {
        this.resHeaders = header;
      })

      this.httpRequest.requestInStream(url, reqOptions, (err: BusinessError, data: number) => {
        if (!err) {
          let isResBlob: boolean = this.isBlobResponse(this.resHeaders, options);
          let resInfo: ResponseInfo = this.getRespInfo(taskId, this.resHeaders, data, isResBlob);
          this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilState', resInfo);

          // 合并多个arraybuffer数据为一个
          if (this.totalReceiveData.length) {
            let totalLength = 0;
            for (let arr of this.totalReceiveData) {
              totalLength += arr.byteLength;
            }
            let totalBuffer = new ArrayBuffer(totalLength);
            let result = new Uint8Array(totalBuffer);
            let offset = 0;
            for (let arr of this.totalReceiveData) {
              result.set(new Uint8Array(arr), offset);
              offset += arr.byteLength;
            }

            switch(this.responseType) {
              case ResponseType.KeepInMemory:
                if (isResBlob && options.auto) {
                  let file = fs.openSync(this.destPath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
                  fs.write(file.fd, totalBuffer).then(() => {
                    callback(null, RNFB_RESPONSE.PATH, this.destPath, resInfo);
                  }).catch((err: BusinessError) => {
                    this.callErr(err, callback);
                    console.error('write data to file failed with error message' + err.message);
                  }).finally(() => {
                    fs.closeSync(file);
                  })
                } else {
                  if (this.shouldTransFormFile(options)) {
                    callback(null, RNFB_RESPONSE.PATH, this.destPath, resInfo);
                    return;
                  }

                  let resData: any = null;
                  if (this.responseFormat === ResponseFormat.BASE64) {
                    let base64 = new util.Base64Helper();
                    resData = base64.encodeToStringSync(result);
                    callback(null, RNFB_RESPONSE.BASE64, resData, resInfo);
                    return;
                  }
                  if(this.allData.length === 1) {
                    callback(null, RNFB_RESPONSE.UTF8, this.allData[0], resInfo);
                  } else {
                    callback(null, RNFB_RESPONSE.UTF8, JSON.stringify(this.allData), resInfo);
                  }
                }
                break;
              case ResponseType.FileStorage:
                try {
                  let isExist = fs.accessSync(this.destPath.substring(0,this.destPath.lastIndexOf('/')));
                  if(!isExist) {
                    // 如果不存在目录 创建
                    fs.mkdir(this.destPath.substring(0,this.destPath.lastIndexOf('/')),true,(err:BusinessError) =>{
                      if(err) {
                        if(err.code == RES_CODE.FloderExist) {
                          console.log('floder exist');
                        } else {
                          console.log(`Directory could not be created ${err.message} ${err.code}`);
                        }
                      } else {
                        let file = fs.openSync(this.destPath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
                        fs.write(file.fd, totalBuffer).then(() => {
                          callback(null, RNFB_RESPONSE.PATH, this.destPath, resInfo);
                        }).catch((err: BusinessError) => {
                          this.callErr(err, callback);
                          console.error('write data to file failed with error message1' + err.message);
                        }).finally(() => {
                          fs.closeSync(file);
                        })
                      }
                    })
                  } else {
                    let file = fs.openSync(this.destPath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
                    fs.write(file.fd, totalBuffer).then(() => {
                      callback(null, RNFB_RESPONSE.PATH, this.destPath, resInfo);
                    }).catch((err: BusinessError) => {
                      this.callErr(err, callback);
                      console.error('write data to file failed with error message2' + err.message);
                    }).finally(() => {
                      fs.closeSync(file);
                    })
                  }
                  break;
                }catch(err){
                  console.log(`FileStorage err: ${err}`)
                }
              default:
                callback(null, RNFB_RESPONSE.UTF8, result.toString(), resInfo);
                break;
            }
          } else {
            // 数据上传
            callback(null, RNFB_RESPONSE.UTF8, this.totalReceiveData.toString(), resInfo);
          }
          this.cancelRequest();
        } else {
          this.cancelRequest();
          this.callErr(JSON.stringify({
            code: err.code,
            message: err.message
          }), callback);
        }
      })
    } catch(err) {
      this.cancelRequest();
      this.callErr(err, callback);
    }
  }

  isPathStr(str: string): boolean {
    return !!(str.startsWith(FILE_PREFIX) || str.startsWith(CONTENT_PREFIX) || str.indexOf('/') === 0);
  }

  getABData(isPath: boolean, data: string): ArrayBuffer {
    let buf: ArrayBuffer;
    try {
      if (isPath) {
        if (data.indexOf('/') !== 0) {
          data = data.replace(FILE_PREFIX, '').replace(CONTENT_PREFIX, '').replace(CONTENT_FILE, '');
        }
        let fileInfo = fs.statSync(data);
        let file = fs.openSync(data, fs.OpenMode.READ_WRITE);
        buf = new ArrayBuffer(fileInfo.size);
        fs.readSync(file.fd, buf);
        fs.closeSync(file);
      } else {
        buf = buffer.alloc(data.length, data, 'base64').buffer;
      }
      return buf;
    } catch(err) {
      console.error("getABData failed with error message: " + err.message + ", error code: " + err.code);
      buf = new ArrayBuffer(0)
      return buf;
    }
  }

  onProgressReport(interval: number, count: number) {
    this.httpRequest.on('dataReceiveProgress', (data: DataReceiveProgressInfo) => {
      this.downloadInfo = data;
      if (count !== -1 && ((data.receiveSize / data.totalSize) > (count / 10))) {
        count++;
        this.sendDownloadProgress();
      }
      if (count === -1) {
        if (this.downloadTimer) {
          clearInterval(this.downloadTimer);
        }
        this.downloadTimer = setInterval(() => {
          if (!this.downloadInfo?.totalSize) return;
          this.sendDownloadProgress();
        }, interval)
      }
    })
  }

  sendDownloadProgress() {
    this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilProgress', {
      taskId: this.taskId,
      written: this.downloadInfo?.receiveSize,
      total: this.downloadInfo?.totalSize,
      chunk: ''
    })
  }

  onUploadProgressReport(interval: number, count: number) {
    this.httpRequest.on('dataSendProgress', (data: DataSendProgressInfo) => {
      this.uploadInfo = data;
      if (count !== -1 && ((data.sendSize / data.totalSize) > (count / 10))) {
        count++;
        this.sendUploadProgress();
      }
      if (count === -1) {
        this.uploadTimer = setInterval(() => {
          if (!this.uploadInfo?.totalSize) return;
          this.sendUploadProgress();
        }, interval)
      }
    })
  }

  sendUploadProgress() {
    this.ctx.rnInstance.emitDeviceEvent('ReactNativeBlobUtilProgress-upload', {
      taskId: this.taskId,
      written: this.uploadInfo?.sendSize,
      total: this.uploadInfo?.totalSize,
    })
  }

  // 判断请求的数据是否是blob
  isBlobResponse(headers: Object, options: ConfigType) {
    let cType: string = String((headers['content-type'] || headers['Content-Type']) ?? '').toLowerCase();
    let isText: boolean = cType.indexOf('text/') !== -1;
    let isJson: boolean = cType.indexOf('application/json') !== -1;
    let isCustomBinary: boolean = (options.binaryContentTypes?.length || 0) > 0;
    return !(isText || isJson) || isCustomBinary;
  }

  // 组装返回http相应数据格式
  getRespInfo(taskId: string, headers: Object, status: number, isBlob: boolean): ResponseInfo {
    return {
      taskId: taskId,
      status: status,
      state: 2,
      headers: headers,
      timeout: false,
      redirects: [],
      respType: this.getRespType(isBlob, (headers['content-type'] || headers['Content-Type']))
    }
  }

  // 获取返回类型
  getRespType(isBlob: boolean, headerType: string): RespType {
    if (isBlob) {
      return 'blob';
    } else if (headerType === 'application/json') {
      return 'json';
    } else if (headerType.indexOf('text/') !== -1) {
      return 'text';
    } else {
      return '';
    }
  }

  shouldTransFormFile(options: ConfigType) {
    return options.transformFile && (options.fileCache || options.path);
  }

  callErr(err: any, fn: (err: any, rawType: string, data: string, responseInfo: any) => void) {
    fn(err, '', '', null);
  }

  // 取消请求，清除回调
  cancelRequest() {
    this.totalReceiveData = [];
    this.httpRequest.destroy();
    this.httpRequest.off('dataReceiveProgress');
    this.httpRequest.off('dataSendProgress');
    this.httpRequest.off('dataReceive');
    this.httpRequest.off('headerReceive');
    clearInterval(this.downloadTimer);
    clearInterval(this.uploadTimer);
  }
}
