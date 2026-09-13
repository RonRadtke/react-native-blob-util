//
//  Mirrors the hash cases in
//  android/src/test/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilFSTest.kt,
//  asserting the same digests so the two platforms are pinned to one set of
//  values rather than to each other's output.
//
//  ReactNativeBlobUtilFS is still Objective-C, so it is reached through the test
//  target's bridging header. When it is ported this import moves to
//  `@testable import react_native_blob_util` and these assertions stay as they are.
//

import XCTest

final class HashTests: XCTestCase {

    private var dir: String = ""

    override func setUpWithError() throws {
        dir = NSTemporaryDirectory().appending("rnbu-hash-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    private func write(_ contents: String, to name: String) throws -> String {
        let path = "\(dir)/\(name)"
        try contents.write(toFile: path, atomically: true, encoding: .utf8)
        return path
    }

    /// ReactNativeBlobUtilFS.hash takes RCT promise blocks, so drive it and wait.
    private func hash(_ path: String, _ algorithm: String) throws -> Result<String, NSError> {
        let done = expectation(description: "hash \(algorithm)")
        var outcome: Result<String, NSError>?
        ReactNativeBlobUtilFS.hash(path, algorithm: algorithm, resolver: { value in
            outcome = .success((value as? String) ?? "<not a string: \(String(describing: value))>")
            done.fulfill()
        }, rejecter: { code, message, _ in
            outcome = .failure(NSError(domain: code ?? "", code: 0,
                                       userInfo: [NSLocalizedDescriptionKey: message ?? ""]))
            done.fulfill()
        })
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(outcome)
    }

    func testDigestsOfAbcForEverySupportedAlgorithm() throws {
        // Digests of "abc". md5 starts with 0x90, a byte with the high bit set,
        // so the hex formatting of a negative signed byte is covered too.
        let expected = [
            "md5": "900150983cd24fb0d6963f7d28e17f72",
            "sha1": "a9993e364706816aba3e25717850c26c9cd0d89d",
            "sha224": "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
            "sha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            "sha384": "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
            "sha512": "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
        ]
        let path = try write("abc", to: "abc.txt")
        for (algorithm, digest) in expected.sorted(by: { $0.key < $1.key }) {
            switch try hash(path, algorithm) {
            case .success(let value):
                XCTAssertEqual(value, digest, "\(algorithm) digest of \"abc\"")
            case .failure(let error):
                XCTFail("\(algorithm) rejected: \(error.domain) \(error.localizedDescription)")
            }
        }
    }

    /// sha224 shares CommonCrypto's SHA-256 context type, so it is the one most
    /// likely to break silently if the context wiring is ever rearranged.
    func testSha224UsesItsOwnDigestLength() throws {
        let path = try write("abc", to: "abc.txt")
        guard case .success(let value) = try hash(path, "sha224") else {
            return XCTFail("sha224 rejected")
        }
        XCTAssertEqual(value.count, 56, "sha224 is 28 bytes, so 56 hex characters")
    }

    func testUnknownAlgorithmIsRejectedWithEINVAL() throws {
        let path = try write("abc", to: "abc.txt")
        guard case .failure(let error) = try hash(path, "sha999") else {
            return XCTFail("an unknown algorithm must reject")
        }
        XCTAssertEqual(error.domain, "EINVAL")
        XCTAssertEqual(error.localizedDescription,
                       "Invalid algorithm 'sha999', must be one of md5, sha1, sha224, sha256, sha384, sha512")
    }

    func testMissingFileIsRejectedWithENOENT() throws {
        guard case .failure(let error) = try hash("\(dir)/missing.txt", "md5") else {
            return XCTFail("a missing file must reject")
        }
        XCTAssertEqual(error.domain, "ENOENT")
    }

    func testDirectoryIsRejectedWithEISDIR() throws {
        guard case .failure(let error) = try hash(dir, "md5") else {
            return XCTFail("a directory must reject")
        }
        XCTAssertEqual(error.domain, "EISDIR")
    }
}
