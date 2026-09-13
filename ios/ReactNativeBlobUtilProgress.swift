//
//  ReactNativeBlobUtilProgress.swift
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/9/25.
//  Copyright © 2016 wkh237.github.io. All rights reserved.
//

import Foundation

/// Decides whether a progress event is emitted, so JS receives at most one
/// event per `interval` and, when `count` is set, at most `count` events over
/// the whole transfer.
///
/// `interval` arrives in milliseconds and is stored in seconds, because the
/// deltas it is compared against come from `Date.timeIntervalSince1970`.
@objc(ReactNativeBlobUtilProgressType)
public enum ReactNativeBlobUtilProgressType: Int {
    case download = 0
    case upload = 1
}

@objc(ReactNativeBlobUtilProgress)
public class ReactNativeBlobUtilProgress: NSObject {

    @objc public var count: NSNumber
    @objc public var interval: NSNumber
    @objc public var type: Int
    @objc public var enable: Bool

    private var tick: Int = 1
    private var lastTick: Double = 0

    @objc(initWithType:interval:count:)
    public init(type: ReactNativeBlobUtilProgressType, interval: NSNumber, count: NSNumber) {
        self.count = count
        self.interval = NSNumber(value: interval.floatValue / 1000)
        self.type = type.rawValue
        self.enable = true
        super.init()
    }

    @objc(shouldReport:)
    public func shouldReport(_ nextProgress: NSNumber) -> Bool {
        // The count check and the interval check are separate throttles: count
        // caps how many events a transfer emits, interval caps how often.
        var withinCount = true
        let countValue = count.floatValue
        if countValue > 0 && nextProgress.floatValue > 0 {
            // Compared in floating point rather than through Int(). A caller
            // dividing written by a total of 0 passes +infinity, which is > 0 and
            // so reaches here, and Int(Float) traps on a non-finite value. The
            // Objective-C this replaced saturated the conversion instead and
            // reported the event, which is what this keeps doing. Identical for
            // every finite value.
            withinCount = floor(nextProgress.floatValue * countValue) >= Float(tick)
        }

        let timeStamp = Date().timeIntervalSince1970
        let delta = timeStamp - lastTick
        var report = delta > interval.doubleValue && enable && withinCount

        // Always report completion. Otherwise the final event of a transfer is
        // dropped whenever it lands inside the interval window, and a caller
        // watching progress never sees 100%. Measured on Windows: the last
        // upload event (written == total) was thrown away and the only survivor
        // carried zero bytes.
        if !report && enable && nextProgress.floatValue >= 1 {
            report = true
        }

        if report {
            tick += 1
            lastTick = timeStamp
        }

        return report
    }
}
