//
//  ReactNativeBlobUtilEventSink.swift
//  ReactNativeBlobUtil
//

import Foundation

/// How the Swift half reaches JS without importing React.
///
/// Everything the worker classes send to JS goes through one selector, which
/// ReactNativeBlobUtil already implements: it serialises the body to JSON and
/// sends the resulting **string** as the event payload. Taking it as a protocol
/// rather than as the module class keeps this file free of React and lets the
/// tests hand in a recorder.
@objc(ReactNativeBlobUtilEventSink)
public protocol ReactNativeBlobUtilEventSink: AnyObject {
    @objc(emitEventDict:body:)
    func emitEventDict(_ name: String, body: [AnyHashable: Any])
}
