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

    // MARK: - `fs.readFile` on a directory: EISDIR

    func testReadFileOnADirectoryRejectsEISDIR() throws {
        let outcome = try settle { resolve, reject in
            core.readFile(dir, encoding: "utf8", transformFile: false, resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, message) = outcome else {
            return XCTFail("reading a directory resolved: \(outcome)")
        }
        XCTAssertEqual(code, "EISDIR")
        XCTAssertEqual(message, "Expecting a file but '\(dir)' is a directory")
    }

    /// The directory check must not swallow the missing-file case, which shares
    /// the same fileExists call and reports a different code.
    func testReadFileOfAMissingPathStillRejectsENOENT() throws {
        let missing = "\(dir)/missing.txt"
        let outcome = try settle { resolve, reject in
            core.readFile(missing, encoding: "utf8", transformFile: false, resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, message) = outcome else {
            return XCTFail("reading a missing file resolved: \(outcome)")
        }
        XCTAssertEqual(code, "ENOENT")
        XCTAssertEqual(message, "No such file '\(missing)'")
    }

    func testReadFileOfARealFileStillResolves() throws {
        let path = try write("body ✓", to: "read.txt")
        let outcome = try settle { resolve, reject in
            core.readFile(path, encoding: "utf8", transformFile: false, resolve: resolve, reject: reject)
        }

        guard case let .resolved(value) = outcome else {
            return XCTFail("reading a file rejected: \(outcome)")
        }
        XCTAssertEqual(value as? String, "body ✓")
    }

    // MARK: - `fs.readFile` utf8 of invalid bytes: U+FFFD

    /// h, é, NUL, 0xff, A. 0xff is not valid UTF-8 in any position.
    private static let invalidUTF8 = Data([0x68, 0xC3, 0xA9, 0x00, 0xFF, 0x41])

    func testReadFileUtf8ReplacesInvalidBytes() throws {
        let path = "\(dir)/invalid.bin"
        try Self.invalidUTF8.write(to: URL(fileURLWithPath: path))

        let outcome = try settle { resolve, reject in
            core.readFile(path, encoding: "utf8", transformFile: false, resolve: resolve, reject: reject)
        }

        guard case let .resolved(value) = outcome else {
            return XCTFail("reading invalid utf8 rejected: \(outcome)")
        }
        let text = try XCTUnwrap(value as? String, "utf8 used to resolve nil here, which reached JS as undefined")
        XCTAssertEqual(text.unicodeScalars.map { $0.value }, [104, 233, 0, 65533, 65],
                       "the bad byte becomes U+FFFD and the rest survives, as on Android")
    }

    /// The replacement must not touch bytes that are already valid: a file that
    /// round-tripped before must still come back identical.
    func testReadFileUtf8OfValidBytesIsUnchanged() throws {
        let text = "héllo ✓ 漢字"
        let path = try write(text, to: "valid.txt")

        let outcome = try settle { resolve, reject in
            core.readFile(path, encoding: "utf8", transformFile: false, resolve: resolve, reject: reject)
        }

        guard case let .resolved(value) = outcome else {
            return XCTFail("reading valid utf8 rejected: \(outcome)")
        }
        XCTAssertEqual(value as? String, text)
    }

    /// base64 and ascii read the same bytes and must not start replacing
    /// anything: they are how a caller reads a file that is not text at all.
    func testInvalidBytesSurviveBase64AndAscii() throws {
        let path = "\(dir)/invalid.bin"
        try Self.invalidUTF8.write(to: URL(fileURLWithPath: path))

        let asBase64 = try settle { resolve, reject in
            core.readFile(path, encoding: "base64", transformFile: false, resolve: resolve, reject: reject)
        }
        guard case let .resolved(b64) = asBase64 else {
            return XCTFail("base64 read rejected: \(asBase64)")
        }
        XCTAssertEqual(b64 as? String, Self.invalidUTF8.base64EncodedString())

        let asAscii = try settle { resolve, reject in
            core.readFile(path, encoding: "ascii", transformFile: false, resolve: resolve, reject: reject)
        }
        guard case let .resolved(bytes) = asAscii else {
            return XCTFail("ascii read rejected: \(asAscii)")
        }
        XCTAssertEqual((bytes as? [NSNumber])?.map { $0.intValue }, [104, -61, -87, 0, -1, 65],
                       "ascii stays signed per byte, untouched by the utf8 change")
    }

    // MARK: - utf8 `readStream` with a character split across chunks: ok

    /// Collects one stream's events, and waits for its end.
    private final class StreamRecorder: NSObject, ReactNativeBlobUtilEventSink {
        private(set) var events: [(name: String, body: [AnyHashable: Any])] = []
        private let finished: XCTestExpectation
        private let lock = NSLock()

        init(finished: XCTestExpectation) { self.finished = finished }

        func emitEventDict(_ name: String, body: [AnyHashable: Any]) {
            lock.lock()
            events.append((name, body))
            let isEnd = body["event"] as? String == "end"
            lock.unlock()
            if isEnd { finished.fulfill() }
        }

        var chunks: [String] {
            events.compactMap { $0.body["event"] as? String == "data" ? $0.body["detail"] as? String : nil }
        }
        var errors: [String] {
            events.compactMap {
                let event = $0.body["event"] as? String
                return (event == "error" || event == "warn") ? ($0.body["detail"] as? String ?? "") : nil
            }
        }
    }

    /// 700 two-byte characters then "abc": 1403 bytes, 703 characters. A
    /// 1001-byte buffer therefore cuts the 501st character in half.
    private static let splitSample = String(repeating: "é", count: 700) + "abc"

    private func readStream(_ path: String, bufferSize: Double) -> StreamRecorder {
        let done = expectation(description: "stream end")
        let recorder = StreamRecorder(finished: done)
        ReactNativeBlobUtilFS.readStream(path, encoding: "utf8", bufferSize: bufferSize,
                                         tick: 0, streamId: UUID().uuidString, baseModule: recorder)
        wait(for: [done], timeout: 10)
        return recorder
    }

    func testUtf8StreamBuffersACharacterSplitAcrossChunks() throws {
        let path = try write(Self.splitSample, to: "split.txt")

        let recorder = readStream(path, bufferSize: 1001)

        XCTAssertEqual(recorder.errors, [], "a split character is not an error")
        XCTAssertEqual(recorder.chunks.joined(), Self.splitSample, "the text arrives whole")
        XCTAssertEqual(recorder.chunks.joined().filter { $0 == "\u{FFFD}" }.count, 0,
                       "nothing is replaced: the bytes are valid, they were only cut")
        XCTAssertEqual(recorder.chunks.map { $0.count }, [500, 203],
                       "the half character is held back and joins the next chunk")
    }

    func testUtf8StreamOnABufferThatSplitsNothingIsUnchanged() throws {
        let path = try write(Self.splitSample, to: "split.txt")

        let recorder = readStream(path, bufferSize: 4096)

        XCTAssertEqual(recorder.errors, [])
        XCTAssertEqual(recorder.chunks, [Self.splitSample])
    }

    /// Buffering the tail of a chunk must not hide bytes that are invalid
    /// wherever they sit: those still become U+FFFD, as a whole-file read does.
    func testUtf8StreamReplacesBytesThatAreInvalidAnywhere() throws {
        let path = "\(dir)/invalid.bin"
        try Self.invalidUTF8.write(to: URL(fileURLWithPath: path))

        let recorder = readStream(path, bufferSize: 4096)

        XCTAssertEqual(recorder.errors, [])
        XCTAssertEqual(recorder.chunks.joined().unicodeScalars.map { $0.value },
                       [104, 233, 0, 65533, 65])
    }

    /// A file whose last character is cut off by the file ending, not by the
    /// buffer, has nothing to join: the held-back bytes must still be emitted.
    func testUtf8StreamEmitsATruncatedTrailingCharacter() throws {
        let path = "\(dir)/truncated.bin"
        // "é" with its second byte missing.
        try Data([0x61, 0xC3]).write(to: URL(fileURLWithPath: path))

        let recorder = readStream(path, bufferSize: 4096)

        XCTAssertEqual(recorder.chunks.joined().unicodeScalars.map { $0.value }, [97, 65533],
                       "the dangling lead byte is not silently dropped")
    }

    func testBase64AndAsciiStreamsAreUnaffected() throws {
        let path = try write(Self.splitSample, to: "split.txt")
        let bytes = Data(Self.splitSample.utf8)

        let done = expectation(description: "base64 end")
        let recorder = StreamRecorder(finished: done)
        // 999, not 1001: a base64 buffer has to be a multiple of 3 or each
        // chunk is padded on its own and the strings stop concatenating. That
        // is why the wrapper's default is 4095, and it is untouched here.
        ReactNativeBlobUtilFS.readStream(path, encoding: "base64", bufferSize: 999,
                                         tick: 0, streamId: UUID().uuidString, baseModule: recorder)
        wait(for: [done], timeout: 10)

        XCTAssertGreaterThan(recorder.chunks.count, 1, "the file is read in more than one chunk")
        let joined = recorder.chunks.joined()
        XCTAssertEqual(Data(base64Encoded: joined) ?? Data(), bytes,
                       "base64 chunks still concatenate back to the file")
    }

    // MARK: - `fs.createFile(path, src, 'uri')` with a missing source: ENOENT

    func testCreateFileFromAMissingUriRejectsENOENT() throws {
        let missing = "\(dir)/missing.txt"
        let dest = "\(dir)/from-uri.txt"

        let outcome = try settle { resolve, reject in
            core.createFile(dest, data: missing, encoding: "uri", resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, message) = outcome else {
            return XCTFail("creating from a missing source resolved: \(outcome)")
        }
        XCTAssertEqual(code, "ENOENT")
        XCTAssertEqual(message, "No such file '\(missing)'")
        XCTAssertFalse(fm.fileExists(atPath: dest), "and no empty file is left behind")
    }

    func testCreateFileFromAUriCopiesTheSource() throws {
        let src = try write("source body", to: "src.txt")

        // A bare path, as fs.createFile passes it,
        let plain = "\(dir)/plain.txt"
        let fromPlain = try settle { resolve, reject in
            core.createFile(plain, data: src, encoding: "uri", resolve: resolve, reject: reject)
        }
        guard case .resolved = fromPlain else {
            return XCTFail("creating from a real source rejected: \(fromPlain)")
        }
        XCTAssertEqual(contents(plain), "source body")

        // and the wrapped form, which is what ReactNativeBlobUtil.wrap builds.
        let wrapped = "\(dir)/wrapped.txt"
        let fromWrapped = try settle { resolve, reject in
            core.createFile(wrapped, data: "ReactNativeBlobUtil-file://\(src)",
                            encoding: "uri", resolve: resolve, reject: reject)
        }
        guard case .resolved = fromWrapped else {
            return XCTFail("creating from a wrapped source rejected: \(fromWrapped)")
        }
        XCTAssertEqual(contents(wrapped), "source body", "the wrap prefix is still stripped")
    }

    /// The check belongs to the uri encoding only: utf8 and base64 carry their
    /// own data and must not start looking for a file.
    func testCreateFileFromTextIsUnaffected() throws {
        let dest = "\(dir)/text.txt"

        let outcome = try settle { resolve, reject in
            core.createFile(dest, data: "written ✓", encoding: "utf8", resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("creating from utf8 rejected: \(outcome)")
        }
        XCTAssertEqual(contents(dest), "written ✓")
    }

    // MARK: - `excludeFromBackupKey` percent-encodes, and reports what fails

    private func isExcludedFromBackup(_ path: String) throws -> Bool {
        let values = try URL(fileURLWithPath: path).resourceValues(forKeys: [.isExcludedFromBackupKey])
        return values.isExcludedFromBackup ?? false
    }

    func testExcludeFromBackupSetsTheFlag() throws {
        let path = try write("backup", to: "backup.txt")

        let outcome = try settle { resolve, reject in
            core.excludeFromBackupKey("file://\(path)", resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("excluding a real file rejected: \(outcome)")
        }
        XCTAssertTrue(try isExcludedFromBackup(path), "the flag is actually set, not just resolved")
    }

    /// A path with a space makes NSURL(string:) return nil. The nil URL was
    /// simply skipped and the call resolved anyway, so the file stayed in the
    /// backup while the caller was told it had been excluded.
    func testExcludeFromBackupHandlesAPathNeedingEncoding() throws {
        let path = try write("backup", to: "with space & hash#.txt")

        let outcome = try settle { resolve, reject in
            core.excludeFromBackupKey("file://\(path)", resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("excluding a path with a space rejected: \(outcome)")
        }
        XCTAssertTrue(try isExcludedFromBackup(path),
                      "resolving is not enough: the file must really be excluded")
    }

    /// An already-encoded URL, which NSURL(string:) does parse, must keep
    /// working and must not be encoded a second time.
    func testExcludeFromBackupAcceptsAnEncodedURL() throws {
        let path = try write("backup", to: "encoded space.txt")
        let encoded = "file://" + (path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path)

        let outcome = try settle { resolve, reject in
            core.excludeFromBackupKey(encoded, resolve: resolve, reject: reject)
        }

        guard case .resolved = outcome else {
            return XCTFail("excluding an encoded URL rejected: \(outcome)")
        }
        XCTAssertTrue(try isExcludedFromBackup(path))
    }

    func testExcludeFromBackupOfAMissingFileRejectsENOENT() throws {
        let missing = "\(dir)/missing.txt"

        let outcome = try settle { resolve, reject in
            core.excludeFromBackupKey("file://\(missing)", resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, _) = outcome else {
            return XCTFail("excluding a missing file resolved: \(outcome)")
        }
        XCTAssertEqual(code, "ENOENT", "the file is not there, which is not unspecified")
    }

    func testExcludeFromBackupOfAnUnusableValueRejectsEINVAL() throws {
        let outcome = try settle { resolve, reject in
            core.excludeFromBackupKey("", resolve: resolve, reject: reject)
        }

        guard case let .rejected(code, _) = outcome else {
            return XCTFail("an empty url resolved: \(outcome)")
        }
        XCTAssertEqual(code, "EINVAL")
    }
}
