//
//  ReactNativeBlobUtilExceptionCatch.h
//  ReactNativeBlobUtil
//
//  Objective-C exception boundary for the Swift implementation.
//
//  An app's file transformer is arbitrary code that may raise, and a raise
//  cannot unwind through a Swift frame. Calling it from here keeps the
//  exception on the Objective-C side, where @try can catch it.
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

@end

NS_ASSUME_NONNULL_END
