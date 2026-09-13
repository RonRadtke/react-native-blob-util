//
//  Mirrors android/src/test/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilProgressConfigTest.kt.
//
//  The two platforms express the count throttle differently and are equivalent:
//  Android starts `tick` at 0 and tests `floor(progress * count) > tick`, iOS
//  starts it at 1 and tests `>=`. Both offsets shift by one, so the two agree on
//  every input. These assertions are written against the iOS form deliberately -
//  asserting Android's would pass here by accident rather than by agreement.
//

import XCTest
@testable import react_native_blob_util

final class ProgressThrottlingTests: XCTestCase {

    /// interval is given in milliseconds; 0 means "never throttle on time".
    private func config(interval: Double, count: Double) -> ReactNativeBlobUtilProgress {
        return ReactNativeBlobUtilProgress(
            type: .download,
            interval: NSNumber(value: interval),
            count: NSNumber(value: count)
        )
    }

    func testReportsTheFirstProgressWhenNotThrottled() {
        let cfg = config(interval: 0, count: 0)
        XCTAssertTrue(cfg.shouldReport(0.1))
    }

    func testIntervalThrottlesASecondEventInTheSameWindow() {
        let cfg = config(interval: 10_000, count: 0)
        XCTAssertTrue(cfg.shouldReport(0.1), "the first event has no previous tick to be throttled against")
        XCTAssertFalse(cfg.shouldReport(0.2), "a second event inside a 10s interval must be dropped")
    }

    func testCompletionIsAlwaysReportedEvenInsideTheInterval() {
        let cfg = config(interval: 10_000, count: 0)
        XCTAssertTrue(cfg.shouldReport(0.1))
        XCTAssertFalse(cfg.shouldReport(0.5), "still inside the interval")
        XCTAssertTrue(cfg.shouldReport(1.0), "100% must survive the interval throttle")
    }

    func testCountThrottlesUntilTheNextStepIsReached() {
        // count: 10 means at most ten events, one per 10% of the transfer.
        let cfg = config(interval: 0, count: 10)
        XCTAssertTrue(cfg.shouldReport(0.1), "floor(0.1*10) = 1 >= tick 1")
        XCTAssertFalse(cfg.shouldReport(0.15), "floor(0.15*10) = 1, still below tick 2")
        XCTAssertTrue(cfg.shouldReport(0.2), "floor(0.2*10) = 2 >= tick 2")
    }

    func testZeroProgressSkipsTheCountCheck() {
        let cfg = config(interval: 0, count: 10)
        XCTAssertTrue(cfg.shouldReport(0), "progress 0 bypasses the count throttle, as on Android")
    }

    func testDisablingSuppressesEverythingIncludingCompletion() {
        let cfg = config(interval: 0, count: 0)
        cfg.enable = false
        XCTAssertFalse(cfg.shouldReport(0.5))
        XCTAssertFalse(cfg.shouldReport(1.0), "completion is only forced while enabled")
    }

    func testIntervalIsStoredInSecondsNotMilliseconds() {
        // The call site passes milliseconds; the comparison is against
        // Date.timeIntervalSince1970, which is seconds.
        let cfg = config(interval: 250, count: 0)
        XCTAssertEqual(cfg.interval.doubleValue, 0.25, accuracy: 1e-6)
    }

    /// A caller computing written/total with a total of 0 and a non-zero written
    /// hands this +infinity. Objective-C saturated the conversion and reported
    /// the event; Swift's Int(Float) traps on a non-finite value and takes the
    /// process with it, so this has to stay in floating point.
    func testNonFiniteProgressIsReportedRatherThanTrapping() {
        let cfg = config(interval: 0, count: 10)
        XCTAssertTrue(cfg.shouldReport(NSNumber(value: Float.infinity)))
    }

    /// NaN is excluded earlier by the `> 0` check, so it must not reach the
    /// conversion either - and must not be treated as completion.
    func testNaNProgressIsHandledWithoutTrapping() {
        let cfg = config(interval: 0, count: 10)
        XCTAssertTrue(cfg.shouldReport(NSNumber(value: Float.nan)),
                      "NaN skips the count throttle, leaving only the interval check, which is 0 here")
    }

    func testTypeIsRecorded() {
        XCTAssertEqual(config(interval: 0, count: 0).type, ReactNativeBlobUtilProgressType.download.rawValue)
        let upload = ReactNativeBlobUtilProgress(type: .upload, interval: 0, count: 0)
        XCTAssertEqual(upload.type, ReactNativeBlobUtilProgressType.upload.rawValue)
    }
}
