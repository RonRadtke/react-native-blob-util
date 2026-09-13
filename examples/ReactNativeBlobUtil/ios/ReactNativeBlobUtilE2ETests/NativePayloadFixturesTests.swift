//
//  The counterpart to
//  android/src/test/java/com/ReactNativeBlobUtil/NativePayloadFixturesTest.kt.
//
//  tests/fixtures/native-payloads is the contract between the native layers and
//  the JS normalisers in utils/. The JS tests read these files, the JVM tests
//  read these files, and so does this - the same files, referenced from their
//  real location and copied into the test bundle, so none of the three can drift
//  onto a private copy.
//
//  These assert the iOS rows specifically. Asserting Android's rows here would
//  pass without saying anything about this platform.
//

import XCTest

final class NativePayloadFixturesTests: XCTestCase {

    private func cases(_ name: String) throws -> [[String: Any]] {
        let url = try XCTUnwrap(
            Bundle(for: type(of: self)).url(forResource: name, withExtension: "json"),
            "\(name).json is not in the test bundle - check the Copy Bundle Resources phase"
        )
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let all = try XCTUnwrap(root?["cases"] as? [[String: Any]])
        return all.filter { ($0["platform"] as? String) == "ios" }
    }

    func testProgressFixtureDescribesIosByteCountsAsNumbers() throws {
        let ios = try cases("progress-event")
        XCTAssertFalse(ios.isEmpty, "no iOS rows in the progress fixture")

        let current = ios.filter { ($0["current"] as? Bool) == true }
        XCTAssertFalse(current.isEmpty, "no current iOS rows in the progress fixture")

        for row in current {
            // Today's native layer emits @(receivedBytes) / @(expectedBytes),
            // so both arrive as numbers. 0.24.x sent strings; those rows are
            // present with current=false and are deliberately not asserted here.
            XCTAssertTrue(row["written"] is NSNumber, "written must be a number: \(row)")
            XCTAssertTrue(row["total"] is NSNumber, "total must be a number: \(row)")
            XCTAssertFalse(row["written"] is String, "written must not be a string: \(row)")
        }
    }

    func testProgressFixtureKeepsAnUnknownLengthRow() throws {
        let ios = try cases("progress-event")
        let unknown = ios.filter { ($0["current"] as? Bool) == true && ($0["total"] as? NSNumber)?.intValue == -1 }
        XCTAssertFalse(unknown.isEmpty,
                       "a chunked response reports NSURLResponseUnknownLength (-1); that row must stay")
    }

    func testExistsFixtureDescribesIosAsTwoBooleans() throws {
        let ios = try cases("exists-callback")
        XCTAssertFalse(ios.isEmpty, "no iOS rows in the exists fixture")

        for row in ios {
            let args = try XCTUnwrap(row["args"] as? [Any], "row has no args: \(row)")
            XCTAssertEqual(args.count, 2, "iOS passes exactly two arguments: \(row)")
            for arg in args {
                // NSNumber bridges both Bool and Int, so check the encoding.
                let number = try XCTUnwrap(arg as? NSNumber, "argument is not a boolean: \(row)")
                XCTAssertEqual(String(cString: number.objCType), "c",
                               "arguments must be booleans, not numbers: \(row)")
            }
        }
    }
}
