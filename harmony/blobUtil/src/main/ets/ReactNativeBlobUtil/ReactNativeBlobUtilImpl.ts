/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

import common from '@ohos.app.ability.common';
import { TurboModuleContext } from '@rnoh/react-native-openharmony/ts';
import ReactNativeBlobUtilFS from './ReactNativeBlobUtilFS';
import ReactNativeBlobUtilReq from './ReactNativeBlobUtilReq';
import ConfigType from './ReactNativeBlobUtilConfig';

import ReactNativeBlobUtilStream from './ReactNativeBlobUtilStream';
import { HashMap } from '@kit.ArkTS';

export default class ReactNativeBlobUtilImpl {
  private context: common.UIAbilityContext | undefined = undefined;

  private reactNativeBlobUtilFS: ReactNativeBlobUtilFS | undefined = undefined

  private reactNativeBlobUtilStream: ReactNativeBlobUtilStream | undefined = undefined

  private ctx: TurboModuleContext | undefined = undefined
  taskMap: HashMap<string, ReactNativeBlobUtilReq> = new HashMap()

  constructor(context: common.UIAbilityContext, ctx: TurboModuleContext) {
    this.context = context
    this.ctx = ctx
    this.reactNativeBlobUtilFS = new ReactNativeBlobUtilFS(context)
    this.reactNativeBlobUtilStream = new ReactNativeBlobUtilStream(this.ctx)
  }

  getSystemFolders() {
    return this.reactNativeBlobUtilFS.getSystemFolders()
  }

  fetchBlob(options: ConfigType, taskId: string, method: string, url: string, headers: Object, form: Array<any> | string, callback: (err: any, rawType: string, data: string, responseInfo: any) => void) {
    let httpReq = new ReactNativeBlobUtilReq(this.ctx, this.context);
    this.taskMap.set(taskId, httpReq);
    httpReq.startHttp(options, taskId, method, url, headers, form, callback);
  }

  fetchBlobForm(options: ConfigType, taskId: string, method: string, url: string, headers: Object, form: Array<any> | string, callback: (err: any, rawType: string, data: string, responseInfo: any) => void) {
    let httpReq = new ReactNativeBlobUtilReq(this.ctx, this.context);
    this.taskMap.set(taskId, httpReq);
    httpReq.startHttp(options, taskId, method, url, headers, form, callback);
  }

  cancelRequest(taskId: string, callback: (value: Array<any>) => void) {
    this.taskMap.get(taskId)?.cancelRequest();
    callback([]);
  }

  enableProgressReport(taskId: string, interval: number, count: number) {
    this.taskMap.get(taskId)?.onProgressReport(interval, count);
  }

  enableUploadProgressReport(taskId: string, interval: number, count: number) {
    this.taskMap.get(taskId)?.onUploadProgressReport(interval, count);
  }

  removeSession(paths: Array<any>, callback: (err: any) => void) {
    this.reactNativeBlobUtilFS?.removeSession(paths, callback)
  }

  createFile(path: string, data: string, encoding: string): Promise<string> {
    return this.reactNativeBlobUtilFS.createFile(path, data, encoding)
  }

  writeStream(path: string, encoding: string, appendData: boolean, callback: (errCode, errMsg, streamId?: string) => void) {
    this.reactNativeBlobUtilStream.writeStream(path, encoding, appendData, callback);
  }

  readStream(filePath: string, encoding: string, bufferSize: number, tick: number, streamId: string): void {
    return this.reactNativeBlobUtilStream.readStream(filePath, encoding, bufferSize, tick, streamId);
  }

  stat(path: string, callback: (err: any, stat: any) => void) {
    this.reactNativeBlobUtilFS.stat(path, callback)
  }

  cp(path: string, dest: string, callback: (err: any, res: any) => void) {
    this.reactNativeBlobUtilFS.cp(path, dest, callback)
  }

  writeFile(path: string, encoding: string, data: string, transformFile: boolean, append: boolean): Promise<number> {
    return this.reactNativeBlobUtilFS.writeFile(path, encoding, data, transformFile, append)
  }

  writeFileArray(path: string, data: Array<any>, append: boolean): Promise<number> {
    return this.reactNativeBlobUtilFS.writeFileArray(path, data, append)
  }

  unlink(path: string, callback: (err: any) => void) {
    this.reactNativeBlobUtilFS.unlink(path, callback)
  }

  mkdir(path: string): Promise<void> {
    return this.reactNativeBlobUtilFS.mkdir(path)
  }

  createFileASCII(path: string, data: Array<any>): Promise<void> {
    return this.reactNativeBlobUtilFS.createFileASCII(path, data)
  }

  ls(path: string): Promise<Array<any>> {
    return this.reactNativeBlobUtilFS.ls(path)
  }

  writeChunk(streamId: string, withData: string, callback: (err: any) => void) {
    this.reactNativeBlobUtilStream.writeChunk(streamId, withData, callback)
  }

  writeArrayChunk(streamId: string, withArray: Array<any>, callback: (err: any) => void) {
    this.reactNativeBlobUtilStream.writeArrayChunk(streamId, withArray, callback)
  }

  exists(path: string, callback: (value: boolean,isDir?:boolean) => void) {
    this.reactNativeBlobUtilFS.exists(path, callback)
  }

  readFile(path: string, encoding: string, transformFile: boolean): Promise<any> {
    return this.reactNativeBlobUtilFS.readFile(path, encoding, transformFile)
  }

    presentPreview(path: string, scheme: string): Promise<any> {
        return this.reactNativeBlobUtilFS.presentPreview(path, scheme)
    }

  lstat(path: string, callback: (err: any, stat: any) => void) {
    this.reactNativeBlobUtilFS.lstat(path, callback)
  }

  mv(path: string, dest: string, callback: (err: any, res: any) => void) {
    this.reactNativeBlobUtilFS.mv(path, dest, callback)
  }

  hash(path: string, algorithm: string): Promise<string> {
    return this.reactNativeBlobUtilFS.hash(path, algorithm)
  }

  df(callback: (err: any, stat: Object) => void) {
    this.reactNativeBlobUtilFS.df(callback)
  }

  slice(src: string, dest: string, start: number, end: number): Promise<string> {
    return this.reactNativeBlobUtilFS.slice(src, dest, start, end)
  }

  closeStream(streamId: string, callback: (err: any) => void) {
    this.reactNativeBlobUtilStream.close(streamId, callback)
  }
}