//
//  ReactNativeBlobUtilModuleCore, the logic that used to be in
//  ReactNativeBlobUtil.mm. Covers what runs without React or UI: the constants,
//  the plain forwards, and the two event payloads that previously had nowhere
//  to be observed, because `baseModule` was the concrete module class and there
//  was no way to hand it a recorder. It is a protocol now.
//

import XCTest
@testable import react_native_blob_util

/// Records what the layer emits, in order.
final class RecordingEventSink: NSObject, ReactNativeBlobUtilEventSink {
    private(set) var events: [(name: String, body: [AnyHashable: Any])] = []

    func emitEventDict(_ name: String, body: [AnyHashable: Any]) {
        events.append((name, body))
    }

    func bodies(for name: String) -> [[AnyHashable: Any]] {
        events.filter { $0.name == name }.map { $0.body }
    }
}

final class ModuleCoreTests: XCTestCase {

    private var core: ReactNativeBlobUtilModuleCore!
    private var sink: RecordingEventSink!
    private var dir = ""

    override func setUpWithError() throws {
        core = ReactNativeBlobUtilModuleCore()
        sink = RecordingEventSink()
        core.eventSink = sink
        dir = NSTemporaryDirectory().appending("rnbu-core-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    private func callback(_ run: (@escaping ([Any]) -> Void) -> Void) throws -> [Any] {
        let done = expectation(description: "callback")
        var args: [Any]?
        var fired = false
        run({ values in
            if !fired { fired = true; args = values; done.fulfill() }
        })
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(args)
    }

    // MARK: - constants

    func testConstantsCarryEveryDirectoryKey() {
        let constants = ReactNativeBlobUtilModuleCore.constantsToExport()
        for key in ["CacheDir", "DocumentDir", "DownloadDir", "LibraryDir", "MainBundleDir",
                    "MovieDir", "MusicDir", "PictureDir", "ApplicationSupportDir"] {
            let value = try? XCTUnwrap(constants[key] as? String)
            XCTAssertFalse(value?.isEmpty ?? true, "\(key) must resolve to a path")
        }
    }

    /// Android-only keys are present and empty rather than absent: the New
    /// Architecture uses one spec for both platforms, so a missing key is a
    /// type error on the JS side.
    func testAndroidOnlyConstantsArePresentButEmpty() {
        let constants = ReactNativeBlobUtilModuleCore.constantsToExport()
        for key in ["RingtoneDir", "SDCardDir", "SDCardApplicationDir", "DCIMDir",
                    "LegacyDCIMDir", "LegacyPictureDir", "LegacyMusicDir",
                    "LegacyDownloadDir", "LegacyMovieDir", "LegacyRingtoneDir",
                    "LegacySDCardDir"] {
            XCTAssertEqual(constants[key] as? String, "", key)
        }
    }

    // MARK: - forwards

    func testGetEnvironmentDirsReturnsDocumentThenCache() throws {
        let args = try callback { done in self.core.getEnvironmentDirs(done) }
        XCTAssertEqual(args.count, 2)
        XCTAssertEqual(args[0] as? String, ReactNativeBlobUtilFS.getDocumentDir())
        XCTAssertEqual(args[1] as? String, ReactNativeBlobUtilFS.getCacheDir())
    }

    func testExistsForwardsBothFlags() throws {
        let path = "\(dir)/a.txt"
        try "x".write(toFile: path, atomically: true, encoding: .utf8)
        let args = try callback { done in self.core.exists(path, callback: done) }
        XCTAssertEqual(args[0] as? Bool, true)
        XCTAssertEqual(args[1] as? Bool, false)
    }

    func testUnlinkSucceedsAndIsIdempotent() throws {
        let path = "\(dir)/gone.txt"
        try "x".write(toFile: path, atomically: true, encoding: .utf8)
        let first = try callback { done in self.core.unlink(path, callback: done) }
        XCTAssertTrue(first[0] is NSNull)
        // Removing a path that is already gone still succeeds.
        let second = try callback { done in self.core.unlink(path, callback: done) }
        XCTAssertTrue(second[0] is NSNull, "unlink of a missing path is not an error")
    }

    func testRemoveSessionDeletesEveryPath() throws {
        let a = "\(dir)/a.txt", b = "\(dir)/b.txt"
        try "a".write(toFile: a, atomically: true, encoding: .utf8)
        try "b".write(toFile: b, atomically: true, encoding: .utf8)
        let args = try callback { done in self.core.removeSession([a, b], callback: done) }
        XCTAssertTrue(args[0] is NSNull)
        XCTAssertFalse(FileManager.default.fileExists(atPath: a))
        XCTAssertFalse(FileManager.default.fileExists(atPath: b))
    }

    func testRemoveSessionReportsTheFirstFailureAndStops() throws {
        let missing = "\(dir)/never.txt"
        let args = try callback { done in self.core.removeSession([missing], callback: done) }
        XCTAssertEqual(args[0] as? String, "failed to remove session path at \(missing)")
    }

    func testCancelRequestForAnUnknownTaskEchoesTheTaskId() throws {
        // The registry has no such task; nothing throws and the id comes back.
        // net-after-completion covers the same through the public API.
        let taskId = "unknown-\(UUID().uuidString)"
        let args = try callback { done in self.core.cancelRequest(taskId, callback: done) }
        XCTAssertTrue(args[0] is NSNull)
        XCTAssertEqual(args[1] as? String, taskId)
    }

    /// enableProgressReport for a task that does not exist parks the config
    /// rather than dropping it, so JS can register before the request starts.
    /// There is no route to this from the public API after a task settles, so
    /// it is covered here rather than by a parity case.
    func testEnableProgressReportForAnUnknownTaskParksTheConfig() {
        let taskId = "parked-\(UUID().uuidString)"
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        core.enableProgressReport(taskId, interval: 250, count: 10)
        XCTAssertNotNil(network.rebindProgressDict[taskId])
        XCTAssertNil(network.rebindUploadProgressDict[taskId], "the download table only")
        network.removeRequest(forTaskId: taskId)
    }

    func testEnableUploadProgressReportParksSeparately() {
        let taskId = "parked-upload-\(UUID().uuidString)"
        let network = ReactNativeBlobUtilNetwork.sharedInstance()
        core.enableUploadProgressReport(taskId, interval: 250, count: 10)
        XCTAssertNotNil(network.rebindUploadProgressDict[taskId])
        XCTAssertNil(network.rebindProgressDict[taskId])
        network.removeRequest(forTaskId: taskId)
    }

    func testEmitExpiredEventDoesNothingAndDoesNotThrow() throws {
        // Declared by the spec, never implemented on either platform, called by
        // nothing. It exists so the class conforms.
        let done = expectation(description: "emitExpiredEvent")
        core.emitExpiredEvent { _ in done.fulfill() }
        // The callback is not invoked, so this only asserts the call returns.
        XCTAssertEqual(sink.events.count, 0)
        done.fulfill()
        wait(for: [done], timeout: 1)
    }

    // MARK: - the event payloads

    /// The upload progress payload, which had nowhere to be observed before the
    /// sink became a protocol. tests/fixtures/native-payloads/progress-event.json
    /// records the shape: written and total arrive as numbers, not strings.
    func testUploadProgressPayloadCarriesNumbers() throws {
        let request = ReactNativeBlobUtilRequest()
        request.taskId = "upload-1"
        request.baseModule = sink
        request.uploadProgressConfig = ReactNativeBlobUtilProgress(type: .upload, interval: 0, count: 0)

        request.urlSession(URLSession.shared,
                           task: URLSession.shared.dataTask(with: URL(string: "https://example.com")!),
                           didSendBodyData: 50, totalBytesSent: 50, totalBytesExpectedToSend: 100)

        let bodies = sink.bodies(for: ReactNativeBlobUtilConst.eventProgressUpload)
        let body = try XCTUnwrap(bodies.first, "an upload progress event should have been emitted")
        XCTAssertEqual(body["taskId"] as? String, "upload-1")
        XCTAssertTrue(body["written"] is NSNumber, "written is a number, per the fixture")
        XCTAssertTrue(body["total"] is NSNumber, "total is a number, per the fixture")
        XCTAssertEqual((body["written"] as? NSNumber)?.int64Value, 50)
        XCTAssertEqual((body["total"] as? NSNumber)?.int64Value, 100)
    }

    func testUploadProgressIsSuppressedWhenTheTotalIsUnknown() {
        let request = ReactNativeBlobUtilRequest()
        request.taskId = "upload-2"
        request.baseModule = sink
        request.uploadProgressConfig = ReactNativeBlobUtilProgress(type: .upload, interval: 0, count: 0)

        request.urlSession(URLSession.shared,
                           task: URLSession.shared.dataTask(with: URL(string: "https://example.com")!),
                           didSendBodyData: 10, totalBytesSent: 10, totalBytesExpectedToSend: 0)

        XCTAssertTrue(sink.bodies(for: ReactNativeBlobUtilConst.eventProgressUpload).isEmpty,
                      "a zero total would divide by zero, so nothing is reported")
    }

    func testDownloadProgressPayloadCarriesNumbers() throws {
        let request = ReactNativeBlobUtilRequest()
        request.taskId = "download-1"
        request.baseModule = sink
        request.progressConfig = ReactNativeBlobUtilProgress(type: .download, interval: 0, count: 0)

        let session = URLSession.shared
        request.urlSession(session,
                           downloadTask: session.downloadTask(with: URL(string: "https://example.com")!),
                           didWriteData: 25, totalBytesWritten: 25, totalBytesExpectedToWrite: 100)

        let body = try XCTUnwrap(sink.bodies(for: ReactNativeBlobUtilConst.eventProgress).first)
        XCTAssertTrue(body["written"] is NSNumber)
        XCTAssertTrue(body["total"] is NSNumber)
        XCTAssertEqual((body["written"] as? NSNumber)?.int64Value, 25)
    }
}
