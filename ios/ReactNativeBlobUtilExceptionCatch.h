//
//  ReactNativeBlobUtilExceptionCatch.h
//  ReactNativeBlobUtil
//
//  Objective-C exception boundaries for the Swift implementation.
//
//  A read-stream chunk that splits a multi-byte character decodes to nil, and
//  the original built its event payload with that nil in it. The dictionary
//  literal raises NSInvalidArgumentException, and the text reported back to JS
//  is that exception's own description - which
//  tests/e2e/appium/parity/ios.json records verbatim, down to the objects[2]
//  index of the nil.
//
//  Swift cannot reproduce it: passing a nil String through `Any` bridges to
//  NSNull rather than to nil, so the dictionary is built successfully and the
//  chunk is emitted instead of failing. The payload is therefore assembled
//  here, where a nil really is nil.
//

#import <Foundation/Foundation.h>
#import "ReactNativeBlobUtilFileTransformer.h"

NS_ASSUME_NONNULL_BEGIN

@interface ReactNativeBlobUtilExceptionCatch : NSObject

/// Invokes the transformer entirely inside Objective-C. Completion is called
/// synchronously, after leaving the exception handler, so no Swift frame has to
/// unwind when an app's transformer raises. A nil result stays nil.
+ (void)transformData:(NSData *)data
     withTransformer:(id<FileTransformer>)transformer
            forWrite:(BOOL)forWrite
          completion:(void (^)(NSData * _Nullable result, NSString * _Nullable exception))completion
    NS_SWIFT_NAME(transform(_:with:forWrite:completion:));

/// Builds the read-stream data payload and hands it to `consume`. Returns nil
/// on success, or the raised exception's `description` when `detail` is nil.
+ (nullable NSString *)buildStreamPayloadWithStreamId:(NSString *)streamId
                                                event:(NSString *)event
                                               detail:(nullable NSString *)detail
                                              consume:(void (^)(NSDictionary *payload))consume;

@end

NS_ASSUME_NONNULL_END
