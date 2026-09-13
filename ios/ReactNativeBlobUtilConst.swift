//
//  ReactNativeBlobUtilConst.swift
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/6/6.
//  Copyright © 2016 suzuri04x2. All rights reserved.
//
//  Ported from ReactNativeBlobUtilConst.{h,mm}. Every value is a wire format:
//  the event names JS subscribes to, the keys it reads out of a fetch config,
//  and the prefixes it puts in front of paths. Changing any string here is a
//  breaking change, which is why they are asserted one by one in
//  ReactNativeBlobUtilE2ETests/ConstantsTests.swift.
//

import Foundation

@objc(ReactNativeBlobUtilConst)
public final class ReactNativeBlobUtilConst: NSObject {
    @objc public static let filePrefix = "ReactNativeBlobUtil-file://"
    @objc public static let assetPrefix = "bundle-assets://"
    @objc public static let alPrefix = "assets-library://"
    @objc public static let configUseTemp = "fileCache"
    @objc public static let configTransformFile = "transformFile"
    @objc public static let configFilePath = "path"
    @objc public static let configFileExt = "appendExt"
    @objc public static let configTrusty = "trusty"
    @objc public static let configWifiOnly = "wifiOnly"
    @objc public static let configIndicator = "indicator"
    @objc public static let configKey = "key"
    @objc public static let configExtraBlobCtype = "binaryContentTypes"
    @objc public static let configCustomCaCerts = "customCACerts"
    @objc public static let configPinnedHosts = "pinnedHosts"
    @objc public static let configTrustSystemCerts = "trustSystemCerts"
    @objc public static let eventStateChange = "ReactNativeBlobUtilState"
    @objc public static let eventServerPush = "ReactNativeBlobUtilServerPush"
    @objc public static let eventProgress = "ReactNativeBlobUtilProgress"
    @objc public static let eventProgressUpload = "ReactNativeBlobUtilProgress-upload"
    @objc public static let eventExpire = "ReactNativeBlobUtilExpire"
    @objc public static let eventFilesystem = "ReactNativeBlobUtilFilesystem"
    @objc public static let msgEvent = "ReactNativeBlobUtilMessage"
    @objc public static let msgEventLog = "log"
    @objc public static let msgEventWarn = "warn"
    @objc public static let msgEventError = "error"
    @objc public static let fsEventData = "data"
    @objc public static let fsEventEnd = "end"
    @objc public static let fsEventWarn = "warn"
    @objc public static let fsEventError = "error"
    @objc public static let keyReportProgress = "reportProgress"
    @objc public static let keyReportUploadProgress = "reportUploadProgress"
    @objc public static let respTypeBase64 = "base64"
    @objc public static let respTypeUtf8 = "utf8"
    @objc public static let respTypePath = "path"
}
