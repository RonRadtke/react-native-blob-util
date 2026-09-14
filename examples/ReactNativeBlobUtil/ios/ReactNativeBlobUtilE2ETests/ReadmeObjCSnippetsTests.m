//
//  The README's iOS snippet exactly as it is published, compiled from
//  Objective-C. The Swift counterpart is ReadmeSwiftSnippetsTests.swift; both
//  exist because an app may be written in either, and the published line has to
//  keep working from both.
//
//  Reached through the test target's bridging header, like any app that has not
//  adopted modules.
//

#import <XCTest/XCTest.h>
#import "ReactNativeBlobUtilFileTransformer.h"

/// What an app implements. The README points at
/// ios/ReactNativeBlobUtilFileTransformer.h for this protocol.
@interface MyObjCCustomEncryptor : NSObject <FileTransformer>
@end

@implementation MyObjCCustomEncryptor

- (NSData *)onWriteFile:(NSData *)data {
    NSMutableData *out = [NSMutableData dataWithData:data];
    uint8_t *bytes = out.mutableBytes;
    for (NSUInteger i = 0; i < out.length; i++) { bytes[i] ^= 0x2a; }
    return out;
}

- (NSData *)onReadFile:(NSData *)data {
    return [self onWriteFile:data];
}

@end

@interface ReadmeObjCSnippetsTests : XCTestCase
@end

@implementation ReadmeObjCSnippetsTests

- (void)tearDown {
    [ReactNativeBlobUtilFileTransformer setFileTransformer:nil];
    [super tearDown];
}

/// The line the README tells an app to put in its AppDelegate, verbatim.
- (void)testAppsSetTheFileTransformerAtStartup {
    [ReactNativeBlobUtilFileTransformer setFileTransformer: MyObjCCustomEncryptor.new];

    NSObject<FileTransformer> *transformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];
    XCTAssertNotNil(transformer);
    XCTAssertTrue([transformer isKindOfClass:[MyObjCCustomEncryptor class]]);
}

- (void)testTheTransformerRoundTrips {
    [ReactNativeBlobUtilFileTransformer setFileTransformer: MyObjCCustomEncryptor.new];
    NSObject<FileTransformer> *transformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];

    NSData *plain = [@"hello" dataUsingEncoding:NSUTF8StringEncoding];
    NSData *written = [transformer onWriteFile:plain];
    XCTAssertNotEqualObjects(written, plain, @"the transformer changes the bytes on the way out");
    XCTAssertEqualObjects([transformer onReadFile:written], plain, @"and changes them back on the way in");
}

@end
