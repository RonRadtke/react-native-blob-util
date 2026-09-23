// Exercises the Swift port through its Objective-C entry points, including app
// transformers that return nil or raise. These cases must settle once and keep
// existing data intact. No device network or low-disk-space setup is required.
#import <XCTest/XCTest.h>
#import <objc/runtime.h>
#import "ReactNativeBlobUtilFileTransformer.h"

// A module import rather than the generated header. The __has_include pair the
// library's own .mm files use resolves inside the pod target, where that header
// is on the search path; from the test target neither form does - the framework
// form needs frameworks linkage and the quoted form needs the pod's build
// products directory. Importing the module works under every linkage.
@import react_native_blob_util;

@interface RNBURegressionTransformer : NSObject <FileTransformer>
@property (nonatomic) BOOL raises;
@property (nonatomic) BOOL returnsNil;
@end

@implementation RNBURegressionTransformer
- (NSData *)onWriteFile:(NSData *)data {
    if (self.raises) {
        @throw [NSException exceptionWithName:@"TransformerFailure" reason:@"bad ciphertext" userInfo:nil];
    }
    return self.returnsNil ? nil : data;
}
- (NSData *)onReadFile:(NSData *)data { return [self onWriteFile:data]; }
@end

// A response served inside the test process, so the real request delegate and
// its transform-on-download path run without DNS, TLS or a test HTTP server.
@interface RNBURegressionURLProtocol : NSURLProtocol
@end

@implementation RNBURegressionURLProtocol
+ (BOOL)canInitWithRequest:(NSURLRequest *)request {
    return [request.URL.host isEqualToString:@"rnbu-regression.invalid"];
}
+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request { return request; }
- (void)startLoading {
    NSData *data = [@"abc" dataUsingEncoding:NSUTF8StringEncoding];
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:self.request.URL
        statusCode:200 HTTPVersion:@"HTTP/1.1"
        headerFields:@{@"Content-Type": @"application/octet-stream", @"Content-Length": @"3"}];
    [self.client URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageNotAllowed];
    [self.client URLProtocol:self didLoadData:data];
    [self.client URLProtocolDidFinishLoading:self];
}
- (void)stopLoading {}
@end

@interface PortRegressionTests : XCTestCase
@property (nonatomic, copy) NSString *dir;
@property (nonatomic, strong) NSObject<FileTransformer> *savedTransformer;
@end

@implementation PortRegressionTests

- (void)setUp {
    [super setUp];
    self.savedTransformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];
    self.dir = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    XCTAssertTrue([NSFileManager.defaultManager createDirectoryAtPath:self.dir
        withIntermediateDirectories:YES attributes:nil error:nil]);
    XCTAssertTrue([NSURLProtocol registerClass:RNBURegressionURLProtocol.class]);
}

- (void)tearDown {
    [NSURLProtocol unregisterClass:RNBURegressionURLProtocol.class];
    [ReactNativeBlobUtilFileTransformer setFileTransformer:self.savedTransformer];
    [NSFileManager.defaultManager removeItemAtPath:self.dir error:nil];
    [super tearDown];
}

- (NSString *)existingFile {
    NSString *path = [self.dir stringByAppendingPathComponent:@"original.txt"];
    XCTAssertTrue([@"original" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
    return path;
}

- (void)assertWriteFailureWithTransformer:(RNBURegressionTransformer *)transformer {
    [ReactNativeBlobUtilFileTransformer setFileTransformer:transformer];
    NSString *path = [self existingFile];
    __block NSUInteger rejected = 0;
    [ReactNativeBlobUtilFS writeFile:path encoding:@"utf8" data:@"replacement" transformFile:YES append:NO
        resolver:^(id value) { XCTFail(@"Failed transformation resolved: %@", value); }
        rejecter:^(NSString *code, NSString *message, NSError *error) {
            rejected++;
            XCTAssertEqualObjects(code, @"EUNSPECIFIED");
            XCTAssertTrue([message containsString:transformer.raises ? @"bad ciphertext" : @"no data"]);
        }];
    XCTAssertEqual(rejected, 1u);
    XCTAssertEqualObjects([NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil], @"original");
}

- (void)testNilTransformationRejectsWithoutReplacingExistingFile {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.returnsNil = YES;
    [self assertWriteFailureWithTransformer:transformer];
}

- (void)testWriteTransformerExceptionRejectsWithoutReplacingExistingFile {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.raises = YES;
    [self assertWriteFailureWithTransformer:transformer];
}

- (void)testEmptyTransformedDataIsAValidWrite {
    [ReactNativeBlobUtilFileTransformer setFileTransformer:RNBURegressionTransformer.new];
    NSString *path = [self existingFile];
    __block NSUInteger resolved = 0;
    [ReactNativeBlobUtilFS writeFile:path encoding:@"utf8" data:@"" transformFile:YES append:NO
        resolver:^(id value) { resolved++; XCTAssertEqualObjects(value, @0); }
        rejecter:^(NSString *code, NSString *message, NSError *error) { XCTFail(@"%@ %@", code, message); }];
    XCTAssertEqual(resolved, 1u);
    XCTAssertEqual([NSData dataWithContentsOfFile:path].length, 0u);
}

- (void)assertReadFailureWithTransformer:(RNBURegressionTransformer *)transformer {
    [ReactNativeBlobUtilFileTransformer setFileTransformer:transformer];
    __block NSUInteger callbacks = 0;
    [ReactNativeBlobUtilFS readFile:[self existingFile] encoding:@"utf8" transformFile:YES
        onComplete:^(id data, NSString *code, NSString *message) {
            callbacks++;
            XCTAssertNil(data);
            XCTAssertEqualObjects(code, @"EUNSPECIFIED");
            XCTAssertTrue([message containsString:transformer.raises ? @"Exception on File Transformer:" : @"no data"]);
        }];
    XCTAssertEqual(callbacks, 1u);
}

- (void)testReadTransformerExceptionRejects {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.raises = YES;
    [self assertReadFailureWithTransformer:transformer];
}

- (void)testNilReadTransformationRejects {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.returnsNil = YES;
    [self assertReadFailureWithTransformer:transformer];
}

- (void)assertDownloadFailureWithTransformer:(RNBURegressionTransformer *)transformer {
    [ReactNativeBlobUtilFileTransformer setFileTransformer:transformer];
    XCTestExpectation *done = [self expectationWithDescription:@"download rejects its failed transformation"];
    done.assertForOverFulfill = YES;
    ReactNativeBlobUtilRequest *request = ReactNativeBlobUtilRequest.new;
    NSOperationQueue *queue = NSOperationQueue.new;
    queue.maxConcurrentOperationCount = 1;
    NSString *path = [self.dir stringByAppendingPathComponent:@"download.bin"];
    [request sendRequest:@{@"path": path, @"transformFile": @YES} contentLength:0 baseModule:nil
        taskId:NSUUID.UUID.UUIDString
        withRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:@"https://rnbu-regression.invalid/file"]]
        taskOperationQueue:queue callback:^(NSArray *args) {
            XCTAssertEqual(args.count, 4u);
            // The error slot is a dictionary of {code, message} now, so JS reads
            // a code instead of matching on message text. The message itself is
            // unchanged, which is what this still asserts.
            XCTAssertTrue([args[0] isKindOfClass:NSDictionary.class]);
            if ([args[0] isKindOfClass:NSDictionary.class]) {
                XCTAssertEqualObjects(args[0][@"code"], @"EUNSPECIFIED");
                XCTAssertTrue([args[0][@"message"] containsString:transformer.raises ? @"bad ciphertext" : @"no data"]);
            }
            XCTAssertEqualObjects(args[1], @"path");
            XCTAssertEqualObjects(args[2], path);
            [done fulfill];
        }];
    [self waitForExpectationsWithTimeout:10 handler:nil];
    [queue waitUntilAllOperationsAreFinished];
    XCTAssertNil(request.respData, @"completion releases the buffered response after a transform failure");
}

- (void)testDownloadTransformerExceptionRejects {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.raises = YES;
    [self assertDownloadFailureWithTransformer:transformer];
}

- (void)testNilDownloadTransformationRejects {
    RNBURegressionTransformer *transformer = RNBURegressionTransformer.new;
    transformer.returnsNil = YES;
    [self assertDownloadFailureWithTransformer:transformer];
}

// Inject a real failing descriptor at the factory used by the operation. Writes
// get a read-only descriptor: seeking succeeds but writing fails. Reads get a
// closed descriptor. Only this test's path is affected, and the old APIs raise
// where the throwing APIs report NSError.
- (void)withFailingHandleAtPath:(NSString *)path factory:(SEL)selector run:(void (^)(void))run {
    Method method = class_getClassMethod(NSFileHandle.class, selector);
    IMP original = method_getImplementation(method);
    NSFileHandle *(*openHandle)(id, SEL, NSString *) = (NSFileHandle *(*)(id, SEL, NSString *))original;
    IMP replacement = imp_implementationWithBlock(^NSFileHandle *(id receiver, NSString *candidate) {
        NSFileHandle *handle = openHandle(receiver, selector, candidate);
        if ([candidate isEqualToString:path]) {
            [handle closeFile];
            if (selector == @selector(fileHandleForWritingAtPath:)) {
                return [NSFileHandle fileHandleForReadingAtPath:candidate];
            }
        }
        return handle;
    });
    method_setImplementation(method, replacement);
    @try {
        run();
    } @finally {
        method_setImplementation(method, original);
        imp_removeBlock(replacement);
    }
}

- (void)testAppendIOFailuresRejectForBothStringsAndArrays {
    NSString *path = [self existingFile];
    [self withFailingHandleAtPath:path factory:@selector(fileHandleForWritingAtPath:) run:^{
        __block NSUInteger rejected = 0;
        void (^reject)(NSString *, NSString *, NSError *) = ^(NSString *code, NSString *message, NSError *error) {
            rejected++;
            XCTAssertEqualObjects(code, @"EUNSPECIFIED");
            XCTAssertNotNil(error);
        };
        void (^resolve)(id) = ^(id value) { XCTFail(@"Append on a read-only descriptor resolved: %@", value); };
        [ReactNativeBlobUtilFS writeFile:path encoding:@"utf8" data:@"more" transformFile:NO append:YES
            resolver:resolve rejecter:reject];
        [ReactNativeBlobUtilFS writeFileArray:path data:@[@65] append:YES resolver:resolve rejecter:reject];
        XCTAssertEqual(rejected, 2u);
    }];
    XCTAssertEqualObjects([NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil], @"original");
}

// EUNSPECIFIED, the code every platform uses for a read failure (it was EREAD).
- (void)testHashReadFailureRejectsWithEUNSPECIFIED {
    NSString *path = [self existingFile];
    [self withFailingHandleAtPath:path factory:@selector(fileHandleForReadingAtPath:) run:^{
        __block NSUInteger rejected = 0;
        [ReactNativeBlobUtilFS hash:path algorithm:@"sha256"
            resolver:^(id value) { XCTFail(@"Hash on a closed descriptor resolved: %@", value); }
            rejecter:^(NSString *code, NSString *message, NSError *error) {
                rejected++;
                XCTAssertEqualObjects(code, @"EUNSPECIFIED");
                XCTAssertEqualObjects(message, ([NSString stringWithFormat:@"Error reading file '%@'", path]));
                XCTAssertNotNil(error);
            }];
        XCTAssertEqual(rejected, 1u);
    }];
}

- (void)testArrayOverwriteReplacesTheFileAtomically {
    NSString *path = [self existingFile];
    NSString *link = [self.dir stringByAppendingPathComponent:@"original-inode.txt"];
    XCTAssertTrue([NSFileManager.defaultManager linkItemAtPath:path toPath:link error:nil]);
    __block NSUInteger resolved = 0;
    [ReactNativeBlobUtilFS writeFileArray:path data:@[@65, @66, @67] append:NO
        resolver:^(id value) { resolved++; XCTAssertEqualObjects(value, @3); }
        rejecter:^(NSString *code, NSString *message, NSError *error) { XCTFail(@"%@ %@", code, message); }];
    XCTAssertEqual(resolved, 1u);
    XCTAssertEqualObjects([NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil], @"ABC");
    // An in-place write changes the linked inode too. Atomic replacement leaves
    // that original inode intact until the new file has been written completely.
    XCTAssertEqualObjects([NSString stringWithContentsOfFile:link encoding:NSUTF8StringEncoding error:nil], @"original");
}

- (void)testLstatRejectsAnExistingDirectoryThatCannotBeEnumerated {
    NSString *path = [self.dir stringByAppendingPathComponent:@"unreadable"];
    NSFileManager *fm = NSFileManager.defaultManager;
    XCTAssertTrue([fm createDirectoryAtPath:path withIntermediateDirectories:NO attributes:nil error:nil]);
    XCTAssertTrue([fm setAttributes:@{NSFilePosixPermissions: @0300} ofItemAtPath:path error:nil]);
    @try {
        BOOL directory = NO;
        XCTAssertTrue([fm fileExistsAtPath:path isDirectory:&directory]);
        XCTAssertTrue(directory);
        NSError *enumerationError = nil;
        XCTAssertNil([fm contentsOfDirectoryAtPath:path error:&enumerationError]);
        XCTAssertNotNil(enumerationError);

        // lstat is a promise now: the enumeration error is a rejection carrying
        // EUNSPECIFIED rather than the first slot of a callback array. The
        // assertion is the same one - the error is reported, not swallowed.
        __block NSUInteger rejected = 0;
        [ReactNativeBlobUtilModuleCore.new lstat:path
            resolve:^(id value) { XCTFail(@"lstat on an unreadable directory resolved: %@", value); }
            reject:^(NSString *code, NSString *message, NSError *error) {
                rejected++;
                XCTAssertEqualObjects(code, @"EUNSPECIFIED");
                XCTAssertEqualObjects(message, enumerationError.localizedDescription);
            }];
        XCTAssertEqual(rejected, 1u);
    } @finally {
        [fm setAttributes:@{NSFilePosixPermissions: @0700} ofItemAtPath:path error:nil];
    }
}

@end
