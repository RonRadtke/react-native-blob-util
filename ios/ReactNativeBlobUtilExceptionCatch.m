#import "ReactNativeBlobUtilExceptionCatch.h"

@implementation ReactNativeBlobUtilExceptionCatch

+ (nullable NSString *)buildStreamPayloadWithStreamId:(NSString *)streamId
                                                event:(NSString *)event
                                               detail:(nullable NSString *)detail
                                              consume:(void (^)(NSDictionary *))consume
{
    @try {
        // The same literal, in the same order, so a nil detail is objects[2]
        // exactly as it was before the port.
        NSDictionary *payload = @{@"streamId": streamId, @"event": event, @"detail": detail};
        consume(payload);
        return nil;
    }
    @catch (NSException *exception) {
        return [exception description];
    }
}

@end
