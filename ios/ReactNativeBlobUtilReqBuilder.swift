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

        // Random, not the time of day: whoever wrote a file or a text this app
        // uploads can guess the millisecond it is sent in, put that boundary in
        // the content, and so end the part early and add form fields of their
        // own. The parity signatures mask the boundary.
        let boundary = "ReactNativeBlobUtil-\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"

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
        // Before the first field: the walk starts with advance(), which checks
        // the bound. Starting at form[0] trapped on an empty form (#197).
        var index = -1
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

            // A field missing `name` or `data` is skipped. The skip used to step
            // to the next index without checking the bound, so a form whose last
            // field was like this trapped; advance() checks it (#197).
            if content == nil || name == nil {
                ReactNativeBlobUtilLog.warn("ReactNativeBlobUtil multipart request builder has found a field without `data` or `name` property, the field will be removed implicitly.")
                advance()
                return
            }

            let filename = field["filename"] as? String
            let filePrefix = ReactNativeBlobUtilConst.filePrefix
            // The kind JS sends (since 1.0) decides the content; the filename only
            // decides the disposition. Without it, the rule from before: text
            // without a filename, a file or base64 with one.
            let kind = (field["kind"] as? String)
                ?? (filename == nil ? "text" : (content!.hasPrefix(filePrefix) ? "file" : "base64"))
            contentType = contentType ?? (filename == nil ? "text/plain" : "application/octet-stream")
            let disposition = filename == nil
                ? "Content-Disposition: form-data; name=\"\(name!)\"\r\n"
                : "Content-Disposition: form-data; name=\"\(name!)\"; filename=\"\(filename!)\"\r\n"

            if kind == "text" {
                append("--\(boundary)\r\n")
                append(disposition)
                append("Content-Type: \(contentType!)\r\n\r\n")
                append("\(content!)\r\n")
                advance()
                return
            }

            if kind == "file" && content!.hasPrefix(filePrefix) {
                let orgPath = ReactNativeBlobUtilFS.getPathOfAsset(String(content!.dropFirst(filePrefix.count)))
                ReactNativeBlobUtilFS.readFile(orgPath, encoding: nil, transformFile: false) { fileContent, _, err in
                    if err != nil {
                        return onComplete(formData, true)
                    }
                    append("--\(boundary)\r\n")
                    append(disposition)
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
            append(disposition)
            append("Content-Type: \(contentType!)\r\n\r\n")
            if let blobData = blobData { formData.append(blobData) }
            append("\r\n")
            advance()
        }

        advance()
    }

    // MARK: - upload sources

    /// Why a file cannot be uploaded, as (code, message), or nil when it can:
    /// ENOENT when it is not there, EISDIR for a directory, EACCES when the app
    /// may not read it. A readable empty file is fine - it uploads as an empty
    /// body, which is what it is.
    ///
    /// Pure, and the messages are Android's word for word
    /// (ReactNativeBlobUtilBody.fileSourceError), so the parity signatures of
    /// the two platforms compare.
    static func fileSourceError(_ path: String) -> (code: String, message: String)? {
        var isDirectory: ObjCBool = false
        let fm = FileManager.default
        if !fm.fileExists(atPath: path, isDirectory: &isDirectory) {
            return ("ENOENT", "No such file '\(path)'")
        }
        if isDirectory.boolValue {
            return ("EISDIR", "Expecting a file but '\(path)' is a directory")
        }
        // chmod 000 denies the owner too, so this is false for a file the app
        // itself wrote and then locked.
        if !fm.isReadableFile(atPath: path) {
            return ("EACCES", "Not allowed to read '\(path)'")
        }
        return nil
    }

    /// The local path an upload source names, or nil when it is not one this
    /// can check from here: a photo library URL, which Photos reads rather than
    /// the file system.
    private static func uploadPath(of value: String) -> String? {
        let prefix = ReactNativeBlobUtilConst.filePrefix
        let raw = value.hasPrefix(prefix) ? String(value.dropFirst(prefix.count)) : value
        let resolved = ReactNativeBlobUtilFS.getPathOfAsset(raw)
        if resolved.hasPrefix(ReactNativeBlobUtilConst.alPrefix) { return nil }
        // A bundle asset that is not there resolves to "", and naming "" in the
        // rejection says nothing; keep what the caller wrote.
        return pathOfFileURL(resolved.isEmpty ? raw : resolved)
    }

    /// The path a file:// URL names; any other string as it is.
    ///
    /// Every path used to go through URL(string:).path, which reads a plain
    /// path as a relative URL and decodes its percent escapes. A name such as
    /// "..%2F..%2FLibrary%2FCookies%2FCookies.binarycookies" - a legal file
    /// name, there is no slash in it - then named another file, and the upload
    /// sent that one: whoever chose the name of a file the user uploads chose
    /// which file of the app left the device. A "?" or "#" cut the name short
    /// the same way.
    ///
    /// Escapes are decoded where a URL has them, and one path component at a
    /// time (decodedByComponent), so an escape is a character of a name and
    /// never a separator or "..":
    ///  - a file:// URL, which JS turns into a path before it gets here
    ///    (utils/request.js) and an older caller may still send;
    ///  - a path cut out of a file URL by hand, `uri.replace('file://', '')`,
    ///    which keeps the URL's escapes ("My%20Scan.pdf" for "My Scan.pdf")
    ///    and worked through the old decoding. It is read that way only when
    ///    no file has the name as it is written.
    static func pathOfFileURL(_ value: String) -> String {
        if value.lowercased().hasPrefix("file://") {
            var rest = String(value.dropFirst("file://".count))
            if rest.lowercased().hasPrefix("localhost/") {
                rest = String(rest.dropFirst("localhost".count))
            }
            return decodedByComponent(rest) ?? rest
        }
        let fm = FileManager.default
        guard value.contains("%"), !fm.fileExists(atPath: value),
              let candidate = decodedByComponent(value), fm.fileExists(atPath: candidate) else {
            return value
        }
        return candidate
    }

    /// A path with the percent escapes of each component decoded, or nil when
    /// one is malformed or would change the shape of the path: an escape that
    /// decodes into a separator, into "." or "..", or into a NUL. Which file
    /// exists is not asked - "..%2Fsecret.txt" is one name, whether or not a
    /// file has it.
    static func decodedByComponent(_ path: String) -> String? {
        var parts: [String] = []
        for component in path.components(separatedBy: "/") {
            guard let part = component.removingPercentEncoding else { return nil }
            if part != component,
               part.contains("/") || part.contains("\0") || part == "." || part == ".." {
                return nil
            }
            parts.append(part)
        }
        return parts.joined(separator: "/")
    }

    /// Whether a form field is a file part, by the same rule the body builder
    /// uses: the kind JS sends since 1.0, or the filename for an older caller.
    private static func isFilePart(_ field: [String: Any], content: String) -> Bool {
        let filename = field["filename"] as? String
        let kind = (field["kind"] as? String)
            ?? (filename == nil ? "text" : (content.hasPrefix(ReactNativeBlobUtilConst.filePrefix) ? "file" : "base64"))
        return kind == "file" && content.hasPrefix(ReactNativeBlobUtilConst.filePrefix)
    }

    /// The first upload source of a request that cannot be read - the single
    /// file body, or a file part of the form - as the {code, message} pair the
    /// fetch callback carries. Nil when every source is readable.
    ///
    /// Checked before the body is built, and so before anything is sent (#502).
    /// A part whose file could not be read used to go out with its headers and
    /// an empty body, so the server stored a zero-byte file and the upload
    /// reported success; a single file body that existed but could not be read
    /// did the same.
    @objc(unreadableSource:body:form:)
    public static func unreadableSource(_ options: [String: Any]?,
                                        body: String?,
                                        form: [[String: Any]]?) -> [String: String]? {
        func pair(_ error: (code: String, message: String)) -> [String: String] {
            ["code": error.code, "message": error.message]
        }

        let bodyType = options?["bodyType"] as? String
        if let body = body, body.hasPrefix(ReactNativeBlobUtilConst.filePrefix),
           bodyType == "file" || bodyType == nil,
           let path = uploadPath(of: body), let error = fileSourceError(path) {
            return pair(error)
        }

        for field in form ?? [] {
            guard let content = field["data"] as? String, isFilePart(field, content: content) else { continue }
            if let path = uploadPath(of: content), let error = fileSourceError(path) {
                return pair(error)
            }
        }
        return nil
    }

    // MARK: - octet

    /// The third argument is a file to send from disk rather than from memory:
    /// set for a plain file body, nil for everything else. The request then has
    /// no httpBody at all and the sender turns it into an upload task.
    @objc(buildOctetRequest:taskId:method:url:headers:body:onComplete:)
    public static func buildOctetRequest(_ options: [String: Any]?,
                                         taskId: String?,
                                         method: String,
                                         url: String,
                                         headers: [String: Any]?,
                                         body: String?,
                                         onComplete: @escaping (URLRequest?, Int, URL?) -> Void) {
        guard let requestURL = URL(string: url) else { return onComplete(nil, 0, nil) }
        var request = URLRequest(url: requestURL)
        var mheaders = ReactNativeBlobUtilNetwork.normalizeHeaders(headers)

        DispatchQueue.global(qos: .default).async {
            // A download being continued asks for the rest of the file. JS works
            // out where from and what identifies the file; this only sends it.
            //
            // Accept-Encoding: identity because a range of a compressed body is
            // a range of the *compressed* bytes, which cannot be appended to the
            // decompressed bytes already on disk.
            if let range = options?["range"] as? [String: Any],
               let from = (range["from"] as? NSNumber)?.int64Value, from > 0 {
                mheaders["Range"] = "bytes=\(from)-"
                mheaders["Accept-Encoding"] = "identity"
                if let ifRange = range["ifRange"] as? String, !ifRange.isEmpty {
                    mheaders["If-Range"] = ifRange
                }
            }

            // -1, not 0, when nothing is sent.
            var size = -1
            var uploadFile: URL?

            let lowered = method.lowercased()
            // JS says what the body is (bodyType, since 1.0) and sends a Content-Type
            // with it; any method but GET and HEAD then sends its body. Without
            // bodyType, the rule from before: POST, PUT and PATCH, inferred.
            let bodyType = options?["bodyType"] as? String
            let sendsBody = bodyType != nil
                ? lowered != "get" && lowered != "head"
                : lowered == "post" || lowered == "put" || lowered == "patch"
            if sendsBody, let body = body {
                let cType = getHeaderIgnoreCases("content-type", fromHeaders: mheaders)
                let transferEncoding = getHeaderIgnoreCases("transfer-encoding", fromHeaders: mheaders)

                if cType == nil && bodyType == nil {
                    mheaders["Content-Type"] = "application/octet-stream"
                }

                let isFile = bodyType.map { $0 == "file" } ?? body.hasPrefix(ReactNativeBlobUtilConst.filePrefix)
                if isFile && body.hasPrefix(ReactNativeBlobUtilConst.filePrefix) {
                    // As it is, not decoded: see pathOfFileURL.
                    let orgPath = pathOfFileURL(
                        ReactNativeBlobUtilFS.getPathOfAsset(String(body.dropFirst(ReactNativeBlobUtilConst.filePrefix.count))))

                    if orgPath.hasPrefix(ReactNativeBlobUtilConst.alPrefix) {
                        ReactNativeBlobUtilFS.readFile(orgPath, encoding: nil, transformFile: false) { content, _, err in
                            if err != nil { return onComplete(nil, 0, nil) }
                            let data = content as? Data
                            request.httpBody = data
                            request.httpMethod = method
                            request.allHTTPHeaderFields = mheaders.compactMapValues { $0 as? String }
                            onComplete(request, data?.count ?? 0, nil)
                        }
                        return
                    }

                    size = ((try? FileManager.default.attributesOfItem(atPath: orgPath))?[.size] as? NSNumber)?.intValue ?? 0
                    if transferEncoding?.lowercased() == "chunked" {
                        request.httpBodyStream = InputStream(fileAtPath: orgPath)
                    } else {
                        // Handed on as a file rather than read into memory here.
                        uploadFile = URL(fileURLWithPath: orgPath)
                    }
                } else {
                    let cType = getHeaderIgnoreCases("content-type", fromHeaders: mheaders)
                    let loweredCType = cType?.lowercased() ?? ""
                    let isBase64 = bodyType.map { $0 == "base64" }
                        ?? (loweredCType.hasPrefix("application/octet") || loweredCType.contains(";base64"))
                    if isBase64 {
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
            onComplete(request, size, uploadFile)
        }
    }
}
