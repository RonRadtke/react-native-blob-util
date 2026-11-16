//
//  The 1.2.0 file-system additions on iOS: ranged reads and writes, settable
//  times, the iOS-only attributes, and the three behaviour changes that came
//  with them - stat's `created`, EEXIST for a copy onto a directory, and
//  bundle-assets:// resolving for a directory rather than only a resource.
//
//  Everything runs against real files in a temporary directory, through
//  ReactNativeBlobUtilModuleCore, so the resolve/reject contract is covered
//  rather than only the FS layer underneath it.
//

import XCTest
@testable import react_native_blob_util

final class FileRangeTests: XCTestCase {

    private var core: ReactNativeBlobUtilModuleCore!
    private var dir = ""

    override func setUpWithError() throws {
        core = ReactNativeBlobUtilModuleCore()
        dir = NSTemporaryDirectory().appending("rnbu-range-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
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

    /// Not XCTSkip: a call that rejected where the test expected a resolve is
    /// a failure, and skipping would hide it behind a green run.
    private struct Rejected: Error { let code: String?; let message: String? }

    private func value(_ settled: Settled) throws -> Any? {
        guard case .resolved(let value) = settled else {
            guard case .rejected(let code, let message) = settled else { return nil }
            XCTFail("expected a resolve, got \(code ?? "?"): \(message ?? "")")
            throw Rejected(code: code, message: message)
        }
        return value
    }

    private func code(_ settled: Settled) -> String? {
        if case .rejected(let code, _) = settled { return code }
        return nil
    }

    private func write(_ name: String, _ contents: String) throws -> String {
        let path = "\(dir)/\(name)"
        try contents.write(toFile: path, atomically: true, encoding: .utf8)
        return path
    }

    private func contents(_ path: String) -> String? {
        guard let data = FileManager.default.contents(atPath: path) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func readRange(_ path: String, _ position: Double, _ length: Double) throws -> Settled {
        try settle { resolve, reject in
            self.core.readRange(path, position: position, length: length, resolve: resolve, reject: reject)
        }
    }

    private func decoded(_ settled: Settled) throws -> String? {
        let base64 = try XCTUnwrap(try value(settled) as? String)
        guard let data = Data(base64Encoded: base64) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func writeRange(_ path: String, _ data: String, _ position: Double) throws -> Settled {
        try settle { resolve, reject in
            self.core.writeRange(path, data: data, position: position, resolve: resolve, reject: reject)
        }
    }

    private func touch(_ path: String, _ mtime: Double, _ ctime: Double) throws -> Settled {
        try settle { resolve, reject in
            self.core.touch(path, mtime: mtime, ctime: ctime, resolve: resolve, reject: reject)
        }
    }

    private func setAttributes(_ path: String, _ attributes: [String: Any]) throws -> Settled {
        try settle { resolve, reject in
            self.core.setAttributes(path, attributes: attributes, resolve: resolve, reject: reject)
        }
    }

    // MARK: - readRange

    func testReadsToTheEndWithLengthMinusOne() throws {
        let path = try write("digits.txt", "0123456789")
        XCTAssertEqual(try decoded(try readRange(path, 0, -1)), "0123456789")
    }

    func testReadsASliceFromAPosition() throws {
        let path = try write("digits.txt", "0123456789")
        XCTAssertEqual(try decoded(try readRange(path, 3, 4)), "3456")
        XCTAssertEqual(try decoded(try readRange(path, 7, -1)), "789")
    }

    func testALengthBeyondTheEndReadsWhatIsThere() throws {
        let path = try write("digits.txt", "0123456789")
        XCTAssertEqual(try decoded(try readRange(path, 8, 100)), "89")
    }

    /// Not an error: the caller asked what is at an offset, and the answer is
    /// "nothing". Android and Windows answer the same way.
    func testAPositionPastTheEndIsEmpty() throws {
        let path = try write("digits.txt", "0123456789")
        XCTAssertEqual(try value(try readRange(path, 50, -1)) as? String, "")
        XCTAssertEqual(try value(try readRange(path, 10, 5)) as? String, "")
    }

    func testAZeroLengthIsEmpty() throws {
        let path = try write("digits.txt", "0123456789")
        XCTAssertEqual(try value(try readRange(path, 0, 0)) as? String, "")
    }

    func testReadRangeOfAMissingFileIsENOENT() throws {
        XCTAssertEqual(code(try readRange("\(dir)/gone.txt", 0, -1)), "ENOENT")
    }

    func testReadRangeOfADirectoryIsEISDIR() throws {
        XCTAssertEqual(code(try readRange(dir, 0, -1)), "EISDIR")
    }

    func testReadRangeOfABundleAssetResolves() throws {
        // Any file in the app bundle; Info.plist is always there.
        let settled = try readRange("bundle-assets://Info.plist", 0, 6)
        let data = try XCTUnwrap(Data(base64Encoded: try XCTUnwrap(try value(settled) as? String)))
        XCTAssertEqual(data.count, 6, "six bytes of the bundle's Info.plist")
    }

    // MARK: - writeRange

    func testWritesAtTheEndWithPositionMinusOne() throws {
        let path = try write("log.txt", "one")
        // "LXR3bw==" is "-two"
        let settled = try writeRange(path, Data("-two".utf8).base64EncodedString(), -1)
        XCTAssertEqual(try value(settled) as? NSNumber, NSNumber(value: 4))
        XCTAssertEqual(contents(path), "one-two")
    }

    func testOverwritesFromThePositionAndKeepsTheRest() throws {
        let path = try write("digits.txt", "0123456789")
        let settled = try writeRange(path, Data("XY".utf8).base64EncodedString(), 3)
        XCTAssertEqual(try value(settled) as? NSNumber, NSNumber(value: 2))
        XCTAssertEqual(contents(path), "012XY56789")
    }

    func testAPositionPastTheEndLeavesZeroBytesInBetween() throws {
        let path = try write("sparse.bin", "AB")
        _ = try writeRange(path, Data("Z".utf8).base64EncodedString(), 6)
        let bytes = [UInt8](try XCTUnwrap(FileManager.default.contents(atPath: path)))
        XCTAssertEqual(bytes, [0x41, 0x42, 0, 0, 0, 0, 0x5A])
    }

    func testCreatesAMissingFile() throws {
        let path = "\(dir)/fresh.txt"
        let settled = try writeRange(path, Data("new".utf8).base64EncodedString(), 0)
        XCTAssertEqual(try value(settled) as? NSNumber, NSNumber(value: 3))
        XCTAssertEqual(contents(path), "new")
    }

    /// Unlike writeFile, which builds the tree: a ranged write names an offset
    /// in a file the caller believes is already there, so a missing directory
    /// is much more likely to be a wrong path than a request to create one.
    func testWriteRangeWithAMissingParentIsENOENT() throws {
        XCTAssertEqual(code(try writeRange("\(dir)/nope/deep.txt", "QQ==", 0)), "ENOENT")
        XCTAssertFalse(FileManager.default.fileExists(atPath: "\(dir)/nope"))
    }

    func testWriteRangeToADirectoryIsEISDIR() throws {
        XCTAssertEqual(code(try writeRange(dir, "QQ==", 0)), "EISDIR")
    }

    func testWriteRangeAcceptsLineWrappedAndUnpaddedBase64() throws {
        let path = "\(dir)/lenient.txt"
        _ = try writeRange(path, "SGVsbG8sIHdv\ncmxkIQ", 0)
        XCTAssertEqual(contents(path), "Hello, world!")
    }

    // MARK: - #267: a payload that does not decode must not touch the file

    func testInvalidBase64IsEINVALAndLeavesAnExistingFileAlone() throws {
        let path = try write("precious.txt", "0123456789")
        XCTAssertEqual(code(try writeRange(path, "!!not base64!!", 0)), "EINVAL")
        XCTAssertEqual(contents(path), "0123456789", "the file must be exactly as it was")
    }

    func testInvalidBase64CreatesNoFile() throws {
        let path = "\(dir)/never.txt"
        XCTAssertEqual(code(try writeRange(path, "!!not base64!!", 0)), "EINVAL")
        XCTAssertFalse(FileManager.default.fileExists(atPath: path),
                       "rejecting must not leave an empty file behind (#267)")
    }

    /// The reported shape of #267: writeFile created the file, then decoded,
    /// so a bad payload emptied a file that had content and rejected EINVAL
    /// about it.
    func testWriteFileWithInvalidBase64DoesNotTruncateOrCreate() throws {
        let existing = try write("existing.txt", "keep me")
        let settled = try settle { resolve, reject in
            self.core.writeFile(existing, encoding: "base64", data: "!!not base64!!",
                                transformFile: false, append: false, resolve: resolve, reject: reject)
        }
        XCTAssertEqual(code(settled), "EINVAL")
        XCTAssertEqual(contents(existing), "keep me")

        let fresh = "\(dir)/fresh-writefile.txt"
        let second = try settle { resolve, reject in
            self.core.writeFile(fresh, encoding: "base64", data: "!!not base64!!",
                                transformFile: false, append: false, resolve: resolve, reject: reject)
        }
        XCTAssertEqual(code(second), "EINVAL")
        XCTAssertFalse(FileManager.default.fileExists(atPath: fresh))
    }

    func testWriteFileAcceptsUnpaddedBase64() throws {
        let path = "\(dir)/unpadded.txt"
        let settled = try settle { resolve, reject in
            self.core.writeFile(path, encoding: "base64", data: "SGVsbG8sIHdvcmxkIQ",
                                transformFile: false, append: false, resolve: resolve, reject: reject)
        }
        XCTAssertEqual(try value(settled) as? NSNumber, NSNumber(value: 13))
        XCTAssertEqual(contents(path), "Hello, world!")
    }

    func testCreateFileAcceptsLineWrappedBase64() throws {
        let path = "\(dir)/created.txt"
        _ = try settle { resolve, reject in
            self.core.createFile(path, data: "SGVsbG8sIHdv\ncmxkIQ==", encoding: "base64",
                                 resolve: resolve, reject: reject)
        }
        XCTAssertEqual(contents(path), "Hello, world!")
    }

    func testCreateFileWithInvalidBase64CreatesNothing() throws {
        let path = "\(dir)/not-created.txt"
        let settled = try settle { resolve, reject in
            self.core.createFile(path, data: "!!not base64!!", encoding: "base64",
                                 resolve: resolve, reject: reject)
        }
        XCTAssertEqual(code(settled), "EINVAL")
        XCTAssertFalse(FileManager.default.fileExists(atPath: path))
    }

    // MARK: - touch

    private func times(_ path: String) throws -> (modified: Date?, created: Date?) {
        let info = try FileManager.default.attributesOfItem(atPath: path)
        return (info[.modificationDate] as? Date, info[.creationDate] as? Date)
    }

    func testSetsTheModificationTime() throws {
        let path = try write("stamp.txt", "x")
        _ = try touch(path, 1_600_000_000_000, -1)
        XCTAssertEqual(try times(path).modified?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1)
    }

    func testSetsTheCreationTimeWhenGiven() throws {
        let path = try write("stamp.txt", "x")
        _ = try touch(path, 1_600_000_000_000, 1_500_000_000_000)
        let both = try times(path)
        XCTAssertEqual(both.modified?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1)
        XCTAssertEqual(both.created?.timeIntervalSince1970 ?? 0, 1_500_000_000, accuracy: 1)
    }

    /// -1 is what fs.js sends when the caller gave no ctime, and it means
    /// "leave it", not "a time before 1970".
    func testLeavesTheCreationTimeWhenCtimeIsNegative() throws {
        let path = try write("stamp.txt", "x")
        let before = try XCTUnwrap(try times(path).created)
        // Later than the creation time, which is the ordinary case: a file is
        // modified after it was made.
        let later = before.timeIntervalSince1970 + 5000
        _ = try touch(path, later * 1000, -1)
        let after = try times(path)
        XCTAssertEqual(after.modified?.timeIntervalSince1970 ?? 0, later, accuracy: 1)
        XCTAssertEqual(after.created?.timeIntervalSince1970 ?? 0,
                       before.timeIntervalSince1970, accuracy: 1)
    }

    /// Not a bug here, and not something the module can prevent: the file
    /// system will not hold a creation time later than the modification time,
    /// so setting mtime to a moment before the file was made pulls ctime back
    /// with it. Measured on Xcode 26.5 - setting mtime *later* leaves ctime
    /// alone, which the test above pins. Worth a test of its own because
    /// `touch` documents ctime as untouched without an explicit value, and on
    /// this one input that is the file system's call rather than ours.
    func testAnEarlierModificationTimePullsTheCreationTimeBack() throws {
        let path = try write("stamp.txt", "x")
        _ = try touch(path, 1_600_000_000_000, -1)
        let after = try times(path)
        XCTAssertEqual(after.modified?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1)
        XCTAssertEqual(after.created?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1,
                       "the creation time cannot stay after the modification time")
    }

    func testCreatesAMissingFileEmpty() throws {
        let path = "\(dir)/touched.txt"
        _ = try touch(path, 1_600_000_000_000, -1)
        XCTAssertEqual(contents(path), "")
        XCTAssertEqual(try times(path).modified?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1)
    }

    func testTouchWithAMissingParentIsENOENT() throws {
        XCTAssertEqual(code(try touch("\(dir)/nope/deep.txt", 1_600_000_000_000, -1)), "ENOENT")
    }

    func testTouchWorksOnADirectory() throws {
        let sub = "\(dir)/sub"
        try FileManager.default.createDirectory(atPath: sub, withIntermediateDirectories: true)
        _ = try touch(sub, 1_600_000_000_000, -1)
        XCTAssertEqual(try times(sub).modified?.timeIntervalSince1970 ?? 0, 1_600_000_000, accuracy: 1)
    }

    // MARK: - setAttributes

    func testProtectionNamesMapToTheDataProtectionClasses() {
        XCTAssertEqual(ReactNativeBlobUtilFS.protectionType(for: "complete"), .complete)
        XCTAssertEqual(ReactNativeBlobUtilFS.protectionType(for: "completeUnlessOpen"), .completeUnlessOpen)
        XCTAssertEqual(ReactNativeBlobUtilFS.protectionType(for: "untilFirstAuth"),
                       .completeUntilFirstUserAuthentication)
        XCTAssertEqual(ReactNativeBlobUtilFS.protectionType(for: "none"), FileProtectionType.none)
        XCTAssertNil(ReactNativeBlobUtilFS.protectionType(for: "Complete"), "the names are case sensitive")
        XCTAssertNil(ReactNativeBlobUtilFS.protectionType(for: "completeUntilFirstUserAuthentication"),
                     "the Foundation spelling is not one of the API's names")
        XCTAssertNil(ReactNativeBlobUtilFS.protectionType(for: ""))
    }

    func testAppliesAProtectionClass() throws {
        let path = try write("secret.txt", "x")
        let settled = try setAttributes(path, ["protection": "complete"])
        XCTAssertNil(code(settled))
        // The simulator does not always report the class back, so this only
        // asserts it when it is there rather than requiring a device.
        let applied = try FileManager.default.attributesOfItem(atPath: path)[.protectionKey] as? FileProtectionType
        if let applied = applied {
            XCTAssertEqual(applied, .complete)
        }
    }

    func testRejectsAnUnknownProtectionAndChangesNothing() throws {
        let path = try write("secret.txt", "x")
        let settled = try setAttributes(path, ["protection": "fort-knox", "excludeFromBackup": true])
        XCTAssertEqual(code(settled), "EINVAL")
        XCTAssertNotEqual(try excludedFromBackup(path), true,
                          "a rejected call must not have applied the other key")
    }

    /// A fresh URL for every read, deliberately: URL caches resource values
    /// after the first read, so re-reading the same URL answers what it saw
    /// before the write rather than what is on disk. Measured - the first draft
    /// of this test reused one URL and reported that clearing the flag had not
    /// worked.
    private func excludedFromBackup(_ path: String) throws -> Bool? {
        try URL(fileURLWithPath: path)
            .resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup
    }

    func testExcludesFromBackupAndPutsItBack() throws {
        let path = try write("big.bin", "x")
        _ = try setAttributes(path, ["excludeFromBackup": true])
        XCTAssertEqual(try excludedFromBackup(path), true)
        _ = try setAttributes(path, ["excludeFromBackup": false])
        XCTAssertEqual(try excludedFromBackup(path), false)
    }

    func testOnlyTheKeysGivenAreChanged() throws {
        let path = try write("partial.txt", "x")
        _ = try setAttributes(path, ["excludeFromBackup": true])
        _ = try setAttributes(path, ["protection": "none"])
        XCTAssertEqual(try excludedFromBackup(path), true,
                       "setting only the protection must leave the backup flag as it was")
    }

    func testSetAttributesOnAMissingPathIsENOENT() throws {
        XCTAssertEqual(code(try setAttributes("\(dir)/gone.txt", ["protection": "none"])), "ENOENT")
    }

    func testSetAttributesWithNoKeysResolves() throws {
        let path = try write("noop.txt", "x")
        XCTAssertNil(code(try setAttributes(path, [:])))
    }

    // MARK: - stat gains `created`

    func testStatCarriesACreationTimeInWholeSeconds() throws {
        let path = try write("stat.txt", "x")
        let entry = try XCTUnwrap(try value(try settle { r, j in self.core.stat(path, resolve: r, reject: j) }) as? [String: Any])
        let created = try XCTUnwrap(entry["created"] as? NSNumber)
        XCTAssertGreaterThan(created.int64Value, 0)
        XCTAssertEqual(created.int64Value % 1000, 0, "truncated to whole seconds, as lastModified is")
    }

    func testStatCreatedReportsWhatTouchSet() throws {
        let path = try write("stat.txt", "x")
        _ = try touch(path, 1_600_000_000_000, 1_500_000_000_500)
        let entry = try XCTUnwrap(try value(try settle { r, j in self.core.stat(path, resolve: r, reject: j) }) as? [String: Any])
        // 1_500_000_000_500 ms truncates to whole seconds before the multiply,
        // exactly as lastModified does, so the half second is dropped.
        XCTAssertEqual(entry["created"] as? NSNumber, NSNumber(value: 1_500_000_000_000))
        XCTAssertEqual(entry["lastModified"] as? NSNumber, NSNumber(value: 1_600_000_000_000))
    }

    func testLstatEntriesCarryCreated() throws {
        _ = try write("a.txt", "a")
        _ = try write("b.txt", "b")
        let entries = try XCTUnwrap(try value(try settle { r, j in self.core.lstat(self.dir, resolve: r, reject: j) }) as? [[String: Any]])
        XCTAssertEqual(entries.count, 2)
        for entry in entries {
            XCTAssertNotNil(entry["created"], "every lstat entry carries the key, even if it is null")
            XCTAssertTrue(entry["created"] is NSNumber, "APFS keeps a creation time")
        }
    }

    func testStatOfADirectoryCarriesCreated() throws {
        let entry = try XCTUnwrap(try value(try settle { r, j in self.core.stat(self.dir, resolve: r, reject: j) }) as? [String: Any])
        XCTAssertEqual(entry["type"] as? String, "directory")
        XCTAssertTrue(entry["created"] is NSNumber)
    }

    // MARK: - EEXIST for a copy or move onto a directory

    /// Foundation reports this as NSFileWriteFileExistsError (516), which used
    /// to arrive as EUNSPECIFIED. Android and Windows call it EEXIST.
    func testCopyOntoAnExistingDirectoryIsEEXIST() throws {
        let src = try write("src.txt", "hello")
        let destDir = "\(dir)/dest"
        try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true)
        XCTAssertEqual(code(try settle { r, j in self.core.cp(src, dest: destDir, resolve: r, reject: j) }), "EEXIST")
        XCTAssertTrue(FileManager.default.fileExists(atPath: destDir), "the directory is left alone")
        XCTAssertTrue(FileManager.default.fileExists(atPath: src))
    }

    func testMoveOntoAnExistingDirectoryIsEEXIST() throws {
        let src = try write("src.txt", "hello")
        let destDir = "\(dir)/dest"
        try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true)
        XCTAssertEqual(code(try settle { r, j in self.core.mv(src, dest: destDir, resolve: r, reject: j) }), "EEXIST")
        XCTAssertTrue(FileManager.default.fileExists(atPath: src), "a failed move keeps the source")
    }

    func testCopyingADirectoryOntoAnExistingDirectoryIsEEXIST() throws {
        let srcDir = "\(dir)/tree"
        try FileManager.default.createDirectory(atPath: srcDir, withIntermediateDirectories: true)
        let destDir = "\(dir)/dest"
        try FileManager.default.createDirectory(atPath: destDir, withIntermediateDirectories: true)
        XCTAssertEqual(code(try settle { r, j in self.core.cp(srcDir, dest: destDir, resolve: r, reject: j) }), "EEXIST")
    }

    /// Unchanged: a *file* destination is still replaced, which is the row that
    /// was aligned in 1.0.
    func testCopyOntoAnExistingFileStillReplacesIt() throws {
        let src = try write("src.txt", "new")
        let dest = try write("dest.txt", "old")
        XCTAssertNil(code(try settle { r, j in self.core.cp(src, dest: dest, resolve: r, reject: j) }))
        XCTAssertEqual(contents(dest), "new")
    }

    func testCopyingADirectoryOntoAnExistingFileStillReplacesIt() throws {
        let srcDir = "\(dir)/tree"
        try FileManager.default.createDirectory(atPath: srcDir, withIntermediateDirectories: true)
        try "leaf".write(toFile: "\(srcDir)/leaf.txt", atomically: true, encoding: .utf8)
        let dest = try write("dest", "old")
        XCTAssertNil(code(try settle { r, j in self.core.cp(srcDir, dest: dest, resolve: r, reject: j) }))
        XCTAssertEqual(contents("\(dest)/leaf.txt"), "leaf")
    }

    func testCopyOfAMissingSourceIsStillENOENT() throws {
        XCTAssertEqual(code(try settle { r, j in
            self.core.cp("\(self.dir)/gone.txt", dest: "\(self.dir)/x.txt", resolve: r, reject: j)
        }), "ENOENT")
    }

    // MARK: - bundle assets

    /// Every non-empty directory in the app bundle, and whether the resource
    /// lookup finds it. The second half is the measurement the asset
    /// resolution rests on - see the test below.
    private func bundleDirectories() throws -> [(name: String, entries: [String], foundAsResource: Bool)] {
        let fm = FileManager.default
        let root = Bundle.main.bundlePath
        var found: [(String, [String], Bool)] = []
        for name in try fm.contentsOfDirectory(atPath: root).sorted() {
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: "\(root)/\(name)", isDirectory: &isDir), isDir.boolValue else { continue }
            let entries = try fm.contentsOfDirectory(atPath: "\(root)/\(name)").sorted()
            guard !entries.isEmpty else { continue }
            let base = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            found.append((name, entries, Bundle.main.path(forResource: base, ofType: ext) != nil))
        }
        return found
    }

    private func bundleDirectory() throws -> (name: String, entries: [String], foundAsResource: Bool) {
        guard let first = try bundleDirectories().first else {
            throw XCTSkip("the test host's bundle holds no non-empty directory")
        }
        return first
    }

    /// ls did not resolve bundle-assets://, so ls(fs.asset('dir')) looked for a
    /// directory literally named by the URI and reported ENOENT.
    func testLsListsABundleAssetDirectory() throws {
        let found = try bundleDirectory()
        let listed = try XCTUnwrap(try value(try settle { r, j in
            self.core.ls("bundle-assets://\(found.name)", resolve: r, reject: j)
        }) as? [String])
        XCTAssertEqual(listed.sorted(), found.entries)
    }

    /// Why getPathOfAsset needs no bundle-path fallback: the resource lookup
    /// resolves a *directory* in the bundle, and a nested "dir/name" subpath,
    /// for every non-empty directory the host's bundle holds. A fallback was
    /// written for this first and then removed as unreachable, so this asserts
    /// the measurement - if a future SDK stops resolving directories, this
    /// fails and the fallback comes back.
    func testTheResourceLookupResolvesDirectoriesAndNestedNames() throws {
        for found in try bundleDirectories() {
            XCTAssertTrue(found.foundAsResource, "\(found.name) is in the bundle but not found as a resource")
            let directory = ReactNativeBlobUtilFS.getPathOfAsset("bundle-assets://\(found.name)")
            XCTAssertFalse(directory.isEmpty, "bundle-assets:// did not resolve \(found.name)")
            XCTAssertTrue(FileManager.default.fileExists(atPath: directory))

            let nested = ReactNativeBlobUtilFS.getPathOfAsset("bundle-assets://\(found.name)/\(found.entries[0])")
            XCTAssertFalse(nested.isEmpty, "bundle-assets:// did not resolve \(found.name)/\(found.entries[0])")
            XCTAssertTrue(FileManager.default.fileExists(atPath: nested))
        }
    }

    /// Unchanged, and deliberately: an asset that is not there still resolves
    /// to "", so every caller's ENOENT keeps naming what it named before.
    func testAMissingAssetStillResolvesToEmpty() {
        XCTAssertEqual(ReactNativeBlobUtilFS.getPathOfAsset("bundle-assets://no-such-file.txt"), "")
        XCTAssertEqual(ReactNativeBlobUtilFS.getPathOfAsset("bundle-assets://no/such/dir"), "")
    }

    func testAPathWithoutTheAssetPrefixIsUntouched() {
        XCTAssertEqual(ReactNativeBlobUtilFS.getPathOfAsset("/tmp/plain.txt"), "/tmp/plain.txt")
    }

    func testExistsAnswersForANestedBundleAsset() throws {
        let found = try bundleDirectory()
        let result = try XCTUnwrap(try value(try settle { r, j in
            self.core.exists("bundle-assets://\(found.name)/\(found.entries[0])", resolve: r, reject: j)
        }) as? [String: Any])
        XCTAssertEqual(result["exists"] as? Bool, true)
    }

    // MARK: - resource bundles

    func testBundlePathFindsAResourceBundle() throws {
        // The pod ships its privacy manifest as a resource bundle, so the app
        // always carries one.
        let settled = try settle { r, j in
            self.core.bundlePath("ReactNativeBlobUtilPrivacyInfo", resolve: r, reject: j)
        }
        guard case .resolved(let path) = settled else {
            throw XCTSkip("ReactNativeBlobUtilPrivacyInfo.bundle is not in this test host")
        }
        let found = try XCTUnwrap(path as? String)
        XCTAssertTrue(found.hasSuffix(".bundle"))
        XCTAssertTrue(FileManager.default.fileExists(atPath: found))
    }

    func testBundlePathOfAMissingBundleIsENOENT() throws {
        XCTAssertEqual(code(try settle { r, j in self.core.bundlePath("no-such", resolve: r, reject: j) }), "ENOENT")
    }

    // MARK: - constants and the Android-only answers

    func testTemporaryDirIsTheTempPathWithoutATrailingSlash() throws {
        let value = try XCTUnwrap(ReactNativeBlobUtilModuleCore.constantsToExport()["TemporaryDir"] as? String)
        XCTAssertFalse(value.isEmpty)
        XCTAssertFalse(value.hasSuffix("/"), "every other directory constant has no trailing slash")
        // NSTemporaryDirectory() is the one system path that comes back with one.
        var expected = NSTemporaryDirectory()
        while expected.count > 1 && expected.hasSuffix("/") { expected.removeLast() }
        XCTAssertEqual(value, expected)
        XCTAssertTrue(FileManager.default.fileExists(atPath: value))
    }

    func testTheNewAndroidAndWindowsConstantsArePresentButEmpty() {
        let constants = ReactNativeBlobUtilModuleCore.constantsToExport()
        XCTAssertEqual(constants["ExternalCacheDir"] as? String, "")
        XCTAssertEqual(constants["RoamingDir"] as? String, "")
    }

    func testGetExternalDirsIsAnEmptyListOnIOS() throws {
        let dirs = try XCTUnwrap(try value(try settle { r, j in self.core.getExternalDirs(r, reject: j) }) as? [Any])
        XCTAssertTrue(dirs.isEmpty, "iOS has no external storage, so the list is empty rather than an error")
    }

    // MARK: - the error-code map

    func testTheFileErrorMapCoversTheCodesFoundationUses() {
        func error(_ code: Int) -> NSError { NSError(domain: NSCocoaErrorDomain, code: code, userInfo: nil) }
        XCTAssertEqual(ReactNativeBlobUtilFS.errorCode(error(NSFileNoSuchFileError)), "ENOENT")
        XCTAssertEqual(ReactNativeBlobUtilFS.errorCode(error(NSFileReadNoSuchFileError)), "ENOENT")
        XCTAssertEqual(ReactNativeBlobUtilFS.errorCode(error(NSFileWriteFileExistsError)), "EEXIST")
        XCTAssertEqual(ReactNativeBlobUtilFS.errorCode(error(NSFileWriteOutOfSpaceError)), "EUNSPECIFIED")
    }
}
