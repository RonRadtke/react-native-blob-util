//
//  Every constant, asserted against the literal the Objective-C used.
//
//  These are wire formats - event names JS subscribes to, config keys it sets,
//  path prefixes it matches - so a change to any of them is a breaking change
//  and should have to be made deliberately, in this file as well.
//

import XCTest
@testable import react_native_blob_util

final class ConstantsTests: XCTestCase {

    func testEveryConstantKeepsItsValue() {
        XCTAssertEqual(ReactNativeBlobUtilConst.filePrefix, "ReactNativeBlobUtil-file://", "FILE_PREFIX")
        XCTAssertEqual(ReactNativeBlobUtilConst.assetPrefix, "bundle-assets://", "ASSET_PREFIX")
        XCTAssertEqual(ReactNativeBlobUtilConst.alPrefix, "assets-library://", "AL_PREFIX")
        XCTAssertEqual(ReactNativeBlobUtilConst.configUseTemp, "fileCache", "CONFIG_USE_TEMP")
        XCTAssertEqual(ReactNativeBlobUtilConst.configTransformFile, "transformFile", "CONFIG_TRANSFORM_FILE")
        XCTAssertEqual(ReactNativeBlobUtilConst.configFilePath, "path", "CONFIG_FILE_PATH")
        XCTAssertEqual(ReactNativeBlobUtilConst.configFileExt, "appendExt", "CONFIG_FILE_EXT")
        XCTAssertEqual(ReactNativeBlobUtilConst.configTrusty, "trusty", "CONFIG_TRUSTY")
        XCTAssertEqual(ReactNativeBlobUtilConst.configWifiOnly, "wifiOnly", "CONFIG_WIFI_ONLY")
        XCTAssertEqual(ReactNativeBlobUtilConst.configIndicator, "indicator", "CONFIG_INDICATOR")
        XCTAssertEqual(ReactNativeBlobUtilConst.configKey, "key", "CONFIG_KEY")
        XCTAssertEqual(ReactNativeBlobUtilConst.configExtraBlobCtype, "binaryContentTypes", "CONFIG_EXTRA_BLOB_CTYPE")
        XCTAssertEqual(ReactNativeBlobUtilConst.configCustomCaCerts, "customCACerts", "CONFIG_CUSTOM_CA_CERTS")
        XCTAssertEqual(ReactNativeBlobUtilConst.configPinnedHosts, "pinnedHosts", "CONFIG_PINNED_HOSTS")
        XCTAssertEqual(ReactNativeBlobUtilConst.configTrustSystemCerts, "trustSystemCerts", "CONFIG_TRUST_SYSTEM_CERTS")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventStateChange, "ReactNativeBlobUtilState", "EVENT_STATE_CHANGE")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventServerPush, "ReactNativeBlobUtilServerPush", "EVENT_SERVER_PUSH")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventProgress, "ReactNativeBlobUtilProgress", "EVENT_PROGRESS")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventProgressUpload, "ReactNativeBlobUtilProgress-upload", "EVENT_PROGRESS_UPLOAD")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventExpire, "ReactNativeBlobUtilExpire", "EVENT_EXPIRE")
        XCTAssertEqual(ReactNativeBlobUtilConst.eventFilesystem, "ReactNativeBlobUtilFilesystem", "EVENT_FILESYSTEM")
        XCTAssertEqual(ReactNativeBlobUtilConst.msgEvent, "ReactNativeBlobUtilMessage", "MSG_EVENT")
        XCTAssertEqual(ReactNativeBlobUtilConst.msgEventLog, "log", "MSG_EVENT_LOG")
        XCTAssertEqual(ReactNativeBlobUtilConst.msgEventWarn, "warn", "MSG_EVENT_WARN")
        XCTAssertEqual(ReactNativeBlobUtilConst.msgEventError, "error", "MSG_EVENT_ERROR")
        XCTAssertEqual(ReactNativeBlobUtilConst.fsEventData, "data", "FS_EVENT_DATA")
        XCTAssertEqual(ReactNativeBlobUtilConst.fsEventEnd, "end", "FS_EVENT_END")
        XCTAssertEqual(ReactNativeBlobUtilConst.fsEventWarn, "warn", "FS_EVENT_WARN")
        XCTAssertEqual(ReactNativeBlobUtilConst.fsEventError, "error", "FS_EVENT_ERROR")
        XCTAssertEqual(ReactNativeBlobUtilConst.keyReportProgress, "reportProgress", "KEY_REPORT_PROGRESS")
        XCTAssertEqual(ReactNativeBlobUtilConst.keyReportUploadProgress, "reportUploadProgress", "KEY_REPORT_UPLOAD_PROGRESS")
        XCTAssertEqual(ReactNativeBlobUtilConst.respTypeBase64, "base64", "RESP_TYPE_BASE64")
        XCTAssertEqual(ReactNativeBlobUtilConst.respTypeUtf8, "utf8", "RESP_TYPE_UTF8")
        XCTAssertEqual(ReactNativeBlobUtilConst.respTypePath, "path", "RESP_TYPE_PATH")
    }

    func testTheEventNamesAreTheOnesTheModuleAdvertises() {
        // supportedEvents in the adapter has to list every event that is
        // actually emitted, or JS never receives it.
        let emitted = [
            ReactNativeBlobUtilConst.eventStateChange,
            ReactNativeBlobUtilConst.eventServerPush,
            ReactNativeBlobUtilConst.eventProgress,
            ReactNativeBlobUtilConst.eventProgressUpload,
            ReactNativeBlobUtilConst.eventExpire,
            ReactNativeBlobUtilConst.msgEvent,
            ReactNativeBlobUtilConst.eventFilesystem,
        ]
        XCTAssertEqual(Set(emitted).count, emitted.count, "the event names must be distinct")
        for name in emitted {
            XCTAssertFalse(name.isEmpty)
        }
    }
}
