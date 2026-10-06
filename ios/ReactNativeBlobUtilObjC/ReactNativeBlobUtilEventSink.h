//
//  ReactNativeBlobUtilEventSink.h
//
//  How the Swift half reaches JS without importing React.
//
//  Everything the worker classes send to JS goes through one selector, which
//  the adapter implements. Declared here in Objective-C rather than in Swift
//  because the adapter has to name it: under SwiftPM the adapter compiles in a
//  separate target from the Swift core and cannot see Swift's generated
//  header, so every type crossing that boundary has to originate on this side.
//  Swift imports it back through the leaf module.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@protocol ReactNativeBlobUtilEventSink <NSObject>

/// The payload goes over as an object, not a JSON string.
- (void)emitEventDict:(NSString *)name body:(NSDictionary *)body;

@end

NS_ASSUME_NONNULL_END
