//  ReactNativeBlobUtilFileTransformer.m
//  ReactNativeBlobUtil
//

#import "ReactNativeBlobUtilFileTransformer.h"

static NSObject<FileTransformer> *sharedFileTransformer;

@implementation ReactNativeBlobUtilFileTransformer

+ (void) setFileTransformer:(NSObject<FileTransformer> *)fileTransformer {
     sharedFileTransformer = fileTransformer;
}

+ (NSObject<FileTransformer>*) getFileTransformer {
    return sharedFileTransformer;
}

@end

// PHOENIX:PATCH-PACKAGE END