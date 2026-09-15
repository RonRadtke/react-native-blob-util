//
//  The adapter's event plumbing: what it says it sends, and in what shape.
//
//  ReactNativeBlobUtil.h imports React, so it is private to the pod and cannot
//  be reached through the umbrella module the Swift tests import. The class is
//  linked into this bundle all the same, so the runtime finds it by name, and
//  the event protocol - which is Swift, and React-free - comes from the module.
//

#import <XCTest/XCTest.h>
#import <objc/runtime.h>

@import react_native_blob_util;

/// The parts of the adapter this file drives. Declaring them keeps the
/// selectors known to the compiler without importing the React-facing header.
@protocol RNBUAdapterProbe <NSObject>
- (NSArray<NSString *> *)supportedEvents;
- (void)startObserving;
- (void)sendEventWithName:(NSString *)name body:(id)body;
@end

static NSMutableArray *RecordedBodies = nil;

@interface AdapterEventTests : XCTestCase
@end

@implementation AdapterEventTests

- (id<RNBUAdapterProbe>)adapter {
    Class cls = NSClassFromString(@"ReactNativeBlobUtil");
    XCTAssertNotNil(cls, @"the module class is not linked into the test bundle");
    return (id<RNBUAdapterProbe>)[[cls alloc] init];
}

- (void)testSupportedEventsListsOnlyWhatIsSent {
    id<RNBUAdapterProbe> adapter = [self adapter];
    NSArray<NSString *> *events = [adapter supportedEvents];

    // Every name here is a name something actually emits. The list used to
    // carry "log", "warn", "error", "data" and "end", which are values of the
    // `event` field inside a filesystem payload rather than event names, and
    // "reportProgress"/"reportUploadProgress", which nothing has ever sent.
    NSArray<NSString *> *expected = @[
        @"ReactNativeBlobUtilState",
        @"ReactNativeBlobUtilServerPush",
        @"ReactNativeBlobUtilProgress",
        @"ReactNativeBlobUtilProgress-upload",
        @"ReactNativeBlobUtilMessage",
        @"ReactNativeBlobUtilFilesystem",
    ];
    XCTAssertEqualObjects([NSSet setWithArray:events], [NSSet setWithArray:expected]);
    XCTAssertEqual(events.count, expected.count, @"no duplicates");
}

/// The payload used to be serialised to a JSON *string*, so every listener had
/// to parse it before reading a field. It is sent as the dictionary now.
- (void)testEventsReachJSAsObjects {
    id<RNBUAdapterProbe> adapter = [self adapter];

    RecordedBodies = [NSMutableArray array];
    Method method = class_getInstanceMethod([adapter class], @selector(sendEventWithName:body:));
    XCTAssertTrue(method != NULL, @"the emitter method moved");
    IMP original = method_getImplementation(method);
    IMP replacement = imp_implementationWithBlock(^(id self_, NSString *name, id body) {
        [RecordedBodies addObject:@{@"name": name, @"body": body ?: [NSNull null]}];
    });
    method_setImplementation(method, replacement);

    @try {
        [adapter startObserving];
        NSDictionary *payload = @{@"streamId": @"s1", @"event": @"data", @"detail": @"chunk ✓"};
        [(id<ReactNativeBlobUtilEventSink>)adapter emitEventDict:@"ReactNativeBlobUtilFilesystem"
                                                           body:payload];

        XCTAssertEqual(RecordedBodies.count, 1UL);
        id sent = RecordedBodies.firstObject[@"body"];
        XCTAssertFalse([sent isKindOfClass:NSString.class], @"not a JSON string any more");
        XCTAssertTrue([sent isKindOfClass:NSDictionary.class]);
        XCTAssertEqualObjects(sent, payload, @"and the keys arrive untouched");
        XCTAssertEqualObjects(RecordedBodies.firstObject[@"name"], @"ReactNativeBlobUtilFilesystem");
    }
    @finally {
        method_setImplementation(method, original);
        RecordedBodies = nil;
    }
}

@end
