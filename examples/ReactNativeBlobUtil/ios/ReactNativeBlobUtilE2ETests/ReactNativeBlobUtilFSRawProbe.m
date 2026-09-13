#import "ReactNativeBlobUtilFSRawProbe.h"
#import "ReactNativeBlobUtilFS.h"

@implementation ReactNativeBlobUtilFSRawProbe

+ (void)readFile:(NSString *)path
        encoding:(NSString *)encoding
      onComplete:(void (^)(id, NSString *, NSString *))onComplete
{
    [ReactNativeBlobUtilFS readFile:path
                           encoding:encoding
                      transformFile:NO
                         onComplete:^(NSData *content, NSString *code, NSString *message) {
        // Deliberately untyped: for `ascii` this is an NSArray wearing NSData's
        // declaration, and narrowing it here would reintroduce the same crash.
        onComplete((id)content, code, message);
    }];
}

@end
