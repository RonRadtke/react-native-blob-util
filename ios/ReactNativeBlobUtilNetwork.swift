//
//  ReactNativeBlobUtilNetwork.swift
//  ReactNativeBlobUtil
//
//  Created by wkh237 on 2016/6/6.
//  Copyright © 2016 wkh237. All rights reserved.
//
//  Ported from ReactNativeBlobUtilNetwork.mm. The request registry and the two
//  parked-progress tables are shared mutable state reached from the module's
//  serial queue and from NSURLSession delegate callbacks on taskQueue, so every
//  critical section the Objective-C guarded with
//  @synchronized([ReactNativeBlobUtilNetwork class]) is guarded here by one
//  static lock - the class object was a single shared token, so a single lock is
//  the same thing.
//

import Foundation

// Under SwiftPM the Objective-C leaf (the file transformer, the exception
// boundary and the event-sink protocol) is a separate module; under CocoaPods
// it arrives through the pod's umbrella with no import at all. canImport keeps
// one source tree building both ways.
#if canImport(ReactNativeBlobUtilObjC)
import ReactNativeBlobUtilObjC
#endif


@objc(ReactNativeBlobUtilNetwork)
public class ReactNativeBlobUtilNetwork: NSObject {

    /// Strong keys and strong values, as before: a weak-valued table would let a
    /// request be freed while its task is still running.
    @objc public let requestsTable = NSMapTable<NSString, ReactNativeBlobUtilRequest>(
        keyOptions: .strongMemory, valueOptions: .strongMemory)

    /// The NSURLSession delegate queue. Both values are observable - they decide
    /// how delegate callbacks interleave.
    @objc public let taskQueue: OperationQueue = {
        let queue = OperationQueue()
        queue.qualityOfService = .utility
        queue.maxConcurrentOperationCount = 10
        return queue
    }()

    /// Progress configuration that arrived before its task existed.
    @objc public var rebindProgressDict: [String: ReactNativeBlobUtilProgress] = [:]
    @objc public var rebindUploadProgressDict: [String: ReactNativeBlobUtilProgress] = [:]

    /// Task ids that have begun and not yet ended, and the ones cancelled while
    /// their request was still being built.
    ///
    /// A request is not in requestsTable until its URLSessionTask exists, and
    /// building the body happens first and asynchronously - reading a file,
    /// walking a multipart form. A cancel arriving in that window used to find
    /// nothing to cancel and was simply lost; the request then went out anyway
    /// and the caller, who had asked for it to stop, got a response (#491).
    private var startedTasks: Set<String> = []
    private var cancelledBeforeSend: Set<String> = []

    private static let lock = NSLock()

    @objc(sharedInstance)
    public static func sharedInstance() -> ReactNativeBlobUtilNetwork {
        return shared
    }

    private static let shared = ReactNativeBlobUtilNetwork()

    /// Remembers that a task has begun, before its body is built. From here on
    /// a cancel for this id is kept rather than dropped.
    @objc(beginTask:)
    public func beginTask(_ taskId: String) {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        startedTasks.insert(taskId)
        cancelledBeforeSend.remove(taskId)
    }

    /// Whether a cancel arrived while this task's request was still being built.
    @objc(wasCancelledBeforeSending:)
    public func wasCancelledBeforeSending(_ taskId: String) -> Bool {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        return cancelledBeforeSend.contains(taskId)
    }

    /// What a request cancelled before it was sent answers with: the shape a
    /// task cancelled mid-flight produces, so JS cannot tell the two apart and
    /// both become a ReactNativeBlobUtilCanceledFetch.
    static let cancelledBeforeSendingResult: [Any] = [
        ["code": "ECANCELED", "message": "task cancelled"],
        "",
        NSNull(),
        ["status": NSNumber(value: 0)],
    ]

    @objc(sendRequest:contentLength:baseModule:taskId:withRequest:uploadFile:callback:)
    public func sendRequest(_ options: [String: Any]?,
                            contentLength: Int,
                            baseModule: ReactNativeBlobUtilEventSink?,
                            taskId: String?,
                            withRequest req: URLRequest?,
                            uploadFile: URL?,
                            callback: RNBUCallback?) {
        // Checked here rather than inside the request, because this is the last
        // point before the task exists and the one place every caller passes
        // through.
        if let taskId = taskId, wasCancelledBeforeSending(taskId) {
            removeRequest(forTaskId: taskId)
            callback?(Self.cancelledBeforeSendingResult)
            return
        }
        let request = ReactNativeBlobUtilRequest()
        request.sendRequest(options,
                            contentLength: contentLength,
                            baseModule: baseModule,
                            taskId: taskId,
                            withRequest: req,
                            uploadFile: uploadFile,
                            taskOperationQueue: taskQueue,
                            callback: callback)

        Self.lock.lock()
        defer { Self.lock.unlock() }
        if let taskId = taskId, request.task != nil {
            requestsTable.setObject(request, forKey: taskId as NSString)
            checkProgressConfigForTaskLocked(taskId)
        }
    }

    /// Applies whatever configuration was parked for this task. Called with the
    /// lock already held, as the Objective-C did from inside its @synchronized.
    private func checkProgressConfigForTaskLocked(_ taskId: String) {
        if let downloadConfig = rebindProgressDict[taskId] {
            requestsTable.object(forKey: taskId as NSString)?.progressConfig = downloadConfig
            rebindProgressDict.removeValue(forKey: taskId)
        }
        if let uploadConfig = rebindUploadProgressDict[taskId] {
            requestsTable.object(forKey: taskId as NSString)?.uploadProgressConfig = uploadConfig
            rebindUploadProgressDict.removeValue(forKey: taskId)
        }
    }

    @objc(enableProgressReport:config:)
    public func enableProgressReport(_ taskId: String, config: ReactNativeBlobUtilProgress?) {
        guard let config = config else { return }
        Self.lock.lock()
        defer { Self.lock.unlock() }
        if let request = requestsTable.object(forKey: taskId as NSString) {
            request.progressConfig = config
        } else {
            rebindProgressDict[taskId] = config
        }
    }

    @objc(enableUploadProgress:config:)
    public func enableUploadProgress(_ taskId: String, config: ReactNativeBlobUtilProgress?) {
        guard let config = config else { return }
        Self.lock.lock()
        defer { Self.lock.unlock() }
        if let request = requestsTable.object(forKey: taskId as NSString) {
            request.uploadProgressConfig = config
        } else {
            rebindUploadProgressDict[taskId] = config
        }
    }

    @objc(cancelRequest:)
    public func cancelRequest(_ taskId: String) {
        var task: URLSessionTask?
        Self.lock.lock()
        task = requestsTable.object(forKey: taskId as NSString)?.task
        // Nothing to cancel yet, but the request is on its way to being sent:
        // remember the cancel so the send can refuse it.
        if task == nil && startedTasks.contains(taskId) {
            cancelledBeforeSend.insert(taskId)
        }
        requestsTable.removeObject(forKey: taskId as NSString)
        rebindProgressDict.removeValue(forKey: taskId)
        rebindUploadProgressDict.removeValue(forKey: taskId)
        Self.lock.unlock()

        // Cancelled outside the lock, as before.
        if let task = task, task.state == .running {
            task.cancel()
        }
    }

    /// The end of a task, whatever ended it. Clears the cancel marks too, so an
    /// id reused later does not inherit them.
    @objc(removeRequestForTaskId:)
    public func removeRequest(forTaskId taskId: String) {
        Self.lock.lock()
        defer { Self.lock.unlock() }
        requestsTable.removeObject(forKey: taskId as NSString)
        rebindProgressDict.removeValue(forKey: taskId)
        rebindUploadProgressDict.removeValue(forKey: taskId)
        startedTasks.remove(taskId)
        cancelledBeforeSend.remove(taskId)
    }

    /// Lowercases every key, so a header can be looked up without knowing how the
    /// caller capitalised it.
    @objc(normalizeHeaders:)
    public static func normalizeHeaders(_ headers: [String: Any]?) -> [String: Any] {
        var normalized: [String: Any] = [:]
        for (key, value) in headers ?? [:] {
            normalized[key.lowercased()] = value
        }
        return normalized
    }
}
