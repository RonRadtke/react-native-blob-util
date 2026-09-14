
export type ReactNativeBlobUtilConfig = {
  fileCache?: boolean,
  path?: string,
  appendExt?: string,
  key?: string,
  session?: string,
  overwrite?: boolean,
  timeout?: number,
  followRedirect?: boolean,
  transformFile?: boolean,
  trusty?: boolean,
  customCACerts?: Array<string>,
  pinnedHosts?: Array<string>,
  trustSystemCerts?: boolean,
  // Android only
  addAndroidDownloads?: Object,
  wifiOnly?: boolean,
  targetHostIp?: string,
};

export type ReactNativeBlobUtilNative = {
  // API for fetch octet-stream data
  fetchBlob : (
    options:fetchConfig,
    taskId:string,
    method:string,
    url:string,
    headers:any,
    body:any,
    callback:(err:any, ...data:any) => void
  ) => void,
  // API for fetch form data
  fetchBlobForm : (
    options:fetchConfig,
    taskId:string,
    method:string,
    url:string,
    headers:any,
    form:Array<any>,
    callback:(err:any, ...data:any) => void
  ) => void,
  // open file stream
  readStream : (
    path:string,
    encode:'utf8' | 'ascii' | 'base64'
  ) => void,
  // get system folders
  getEnvironmentDirs : (dirs:any) => void,
  // unlink file by path
  unlink : (path:string, callback: (err:any) => void) => void,
  removeSession : (paths:Array<string>, callback: (err:any) => void) => void,
  ls : (path:string, callback: (err:any) => void) => void,
};

export type ReactNativeBlobUtilResponseInfo = {
  taskId : string,
  state : number,
  headers : any,
  status : number,
  respType : 'text' | 'blob' | '' | 'json',
  rnfbEncode : 'path' | 'base64' | 'ascii' | 'utf8'
}

export type ReactNativeBlobUtilStream = {
  onData : () => void,
  onError : () => void,
  onEnd : () => void,
  _onData : () => void,
  _onEnd : () => void,
  _onError : () => void,
}


export type filedescriptor = { path: string, parentFolder: string, mimeType: string }

export type ReactNativeBlobUtilStat = {
  filename: string,
  path: string,
  size: number,
  type: 'file' | 'directory' | 'asset',
  lastModified: number,
}
