/*
 * Copyright (c) 2024 Huawei Device Co., Ltd. All rights reserved
 * Use of this source code is governed by a MIT license that can be
 * found in the LICENSE file.
 */

class ReactNativeBlobUtilConfig {
  Progress?: any;
	UploadProgress?: any;
	fileCache?: boolean; // 文件缓存
	transformFile?: boolean; // 自定义文件转换，需要修改源码实现
	path?: string; // 下载文件存储路径
	appendExt?: string; // 文件后缀名
	session?: string; // 文件session存储
	addAndroidDownloads?: any = {}; // 安卓下载器，鸿蒙暂不支持
	overwrite?: boolean = true; // 是否覆盖之前的文件
	indicator?: boolean = false; // ios专有，开启下载指示器
	timeout?: number = 60000; // 超时时间
	followRedirect?: boolean = true; // 重定向开关
	trusty?: boolean; // 安全传输协议
	wifiOnly?: boolean = false; // 仅使用wifi传输
	mime?: string; // addAndroidDownloads需要使用的属性，暂不支持
	auto?: boolean; // 自动缓存
	key?: string;// 上一次下载数据缓存的key
	binaryContentTypes?: Array<string>; // 存放指定的二进制内容格式
}

export type RespType = 'text' | 'blob' | 'json' | '';

export type ResponseInfo = {
	taskId: string,
	state: number,
	headers: any,
	status: number,
	timeout: boolean,
	redirects: Array<string>,
	respType: RespType
}

export default ReactNativeBlobUtilConfig;