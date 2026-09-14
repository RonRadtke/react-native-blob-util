//
//  ReactNativeBlobUtilReqBuilder.swift
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/7/9.
//  Copyright © 2016 wkh237. All rights reserved.
//
//  Ported from ReactNativeBlobUtilReqBuilder.mm. Body construction stays on a
//  background queue and the completion still fires there, because callers rely
//  on not blocking the module's serial queue while a large file is read.
//

import Foundation

@objc(ReactNativeBlobUtilReqBuilder)
public class ReactNativeBlobUtilReqBuilder: NSObject {

    /// Reads a header without caring how the caller capitalised it: the exact
    /// key first, then the lowercased one.
    @objc(getHeaderIgnoreCases:fromHeaders:)
    public static func getHeaderIgnoreCases(_ field: String, fromHeaders headers: [String: Any]?) -> String? {
        if let exact = headers?[field] as? String { return exact }
        return headers?[field.lowercased()] as? String
    }

    // MARK: - multipart

    @objc(buildMultipartRequest:taskId:method:url:headers:form:onComplete:)
    public static func buildMultipartRequest(_ options: [String: Any]?,
                                             taskId: String?,
                                             method: String,
                                             url: String,
                                             headers: [String: Any]?,
                                             form: [[String: Any]]?,
                                             onComplete: @escaping (URLRequest?, Int) -> Void) {
        guard let requestURL = URL(string: url) else { return onComplete(nil, 0) }
        var request = URLRequest(url: requestURL)
        var mheaders = ReactNativeBlobUtilNetwork.normalizeHeaders(headers)

        // The original formatted an NSNumber with %d, which prints the pointer
        // rather than the value. The boundary only has to be unique, and the
        // parity signatures mask it, so this uses the timestamp itself.
        let boundary = "ReactNativeBlobUtil\(Int(Date().timeIntervalSince1970 * 1000))"

        DispatchQueue.global(qos: .default).async {
            buildFormBody(form, boundary: boundary) { formData, hasError in
                if hasError {
                    return onComplete(nil, 0)
                }
                var postData = Data()
                if let formData = formData {
                    postData.append(formData)
                    postData.append("--\(boundary)--\r\n".data(using: .utf8)!)
                    request.httpBody = postData
                }
                // Set after the closing delimiter is appended, so it covers the
                // whole body.
                mheaders["Content-Length"] = "\(postData.count)"
                mheaders["Expect"] = "100-continue"
                mheaders["content-type"] = "multipart/form-data; boundary=\(boundary)"
                request.httpMethod = method
                request.allHTTPHeaderFields = mheaders.compactMapValues { $0 as? String }
                onComplete(request, formData?.count ?? 0)
            }
        }
    }

    /// Walks the form one field at a time. A file field is read asynchronously,
    /// so the walk continues from inside that completion rather than in a loop.
    @objc(buildFormBody:boundary:onComplete:)
    public static func buildFormBody(_ form: [[String: Any]]?,
                                     boundary: String,
                                     onComplete: @escaping (Data?, Bool) -> Void) {
        guard let form = form else { return onComplete(nil, false) }

        var formData = Data()
        var index = 0
        let count = form.count

        func append(_ string: String) {
            formData.append(string.data(using: .utf8)!)
        }

        func advance() {
            index += 1
            if index < count {
                // Recurses rather than loops, as the original did.
                handle(form[index])
            } else {
                onComplete(formData, false)
            }
        }

        func handle(_ field: [String: Any]) {
            let name = field["name"] as? String
            let content = field["data"] as? String
            var contentType = field["type"] as? String

            // A field missing `name` or `data` is skipped - and the original
            // stepped to the next index without checking the bound first, so a
            // form whose last field is like this raises NSRangeException. Kept:
            // the crash is the behaviour, and it is on the P5 list.
            if content == nil || name == nil {
                index += 1
                ReactNativeBlobUtilLog.warn("ReactNativeBlobUtil multipart request builder has found a field without `data` or `name` property, the field will be removed implicitly.")
                handle(form[index])
                return
            }

            let filename = field["filename"] as? String

            if filename == nil {
                contentType = contentType ?? "text/plain"
                append("--\(boundary)\r\n")
                append("Content-Disposition: form-data; name=\"\(name!)\"\r\n")
                append("Content-Type: \(contentType!)\r\n\r\n")
                append("\(content!)\r\n")
                advance()
                return
            }

            contentType = contentType ?? "application/octet-stream"

            if content!.hasPrefix(ReactNativeBlobUtilConst.filePrefix) {
                let orgPath = ReactNativeBlobUtilFS.getPathOfAsset(
                    String(content!.dropFirst(ReactNativeBlobUtilConst.filePrefix.count)))
                ReactNativeBlobUtilFS.readFile(orgPath, encoding: nil, transformFile: false) { fileContent, _, err in
                    if err != nil {
                        return onComplete(formData, true)
                    }
                    append("--\(boundary)\r\n")
                    append("Content-Disposition: form-data; name=\"\(name!)\"; filename=\"\(filename!)\"\r\n")
                    append("Content-Type: \(contentType!)\r\n\r\n")
                    if let data = fileContent as? Data { formData.append(data) }
                    append("\r\n")
                    advance()
                }
                return
            }

            // Whitespace-tolerant, so base64 wrapped at 64 or 76 columns still
            // decodes. Android's decoder strips whitespace; this is what makes
            // the two agree.
            let blobData = Data(base64Encoded: content!, options: .ignoreUnknownCharacters)
            if blobData == nil {
                // What still fails is genuinely malformed. The part goes out with
                // its headers and an empty body: survivable, but said out loud.
                // The %@ substitution the Objective-C did, done here so the text
                // that reaches the console is byte-identical.
                ReactNativeBlobUtilLog.warn("ReactNativeBlobUtil multipart request builder could not decode the `data` of field `\(name!)` as base64, the field will be sent with an empty body.")
            }
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(name!)\"; filename=\"\(filename!)\"\r\n")
            append("Content-Type: \(contentType!)\r\n\r\n")
            if let blobData = blobData { formData.append(blobData) }
            append("\r\n")
            advance()
        }

        handle(form[index])
    }

    // MARK: - octet

    @objc(buildOctetRequest:taskId:method:url:headers:body:onComplete:)
    public static func buildOctetRequest(_ options: [String: Any]?,
                                         taskId: String?,
                                         method: String,
                                         url: String,
                                         headers: [String: Any]?,
                                         body: String?,
                                         onComplete: @escaping (URLRequest?, Int) -> Void) {
        guard let requestURL = URL(string: url) else { return onComplete(nil, 0) }
        var request = URLRequest(url: requestURL)
        var mheaders = ReactNativeBlobUtilNetwork.normalizeHeaders(headers)

        DispatchQueue.global(qos: .default).async {
            // -1, not 0, when nothing is sent.
            var size = -1

            let lowered = method.lowercased()
            if lowered == "post" || lowered == "put" || lowered == "patch", let body = body {
                let cType = getHeaderIgnoreCases("content-type", fromHeaders: mheaders)
                let transferEncoding = getHeaderIgnoreCases("transfer-encoding", fromHeaders: mheaders)

                if cType == nil {
                    mheaders["Content-Type"] = "application/octet-stream"
                }

                if body.hasPrefix(ReactNativeBlobUtilConst.filePrefix) {
                    var orgPath = ReactNativeBlobUtilFS.getPathOfAsset(String(body.dropFirst(ReactNativeBlobUtilConst.filePrefix.count)))
                    orgPath = URL(string: orgPath)?.path ?? orgPath

                    if orgPath.hasPrefix(ReactNativeBlobUtilConst.alPrefix) {
                        ReactNativeBlobUtilFS.readFile(orgPath, encoding: nil, transformFile: false) { content, _, err in
                            if err != nil { return onComplete(nil, 0) }
                            let data = content as? Data
                            request.httpBody = data
                            request.httpMethod = method
                            request.allHTTPHeaderFields = mheaders.compactMapValues { $0 as? String }
                            onComplete(request, data?.count ?? 0)
                        }
                        return
                    }

                    size = ((try? FileManager.default.attributesOfItem(atPath: orgPath))?[.size] as? NSNumber)?.intValue ?? 0
                    if transferEncoding?.lowercased() == "chunked" {
                        request.httpBodyStream = InputStream(fileAtPath: orgPath)
                    } else {
                        request.httpBody = FileManager.default.contents(atPath: orgPath)
                    }
                } else {
                    let cType = getHeaderIgnoreCases("content-type", fromHeaders: mheaders)
                    let loweredCType = cType?.lowercased() ?? ""
                    if loweredCType.hasPrefix("application/octet") || loweredCType.contains(";base64") {
                        let ncType = (cType ?? "")
                            .replacingOccurrences(of: ";base64", with: "")
                            .replacingOccurrences(of: ";BASE64", with: "")
                        if mheaders["content-type"] != nil { mheaders["content-type"] = ncType }
                        if mheaders["Content-Type"] != nil { mheaders["Content-Type"] = ncType }
                        // Same leniency as the multipart path: options:0 rejects
                        // the newlines in column-wrapped base64, which left the
                        // request with a nil body and nothing said about why.
                        let blobData = Data(base64Encoded: body, options: .ignoreUnknownCharacters)
                        request.httpBody = blobData
                        size = blobData?.count ?? 0
                    } else {
                        // The string's length, not its byte count.
                        size = body.count
                        request.httpBody = body.data(using: .utf8)
                    }
                }
            }

            request.httpMethod = method
            request.allHTTPHeaderFields = mheaders.compactMapValues { $0 as? String }
            onComplete(request, size)
        }
    }
}
