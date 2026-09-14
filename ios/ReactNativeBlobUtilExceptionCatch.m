#import "ReactNativeBlobUtilExceptionCatch.h"

@implementation ReactNativeBlobUtilExceptionCatch

+ (void)transformData:(NSData *)data
     withTransformer:(id<FileTransformer>)transformer
            forWrite:(BOOL)forWrite
          completion:(void (^)(NSData * _Nullable, NSString * _Nullable))completion
{
    NSData *result = nil;
    NSString *failure = nil;
    @try {
        result = forWrite ? [transformer onWriteFile:data] : [transformer onReadFile:data];
    }
    @catch (NSException *exception) {
        failure = [exception description];
    }
    completion(result, failure);
}

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
