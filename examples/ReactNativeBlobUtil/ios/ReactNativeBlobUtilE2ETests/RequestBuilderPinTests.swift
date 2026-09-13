//
//  Pins ReactNativeBlobUtilReqBuilder and the bookkeeping half of
//  ReactNativeBlobUtilNetwork before they are ported to Swift, the same way
//  54b449c pinned the file system layer.
//
//  Only what runs without a live session is covered here. Everything in
//  ReactNativeBlobUtilRequest needs a real NSURLSession and is covered by the
//  network, tls and parity e2e scenarios instead.
//
//  These assert what the Objective-C does today, including the parts that are
//  odd. Where a value is odd rather than wrong, the assertion says so.
//

import XCTest
@testable import react_native_blob_util

final class RequestBuilderPinTests: XCTestCase {

    private var dir = ""

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory().appending("rnbu-req-pin-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    /// Both builders finish on a background queue, so every case waits.
    private func buildOctet(method: String,
                            url: String = "http://127.0.0.1:19076/echo",
                            headers: [String: Any] = [:],
                            body: String?,
                            options: [String: Any] = [:]) throws -> (URLRequest?, Int) {
        let done = expectation(description: "octet")
        var out: (URLRequest?, Int)?
        var fired = false
        ReactNativeBlobUtilReqBuilder.buildOctetRequest(options, taskId: "t", method: method,
                                                        url: url, headers: headers, body: body) { req, length in
            if !fired { fired = true; out = (req as URLRequest?, length); done.fulfill() }
        }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(out)
    }

    private func buildMultipart(form: [[String: Any]],
                                headers: [String: Any] = [:]) throws -> (URLRequest?, Int) {
        let done = expectation(description: "multipart")
        var out: (URLRequest?, Int)?
        var fired = false
        ReactNativeBlobUtilReqBuilder.buildMultipartRequest([:], taskId: "t", method: "POST",
                                                            url: "http://127.0.0.1:19076/echo",
                                                            headers: headers, form: form) { req, length in
            if !fired { fired = true; out = (req as URLRequest?, length); done.fulfill() }
        }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(out)
    }

    // MARK: - header helpers

    func testNormalizeHeadersLowercasesEveryKey() throws {
        let normalized = try XCTUnwrap(
            ReactNativeBlobUtilNetwork.normalizeHeaders(["Content-Type": "text/plain", "X-Mixed-Case": "1"])
        )
        XCTAssertEqual(normalized["content-type"] as? String, "text/plain")
        XCTAssertEqual(normalized["x-mixed-case"] as? String, "1")
        XCTAssertNil(normalized["Content-Type"], "the original casing is not kept")
    }

    func testGetHeaderIgnoreCasesPrefersTheExactKey() {
        let headers = ["Content-Type": "exact", "content-type": "lowered"]
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.getHeaderIgnoreCases("Content-Type", fromHeaders: headers), "exact")
    }

    func testGetHeaderIgnoreCasesFallsBackToLowercase() {
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.getHeaderIgnoreCases("Content-Type",
                                                                          fromHeaders: ["content-type": "lowered"]),
                       "lowered")
    }

    func testGetHeaderIgnoreCasesReturnsNilWhenAbsent() {
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.getHeaderIgnoreCases("X-Nope", fromHeaders: [:]))
    }

    // MARK: - octet requests

    func testGetRequestCarriesNoBodyAndReportsMinusOne() throws {
        let (request, length) = try buildOctet(method: "GET", body: "ignored")
        let req = try XCTUnwrap(request)
        XCTAssertEqual(req.httpMethod, "GET")
        XCTAssertNil(req.httpBody, "only POST, PUT and PATCH build a body")
        XCTAssertEqual(length, -1, "the untouched size is -1, not 0")
    }

    func testPostWithoutAContentTypeDefaultsToOctetStream() throws {
        let (request, _) = try buildOctet(method: "POST", body: "YWJj")
        let req = try XCTUnwrap(request)
        XCTAssertEqual(req.value(forHTTPHeaderField: "Content-Type"), "application/octet-stream")
    }

    /// An octet content type means the body is base64.
    func testPostWithOctetContentTypeDecodesBase64() throws {
        let (request, length) = try buildOctet(method: "POST",
                                               headers: ["content-type": "application/octet-stream"],
                                               body: "YWJj")
        let req = try XCTUnwrap(request)
        XCTAssertEqual(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8), "abc")
        XCTAssertEqual(length, 3)
    }

    /// Column-wrapped base64 still decodes: options are
    /// NSDataBase64DecodingIgnoreUnknownCharacters, so the newlines are skipped.
    func testPostDecodesBase64ThatIsWrappedAcrossLines() throws {
        let wrapped = "YWJj\nZGVm\n"
        let (request, _) = try buildOctet(method: "POST",
                                          headers: ["content-type": "application/octet-stream"],
                                          body: wrapped)
        let req = try XCTUnwrap(request)
        XCTAssertEqual(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8), "abcdef")
    }

    /// A ";base64" suffix marks the body as base64 and is stripped from the
    /// header that goes out.
    func testPostStripsTheBase64SuffixFromTheContentType() throws {
        let (request, _) = try buildOctet(method: "POST",
                                          headers: ["content-type": "text/plain;base64"],
                                          body: "YWJj")
        let req = try XCTUnwrap(request)
        XCTAssertEqual(req.value(forHTTPHeaderField: "content-type"), "text/plain")
        XCTAssertEqual(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8), "abc")
    }

    /// Any other content type sends the body as-is.
    func testPostWithATextContentTypeSendsTheBodyVerbatim() throws {
        let (request, length) = try buildOctet(method: "POST",
                                               headers: ["content-type": "text/plain"],
                                               body: "hello")
        let req = try XCTUnwrap(request)
        XCTAssertEqual(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8), "hello")
        XCTAssertEqual(length, 5, "the length is the string's length, not its byte count")
    }

    func testPutAndPatchBuildABodyToo() throws {
        for method in ["PUT", "PATCH"] {
            let (request, _) = try buildOctet(method: method,
                                              headers: ["content-type": "text/plain"],
                                              body: "x")
            XCTAssertNotNil(try XCTUnwrap(request).httpBody, "\(method) builds a body")
        }
    }

    func testPostReadsABodyGivenAsAFilePath() throws {
        let path = "\(dir)/payload.txt"
        try "from disk".write(toFile: path, atomically: true, encoding: .utf8)
        let (request, length) = try buildOctet(method: "POST",
                                               headers: ["content-type": "text/plain"],
                                               body: FILE_PREFIX + path)
        let req = try XCTUnwrap(request)
        XCTAssertEqual(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8), "from disk")
        XCTAssertEqual(length, 9, "the length comes from the file's size")
    }

    /// transfer-encoding: chunked streams the file rather than loading it.
    func testChunkedTransferEncodingUsesABodyStream() throws {
        let path = "\(dir)/streamed.txt"
        try "streamed".write(toFile: path, atomically: true, encoding: .utf8)
        let (request, _) = try buildOctet(method: "POST",
                                          headers: ["content-type": "text/plain",
                                                    "transfer-encoding": "chunked"],
                                          body: FILE_PREFIX + path)
        let req = try XCTUnwrap(request)
        XCTAssertNotNil(req.httpBodyStream, "a chunked body is streamed")
        XCTAssertNil(req.httpBody, "and not loaded into memory")
    }

    // MARK: - multipart requests

    func testMultipartSetsTheBoundaryContentLengthAndExpectHeaders() throws {
        let (request, _) = try buildMultipart(form: [["name": "field", "data": "value"]])
        let req = try XCTUnwrap(request)
        let contentType = try XCTUnwrap(req.value(forHTTPHeaderField: "content-type"))
        XCTAssertTrue(contentType.hasPrefix("multipart/form-data; boundary=ReactNativeBlobUtil"), contentType)
        XCTAssertEqual(req.value(forHTTPHeaderField: "Expect"), "100-continue")
        XCTAssertNotNil(req.value(forHTTPHeaderField: "Content-Length"))
        XCTAssertEqual(req.httpMethod, "POST")
    }

    func testMultipartWritesATextFieldWithItsDefaultContentType() throws {
        let (request, _) = try buildMultipart(form: [["name": "field", "data": "value"]])
        let body = try XCTUnwrap(String(data: try XCTUnwrap(try XCTUnwrap(request).httpBody), encoding: .utf8))
        XCTAssertTrue(body.contains("Content-Disposition: form-data; name=\"field\""), body)
        XCTAssertTrue(body.contains("Content-Type: text/plain"), "a text field defaults to text/plain")
        XCTAssertTrue(body.contains("\r\nvalue\r\n"), body)
    }

    /// A field with a filename is a file part, and its data is base64.
    func testMultipartDecodesABase64FilePart() throws {
        let (request, _) = try buildMultipart(form: [
            ["name": "upload", "filename": "bytes.bin", "data": "YWJj"],
        ])
        let body = try XCTUnwrap(String(data: try XCTUnwrap(try XCTUnwrap(request).httpBody), encoding: .utf8))
        XCTAssertTrue(body.contains("filename=\"bytes.bin\""), body)
        XCTAssertTrue(body.contains("Content-Type: application/octet-stream"), "a file part defaults to octet-stream")
        XCTAssertTrue(body.contains("abc"), "the base64 is decoded into the part")
    }

    /// Undecodable base64 leaves the part empty rather than dropping it, and
    /// warns. ceb4247 fixed the Android side of the same case.
    func testMultipartKeepsAPartWhoseBase64IsInvalid() throws {
        let (request, _) = try buildMultipart(form: [
            ["name": "bad", "filename": "bad.bin", "data": "@@@@"],
            ["name": "good", "data": "kept"],
        ])
        let body = try XCTUnwrap(String(data: try XCTUnwrap(try XCTUnwrap(request).httpBody), encoding: .utf8))
        XCTAssertTrue(body.contains("name=\"bad\""), "the part still goes out, with an empty body")
        XCTAssertTrue(body.contains("name=\"good\""), "and the fields after it survive")
    }

    func testMultipartReadsAFilePartFromDisk() throws {
        let path = "\(dir)/part.txt"
        try "on disk".write(toFile: path, atomically: true, encoding: .utf8)
        let (request, _) = try buildMultipart(form: [
            ["name": "upload", "filename": "part.txt", "data": FILE_PREFIX + path],
        ])
        let body = try XCTUnwrap(String(data: try XCTUnwrap(try XCTUnwrap(request).httpBody), encoding: .utf8))
        XCTAssertTrue(body.contains("on disk"), body)
    }

    func testMultipartHonoursAnExplicitPartContentType() throws {
        let (request, _) = try buildMultipart(form: [
            ["name": "json", "data": "{}", "type": "application/json"],
        ])
        let body = try XCTUnwrap(String(data: try XCTUnwrap(try XCTUnwrap(request).httpBody), encoding: .utf8))
        XCTAssertTrue(body.contains("Content-Type: application/json"), body)
    }

    // MARK: - network bookkeeping

    func testSharedInstanceIsASingleton() {
        XCTAssertTrue(ReactNativeBlobUtilNetwork.sharedInstance() === ReactNativeBlobUtilNetwork.sharedInstance())
    }

    func testTaskQueueKeepsItsConfiguredLimits() throws {
        let queue = try XCTUnwrap(ReactNativeBlobUtilNetwork.sharedInstance()).taskQueue
        // This queue is the NSURLSession delegate queue, so these values decide
        // how delegate callbacks interleave. Changing them changes observable
        // ordering.
        XCTAssertEqual(queue.maxConcurrentOperationCount, 10)
        XCTAssertEqual(queue.qualityOfService, .utility)
    }

    /// Progress config that arrives before the task exists is parked and applied
    /// when the task registers, so JS can call enableProgressReport first.
    func testProgressConfigForAnUnknownTaskIsParkedForLater() throws {
        let network = try XCTUnwrap(ReactNativeBlobUtilNetwork.sharedInstance())
        let taskId = "pin-\(UUID().uuidString)"
        let config = ReactNativeBlobUtilProgress(type: .download, interval: 100, count: 0)

        network.enableProgressReport(taskId, config: config)
        XCTAssertNotNil(network.rebindProgressDict[taskId], "parked until the task appears")

        network.removeRequest(forTaskId: taskId)
        XCTAssertNil(network.rebindProgressDict[taskId], "and cleared when the task is removed")
    }

    func testUploadProgressConfigIsParkedSeparately() throws {
        let network = try XCTUnwrap(ReactNativeBlobUtilNetwork.sharedInstance())
        let taskId = "pin-upload-\(UUID().uuidString)"
        let config = ReactNativeBlobUtilProgress(type: .upload, interval: 100, count: 0)

        network.enableUploadProgress(taskId, config: config)
        XCTAssertNotNil(network.rebindUploadProgressDict[taskId])
        XCTAssertNil(network.rebindProgressDict[taskId], "the two tables are independent")

        network.removeRequest(forTaskId: taskId)
        XCTAssertNil(network.rebindUploadProgressDict[taskId])
    }

    func testCancellingAnUnknownTaskIsHarmless() throws {
        let network = try XCTUnwrap(ReactNativeBlobUtilNetwork.sharedInstance())
        network.cancelRequest("no-such-task-\(UUID().uuidString)")
    }

    // MARK: - the exact multipart body

    /// The whole body for a one-field form, byte for byte. Everything except the
    /// boundary is fixed, and the boundary is masked in the parity signatures
    /// because it is derived from a timestamp.
    func testMultipartBodyForASingleTextFieldIsExact() throws {
        let (request, _) = try buildMultipart(form: [["name": "field", "data": "value"]])
        let req = try XCTUnwrap(request)
        let body = try XCTUnwrap(String(data: try XCTUnwrap(req.httpBody), encoding: .utf8))
        let contentType = try XCTUnwrap(req.value(forHTTPHeaderField: "content-type"))
        let boundary = String(contentType.dropFirst("multipart/form-data; boundary=".count))

        XCTAssertEqual(body, [
            "--\(boundary)\r\n",
            "Content-Disposition: form-data; name=\"field\"\r\n",
            "Content-Type: text/plain\r\n\r\n",
            "value\r\n",
            "--\(boundary)--\r\n",
        ].joined())

        // Content-Length is set after the closing delimiter is appended, so it
        // covers the whole body.
        let declared = Int(try XCTUnwrap(req.value(forHTTPHeaderField: "Content-Length")))
        XCTAssertEqual(declared, body.utf8.count)

        // The bodyLength reported to the caller is not the same number: it is
        // the length of the form data *before* the closing delimiter, which is
        // what the progress total ends up being.
        XCTAssertEqual(declared, 147)
    }

    // MARK: - the TLS trust decision

    /// The trust decision is an instance method on the request, driven by its
    /// `options`. A synthesized challenge reaches every branch that does not
    /// need a real SecTrust.
    private func challenge(host: String,
                           method: String = NSURLAuthenticationMethodServerTrust) -> URLAuthenticationChallenge {
        let space = URLProtectionSpace(host: host, port: 443, protocol: "https",
                                       realm: nil, authenticationMethod: method)
        return URLAuthenticationChallenge(protectionSpace: space, proposedCredential: nil,
                                          previousFailureCount: 0, failureResponse: nil,
                                          error: nil, sender: RecordingChallengeSender())
    }

    private func decide(options: [String: Any],
                        host: String = "localhost",
                        method: String = NSURLAuthenticationMethodServerTrust)
        throws -> URLSession.AuthChallengeDisposition {
        let request = ReactNativeBlobUtilRequest()
        request.options = options
        let done = expectation(description: "challenge")
        var disposition: URLSession.AuthChallengeDisposition?
        var fired = false
        request.urlSession(URLSession.shared,
                           didReceive: challenge(host: host, method: method)) { result, _ in
            if !fired { fired = true; disposition = result; done.fulfill() }
        }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(disposition)
    }

    func testTrustyAcceptsWithoutEvaluating() throws {
        XCTAssertEqual(try decide(options: ["trusty": true]), .useCredential)
    }

    /// pinnedHosts scopes customCACerts to the hosts it names.
    ///
    /// This asserts the disposition, but it cannot tell the two routes to it
    /// apart: without a real handshake there is no SecTrust, and the guard for
    /// that returns performDefaultHandling too. Measured - making the scoping
    /// ignore the host entirely still passes this test. **tls-wrong-pin in the
    /// e2e suite is what actually pins the scoping rule**; this only catches a
    /// change that reaches a different disposition.
    func testCustomCertsAreIgnoredForAHostThatIsNotPinned() throws {
        let disposition = try decide(options: [
            "customCACerts": ["test_ca"],
            "pinnedHosts": ["example.com"],
        ], host: "localhost")
        XCTAssertEqual(disposition, .performDefaultHandling)
    }

    func testCustomCertsApplyToAPinnedHost() throws {
        // The host matches, so the pinned-host gate opens and evaluation is
        // attempted. Without a real handshake there is no SecTrust, and the
        // guard for that returns default handling - which is as far as a unit
        // test reaches. The refusal path itself is covered by the tls scenario.
        let disposition = try decide(options: [
            "customCACerts": ["test_ca"],
            "pinnedHosts": ["localhost"],
        ], host: "localhost")
        XCTAssertEqual(disposition, .performDefaultHandling)
    }

    /// customCACerts only applies to a server-trust challenge. Anything else -
    /// basic auth, a client certificate request - is left alone.
    func testCustomCertsAreIgnoredForANonServerTrustChallenge() throws {
        let disposition = try decide(options: ["customCACerts": ["test_ca"]],
                                     method: NSURLAuthenticationMethodHTTPBasic)
        XCTAssertEqual(disposition, .performDefaultHandling)
    }

    func testNoTlsOptionsFallsThroughToDefaultHandling() throws {
        XCTAssertEqual(try decide(options: [:]), .performDefaultHandling)
    }

    func testAnEmptyCustomCertsArrayIsTreatedAsUnset() throws {
        XCTAssertEqual(try decide(options: ["customCACerts": []]), .performDefaultHandling)
    }
}

/// URLAuthenticationChallenge needs a sender; nothing here calls back into it.
private final class RecordingChallengeSender: NSObject, URLAuthenticationChallengeSender {
    func use(_ credential: URLCredential, for challenge: URLAuthenticationChallenge) {}
    func continueWithoutCredential(for challenge: URLAuthenticationChallenge) {}
    func cancel(_ challenge: URLAuthenticationChallenge) {}
}
