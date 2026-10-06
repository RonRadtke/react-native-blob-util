//  ReactNativeBlobUtilFileTransformer.h
//  ReactNativeBlobUtil
//

#ifndef ReactNativeBlobUtilDataConverter_h
#define ReactNativeBlobUtilDataConverter_h

#import <UIKit/UIKit.h>


@protocol FileTransformer <NSObject>
- (NSData*) onWriteFile:(NSData*)data;
- (NSData*) onReadFile:(NSData*)data;
@end

@interface ReactNativeBlobUtilFileTransformer : NSObject

+ (void) setFileTransformer:(NSObject<FileTransformer>*) fileTransformer;
+ (NSObject<FileTransformer>*) getFileTransformer;

@end


#endif /* ReactNativeBlobUtilFileTransformer_h */