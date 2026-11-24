//
//  The 1.2.0 request fixes: an upload source that cannot be read (#502), the
//  progress counts of a download with no Content-Length (#235, #292), and the
//  cancel that used to be lost while a request was still being built (#491).
//
//  Nothing here sends a request. Each fix is a decision the request layer makes
//  before or around the network, and each one is reachable without it.
//

import XCTest
@testable import react_native_blob_util

final class RequestHardeningTests: XCTestCase {

    private var dir = ""
    private let filePrefix = ReactNativeBlobUtilConst.filePrefix

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory().appending("rnbu-hardening-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        // Put the permissions back, or the directory cannot be removed.
        for name in try FileManager.default.contentsOfDirectory(atPath: dir) {
            try? FileManager.default.setAttributes([.posixPermissions: 0o644],
                                                   ofItemAtPath: "\(dir)/\(name)")
        }
        try? FileManager.default.removeItem(atPath: dir)
    }

    @discardableResult
    private func write(_ name: String, _ contents: String = "x") throws -> String {
        let path = "\(dir)/\(name)"
        try contents.write(toFile: path, atomically: true, encoding: .utf8)
        return path
    }

    /// chmod 000 denies the owner too, so the app cannot read a file it wrote.
    private func lock(_ path: String) throws {
        try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: path)
    }

    // MARK: - #502: why a file cannot be uploaded

    func testAReadableFileIsFine() throws {
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.fileSourceError(try write("ok.txt", "hello")))
    }

    /// Empty is not unreadable: it uploads as an empty body, which is what it is.
    func testAReadableEmptyFileIsFine() throws {
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.fileSourceError(try write("empty.txt", "")))
    }

    func testAMissingFileIsENOENT() {
        let path = "\(dir)/gone.txt"
        let error = ReactNativeBlobUtilReqBuilder.fileSourceError(path)
        XCTAssertEqual(error?.code, "ENOENT")
        XCTAssertEqual(error?.message, "No such file '\(path)'")
    }

    func testADirectoryIsEISDIR() {
        let error = ReactNativeBlobUtilReqBuilder.fileSourceError(dir)
        XCTAssertEqual(error?.code, "EISDIR")
        XCTAssertEqual(error?.message, "Expecting a file but '\(dir)' is a directory")
    }

    func testAFileTheAppMayNotReadIsEACCES() throws {
        let path = try write("locked.txt", "secret")
        try lock(path)
        let error = ReactNativeBlobUtilReqBuilder.fileSourceError(path)
        XCTAssertEqual(error?.code, "EACCES")
        XCTAssertEqual(error?.message, "Not allowed to read '\(path)'")
    }

    // MARK: - #502: the request's sources

    func testASingleFileBodyIsChecked() throws {
        let missing = "\(dir)/gone.txt"
        let problem = ReactNativeBlobUtilReqBuilder.unreadableSource(
            ["bodyType": "file"], body: filePrefix + missing, form: nil)
        XCTAssertEqual(problem?["code"], "ENOENT")
    }

    func testAnUnreadableSingleFileBodyIsEACCES() throws {
        let path = try write("locked.bin", "secret")
        try lock(path)
        let problem = ReactNativeBlobUtilReqBuilder.unreadableSource(
            ["bodyType": "file"], body: filePrefix + path, form: nil)
        XCTAssertEqual(problem?["code"], "EACCES")
    }

    func testAReadableSingleFileBodyPasses() throws {
        let path = try write("ok.bin", "hello")
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.unreadableSource(
            ["bodyType": "file"], body: filePrefix + path, form: nil))
    }

    /// Only a file body is a file. A text or base64 body that happens to start
    /// with the prefix is not opened, so it is not checked either.
    func testABodyThatIsNotAFileIsNotChecked() {
        let missing = filePrefix + "\(dir)/gone.txt"
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.unreadableSource(["bodyType": "text"], body: missing, form: nil))
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.unreadableSource(["bodyType": "base64"], body: missing, form: nil))
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: "plain text", form: nil))
    }

    func testAFilePartOfAFormIsChecked() throws {
        let missing = "\(dir)/gone.txt"
        let form: [[String: Any]] = [
            ["name": "text", "data": "plain"],
            ["name": "file", "filename": "f.bin", "kind": "file", "data": filePrefix + missing],
        ]
        let problem = ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form)
        XCTAssertEqual(problem?["code"], "ENOENT")
        XCTAssertEqual(problem?["message"], "No such file '\(missing)'")
    }

    func testAnUnreadableFilePartIsEACCES() throws {
        let path = try write("part.bin", "secret")
        try lock(path)
        let form: [[String: Any]] = [["name": "file", "filename": "f.bin", "kind": "file",
                                      "data": filePrefix + path]]
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form)?["code"], "EACCES")
    }

    func testADirectoryAsAFilePartIsEISDIR() {
        let form: [[String: Any]] = [["name": "file", "filename": "f.bin", "kind": "file",
                                      "data": filePrefix + dir]]
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form)?["code"], "EISDIR")
    }

    func testAFormOfReadableSourcesPasses() throws {
        let path = try write("good.bin", "data")
        let empty = try write("empty.bin", "")
        let form: [[String: Any]] = [
            ["name": "text", "data": "plain"],
            ["name": "b64", "filename": "b.bin", "kind": "base64", "data": "YWJj"],
            ["name": "file", "filename": "f.bin", "kind": "file", "data": filePrefix + path],
            ["name": "empty", "filename": "e.bin", "kind": "file", "data": filePrefix + empty],
        ]
        XCTAssertNil(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form))
    }

    /// Without `kind` the filename decides, as it did before 1.0.
    func testAnOlderCallerWithoutAKindIsStillChecked() {
        let missing = "\(dir)/gone.txt"
        let form: [[String: Any]] = [["name": "file", "filename": "f.bin", "data": filePrefix + missing]]
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form)?["code"], "ENOENT")
    }

    func testTheFirstUnreadableSourceIsTheOneReported() throws {
        let missing = "\(dir)/gone.txt"
        let locked = try write("locked2.bin", "x")
        try lock(locked)
        let form: [[String: Any]] = [
            ["name": "a", "filename": "a", "kind": "file", "data": filePrefix + missing],
            ["name": "b", "filename": "b", "kind": "file", "data": filePrefix + locked],
        ]
        XCTAssertEqual(ReactNativeBlobUtilReqBuilder.unreadableSource(nil, body: nil, form: form)?["code"], "ENOENT")
    }

    // MARK: - #502 through the module

    private func fetchResult(_ run: (@escaping ([Any]) -> Void) -> Void) throws -> [Any] {
        let done = expectation(description: "callback")
        var args: [Any]?
        var fired = false
        run { values in
            if !fired { fired = true; args = values; done.fulfill() }
        }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(args)
    }

    private func firstError(_ args: [Any]) -> [String: Any]? {
        args.first as? [String: Any]
    }

    func testFetchBlobRefusesAnUnreadableBody() throws {
        let core = ReactNativeBlobUtilModuleCore()
        let path = try write("body.bin", "secret")
        try lock(path)
        let args = try fetchResult { done in
            core.fetchBlob(nil, taskId: UUID().uuidString, method: "POST",
                           url: "http://127.0.0.1:1/never", headers: nil,
                           body: self.filePrefix + path, callback: done)
        }
        XCTAssertEqual(firstError(args)?["code"] as? String, "EACCES")
    }

    func testFetchBlobFormRefusesAnUnreadablePart() throws {
        let core = ReactNativeBlobUtilModuleCore()
        let path = try write("part2.bin", "secret")
        try lock(path)
        let args = try fetchResult { done in
            core.fetchBlobForm(nil, taskId: UUID().uuidString, method: "POST",
                               url: "http://127.0.0.1:1/never", headers: nil,
                               form: [["name": "f", "filename": "f.bin", "kind": "file",
                                       "data": self.filePrefix + path]],
                               callback: done)
        }
        XCTAssertEqual(firstError(args)?["code"] as? String, "EACCES")
    }

    // MARK: - #235, #292: the progress counts

    private func counts(_ bytes: Int64, _ expected: Int64, _ ended: Bool) -> (written: Int64, total: Int64) {
        ReactNativeBlobUtilRequest.progressCounts(bytes: bytes, expected: expected, ended: ended)
    }

    func testAKnownLengthReportsWhatArrivedAgainstIt() {
        XCTAssertEqual(counts(900, 1000, false).written, 900)
        XCTAssertEqual(counts(900, 1000, false).total, 1000)
        XCTAssertEqual(counts(1000, 1000, true).written, 1000)
        XCTAssertEqual(counts(1000, 1000, true).total, 1000)
    }

    /// The fix: it used to report 0 written for the whole download, so a
    /// chunked download looked stuck at zero until the moment it finished.
    func testAnUnknownLengthReportsWhatArrivedSoFar() {
        XCTAssertEqual(counts(900, -1, false).written, 900)
        XCTAssertEqual(counts(900, -1, false).total, -1)
        XCTAssertEqual(counts(0, -1, false).written, 0)
        XCTAssertEqual(counts(0, -1, false).total, -1)
    }

    /// Once the body has ended, what arrived IS the total.
    func testAnUnknownLengthIsItsOwnTotalOnceItEnds() {
        XCTAssertEqual(counts(900, -1, true).written, 900)
        XCTAssertEqual(counts(900, -1, true).total, 900)
        XCTAssertEqual(counts(0, -1, true).total, 0)
    }

    func testTheUnknownLengthIsFoundationsOwnConstant() {
        XCTAssertEqual(NSURLSessionTransferSizeUnknown, -1,
                       "the rule keys on this value; the native payload fixture records -1 too")
    }

    // MARK: - A16: what a response does to a partly downloaded file

    private func mode(_ from: Int64, _ status: Int, _ contentRange: String?) -> Int64 {
        ReactNativeBlobUtilRequest.rangeMode(from: from, status: status, contentRange: contentRange)
    }

    private var replace: Int64 { ReactNativeBlobUtilRequest.replaceFile }
    private var discard: Int64 { ReactNativeBlobUtilRequest.discardFile }

    func testARequestThatIsNotContinuingReplacesTheFile() {
        XCTAssertEqual(mode(-1, 200, nil), replace)
        XCTAssertEqual(mode(-1, 206, "bytes 0-9/10"), replace)
    }

    /// 200 means the server ignored the range and sent the whole file, so what
    /// is on disk is worthless.
    func testAWholeFileReplacesThePartialOne() {
        XCTAssertEqual(mode(500, 200, nil), replace)
        XCTAssertEqual(mode(500, 200, "bytes 500-999/1000"), replace)
    }

    func testA206FromTheRequestedOffsetContinuesTheFile() {
        XCTAssertEqual(mode(500, 206, "bytes 500-999/1000"), 500)
        XCTAssertEqual(mode(500, 206, "  bytes   500-999/1000"), 500)
        XCTAssertEqual(mode(0, 206, "bytes 0-9/10"), 0)
    }

    /// The dangerous one: appending a body that starts somewhere else would
    /// corrupt the file rather than continue it.
    func testA206FromAnotherOffsetIsDiscarded() {
        XCTAssertEqual(mode(500, 206, "bytes 0-999/1000"), discard)
        XCTAssertEqual(mode(500, 206, "bytes 400-999/1000"), discard)
        XCTAssertEqual(mode(500, 206, nil), discard)
        XCTAssertEqual(mode(500, 206, "not a range"), discard)
        XCTAssertEqual(mode(500, 206, "items 500-999/1000"), discard)
    }

    func testAnythingElseIsDiscarded() {
        XCTAssertEqual(mode(500, 416, "bytes */500"), discard)
        XCTAssertEqual(mode(500, 404, nil), discard)
        XCTAssertEqual(mode(500, 500, nil), discard)
        XCTAssertEqual(mode(500, 304, nil), discard)
    }

    /// The same rule Android's ReactNativeBlobUtilFileResp.rangeMode follows,
    /// including the two sentinels.
    func testTheSentinelsAreTheOnesAndroidUses() {
        XCTAssertEqual(replace, -1)
        XCTAssertEqual(discard, -2)
    }

    // MARK: - what a `key` keeps

    /// A `key` named the file the response was written into as it came in, so a
    /// 404 with its error page, or a download cut short, was the cached file
    /// from then on: every later request for that key resolved with it and
    /// asked no server. Written to its own file first, a response that did not
    /// arrive whole is simply never moved onto the key's.
    func testAWholeSuccessfulResponseIsKeptUnderTheKey() throws {
        let written = try write("written.bin", "payload")
        let keyPath = "\(dir)/keyed.bin"
        XCTAssertEqual(ReactNativeBlobUtilRequest.keptForKey(written: written, keyPath: keyPath,
                                                            status: 200, complete: true), keyPath)
        XCTAssertEqual(try String(contentsOfFile: keyPath, encoding: .utf8), "payload")
        XCTAssertFalse(FileManager.default.fileExists(atPath: written), "moved, not copied")
    }

    func testAnErrorStatusIsNotKept() throws {
        let written = try write("notfound.bin", "{\"ok\":false}")
        let keyPath = "\(dir)/keyed-404.bin"
        XCTAssertEqual(ReactNativeBlobUtilRequest.keptForKey(written: written, keyPath: keyPath,
                                                            status: 404, complete: true), written)
        XCTAssertFalse(FileManager.default.fileExists(atPath: keyPath),
                       "so the next request for the key goes to the server")
    }

    func testAResponseThatDidNotArriveWholeIsNotKept() throws {
        let written = try write("cut.bin", "half")
        let keyPath = "\(dir)/keyed-cut.bin"
        XCTAssertEqual(ReactNativeBlobUtilRequest.keptForKey(written: written, keyPath: keyPath,
                                                            status: 200, complete: false), written)
        XCTAssertFalse(FileManager.default.fileExists(atPath: keyPath))
    }

    /// Without a key there is nothing to keep, and a `key` with a `path` keeps
    /// nothing either - the request layer passes no key path for one.
    func testWithoutAKeyThereIsNothingToKeep() throws {
        let written = try write("plain.bin", "payload")
        XCTAssertEqual(ReactNativeBlobUtilRequest.keptForKey(written: written, keyPath: nil,
                                                            status: 200, complete: true), written)
        XCTAssertEqual(try String(contentsOfFile: written, encoding: .utf8), "payload")
    }

    /// A key whose file is already there is only reached when the hit check let
    /// the request through, so the response that did arrive replaces it.
    func testAKeyAlreadyHoldingAFileIsReplaced() throws {
        let written = try write("fresh.bin", "new")
        let keyPath = try write("keyed-old.bin", "old")
        XCTAssertEqual(ReactNativeBlobUtilRequest.keptForKey(written: written, keyPath: keyPath,
                                                            status: 200, complete: true), keyPath)
        XCTAssertEqual(try String(contentsOfFile: keyPath, encoding: .utf8), "new")
    }

    // MARK: - where a finished download is put

    /// The finished download was moved onto its path, and whatever stood there
    /// was cleared away first - a directory with everything in it included,
    /// after which the request reported success for the file left where the
    /// folder had been. A path built by joining a name the app was handed is
    /// enough to aim a download at a folder. Android ("Output path is a
    /// directory") and Windows both fail and keep it, so iOS was the odd one.
    func testADirectoryAtTheDestinationFailsAndIsKept() throws {
        let target = "\(dir)/target"
        // Removed here: tearDown chmods what it finds, which would leave a
        // directory it cannot then delete.
        defer { try? FileManager.default.removeItem(atPath: target) }
        try FileManager.default.createDirectory(atPath: target, withIntermediateDirectories: true)
        let inside = "\(target)/keep.txt"
        try "keep".write(toFile: inside, atomically: true, encoding: .utf8)
        let downloaded = try write("downloaded.bin", "payload")

        let placement = ReactNativeBlobUtilRequest.place(URL(fileURLWithPath: downloaded),
                                                        at: target, append: false)
        XCTAssertEqual(placement, .failed(code: "EISDIR",
                                          message: "Expecting a file but '\(target)' is a directory"))
        XCTAssertEqual(try String(contentsOfFile: inside, encoding: .utf8), "keep",
                       "the folder and the file in it stay")
        XCTAssertTrue(FileManager.default.fileExists(atPath: downloaded),
                      "and the download was not moved anywhere")
    }

    /// A file there is still replaced, which is what the clearing-away was for.
    func testAFileAtTheDestinationIsReplaced() throws {
        let target = try write("target.bin", "old")
        let downloaded = try write("downloaded-replace.bin", "new")
        XCTAssertEqual(ReactNativeBlobUtilRequest.place(URL(fileURLWithPath: downloaded),
                                                        at: target, append: false), .placed)
        XCTAssertEqual(try String(contentsOfFile: target, encoding: .utf8), "new")
    }

    func testAnAppendedDownloadAddsToWhatIsThere() throws {
        let target = try write("target-append.bin", "old")
        let downloaded = try write("downloaded-append.bin", "new")
        XCTAssertEqual(ReactNativeBlobUtilRequest.place(URL(fileURLWithPath: downloaded),
                                                        at: target, append: true), .placed)
        XCTAssertEqual(try String(contentsOfFile: target, encoding: .utf8), "oldnew")
    }

    /// The parent folder is made when it is missing, as before.
    func testAMissingParentFolderIsCreated() throws {
        let target = "\(dir)/made/up/target.bin"
        let downloaded = try write("downloaded-nested.bin", "payload")
        XCTAssertEqual(ReactNativeBlobUtilRequest.place(URL(fileURLWithPath: downloaded),
                                                        at: target, append: false), .placed)
        XCTAssertEqual(try String(contentsOfFile: target, encoding: .utf8), "payload")
    }

    // MARK: - #491: a cancel that arrives while the request is still being built

    func testACancelBeforeTheTaskExistsIsRemembered() {
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        let taskId = UUID().uuidString
        network.beginTask(taskId)
        XCTAssertFalse(network.wasCancelledBeforeSending(taskId))
        network.cancelRequest(taskId)
        XCTAssertTrue(network.wasCancelledBeforeSending(taskId))
        network.removeRequest(forTaskId: taskId)
    }

    /// A cancel for something that never started is not remembered, or the next
    /// task to reuse that id would be cancelled before it began.
    func testACancelForATaskThatNeverBeganIsNotRemembered() {
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        let taskId = UUID().uuidString
        network.cancelRequest(taskId)
        XCTAssertFalse(network.wasCancelledBeforeSending(taskId))
    }

    func testTheMarkIsClearedWhenTheTaskEnds() {
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        let taskId = UUID().uuidString
        network.beginTask(taskId)
        network.cancelRequest(taskId)
        network.removeRequest(forTaskId: taskId)
        XCTAssertFalse(network.wasCancelledBeforeSending(taskId))
        network.beginTask(taskId)
        XCTAssertFalse(network.wasCancelledBeforeSending(taskId), "a new task with the same id starts clean")
        network.removeRequest(forTaskId: taskId)
    }

    /// The whole point: the request is never sent, and the caller is told the
    /// same thing a task cancelled mid-flight tells them.
    func testSendingAfterSuchACancelReportsCancelledAndSendsNothing() throws {
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        let taskId = UUID().uuidString
        network.beginTask(taskId)
        network.cancelRequest(taskId)

        let request = URLRequest(url: URL(string: "http://127.0.0.1:1/never")!)
        let args = try fetchResult { done in
            network.sendRequest(nil, contentLength: 0, baseModule: nil, taskId: taskId,
                                withRequest: request, uploadFile: nil, callback: { done($0 ?? []) })
        }
        XCTAssertEqual(firstError(args)?["code"] as? String, "ECANCELED")
        XCTAssertEqual(firstError(args)?["message"] as? String, "task cancelled")
        XCTAssertNil(network.requestsTable.object(forKey: taskId as NSString),
                     "nothing was registered, so nothing was sent")
        XCTAssertFalse(network.wasCancelledBeforeSending(taskId), "and the mark is spent")
    }

    /// The shape JS turns into a ReactNativeBlobUtilCanceledFetch: four slots,
    /// the error first.
    func testTheCancelledResultHasTheShapeEveryOtherResultHas() throws {
        let result = ReactNativeBlobUtilNetwork.cancelledBeforeSendingResult
        XCTAssertEqual(result.count, 4)
        let error = try XCTUnwrap(result[0] as? [String: String])
        XCTAssertEqual(error["code"], "ECANCELED")
        XCTAssertEqual(result[1] as? String, "")
        XCTAssertTrue(result[2] is NSNull)
    }
}
