//
//  The one base64 decoder every write path shares. It exists because both of
//  Foundation's modes are wrong for this API: the default rejects a payload
//  that is merely line-wrapped or unpadded, and .ignoreUnknownCharacters
//  decodes pure garbage to no bytes at all, so a corrupt payload would write an
//  empty file and resolve. Those two measurements are asserted here as well, so
//  the comment in ReactNativeBlobUtilBase64.swift cannot quietly go stale.
//

import XCTest
@testable import react_native_blob_util

final class Base64DecoderTests: XCTestCase {

    private func text(_ encoded: String) -> String? {
        guard let data = ReactNativeBlobUtilBase64.decode(encoded) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    // MARK: - what it accepts

    func testDecodesPlainBase64() {
        XCTAssertEqual(text("QUJD"), "ABC")
        XCTAssertEqual(text("SGVsbG8sIHdvcmxkIQ=="), "Hello, world!")
        XCTAssertEqual(text("QQ=="), "A")
    }

    /// `base64` on the command line wraps at 76 columns, and so do plenty of
    /// servers. Every kind of whitespace the spec names is ignored wherever it
    /// appears, not only at the ends.
    func testIgnoresWhitespaceAnywhere() {
        XCTAssertEqual(text("SGVsbG8sIHdv\ncmxkIQ=="), "Hello, world!")
        XCTAssertEqual(text("SGVsbG8sIHdv\r\ncmxkIQ=="), "Hello, world!")
        XCTAssertEqual(text("SGVsbG8s IHdvcmxkIQ=="), "Hello, world!")
        XCTAssertEqual(text("\tSGVsbG8sIHdvcmxkIQ==\t"), "Hello, world!")
        XCTAssertEqual(text("Q U J D"), "ABC")
    }

    func testAcceptsMissingAndShortPadding() {
        XCTAssertEqual(text("QQ"), "A")
        XCTAssertEqual(text("QQ="), "A")
        XCTAssertEqual(text("SGVsbG8sIHdvcmxkIQ"), "Hello, world!")
        XCTAssertEqual(text("WFk"), "XY")
    }

    func testEmptyStringDecodesToNoBytes() {
        // Foundation's own decoder answers 0 bytes for "", and fs.writeFile('')
        // has always written an empty file rather than failing.
        XCTAssertEqual(ReactNativeBlobUtilBase64.decode(""), Data())
        XCTAssertEqual(ReactNativeBlobUtilBase64.decode(" \n\t"), Data())
    }

    func testDecodesEveryByteValue() throws {
        let all = Data((0...255).map { UInt8($0) })
        let decoded = try XCTUnwrap(ReactNativeBlobUtilBase64.decode(all.base64EncodedString()))
        XCTAssertEqual(decoded, all)
    }

    // MARK: - what it rejects

    func testRejectsCharactersThatAreNotBase64() {
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QQ$="))
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("!!!!"))
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QUJD!"))
        // Not ASCII at all, and not whitespace either.
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QUJé"))
        // base64url is a different alphabet; accepting it would decode to
        // different bytes than the caller encoded.
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QU-D"))
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QU_D"))
    }

    func testRejectsPaddingThatIsNotAtTheEnd() {
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("Q=QQ"))
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QQ==QQ"))
    }

    func testRejectsMoreThanTwoPaddingCharacters() {
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QQ==="))
    }

    /// One base64 digit carries 6 bits, so 4n+1 digits is not a whole number of
    /// bytes however it is padded. Accepting it would invent a byte.
    func testRejectsADigitCountThatCannotBeBytes() {
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("Q"))
        // Five digits, so 4n+1 again - one digit past a decodable block.
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QUJDR"))
        XCTAssertNil(ReactNativeBlobUtilBase64.decode("QUJDR="))
    }

    // MARK: - why it is not Foundation's

    /// The measurements the decoder's comment rests on. If a future SDK changes
    /// either of them, this fails and the comment gets corrected rather than
    /// being quietly wrong.
    func testFoundationsOwnDecoderIsNotUsableHere() {
        XCTAssertNil(Data(base64Encoded: "SGVsbG8sIHdv\ncmxkIQ=="), "the default rejects line wrapping")
        XCTAssertNil(Data(base64Encoded: "QQ"), "the default rejects missing padding")
        XCTAssertNil(Data(base64Encoded: "QQ", options: .ignoreUnknownCharacters),
                     "ignoreUnknownCharacters does not add padding either")
        XCTAssertEqual(Data(base64Encoded: "!!!!", options: .ignoreUnknownCharacters), Data(),
                       "ignoreUnknownCharacters turns garbage into an empty write")
    }

    /// Anything Foundation's strict decoder accepts, this one accepts too, and
    /// to the same bytes - the leniency only ever adds inputs.
    func testAgreesWithFoundationWhereFoundationSucceeds() {
        for sample in ["", "QQ==", "QUJD", "SGVsbG8sIHdvcmxkIQ==", "MDEyMzQ1Njc4OQ==", "AAECAwQFBgcICQ=="] {
            let strict = Data(base64Encoded: sample)
            XCTAssertEqual(ReactNativeBlobUtilBase64.decode(sample), strict, sample)
        }
    }
}
