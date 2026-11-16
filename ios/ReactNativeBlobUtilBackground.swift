//
//  ReactNativeBlobUtilBackground.swift
//  ReactNativeBlobUtil
//
//  Downloads that outlive the app. The system keeps downloading while the app
//  is suspended or gone, relaunches it when they finish, and the app finds them
//  again by the id it started them with.
//
//  Three things make that work, and all three are why this is a type of its own
//  rather than part of the request layer:
//
//  - ONE background URLSession for the whole app. iOS allows one session per
//    identifier per process, and recreating it with a second delegate loses the
//    first one's events. Every background download shares this session.
//  - The state lives on DISK, not in memory. The process that started a
//    download is usually not the process that sees it finish, so a record per
//    download goes into a JSON file and is read back on the next launch.
//  - It works without React. On a relaunch the system hands the events over
//    before anything has initialised the module, so nothing here may depend on
//    it existing; the event sink and the progress configuration are consulted
//    if they happen to be there.
//

import Foundation

#if canImport(ReactNativeBlobUtilObjC)
import ReactNativeBlobUtilObjC
#endif

@objc(ReactNativeBlobUtilBackground)
public final class ReactNativeBlobUtilBackground: NSObject, URLSessionDownloadDelegate {

    @objc public static let shared = ReactNativeBlobUtilBackground()

    /// One per app, and derived from the bundle id so two apps on one device do
    /// not share a session.
    @objc public static var sessionIdentifier: String {
        "\(Bundle.main.bundleIdentifier ?? "react-native-blob-util").rnbu.background"
    }

    /// Guards the records, the callbacks and the session. Recursive because
    /// delivering a result runs a callback that may ask for the list again.
    private let lock = NSRecursiveLock()

    private var sessionStorage: URLSession?

    /// Callbacks waiting for an id: the fetch that started the download, or an
    /// attach. A record with no callback is kept until someone asks for it.
    private var callbacks: [String: RNBUCallback] = [:]

    /// The handler iOS gives us on a relaunch, called once its events are done.
    private var launchCompletionHandler: (() -> Void)?

    /// Where progress events go when the module is alive. Weak, and nil on a
    /// relaunch, which is fine - nobody is listening then.
    @objc public weak var eventSink: ReactNativeBlobUtilEventSink?

    // MARK: - the session

    @objc public var session: URLSession {
        lock.lock()
        defer { lock.unlock() }
        if let existing = sessionStorage { return existing }
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        // Without this the app is not relaunched when a download finishes after
        // it was terminated, which is the whole point.
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        let created = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        sessionStorage = created
        return created
    }

    // MARK: - the records on disk

    /// Application Support, not Caches: the system may empty Caches while a
    /// download is still running, and these have to survive a relaunch.
    static var storePath: String {
        let base = NSSearchPathForDirectoriesInDomains(.applicationSupportDirectory, .userDomainMask, true).first
            ?? NSTemporaryDirectory()
        return (base as NSString).appendingPathComponent("ReactNativeBlobUtil_background.json")
    }

    /// Every record, by id. A store that cannot be read is an empty one: a
    /// corrupt file must not stop the app from starting new downloads.
    func records() -> [String: [String: Any]] {
        guard let data = FileManager.default.contents(atPath: Self.storePath),
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] else {
            return [:]
        }
        return parsed
    }

    private func write(_ records: [String: [String: Any]]) {
        let path = Self.storePath
        let folder = (path as NSString).deletingLastPathComponent
        if !FileManager.default.fileExists(atPath: folder) {
            try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: records) else { return }
        try? data.write(to: URL(fileURLWithPath: path), options: .atomic)
    }

    func record(for id: String) -> [String: Any]? {
        lock.lock()
        defer { lock.unlock() }
        return records()[id]
    }

    /// Changes one record under the lock, so two downloads finishing at once
    /// cannot write each other's state away.
    func update(_ id: String, _ change: (inout [String: Any]) -> Void) {
        lock.lock()
        defer { lock.unlock() }
        var all = records()
        var one = all[id] ?? ["id": id]
        change(&one)
        all[id] = one
        write(all)
    }

    func forgetRecord(_ id: String) {
        lock.lock()
        defer { lock.unlock() }
        var all = records()
        all.removeValue(forKey: id)
        write(all)
    }

    // MARK: - starting

    /// Starts a download, or rejects when `id` already names one that has not
    /// been dealt with. The callback is the fetch waiting for it.
    @objc(startWithId:url:path:headers:callback:)
    public func start(withId id: String, url: String, path: String,
                      headers: [String: Any]?, callback: @escaping RNBUCallback) {
        lock.lock()
        if let existing = records()[id], (existing["state"] as? String) == "running" {
            lock.unlock()
            return callback([["code": "EEXIST", "message": "A background download with the id '\(id)' is already running"]])
        }
        guard let requestURL = URL(string: url) else {
            lock.unlock()
            return callback([["code": "EINVAL", "message": "Cannot build a URL from '\(url)'"]])
        }

        var request = URLRequest(url: requestURL)
        for (key, value) in headers ?? [:] {
            if let value = value as? String { request.setValue(value, forHTTPHeaderField: key) }
        }

        callbacks[id] = callback
        update(id) { record in
            record["url"] = url
            record["path"] = path
            record["state"] = "running"
            record["written"] = 0
            record["total"] = -1
            record.removeValue(forKey: "errorCode")
            record.removeValue(forKey: "errorMessage")
        }
        let task = session.downloadTask(with: request)
        // The one thing that survives into the relaunched process with the task.
        task.taskDescription = id
        lock.unlock()
        task.resume()
    }

    // MARK: - listing, attaching, forgetting

    /// Every record, refreshed from the session first: a record that says
    /// "running" but has no task behind it any more belongs to a download the
    /// system gave up on while the app was gone.
    @objc(listTasks:)
    public func listTasks(_ onComplete: @escaping ([[String: Any]]) -> Void) {
        session.getAllTasks { tasks in
            let live = Set(tasks.compactMap { $0.taskDescription })
            self.lock.lock()
            var all = self.records()
            for (id, record) in all where (record["state"] as? String) == "running" && !live.contains(id) {
                var lost = record
                lost["state"] = "failed"
                lost["errorCode"] = "EUNSPECIFIED"
                lost["errorMessage"] = "The background download is no longer running"
                all[id] = lost
            }
            self.write(all)
            let out = all.values.map { self.reported($0) }
            self.lock.unlock()
            onComplete(out)
        }
    }

    /// A record as JS reads it: the keys background.js normalises, and the two
    /// error keys only on a failure.
    private func reported(_ record: [String: Any]) -> [String: Any] {
        var out: [String: Any] = [
            "id": record["id"] as? String ?? "",
            "url": record["url"] as? String ?? "",
            "path": record["path"] as? String ?? "",
            "state": record["state"] as? String ?? "failed",
            "written": record["written"] as? NSNumber ?? NSNumber(value: 0),
            "total": record["total"] as? NSNumber ?? NSNumber(value: -1),
        ]
        if let code = record["errorCode"] as? String { out["errorCode"] = code }
        if let message = record["errorMessage"] as? String { out["errorMessage"] = message }
        return out
    }

    /// Waits for a download that is already running, or hands over the outcome
    /// of one that has already finished.
    @objc(attachWithId:callback:)
    public func attach(withId id: String, callback: @escaping RNBUCallback) {
        lock.lock()
        guard let record = records()[id] else {
            lock.unlock()
            return callback([["code": "ENOENT", "message": "No background download with the id '\(id)'"]])
        }
        callbacks[id] = callback
        let state = record["state"] as? String ?? "running"
        lock.unlock()
        // Already over: hand it over now rather than waiting for an event that
        // has been and gone.
        if state == "completed" || state == "failed" {
            deliver(id)
        }
    }

    /// Cancels a running download, drops its record, and settles anyone waiting.
    @objc(forgetWithId:onComplete:)
    public func forget(withId id: String, onComplete: @escaping (Bool) -> Void) {
        session.getAllTasks { tasks in
            for task in tasks where task.taskDescription == id {
                task.cancel()
            }
            self.lock.lock()
            let known = self.records()[id] != nil
            let waiting = self.callbacks.removeValue(forKey: id)
            self.lock.unlock()
            self.forgetRecord(id)
            waiting?([
                ["code": "ECANCELED", "message": "The background download was forgotten"],
                NSNull(), NSNull(), self.info(id: id, url: "", status: 0),
            ])
            onComplete(known)
        }
    }

    // MARK: - delivery

    /// The responseInfo slot, in the shape fetch.js reads.
    private func info(id: String, url: String, status: Int) -> [String: Any] {
        [
            "taskId": id,
            "state": "2",
            "status": NSNumber(value: status),
            "headers": [String: Any](),
            "redirects": url.isEmpty ? [] : [url],
            "respType": "blob",
            "timeout": false,
        ]
    }

    /// Hands a finished download to whoever is waiting, and only then forgets
    /// it. With nobody waiting the record stays, so the next launch can still
    /// find out what happened.
    func deliver(_ id: String) {
        lock.lock()
        guard let callback = callbacks[id], let record = records()[id] else {
            lock.unlock()
            return
        }
        callbacks.removeValue(forKey: id)
        lock.unlock()

        let url = record["url"] as? String ?? ""
        let path = record["path"] as? String ?? ""
        let state = record["state"] as? String ?? "failed"
        let status = (record["status"] as? NSNumber)?.intValue ?? 200

        if state == "completed" {
            callback([NSNull(), ReactNativeBlobUtilConst.respTypePath, path, info(id: id, url: url, status: status)])
        } else {
            let code = record["errorCode"] as? String ?? "EUNSPECIFIED"
            let message = record["errorMessage"] as? String ?? "The download failed"
            callback([["code": code, "message": message], NSNull(), NSNull(),
                      info(id: id, url: url, status: status)])
        }
        forgetRecord(id)
    }

    // MARK: - the relaunch entry point

    /// Takes over the events of a background session the system is handing
    /// back, and says whether the identifier was ours.
    ///
    /// Returns false for anything else so the app delegate can pass it on - the
    /// app may have background sessions of its own. Recreates the session with
    /// this delegate if the process is new, which is the usual case: the app
    /// was launched *for* these events.
    @objc(handleEventsForBackgroundURLSession:completionHandler:)
    @discardableResult
    public static func handleEvents(forBackgroundURLSession identifier: String,
                                    completionHandler: @escaping () -> Void) -> Bool {
        guard identifier == sessionIdentifier else { return false }
        shared.lock.lock()
        shared.launchCompletionHandler = completionHandler
        shared.lock.unlock()
        // Touching it recreates it with this delegate when the process is new.
        _ = shared.session
        return true
    }

    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        lock.lock()
        let handler = launchCompletionHandler
        launchCompletionHandler = nil
        lock.unlock()
        guard let handler = handler else { return }
        // UIKit requires this on the main queue.
        DispatchQueue.main.async(execute: handler)
    }

    // MARK: - URLSessionDownloadDelegate

    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                           didWriteData bytesWritten: Int64,
                           totalBytesWritten: Int64,
                           totalBytesExpectedToWrite: Int64) {
        guard let id = downloadTask.taskDescription else { return }
        let counts = ReactNativeBlobUtilRequest.progressCounts(
            bytes: totalBytesWritten, expected: totalBytesExpectedToWrite, ended: false)
        update(id) { record in
            record["written"] = NSNumber(value: counts.written)
            record["total"] = NSNumber(value: counts.total)
        }
        // Only when someone asked for progress, and only when there is still a
        // JS side to hear it.
        let config = ReactNativeBlobUtilNetwork.sharedInstance().rebindProgressDict[id]
        let ratio = totalBytesExpectedToWrite > 0
            ? NSNumber(value: Float(totalBytesWritten) / Float(totalBytesExpectedToWrite))
            : NSNumber(value: 0)
        if config?.shouldReport(ratio) == true {
            eventSink?.emitEventDict(ReactNativeBlobUtilConst.eventProgress, body: [
                "taskId": id, "written": counts.written, "total": counts.total,
            ])
        }
    }

    public func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                           didFinishDownloadingTo location: URL) {
        guard let id = downloadTask.taskDescription else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 200
        let destination = (record(for: id)?["path"] as? String) ?? ""

        // Moved here and now, synchronously: the file at `location` is deleted
        // the moment this method returns.
        var failure: (code: String, message: String)?
        if destination.isEmpty {
            failure = ("EUNSPECIFIED", "The background download has no destination path")
        } else {
            let fm = FileManager.default
            let folder = (destination as NSString).deletingLastPathComponent
            do {
                if !fm.fileExists(atPath: folder) {
                    try fm.createDirectory(atPath: folder, withIntermediateDirectories: true)
                }
                if fm.fileExists(atPath: destination) {
                    try fm.removeItem(atPath: destination)
                }
                try fm.moveItem(at: location, to: URL(fileURLWithPath: destination))
            } catch let error as NSError {
                failure = (ReactNativeBlobUtilFS.errorCode(error), error.localizedDescription)
            }
        }

        update(id) { record in
            record["status"] = NSNumber(value: status)
            if let failure = failure {
                record["state"] = "failed"
                record["errorCode"] = failure.code
                record["errorMessage"] = failure.message
            } else {
                record["state"] = "completed"
                if let size = (try? FileManager.default.attributesOfItem(atPath: destination))?[.size] as? NSNumber {
                    record["written"] = size
                    record["total"] = size
                }
            }
        }
        deliver(id)
    }

    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = task.taskDescription else { return }
        // Success already went through didFinishDownloadingTo, which removed the
        // record once it was delivered.
        guard let error = error as NSError? else { return }
        let cancelled = error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled
        // A cancel is forget()'s doing, and it has already settled and removed
        // the record; anything else is a failure worth keeping.
        if cancelled { return }
        update(id) { record in
            record["state"] = "failed"
            record["errorCode"] = ReactNativeBlobUtilRequest.networkErrorCode(error)
            record["errorMessage"] = error.localizedDescription
        }
        deliver(id)
    }
}
