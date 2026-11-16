//
//  open.pick() on iOS. Two halves worth testing without a user: the MIME ->
//  UTType mapping, which is pure, and the promise state machine around the
//  controller - a second pick while one is open, a cancel, and a presentation
//  that cannot happen.
//
//  The controller is never actually presented. Presenting real UIKit from a
//  unit test leaves the host holding a view controller that the tests running
//  after it inherit, so the picker takes its presentation as a closure and this
//  file substitutes one.
//

import XCTest
import UIKit
import UniformTypeIdentifiers
@testable import react_native_blob_util

final class FilePickerTests: XCTestCase {

    private var core: ReactNativeBlobUtilModuleCore!

    override func setUp() {
        super.setUp()
        core = ReactNativeBlobUtilModuleCore()
    }

    // MARK: - the MIME mapping

    func testTheAnyTypeBecomesEveryItem() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["*/*"]), [.item])
    }

    func testTheKnownWildcardsBecomeTheirTopLevelTypes() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["image/*"]), [.image])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["video/*"]), [.movie])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["audio/*"]), [.audio])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["text/*"]), [.text])
    }

    /// There is no single type standing for "any font" or "any model", so those
    /// widen rather than filtering to nothing.
    func testAnOtherWildcardWidensToEveryItem() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["model/*"]), [.item])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["font/*"]), [.item])
    }

    func testAnExactTypeBecomesItsOwnType() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["application/pdf"]), [.pdf])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["image/png"]), [.png])
    }

    func testTheCaseOfAMimeTypeDoesNotMatter() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["IMAGE/*"]), [.image])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["Application/PDF"]), [.pdf])
    }

    func testSeveralTypesKeepTheirOrderAndAreNotRepeated() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["image/png", "application/pdf"]),
                       [.png, .pdf])
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: ["image/*", "image/*", "*/*", "font/*"]),
                       [.image, .item])
    }

    /// A picker with no content types at all opens showing nothing, so an empty
    /// list - which JS does not send, but a direct native caller can - means
    /// "anything" rather than "nothing".
    func testAnEmptyListMeansEveryItem() {
        XCTAssertEqual(ReactNativeBlobUtilPicker.contentTypes(for: []), [.item])
    }

    /// The measurement the hand-written wildcard mapping rests on: UTType does
    /// not answer nil for a type it does not know, it invents a dynamic
    /// identifier - and a dynamic type matches no file on disk. If a future SDK
    /// changes that, this fails and the mapping can be simplified.
    func testUTTypeInventsADynamicTypeRatherThanAnsweringNil() throws {
        let wildcard = try XCTUnwrap(UTType(mimeType: "image/*"))
        XCTAssertTrue(wildcard.isDynamic, "a wildcard would otherwise filter to nothing")
        let unknown = try XCTUnwrap(UTType(mimeType: "application/x-nonsense-zzz"))
        XCTAssertTrue(unknown.isDynamic)
        XCTAssertFalse(try XCTUnwrap(UTType(mimeType: "application/pdf")).isDynamic)
    }

    // MARK: - the promise around the controller

    private func pick(_ options: [String: Any],
                      onSettled: @escaping (String?, Any?) -> Void) {
        core.pickFiles(options, resolve: { onSettled(nil, $0) }, reject: { code, _, _ in onSettled(code, nil) })
    }

    /// Presents through the seam and hands back the controller the picker made.
    private func capture() -> (shown: XCTestExpectation, controller: () -> UIDocumentPickerViewController?) {
        let shown = expectation(description: "presented")
        var captured: UIDocumentPickerViewController?
        core.picker.present = { controller in
            captured = controller
            shown.fulfill()
            return true
        }
        return (shown, { captured })
    }

    func testResolvesThePathsOfWhatWasPicked() throws {
        let presentation = capture()
        let settled = expectation(description: "settled")
        var paths: [String]?
        pick(["mime": ["*/*"], "multiple": true]) { _, value in
            paths = value as? [String]
            settled.fulfill()
        }
        wait(for: [presentation.shown], timeout: 5)
        let controller = try XCTUnwrap(presentation.controller())
        XCTAssertTrue(controller.allowsMultipleSelection)

        core.picker.documentPicker(controller, didPickDocumentsAt: [
            URL(fileURLWithPath: "/tmp/one.txt"), URL(fileURLWithPath: "/tmp/two.txt"),
        ])
        wait(for: [settled], timeout: 5)
        XCTAssertEqual(paths, ["/tmp/one.txt", "/tmp/two.txt"])
    }

    func testASinglePickDoesNotAllowMultipleSelection() throws {
        let presentation = capture()
        pick(["mime": ["*/*"], "multiple": false]) { _, _ in }
        wait(for: [presentation.shown], timeout: 5)
        XCTAssertFalse(try XCTUnwrap(presentation.controller()).allowsMultipleSelection)
    }

    /// A cancel is an answer, not a failure: the user said "nothing". fs.js
    /// turns the empty list into null for a single pick.
    func testACancelResolvesAnEmptyList() throws {
        let presentation = capture()
        let settled = expectation(description: "settled")
        var result: [String]?
        var rejection: String?
        pick(["mime": ["*/*"], "multiple": true]) { code, value in
            rejection = code
            result = value as? [String]
            settled.fulfill()
        }
        wait(for: [presentation.shown], timeout: 5)
        core.picker.documentPickerWasCancelled(try XCTUnwrap(presentation.controller()))
        wait(for: [settled], timeout: 5)
        XCTAssertNil(rejection)
        XCTAssertEqual(result, [])
    }

    /// UIKit will happily present a second picker over the first, and the first
    /// promise would then never settle.
    func testASecondPickWhileOneIsOpenIsEBUSY() throws {
        let presentation = capture()
        pick(["mime": ["*/*"], "multiple": false]) { _, _ in }

        let refused = expectation(description: "refused")
        var code: String?
        pick(["mime": ["*/*"], "multiple": false]) { rejection, _ in
            code = rejection
            refused.fulfill()
        }
        wait(for: [refused], timeout: 5)
        XCTAssertEqual(code, "EBUSY")

        // And the first one is still the one on screen, still able to settle.
        wait(for: [presentation.shown], timeout: 5)
        core.picker.documentPickerWasCancelled(try XCTUnwrap(presentation.controller()))
    }

    func testAPickIsPossibleAgainAfterTheLastOneSettled() throws {
        let first = capture()
        pick(["mime": ["*/*"], "multiple": false]) { _, _ in }
        wait(for: [first.shown], timeout: 5)
        core.picker.documentPickerWasCancelled(try XCTUnwrap(first.controller()))

        let second = capture()
        let settled = expectation(description: "settled")
        var paths: [String]?
        pick(["mime": ["image/*"], "multiple": false]) { _, value in
            paths = value as? [String]
            settled.fulfill()
        }
        wait(for: [second.shown], timeout: 5)
        core.picker.documentPicker(try XCTUnwrap(second.controller()),
                                   didPickDocumentsAt: [URL(fileURLWithPath: "/tmp/again.png")])
        wait(for: [settled], timeout: 5)
        XCTAssertEqual(paths, ["/tmp/again.png"])
    }

    /// A pending promise that can never settle would also wedge every later
    /// call behind the EBUSY check, so a failed presentation has to clear it.
    func testAPresentationThatCannotHappenRejectsAndClearsTheFlag() throws {
        core.picker.present = { _ in false }
        let refused = expectation(description: "refused")
        var code: String?
        pick(["mime": ["*/*"], "multiple": false]) { rejection, _ in
            code = rejection
            refused.fulfill()
        }
        wait(for: [refused], timeout: 5)
        XCTAssertEqual(code, "EUNSPECIFIED")

        // Not EBUSY the second time round.
        let presentation = capture()
        pick(["mime": ["*/*"], "multiple": false]) { rejection, _ in
            XCTAssertNotEqual(rejection, "EBUSY")
        }
        wait(for: [presentation.shown], timeout: 5)
        core.picker.documentPickerWasCancelled(try XCTUnwrap(presentation.controller()))
    }

    /// Without a controller to present from there is nothing to show, and the
    /// promise must not be left pending.
    func testNoPresentingControllerRejects() {
        core.presentingViewController = { nil }
        let refused = expectation(description: "refused")
        var code: String?
        pick(["mime": ["*/*"], "multiple": false]) { rejection, _ in
            code = rejection
            refused.fulfill()
        }
        wait(for: [refused], timeout: 5)
        XCTAssertEqual(code, "EUNSPECIFIED")
    }

    func testTheMimeAndMultipleKeysAreOptional() throws {
        let presentation = capture()
        pick([:]) { _, _ in }
        wait(for: [presentation.shown], timeout: 5)
        XCTAssertFalse(try XCTUnwrap(presentation.controller()).allowsMultipleSelection)
    }
}
