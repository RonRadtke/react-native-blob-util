//
//  media.copyToInternal() on iOS: a photo library item copied into the app's
//  own storage, optionally scaled down and re-encoded as JPEG.
//
//  The resizing arithmetic is where this silently goes wrong - an upscale, a
//  squashed aspect ratio, a size rounded to zero - so it is a pure function and
//  most of this file tests it directly, with no library involved. The Photos
//  round trip needs a granted photo library:
//
//    xcrun simctl privacy booted grant photos <bundle id>
//
//  Without it the authorisation test still runs and the round trip reports
//  itself skipped rather than passing without having done anything.
//

import XCTest
import Photos
import UIKit
@testable import react_native_blob_util

final class MediaLibraryTests: XCTestCase {

    private var core: ReactNativeBlobUtilModuleCore!
    private var dir = ""

    override func setUpWithError() throws {
        core = ReactNativeBlobUtilModuleCore()
        dir = NSTemporaryDirectory().appending("rnbu-media-\(UUID().uuidString)")
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(atPath: dir)
    }

    // MARK: - the size arithmetic

    private func fitted(_ width: Double, _ height: Double, _ boundWidth: Int?, _ boundHeight: Int?) -> CGSize {
        ReactNativeBlobUtilMediaLibrary.fittedSize(CGSize(width: width, height: height),
                                                   width: boundWidth, height: boundHeight)
    }

    func testNoBoundsLeavesTheSizeAlone() {
        XCTAssertEqual(fitted(200, 100, nil, nil), CGSize(width: 200, height: 100))
    }

    func testOneBoundConstrainsBothSidesTogether() {
        XCTAssertEqual(fitted(200, 100, 100, nil), CGSize(width: 100, height: 50))
        XCTAssertEqual(fitted(200, 100, nil, 25), CGSize(width: 50, height: 25))
    }

    func testTwoBoundsFitInsideBoth() {
        // The width is the tighter of the two, so it decides.
        XCTAssertEqual(fitted(200, 100, 50, 80), CGSize(width: 50, height: 25))
        XCTAssertEqual(fitted(200, 100, 180, 10), CGSize(width: 20, height: 10))
    }

    /// Asking for 4000px of a 100px thumbnail cannot produce detail that was
    /// never captured, and the file would only get bigger.
    func testBoundsLargerThanTheImageDoNotUpscale() {
        XCTAssertEqual(fitted(200, 100, 400, 400), CGSize(width: 200, height: 100))
        XCTAssertEqual(fitted(200, 100, 200, nil), CGSize(width: 200, height: 100))
        XCTAssertEqual(fitted(200, 100, 4000, 4000), CGSize(width: 200, height: 100))
    }

    func testAVeryTightBoundStillLeavesAPixel() {
        // Rounding the short side to zero would make an image UIKit cannot draw.
        XCTAssertEqual(fitted(200, 100, 1, nil), CGSize(width: 1, height: 1))
        XCTAssertEqual(fitted(1000, 1, 2, nil), CGSize(width: 2, height: 1))
    }

    func testASizelessImageIsLeftAlone() {
        XCTAssertEqual(fitted(0, 0, 100, 100), CGSize(width: 0, height: 0))
    }

    func testANonPositiveBoundIsIgnored() {
        XCTAssertEqual(fitted(200, 100, 0, nil), CGSize(width: 200, height: 100))
        XCTAssertEqual(fitted(200, 100, -5, nil), CGSize(width: 200, height: 100))
    }

    // MARK: - the re-encode

    private func png(_ width: Int, _ height: Int) throws -> Data {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
            .image { context in
                UIColor.systemTeal.setFill()
                context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            }
        return try XCTUnwrap(image.pngData())
    }

    private func isJPEG(_ data: Data) -> Bool {
        data.count > 3 && Array(data.prefix(3)) == [0xFF, 0xD8, 0xFF]
    }

    func testReEncodesAsJPEGAtTheFittedSize() throws {
        let source = try png(200, 100)
        let out = try XCTUnwrap(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: 50, height: nil, compression: 0.9))
        XCTAssertTrue(isJPEG(out), "the bytes must be a JPEG, not the PNG it came from")
        XCTAssertEqual(try XCTUnwrap(UIImage(data: out)).size, CGSize(width: 50, height: 25))
    }

    /// compression on its own is a re-encode at full size, not a resize.
    func testCompressionAloneKeepsTheSize() throws {
        let source = try png(200, 100)
        let out = try XCTUnwrap(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: nil, height: nil, compression: 0.5))
        XCTAssertTrue(isJPEG(out))
        XCTAssertEqual(try XCTUnwrap(UIImage(data: out)).size, CGSize(width: 200, height: 100))
    }

    func testALowerQualityProducesFewerBytes() throws {
        let source = try png(300, 300)
        let high = try XCTUnwrap(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: nil, height: nil, compression: 1))
        let low = try XCTUnwrap(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: nil, height: nil, compression: 0.1))
        XCTAssertLessThan(low.count, high.count)
    }

    func testTheQualityIsClampedRatherThanTrusted() throws {
        let source = try png(40, 40)
        XCTAssertNotNil(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: nil, height: nil, compression: 5))
        XCTAssertNotNil(ReactNativeBlobUtilMediaLibrary.jpeg(from: source, width: nil, height: nil, compression: -1))
    }

    func testBytesThatAreNotAnImageAnswerNil() {
        XCTAssertNil(ReactNativeBlobUtilMediaLibrary.jpeg(from: Data("not an image".utf8),
                                                          width: 10, height: 10, compression: 0.9))
    }

    // MARK: - the call

    private enum Settled {
        case resolved(Any?)
        case rejected(code: String?, message: String?)
    }

    private func copyToInternal(_ uri: String, _ dest: String, _ options: [String: Any] = [:]) throws -> Settled {
        let done = expectation(description: "settled")
        var outcome: Settled?
        core.copyToInternal(uri, destpath: dest, options: options, resolve: { value in
            if outcome == nil { outcome = .resolved(value); done.fulfill() }
        }, reject: { code, message, _ in
            if outcome == nil { outcome = .rejected(code: code, message: message); done.fulfill() }
        })
        wait(for: [done], timeout: 30)
        return try XCTUnwrap(outcome)
    }

    private func code(_ settled: Settled) -> String? {
        if case .rejected(let code, _) = settled { return code }
        return nil
    }

    private var authorized: Bool {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .authorized, .limited: return true
        default: return false
        }
    }

    /// Named in the skip message: "no access" is not actionable on its own, and
    /// which status it is says whether the grant never happened, was refused, or
    /// was never asked for.
    private var authorizationName: String {
        switch PHPhotoLibrary.authorizationStatus(for: .readWrite) {
        case .notDetermined: return "notDetermined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorized: return "authorized"
        case .limited: return "limited"
        @unknown default: return "unknown"
        }
    }

    /// Measured on this Mac (Xcode 26.5, iOS 26.5 simulator): the four tests
    /// below report themselves skipped and there is no way around it from here.
    /// `xcrun simctl privacy <udid> grant photos <bundle id>` does write
    /// kTCCServicePhotos=2 for the app - the row is in the simulator's TCC.db
    /// and survives a reboot - but PHPhotoLibrary still answers notDetermined,
    /// and requestAuthorization(for: .readWrite) never calls its completion
    /// (bounded attempts timed out). The app's Info.plist does carry
    /// NSPhotoLibraryUsageDescription, which was a real missing piece and is
    /// fixed; the daemon simply does not answer in this environment.
    ///
    /// So the Photos round trip is covered on a device or a simulator where the
    /// status does come back authorized, and the arithmetic it depends on -
    /// fittedSize and jpeg - is tested above without Photos at all.
    private func requirePhotoLibrary() throws {
        try XCTSkipUnless(authorized, """
            no photo library access (status: \(authorizationName)). Grant it with
            `xcrun simctl privacy <udid> grant photos org.reactjs.native.example.ReactNativeBlobUtilE2E`
            and run again.
            """)
    }

    /// The code depends on host state, so the expectation is derived from it
    /// rather than guessed: without the library there is nothing to look in,
    /// and the call says so instead of reporting a missing asset.
    func testAUriThatNamesNoAssetIsRejected() throws {
        let expected = authorized ? "ENOENT" : "EACCES"
        XCTAssertEqual(code(try copyToInternal("content://media/external/images/1", "\(dir)/out.jpg")), expected)
        XCTAssertEqual(code(try copyToInternal("ph://", "\(dir)/out.jpg")), expected)
        XCTAssertEqual(code(try copyToInternal("ph://00000000-0000-0000-0000-000000000000/L0/001",
                                               "\(dir)/out.jpg")), expected)
    }

    func testNothingIsWrittenWhenTheCallRejects() throws {
        let dest = "\(dir)/out.jpg"
        _ = try copyToInternal("ph://00000000-0000-0000-0000-000000000000/L0/001", dest)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dest))
    }

    // MARK: - the Photos round trip

    /// Creates an asset, hands back its local identifier, and deletes it again.
    private func withAsset(_ body: (String) throws -> Void) throws {
        let data = try png(240, 120)
        let image = try XCTUnwrap(UIImage(data: data))
        var identifier: String?
        try PHPhotoLibrary.shared().performChangesAndWait {
            let request = PHAssetChangeRequest.creationRequestForAsset(from: image)
            identifier = request.placeholderForCreatedAsset?.localIdentifier
        }
        let created = try XCTUnwrap(identifier)
        defer {
            let assets = PHAsset.fetchAssets(withLocalIdentifiers: [created], options: nil)
            try? PHPhotoLibrary.shared().performChangesAndWait {
                PHAssetChangeRequest.deleteAssets(assets)
            }
        }
        try body(created)
    }

    func testCopiesTheOriginalImageOfAnAsset() throws {
        try requirePhotoLibrary()
        try withAsset { identifier in
            let dest = "\(dir)/original.png"
            XCTAssertNil(code(try copyToInternal("ph://\(identifier)", dest)))
            let written = try XCTUnwrap(FileManager.default.contents(atPath: dest))
            XCTAssertGreaterThan(written.count, 0)
            // Unresized and unre-encoded: the asset's own bytes, so the size is
            // the one it was created with.
            XCTAssertEqual(try XCTUnwrap(UIImage(data: written)).size, CGSize(width: 240, height: 120))
        }
    }

    func testCopiesAResizedJpegOfAnAsset() throws {
        try requirePhotoLibrary()
        try withAsset { identifier in
            let dest = "\(dir)/small.jpg"
            XCTAssertNil(code(try copyToInternal("ph://\(identifier)", dest, ["width": 60])))
            let written = try XCTUnwrap(FileManager.default.contents(atPath: dest))
            XCTAssertTrue(isJPEG(written), "a resize re-encodes as JPEG")
            XCTAssertEqual(try XCTUnwrap(UIImage(data: written)).size, CGSize(width: 60, height: 30))
        }
    }

    func testOverwritesAnExistingDestination() throws {
        try requirePhotoLibrary()
        try withAsset { identifier in
            let dest = "\(dir)/existing.jpg"
            try "stale".write(toFile: dest, atomically: true, encoding: .utf8)
            XCTAssertNil(code(try copyToInternal("ph://\(identifier)", dest, ["width": 30])))
            XCTAssertNotEqual(try? String(contentsOfFile: dest, encoding: .utf8), "stale")
        }
    }

    func testAMissingDestinationDirectoryIsCreated() throws {
        try requirePhotoLibrary()
        try withAsset { identifier in
            let dest = "\(self.dir)/nope/deeper/out.jpg"
            XCTAssertNil(code(try copyToInternal("ph://\(identifier)", dest)))
            XCTAssertTrue(FileManager.default.fileExists(atPath: dest))
        }
    }

    // MARK: - the destination's directory, without a photo library

    func testTheParentDirectoryIsCreatedWithEverythingAboveIt() {
        let dest = "\(dir)/one/two/three/out.jpg"
        XCTAssertNil(ReactNativeBlobUtilMediaLibrary.ensureParentDirectory(of: dest))
        var isDir: ObjCBool = false
        XCTAssertTrue(FileManager.default.fileExists(atPath: "\(dir)/one/two/three", isDirectory: &isDir))
        XCTAssertTrue(isDir.boolValue)
    }

    func testAnExistingParentIsLeftAlone() throws {
        let dest = "\(dir)/out.jpg"
        try "keep".write(toFile: "\(dir)/other.txt", atomically: true, encoding: .utf8)
        XCTAssertNil(ReactNativeBlobUtilMediaLibrary.ensureParentDirectory(of: dest))
        XCTAssertEqual(try String(contentsOfFile: "\(dir)/other.txt", encoding: .utf8), "keep")
    }

    /// The one way creating the parents fails on a path the app owns: a file is
    /// already sitting where a directory has to go.
    func testAFileWhereTheDirectoryMustGoIsReported() throws {
        try "in the way".write(toFile: "\(dir)/blocked", atomically: true, encoding: .utf8)
        let problem = ReactNativeBlobUtilMediaLibrary.ensureParentDirectory(of: "\(dir)/blocked/out.jpg")
        XCTAssertNotNil(problem)
        XCTAssertEqual(problem?.code, "EEXIST")
        XCTAssertTrue(problem?.message.contains("blocked/out.jpg") ?? false, problem?.message ?? "")
    }
}
