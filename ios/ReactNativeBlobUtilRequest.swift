//
//  ReactNativeBlobUtilRequest.swift
//  ReactNativeBlobUtil
//
//  Created by Artur Chrusciel on 15.01.18.
//  Copyright © 2018 wkh237.github.io. All rights reserved.
//
//  Ported from ReactNativeBlobUtilRequest.mm. The response shape - redirects,
//  respType, rnfbEncode, status, headers, timeout - is recorded in
//  tests/e2e/appium/parity/ios.json, so it is reproduced key for key. The trust
//  decision below is translated statement by statement and deliberately not
//  tidied: four of the six tls scenario cases assert that a request is refused,
//  and a "cleaner" version that falls back to the system store passes a naive
//  reading while silently disabling the pinning the caller asked for.
//

import Foundation
import CommonCrypto
import UIKit

private enum ResponseFormat {
    case utf8
    case base64
    case auto
}

@objc(ReactNativeBlobUtilRequest)
public class ReactNativeBlobUtilRequest: NSObject, URLSessionDelegate, URLSessionTaskDelegate,
                                          URLSessionDataDelegate, URLSessionDownloadDelegate {

    @objc public var taskId: String?
    @objc public var expectedBytes: Int64 = 0
    @objc public var receivedBytes: Int64 = 0
    @objc public var isServerPush: Bool = false
    @objc public var respData: NSMutableData?
    @objc public var callback: RNBUCallback?
    @objc public weak var baseModule: ReactNativeBlobUtilEventSink?
    @objc public var options: [String: Any]?
    @objc public var error: Error?
    @objc public var progressConfig: ReactNativeBlobUtilProgress?
    @objc public var uploadProgressConfig: ReactNativeBlobUtilProgress?
    @objc public var task: URLSessionTask?

    private var respFile = false
    private var isIncrement = false
    private var partBuffer: NSMutableData?
    private var destPath: String = ""
    private var writeStream: OutputStream?
    private var bodyLength: Int = 0
    private var respStatus: Int = 0
    private var redirects: [String] = []
    private var responseFormat: ResponseFormat = .auto
    private var followRedirect = true
    private var backgroundTask = false

    private func md5(_ input: String) -> String {
        let data = Data(input.utf8)
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
        data.withUnsafeBytes { CC_MD5($0.baseAddress, CC_LONG(data.count), &digest) }
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    /// Maps an NSURLError onto the code JS branches on. The message is left
    /// alone: a caller that wants to show something reads that, and a caller
    /// that wants to retry reads the code. Anything unrecognised stays
    /// EUNSPECIFIED rather than being guessed at.
    private static func networkErrorCode(_ error: NSError) -> String {
        guard error.domain == NSURLErrorDomain else { return "EUNSPECIFIED" }
        switch error.code {
        case NSURLErrorTimedOut:
            return "ETIMEDOUT"
        case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed:
            return "ENOTFOUND"
        case NSURLErrorCannotConnectToHost:
            return "ECONNREFUSED"
        case NSURLErrorNetworkConnectionLost:
            return "ECONNRESET"
        case NSURLErrorNotConnectedToInternet:
            return "ENETUNREACH"
        case NSURLErrorSecureConnectionFailed,
             NSURLErrorServerCertificateHasBadDate,
             NSURLErrorServerCertificateUntrusted,
             NSURLErrorServerCertificateHasUnknownRoot,
             NSURLErrorServerCertificateNotYetValid,
             NSURLErrorClientCertificateRejected,
             NSURLErrorClientCertificateRequired:
            return "ESSL"
        case NSURLErrorCancelled:
            return "ECANCELED"
        case NSURLErrorBadURL, NSURLErrorUnsupportedURL:
            return "EINVAL"
        default:
            return "EUNSPECIFIED"
        }
    }

    private func shouldTransformFile() -> Bool {
        (options?[ReactNativeBlobUtilConst.configTransformFile] as? NSNumber)?.boolValue ?? false
    }

    // MARK: - sending

    @objc(sendRequest:contentLength:baseModule:taskId:withRequest:taskOperationQueue:callback:)
    public func sendRequest(_ options: [String: Any]?,
                            contentLength: Int,
                            baseModule: ReactNativeBlobUtilEventSink?,
                            taskId: String?,
                            withRequest req: URLRequest?,
                            taskOperationQueue operationQueue: OperationQueue,
                            callback: RNBUCallback?) {
        self.taskId = taskId
        self.respData = NSMutableData(length: 0)
        self.callback = callback
        self.baseModule = baseModule
        self.expectedBytes = 0
        self.receivedBytes = 0
        self.options = options

        backgroundTask = (options?["IOSBackgroundTask"] as? NSNumber)?.boolValue ?? false
        // Defaults to true when unset.
        followRedirect = options?["followRedirect"] == nil
            ? true
            : ((options?["followRedirect"] as? NSNumber)?.boolValue ?? false)
        isIncrement = (options?["increment"] as? NSNumber)?.boolValue ?? false
        redirects = []

        if let url = req?.url?.absoluteString {
            redirects.append(url)
        }

        switch (req?.allHTTPHeaderFields?["RNFB-Response"])?.lowercased() {
        case "base64": responseFormat = .base64
        case "utf8": responseFormat = .utf8
        default: responseFormat = .auto
        }

        let path = self.options?[ReactNativeBlobUtilConst.configFilePath] as? String
        let key = self.options?[ReactNativeBlobUtilConst.configKey] as? String

        bodyLength = contentLength

        var configuration = URLSessionConfiguration.default
        if backgroundTask {
            configuration = URLSessionConfiguration.background(withIdentifier: taskId ?? "")
        }

        // -1 when not set in options; only a positive value is applied.
        let timeout = (options?["timeout"] as? NSNumber)?.floatValue ?? -1
        if timeout > 0 {
            configuration.timeoutIntervalForRequest = TimeInterval(timeout / 1000)
        }

        if let wifiOnly = options?[ReactNativeBlobUtilConst.configWifiOnly] as? NSNumber, wifiOnly.boolValue {
            configuration.allowsCellularAccess = false
        }

        configuration.httpMaximumConnectionsPerHost = 10
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: operationQueue)

        if path != nil || self.options?[ReactNativeBlobUtilConst.configUseTemp] != nil {
            respFile = true

            var cacheKey = taskId ?? ""
            if let key = key {
                cacheKey = md5(key)
                if cacheKey.isEmpty { cacheKey = taskId ?? "" }

                destPath = ReactNativeBlobUtilFS.getTempPath(cacheKey,
                                                             withExtension: self.options?[ReactNativeBlobUtilConst.configFileExt] as? String)
                if FileManager.default.fileExists(atPath: destPath) {
                    callback?([NSNull(), ReactNativeBlobUtilConst.respTypePath, destPath])
                    return
                }
            }

            if let path = path {
                destPath = path
            } else {
                destPath = ReactNativeBlobUtilFS.getTempPath(cacheKey,
                                                             withExtension: self.options?[ReactNativeBlobUtilConst.configFileExt] as? String)
            }

            // Still needed as a placeholder while the transform is deferred.
            if shouldTransformFile() {
                respData = NSMutableData()
            }
        } else {
            respData = NSMutableData()
            respFile = false
        }

        guard let req = req else { return }
        if backgroundTask {
            let downloadTask = session.downloadTask(with: req)
            downloadTask.resume()
            task = downloadTask
        } else {
            let dataTask = session.dataTask(with: req)
            dataTask.resume()
            task = dataTask
        }

        if let indicator = options?[ReactNativeBlobUtilConst.configIndicator] as? NSNumber, indicator.boolValue {
            DispatchQueue.main.async {
                UIApplication.shared.isNetworkActivityIndicatorVisible = true
            }
        }
    }

    // MARK: - writing

    private func configureWriteStream() {
        guard respFile else { return }
        let fm = FileManager.default
        let folder = (destPath as NSString).deletingLastPathComponent
        if !fm.fileExists(atPath: folder) {
            try? fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
        }

        // Defaults to true when unset. The ?append=true suffix is read and then
        // immediately overwritten by !overwrite - kept as it was.
        let overwrite = options?["overwrite"] == nil
            ? true
            : ((options?["overwrite"] as? NSNumber)?.boolValue ?? false)
        var appendToExistingFile = destPath.contains("?append=true")
        appendToExistingFile = !overwrite

        if appendToExistingFile {
            destPath = destPath.replacingOccurrences(of: "?append=true", with: "")
        }

        if !fm.fileExists(atPath: destPath) {
            fm.createFile(atPath: destPath, contents: Data())
        }

        writeStream = OutputStream(toFileAtPath: destPath, append: appendToExistingFile)
        writeStream?.schedule(in: .current, forMode: .common)
        writeStream?.open()
    }

    private func processData(_ data: Data) {
        if respFile && !shouldTransformFile() {
            _ = data.withUnsafeBytes { raw -> Int in
                guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return writeStream?.write(base, maxLength: data.count) ?? 0
            }
        } else {
            respData?.append(data)
        }
    }

    private func copyDownloadedFile(_ sourceURL: URL, toPath targetPath: String, append: Bool) -> Bool {
        guard let input = InputStream(url: sourceURL),
              let output = OutputStream(toFileAtPath: targetPath, append: append) else {
            return false
        }
        input.open()
        output.open()
        defer { input.close(); output.close() }

        var buffer = [UInt8](repeating: 0, count: 65536)
        while input.hasBytesAvailable {
            let read = input.read(&buffer, maxLength: buffer.count)
            if read < 0 { return false }
            if read == 0 { break }

            var written = 0
            while written < read {
                let result = buffer[written...].withUnsafeBufferPointer {
                    output.write($0.baseAddress!, maxLength: read - written)
                }
                if result <= 0 { return false }
                written += result
            }
        }
        return true
    }

    // MARK: - NSURLSession delegates

    public func urlSession(_ session: URLSession,
                           dataTask: URLSessionDataTask,
                           didReceive response: URLResponse,
                           completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        expectedBytes = response.expectedContentLength

        let httpResponse = response as? HTTPURLResponse
        let statusCode = httpResponse?.statusCode ?? 0
        var respType = ""
        respStatus = statusCode

        guard let headers = httpResponse?.allHeaderFields else {
            NSLog("oops")
            configureWriteStream()
            completionHandler(.allow)
            return
        }

        let headerDict = headers as? [String: Any] ?? [:]
        let respCType = ReactNativeBlobUtilReqBuilder
            .getHeaderIgnoreCases("Content-Type", fromHeaders: headerDict)?.lowercased()

        if isServerPush {
            if let partBuffer = partBuffer {
                baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventServerPush, body: [
                    "taskId": taskId ?? "",
                    "chunk": partBuffer.base64EncodedString(options: []),
                ])
            }
            self.partBuffer = NSMutableData()
            completionHandler(.allow)
            return
        } else {
            isServerPush = respCType?.contains("multipart/x-mixed-replace;") ?? false
        }

        if let respCType = respCType {
            let extraBlobCTypes = options?[ReactNativeBlobUtilConst.configExtraBlobCtype] as? [String]
            if respCType.contains("text/") {
                respType = "text"
            } else if respCType.contains("application/json") {
                respType = "json"
            } else if let extraBlobCTypes = extraBlobCTypes {
                for substr in extraBlobCTypes where respCType.contains(substr.lowercased()) {
                    respType = "blob"
                    respFile = true
                    destPath = ReactNativeBlobUtilFS.getTempPath(taskId, withExtension: nil)
                    break
                }
            } else {
                respType = "blob"
                // For XMLHttpRequest, switch the strategy automatically.
                if options?["auto"] != nil {
                    respFile = true
                    destPath = ReactNativeBlobUtilFS.getTempPath(taskId, withExtension: "")
                }
            }
        } else {
            respType = "text"
        }

        // #153: keep cookies the response sets.
        if let url = response.url {
            let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerDict as? [String: String] ?? [:], for: url)
            if !cookies.isEmpty {
                HTTPCookieStorage.shared.setCookies(cookies, for: url, mainDocumentURL: nil)
            }
        }

        baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventStateChange, body: [
            "taskId": taskId ?? "",
            "state": "2",
            "headers": headerDict,
            "redirects": redirects,
            "respType": respType,
            "timeout": false,
            "status": NSNumber(value: statusCode),
        ])

        configureWriteStream()
        completionHandler(.allow)
    }

    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        // #143: multipart/x-mixed-replace is buffered, not reported.
        if isServerPush {
            partBuffer?.append(data)
            return
        }

        receivedBytes += Int64(data.count)
        var chunkString = ""
        if isIncrement {
            chunkString = String(data: data, encoding: .utf8) ?? ""
        }

        // Writing into the file is deferred when the data still has to be
        // transformed.
        processData(data)

        if expectedBytes == 0 { return }

        let now: NSNumber
        if expectedBytes != NSURLSessionTransferSizeUnknown {
            now = NSNumber(value: Float(receivedBytes) / Float(expectedBytes))
        } else {
            now = 0
        }

        if progressConfig?.shouldReport(now) == true {
            let body: [String: Any]
            if expectedBytes == NSURLSessionTransferSizeUnknown {
                body = ["taskId": taskId ?? "", "written": 0, "total": expectedBytes, "chunk": chunkString]
            } else {
                body = ["taskId": taskId ?? "", "written": receivedBytes, "total": expectedBytes, "chunk": chunkString]
            }
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventProgress, body: body)
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        self.error = error
        var errMsg: String?
        var errCode: String?
        var respStr: String?
        var rnfbRespType: String?

        if let indicator = options?[ReactNativeBlobUtilConst.configIndicator] as? NSNumber, indicator.boolValue {
            DispatchQueue.main.async {
                UIApplication.shared.isNetworkActivityIndicatorVisible = false
            }
        }

        if let error = error as NSError? {
            errCode = Self.networkErrorCode(error)
            if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled {
                // The message a cancelled task has always reported.
                errMsg = "task cancelled"
            } else {
                errMsg = error.localizedDescription
            }
        } else if expectedBytes == NSURLSessionTransferSizeUnknown && progressConfig?.shouldReport(1) == true {
            // Chunked downloads. The length is tested first because
            // shouldReport: mutates the tick and timestamp it throttles on, so
            // asking about a download we will not report advances that state
            // for nothing.
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventProgress, body: [
                "taskId": taskId ?? "", "written": receivedBytes, "total": receivedBytes, "chunk": "",
            ])
        }

        if respFile {
            if shouldTransformFile() {
                if let transformer = ReactNativeBlobUtilFileTransformer.getFileTransformer() {
                    ReactNativeBlobUtilExceptionCatch.transform((respData ?? NSMutableData()) as Data,
                                                               with: transformer, forWrite: true) { transformed, exception in
                        if let exception = exception {
                            errMsg = "Exception on File Transformer: '\(exception)' "
                            errCode = "EUNSPECIFIED"
                        } else if let transformed = transformed {
                            _ = transformed.withUnsafeBytes { raw -> Int in
                                guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                                return self.writeStream?.write(base, maxLength: transformed.count) ?? 0
                            }
                        } else {
                            errMsg = "File transformer returned no data"
                            errCode = "EUNSPECIFIED"
                        }
                    }
                } else {
                    errMsg = "Transform file specified but file transfomer not set"
                            errCode = "EUNSPECIFIED"
                }
            }
            writeStream?.close()
            rnfbRespType = ReactNativeBlobUtilConst.respTypePath
            respStr = destPath
        } else {
            // #73: try UTF-8 first so unicode survives, and fall back to base64.
            let utf8 = String(data: (respData ?? NSMutableData()) as Data, encoding: .utf8)
            switch responseFormat {
            case .base64:
                rnfbRespType = ReactNativeBlobUtilConst.respTypeBase64
                respStr = (respData ?? NSMutableData()).base64EncodedString(options: [])
            case .utf8:
                rnfbRespType = ReactNativeBlobUtilConst.respTypeUtf8
                respStr = utf8
            case .auto:
                if let utf8 = utf8 {
                    rnfbRespType = ReactNativeBlobUtilConst.respTypeUtf8
                    respStr = utf8
                } else {
                    rnfbRespType = ReactNativeBlobUtilConst.respTypeBase64
                    respStr = (respData ?? NSMutableData()).base64EncodedString(options: [])
                }
            }
        }

        finish(task: task, errMsg: errMsg, errCode: errCode,
               rnfbRespType: rnfbRespType, respStr: respStr, session: session)
    }

    private func finish(task: URLSessionTask, errMsg: String?, errCode: String?, rnfbRespType: String?,
                        respStr: String?, session: URLSession) {
        let response = task.response as? HTTPURLResponse
        // The error slot is a dictionary now, null on success, so JS reads a code
        // rather than matching on message text.
        let errorValue: Any = errMsg.map { ["code": errCode ?? "EUNSPECIFIED", "message": $0] } ?? NSNull()
        callback?([
            errorValue,
            rnfbRespType ?? "",
            respStr ?? NSNull(),
            ["status": NSNumber(value: response?.statusCode ?? 0)],
        ])

        if let taskId = taskId {
            ReactNativeBlobUtilNetwork.sharedInstance().removeRequest(forTaskId: taskId)
        }
        respData = nil
        receivedBytes = 0
        session.finishTasksAndInvalidate()
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           didSendBodyData bytesSent: Int64,
                           totalBytesSent: Int64,
                           totalBytesExpectedToSend: Int64) {
        if totalBytesExpectedToSend == 0 { return }
        let now = NSNumber(value: Float(totalBytesSent) / Float(totalBytesExpectedToSend))
        if uploadProgressConfig?.shouldReport(now) == true {
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventProgressUpload, body: [
                "taskId": taskId ?? "", "written": totalBytesSent, "total": totalBytesExpectedToSend,
            ])
        }
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask,
                           willPerformHTTPRedirection response: HTTPURLResponse,
                           newRequest request: URLRequest,
                           completionHandler: @escaping (URLRequest?) -> Void) {
        if followRedirect {
            if let url = request.url?.absoluteString {
                redirects.append(url)
            }
            completionHandler(request)
        } else {
            completionHandler(nil)
        }
    }

    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                           didFinishDownloadingTo location: URL) {
        let fm = FileManager.default
        if respFile && !shouldTransformFile() {
            if writeStream != nil {
                writeStream?.close()
                writeStream = nil
            }

            let folder = (destPath as NSString).deletingLastPathComponent
            if !fm.fileExists(atPath: folder) {
                try? fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
            }

            let overwrite = options?["overwrite"] == nil
                ? true
                : ((options?["overwrite"] as? NSNumber)?.boolValue ?? false)
            let appendToExistingFile = destPath.contains("?append=true") || !overwrite
            destPath = destPath.replacingOccurrences(of: "?append=true", with: "")

            if !appendToExistingFile && fm.fileExists(atPath: destPath) {
                try? fm.removeItem(atPath: destPath)
            }

            if !appendToExistingFile {
                if (try? fm.moveItem(at: location, to: URL(fileURLWithPath: destPath))) != nil {
                    return
                }
            }

            if copyDownloadedFile(location, toPath: destPath, append: appendToExistingFile) {
                return
            }
        }

        let data = fm.contents(atPath: location.path) ?? Data()
        configureWriteStream()
        processData(data)
    }

    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                           didWriteData bytesWritten: Int64,
                           totalBytesWritten: Int64,
                           totalBytesExpectedToWrite: Int64) {
        if totalBytesExpectedToWrite == 0 { return }
        let now = NSNumber(value: Float(totalBytesWritten) / Float(totalBytesExpectedToWrite))
        if progressConfig?.shouldReport(now) == true {
            baseModule?.emitEventDict(ReactNativeBlobUtilConst.eventProgress, body: [
                "taskId": taskId ?? "", "written": totalBytesWritten, "total": totalBytesExpectedToWrite,
            ])
        }
    }

    public func urlSession(_ session: URLSession, didBecomeInvalidWithError error: Error?) {
        // The original compared the parameter with itself and assigned to it,
        // which did nothing. Left as a no-op rather than inventing behaviour.
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        NSLog("sess done in background")
    }

    // MARK: - the trust decision
    //
    // Translated statement by statement. Four of the six tls scenario cases
    // assert a refusal, so a fall back to default handling anywhere in here
    // silently disables the pinning the caller asked for while still looking
    // correct. Do not reorder or simplify.

    /// Objective-C read these with `-boolValue`, which NSString implements too:
    /// "true" and "YES" are true there. A strict `as? NSNumber` silently turns
    /// such a value into false, which for `trusty` and `trustSystemCerts` changes
    /// the trust decision rather than just the type.
    private func optionBool(_ key: String) -> Bool {
        switch options?[key] {
        case let number as NSNumber: return number.boolValue
        case let string as NSString: return string.boolValue
        default: return false
        }
    }

    public func urlSession(_ session: URLSession,
                           didReceive challenge: URLAuthenticationChallenge,
                           completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if optionBool(ReactNativeBlobUtilConst.configTrusty) {
            // Only a server-trust challenge is trusty's business; basic auth and
            // client certificates get the default handling.
            guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
                  let serverTrust = challenge.protectionSpace.serverTrust else {
                completionHandler(.performDefaultHandling, nil)
                return
            }
            if ReactNativeBlobUtilRequest.evaluateTrusty(serverTrust, host: challenge.protectionSpace.host) {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
            } else {
                completionHandler(.cancelAuthenticationChallenge, nil)
            }
            return
        }

        // [Any], not [String]. The Objective-C checked only isKindOfClass:
        // NSArray and count, so one non-string element still entered this block;
        // a strict [String] cast fails outright and falls through to the system
        // trust store, which fails *open* for a caller who asked for pinning.
        let customCACerts = options?[ReactNativeBlobUtilConst.configCustomCaCerts] as? [Any]
        if let customCACerts = customCACerts, !customCACerts.isEmpty,
           challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust {

            // Same reasoning: a mixed pinnedHosts array read as [String] would be
            // treated as unset, and the pinning would silently apply to every host.
            if let pinnedHosts = options?[ReactNativeBlobUtilConst.configPinnedHosts] as? [Any], !pinnedHosts.isEmpty {
                let host = challenge.protectionSpace.host
                // Case-insensitive: a host name is, and a pinned entry written with
                // capitals never matched, which quietly meant system trust.
                if !pinnedHosts.contains(where: { ($0 as? String)?.caseInsensitiveCompare(host) == .orderedSame }) {
                    completionHandler(.performDefaultHandling, nil)
                    return
                }
            }

            guard let serverTrust = challenge.protectionSpace.serverTrust else {
                completionHandler(.performDefaultHandling, nil)
                return
            }

            var anchorCerts: [SecCertificate] = []
            for entry in customCACerts {
                // Skip anything that is not a name; if that leaves nothing, the
                // refusal below is what the caller gets.
                guard let certName = entry as? String else { continue }
                if let cert = loadCertificateFromBundle(certName) {
                    anchorCerts.append(cert)
                }
            }

            if anchorCerts.isEmpty {
                // Fail closed. Falling back to default handling here would
                // quietly evaluate against the system trust store, so a
                // misspelled certificate name would silently disable the pinning
                // the caller asked for.
                NSLog("[ReactNativeBlobUtil] customCACerts: none of %@ could be loaded from the app bundle", customCACerts)
                completionHandler(.cancelAuthenticationChallenge, nil)
                return
            }

            SecTrustSetAnchorCertificates(serverTrust, anchorCerts as CFArray)

            let trustSystemCerts = optionBool(ReactNativeBlobUtilConst.configTrustSystemCerts)
            SecTrustSetAnchorCertificatesOnly(serverTrust, !trustSystemCerts)

            var trustError: CFError?
            let trusted = SecTrustEvaluateWithError(serverTrust, &trustError)

            if trusted {
                completionHandler(.useCredential, URLCredential(trust: serverTrust))
            } else {
                if let trustError = trustError {
                    NSLog("[ReactNativeBlobUtil] Custom CA trust evaluation failed: %@", trustError as Error as NSError)
                }
                completionHandler(.cancelAuthenticationChallenge, nil)
            }
        } else {
            completionHandler(.performDefaultHandling,
                              challenge.protectionSpace.serverTrust.map { URLCredential(trust: $0) })
        }
    }

    /// trusty: the certificate is accepted whatever issued it - the chain is not
    /// validated - but only for the host it names and only while it is valid.
    /// It used to be accepted without evaluating anything, for any host. Android
    /// keeps hostname verification under trusty and Windows only forgives an
    /// untrusted root, so all three now mean the same. The leaf is made the only
    /// anchor, and the SSL policy for the host checks the name and the dates.
    public static func evaluateTrusty(_ trust: SecTrust, host: String) -> Bool {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first else { return false }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString))
        SecTrustSetAnchorCertificates(trust, [leaf] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        return SecTrustEvaluateWithError(trust, nil)
    }

    /// DER first, then PEM, which is converted before it is handed to Security.
    private func loadCertificateFromBundle(_ certName: String) -> SecCertificate? {
        for ext in ["cer", "der", "pem"] {
            guard let path = Bundle.main.path(forResource: certName, ofType: ext),
                  var data = FileManager.default.contents(atPath: path) else { continue }

            if ext == "pem" {
                guard let der = derDataFromPEM(data) else { continue }
                data = der
            }

            if let cert = SecCertificateCreateWithData(nil, data as CFData) {
                return cert
            }
        }
        NSLog("[ReactNativeBlobUtil] Could not load certificate '%@' from bundle", certName)
        return nil
    }

    private func derDataFromPEM(_ pemData: Data) -> Data? {
        guard var pem = String(data: pemData, encoding: .utf8) else { return nil }
        pem = pem.replacingOccurrences(of: "-----BEGIN CERTIFICATE-----", with: "")
        pem = pem.replacingOccurrences(of: "-----END CERTIFICATE-----", with: "")
        pem = pem.replacingOccurrences(of: "\n", with: "")
        pem = pem.replacingOccurrences(of: "\r", with: "")
        pem = pem.trimmingCharacters(in: .whitespacesAndNewlines)
        return Data(base64Encoded: pem, options: .ignoreUnknownCharacters)
    }
}
