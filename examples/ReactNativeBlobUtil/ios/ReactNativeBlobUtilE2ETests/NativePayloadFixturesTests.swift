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
@testable import react_native_blob_util

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

    /// The exists result is an object with exactly two booleans now, not a pair
    /// of callback arguments. utils/existsResult.js is gone with the callback.
    func testExistsFixtureDescribesIosAsAnObjectOfTwoBooleans() throws {
        let ios = try cases("exists-result")
        XCTAssertFalse(ios.isEmpty, "no iOS rows in the exists fixture")

        for row in ios {
            let result = try XCTUnwrap(row["result"] as? [String: Any], "row has no result: \(row)")
            XCTAssertEqual(Set(result.keys), ["exists", "isDirectory"],
                           "exactly those two keys, nothing else: \(row)")
            for (key, value) in result {
                // NSNumber bridges both Bool and Int, so check the encoding.
                let number = try XCTUnwrap(value as? NSNumber, "\(key) is not a boolean: \(row)")
                XCTAssertEqual(String(cString: number.objCType), "c",
                               "\(key) must be a boolean, not a number: \(row)")
            }
        }
    }

    /// What the module actually resolves has to match the fixture it is
    /// described by, which nothing checked while this was a callback.
    func testExistsResolvesTheShapeTheFixtureDescribes() throws {
        let dir = NSTemporaryDirectory().appending("rnbu-exists-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(atPath: dir) }
        let file = "\(dir)/a.txt"
        try "x".write(toFile: file, atomically: true, encoding: .utf8)

        let core = ReactNativeBlobUtilModuleCore()
        for (path, expected) in [(file, [true, false]), (dir, [true, true]), ("\(dir)/no", [false, false])] {
            let done = expectation(description: path)
            var resolved: [String: Any]?
            core.exists(path, resolve: { value in
                resolved = value as? [String: Any]; done.fulfill()
            }, reject: { _, _, _ in
                XCTFail("exists should not reject"); done.fulfill()
            })
            wait(for: [done], timeout: 5)
            let result = try XCTUnwrap(resolved)
            XCTAssertEqual(Set(result.keys), ["exists", "isDirectory"])
            XCTAssertEqual(result["exists"] as? Bool, expected[0], path)
            XCTAssertEqual(result["isDirectory"] as? Bool, expected[1], path)
        }
    }
}
