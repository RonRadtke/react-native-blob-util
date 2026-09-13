//
//  A shim for the one thing Swift cannot call directly.
//
//  ReactNativeBlobUtilFS.readFile's completion block is typed
//  `void(^)(NSData *, NSString *, NSString *)`, but the `ascii` branch passes an
//  NSMutableArray through it. Objective-C never checks, so the real caller in
//  ReactNativeBlobUtil.mm casts it straight back to an array and it works. A
//  Swift closure cannot: the bridging thunk takes the parameter at its word and
//  sends -_bridgingCopy:length: to the array, which raises
//  NSInvalidArgumentException.
//
//  So the ascii path is pinned from Objective-C, where the lie is survivable,
//  and handed to the tests as a plain id.
//

#import <Foundation/Foundation.h>

@interface ReactNativeBlobUtilFSRawProbe : NSObject

/// Calls readFile:encoding:transformFile:onComplete: and reports the content
/// argument untouched, without asserting anything about its type.
+ (void)readFile:(NSString *)path
        encoding:(NSString *)encoding
      onComplete:(void (^)(id content, NSString *code, NSString *message))onComplete;

@end
