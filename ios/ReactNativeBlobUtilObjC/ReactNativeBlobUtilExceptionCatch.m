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

@end
