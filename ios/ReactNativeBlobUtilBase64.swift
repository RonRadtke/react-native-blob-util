//
//  ReactNativeBlobUtilBase64.swift
//  ReactNativeBlobUtil
//
//  One base64 decoder for every write path, because Foundation's is stricter
//  than the data real callers send. Measured on Xcode 26.5:
//
//    Data(base64Encoded:)                       "QU\nJD" -> nil, "QQ" -> nil
//    Data(base64Encoded:.ignoreUnknownCharacters) "QU\nJD" -> 3 bytes,
//                                               "QQ" -> nil, "!!!!" -> 0 bytes
//
//  So the default rejects payloads that are only line-wrapped or unpadded -
//  which is what a server, a CLI or `base64` on the command line produces - and
//  ignoreUnknownCharacters goes too far the other way: it silently decodes pure
//  garbage to an empty Data, so a corrupt payload writes an empty file and the
//  call resolves. Neither is what the JS API promises.
//
//  This decoder takes the middle: whitespace is stripped, missing padding is
//  added, and anything else is nil - which the callers turn into EINVAL.
//

import Foundation

@objc(ReactNativeBlobUtilBase64)
public final class ReactNativeBlobUtilBase64: NSObject {

    /// The bytes `text` holds, or nil when it is not base64.
    ///
    /// Lenient in exactly two ways: space, tab, CR and LF are ignored wherever
    /// they appear, and the padding may be short or missing. Everything else is
    /// rejected - a character outside [A-Za-z0-9+/], a '=' with data after it,
    /// more than two '=', or a digit count that cannot be a whole number of
    /// bytes (4n+1). The empty string decodes to no bytes, as Foundation's
    /// decoder does.
    @objc(decode:)
    public static func decode(_ text: String) -> Data? {
        var digits = ""
        digits.reserveCapacity(text.utf8.count)
        var padding = 0

        for scalar in text.unicodeScalars {
            switch scalar {
            case " ", "\t", "\r", "\n":
                continue
            case "=":
                padding += 1
                if padding > 2 { return nil }
            default:
                guard isDigit(scalar) else { return nil }
                // Padding ends the payload. "Q=QQ" is not short padding, it is
                // a corrupt stream, and decoding it would invent bytes.
                guard padding == 0 else { return nil }
                digits.unicodeScalars.append(scalar)
            }
        }

        // 4n+1 digits cannot be padded into a decodable block: one base64 digit
        // carries 6 bits, and no whole number of bytes is 6 bits long.
        let remainder = digits.count % 4
        if remainder == 1 { return nil }
        if remainder != 0 {
            digits += String(repeating: "=", count: 4 - remainder)
        }
        return Data(base64Encoded: digits)
    }

    private static func isDigit(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar {
        case "A"..."Z", "a"..."z", "0"..."9", "+", "/": return true
        default: return false
        }
    }
}
