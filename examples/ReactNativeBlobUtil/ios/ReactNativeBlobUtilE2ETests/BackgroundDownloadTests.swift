//
//  Downloads that outlive the app. What is reachable without the system
//  actually running one: the record store, which is the only thing that
//  survives a relaunch, and everything that reads or settles it.
//
//  The records live in one file shared with the app, so every test here uses
//  ids of its own and removes them again.
//

import XCTest
@testable import react_native_blob_util

final class BackgroundDownloadTests: XCTestCase {

    private var manager: ReactNativeBlobUtilBackground { ReactNativeBlobUtilBackground.shared }
    private var ids: [String] = []
    private var dir = ""

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory().appending("rnbu-background-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        for id in ids { manager.forgetRecord(id) }
        ids = []
        try? FileManager.default.removeItem(atPath: dir)
    }

    /// A record of this test's own, cleaned up afterwards.
    @discardableResult
    private func record(state: String, path: String = "", url: String = "https://example.invalid/f",
                        extras: [String: Any] = [:]) -> String {
        let id = "test-\(UUID().uuidString)"
        ids.append(id)
        manager.update(id) { record in
            record["url"] = url
            record["path"] = path
            record["state"] = state
            record["written"] = NSNumber(value: 0)
            record["total"] = NSNumber(value: -1)
            for (key, value) in extras { record[key] = value }
        }
        return id
    }

    private func settle(_ run: (@escaping ([Any]) -> Void) -> Void) throws -> [Any] {
        let done = expectation(description: "settled")
        var args: [Any]?
        var fired = false
        run { values in
            if !fired { fired = true; args = values; done.fulfill() }
        }
        wait(for: [done], timeout: 10)
        return try XCTUnwrap(args)
    }

    // MARK: - the session

    /// One session per app, named after the bundle so two apps on a device do
    /// not share one.
    func testTheSessionIdentifierIsTheAppsOwn() {
        let identifier = ReactNativeBlobUtilBackground.sessionIdentifier
        XCTAssertTrue(identifier.hasSuffix(".rnbu.background"), identifier)
        if let bundle = Bundle.main.bundleIdentifier {
            XCTAssertTrue(identifier.hasPrefix(bundle), identifier)
        }
    }

    func testTheSessionIsCreatedOnceAndKept() {
        XCTAssertTrue(manager.session === manager.session)
        XCTAssertEqual(manager.session.configuration.identifier, ReactNativeBlobUtilBackground.sessionIdentifier)
        XCTAssertTrue(manager.session.configuration.sessionSendsLaunchEvents)
    }

    // MARK: - the records

    func testARecordSurvivesBeingWrittenAndReadBack() {
        let id = record(state: "running", path: "\(dir)/a.bin")
        let stored = manager.record(for: id)
        XCTAssertEqual(stored?["state"] as? String, "running")
        XCTAssertEqual(stored?["path"] as? String, "\(dir)/a.bin")
        XCTAssertEqual(stored?["url"] as? String, "https://example.invalid/f")
    }

    func testARecordIsRemovedAgain() {
        let id = record(state: "running")
        manager.forgetRecord(id)
        XCTAssertNil(manager.record(for: id))
    }

    /// The store is read on a cold launch, when anything may have happened to
    /// it. A file that is not JSON must not stop the app from starting
    /// downloads, so it reads as no records rather than throwing.
    func testAStoreThatCannotBeReadIsNoRecords() throws {
        let path = ReactNativeBlobUtilBackground.storePath
        let saved = FileManager.default.contents(atPath: path)
        defer {
            if let saved = saved {
                try? saved.write(to: URL(fileURLWithPath: path), options: .atomic)
            } else {
                try? FileManager.default.removeItem(atPath: path)
            }
        }
        try Data("not json at all".utf8).write(to: URL(fileURLWithPath: path), options: .atomic)
        XCTAssertEqual(manager.records().count, 0)
    }

    func testTheStoreIsInApplicationSupport() {
        XCTAssertTrue(ReactNativeBlobUtilBackground.storePath.contains("Application Support"),
                      ReactNativeBlobUtilBackground.storePath)
        XCTAssertTrue(ReactNativeBlobUtilBackground.storePath.hasSuffix(".json"))
    }

    // MARK: - listing

    func testListingReportsTheKeysJSReads() throws {
        let id = record(state: "completed", path: "\(dir)/done.bin")
        let listed = try awaitList().first { $0["id"] as? String == id }
        let found = try XCTUnwrap(listed)
        XCTAssertEqual(found["state"] as? String, "completed")
        XCTAssertEqual(found["path"] as? String, "\(dir)/done.bin")
        XCTAssertNotNil(found["url"])
        XCTAssertNotNil(found["written"])
        XCTAssertNotNil(found["total"])
        XCTAssertNil(found["errorCode"], "only a failure carries an error")
    }

    func testAFailedRecordCarriesItsError() throws {
        let id = record(state: "failed", extras: ["errorCode": "ETIMEDOUT", "errorMessage": "too slow"])
        let found = try XCTUnwrap(try awaitList().first { $0["id"] as? String == id })
        XCTAssertEqual(found["errorCode"] as? String, "ETIMEDOUT")
        XCTAssertEqual(found["errorMessage"] as? String, "too slow")
    }

    /// A record left saying "running" by a process that is gone, with no task
    /// behind it any more: the download is not coming back.
    func testARunningRecordWithNoTaskBecomesFailed() throws {
        let id = record(state: "running")
        let found = try XCTUnwrap(try awaitList().first { $0["id"] as? String == id })
        XCTAssertEqual(found["state"] as? String, "failed")
        XCTAssertEqual(found["errorCode"] as? String, "EUNSPECIFIED")
        XCTAssertEqual(manager.record(for: id)?["state"] as? String, "failed", "and it is written back")
    }

    /// Reading the list settles nothing and removes nothing.
    func testListingKeepsEveryRecord() throws {
        let id = record(state: "completed", path: "\(dir)/keep.bin")
        _ = try awaitList()
        _ = try awaitList()
        XCTAssertNotNil(manager.record(for: id))
    }

    private func awaitList() throws -> [[String: Any]] {
        let done = expectation(description: "list")
        var out: [[String: Any]]?
        manager.listTasks { records in
            out = records
            done.fulfill()
        }
        wait(for: [done], timeout: 10)
        return try XCTUnwrap(out)
    }

    // MARK: - attaching

    func testAttachingToAnUnknownIdIsENOENT() throws {
        let args = try settle { done in self.manager.attach(withId: "no-such-id", callback: { done($0 ?? []) }) }
        XCTAssertEqual((args.first as? [String: Any])?["code"] as? String, "ENOENT")
    }

    /// A download that finished while nothing was listening is handed over the
    /// moment something attaches.
    func testAttachingToAFinishedDownloadDeliversAtOnce() throws {
        let path = "\(dir)/finished.bin"
        try Data("done".utf8).write(to: URL(fileURLWithPath: path))
        let id = record(state: "completed", path: path, extras: ["status": NSNumber(value: 206)])

        let args = try settle { done in self.manager.attach(withId: id, callback: { done($0 ?? []) }) }
        XCTAssertEqual(args.count, 4)
        XCTAssertTrue(args[0] is NSNull, "a completed download is not an error")
        XCTAssertEqual(args[1] as? String, "path")
        XCTAssertEqual(args[2] as? String, path)
        let info = try XCTUnwrap(args[3] as? [String: Any])
        XCTAssertEqual(info["taskId"] as? String, id)
        XCTAssertEqual(info["state"] as? String, "2")
        XCTAssertEqual(info["status"] as? NSNumber, NSNumber(value: 206))
        XCTAssertEqual(info["respType"] as? String, "blob")
        XCTAssertEqual(info["timeout"] as? Bool, false)
        XCTAssertNotNil(info["headers"])
    }

    func testAFinishedDownloadIsForgottenOnceItHasBeenHandedOver() throws {
        let id = record(state: "completed", path: "\(dir)/gone-after.bin")
        _ = try settle { done in self.manager.attach(withId: id, callback: { done($0 ?? []) }) }
        XCTAssertNil(manager.record(for: id), "delivered means dealt with")
    }

    func testAttachingToAFailedDownloadDeliversItsError() throws {
        let id = record(state: "failed", extras: ["errorCode": "ENOTFOUND", "errorMessage": "no such host"])
        let args = try settle { done in self.manager.attach(withId: id, callback: { done($0 ?? []) }) }
        let error = try XCTUnwrap(args.first as? [String: Any])
        XCTAssertEqual(error["code"] as? String, "ENOTFOUND")
        XCTAssertEqual(error["message"] as? String, "no such host")
        XCTAssertTrue(args[1] is NSNull)
        XCTAssertTrue(args[2] is NSNull)
        XCTAssertNil(manager.record(for: id))
    }

    /// With nobody waiting, the outcome stays on disk - the next launch has to
    /// be able to find out what happened.
    func testAFinishedDownloadNobodyIsWaitingForIsKept() {
        let id = record(state: "completed", path: "\(dir)/nobody.bin")
        manager.deliver(id)
        XCTAssertNotNil(manager.record(for: id))
    }

    // MARK: - forgetting

    func testForgettingRemovesTheRecord() throws {
        let id = record(state: "completed", path: "\(dir)/forget.bin")
        let done = expectation(description: "forgotten")
        manager.forget(withId: id) { known in
            XCTAssertTrue(known)
            done.fulfill()
        }
        wait(for: [done], timeout: 10)
        XCTAssertNil(manager.record(for: id))
    }

    func testForgettingSomethingAlreadyForgottenIsNotAFailure() throws {
        let done = expectation(description: "forgotten")
        manager.forget(withId: "never-existed") { known in
            XCTAssertFalse(known)
            done.fulfill()
        }
        wait(for: [done], timeout: 10)
    }

    /// Whoever was waiting is told, rather than left waiting forever.
    func testForgettingSettlesAWaitingCallback() throws {
        let id = record(state: "running", path: "\(dir)/waiting.bin")
        let settled = expectation(description: "settled")
        var args: [Any]?
        manager.attach(withId: id, callback: { values in
            args = values ?? []
            settled.fulfill()
        })

        let forgotten = expectation(description: "forgotten")
        manager.forget(withId: id) { _ in forgotten.fulfill() }
        wait(for: [settled, forgotten], timeout: 10)

        let error = try XCTUnwrap((args?.first) as? [String: Any])
        XCTAssertEqual(error["code"] as? String, "ECANCELED")
        XCTAssertEqual(error["message"] as? String, "The background download was forgotten")
        XCTAssertNil(manager.record(for: id))
    }

    /// A file the download already wrote is not the record's to delete.
    func testForgettingLeavesTheFileAlone() throws {
        let path = "\(dir)/partial.bin"
        try Data("half".utf8).write(to: URL(fileURLWithPath: path))
        let id = record(state: "running", path: path)
        let done = expectation(description: "forgotten")
        manager.forget(withId: id) { _ in done.fulfill() }
        wait(for: [done], timeout: 10)
        XCTAssertTrue(FileManager.default.fileExists(atPath: path))
    }

    // MARK: - starting

    /// Two downloads with one id would overwrite each other's record and file.
    func testStartingAnIdThatIsAlreadyRunningIsEEXIST() throws {
        let id = record(state: "running", path: "\(dir)/busy.bin")
        let args = try settle { done in
            self.manager.start(withId: id, url: "https://example.invalid/f",
                               path: "\(self.dir)/other.bin", headers: nil, callback: { done($0 ?? []) })
        }
        let error = try XCTUnwrap(args.first as? [String: Any])
        XCTAssertEqual(error["code"] as? String, "EEXIST")
    }

    /// A record that has finished is not in the way: its id can start a new one.
    func testStartingOverAFinishedRecordIsAllowed() throws {
        let id = record(state: "completed", path: "\(dir)/old.bin")
        manager.start(withId: id, url: "https://127.0.0.1:1/never",
                      path: "\(dir)/new.bin", headers: nil, callback: { _ in })
        XCTAssertEqual(manager.record(for: id)?["state"] as? String, "running")
        XCTAssertEqual(manager.record(for: id)?["path"] as? String, "\(dir)/new.bin")
        let done = expectation(description: "cleaned up")
        manager.forget(withId: id) { _ in done.fulfill() }
        wait(for: [done], timeout: 10)
    }

    func testAUrlThatCannotBeBuiltIsEINVAL() throws {
        let id = "test-bad-url-\(UUID().uuidString)"
        ids.append(id)
        let args = try settle { done in
            self.manager.start(withId: id, url: "", path: "\(self.dir)/x.bin",
                               headers: nil, callback: { done($0 ?? []) })
        }
        XCTAssertEqual((args.first as? [String: Any])?["code"] as? String, "EINVAL")
    }

    // MARK: - which requests are background downloads

    private func idFor(_ options: [String: Any]?, _ taskId: String = "task-1", _ method: String = "GET") -> String? {
        ReactNativeBlobUtilBackground.backgroundId(options: options, taskId: taskId, method: method)
    }

    func testAnOrdinaryRequestIsNotABackgroundDownload() {
        XCTAssertNil(idFor(nil))
        XCTAssertNil(idFor([:]))
        XCTAssertNil(idFor(["path": "/tmp/x.bin"]))
    }

    func testTheBackgroundOptionNamesTheId() {
        XCTAssertEqual(idFor(["background": ["id": "chosen"]]), "chosen")
        // JS has already checked the rest of it, so nothing else is required.
        XCTAssertEqual(idFor(["background": ["id": "chosen"]], "task-1", "POST"), "chosen")
    }

    func testAnEmptyOrMissingIdIsNotOne() {
        XCTAssertNil(idFor(["background": ["id": ""]]))
        XCTAssertNil(idFor(["background": [:]]))
        XCTAssertNil(idFor(["background": true]))
    }

    /// The old ios.backgroundTask made a background session named after the
    /// task id, which nothing could find again after a relaunch. It shares the
    /// one session now, under that same id.
    func testTheOldBackgroundTaskOptionSharesTheSession() {
        XCTAssertEqual(idFor(["IOSBackgroundTask": true, "path": "/tmp/x.bin"], "task-7"), "task-7")
    }

    /// Only where it can mean the same thing: a system-run download is a GET
    /// writing to a path. Anything else keeps the behaviour it had.
    func testTheOldOptionOnlyQualifiesForAGetToAPath() {
        XCTAssertNil(idFor(["IOSBackgroundTask": true], "task-7"))
        XCTAssertNil(idFor(["IOSBackgroundTask": true, "path": ""], "task-7"))
        XCTAssertNil(idFor(["IOSBackgroundTask": true, "path": "/tmp/x.bin"], "task-7", "POST"))
        XCTAssertNil(idFor(["IOSBackgroundTask": false, "path": "/tmp/x.bin"], "task-7"))
        XCTAssertNil(idFor(["IOSBackgroundTask": true, "path": "/tmp/x.bin"], ""))
    }

    func testTheNewOptionWinsOverTheOld() {
        XCTAssertEqual(idFor(["IOSBackgroundTask": true, "path": "/tmp/x.bin",
                              "background": ["id": "chosen"]], "task-7"), "chosen")
    }

    // MARK: - the relaunch entry point

    /// The app may have background sessions of its own; ours says so and the
    /// app delegate passes the rest on.
    func testAForeignSessionIdentifierIsNotOurs() {
        XCTAssertFalse(ReactNativeBlobUtilBackground.handleEvents(
            forBackgroundURLSession: "com.example.something.else", completionHandler: {}))
    }

    func testOurSessionIdentifierIsTakenAndItsHandlerRunsOnTheMainQueue() {
        let called = expectation(description: "handler")
        XCTAssertTrue(ReactNativeBlobUtilBackground.handleEvents(
            forBackgroundURLSession: ReactNativeBlobUtilBackground.sessionIdentifier,
            completionHandler: {
                XCTAssertTrue(Thread.isMainThread, "UIKit requires it")
                called.fulfill()
            }))
        manager.urlSessionDidFinishEvents(forBackgroundURLSession: manager.session)
        wait(for: [called], timeout: 10)
    }

    /// And it is called once, not on every later batch of events.
    func testTheHandlerIsCalledOnlyOnce() {
        var calls = 0
        let called = expectation(description: "handler")
        _ = ReactNativeBlobUtilBackground.handleEvents(
            forBackgroundURLSession: ReactNativeBlobUtilBackground.sessionIdentifier,
            completionHandler: { calls += 1; called.fulfill() })
        manager.urlSessionDidFinishEvents(forBackgroundURLSession: manager.session)
        wait(for: [called], timeout: 10)
        manager.urlSessionDidFinishEvents(forBackgroundURLSession: manager.session)
        XCTAssertEqual(calls, 1)
    }
}
