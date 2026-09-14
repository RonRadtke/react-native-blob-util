//
//  ReactNativeBlobUtilLog.swift
//  ReactNativeBlobUtil
//
//  A warning from the native layer is only useful if the developer who caused
//  it sees it. The Objective-C used RCTLogWarn, which reaches the JS console
//  and LogBox; NSLog reaches the device log, which a JS developer is not
//  watching. Swift here does not import React, so the adapter injects a
//  handler at module init and this falls back to NSLog until it does.
//

import Foundation

@objc(ReactNativeBlobUtilLog)
public final class ReactNativeBlobUtilLog: NSObject {

    /// Set once by the adapter, which forwards to RCTLogWarn.
    @objc public static var warningHandler: ((String) -> Void)?

    @objc(warn:)
    public static func warn(_ message: String) {
        if let handler = warningHandler {
            handler(message)
        } else {
            NSLog("%@", message)
        }
    }
}
