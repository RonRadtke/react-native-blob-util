//
//  The NSURLError -> error code mapping a caller branches on.
//
//  The message is deliberately not part of this: it is the localised prose
//  Foundation produces and is what a caller shows a user. The code is what a
//  caller retries on, and it is the same name on every platform - Migration.md
//  carries the table.
//

import XCTest
@testable import react_native_blob_util

final class NetworkErrorCodeTests: XCTestCase {

    /// Drives a request to completion with a synthesised transport error and
    /// returns the {code, message} dictionary the callback receives.
    private func failure(_ code: Int, domain: String = NSURLErrorDomain) throws -> [String: Any] {
        let request = ReactNativeBlobUtilRequest()
        request.taskId = "err-\(code)"
        request.options = [:]

        let done = expectation(description: "completion")
        var error: [String: Any]?
        var fired = false
        request.callback = { args in
            if !fired { fired = true; error = args?.first as? [String: Any]; done.fulfill() }
        }

        let session = URLSession.shared
        request.urlSession(session,
                           task: session.dataTask(with: URL(string: "https://example.invalid")!),
                           didCompleteWithError: NSError(domain: domain, code: code))
        wait(for: [done], timeout: 5)
        return try XCTUnwrap(error, "the completion should hand back an error dictionary")
    }

    private func assertCode(_ urlErrorCode: Int, _ expected: String,
                            _ label: String, line: UInt = #line) throws {
        let error = try failure(urlErrorCode)
        XCTAssertEqual(error["code"] as? String, expected, label, line: line)
    }

    func testTimeout() throws {
        try assertCode(NSURLErrorTimedOut, "ETIMEDOUT", "timedOut")
    }

    func testHostResolutionFailures() throws {
        try assertCode(NSURLErrorCannotFindHost, "ENOTFOUND", "cannotFindHost")
        try assertCode(NSURLErrorDNSLookupFailed, "ENOTFOUND", "dnsLookupFailed")
    }

    func testConnectionRefused() throws {
        try assertCode(NSURLErrorCannotConnectToHost, "ECONNREFUSED", "cannotConnectToHost")
    }

    func testConnectionLost() throws {
        try assertCode(NSURLErrorNetworkConnectionLost, "ECONNRESET", "networkConnectionLost")
    }

    func testNoInternet() throws {
        try assertCode(NSURLErrorNotConnectedToInternet, "ENETUNREACH", "notConnectedToInternet")
    }

    /// Every certificate failure is one code, because a caller cannot do
    /// anything different about a bad date than an unknown root.
    func testEveryCertificateFailureIsESSL() throws {
        for (code, label) in [
            (NSURLErrorSecureConnectionFailed, "secureConnectionFailed"),
            (NSURLErrorServerCertificateHasBadDate, "serverCertificateHasBadDate"),
            (NSURLErrorServerCertificateUntrusted, "serverCertificateUntrusted"),
            (NSURLErrorServerCertificateHasUnknownRoot, "serverCertificateHasUnknownRoot"),
            (NSURLErrorServerCertificateNotYetValid, "serverCertificateNotYetValid"),
            (NSURLErrorClientCertificateRejected, "clientCertificateRejected"),
            (NSURLErrorClientCertificateRequired, "clientCertificateRequired"),
        ] {
            try assertCode(code, "ESSL", label)
        }
    }

    func testCancelledKeepsItsOwnMessage() throws {
        let error = try failure(NSURLErrorCancelled)
        XCTAssertEqual(error["code"] as? String, "ECANCELED")
        XCTAssertEqual(error["message"] as? String, "task cancelled",
                       "a cancelled task keeps the message it has always reported")
    }

    func testBadUrls() throws {
        try assertCode(NSURLErrorBadURL, "EINVAL", "badURL")
        try assertCode(NSURLErrorUnsupportedURL, "EINVAL", "unsupportedURL")
    }

    /// Anything unrecognised stays EUNSPECIFIED rather than being guessed at.
    func testUnmappedUrlErrorsFallBack() throws {
        try assertCode(NSURLErrorUnknown, "EUNSPECIFIED", "unknown")
        try assertCode(NSURLErrorZeroByteResource, "EUNSPECIFIED", "zeroByteResource")
    }

    /// An error from another domain is not an NSURLError code, so it must not
    /// be read as one - NSFileNoSuchFileError happens to be a valid NSURLError
    /// number too.
    func testErrorsFromOtherDomainsAreNotMapped() throws {
        let error = try failure(NSFileNoSuchFileError, domain: NSCocoaErrorDomain)
        XCTAssertEqual(error["code"] as? String, "EUNSPECIFIED")
    }

    func testTheMessageIsLeftAlone() throws {
        let error = try failure(NSURLErrorTimedOut)
        let expected = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut).localizedDescription
        XCTAssertEqual(error["message"] as? String, expected,
                       "the code is new; the prose a caller shows is unchanged")
    }
}
