//
//  ReactNativeBlobUtilModuleCore.swift
//  ReactNativeBlobUtil
//
//  The logic that used to live in ReactNativeBlobUtil.mm. What is left in the
//  .mm is the adapter: the things that need React or C++ - the module macro,
//  the RCTEventEmitter subclass, getTurboModule, and one forwarding method per
//  spec method that converts RCT block types into the closures below.
//
//  Nothing here imports React. The document menus need a view controller to
//  present from, which only the adapter can supply, so it is passed in as a
//  provider closure rather than reached for.
//

import Foundation
import UIKit
import Photos

@objc(ReactNativeBlobUtilModuleCore)
public class ReactNativeBlobUtilModuleCore: NSObject, UIDocumentInteractionControllerDelegate {

    /// Where events go. The adapter conforms to this.
    @objc public weak var eventSink: ReactNativeBlobUtilEventSink?

    /// Supplies the controller the document menus present from. Only the
    /// adapter can answer this, because the answer comes from React.
    @objc public var presentingViewController: (() -> UIViewController?)?

    /// Held for as long as a menu is on screen, exactly as the .mm held its
    /// `documentController` property.
    private var documentController: UIDocumentInteractionController?

    @objc public var filePathPrefix: String = ReactNativeBlobUtilConst.filePrefix

    /// readStream is dispatched here, as before.
    @objc public static let fsQueue = DispatchQueue(label: "ReactNativeBlobUtil.fs.queue")

    @objc public override init() {
        super.init()
        // Create the temp folder up front, as the module's init did.
        let temp = ReactNativeBlobUtilFS.getTempPath()
        if !FileManager.default.fileExists(atPath: temp) {
            try? FileManager.default.createDirectory(atPath: temp, withIntermediateDirectories: true)
        }
    }

    // MARK: - constants

    /// Android-only keys are present and empty, because the New Architecture
    /// uses one spec for both platforms and a missing key is a type error.
    @objc public static func constantsToExport() -> [String: Any] {
        return [
            "CacheDir": ReactNativeBlobUtilFS.getCacheDir(),
            "DocumentDir": ReactNativeBlobUtilFS.getDocumentDir(),
            "DownloadDir": ReactNativeBlobUtilFS.getDownloadDir(),
            "LibraryDir": ReactNativeBlobUtilFS.getLibraryDir(),
            "MainBundleDir": ReactNativeBlobUtilFS.getMainBundleDir(),
            "MovieDir": ReactNativeBlobUtilFS.getMovieDir(),
            "MusicDir": ReactNativeBlobUtilFS.getMusicDir(),
            "PictureDir": ReactNativeBlobUtilFS.getPictureDir(),
            "ApplicationSupportDir": ReactNativeBlobUtilFS.getApplicationSupportDir(),
            "RingtoneDir": "",
            "SDCardDir": "",
            "SDCardApplicationDir": "",
            "DCIMDir": "",
            "LegacyDCIMDir": "",
            "LegacyPictureDir": "",
            "LegacyMusicDir": "",
            "LegacyDownloadDir": "",
            "LegacyMovieDir": "",
            "LegacyRingtoneDir": "",
            "LegacySDCardDir": "",
        ]
    }

    // MARK: - fetch

    @objc(fetchBlobForm:taskId:method:url:headers:form:callback:)
    public func fetchBlobForm(_ options: [String: Any]?, taskId: String, method: String,
                              url: String, headers: [String: Any]?, form: [[String: Any]]?,
                              callback: @escaping RNBUCallbackNonNull) {
        ReactNativeBlobUtilReqBuilder.buildMultipartRequest(
            options, taskId: taskId, method: method, url: url, headers: headers, form: form
        ) { [weak self] req, bodyLength in
            guard let req = req else {
                return callback([[
                    "code": "EUNSPECIFIED",
                    "message": "ReactNativeBlobUtil.fetchBlobForm failed to create request body",
                ]])
            }
            ReactNativeBlobUtilNetwork.sharedInstance().sendRequest(
                options, contentLength: bodyLength, baseModule: self?.eventSink,
                taskId: taskId, withRequest: req, callback: { callback($0 ?? []) })
        }
    }

    @objc(fetchBlob:taskId:method:url:headers:body:callback:)
    public func fetchBlob(_ options: [String: Any]?, taskId: String, method: String,
                          url: String, headers: [String: Any]?, body: String?,
                          callback: @escaping RNBUCallbackNonNull) {
        ReactNativeBlobUtilReqBuilder.buildOctetRequest(
            options, taskId: taskId, method: method, url: url, headers: headers, body: body
        ) { [weak self] req, bodyLength in
            guard let req = req else {
                return callback([[
                    "code": "EUNSPECIFIED",
                    "message": "ReactNativeBlobUtil.fetchBlob failed to create request body",
                ]])
            }
            ReactNativeBlobUtilNetwork.sharedInstance().sendRequest(
                options, contentLength: bodyLength, baseModule: self?.eventSink,
                taskId: taskId, withRequest: req, callback: { callback($0 ?? []) })
        }
    }

    // MARK: - file creation

    @objc(createFile:data:encoding:resolve:reject:)
    public func createFile(_ path: String, data: String, encoding: String,
                           resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        let fm = FileManager.default
        var content: Data?
        switch encoding.lowercased() {
        case "utf8":
            content = data.data(using: .utf8, allowLossyConversion: true)
        case "base64":
            content = Data(base64Encoded: data)
        case "uri":
            let orgPath = data.replacingOccurrences(of: ReactNativeBlobUtilConst.filePrefix, with: "")
            content = fm.contents(atPath: orgPath)
        default:
            content = data.data(using: .ascii, allowLossyConversion: true)
        }

        if fm.fileExists(atPath: path) {
            return reject("EEXIST", "File '\(path)' already exists", nil)
        }
        if fm.createFile(atPath: path, contents: content) {
            // Resolves an array holding null, not null. Preserved.
            resolve([NSNull()])
        } else {
            reject("EUNSPECIFIED",
                   "Failed to create new file at path '\(path)', please ensure the folder exists", nil)
        }
    }

    @objc(createFileASCII:data:resolve:reject:)
    public func createFileASCII(_ path: String, data: [NSNumber],
                                resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        let fm = FileManager.default
        let content = Data(data.map { UInt8(bitPattern: $0.int8Value) })
        if fm.fileExists(atPath: path) {
            return reject("EEXIST", "File '\(path)' already exists", nil)
        }
        if fm.createFile(atPath: path, contents: content) {
            resolve([NSNull()])
        } else {
            reject("EUNSPECIFIED",
                   "failed to create new file at path '\(path)', please ensure the folder exists", nil)
        }
    }

    // MARK: - app group

    @objc(pathForAppGroup:resolve:reject:)
    public func pathForAppGroup(_ groupName: String,
                                resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        if let path = ReactNativeBlobUtilFS.getPathForAppGroup(groupName) {
            resolve(path)
        } else {
            reject("EUNSPECIFIED", "could not find path for app group", nil)
        }
    }

    @objc(syncPathAppGroup:)
    public func syncPathAppGroup(_ groupName: String) -> String {
        // Returns "" rather than nil, because the spec declares a string and
        // this one is synchronous on the JS thread.
        return FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: groupName)?.path ?? ""
    }

    // MARK: - plain forwards

    @objc(exists:resolve:reject:)
    public func exists(_ path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.exists(path) { args in
            resolve([
                "exists": (args?.first as? Bool) ?? false,
                "isDirectory": (args?.dropFirst().first as? Bool) ?? false,
            ])
        }
    }

    @objc(writeFile:encoding:data:transformFile:append:resolve:reject:)
    public func writeFile(_ path: String, encoding: String, data: String, transformFile: Bool,
                          append: Bool, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.writeFile(path, encoding: encoding, data: data,
                                        transformFile: transformFile, append: append,
                                        resolver: resolve, rejecter: reject)
    }

    @objc(writeFileArray:data:append:resolve:reject:)
    public func writeFileArray(_ path: String, data: [NSNumber], append: Bool,
                               resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.writeFileArray(path, data: data, append: append,
                                             resolver: resolve, rejecter: reject)
    }

    @objc(mkdir:resolve:reject:)
    public func mkdir(_ path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.mkdir(path, resolver: resolve, rejecter: reject)
    }

    @objc(hash:algorithm:resolve:reject:)
    public func hash(_ path: String, algorithm: String,
                     resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.hash(path, algorithm: algorithm, resolver: resolve, rejecter: reject)
    }

    @objc(slice:dest:start:end:resolve:reject:)
    public func slice(_ src: String, dest: String, start: Double, end: Double,
                      resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.slice(src, dest: dest, start: NSNumber(value: start),
                                    end: NSNumber(value: end), encode: "",
                                    resolver: resolve, rejecter: reject)
    }

    @objc(df:reject:)
    public func df(_ resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.df { args in
            // [NSNull, dict] on success, [message] on failure.
            if let usage = args?.dropFirst().first as? [String: Any] {
                resolve(usage)
            } else {
                reject("EUNSPECIFIED", (args?.first as? String) ?? "failed to get storage usage.", nil)
            }
        }
    }

    // MARK: - network forwards

    @objc(cancelRequest:resolve:reject:)
    public func cancelRequest(_ taskId: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilNetwork.sharedInstance().cancelRequest(taskId)
        resolve(nil)
    }

    @objc(enableProgressReport:interval:count:)
    public func enableProgressReport(_ taskId: String, interval: Double, count: Double) {
        let config = ReactNativeBlobUtilProgress(type: .download,
                                                 interval: NSNumber(value: interval),
                                                 count: NSNumber(value: Int(count)))
        ReactNativeBlobUtilNetwork.sharedInstance().enableProgressReport(taskId, config: config)
    }

    /// interval and count are Double here, matching the spec. The Objective-C
    /// declared them as NSNumber, which did not conform and only worked because
    /// the runtime boxed them on the way in.
    @objc(enableUploadProgressReport:interval:count:)
    public func enableUploadProgressReport(_ taskId: String, interval: Double, count: Double) {
        let config = ReactNativeBlobUtilProgress(type: .upload,
                                                 interval: NSNumber(value: interval),
                                                 count: NSNumber(value: Int(count)))
        ReactNativeBlobUtilNetwork.sharedInstance().enableUploadProgress(taskId, config: config)
    }

    // MARK: - streams

    @objc(writeStream:withEncoding:appendData:resolve:reject:)
    public func writeStream(_ path: String, withEncoding encoding: String, appendData append: Bool,
                            resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        let fm = FileManager.default
        let folder = (path as NSString).deletingLastPathComponent
        var isDir: ObjCBool = false
        let exists = fm.fileExists(atPath: path, isDirectory: &isDir)

        // Each of these returns. cac0cb0 added the returns: without them the
        // method carried on to open a stream on a path it had just rejected and
        // then invoked the callback a second time, which React Native treats as
        // fatal.
        if !exists {
            do {
                try fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
            } catch {
                reject("ENOTDIR",
                       "Failed to create parent directory of '\(path)'; error: \((error as NSError).description)", nil)
                return
            }
            if !fm.createFile(atPath: path, contents: nil) {
                reject("ENOENT", "File '\(path)' does not exist and could not be created", nil)
                return
            }
        } else if isDir.boolValue {
            reject("EISDIR", "Expecting a file but '\(path)' is a directory", nil)
            return
        }

        let stream = ReactNativeBlobUtilFS()
        resolve(stream.openWithPath(path, encode: encoding, appendData: append))
    }

    /// An unknown stream id used to succeed silently, so a caller writing to a
    /// closed or mistyped stream got no signal at all.
    private func stream(_ streamId: String, _ reject: RNBUReject) -> ReactNativeBlobUtilFS? {
        guard let stream = ReactNativeBlobUtilFS.getFileStreams()[streamId] else {
            reject("EBADF", "No such write stream '\(streamId)'", nil)
            return nil
        }
        return stream
    }

    @objc(writeArrayChunk:withArray:resolve:reject:)
    public func writeArrayChunk(_ streamId: String, withArray dataArray: [NSNumber],
                                resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        guard let stream = stream(streamId, reject) else { return }
        stream.write(Data(dataArray.map { UInt8(bitPattern: $0.int8Value) }))
        resolve(nil)
    }

    @objc(writeChunk:withData:resolve:reject:)
    public func writeChunk(_ streamId: String, withData data: String,
                           resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        guard let stream = stream(streamId, reject) else { return }
        stream.writeEncodeChunk(data)
        resolve(nil)
    }

    @objc(closeStream:resolve:reject:)
    public func closeStream(_ streamId: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        guard let stream = stream(streamId, reject) else { return }
        stream.closeOutStream()
        resolve(nil)
    }

    @objc(readStream:encoding:bufferSize:tick:streamId:)
    public func readStream(_ path: String, encoding: String, bufferSize: Double,
                           tick: Double, streamId: String) {
        var size = bufferSize
        if size == 0 {
            // base64 reads in multiples of 3 so a chunk boundary never splits a
            // quantum; everything else uses a round number.
            size = encoding.lowercased() == "base64" ? 4095 : 4096
        }
        let sink = eventSink
        Self.fsQueue.async {
            ReactNativeBlobUtilFS.readStream(path, encoding: encoding, bufferSize: size,
                                             tick: tick, streamId: streamId, baseModule: sink)
        }
    }

    // MARK: - file system forwards

    @objc(unlink:resolve:reject:)
    public func unlink(_ path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        do {
            try FileManager.default.removeItem(atPath: path)
            resolve(nil)
        } catch {
            // Still a success when the path is already gone.
            if !FileManager.default.fileExists(atPath: path) {
                resolve(nil)
            } else {
                reject("EUNSPECIFIED", "failed to unlink file or path at \(path)", nil)
            }
        }
    }

    @objc(removeSession:resolve:reject:)
    public func removeSession(_ paths: [String], resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        for path in paths {
            do {
                try FileManager.default.removeItem(atPath: path)
            } catch {
                reject("EUNSPECIFIED", "failed to remove session path at \(path)", nil)
                return
            }
        }
        resolve(nil)
    }

    @objc(ls:resolve:reject:)
    public func ls(_ path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        let fm = FileManager.default
        var isDir: ObjCBool = false
        if !fm.fileExists(atPath: path, isDirectory: &isDir) {
            return reject("ENOENT", "No such file '\(path)'", nil)
        }
        if !isDir.boolValue {
            return reject("ENOTDIR", "Not a directory '\(path)'", nil)
        }
        do {
            resolve(try fm.contentsOfDirectory(atPath: path))
        } catch {
            reject("EUNSPECIFIED", (error as NSError).description, nil)
        }
    }

    @objc(stat:resolve:reject:)
    public func stat(_ target: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.getPathFromUri(target) { path, asset in
            if let path = path, !path.isEmpty {
                let fm = FileManager.default
                var isDir: ObjCBool = false
                if !fm.fileExists(atPath: path, isDirectory: &isDir) {
                    reject("ENOENT",
                           "failed to stat path `\(path)` because it does not exist or it is not a folder", nil)
                    return
                }
                var error: NSError?
                let result = ReactNativeBlobUtilFS.stat(path, error: &error)
                if let error = error {
                    reject("EUNSPECIFIED", error.localizedDescription, nil)
                } else {
                    resolve(result)
                }
            } else if let asset = asset {
                var info: [String: Any] = [
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "duration": Int(asset.duration),
                    "lastModified": Date(),
                    "type": "asset",
                    "filename": "PHAsset",
                ]
                let options = PHImageRequestOptions()
                options.isSynchronous = true
                options.deliveryMode = .highQualityFormat
                options.resizeMode = .none
                PHImageManager.default().requestImageDataAndOrientation(for: asset, options: options) { imageData, _, _, _ in
                    info["size"] = imageData?.count ?? 0
                    resolve(info)
                }
            } else {
                reject("EINVAL", "failed to stat path, could not resolve URI", nil)
            }
        }
    }

    @objc(lstat:resolve:reject:)
    public func lstat(_ path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        let fm = FileManager.default
        let path = ReactNativeBlobUtilFS.getPathOfAsset(path)
        var isDir: ObjCBool = false
        if !fm.fileExists(atPath: path, isDirectory: &isDir) {
            reject("ENOENT",
                   "failed to lstat path `\(path)` because it does not exist or it is not a folder", nil)
            return
        }

        var error: NSError?
        var res: [Any] = []

        if isDir.boolValue {
            do {
                for p in try fm.contentsOfDirectory(atPath: path) {
                    if let stat = ReactNativeBlobUtilFS.stat("\(path)/\(p)", error: &error) {
                        res.append(stat)
                    }
                }
            } catch let caught as NSError {
                error = caught
            }
        } else {
            // Only a directory is enumerated. This used to call
            // contentsOfDirectoryAtPath: before looking at isDir, and on a
            // regular file that call fails and fills in `error` - so the check
            // below reported the whole lstat as failed even though the file's
            // own stat had succeeded.
            if let stat = ReactNativeBlobUtilFS.stat(path, error: &error) {
                res.append(stat)
            }
        }

        if let error = error {
            reject("EUNSPECIFIED", error.localizedDescription, nil)
        } else {
            resolve(res)
        }
    }

    /// A missing source is ENOENT; anything else keeps EUNSPECIFIED. Foundation
    /// reports the same condition under two codes depending on the call.
    private func fileErrorCode(_ error: NSError) -> String {
        switch error.code {
        case NSFileNoSuchFileError, NSFileReadNoSuchFileError: return "ENOENT"
        default: return "EUNSPECIFIED"
        }
    }

    @objc(cp:dest:resolve:reject:)
    public func cp(_ src: String, dest: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.getPathFromUri(src) { path, asset in
            guard let path = path, !path.isEmpty else {
                if let asset = asset {
                    ReactNativeBlobUtilFS.writeAssetToPath(asset, dest: dest)
                }
                resolve(nil)
                return
            }
            do {
                // Still rejects when the destination exists; ios.json records
                // that difference from Android and C2 is where it changes.
                try FileManager.default.copyItem(at: URL(fileURLWithPath: path),
                                                 to: URL(fileURLWithPath: dest))
                resolve(nil)
            } catch let error as NSError {
                reject(self.fileErrorCode(error), error.localizedDescription, nil)
            }
        }
    }

    @objc(mv:dest:resolve:reject:)
    public func mv(_ path: String, dest: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        do {
            try FileManager.default.moveItem(at: URL(fileURLWithPath: path),
                                             to: URL(fileURLWithPath: dest))
            resolve(nil)
        } catch let error as NSError {
            reject(fileErrorCode(error), error.localizedDescription, nil)
        }
    }

    @objc(readFile:encoding:transformFile:resolve:reject:)
    public func readFile(_ path: String, encoding: String, transformFile: Bool,
                         resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        ReactNativeBlobUtilFS.readFile(path, encoding: encoding, transformFile: transformFile) { content, code, err in
            if err != nil {
                return reject(code, err, nil)
            }
            if encoding == "ascii" {
                // Already an array of per-byte numbers.
                resolve(content)
            } else if encoding == "base64" {
                resolve((content as? Data)?.base64EncodedString(options: []))
            } else {
                resolve(String(data: (content as? Data) ?? Data(), encoding: .utf8))
            }
        }
    }

    @objc(excludeFromBackupKey:resolve:reject:)
    public func excludeFromBackupKey(_ url: String,
                                     resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        var error: NSError?
        // URLWithString, not fileURLWithPath, as before - the caller passes a
        // URL string and a plain path produces a nil URL here.
        if let nsurl = NSURL(string: url) {
            do {
                try nsurl.setResourceValue(NSNumber(value: true), forKey: .isExcludedFromBackupKey)
            } catch let caught as NSError {
                error = caught
            }
        }
        if let error = error {
            // `description`, not localizedDescription: ios.json records the
            // full NSError prose including the underlying error.
            reject("EUNSPECIFIED", error.description, nil)
        } else {
            resolve([NSNull()])
        }
    }

    // MARK: - document menus
    //
    // These need a view controller to present from, which only the adapter can
    // supply. The controller is held for as long as the menu is on screen.

    @objc(presentOptionsMenu:scheme:resolve:reject:)
    public func presentOptionsMenu(_ uri: String, scheme: String?,
                                   resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        presentMenu(uri, scheme: scheme, resolve: resolve, reject: reject) { controller, view in
            controller.presentOptionsMenu(from: .zero, in: view, animated: true)
            return true
        }
    }

    @objc(presentOpenInMenu:scheme:resolve:reject:)
    public func presentOpenInMenu(_ uri: String, scheme: String?,
                                  resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        presentMenu(uri, scheme: scheme, resolve: resolve, reject: reject) { controller, view in
            controller.presentOpenInMenu(from: .zero, in: view, animated: true)
            return true
        }
    }

    @objc(presentPreview:scheme:resolve:reject:)
    public func presentPreview(_ uri: String, scheme: String?,
                               resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        // Unlike the other two, preview reports whether it opened, and rejects
        // when it could not.
        guard let url = encodedURL(uri) else {
            return reject("EINVAL", "document is not supported", nil)
        }
        if !schemeSupported(scheme) {
            return reject("EINVAL", "scheme is not supported", nil)
        }
        let controller = UIDocumentInteractionController(url: url)
        controller.delegate = self
        documentController = controller
        DispatchQueue.main.sync {
            if controller.presentPreview(animated: true) {
                resolve([NSNull()])
            } else {
                reject("EINVAL", "document is not supported", nil)
            }
        }
    }

    private func presentMenu(_ uri: String, scheme: String?,
                             resolve: @escaping RNBUResolve, reject: @escaping RNBUReject,
                             present: @escaping (UIDocumentInteractionController, UIView) -> Bool) {
        guard let url = encodedURL(uri) else {
            return reject("EINVAL", "scheme is not supported", nil)
        }
        if !schemeSupported(scheme) {
            return reject("EINVAL", "scheme is not supported", nil)
        }
        let controller = UIDocumentInteractionController(url: url)
        controller.delegate = self
        documentController = controller
        DispatchQueue.main.sync {
            if let view = self.presentingViewController?()?.view {
                _ = present(controller, view)
            }
        }
        resolve([NSNull()])
    }

    private func encodedURL(_ uri: String) -> URL? {
        guard let encoded = uri.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else {
            return nil
        }
        return URL(string: encoded)
    }

    private func schemeSupported(_ scheme: String?) -> Bool {
        guard let scheme = scheme else { return true }
        guard let url = URL(string: scheme) else { return false }
        return UIApplication.shared.canOpenURL(url)
    }

    public func documentInteractionControllerViewControllerForPreview(
        _ controller: UIDocumentInteractionController) -> UIViewController {
        return presentingViewController?() ?? UIViewController()
    }

    // MARK: - Android only
    //
    // Present because the New Architecture uses one spec for both platforms.

    @objc(actionViewIntent:mime:chooserTitle:resolve:reject:)
    public func actionViewIntent(_ path: String, mime: String, chooserTitle: String,
                                 resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(addCompleteDownload:resolve:reject:)
    public func addCompleteDownload(_ config: [String: Any], resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(copyToInternal:destpath:resolve:reject:)
    public func copyToInternal(_ contentUri: String, destpath: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(copyToMediaStore:mt:path:resolve:reject:)
    public func copyToMediaStore(_ filedata: [String: Any], mt: String, path: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(createMediaFile:mt:resolve:reject:)
    public func createMediaFile(_ filedata: [String: Any], mt: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(getBlob:encoding:resolve:reject:)
    public func getBlob(_ contentUri: String, encoding: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(getContentIntent:resolve:reject:)
    public func getContentIntent(_ mime: String, resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(getSDCardDir:reject:)
    public func getSDCardDir(_ resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(getSDCardApplicationDir:reject:)
    public func getSDCardApplicationDir(_ resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }

    @objc(scanFile:resolve:reject:)
    public func scanFile(_ pairs: [Any], resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOTSUP", "scanFile is only available on Android", nil)
    }

    @objc(writeToMediaFile:path:transformFile:resolve:reject:)
    public func writeToMediaFile(_ fileUri: String, path: String, transformFile: Bool,
                                 resolve: @escaping RNBUResolve, reject: @escaping RNBUReject) {
        reject("ENOT_SUPPORTED", "This method is not supported on iOS", nil)
    }
}
