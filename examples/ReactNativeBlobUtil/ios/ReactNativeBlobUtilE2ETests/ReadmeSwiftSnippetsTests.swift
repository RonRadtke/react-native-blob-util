//
//  The README's iOS file-transformer setup, written the way an app would write
//  it, from outside the library. The counterpart to
//  android/src/test/java/com/ReactNativeBlobUtil/apicheck/ - compiling is most
//  of the check, because what breaks a published snippet is a signature moving,
//  not a wrong value.
//
//  Note the plain `import`: an app has no `@testable` access, so anything this
//  file reaches has to be public API of the pod's module.
//

import XCTest
import react_native_blob_util

/// What an app implements. The README points at
/// ios/ReactNativeBlobUtilFileTransformer.h for this protocol.
final class MyCustomEncryptor: NSObject, FileTransformer {

    func onWriteFile(_ data: Data) -> Data {
        return Data(data.map { $0 ^ 0x2a })
    }

    func onReadFile(_ data: Data) -> Data {
        return Data(data.map { $0 ^ 0x2a })
    }
}

final class ReadmeSwiftSnippetsTests: XCTestCase {

    override func tearDown() {
        // Shared process state, as on Android.
        ReactNativeBlobUtilFileTransformer.setFileTransformer(nil)
        super.tearDown()
    }

    /// The line the README tells an app to put in its AppDelegate.
    func testAppsSetTheFileTransformerAtStartup() throws {
        ReactNativeBlobUtilFileTransformer.setFileTransformer(MyCustomEncryptor())

        let transformer = try XCTUnwrap(ReactNativeBlobUtilFileTransformer.getFileTransformer())
        XCTAssertTrue(transformer is MyCustomEncryptor)
    }

    func testTheTransformerRoundTrips() throws {
        ReactNativeBlobUtilFileTransformer.setFileTransformer(MyCustomEncryptor())
        let transformer = try XCTUnwrap(ReactNativeBlobUtilFileTransformer.getFileTransformer())

        let plain = Data("hello".utf8)
        let written = transformer.onWriteFile(plain)
        XCTAssertNotEqual(written, plain, "the transformer is meant to change the bytes on the way out")
        XCTAssertEqual(transformer.onReadFile(written), plain, "and change them back on the way in")
    }

    func testNoTransformerIsSetByDefault() {
        ReactNativeBlobUtilFileTransformer.setFileTransformer(nil)
        XCTAssertNil(ReactNativeBlobUtilFileTransformer.getFileTransformer())
    }
}
