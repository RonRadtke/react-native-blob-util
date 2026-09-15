//
//  ReactNativeBlobUtilFS.swift
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/6/6.
//  Copyright © 2016 suzuri04x2. All rights reserved.
//
//  Ported from ReactNativeBlobUtilFS.mm. Behaviour is preserved exactly,
//  including the parts that disagree with Android - those differences are
//  recorded in tests/e2e/appium/parity/ios.json and pinned by
//  ReactNativeBlobUtilE2ETests/FileSystemPinTests.swift.
//

import Foundation
import Photos
import CommonCrypto

/// The block shapes React passes in. Declared here rather than imported so this
/// file does not depend on React; the signatures match RCTPromiseResolveBlock,
/// RCTPromiseRejectBlock and RCTResponseSenderBlock as Swift sees them.
public typealias RNBUResolve = (Any?) -> Void
public typealias RNBUReject = (String?, String?, Error?) -> Void
public typealias RNBUCallback = ([Any]?) -> Void
/// The adapter always has an array to give; only the RCT block type is optional.
public typealias RNBUCallbackNonNull = ([Any]) -> Void

@objc(ReactNativeBlobUtilFS)
public class ReactNativeBlobUtilFS: NSObject, StreamDelegate {

    // MARK: - instance state, for the write-stream side

    @objc public var outStream: OutputStream?
    @objc public var inStream: InputStream?
    @objc public var encoding: String?
    @objc public var taskId: String?
    @objc public var path: String?
    @objc public var streamId: String?
    @objc public var bufferSize: Int32 = 0
    @objc public var appendData: Bool = false

    /// The open write streams, keyed by the id handed back to JS.
    ///
    /// Process-global mutable state reached from several queues. The
    /// Objective-C guarded none of it; this lock is the one behavioural
    /// difference, and it cannot change what any caller observes.
    private static var fileStreams: [String: ReactNativeBlobUtilFS] = [:]
    private static let fileStreamsLock = NSLock()

    @objc public override init() {
        super.init()
    }

    @objc(getFileStreams)
    public static func getFileStreams() -> [String: ReactNativeBlobUtilFS] {
        fileStreamsLock.lock()
        defer { fileStreamsLock.unlock() }
        return fileStreams
    }

    @objc(setFileStream:withId:)
    public static func setFileStream(_ instance: ReactNativeBlobUtilFS?, withId uuid: String) {
        fileStreamsLock.lock()
        defer { fileStreamsLock.unlock() }
        fileStreams[uuid] = instance
    }

    // MARK: - system directories

    @objc(getMainBundleDir)
    public static func getMainBundleDir() -> String { Bundle.main.bundlePath }

    private static func searchPath(_ directory: FileManager.SearchPathDirectory) -> String {
        NSSearchPathForDirectoriesInDomains(directory, .userDomainMask, true).first ?? ""
    }

    @objc(getCacheDir) public static func getCacheDir() -> String { searchPath(.cachesDirectory) }
    @objc(getDocumentDir) public static func getDocumentDir() -> String { searchPath(.documentDirectory) }
    @objc(getDownloadDir) public static func getDownloadDir() -> String { searchPath(.downloadsDirectory) }
    @objc(getLibraryDir) public static func getLibraryDir() -> String { searchPath(.libraryDirectory) }
    @objc(getMusicDir) public static func getMusicDir() -> String { searchPath(.musicDirectory) }
    @objc(getMovieDir) public static func getMovieDir() -> String { searchPath(.moviesDirectory) }
    @objc(getPictureDir) public static func getPictureDir() -> String { searchPath(.picturesDirectory) }
    @objc(getApplicationSupportDir) public static func getApplicationSupportDir() -> String {
        searchPath(.applicationSupportDirectory)
    }

    @objc(getTempPath)
    public static func getTempPath() -> String { NSTemporaryDirectory() }

    /// Note the ReactNativeBlobUtil_tmp subdirectory: Android puts these files
    /// straight in DocumentDir, iOS nests them. ios.json records the difference.
    @objc(getTempPath:withExtension:)
    public static func getTempPath(_ taskId: String?, withExtension ext: String?) -> String {
        let documentDir = searchPath(.documentDirectory)
        var filename = "/ReactNativeBlobUtil_tmp/ReactNativeBlobUtilTmp_\(taskId ?? "")"
        if let ext = ext {
            filename += ".\(ext)"
        }
        return documentDir + filename
    }

    @objc(getPathForAppGroup:)
    public static func getPathForAppGroup(_ groupName: String) -> String? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupName)?.path
    }

    /// Resolves bundle-assets:// to a path inside the app bundle; anything else
    /// is handed back untouched.
    @objc(getPathOfAsset:)
    public static func getPathOfAsset(_ assetURI: String) -> String {
        guard assetURI.hasPrefix(ReactNativeBlobUtilConst.assetPrefix) else { return assetURI }
        let relative = assetURI.replacingOccurrences(of: ReactNativeBlobUtilConst.assetPrefix, with: "")
        let name = (relative as NSString).deletingPathExtension
        let ext = (relative as NSString).pathExtension
        // Returning nil here would be a behaviour change: the Objective-C
        // assigned the lookup result straight back, so a missing resource
        // produced nil and the caller dealt with it.
        return Bundle.main.path(forResource: name, ofType: ext) ?? ""
    }

    @objc(getPathFromUri:completionHandler:)
    public static func getPathFromUri(_ uri: String, completionHandler onComplete: @escaping (String?, PHAsset?) -> Void) {
        if uri.hasPrefix(ReactNativeBlobUtilConst.alPrefix) {
            guard let assetURL = URL(string: uri) else { return onComplete(nil, nil) }
            let assets = PHAsset.fetchAssets(withALAssetURLs: [assetURL], options: nil)
            if let asset = assets.firstObject {
                onComplete(nil, asset)
            } else {
                onComplete(nil, nil)
            }
        } else {
            onComplete(getPathOfAsset(uri), nil)
        }
    }

    // MARK: - read stream

    /// Reads a file in chunks, emitting each one as a filesystem event.
    ///
    /// `tick` is a per-chunk sleep in seconds; the Objective-C converted it to
    /// microseconds once, up front, and slept that long after every chunk.
    @objc(readStream:encoding:bufferSize:tick:streamId:baseModule:)
    public static func readStream(_ uri: String,
                                  encoding: String?,
                                  bufferSize: Double,
                                  tick: Double,
                                  streamId: String,
                                  baseModule: ReactNativeBlobUtilEventSink?) {
        getPathFromUri(uri) { path, asset in
            // `usleep` takes microseconds and the original passed tick * 1000
            // straight to it, so a tick of 10 sleeps 10ms, not 10s. Multiplying
            // again here made every chunk sleep a thousand times too long and
            // readStream never finished.
            let backoff = UInt32(max(tick * 1000, 0))
            let chunkSize = Int(bufferSize)

            func pump(_ stream: InputStream) {
                var buffer = [UInt8](repeating: 0, count: max(chunkSize, 1))
                stream.open()
                while true {
                    let read = stream.read(&buffer, maxLength: chunkSize)
                    if read <= 0 { break }
                    emitDataChunks(Data(buffer[0..<read]), encoding: encoding,
                                   streamId: streamId, baseModule: baseModule)
                    if tick > 0 { usleep(backoff) }
                }
                stream.close()
            }

            if let path = path, !path.isEmpty {
                if !FileManager.default.fileExists(atPath: path) {
                    baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
                        "streamId": streamId,
                        "event": ReactNativeBlobUtilConst.fsEventError,
                        "code": "ENOENT",
                        "detail": "File does not exist at path \(path)",
                    ])
                    return
                }
                if let stream = InputStream(fileAtPath: path) { pump(stream) }
            } else if let asset = asset {
                // A PHAsset has no path, so its data is written to a temporary
                // file and read back in the same chunks.
                let options = PHImageRequestOptions()
                options.isSynchronous = true
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .none
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
                    guard let imageData = imageData else { return }
                    let tempPath = (NSTemporaryDirectory() as NSString)
                        .appendingPathComponent("temp_asset_\(UUID().uuidString).tmp")
                    try? imageData.write(to: URL(fileURLWithPath: tempPath))
                    if let stream = InputStream(fileAtPath: tempPath) { pump(stream) }
                    try? FileManager.default.removeItem(atPath: tempPath)
                }
            } else {
                baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
                    "streamId": streamId,
                    "event": ReactNativeBlobUtilConst.fsEventError,
                    "code": "EINVAL",
                    "detail": "Unable to resolve URI",
                ])
            }

            // The Objective-C sent this from an @finally, so it follows every
            // path above, including the ones that already reported an error.
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
                "streamId": streamId,
                "event": ReactNativeBlobUtilConst.fsEventEnd,
                "detail": "",
            ])
        }
    }

    /// Encodes one chunk and emits it. The payload keys are part of the wire
    /// format that fs.js reads, so they stay exactly as they are.
    @objc(emitDataChunks:encoding:streamId:baseModule:)
    public static func emitDataChunks(_ data: Data,
                                      encoding: String?,
                                      streamId: String,
                                      baseModule: ReactNativeBlobUtilEventSink?) {
        let lowered = encoding?.lowercased()
        if lowered == "utf8" {
            // A chunk that splits a multi-byte character decodes to nil. The
            // Objective-C built the payload dictionary with that nil in it,
            // which raises, and reported the exception's own description as the
            // "source" of the failure. ios.json records that text verbatim, so
            // the raise is reproduced rather than the wording copied out.
            let text = String(data: data, encoding: .utf8)
            let raised = ReactNativeBlobUtilExceptionCatch.buildStreamPayload(
                withStreamId: streamId, event: ReactNativeBlobUtilConst.fsEventData, detail: text
            ) { payload in
                baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: payload)
            }
            if let raised = raised {
                reportChunkFailure(encoding: encoding, streamId: streamId,
                                   baseModule: baseModule, detail: raised)
            }
        } else if lowered == "base64" {
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
                "streamId": streamId, "event": ReactNativeBlobUtilConst.fsEventData,
                "detail": data.base64EncodedString(),
            ])
        } else if lowered == "ascii" {
            // Signed, via numberWithChar: - a byte above 0x7f reaches JS negative.
            let bytes = data.map { NSNumber(value: Int8(bitPattern: $0)) }
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
                "streamId": streamId, "event": ReactNativeBlobUtilConst.fsEventData, "detail": bytes,
            ])
        }
    }

    private static func reportChunkFailure(encoding: String?,
                                           streamId: String,
                                           baseModule: ReactNativeBlobUtilEventSink?,
                                           detail: String) {
        let message = "Failed to convert data to '\(encoding ?? "")' encoded string, " +
            "this might due to the source data is not able to convert using this encoding. source = \(detail)"
        baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventFilesystem, body: [
            "streamId": streamId, "event": ReactNativeBlobUtilConst.msgEventError, "detail": message,
        ])
        baseModule?.emitEventDict(ReactNativeBlobUtilConst.msgEvent, body: [
            "streamId": streamId, "event": ReactNativeBlobUtilConst.msgEventWarn, "detail": message,
        ])
    }

    // MARK: - write file from another file

    @objc(writeFileFromFile:toFile:append:callback:)
    public static func writeFileFromFile(_ src: String,
                                         toFile dest: String,
                                         append: Bool,
                                         callback: @escaping (String?, NSNumber?) -> Void) {
        getPathFromUri(src) { path, asset in
            if let path = path, !path.isEmpty {
                guard let input = InputStream(fileAtPath: path),
                      let output = OutputStream(toFileAtPath: dest, append: append) else {
                    return callback("failed to resolve path", nil)
                }
                input.open()
                output.open()
                var buffer = [UInt8](repeating: 0, count: 10240)
                var written = 0
                var read = input.read(&buffer, maxLength: 10240)
                written += read
                while read > 0 {
                    output.write(buffer, maxLength: read)
                    read = input.read(&buffer, maxLength: 10240)
                    // Matches the original: the final read's return value is
                    // added before the loop test, so a read error subtracts.
                    written += read
                }
                output.close()
                input.close()
                callback(nil, NSNumber(value: written))
            } else if let asset = asset {
                let options = PHImageRequestOptions()
                options.isSynchronous = true
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .none
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
                    guard let imageData = imageData else {
                        return callback("Failed to get image data from asset", nil)
                    }
                    try? imageData.write(to: URL(fileURLWithPath: dest), options: .atomic)
                    callback(nil, NSNumber(value: imageData.count))
                }
            } else {
                callback("failed to resolve path", nil)
            }
        }
    }

    // MARK: - write file

    @objc(writeFile:encoding:data:transformFile:append:resolver:rejecter:)
    public static func writeFile(_ path: String,
                                 encoding: String?,
                                 data: String,
                                 transformFile: Bool,
                                 append: Bool,
                                 resolver resolve: @escaping RNBUResolve,
                                 rejecter reject: @escaping RNBUReject) {
        let fm = FileManager.default
        let folder = (path as NSString).deletingLastPathComponent
        let lowered = encoding?.lowercased() ?? ""

        var isDir: ObjCBool = false
        let exists = fm.fileExists(atPath: path, isDirectory: &isDir)

        if isDir.boolValue {
            // Android rejects ENOENT here; ios.json records the difference.
            return reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
        }

        if !exists {
            do {
                try fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
            } catch {
                return reject("ENOTDIR",
                              "Failed to create parent directory of '\(path)'; error: \((error as NSError).description)",
                              nil)
            }
            if !fm.createFile(atPath: path, contents: nil) {
                return reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
            }
        }

        var content: Data?
        if lowered.contains("base64") {
            content = Data(base64Encoded: data)
            if content == nil {
                // Writing nil silently produced NO with no NSError, so an
                // unparseable payload read as a filesystem fault.
                return reject("EINVAL", "Data for '\(path)' is not valid base64", nil)
            }
        } else if lowered == "uri" {
            writeFileFromFile(data, toFile: path, append: append) { errMsg, size in
                if let errMsg = errMsg {
                    reject("EUNSPECIFIED", errMsg, nil)
                } else {
                    resolve(size)
                }
            }
            return
        } else {
            content = data.data(using: .utf8)
        }

        if transformFile {
            guard let transformer = ReactNativeBlobUtilFileTransformer.getFileTransformer() else {
                return reject("EUNSPECIFIED", "Transform specified but transformer not set", nil)
            }
            var failure: String?
            ReactNativeBlobUtilExceptionCatch.transform(content ?? Data(), with: transformer, forWrite: true) { result, exception in
                content = result
                failure = exception
            }
            if let failure = failure {
                return reject("EUNSPECIFIED", failure, nil)
            }
            guard content != nil else {
                return reject("EUNSPECIFIED", "File transformer returned no data", nil)
            }
        }

        let payload = content ?? Data()
        if append {
            guard let handle = FileHandle(forWritingAtPath: path) else {
                return reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
            }
            do {
                try handle.seekToEnd()
                try handle.write(contentsOf: payload)
                try handle.close()
            } catch {
                try? handle.close()
                return reject("EUNSPECIFIED", (error as NSError).description, error)
            }
        } else {
            do {
                try payload.write(to: URL(fileURLWithPath: path), options: .atomic)
            } catch {
                return reject("EUNSPECIFIED",
                              "File '\(path)' could not be written; error: \((error as NSError).description)",
                              error)
            }
        }

        resolve(NSNumber(value: payload.count))
    }

    @objc(writeFileArray:data:append:resolver:rejecter:)
    public static func writeFileArray(_ path: String,
                                      data: [NSNumber],
                                      append: Bool,
                                      resolver resolve: @escaping RNBUResolve,
                                      rejecter reject: @escaping RNBUReject) {
        let fm = FileManager.default
        let folder = (path as NSString).deletingLastPathComponent

        var isDir: ObjCBool = false
        let exists = fm.fileExists(atPath: path, isDirectory: &isDir)

        if isDir.boolValue {
            return reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
        }

        if !exists {
            do {
                try fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
            } catch {
                return reject("EUNSPECIFIED",
                              "Failed to create parent directory of '\(path)'; error: \((error as NSError).description)",
                              nil)
            }
        }

        // charValue, so the array is read as signed bytes.
        let content = Data(data.map { UInt8(bitPattern: $0.int8Value) })

        if !exists {
            if !fm.createFile(atPath: path, contents: content) {
                return reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
            }
        } else if append {
            guard let handle = FileHandle(forWritingAtPath: path) else {
                return reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
            }
            do {
                try handle.seekToEnd()
                try handle.write(contentsOf: content)
                try handle.close()
            } catch {
                try? handle.close()
                return reject("EUNSPECIFIED", (error as NSError).description, error)
            }
        } else {
            do {
                try content.write(to: URL(fileURLWithPath: path), options: .atomic)
            } catch {
                return reject("EUNSPECIFIED", "File '\(path)' could not be written.", nil)
            }
        }

        resolve(NSNumber(value: data.count))
    }

    // MARK: - read file

    /// `content` is `Any?` rather than `Data?` on purpose. utf8, base64 and a nil
    /// encoding yield Data; **ascii yields an array of signed per-byte NSNumbers**.
    /// The Objective-C declared this parameter as NSData * and passed an NSArray
    /// through it anyway, which Objective-C callers survive and a Swift closure
    /// does not - the bridging thunk sends -_bridgingCopy:length: to the array.
    @objc(readFile:encoding:transformFile:onComplete:)
    public static func readFile(_ path: String,
                                encoding: String?,
                                transformFile: Bool,
                                onComplete: @escaping (Any?, String?, String?) -> Void) {
        getPathFromUri(path) { resolved, asset in
            if let asset = asset {
                let options = PHImageRequestOptions()
                options.isSynchronous = true
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .none
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
                    if let imageData = imageData {
                        onComplete(imageData, nil, nil)
                    } else {
                        onComplete(nil, "EUNSPECIFIED", "Failed to get image data from asset")
                    }
                }
                return
            }

            let path = resolved ?? ""
            var isDir: ObjCBool = false
            // The directory branch used to sit inside the "does not exist"
            // case, where isDir is never true, so a directory fell through to
            // the read: -contents(atPath:) returns nil for one and the call
            // resolved "". Android reported EISDIR and 1.0 does the same, so
            // the two checks are separate now.
            if !FileManager.default.fileExists(atPath: path, isDirectory: &isDir) {
                onComplete(nil, "ENOENT", "No such file '\(path)'")
                return
            }
            if isDir.boolValue {
                onComplete(nil, "EISDIR", "Expecting a file but '\(path)' is a directory")
                return
            }

            var fileContent = FileManager.default.contents(atPath: path) ?? Data()

            if transformFile {
                guard let transformer = ReactNativeBlobUtilFileTransformer.getFileTransformer() else {
                    onComplete(nil, "EUNSPECIFIED", "Transform specified but transformer not set")
                    return
                }
                var transformed: Data?
                var failure: String?
                ReactNativeBlobUtilExceptionCatch.transform(fileContent, with: transformer, forWrite: false) { result, exception in
                    transformed = result
                    failure = exception
                }
                if let failure = failure {
                    onComplete(nil, "EUNSPECIFIED", "Exception on File Transformer: '\(failure)' ")
                    return
                }
                guard let transformed = transformed else {
                    onComplete(nil, "EUNSPECIFIED", "File transformer returned no data")
                    return
                }
                fileContent = transformed
            }

            guard let encoding = encoding else {
                return onComplete(fileContent, nil, nil)
            }

            switch encoding.lowercased() {
            case "utf8":
                // The bytes, whatever they are. There was a Latin-1 fallback
                // here for content that is not valid UTF-8, but decoding and
                // re-encoding Latin-1 returns those same bytes, so it only ever
                // decided which of two identical values to hand back. Turning
                // them into text, with U+FFFD where the bytes are not valid, is
                // the caller's side of the boundary.
                onComplete(fileContent, nil, nil)
            case "base64":
                // Round-trips through base64 and back, so the result is the
                // original bytes again.
                let encoded = fileContent.base64EncodedString()
                onComplete(Data(base64Encoded: encoded), nil, nil)
            case "ascii":
                onComplete(fileContent.map { NSNumber(value: Int8(bitPattern: $0)) }, nil, nil)
            default:
                // No branch matched, so the Objective-C called nothing at all.
                break
            }
        }
    }

    @objc(readFile:encoding:onComplete:)
    public static func readFile(_ path: String,
                                encoding: String?,
                                onComplete: @escaping (Any?, String?, String?) -> Void) {
        readFile(path, encoding: encoding, transformFile: false, onComplete: onComplete)
    }

    // MARK: - hash

    /// CommonCrypto rather than CryptoKit, because CryptoKit has no SHA-224 and
    /// dropping it would be a behaviour change - Android and iOS both offer it,
    /// and only Windows does not.
    @objc(hash:algorithm:resolver:rejecter:)
    public static func hash(_ path: String,
                            algorithm: String,
                            resolver resolve: @escaping RNBUResolve,
                            rejecter reject: @escaping RNBUReject) {
        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: path, isDirectory: &isDir)

        if isDir.boolValue {
            return reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
        }
        if !exists {
            return reject("ENOENT", "No such file '\(path)'", nil)
        }

        let attributes: [FileAttributeKey: Any]
        do {
            attributes = try FileManager.default.attributesOfItem(atPath: path)
        } catch {
            return reject("EUNKNOWN", (error as NSError).description, nil)
        }

        if attributes[.type] as? FileAttributeType == .typeDirectory {
            return reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
        }

        guard let handle = FileHandle(forReadingAtPath: path) else {
            return reject("EUNKNOWN", "Error opening '\(path)' for reading", nil)
        }
        defer { try? handle.close() }

        let lengths: [String: Int] = [
            "md5": Int(CC_MD5_DIGEST_LENGTH),
            "sha1": Int(CC_SHA1_DIGEST_LENGTH),
            "sha224": Int(CC_SHA224_DIGEST_LENGTH),
            "sha256": Int(CC_SHA256_DIGEST_LENGTH),
            "sha384": Int(CC_SHA384_DIGEST_LENGTH),
            "sha512": Int(CC_SHA512_DIGEST_LENGTH),
        ]
        guard let digestLength = lengths[algorithm] else {
            return reject("EINVAL",
                          "Invalid algorithm '\(algorithm)', must be one of md5, sha1, sha224, sha256, sha384, sha512",
                          nil)
        }

        // SHA-224 and SHA-256 share a context, as do SHA-384 and SHA-512.
        var md5 = CC_MD5_CTX()
        var sha1 = CC_SHA1_CTX()
        var sha256 = CC_SHA256_CTX()
        var sha512 = CC_SHA512_CTX()

        switch algorithm {
        case "md5": CC_MD5_Init(&md5)
        case "sha1": CC_SHA1_Init(&sha1)
        case "sha224": CC_SHA224_Init(&sha256)
        case "sha256": CC_SHA256_Init(&sha256)
        case "sha384": CC_SHA384_Init(&sha512)
        case "sha512": CC_SHA512_Init(&sha512)
        default: break
        }

        let chunkSize = 1024 * 1024 // 1 megabyte, as before
        while true {
            let chunk: Data
            do {
                chunk = try handle.read(upToCount: chunkSize) ?? Data()
            } catch {
                return reject("EREAD", "Error reading file '\(path)'", error)
            }
            if chunk.isEmpty { break }
            chunk.withUnsafeBytes { raw in
                let base = raw.baseAddress
                let length = CC_LONG(chunk.count)
                switch algorithm {
                case "md5": CC_MD5_Update(&md5, base, length)
                case "sha1": CC_SHA1_Update(&sha1, base, length)
                case "sha224": CC_SHA224_Update(&sha256, base, length)
                case "sha256": CC_SHA256_Update(&sha256, base, length)
                case "sha384": CC_SHA384_Update(&sha512, base, length)
                case "sha512": CC_SHA512_Update(&sha512, base, length)
                default: break
                }
            }
        }

        var buffer = [UInt8](repeating: 0, count: digestLength)
        switch algorithm {
        case "md5": CC_MD5_Final(&buffer, &md5)
        case "sha1": CC_SHA1_Final(&buffer, &sha1)
        case "sha224": CC_SHA224_Final(&buffer, &sha256)
        case "sha256": CC_SHA256_Final(&buffer, &sha256)
        case "sha384": CC_SHA384_Final(&buffer, &sha512)
        case "sha512": CC_SHA512_Final(&buffer, &sha512)
        default: break
        }

        resolve(buffer.map { String(format: "%02x", $0) }.joined())
    }

    // MARK: - mkdir

    @objc(mkdir:resolver:rejecter:)
    public static func mkdir(_ path: String,
                             resolver resolve: @escaping RNBUResolve,
                             rejecter reject: @escaping RNBUReject) {
        var isDir: ObjCBool = false
        if FileManager.default.fileExists(atPath: path, isDirectory: &isDir) {
            // "Directory" or "File", chosen from what is actually there.
            return reject("EEXIST", "\(isDir.boolValue ? "Directory" : "File") '\(path)' already exists", nil)
        }
        do {
            try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
            resolve(true)
        } catch {
            reject("EUNSPECIFIED",
                   "Error creating folder '\(path)', error: \((error as NSError).description)",
                   nil)
        }
    }

    // MARK: - stat

    /// An explicit error pointer rather than `throws`, because the callers depend
    /// on semantics `throws` cannot express: a missing path returns nil and
    /// leaves the error untouched, while the Foundation calls below can fill the
    /// error in and still return a dictionary. ReactNativeBlobUtil.mm checks the
    /// error rather than the result, and lstat appends the result either way.
    @objc(stat:error:)
    public static func stat(_ path: String, error: NSErrorPointer) -> [String: Any]? {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: path, isDirectory: &isDir) else {
            return nil
        }

        var fileSize: UInt64 = 0
        do {
            let info = try FileManager.default.attributesOfItem(atPath: path)
            fileSize = (info[.size] as? NSNumber)?.uint64Value ?? 0
        } catch let caught as NSError {
            error?.pointee = caught
        }

        var lastModified: Date?
        do {
            var value: AnyObject?
            try (URL(fileURLWithPath: path) as NSURL).getResourceValue(&value, forKey: .contentModificationDateKey)
            lastModified = value as? Date
        } catch let caught as NSError {
            error?.pointee = caught
        }

        // size is a string; lastModified is a number. Only size gets "%llu".
        // fs.js parseInts both, so callers never see the mix - but ios.json does.
        // The seconds are truncated *before* the multiply, exactly as the cast in
        // `(time_t)[date timeIntervalSince1970]*1000` did, so the value always
        // ends in 000.
        let millis = Int(lastModified?.timeIntervalSince1970 ?? 0) * 1000
        return [
            "size": String(format: "%llu", fileSize),
            "filename": (path as NSString).lastPathComponent,
            "path": path,
            "lastModified": NSNumber(value: millis),
            "type": isDir.boolValue ? "directory" : "file",
        ]
    }

    // MARK: - exists

    @objc(exists:callback:)
    public static func exists(_ path: String, callback: @escaping RNBUCallback) {
        getPathFromUri(path) { resolved, asset in
            if let resolved = resolved, !resolved.isEmpty {
                var isDir: ObjCBool = false
                let exists = FileManager.default.fileExists(atPath: resolved, isDirectory: &isDir)
                callback([exists, isDir.boolValue])
            } else if asset != nil {
                callback([true, false])
            } else {
                callback([false, false])
            }
        }
    }

    // MARK: - slice

    @objc(slice:dest:start:end:encode:resolver:rejecter:)
    public static func slice(_ path: String,
                             dest: String,
                             start: NSNumber,
                             end: NSNumber,
                             encode: String?,
                             resolver resolve: @escaping RNBUResolve,
                             rejecter reject: @escaping RNBUReject) {
        getPathFromUri(path) { resolved, asset in
            if let path = resolved, !path.isEmpty {
                let fm = FileManager.default
                let expected = end.intValue - start.intValue

                guard let handle = FileHandle(forReadingAtPath: path) else {
                    return reject("ENOENT", "No such file '\(path)'", nil)
                }
                guard let output = OutputStream(toFileAtPath: dest, append: false) else {
                    return reject("ENOENT", "File '\(dest)' does not exist and could not be created", nil)
                }
                output.open()

                var isDir: ObjCBool = false
                let exists = fm.fileExists(atPath: path, isDirectory: &isDir)
                if isDir.boolValue {
                    return reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
                }
                if !exists {
                    return reject("ENOENT", "No such file '\(path)'", nil)
                }

                let size = ((try? fm.attributesOfItem(atPath: path))?[.size] as? NSNumber)?.intValue ?? 0
                let max = min(size, end.intValue)

                if !fm.fileExists(atPath: dest) {
                    if !fm.createFile(atPath: dest, contents: Data()) {
                        return reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
                    }
                }

                handle.seek(toFileOffset: UInt64(start.intValue))
                var read = 0
                while read < expected {
                    let remaining = max - read - start.intValue
                    let chunkSize = (start.intValue + read + 10240 > max) ? remaining : 10240
                    if chunkSize <= 0 { break }
                    let chunk = handle.readData(ofLength: chunkSize)
                    if chunk.isEmpty { break }
                    _ = chunk.withUnsafeBytes { output.write($0.bindMemory(to: UInt8.self).baseAddress!, maxLength: chunkSize) }
                    read += chunk.count
                }
                handle.closeFile()
                output.close()
                resolve(dest)
            } else if let asset = asset {
                let options = PHImageRequestOptions()
                options.isSynchronous = true
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .none
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
                    guard let imageData = imageData else {
                        return reject("EUNSPECIFIED", "Failed to get image data from asset", nil)
                    }
                    let length = imageData.count
                    let startPos = Swift.max(0, Swift.min(start.intValue, length))
                    let endPos = Swift.max(startPos, Swift.min(end.intValue, length))
                    let slice = imageData.subdata(in: startPos..<endPos)
                    do {
                        try slice.write(to: URL(fileURLWithPath: dest), options: .atomic)
                        resolve(dest)
                    } catch {
                        reject("EUNSPECIFIED", "Failed to write slice to file", nil)
                    }
                }
            } else {
                reject("EINVAL", "Could not resolve URI \(resolved ?? "")", nil)
            }
        }
    }

    // MARK: - disk space

    @objc(df:)
    public static func df(_ callback: @escaping RNBUCallback) {
        let paths = NSSearchPathForDirectoriesInDomains(.documentDirectory, .userDomainMask, true)
        guard let last = paths.last,
              let attributes = try? FileManager.default.attributesOfFileSystem(forPath: last) else {
            return callback(["failed to get storage usage."])
        }
        callback([NSNull(), [
            "free": attributes[.systemFreeSize] ?? NSNumber(value: 0),
            "total": attributes[.systemSize] ?? NSNumber(value: 0),
        ]])
    }

    @objc(writeAssetToPath:dest:)
    public static func writeAssetToPath(_ asset: PHAsset, dest: String) {
        guard asset.mediaType == .image else { return }
        let options = PHImageRequestOptions()
        options.isSynchronous = true
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
            guard let imageData = imageData else { return }
            try? imageData.write(to: URL(fileURLWithPath: dest), options: .atomic)
        }
    }

    // MARK: - write stream instance

    @objc(openWithPath:encode:appendData:)
    public func openWithPath(_ destPath: String, encode: String?, appendData append: Bool) -> String {
        outStream = OutputStream(toFileAtPath: destPath, append: append)
        encoding = encode
        outStream?.schedule(in: .current, forMode: .common)
        outStream?.open()
        let uuid = UUID().uuidString
        streamId = uuid
        ReactNativeBlobUtilFS.setFileStream(self, withId: uuid)
        return uuid
    }

    @objc(writeEncodeChunk:)
    public func writeEncodeChunk(_ chunk: String) {
        var decoded: Data?
        switch encoding?.lowercased() {
        case "base64":
            decoded = Data(base64Encoded: chunk, options: .ignoreUnknownCharacters)
        case "utf8":
            decoded = chunk.data(using: .utf8)
        case "ascii":
            decoded = chunk.data(using: .ascii)
        default:
            decoded = nil
        }
        guard let data = decoded else { return }
        write(data)
    }

    @objc(write:)
    public func write(_ chunk: Data) {
        guard let stream = outStream else { return }
        var left = chunk.count
        chunk.withUnsafeBytes { raw in
            guard var pointer = raw.bindMemory(to: UInt8.self).baseAddress else { return }
            while left > 0 {
                let written = stream.write(pointer, maxLength: left)
                if written <= 0 { break }
                left -= written
                pointer += written
            }
        }
        if left > 0 {
            NSLog("stream error: %@", String(describing: stream.streamError))
        }
    }

    @objc(closeOutStream)
    public func closeOutStream() {
        if outStream != nil {
            outStream?.close()
            outStream = nil
        }
    }

    @objc(closeInStream)
    public func closeInStream() {
        if inStream != nil {
            inStream?.close()
            inStream?.remove(from: .current, forMode: .common)
            if let streamId = streamId {
                ReactNativeBlobUtilFS.setFileStream(nil, withId: streamId)
            }
            streamId = nil
        }
    }
}
