/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

import HashMap from '@ohos.util.HashMap';
import common from '@ohos.app.ability.common';
import fs from '@ohos.file.fs';
import { BusinessError } from '@ohos.base';
import { promptAction } from '@kit.ArkUI';
import buffer from '@ohos.buffer';
import hash from '@ohos.file.hash';
import statvfs from "@ohos.file.statvfs"
import {filePreview} from "@kit.PreviewKit";
import fileUri from "@ohos.file.fileuri";

const FILE_OR_DIR_NOT_EXIST: number = 13900002;

export default class ReactNativeBlobUtilFS {

  private context: common.UIAbilityContext | undefined = undefined;

  constructor(context:common.UIAbilityContext) {
    this.context = context;
  }

  getSystemFolders():object{
    let res = new HashMap<string, Object>();
    res.set('CacheDir',this.context.cacheDir);
    res.set('DocumentDir',this.context.filesDir);
    //下载的标准目录
    res.set('DownloadDir',this.context.filesDir);
    //应用安装后的app的hap资源包所在目录
    res.set('MainBundleDir',this.context.bundleCodeDir)
    //电影存放路径
    res.set('MovieDir',this.context.filesDir+'/movie')
    //音乐存放路径
    res.set('MusicDir',this.context.filesDir+'/music')
    //图片存放路径
    res.set('PictureDir',this.context.filesDir+'/picture')

    res.set("ApplicationSupportDir", "");
    res.set("RingtoneDir", "");
    res.set("SDCardDir", "");
    res.set("SDCardApplicationDir", "");
    res.set("DCIMDir", "");

    res.set("LegacyDCIMDir", "");
    res.set("LegacyPictureDir", "");
    res.set("LegacyMusicDir", "");
    res.set("LegacyDownloadDir", "");
    res.set("LegacyMovieDir", "");
    res.set("LegacyRingtoneDir", "");
    res.set("LegacySDCardDir", "");

    const entriesArray = Array.from(res.entries());
    // 将数组转换为对象
    const myObject = entriesArray.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
    return myObject;
  }

  createFile(path:string,data:string,encoding:string):Promise<string> {
    return new Promise((res, rej) => {
      try {
        if(encoding !== 'utf8'){
          rej(null)
          return
        }
        encoding ='utf-8';
        let created = fs.accessSync(path)
        if(!created){
          let file = fs.openSync(path, fs.OpenMode.CREATE);
          fs.closeSync(file);
        }
        let file = fs.openSync(path, fs.OpenMode.READ_WRITE);
        fs.writeSync(file.fd, data,{encoding:encoding });
        fs.closeSync(file);
        res(path)
      } catch(err) {
        console.error("createFile failed with error message: " + err.message + ", error code: " + err.code);
        rej(err)
      }
    })
  }

  stat(path:string,callback: (err:any,stat:any) => void) {
    fs.stat(path, (err, stat) => {
      if (err) {
        callback("failed to stat path `" + path + "` because it does not exist or it is not a folder",null)
      } else {
        let filename = path.split('/').pop();
        let statObj = {
          'filename':filename,
          'path':path,
          'type':'asset',
          'size':stat.size,
          'lastModified':stat.mtime
        }
        callback(null,statObj)
      }
    });
  }

  unlink(path:string, callback: (err: any) => void){
    try {
      fs.unlink(path, (err) => {
        if (err) {
          console.error("remove file failed with error message: " + err.message);
          callback("remove file failed with error message: " + err.message)
        } else {
          console.info("remove file succeed");
          callback(null)
        }
      });
    } catch(err) {
      let errMsg = "unlink failed with error message: " + err.message + ", error code: " + err.code;
      console.error(errMsg);
      callback(errMsg);
    }
  }

  removeSession(paths: Array<any>,callback: (err: any) => void) {
    let removeAsyncArr = [];
    for (let i = 0; i < paths.length; i++) {
      removeAsyncArr.push(fs.unlink(paths[i]))
    }
    
    Promise.all([removeAsyncArr]).then(() => {
      callback('')
    }).catch((err) => {
      callback(err)
    })
  }

  cp(path: string,dest: string,callback: (err: any, res: any) => void) {
    try {
      if(fs.accessSync(path)){
        fs.copyFileSync(path, dest);
        callback(null, '')
      }else {
        callback('file is not exist', null)
      }
    } catch (err) {
      callback('ap err', null)
    }
  }

  writeFile(path: string, encoding: string, data: string, transformFile: boolean, append: boolean): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        let accessRes = fs.accessSync(path);
        let file = fs.openSync(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
        if (append && accessRes) {
          file = fs.openSync(path, fs.OpenMode.READ_WRITE | fs.OpenMode.APPEND);
        }
        let writeLen = fs.writeSync(file.fd, data);
        if (writeLen === -1) {
          console.log("write data to file succeed and size is:" + writeLen);
        } else {
          console.log('success');
        }
        fs.closeSync(file);
        resolve(writeLen);
      } catch (err) {
        if (err.code === FILE_OR_DIR_NOT_EXIST) {
          try {
            fs.mkdirSync(path.substring(0, path.lastIndexOf('/')), true);
            this.writeFile(path, encoding, data, transformFile, append)
              .then(length => resolve(length))
              .catch(err => reject(err));
          } catch (e) {
            let errMsg = "writeFile failed with error message: " + err.message + ", error code: " + err.code;
            reject(errMsg);
          }
        } else {
          let errMsg = "writeFile failed with error message: " + err.message + ", error code: " + err.code;
          console.error(errMsg);
          reject(errMsg);
        }
      }
    });
  }

  writeFileArray(path:string,data:Array<any>,append:boolean):Promise<number> {
    return new Promise((resolve,reject) => {
      try {
        let buf = buffer.from(data);
        let file = fs.openSync(path, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
        fs.write(file.fd,buf.toString('utf-8'),{encoding:'utf-8'},(err, writeLen) => {
          if (err) {
            reject(-1);
            console.error("write failed with error message: " + err.message + ", error code: " + err.code);
          } else {
            console.info("write data to file succeed and size is:" + writeLen);
            resolve(writeLen);
          }
          fs.closeSync(file);
        });
      } catch (err) {
        let errMsg = "writeFileArray failed with error message: " + err.message + ", error code: " + err.code;
        console.error(errMsg);
        reject(errMsg);
      }
    })
  }

  //创建目录
  mkdir(path: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      fs.mkdir(path, true, (err: BusinessError) => {
        if (err) {
          if (err.code == 13900015) {
            // 文件夹存在
            reject('floder exists');
          } else {
            reject(`Directory could not be created ${err.message} ${err.code}`);
          }
        } else {
          resolve();
        }
      })
    })
  }

  createFileASCII(path:string,data:Array<any>):Promise<void>{
    return new Promise((resolve,reject)=>{
      let createFileASCII = fs.accessSync(path)
      if(!createFileASCII){
        let file = fs.openSync(path, fs.OpenMode.CREATE);
        fs.closeSync(file);
      }
      let file = fs.openSync(path, fs.OpenMode.READ_WRITE);
      let buf = buffer.from(data);
      fs.write(file.fd,buf.toString('utf-8'),{encoding:'utf-8'},(err, writeLen) => {
        if (err) {
          reject(err);
          console.error("write failed with error message: " + err.message + ", error code: " + err.code);
        } else {
          console.info("write data to file succeed and size is:" + writeLen);
          resolve();
        }
        fs.closeSync(file);
      });
    })
  }

  //查看对应目录下的文件和目录
  ls(path:string):Promise<Array<any>>{
    return new Promise((resolve,reject)=>{
      let create = fs.accessSync(path)
      if(!create){
        reject("文件不存在")
      }
      let isDirectory = fs.statSync(path).isDirectory();
      if(!isDirectory){
        reject("目录不存在")
      }
      let filenames = fs.listFileSync(path);
      resolve(filenames)
      for (let i = 0; i < filenames.length; i++) {
        console.info("filename: %s", filenames[i]);
      }
    })
  }

  exists(path: string, callback: (value: boolean, isDir?: boolean) => void) {
    return new Promise((resolve, reject) => {
      fs.stat(path, (err: BusinessError, res: fs.Stat) => {
        if (err) {
          callback(false, false);
          reject('File does not exist');
        } else {
          fs.access(path, (err: BusinessError, result: boolean) => {
            if (err) {
              reject('File does not exist');
            } else {
              callback(result, res.isDirectory());
            }
          });
        }
      })
    })
  };

    getMainType(value: string): string {
        let mainType = '';
        let objType = {
            'txt':'text/plain',
            'cpp':'text/x-c++src',
            'c':'text/x-csrc',
            'h':'text/x-chdr',
            'java':'text/x-java',
            'xhtml':'application/xhtml+xml',
            'xml':'text/xml',
            'html':'text/html',
            'htm':'text/html',
            'jpg':'image/jpeg',
            'png':'image/png',
            'gif':'image/gif',
            'webp':'image/webp',
            'bmp':'image/bmp',
            'svg':'image/svg+xml',
            'm4a':'audio/mp4a-latm',
            'aac':'audio/aac',
            'mp3':'audio/mpeg',
            'ogg':'audio/ogg',
            'wav':'audio/x-wav',
            'mp4':'video/mp4',
            'mkv':'video/x-matroska',
            'ts':'video/mp2ts',
        }
        mainType = objType[value];
        return mainType;
    }

    presentPreview(path: string, scheme: string): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                let uiContext = getContext(this);
                // 如果不是媒体路径 给沙箱路径下写文件 将沙箱路径转换为uri 预览
                if(!path.startsWith('file://media')){
                    let srcPath = path;
                    var dstPath = uiContext.filesDir + '/' + path.substring(path.lastIndexOf('/') + 1);
                    fs.copyFileSync(srcPath.replace('file://',''), dstPath);
                    // 获取文件的沙箱路径
                    let pathInSandbox = uiContext.filesDir + '/' + path.substring(path.lastIndexOf('/') + 1);
                    // 将沙箱路径转换为uri
                    path = fileUri.getUriFromPath(pathInSandbox);
                }

                filePreview.canPreview(uiContext,path)
                    .then((result) => {
                        if(result) {
                            let fileInfo: filePreview.PreviewInfo = {
                                title: path.substring(path.lastIndexOf('/') + 1),
                                uri: path,
                                mimeType:this.getMainType(path.substring(path.lastIndexOf('.') + 1)),
                            }
                            filePreview.openPreview(uiContext,fileInfo)
                                .then(() => {
                                    console.log(`success to openpreview`)
                                    resolve('succeeded in opening preview')
                                })
                                .catch((err:BusinessError) => {
                                    console.error(`failed to open preview`)
                                    reject(err)
                                })
                        } else {
                            console.error(`path can not Preview,please check`)
                            reject(`err`)
                        }
                    })
                    .catch((err:BusinessError) => {
                        console.error(`failed to previewed,err.code = ${err.code},err.message = ${err.message}`)
                        reject(err)
                    })
            } catch (err) {
                console.error(`presentPreview failed with error message,err.code : ${err.code},err.message : ${err.message}`)
                reject(err)
            }
        })
    };

  readFile(path: string, encoding: string, transformFile: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        let fileInfo = fs.statSync(path)
        let file = fs.openSync(path, fs.OpenMode.READ_WRITE);
        let buf = new ArrayBuffer(fileInfo.size);
        fs.read(file.fd, buf, (err, readLen) => {
          if (err) {
            reject('Failed to read the file');
          } else {
            let bytes = buffer.from(buf, 0, readLen);
            switch (encoding.toLowerCase()) {
              case 'base64':
                resolve(bytes.toString('base64'));
                break;
              case 'ascii': {
                let ascUInt8Array: Uint8Array = new Uint8Array(bytes.buffer);
                let ascArr = Array.from(ascUInt8Array);
                resolve(ascArr);
                break;
              }
              case 'utf8':
                resolve(bytes.toString('utf-8'));
                break;
              default:
                resolve(bytes.toString('utf-8'));
                break;
            }
            fs.closeSync(file);
          }
        });
      } catch (err) {
        let errMsg = "readFile failed with error message: " + err.message + ", error code: " + err.code;
        console.error(errMsg);
        reject(errMsg);
      }
    })
  };

  lstat(path: string, callback: (err: any, stat: any) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.lstat(path, (err, stat: fs.Stat) => {
        if (err) {
          callback("lstat failed with error message: " + err.message + ", error code: " + err.code, null)
          reject("lstat failed with error message: " + err.message + ", error code: " + err.code);
        } else {
          console.info("get link status succeed, the size of file is" + stat.size);
          let infoStat = {
            mode: stat.mode,
            size: stat.size,
            ctime: stat.ctime,
            mtime: stat.mtime,
            atime: stat.atime,
            gid: stat.gid,
            uid: stat.uid
          }
          callback(null, infoStat)
          resolve();
        }
      });
    })
  };

  mv(path: string, dest: string, callback: (err: any, res: any) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.moveFile(path, dest, 0, (err) => {
        if (err) {
          callback("move file failed with error message: " + err.message + ", error code: " + err.code, null)
          reject("move file failed with error message: " + err.message + ", error code: " + err.code);
        } else {
          callback(null, '');
          resolve();
        }
      });
    })
  };

  hash(path: string, algorithm: string): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        let algorithms: HashMap<string, string> = new HashMap();
        algorithms.set('md5', 'md5');
        algorithms.set('sha1', 'sha1');
        algorithms.set('sha256', 'sha256');
        // algorithm不存在
        if (!algorithms.hasKey(algorithm)) {
          reject('Invalid hash algorithm');
          return;
        }
        // 判断是否是文件夹
        let isDirectory = fs.statSync(path).isDirectory();
        if (isDirectory) {
          reject('file  IsDirectory');
          return;
        }
        // 判断文件是否在
        let res = fs.accessSync(path);
        if (!res) {
          reject('file not exists');
          return;
        }
        hash.hash(path, algorithm, (err, str) => {
          if (err) {
            reject("calculate file hash failed with error message: " + err.message + ", error code: " + err.code);
          } else {
            console.info("calculate file hash succeed:" + str);
            resolve(str)
          }
        });
      } catch (err) {
        let errMsg = "hash failed with error message: " + err.message + ", error code: " + err.code;
        console.error(errMsg);
        reject(errMsg);
      }
    })
  };


  slice(path: string, dest: string, start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        let fileInfo = fs.statSync(path);
        let readFile = fs.openSync(path, fs.OpenMode.READ_ONLY);
        let writeFile = fs.openSync(dest, fs.OpenMode.WRITE_ONLY | fs.OpenMode.CREATE);
        let buf = new ArrayBuffer(fileInfo.size);
        fs.read(readFile.fd, buf, (err: BusinessError, readLen: number) => {
          if (err) {
            reject('Failed to read the file');
            fs.closeSync(readFile);
          } else {
            let max = end < readLen ? end : readLen;
            let bytes = buf.slice(start, max);
            fs.write(writeFile.fd, bytes, (err, writeLen) => {
              if (err) {
                reject("write failed with error message: " + err.message + ", error code: " + err.code);
              } else {
                resolve(bytes.toString());
                fs.closeSync(writeFile);
              }
            });
            fs.closeSync(readFile);
          }
        });
      } catch (err) {
        let errMsg = "slice failed with error message: " + err.message + ", error code: " + err.code;
        console.error(errMsg);
        reject(errMsg);
      }
    })
  };

  df(callback: (err: any, stat: Object) => void) {
    let totalSize = statvfs.getTotalSizeSync(this.context.filesDir);
    let freeSize = statvfs.getFreeSizeSync(this.context.filesDir);
    callback(null, { "free": freeSize, "total": totalSize})
  };
}

