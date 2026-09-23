//
//  Pins ReactNativeBlobUtilFS before it is ported to Swift, the way
//  045d09a pinned the Android utility classes before 46f7fff ported them.
//
//  These assert what the Objective-C does *today*, including the parts that
//  disagree with Android - tests/e2e/appium/parity/ios.json records those
//  differences deliberately, and the port has to keep them. Where a value is
//  odd rather than wrong, the assertion says so.
//
//  Everything here is reached through the test target's bridging header,
//  because the class is still Objective-C. After the port these switch to
//  `@testable import react_native_blob_util` and the assertions stay put.
//

import XCTest
@testable import react_native_blob_util

final class FileSystemPinTests: XCTestCase {

    private var dir = ""

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory().appending("rnbu-fs-pin-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    // MARK: - helpers

    private enum Settled {
        case resolved(Any?)
        case rejected(code: String?, message: String?)
    }

    /// Drives a resolver/rejecter pair and returns whichever fired.
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

    /// Drives an RCTResponseSenderBlock-style callback and returns its arguments.
    /// RCTResponseSenderBlock bridges into Swift as ([Any]?) -> Void - the array
    /// itself is optional, not just its elements.
    private func callback(_ run: (@escaping ([Any]?) -> Void) -> Void) throws -> [Any] {
        let done = expectation(description: "callback")
        var args: [Any]?
        var fired = false
        run({ values in
            if !fired { fired = true; args = values; done.fulfill() }
        })
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(args)
    }

    private func write(_ text: String, _ name: String) throws -> String {
        let path = "\(dir)/\(name)"
        try text.write(toFile: path, atomically: true, encoding: .utf8)
        return path
    }

    private func rejection(_ s: Settled) -> (code: String?, message: String?)? {
        if case .rejected(let code, let message) = s { return (code, message) }
        return nil
    }

    // MARK: - mkdir

    func testMkdirResolvesTrue() throws {
        let target = "\(dir)/made"
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.mkdir(target, resolver: resolve, rejecter: reject)
        }
        guard case .resolved(let value) = result else { return XCTFail("expected resolve, got \(result)") }
        XCTAssertEqual(value as? Bool, true)
        XCTAssertTrue(FileManager.default.fileExists(atPath: target))
    }

    func testMkdirOnAnExistingDirectoryRejectsEEXIST() throws {
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.mkdir(self.dir, resolver: resolve, rejecter: reject)
        }
        let error = try XCTUnwrap(rejection(result))
        XCTAssertEqual(error.code, "EEXIST")
        // "Directory" for a directory, "File" for a file - the word is chosen
        // from what is actually there.
        XCTAssertEqual(error.message, "Directory '\(dir)' already exists")
    }

    func testMkdirOnAnExistingFileRejectsEEXISTSayingFile() throws {
        let path = try write("x", "file.txt")
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.mkdir(path, resolver: resolve, rejecter: reject)
        }
        let error = try XCTUnwrap(rejection(result))
        XCTAssertEqual(error.code, "EEXIST")
        XCTAssertEqual(error.message, "File '\(path)' already exists")
    }

    // MARK: - exists

    func testExistsPassesTwoBooleansForAFile() throws {
        let path = try write("x", "a.txt")
        let args = try callback { done in ReactNativeBlobUtilFS.exists(path, callback: done) }
        XCTAssertEqual(args.count, 2)
        XCTAssertEqual(args[0] as? Bool, true)
        XCTAssertEqual(args[1] as? Bool, false, "a file is not a directory")
    }

    func testExistsReportsADirectory() throws {
        let args = try callback { done in ReactNativeBlobUtilFS.exists(self.dir, callback: done) }
        XCTAssertEqual(args[0] as? Bool, true)
        XCTAssertEqual(args[1] as? Bool, true)
    }

    func testExistsReportsAMissingPathAsTwoFalses() throws {
        let args = try callback { done in ReactNativeBlobUtilFS.exists("\(self.dir)/nope", callback: done) }
        XCTAssertEqual(args[0] as? Bool, false)
        XCTAssertEqual(args[1] as? Bool, false)
    }

    // MARK: - stat and df

    func testStatKeysAndTypes() throws {
        let path = try write("stat", "s.txt")
        // An explicit error pointer, not `throws`: the Objective-C could return
        // nil without setting the error, and a value while setting it, neither
        // of which a throwing method can express. The callers check the error
        // rather than the result, so that distinction has to survive.
        let stat = try XCTUnwrap(ReactNativeBlobUtilFS.stat(path, error: nil))
        XCTAssertEqual(Set(stat.keys.compactMap { $0 as? String }),
                       ["size", "filename", "path", "lastModified", "type"])
        // size is a string here. fs.js parseInts it before resolving, so callers
        // see a number - but the native layer really does hand back "%llu".
        XCTAssertTrue(stat["size"] is String, "size is a string at the native boundary")
        XCTAssertEqual(stat["size"] as? String, "4")
        // lastModified, unlike size, is already a number.
        XCTAssertTrue(stat["lastModified"] is NSNumber, "lastModified is a number, not a string")
        XCTAssertEqual(stat["filename"] as? String, "s.txt")
        XCTAssertEqual(stat["path"] as? String, path)
        XCTAssertEqual(stat["type"] as? String, "file")
    }

    func testStatOnADirectoryReportsTypeDirectory() throws {
        let stat = try XCTUnwrap(ReactNativeBlobUtilFS.stat(dir, error: nil))
        XCTAssertEqual(stat["type"] as? String, "directory")
    }

    /// A missing path returns nil and leaves the error untouched. lstat relies
    /// on exactly this: it checks the error, not the result.
    func testStatOnAMissingPathReturnsNilWithoutSettingTheError() {
        var error: NSError?
        XCTAssertNil(ReactNativeBlobUtilFS.stat("\(dir)/missing", error: &error))
        XCTAssertNil(error, "a missing path is not an error as far as this method is concerned")
    }

    /// The Objective-C cast to time_t before multiplying, so the milliseconds
    /// always end in 000. "Improving" the precision moves ios.json.
    func testStatLastModifiedIsTruncatedToWholeSeconds() throws {
        let path = try write("t", "when.txt")
        let stat = try XCTUnwrap(ReactNativeBlobUtilFS.stat(path, error: nil))
        let millis = try XCTUnwrap((stat["lastModified"] as? NSNumber)?.int64Value)
        XCTAssertGreaterThan(millis, 0)
        XCTAssertEqual(millis % 1000, 0, "seconds are truncated before the multiply")
    }

    func testDfReportsFreeAndTotal() throws {
        let args = try callback { done in ReactNativeBlobUtilFS.df(done) }
        XCTAssertEqual(args.count, 2)
        XCTAssertTrue(args[0] is NSNull, "the first argument is the error slot")
        let usage = try XCTUnwrap(args[1] as? [String: Any])
        XCTAssertEqual(Set(usage.keys), ["free", "total"])
        XCTAssertTrue(usage["free"] is NSNumber)
        XCTAssertTrue(usage["total"] is NSNumber)
    }

    // MARK: - temp path

    func testGetTempPathPutsFilesInTheirOwnSubdirectory() throws {
        // The header carries no nullability annotations, so everything it
        // returns arrives in Swift as an optional.
        let path = try XCTUnwrap(ReactNativeBlobUtilFS.getTempPath("task-1", withExtension: "bin"))
        XCTAssertTrue(path.contains("/ReactNativeBlobUtil_tmp/"),
                      "iOS nests temp files in ReactNativeBlobUtil_tmp; Android does not. ios.json records it.")
        XCTAssertTrue(path.hasSuffix("/ReactNativeBlobUtil_tmp/ReactNativeBlobUtilTmp_task-1.bin"), path)
        // Application Support, not Documents: Documents is backed up to iCloud and
        // shown in the Files app.
        let support = NSSearchPathForDirectoriesInDomains(.applicationSupportDirectory, .userDomainMask, true)[0]
        XCTAssertTrue(path.hasPrefix(support), path)
        XCTAssertFalse(path.contains("/Documents/"), path)
    }

    func testGetTempPathWithoutAnExtension() throws {
        let path = try XCTUnwrap(ReactNativeBlobUtilFS.getTempPath("task-2", withExtension: nil))
        XCTAssertTrue(path.hasSuffix("/ReactNativeBlobUtil_tmp/ReactNativeBlobUtilTmp_task-2"), path)
    }

    // MARK: - writeFile

    /// readFile's completion block is (NSData?, String?, String?) - content,
    /// error code, error message.
    private func readFile(_ path: String, _ encoding: String?, transform: Bool = false) throws -> (Any?, String?, String?) {
        let done = expectation(description: "readFile")
        var out: (Any?, String?, String?)?
        var fired = false
        ReactNativeBlobUtilFS.readFile(path, encoding: encoding, transformFile: transform) { data, code, message in
            if !fired { fired = true; out = (data, code, message); done.fulfill() }
        }
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(out)
    }

    func testWriteFileUtf8ResolvesTheByteCount() throws {
        let path = "\(dir)/w.txt"
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile(path, encoding: "utf8", data: "hello",
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        guard case .resolved(let value) = result else { return XCTFail("expected resolve, got \(result)") }
        XCTAssertEqual((value as? NSNumber)?.intValue, 5)
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "hello")
    }

    func testWriteFileBase64Decodes() throws {
        let path = "\(dir)/b.bin"
        _ = try settle { resolve, reject in
            // "abc" in base64.
            ReactNativeBlobUtilFS.writeFile(path, encoding: "base64", data: "YWJj",
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "abc")
    }

    func testWriteFileRejectsInvalidBase64WithEINVAL() throws {
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile("\(self.dir)/bad.bin", encoding: "base64", data: "@@@@",
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        let error = try XCTUnwrap(rejection(result))
        XCTAssertEqual(error.code, "EINVAL")
        XCTAssertEqual(error.message, "Data for '\(dir)/bad.bin' is not valid base64")
    }

    func testWriteFileAppends() throws {
        let path = try write("one", "app.txt")
        _ = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile(path, encoding: "utf8", data: "-two",
                                            transformFile: false, append: true,
                                            resolver: resolve, rejecter: reject)
        }
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "one-two")
    }

    func testWriteFileCreatesMissingParentDirectories() throws {
        let path = "\(dir)/deep/deeper/w.txt"
        _ = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile(path, encoding: "utf8", data: "x",
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        XCTAssertTrue(FileManager.default.fileExists(atPath: path))
    }

    func testWriteFileOntoADirectoryRejectsEISDIR() throws {
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile(self.dir, encoding: "utf8", data: "x",
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        let error = try XCTUnwrap(rejection(result))
        // Android rejects ENOENT here; ios.json records the difference.
        XCTAssertEqual(error.code, "EISDIR")
        XCTAssertEqual(error.message, "Expecting a file but '\(dir)' is a directory")
    }

    func testWriteFileUriCopiesFromAnotherFile() throws {
        let source = try write("copied", "src.txt")
        let dest = "\(dir)/dest.txt"
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFile(dest, encoding: "uri", data: source,
                                            transformFile: false, append: false,
                                            resolver: resolve, rejecter: reject)
        }
        guard case .resolved(let value) = result else { return XCTFail("expected resolve, got \(result)") }
        XCTAssertEqual((value as? NSNumber)?.intValue, 6)
        XCTAssertEqual(try String(contentsOfFile: dest, encoding: .utf8), "copied")
    }

    // MARK: - writeFileArray

    func testWriteFileArrayWritesRawBytes() throws {
        let path = "\(dir)/arr.bin"
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.writeFileArray(path, data: [97, 98, 99], append: false,
                                                 resolver: resolve, rejecter: reject)
        }
        guard case .resolved(let value) = result else { return XCTFail("expected resolve, got \(result)") }
        XCTAssertEqual((value as? NSNumber)?.intValue, 3, "resolves the element count")
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), "abc")
    }

    // MARK: - readFile

    func testReadFileUtf8ReturnsTheBytes() throws {
        let path = try write("hello", "r.txt")
        let (data, code, message) = try readFile(path, "utf8")
        XCTAssertNil(code); XCTAssertNil(message)
        XCTAssertEqual(String(data: try XCTUnwrap(data as? Data), encoding: .utf8), "hello")
    }

    func testReadFileWithoutAnEncodingReturnsTheBytes() throws {
        let path = try write("hello", "r2.txt")
        let (data, _, _) = try readFile(path, nil)
        XCTAssertEqual(String(data: try XCTUnwrap(data as? Data), encoding: .utf8), "hello")
    }

    /// The base64 branch round-trips through a base64 string and hands back the
    /// decoded bytes again, so the result equals the original content.
    func testReadFileBase64RoundTripsToTheSameBytes() throws {
        let path = try write("hello", "r3.txt")
        let (data, _, _) = try readFile(path, "base64")
        XCTAssertEqual(String(data: try XCTUnwrap(data as? Data), encoding: .utf8), "hello")
    }

    func testReadFileMissingRejectsENOENT() throws {
        let (data, code, message) = try readFile("\(dir)/missing.txt", "utf8")
        XCTAssertNil(data)
        XCTAssertEqual(code, "ENOENT")
        XCTAssertEqual(message, "No such file '\(dir)/missing.txt'")
    }

    func testReadFileWithTransformButNoTransformerFails() throws {
        let path = try write("hello", "r4.txt")
        let (_, code, message) = try readFile(path, "utf8", transform: true)
        XCTAssertEqual(code, "EUNSPECIFIED")
        XCTAssertEqual(message, "Transform specified but transformer not set")
    }

    // MARK: - slice

    func testSliceCopiesTheRequestedRange() throws {
        let source = try write("abcdefghij", "letters.txt")
        let dest = "\(dir)/slice.txt"
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.slice(source, dest: dest, start: 2, end: 5, encode: "",
                                        resolver: resolve, rejecter: reject)
        }
        guard case .resolved(let value) = result else { return XCTFail("expected resolve, got \(result)") }
        XCTAssertEqual(value as? String, dest, "slice resolves the destination path")
        XCTAssertEqual(try String(contentsOfFile: dest, encoding: .utf8), "cde")
    }

    func testSliceClampsPastTheEndOfTheFile() throws {
        let source = try write("abcdefghij", "letters2.txt")
        let dest = "\(dir)/slice2.txt"
        _ = try settle { resolve, reject in
            ReactNativeBlobUtilFS.slice(source, dest: dest, start: 5, end: 100, encode: "",
                                        resolver: resolve, rejecter: reject)
        }
        XCTAssertEqual(try String(contentsOfFile: dest, encoding: .utf8), "fghij")
    }

    func testSliceOfAMissingFileRejectsENOENT() throws {
        let result = try settle { resolve, reject in
            ReactNativeBlobUtilFS.slice("\(self.dir)/missing.txt", dest: "\(self.dir)/out.txt",
                                        start: 0, end: 1, encode: "",
                                        resolver: resolve, rejecter: reject)
        }
        let error = try XCTUnwrap(rejection(result))
        XCTAssertEqual(error.code, "ENOENT")
    }

    // MARK: - readFile, ascii

    /// The ascii branch builds an NSMutableArray of per-byte NSNumbers and passes
    /// it through a block declared as taking NSData. Objective-C tolerates that
    /// and ReactNativeBlobUtil.mm casts it straight back to an array; a Swift
    /// closure cannot be handed it at all, because the bridging thunk sends
    /// -_bridgingCopy:length: to the array and raises NSInvalidArgumentException.
    ///
    /// The port changed that signature to `Any?`, so this now calls the Swift
    /// method directly and the Objective-C shim the pin commit needed is gone.
    func testReadFileAsciiReturnsAnArrayOfBytesNotData() throws {
        let path = try write("abc", "ascii.txt")
        let (content, _, _) = try readFile(path, "ascii")

        let bytes = try XCTUnwrap(content as? [NSNumber],
                                  "ascii yields an array of per-byte numbers, despite the NSData declaration")
        XCTAssertEqual(bytes.map { $0.int8Value }, [97, 98, 99], "\"abc\"")
        XCTAssertFalse(content is Data, "it is emphatically not Data")
    }

    /// The same array-shaped result is what a signed byte looks like: the branch
    /// uses numberWithChar:, so bytes above 0x7f arrive negative.
    func testReadFileAsciiReportsHighBytesAsNegativeNumbers() throws {
        let path = "\(dir)/high.bin"
        try Data([0x00, 0x7f, 0x80, 0xff]).write(to: URL(fileURLWithPath: path))
        let (content, _, _) = try readFile(path, "ascii")

        let bytes = try XCTUnwrap(content as? [NSNumber])
        XCTAssertEqual(bytes.map { $0.int8Value }, [0, 127, -128, -1],
                       "numberWithChar: keeps the sign; JS sees negative values for bytes above 0x7f")
    }
}
