//
//  The behaviours 1.0 brought in line across platforms, from the
//  "Behaviour brought in line across platforms" table in Migration.md.
//
//  Each test names the row it pins. Where the platforms disagreed, the table
//  picks one answer and iOS moves to it; where iOS already had the chosen
//  answer, the row is checked here rather than changed.
//

import XCTest
@testable import react_native_blob_util

final class BehaviourAlignmentTests: XCTestCase {

    private var core: ReactNativeBlobUtilModuleCore!
    private var dir = ""
    private let fm = FileManager.default

    override func setUpWithError() throws {
        core = ReactNativeBlobUtilModuleCore()
        dir = NSTemporaryDirectory().appending("rnbu-c2-\(UUID().uuidString)")
        try fm.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? fm.removeItem(atPath: dir)
    }

    // MARK: - harness

    private enum Settled {
        case resolved(Any?)
        case rejected(code: String?, message: String?)
    }

    private func settle(_ run: (@escaping (Any?) -> Void, @escaping (String?, String?, Error?) -> Void) -> Void) throws -> Settled {
        let done = expectation(description: "settled")
        var outcome: Settled?
        run({ value in
            if outcome == nil { outcome = .resolved(value); done.fulfill() }
        }, { code, message, _ in
            if outcome == nil { outcome = .rejected(code: code, message: message); done.fulfill() }
        })
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(outcome)
    }

    private func write(_ text: String, to name: String) throws -> String {
        let path = "\(dir)/\(name)"
        try text.write(toFile: path, atomically: true, encoding: .utf8)
        return path
    }

    private func contents(_ path: String) -> String? {
        try? String(contentsOfFile: path, encoding: .utf8)
    }

    // MARK: - `fs.cp` / `fs.mv` onto an existing file: overwrite everywhere

    func testCopyOverwritesAnExistingDestination() throws {
        let src = try write("source", to: "src.txt")
        let dest = try write("destination", to: "dest.txt")

        let outcome = try settle { resolve, reject in
            core.cp(src, dest: dest, resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("cp onto an existing file rejected: \(outcome)")
        }
        XCTAssertEqual(contents(dest), "source", "the destination keeps the source's bytes")
        XCTAssertEqual(contents(src), "source", "the source is left alone")
    }

    func testMoveOverwritesAnExistingDestination() throws {
        let src = try write("source", to: "src.txt")
        let dest = try write("destination", to: "dest.txt")

        let outcome = try settle { resolve, reject in
            core.mv(src, dest: dest, resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("mv onto an existing file rejected: \(outcome)")
        }
        XCTAssertEqual(contents(dest), "source")
        XCTAssertFalse(fm.fileExists(atPath: src), "a move leaves nothing behind")
    }

    /// The overwrite must not paper over a genuinely missing source: that stays
    /// ENOENT, which is what errors-write.cpMissing and mvMissing record.
    func testCopyAndMoveStillRejectWhenTheSourceIsMissing() throws {
        let missing = "\(dir)/missing.txt"

        let copied = try settle { resolve, reject in
            core.cp(missing, dest: "\(dir)/out.txt", resolve: resolve, reject: reject)
        }
        guard case let .rejected(code, _) = copied else {
            return XCTFail("cp of a missing source resolved: \(copied)")
        }
        XCTAssertEqual(code, "ENOENT")

        let moved = try settle { resolve, reject in
            core.mv(missing, dest: "\(dir)/out2.txt", resolve: resolve, reject: reject)
        }
        guard case let .rejected(code2, _) = moved else {
            return XCTFail("mv of a missing source resolved: \(moved)")
        }
        XCTAssertEqual(code2, "ENOENT")
    }

    /// Copying a file onto itself must not destroy it. NSFileManager rejects
    /// this outright; an overwrite implemented as "remove the destination, then
    /// copy" would delete the source first and lose the data.
    func testCopyOntoItselfLeavesTheFileIntact() throws {
        let path = try write("keep me", to: "same.txt")

        _ = try settle { resolve, reject in
            core.cp(path, dest: path, resolve: resolve, reject: reject)
        }

        XCTAssertEqual(contents(path), "keep me", "the file survives whatever the outcome is")
    }

    func testMoveOntoItselfLeavesTheFileIntact() throws {
        let path = try write("keep me", to: "same.txt")

        _ = try settle { resolve, reject in
            core.mv(path, dest: path, resolve: resolve, reject: reject)
        }

        XCTAssertEqual(contents(path), "keep me")
    }

    // MARK: - `session.dispose` with a missing file: resolves everywhere

    func testDisposeResolvesWhenAFileIsAlreadyGone() throws {
        let present = try write("here", to: "present.txt")
        let missing = "\(dir)/never.txt"

        let outcome = try settle { resolve, reject in
            core.removeSession([present, missing], resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("dispose rejected over a missing file: \(outcome)")
        }
        XCTAssertFalse(fm.fileExists(atPath: present), "the files that were there are still removed")
    }

    /// Skipping what is already gone must not turn into skipping everything: a
    /// removal that genuinely fails is still reported.
    func testDisposeStillRejectsWhenARemovalFails() throws {
        let locked = "\(dir)/locked"
        try fm.createDirectory(atPath: locked, withIntermediateDirectories: true)
        try "child".write(toFile: "\(locked)/child.txt", atomically: true, encoding: .utf8)
        try fm.setAttributes([.immutable: true], ofItemAtPath: locked)
        defer { try? fm.setAttributes([.immutable: false], ofItemAtPath: locked) }

        let outcome = try settle { resolve, reject in
            core.removeSession(["\(locked)/child.txt"], resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, _) = outcome else {
            return XCTFail("a failing removal resolved: \(outcome)")
        }
        XCTAssertEqual(code, "EUNSPECIFIED")
    }
}
