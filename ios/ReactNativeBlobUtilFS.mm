
//  ReactNativeBlobUtilFS.m
//  ReactNativeBlobUtil
//
//  Created by Ben Hsieh on 2016/6/6.
//  Copyright © 2016年 suzuri04x2. All rights reserved.
//

#import <Foundation/Foundation.h>
#import "ReactNativeBlobUtil.h"
#import "ReactNativeBlobUtilFS.h"
#import "ReactNativeBlobUtilConst.h"
#import "ReactNativeBlobUtilFileTransformer.h"
#import <Photos/Photos.h>

#import <CommonCrypto/CommonDigest.h>

#if __has_include(<React/RCTAssert.h>)
#import <React/RCTBridge.h>
#else
#import "RCTBridge.h"
#endif


NSMutableDictionary *fileStreams = nil;

////////////////////////////////////////
//
//  File system access methods
//
////////////////////////////////////////
@interface ReactNativeBlobUtilFS() {
    UIDocumentInteractionController * docCtrl;
}
@end
@implementation ReactNativeBlobUtilFS


@synthesize outStream;
@synthesize inStream;
@synthesize encoding;
@synthesize callback;
@synthesize taskId;
@synthesize path;
@synthesize appendData;
@synthesize bufferSize;

- (id)init {
    self = [super init];
    return self;
}

- (id)initWithCallback:(RCTResponseSenderBlock)callback {
    self = [super init];
    self.callback = callback;
    return self;
}

// static member getter
+ (NSDictionary *) getFileStreams {

    if(fileStreams == nil)
        fileStreams = [[NSMutableDictionary alloc] init];
    return fileStreams;
}

+(void) setFileStream:(ReactNativeBlobUtilFS *) instance withId:(NSString *) uuid {
    if(fileStreams == nil)
        fileStreams = [[NSMutableDictionary alloc] init];
    [fileStreams setValue:instance forKey:uuid];
}

+(NSString *) getPathOfAsset:(NSString *)assetURI
{
    // get file path of an app asset
    if([assetURI hasPrefix:ASSET_PREFIX])
    {
        assetURI = [assetURI stringByReplacingOccurrencesOfString:ASSET_PREFIX withString:@""];
        assetURI = [[NSBundle mainBundle] pathForResource: [assetURI stringByDeletingPathExtension]
                                                   ofType: [assetURI pathExtension]];
    }
    return assetURI;
}

#pragma mark - system directories

+ (NSString *) getMainBundleDir {
    return [[NSBundle mainBundle] bundlePath];
}

+ (NSString *) getCacheDir {
    return [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getDocumentDir {
    return [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getDownloadDir {
    return [NSSearchPathForDirectoriesInDomains(NSDownloadsDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getLibraryDir {
    return [NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getMusicDir {
    return [NSSearchPathForDirectoriesInDomains(NSMusicDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getMovieDir {
    return [NSSearchPathForDirectoriesInDomains(NSMoviesDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getPictureDir {
    return [NSSearchPathForDirectoriesInDomains(NSPicturesDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getApplicationSupportDir {
    return [NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, YES) firstObject];
}

+ (NSString *) getTempPath {

    return NSTemporaryDirectory();
}

+ (NSString *) getTempPath:(NSString*)taskId withExtension:(NSString *)ext {

    NSString * documentDir = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) firstObject];
    NSString * filename = [NSString stringWithFormat:@"/ReactNativeBlobUtil_tmp/ReactNativeBlobUtilTmp_%@", taskId];
    if(ext != nil)
        filename = [filename stringByAppendingString: [NSString stringWithFormat:@".%@", ext]];
    NSString * tempPath = [documentDir stringByAppendingString: filename];
    return tempPath;
}

+ (NSString *) getPathForAppGroup:(NSString *)groupName {
    NSFileManager* fileManager = [NSFileManager defaultManager];
    NSURL* containerURL = [fileManager containerURLForSecurityApplicationGroupIdentifier:groupName];
    if(containerURL) {
        return [containerURL path];
    } else {
        return nil;
    }
}

#pragma margk - readStream

+ (void) readStream:(NSString *)uri
           encoding:(NSString * )encoding
         bufferSize:(int)bufferSize
               tick:(int)tick
           streamId:(NSString *)streamId
          baseModule:(ReactNativeBlobUtil*)baseModule
{
    [[self class] getPathFromUri:uri completionHandler:^(NSString *path, PHAsset *asset) {

        __block int read = 0;
        __block int backoff = tick *1000;
        __block int chunkSize = bufferSize;
        // allocate buffer in heap instead of stack
        uint8_t * buffer;
        @try
        {
            buffer = (uint8_t *) malloc(bufferSize);
            if(path != nil)
            {
                if([[NSFileManager defaultManager] fileExistsAtPath:path] == NO)
                {
                    NSString * message = [NSString stringWithFormat:@"File does not exist at path %@", path];
                    NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_ERROR, @"code": @"ENOENT", @"detail": message };
                    [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
                    free(buffer);
                    return ;
                }
                NSInputStream * stream = [[NSInputStream alloc] initWithFileAtPath:path];
                [stream open];
                while((read = [stream read:buffer maxLength:bufferSize]) > 0)
                {
                    [[self class] emitDataChunks:[NSData dataWithBytes:buffer length:read] encoding:encoding streamId:streamId baseModule:baseModule];
                    if(tick > 0)
                    {
                        usleep(backoff);
                    }
                }
                [stream close];
            }
            else if (asset != nil)
            {
                // For PHAsset, we need to get the full image data first
                PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
                options.synchronous = YES;
                options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
                options.resizeMode = PHImageRequestOptionsResizeModeNone;
                
                [[PHImageManager defaultManager] requestImageDataForAsset:asset options:options resultHandler:^(NSData *imageData, NSString *dataUTI, UIImageOrientation orientation, NSDictionary *info) {
                    if (imageData) {
                        // Write to temporary file and then read it back in chunks
                        NSString *tempPath = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"temp_asset_%@.tmp", [[NSUUID UUID] UUIDString]]];
                        [imageData writeToFile:tempPath atomically:YES];
                        
                        NSInputStream *stream = [[NSInputStream alloc] initWithFileAtPath:tempPath];
                        [stream open];
                        while((read = [stream read:buffer maxLength:bufferSize]) > 0)
                        {
                            [[self class] emitDataChunks:[NSData dataWithBytes:buffer length:read] encoding:encoding streamId:streamId baseModule:baseModule];
                            if(tick > 0)
                            {
                                usleep(backoff);
                            }
                        }
                        [stream close];
                        
                        // Clean up temp file
                        [[NSFileManager defaultManager] removeItemAtPath:tempPath error:nil];
                     }
                }];
            }
            else
            {
                NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_ERROR, @"code": @"EINVAL", @"detail": @"Unable to resolve URI" };
                [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
            }
            // release buffer
            if(buffer != nil)
                free(buffer);

        }
        @catch (NSException * ex)
        {
            NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_ERROR, @"code": @"EUNSPECIFIED", @"detail": [ex description] };
            [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
        }
        @finally
        {
            NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_END, @"detail": @"" };
            [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
        }

    }];


}

// send read stream chunks via native event emitter
+ (void) emitDataChunks:(NSData *)data encoding:(NSString *) encoding streamId:(NSString *)streamId baseModule:(ReactNativeBlobUtil *)baseModule
{
    @try
    {
        NSString * encodedChunk = @"";
        if([[encoding lowercaseString] isEqualToString:@"utf8"])
        {
            NSDictionary * payload = @{
                @"streamId":streamId,
                                       @"event": FS_EVENT_DATA,
                                       @"detail" : [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]
                                       };
            [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
        }
        else if ([[encoding lowercaseString] isEqualToString:@"base64"])
        {
            NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_DATA,  @"detail" : [data base64EncodedStringWithOptions:0] };
            [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
        }
        else if([[encoding lowercaseString] isEqualToString:@"ascii"])
        {
            // RCTBridge only emits string data, so we have to create JSON byte array string
            NSMutableArray * asciiArray = [NSMutableArray array];
            unsigned char *bytePtr;
            if (data.length > 0)
            {
                bytePtr = (unsigned char *)[data bytes];
                NSInteger byteLen = data.length/sizeof(uint8_t);
                for (int i = 0; i < byteLen; i++)
                {
                    [asciiArray addObject:[NSNumber numberWithChar:bytePtr[i]]];
                }
            }

            NSDictionary * payload = @{ @"streamId":streamId, @"event": FS_EVENT_DATA,  @"detail" : asciiArray };
            [baseModule emitEventDict:EVENT_FILESYSTEM body:payload];
        }

    }
    @catch (NSException * ex)
    {
        NSString * message = [NSString stringWithFormat:@"Failed to convert data to '%@' encoded string, this might due to the source data is not able to convert using this encoding. source = %@", encoding, [ex description]];
        [baseModule
         emitEventDict:EVENT_FILESYSTEM
         body:@{
            @"streamId":streamId,
                @"event" : MSG_EVENT_ERROR,
                @"detail" : message
                }];
        [baseModule
         emitEventDict:MSG_EVENT
         body:@{
            @"streamId":streamId,
                @"event" : MSG_EVENT_WARN,
                @"detail" : message
                }];
    }
}

# pragma write file from file

+ (NSNumber *) writeFileFromFile:(NSString *)src toFile:(NSString *)dest append:(BOOL)append callback:(void(^)(NSString * errMsg, NSNumber *size))callback
{
    [[self class] getPathFromUri:src completionHandler:^(NSString *path, PHAsset *asset) {
        if(path != nil)
        {
            __block NSInputStream * is = [[NSInputStream alloc] initWithFileAtPath:path];
            __block NSOutputStream * os = [[NSOutputStream alloc] initToFileAtPath:dest append:append];
            [is open];
            [os open];
            uint8_t buffer[10240];
            __block long written = 0;
            int read = [is read:buffer maxLength:10240];
            written += read;
            while(read > 0) {
                [os write:buffer maxLength:read];
                read = [is read:buffer maxLength:10240];
                written += read;
            }
            [os close];
            [is close];
            __block NSNumber * size = [NSNumber numberWithLong:written];
            callback(nil, size);
        }
        else if(asset != nil)
        {
            // For PHAsset, get the full image data and write it
            PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
            options.synchronous = YES;
            options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
            options.resizeMode = PHImageRequestOptionsResizeModeNone;
            
            [[PHImageManager defaultManager] requestImageDataForAsset:asset options:options resultHandler:^(NSData *imageData, NSString *dataUTI, UIImageOrientation orientation, NSDictionary *info) {
                if (imageData) {
                    NSOutputStream *os = [[NSOutputStream alloc] initToFileAtPath:dest append:append];
                    [os open];
                    [imageData writeToFile:dest atomically:YES];
                    NSNumber *size = [NSNumber numberWithLong:imageData.length];
                    [os close];
                    callback(nil, size);
                } else {
                    callback(@"Failed to get image data from asset", nil);
                }
            }];
        }
        else
            callback(@"failed to resolve path", nil);
    }];

    return 0;
}

# pragma mark - write file

+ (void) writeFile:(NSString *)path
                    encoding:(NSString *)encoding
                    data:(NSString *)data
                    transformFile:(BOOL)transformFile
                    append:(BOOL)append
                    resolver:(RCTPromiseResolveBlock)resolve
                    rejecter:(RCTPromiseRejectBlock)reject
{
    @try {
        NSFileManager * fm = [NSFileManager defaultManager];
        NSError * err = nil;
        // check if the folder exists, if it does not exist create folders recursively
        // after the folders created, write data into the file
        NSString * folder = [path stringByDeletingLastPathComponent];
        encoding = [encoding lowercaseString];

        BOOL isDir = NO;
        BOOL exists = NO;
        exists = [fm fileExistsAtPath:path isDirectory: &isDir];

        if (isDir) {
            return reject(@"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path], nil);
        }

        if(!exists) {
            [fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:NULL error:&err];
            if(err != nil) {
                return reject(@"ENOTDIR", [NSString stringWithFormat:@"Failed to create parent directory of '%@'; error: %@", path, [err description]], nil);
            }
            if(![fm createFileAtPath:path contents:nil attributes:nil]) {
                return reject(@"ENOENT", [NSString stringWithFormat:@"File '%@' does not exist and could not be created", path], nil);
            }
        }

        NSFileHandle *fileHandle = [NSFileHandle fileHandleForWritingAtPath:path];
        NSData * content = nil;
        if([encoding containsString:@"base64"]) {
            content = [[NSData alloc] initWithBase64EncodedString:data options:0];
        }
        else if([encoding isEqualToString:@"uri"]) {
            NSNumber* size = [[self class] writeFileFromFile:data toFile:path append:append callback:^(NSString *errMsg, NSNumber *size) {
                if(errMsg != nil)
                    reject(@"EUNSPECIFIED", errMsg, nil);
                else
                    resolve(size);
            }];
            return;
        }
        else {
            content = [data dataUsingEncoding:NSUTF8StringEncoding];
        }

        if (transformFile) {
            NSObject<FileTransformer>* fileTransformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];
            if (fileTransformer) {
                content = [fileTransformer onWriteFile:content];
            } else {
                return reject(@"EUNSPECIFIED",@"Transform specified but transformer not set", nil);
            }
        }

        if(append == YES) {
            [fileHandle seekToEndOfFile];
            [fileHandle writeData:content];
            [fileHandle closeFile];
        }
        else {
            if (![content writeToFile:path options:NSDataWritingAtomic error:&err]) {
                fm = nil;
                return reject(@"EUNSPECIFIED", [NSString stringWithFormat:@"File '%@' could not be written; error: %@", path, [err description]], err);
            }
        }
        fm = nil;

        resolve([NSNumber numberWithInteger:[content length]]);
    }
    @catch (NSException * e)
    {
        reject(@"EUNSPECIFIED", [e description], nil);
    }
}

# pragma mark - write file (array)

+ (void) writeFileArray:(NSString *)path
                         data:(NSArray *)data
                         append:(BOOL)append
                         resolver:(RCTPromiseResolveBlock)resolve
                         rejecter:(RCTPromiseRejectBlock)reject
{
    @try {
        NSFileManager * fm = [NSFileManager defaultManager];
        NSError * err = nil;
        // check if the folder exists, if not exists, create folders recursively
        // after the folders created, write data into the file
        NSString * folder = [path stringByDeletingLastPathComponent];

        BOOL isDir = NO;
        BOOL exists = NO;
        exists = [[NSFileManager defaultManager] fileExistsAtPath:path isDirectory: &isDir];

        if (isDir) {
            return reject(@"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path], nil);
        }

        if(!exists) {
            [fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:NULL error:&err];
            if(err != nil) {
                return reject(@"EUNSPECIFIED", [NSString stringWithFormat:@"Failed to create parent directory of '%@'; error: %@", path, [err description]], nil);
            }
        }

        NSMutableData * fileContent = [NSMutableData alloc];
        // prevent stack overflow, alloc on heap
        char * bytes = (char*) malloc([data count]);
        for(int i = 0; i < data.count; i++) {
            bytes[i] = [[data objectAtIndex:i] charValue];
        }
        [fileContent appendBytes:bytes length:data.count];

        if(!exists) {
            if(![fm createFileAtPath:path contents:fileContent attributes:NULL]) {
                return reject(@"ENOENT", [NSString stringWithFormat:@"File '%@' does not exist and could not be created", path], nil);
            }
        }
        // if file exists, write file
        else {
            if(append == YES) {
                NSFileHandle *fileHandle = [NSFileHandle fileHandleForWritingAtPath:path];
                [fileHandle seekToEndOfFile];
                [fileHandle writeData:fileContent];
                [fileHandle closeFile];
            }
            else {
                if (![fileContent writeToFile:path atomically:YES]) {
                    free(bytes);
                    fm = nil;
                    return reject(@"EUNSPECIFIED", [NSString stringWithFormat:@"File '%@' could not be written.", path], nil);
                }
            }
        }
        free(bytes);
        fm = nil;
        resolve([NSNumber numberWithInteger: data.count]);
    }
    @catch (NSException * e)
    {
        reject(@"EUNSPECIFIED", [e description], nil);
    }
}

# pragma mark - read file

+ (void) readFile:(NSString *)path
         encoding:(NSString *)encoding
         transformFile:(BOOL) transformFile
       onComplete:(void (^)(NSData * content, NSString * codeStr, NSString * errMsg))onComplete
{
    [[self class] getPathFromUri:path completionHandler:^(NSString *path, PHAsset *asset) {
        __block NSData * fileContent;
        NSError * err;
        __block Byte * buffer;
        if(asset != nil)
        {
            // For PHAsset, get the full image data
            PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
            options.synchronous = YES;
            options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
            options.resizeMode = PHImageRequestOptionsResizeModeNone;
            
            [[PHImageManager defaultManager] requestImageDataForAsset:asset options:options resultHandler:^(NSData *imageData, NSString *dataUTI, UIImageOrientation orientation, NSDictionary *info) {
                if (imageData) {
                    onComplete(imageData, nil, nil);
                } else {
                    onComplete(nil, @"EUNSPECIFIED", @"Failed to get image data from asset");
                }
            }];
            return;
        }
        else
        {
            BOOL isDir = NO;
            if(![[NSFileManager defaultManager] fileExistsAtPath:path isDirectory: &isDir]) {
                if (isDir) {
                    onComplete(nil, @"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path]);
                } else {
                    onComplete(nil, @"ENOENT", [NSString stringWithFormat:@"No such file '%@'", path]);
                }
                return;
            }
            fileContent = [NSData dataWithContentsOfFile:path];

        }

        if (transformFile) {
            NSObject<FileTransformer>* fileTransformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];
            if (fileTransformer) {
                @try{
                    fileContent = [fileTransformer onReadFile:fileContent];
                } @catch (NSException * ex)
                {
                    onComplete(nil, @"EUNSPECIFIED", [NSString stringWithFormat:@"Exception on File Transformer: '%@' ", [ex description]]);
                    return;
                }
            } else {
                onComplete(nil, @"EUNSPECIFIED", @"Transform specified but transformer not set");
                return;
            }
        }

        if(encoding != nil)
        {
            if([[encoding lowercaseString] isEqualToString:@"utf8"])
            {
                NSString * utf8 = [[NSString alloc] initWithData:fileContent encoding:NSUTF8StringEncoding];
                if(utf8 == nil) {
                    NSString * latin1 = [[NSString alloc] initWithData:fileContent encoding:NSISOLatin1StringEncoding];
                    NSData * latin1Data = [latin1 dataUsingEncoding:NSISOLatin1StringEncoding];
                    onComplete(latin1Data, nil, nil);
                } else {
                    onComplete(fileContent, nil, nil);
                }
            }
            else if ([[encoding lowercaseString] isEqualToString:@"base64"]) {
                NSString * base64String = [fileContent base64EncodedStringWithOptions:0];
                onComplete([[NSData alloc] initWithBase64EncodedString:base64String options:0], nil, nil);
            }
            else if ([[encoding lowercaseString] isEqualToString:@"ascii"]) {
                NSMutableArray * resultArray = [NSMutableArray array];
                char * bytes = (char *)[fileContent bytes];
                for(int i=0;i<[fileContent length];i++) {
                    [resultArray addObject:[NSNumber numberWithChar:bytes[i]]];
                }
                onComplete((NSData *)resultArray, nil, nil);
            }
        }
        else
        {
            onComplete(fileContent, nil, nil);
        }

    }];
}

# pragma mark - hash

typedef enum {
    HashAlgorithmMD5,
    HashAlgorithmSHA1,
    HashAlgorithmSHA224,
    HashAlgorithmSHA256,
    HashAlgorithmSHA384,
    HashAlgorithmSHA512,
} HashAlgorithm;

+ (void) hash:(NSString *)path
                  algorithm:(NSString *)algorithm
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject
{
    BOOL isDir = NO;
    BOOL exists = NO;
    exists = [[NSFileManager defaultManager] fileExistsAtPath:path isDirectory: &isDir];

    if (isDir) {
        return reject(@"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path], nil);
    }
    if (!exists) {
        return reject(@"ENOENT", [NSString stringWithFormat:@"No such file '%@'", path], nil);
    }

    NSError *error = nil;

    NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:&error];

    if (error) {
        reject(@"EUNKNOWN", [error description], nil);
        return;
    }

    if ([attributes objectForKey:NSFileType] == NSFileTypeDirectory) {
        reject(@"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path], nil);
        return;
    }

    NSFileHandle *fileHandle = [NSFileHandle fileHandleForReadingAtPath:path];
    if (fileHandle == nil) {
        reject(@"EUNKNOWN", [NSString stringWithFormat:@"Error opening '%@' for reading", path], error);
        return;
    }

    NSArray *keys = [NSArray arrayWithObjects:@"md5", @"sha1", @"sha224", @"sha256", @"sha384", @"sha512", nil];

    NSArray *digestLengths = [NSArray arrayWithObjects:
        @CC_MD5_DIGEST_LENGTH,
        @CC_SHA1_DIGEST_LENGTH,
        @CC_SHA224_DIGEST_LENGTH,
        @CC_SHA256_DIGEST_LENGTH,
        @CC_SHA384_DIGEST_LENGTH,
        @CC_SHA512_DIGEST_LENGTH,
        nil];

    NSDictionary *keysToDigestLengths = [NSDictionary dictionaryWithObjects:digestLengths forKeys:keys];

    int digestLength = [[keysToDigestLengths objectForKey:algorithm] intValue];

    if (!digestLength) {
      return reject(@"EINVAL", [NSString stringWithFormat:@"Invalid algorithm '%@', must be one of md5, sha1, sha224, sha256, sha384, sha512", algorithm], nil);
    }

    unsigned char buffer[digestLength];

    const NSUInteger chunkSize = 1024 * 1024; // 1 Megabyte
    NSData *dataChunk;

    CC_MD5_CTX md5Context;
    CC_SHA1_CTX sha1Context;
    CC_SHA256_CTX sha256Context;
    CC_SHA512_CTX sha512Context;
    HashAlgorithm hashAlgorithm;

    if ([algorithm isEqualToString:@"md5"]) {
        CC_MD5_Init(&md5Context);
        hashAlgorithm = HashAlgorithmMD5;
    } else if ([algorithm isEqualToString:@"sha1"]) {
        CC_SHA1_Init(&sha1Context);
        hashAlgorithm = HashAlgorithmSHA1;
    } else if ([algorithm isEqualToString:@"sha224"]) {
        CC_SHA224_Init(&sha256Context);
        hashAlgorithm = HashAlgorithmSHA224;
    } else if ([algorithm isEqualToString:@"sha256"]) {
        CC_SHA256_Init(&sha256Context);
        hashAlgorithm = HashAlgorithmSHA256;
    } else if ([algorithm isEqualToString:@"sha384"]) {
        CC_SHA384_Init(&sha512Context);
        hashAlgorithm = HashAlgorithmSHA384;
    } else if ([algorithm isEqualToString:@"sha512"]) {
        CC_SHA512_Init(&sha512Context);
        hashAlgorithm = HashAlgorithmSHA512;
    } else {
        reject(@"EINVAL", [NSString stringWithFormat:@"Invalid algorithm '%@', must be one of md5, sha1, sha224, sha256, sha384, sha512", algorithm], nil);
        return;
    }

    while (true) {
        @autoreleasepool {
            dataChunk = [fileHandle readDataUpToLength:chunkSize error:&error];

            if (error) {
                return reject(@"EREAD", [NSString stringWithFormat:@"Error reading file '%@'", path], error);
                break;
            }
            
            if (dataChunk == nil || dataChunk.length == 0) {
                break;
            }
            
            switch(hashAlgorithm) {
                case HashAlgorithmMD5:
                    CC_MD5_Update(&md5Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
                case HashAlgorithmSHA1:
                    CC_SHA1_Update(&sha1Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
                case HashAlgorithmSHA224:
                    CC_SHA224_Update(&sha256Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
                case HashAlgorithmSHA256:
                    CC_SHA256_Update(&sha256Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
                case HashAlgorithmSHA384:
                    CC_SHA384_Update(&sha512Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
                case HashAlgorithmSHA512:
                    CC_SHA512_Update(&sha512Context, [dataChunk bytes], CC_LONG([dataChunk length]));
                    break;
            }
            
            dataChunk = nil;
        }
    }

    switch(hashAlgorithm) {
        case HashAlgorithmMD5:
            CC_MD5_Final(buffer, &md5Context);
            break;
        case HashAlgorithmSHA1:
            CC_SHA1_Final(buffer, &sha1Context);
            break;
        case HashAlgorithmSHA224:
            CC_SHA224_Final(buffer, &sha256Context);
            break;
        case HashAlgorithmSHA256:
            CC_SHA256_Final(buffer, &sha256Context);
            break;
        case HashAlgorithmSHA384:
            CC_SHA384_Final(buffer, &sha512Context);
            break;
        case HashAlgorithmSHA512:
            CC_SHA512_Final(buffer, &sha512Context);
            break;
    }

    NSMutableString *output = [NSMutableString stringWithCapacity:digestLength * 2];
    for(int i = 0; i < digestLength; i++)
        [output appendFormat:@"%02x",buffer[i]];

    resolve(output);
}

# pragma mark - mkdir

+ (void) mkdir:(NSString *) path resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject
{
    BOOL isDir = NO;
    NSError * err = nil;
    if([[NSFileManager defaultManager] fileExistsAtPath:path isDirectory:&isDir]) {
        reject(@"EEXIST", [NSString stringWithFormat:@"%@ '%@' already exists", isDir ? @"Directory" : @"File", path], nil);
        return;
    }
    else {
        [[NSFileManager defaultManager] createDirectoryAtPath:path withIntermediateDirectories:YES attributes:nil error:&err];
    }
    if(err == nil) {
        resolve(@YES);
    }
    else {
        reject(@"EUNSPECIFIED", [NSString stringWithFormat:@"Error creating folder '%@', error: %@", path, [err description]], nil);
    }
}

# pragma mark - stat

+ (NSDictionary *) stat:(NSString *) path error:(NSError **) error {


    BOOL isDir = NO;
    NSFileManager * fm = [NSFileManager defaultManager];
    if([fm fileExistsAtPath:path isDirectory:&isDir] == NO) {
        return nil;
    }
    NSDictionary * info = [fm attributesOfItemAtPath:path error:error];
    NSString * size = [NSString stringWithFormat:@"%llu", [info fileSize]];
    NSString * filename = [path lastPathComponent];
    NSDate * lastModified;
    [[NSURL fileURLWithPath:path] getResourceValue:&lastModified forKey:NSURLContentModificationDateKey error:error];
    return @{
             @"size" : size,
             @"filename" : filename,
             @"path" : path,
             @"lastModified" : [NSNumber numberWithLong:(time_t) [lastModified timeIntervalSince1970]*1000],
             @"type" : isDir ? @"directory" : @"file"
            };

}

# pragma mark - exists

+ (void) exists:(NSString *) path callback:(RCTResponseSenderBlock)callback
{
    [[self class] getPathFromUri:path completionHandler:^(NSString *path, PHAsset *asset) {
        if(path != nil)
        {
            BOOL isDir = NO;
            BOOL exists = NO;
            exists = [[NSFileManager defaultManager] fileExistsAtPath:path isDirectory: &isDir];
            callback(@[@(exists), @(isDir)]);
        }
        else if(asset != nil)
        {
            callback(@[@YES, @NO]);
        }
        else
        {
            callback(@[@NO, @NO]);
        }
    }];
}

# pragma mark - open file stream

// Create file stream for write data
- (NSString *)openWithPath:(NSString *)destPath encode:(nullable NSString *)encode appendData:(BOOL)append {
    self.outStream = [[NSOutputStream alloc] initToFileAtPath:destPath append:append];
    self.encoding = encode;
    [self.outStream scheduleInRunLoop:[NSRunLoop currentRunLoop] forMode:NSRunLoopCommonModes];
    [self.outStream open];
    NSString *uuid = [[NSUUID UUID] UUIDString];
    self.streamId = uuid;
    [ReactNativeBlobUtilFS setFileStream:self withId:uuid];
    return uuid;
}

# pragma mark - file stream write chunk

// Write file chunk into an opened stream
- (void)writeEncodeChunk:(NSString *) chunk {
    NSData * decodedData = nil;
    if([[self.encoding lowercaseString] isEqualToString:@"base64"]) {
        decodedData = [[NSData alloc] initWithBase64EncodedString:chunk options: NSDataBase64DecodingIgnoreUnknownCharacters];
    }
    else if([[self.encoding lowercaseString] isEqualToString:@"utf8"]) {
        decodedData = [chunk dataUsingEncoding:NSUTF8StringEncoding];
    }
    else if([[self.encoding lowercaseString] isEqualToString:@"ascii"]) {
        decodedData = [chunk dataUsingEncoding:NSASCIIStringEncoding];
    }
    NSUInteger left = [decodedData length];
    NSUInteger nwr = 0;
    do {
        nwr = [self.outStream write:(const uint8_t *)[decodedData bytes] maxLength:left];
        if (-1 == nwr) break;
        left -= nwr;
    } while (left > 0);
    if (left) {
        NSLog(@"stream error: %@", [self.outStream streamError]);
    }
}

// Write file chunk into an opened stream
- (void)write:(NSData *) chunk {
    NSUInteger left = [chunk length];
    NSUInteger nwr = 0;
    do {
        nwr = [self.outStream write:(const uint8_t *)[chunk bytes] maxLength:left];
        if (-1 == nwr) break;
        left -= nwr;
    } while (left > 0);
    if (left) {
        NSLog(@"stream error: %@", [self.outStream streamError]);
    }
}

// close file write stream
- (void)closeOutStream {
    if(self.outStream != nil) {
        [self.outStream close];
        self.outStream = nil;
    }

}

// Slice a file into another file, generally for support Blob implementation.
+ (void)slice:(NSString *)path
         dest:(NSString *)dest
        start:(nonnull NSNumber *)start
          end:(nonnull NSNumber *)end
        encode:(NSString *)encode
     resolver:(RCTPromiseResolveBlock)resolve
     rejecter:(RCTPromiseRejectBlock)reject
{
    [[self class] getPathFromUri:path completionHandler:^(NSString *path, PHAsset *asset)
    {
        if(path != nil)
        {
            long expected = [end longValue] - [start longValue];
            long read = 0;
            NSFileHandle * handle = [NSFileHandle fileHandleForReadingAtPath:path];
            NSFileManager * fm = [NSFileManager defaultManager];
            NSOutputStream * os = [[NSOutputStream alloc] initToFileAtPath:dest append:NO];
            [os open];

            BOOL isDir = NO;
            BOOL exists = NO;
            exists = [fm fileExistsAtPath:path isDirectory: &isDir];

            if (isDir) {
                return reject(@"EISDIR", [NSString stringWithFormat:@"Expecting a file but '%@' is a directory", path], nil);
            }
            if(!exists) {
                return reject(@"ENOENT", [NSString stringWithFormat: @"No such file '%@'", path ], nil);
            }

            long size = [fm attributesOfItemAtPath:path error:nil].fileSize;
            long max = MIN(size, [end longValue]);

            if(![fm fileExistsAtPath:dest]) {
                if(![fm createFileAtPath:dest contents:[NSData new] attributes:nil]) {
                    return reject(@"ENOENT", [NSString stringWithFormat:@"File '%@' does not exist and could not be created", path], nil);
                }
            }
            [handle seekToFileOffset:[start longValue]];
            while(read < expected) {
                NSData * chunk;
                long chunkSize = 0;
                if([start longValue] + read + 10240 > max)
                {
                    NSLog(@"read chunk %lu", max - read - [start longValue]);
                    chunkSize = max - read - [start longValue];
                    chunk = [handle readDataOfLength:chunkSize];
                }
                else
                {
                    NSLog(@"read chunk %d", 10240);
                    chunkSize = 10240;
                    chunk = [handle readDataOfLength:10240];
                }
                if([chunk length] <= 0)
                    break;
                long remain = expected - read;

                [os write:(const uint8_t *)[chunk bytes] maxLength:chunkSize];
                read += [chunk length];
            }
            [handle closeFile];
            [os close];
            resolve(dest);
        }
        else if (asset != nil)
        {
            // For PHAsset, get the full image data and then slice it
            PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
            options.synchronous = YES;
            options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
            options.resizeMode = PHImageRequestOptionsResizeModeNone;
            
            [[PHImageManager defaultManager] requestImageDataForAsset:asset options:options resultHandler:^(NSData *imageData, NSString *dataUTI, UIImageOrientation orientation, NSDictionary *info) {
                if (imageData) {
                    long startPos = [start longValue];
                    long endPos = [end longValue];
                    long dataLength = imageData.length;
                    
                    // Clamp the range to the actual data length
                    startPos = MAX(0, MIN(startPos, dataLength));
                    endPos = MAX(startPos, MIN(endPos, dataLength));
                    
                    NSRange range = NSMakeRange(startPos, endPos - startPos);
                    NSData *sliceData = [imageData subdataWithRange:range];
                    
                    if ([sliceData writeToFile:dest atomically:YES]) {
                        resolve(dest);
                    } else {
                        reject(@"EUNSPECIFIED", @"Failed to write slice to file", nil);
                    }
                } else {
                    reject(@"EUNSPECIFIED", @"Failed to get image data from asset", nil);
                }
            }];
        }
        else {
            reject(@"EINVAL", [NSString stringWithFormat: @"Could not resolve URI %@", path ], nil);
        }

    }];
}

// close file read stream
- (void)closeInStream
{
    if(self.inStream != nil) {
        [self.inStream close];
        [self.inStream removeFromRunLoop:[NSRunLoop currentRunLoop] forMode:NSRunLoopCommonModes];
        [[ReactNativeBlobUtilFS getFileStreams] setValue:nil forKey:self.streamId];
        self.streamId = nil;
    }

}


# pragma mark - get absolute path of resource

+ (void) getPathFromUri:(NSString *)uri completionHandler:(void(^)(NSString * path, PHAsset *asset)) onComplete
{
    if([uri hasPrefix:AL_PREFIX])
    {
        NSURL *asseturl = [NSURL URLWithString:uri];
        PHFetchResult<PHAsset *> *assets = [PHAsset fetchAssetsWithALAssetURLs:@[asseturl] options:nil];
        if (assets.count > 0) {
            PHAsset *asset = assets.firstObject;
            onComplete(nil, asset);
        } else {
            onComplete(nil, nil);
        }
    }
    else
    {
        onComplete([[self class] getPathOfAsset:uri], nil);
    }
}

#pragma mark - get disk space

+(void) df:(RCTResponseSenderBlock)callback
{
    NSError *error = nil;
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSDictionary *dictionary = [[NSFileManager defaultManager] attributesOfFileSystemForPath:[paths lastObject] error: &error];

    if (dictionary) {
        NSNumber *fileSystemSizeInBytes = [dictionary objectForKey: NSFileSystemSize];
        NSNumber *freeFileSystemSizeInBytes = [dictionary objectForKey:NSFileSystemFreeSize];

        callback(@[[NSNull null], @{
                  @"free" : freeFileSystemSizeInBytes,
                  @"total" : fileSystemSizeInBytes,
                }]);
    } else {
        callback(@[@"failed to get storage usage."]);
    }

}

+ (void) writeAssetToPath:(PHAsset * )asset dest:(NSString *)dest
{
    if (asset.mediaType == PHAssetMediaTypeImage) {
        PHImageRequestOptions *options = [[PHImageRequestOptions alloc] init];
        options.synchronous = YES;
        options.deliveryMode = PHImageRequestOptionsDeliveryModeHighQualityFormat;
        options.resizeMode = PHImageRequestOptionsResizeModeNone;
        
        [[PHImageManager defaultManager] requestImageDataForAsset:asset options:options resultHandler:^(NSData *imageData, NSString *dataUTI, UIImageOrientation orientation, NSDictionary *info) {
            if (imageData) {
                [imageData writeToFile:dest atomically:YES];
            }
        }];
    }
    return;
}

@end
