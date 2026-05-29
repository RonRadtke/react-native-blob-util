//
//  ReactNativeBlobUtilRequest.m
//  ReactNativeBlobUtil
//
//  Created by Artur Chrusciel on 15.01.18.
//  Copyright © 2018 wkh237.github.io. All rights reserved.
//

#import "ReactNativeBlobUtilRequest.h"

#import "ReactNativeBlobUtilFS.h"
#import "ReactNativeBlobUtilConst.h"
#import "ReactNativeBlobUtilFileTransformer.h"
#import "ReactNativeBlobUtilNetwork.h"
#import "ReactNativeBlobUtilReqBuilder.h"

#import <CommonCrypto/CommonDigest.h>


typedef NS_ENUM(NSUInteger, ResponseFormat) {
    UTF8,
    BASE64,
    AUTO
};

@interface ReactNativeBlobUtilRequest ()
{
    BOOL respFile;
    BOOL isNewPart;
    BOOL isIncrement;
    NSMutableData * partBuffer;
    NSString * destPath;
    NSOutputStream * writeStream;
    long bodyLength;
    NSInteger respStatus;
    NSMutableArray * redirects;
    ResponseFormat responseFormat;
    BOOL followRedirect;
    BOOL backgroundTask;
}

@end

@implementation ReactNativeBlobUtilRequest

@synthesize taskId;
@synthesize expectedBytes;
@synthesize receivedBytes;
@synthesize respData;
@synthesize callback;
@synthesize baseModule;
@synthesize options;
@synthesize error;


- (NSString *)md5:(NSString *)input {
    const char* str = [input UTF8String];
    unsigned char result[CC_MD5_DIGEST_LENGTH];
    CC_MD5(str, (CC_LONG)strlen(str), result);

    NSMutableString *ret = [NSMutableString stringWithCapacity:CC_MD5_DIGEST_LENGTH*2];
    for (int i = 0; i<CC_MD5_DIGEST_LENGTH; i++) {
        [ret appendFormat:@"%02x",result[i]];
    }
    return ret;
}

// send HTTP request
- (void) sendRequest:(__weak NSDictionary  * _Nullable )options
       contentLength:(long) contentLength
              baseModule:(__strong ReactNativeBlobUtil * _Nullable)baseModule
              taskId:(NSString * _Nullable)taskId
         withRequest:(__weak NSURLRequest * _Nullable)req
  taskOperationQueue:(NSOperationQueue * _Nonnull)operationQueue
            callback:(_Nullable RCTResponseSenderBlock) callback
{
    self.taskId = taskId;
    self.respData = [[NSMutableData alloc] initWithLength:0];
    self.callback = callback;
    self.baseModule = baseModule;
    self.expectedBytes = 0;
    self.receivedBytes = 0;
    self.options = options;

    backgroundTask = [[options valueForKey:@"IOSBackgroundTask"] boolValue];
    // when followRedirect not set in options, defaults to TRUE
    followRedirect = [options valueForKey:@"followRedirect"] == nil ? YES : [[options valueForKey:@"followRedirect"] boolValue];
    isIncrement = [[options valueForKey:@"increment"] boolValue];
    redirects = [[NSMutableArray alloc] init];

    if (req.URL) {
        [redirects addObject:req.URL.absoluteString];
    }

    // set response format
    NSString * rnfbResp = [req.allHTTPHeaderFields valueForKey:@"RNFB-Response"];

    if ([[rnfbResp lowercaseString] isEqualToString:@"base64"]) {
        responseFormat = BASE64;
    } else if ([[rnfbResp lowercaseString] isEqualToString:@"utf8"]) {
        responseFormat = UTF8;
    } else {
        responseFormat = AUTO;
    }

    NSString * path = [self.options valueForKey:CONFIG_FILE_PATH];
    NSString * key = [self.options valueForKey:CONFIG_KEY];
    NSURLSession * session;

    bodyLength = contentLength;

    // the session trust any SSL certification
    NSURLSessionConfiguration *defaultConfigObject;

    defaultConfigObject = [NSURLSessionConfiguration defaultSessionConfiguration];

    if (backgroundTask) {
        defaultConfigObject = [NSURLSessionConfiguration backgroundSessionConfigurationWithIdentifier:taskId];
    }

    // request timeout, -1 if not set in options
    float timeout = [options valueForKey:@"timeout"] == nil ? -1 : [[options valueForKey:@"timeout"] floatValue];

    if (timeout > 0) {
        defaultConfigObject.timeoutIntervalForRequest = timeout/1000;
    }

    if([options valueForKey:CONFIG_WIFI_ONLY] != nil && [options[CONFIG_WIFI_ONLY] boolValue]){
        [defaultConfigObject setAllowsCellularAccess:NO];
    }

    defaultConfigObject.HTTPMaximumConnectionsPerHost = 10;
    session = [NSURLSession sessionWithConfiguration:defaultConfigObject delegate:self delegateQueue:operationQueue];

    if (path || [self.options valueForKey:CONFIG_USE_TEMP]) {
        respFile = YES;

        NSString* cacheKey = taskId;
        if (key) {
            cacheKey = [self md5:key];

            if (!cacheKey) {
                cacheKey = taskId;
            }

            destPath = [ReactNativeBlobUtilFS getTempPath:cacheKey withExtension:[self.options valueForKey:CONFIG_FILE_EXT]];

            if ([[NSFileManager defaultManager] fileExistsAtPath:destPath]) {
                callback(@[[NSNull null], RESP_TYPE_PATH, destPath]);

                return;
            }
        }

        if (path) {
            destPath = path;
        } else {
            destPath = [ReactNativeBlobUtilFS getTempPath:cacheKey withExtension:[self.options valueForKey:CONFIG_FILE_EXT]];
        }

        // We still need to initialize this as a placeholder in memory before we perform
        // the conversion
        if ([self ShouldTransformFile]) {
            respData = [[NSMutableData alloc] init];
        }
    } else {
        respData = [[NSMutableData alloc] init];
        respFile = NO;
    }

    if(backgroundTask) {
        NSURLSessionDownloadTask *task = [session downloadTaskWithRequest:req];
        [task resume];
        self.task = task;
    } else {
        NSURLSessionDataTask *task = [session dataTaskWithRequest:req];
        [task resume];
        self.task = task;
    }

    // network status indicator
    if ([[options objectForKey:CONFIG_INDICATOR] boolValue]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [[UIApplication sharedApplication] setNetworkActivityIndicatorVisible:YES];
        });
    }
}

////////////////////////////////////////
//
//  NSURLSession delegates
//
////////////////////////////////////////


#pragma mark NSURLSession delegate methods

- (void)configureWriteStream {
    if (respFile)
    {
        @try{
            NSFileManager * fm = [NSFileManager defaultManager];
            NSString * folder = [destPath stringByDeletingLastPathComponent];

            if (![fm fileExistsAtPath:folder]) {
                [fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:NULL error:nil];
            }

            // if not set overwrite in options, defaults to TRUE
            BOOL overwrite = [options valueForKey:@"overwrite"] == nil ? YES : [[options valueForKey:@"overwrite"] boolValue];
            BOOL appendToExistingFile = [destPath containsString:@"?append=true"];

            appendToExistingFile = !overwrite;

            // For solving #141 append response data if the file already exists
            // base on PR#139 @kejinliang
            if (appendToExistingFile) {
                destPath = [destPath stringByReplacingOccurrencesOfString:@"?append=true" withString:@""];
            }

            if (![fm fileExistsAtPath:destPath]) {
                [fm createFileAtPath:destPath contents:[[NSData alloc] init] attributes:nil];
            }

            writeStream = [[NSOutputStream alloc] initToFileAtPath:destPath append:appendToExistingFile];
            [writeStream scheduleInRunLoop:[NSRunLoop currentRunLoop] forMode:NSRunLoopCommonModes];
            [writeStream open];
        }
        @catch(NSException * ex)
        {
            NSLog(@"write file error");
        }
    }
}

- (void)processData:(NSData *)data {
    if (respFile && ![self ShouldTransformFile]) {
        [writeStream write:(const uint8_t *)[data bytes] maxLength:[data length]];
    } else {
        [respData appendData:data];
    }
}

- (BOOL)copyDownloadedFile:(NSURL *)sourceURL toPath:(NSString *)targetPath append:(BOOL)append
{
    NSInputStream *inputStream = [NSInputStream inputStreamWithURL:sourceURL];
    NSOutputStream *outputStream = [NSOutputStream outputStreamToFileAtPath:targetPath append:append];

    if (!inputStream || !outputStream) {
        return NO;
    }

    [inputStream open];
    [outputStream open];

    uint8_t buffer[65536];
    BOOL success = YES;

    while ([inputStream hasBytesAvailable]) {
        NSInteger bytesRead = [inputStream read:buffer maxLength:sizeof(buffer)];
        if (bytesRead < 0) {
            success = NO;
            break;
        }
        if (bytesRead == 0) {
            break;
        }

        NSInteger bytesWritten = 0;
        while (bytesWritten < bytesRead) {
            NSInteger writeResult = [outputStream write:&buffer[bytesWritten] maxLength:(NSUInteger)(bytesRead - bytesWritten)];
            if (writeResult <= 0) {
                success = NO;
                break;
            }
            bytesWritten += writeResult;
        }

        if (!success) {
            break;
        }
    }

    [inputStream close];
    [outputStream close];

    return success;
}


#pragma mark - Received Response
// set expected content length on response received
- (void) URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler
{
    expectedBytes = [response expectedContentLength];

    NSHTTPURLResponse *httpResponse = (NSHTTPURLResponse*)response;
    NSInteger statusCode = [(NSHTTPURLResponse *)response statusCode];
    NSString * respType = @"";
    respStatus = statusCode;

    if ([response respondsToSelector:@selector(allHeaderFields)])
    {
        NSDictionary *headers = [httpResponse allHeaderFields];
        NSString * respCType = [[ReactNativeBlobUtilReqBuilder getHeaderIgnoreCases:@"Content-Type" fromHeaders:headers] lowercaseString];

        if (self.isServerPush) {
            if (partBuffer) {
                [self.baseModule
                 emitEventDict:EVENT_SERVER_PUSH
                 body:@{
                        @"taskId": taskId,
                        @"chunk": [partBuffer base64EncodedStringWithOptions:0],
                        }
                 ];
            }

            partBuffer = [[NSMutableData alloc] init];
            completionHandler(NSURLSessionResponseAllow);

            return;
        } else {
            self.isServerPush = [[respCType lowercaseString] containsString:@"multipart/x-mixed-replace;"];
        }

        if(respCType)
        {
            NSArray * extraBlobCTypes = [options objectForKey:CONFIG_EXTRA_BLOB_CTYPE];

            if ([respCType containsString:@"text/"]) {
                respType = @"text";
            } else if ([respCType containsString:@"application/json"]) {
                respType = @"json";
            } else if(extraBlobCTypes) { // If extra blob content type is not empty, check if response type matches
                for (NSString * substr in extraBlobCTypes) {
                    if ([respCType containsString:[substr lowercaseString]]) {
                        respType = @"blob";
                        respFile = YES;
                        destPath = [ReactNativeBlobUtilFS getTempPath:taskId withExtension:nil];
                        break;
                    }
                }
            } else {
                respType = @"blob";

                // for XMLHttpRequest, switch response data handling strategy automatically
                if ([options valueForKey:@"auto"]) {
                    respFile = YES;
                    destPath = [ReactNativeBlobUtilFS getTempPath:taskId withExtension:@""];
                }
            }
        } else {
            respType = @"text";
        }

#pragma mark - handling cookies
        // # 153 get cookies
        if (response.URL) {
            NSHTTPCookieStorage * cookieStore = [NSHTTPCookieStorage sharedHTTPCookieStorage];
            NSArray<NSHTTPCookie *> * cookies = [NSHTTPCookie cookiesWithResponseHeaderFields: headers forURL:response.URL];
            if (cookies.count) {
                [cookieStore setCookies:cookies forURL:response.URL mainDocumentURL:nil];
            }
        }
        [self.baseModule emitEventDict : EVENT_STATE_CHANGE
         body:@{
                @"taskId": taskId,
                @"state": @"2",
                @"headers": headers,
                @"redirects": redirects,
                @"respType" : respType,
                @"timeout" : @NO,
                @"status": [NSNumber numberWithInteger:statusCode]
                }
         ];
    } else {
        NSLog(@"oops");
    }

    [self configureWriteStream];

    completionHandler(NSURLSessionResponseAllow);
}


// download progress handler
- (void) URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveData:(NSData *)data
{
    // For #143 handling multipart/x-mixed-replace response
    if (self.isServerPush)
    {
        [partBuffer appendData:data];

        return ;
    }

    NSNumber * received = [NSNumber numberWithLong:[data length]];
    receivedBytes += [received longValue];
    NSString * chunkString = @"";

    if (isIncrement) {
        chunkString = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    }

    // If we need to process the data, we defer writing into the file until the we have all the data, at which point
    // we can perform the processing and then write into the file
    [self processData:data];

    if (expectedBytes == 0) {
        return;
    }

    // For non-chunked download, progress is received / expected
    // For chunked download, progress can be either 0 (started) or 1 (ended)
    NSNumber *now;
    if (expectedBytes != NSURLResponseUnknownLength) {
        now = [NSNumber numberWithFloat:((float)receivedBytes/(float)expectedBytes)];
    } else {
        now = @0;
    }

    if ([self.progressConfig shouldReport:now]) {
        NSDictionary *body;
        if (expectedBytes == NSURLResponseUnknownLength) {
            // For chunked downloads
            body = @{
                @"taskId": taskId,
                @"written": [NSString stringWithFormat:@"%d", 0],
                @"total": [NSString stringWithFormat:@"%lld", (long long) expectedBytes],
                @"chunk": chunkString,
            };
        } else {
            // For non-chunked downloads
            body = @{
                @"taskId": taskId,
                @"written": [NSString stringWithFormat:@"%lld", (long long) receivedBytes],
                @"total": [NSString stringWithFormat:@"%lld", (long long) expectedBytes],
                @"chunk": chunkString,
            };
        }
        [self.baseModule emitEventDict:EVENT_PROGRESS body:body];
    }
}

- (void) URLSession:(NSURLSession *)session didBecomeInvalidWithError:(nullable NSError *)error
{
    if ([session isEqual:session]) {
        session = nil;
    }
}


- (void) URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error
{

    self.error = error;
    NSString * errMsg;
    NSString * respStr;
    NSString * rnfbRespType;

    // only run this if we were requested to change it
    if ([[options objectForKey:CONFIG_INDICATOR] boolValue]) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [[UIApplication sharedApplication] setNetworkActivityIndicatorVisible:NO];
        });
    }

    if (error) {
        if (error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) {
            errMsg = @"task cancelled";
        } else {
            errMsg = [error localizedDescription];
        }
    } else if ([self.progressConfig shouldReport:@1] && expectedBytes == NSURLResponseUnknownLength) {
        // For chunked downloads
        [self.baseModule emitEventDict:EVENT_PROGRESS body:@{
            @"taskId": taskId,
            @"written": [NSString stringWithFormat:@"%lld", (long long) receivedBytes],
            @"total": [NSString stringWithFormat:@"%lld", (long long) receivedBytes],
            @"chunk": @"",
        }];
    }

    if (respFile) {
        if ([self ShouldTransformFile]) {
            // At this point, we have the data that we deferred to write into a file. We can now
            // perform the conversion and write the converted data into the file.
            NSObject<FileTransformer>* fileTransformer = [ReactNativeBlobUtilFileTransformer getFileTransformer];
            if (!fileTransformer) {
                errMsg = @"Transform file specified but file transfomer not set";
            } else {
                @try{
                    NSData* transformedData = [fileTransformer onWriteFile:respData];
                    [writeStream write:(const uint8_t *)[transformedData bytes] maxLength:[transformedData length]];
                } @catch(NSException * ex)
                {
                    errMsg = [NSString stringWithFormat:@"Exception on File Transformer: '%@' ", [ex description]];
                }
            }
        }
        [writeStream close];
        rnfbRespType = RESP_TYPE_PATH;
        respStr = destPath;
    } else { // base64 response
        // #73 fix unicode data encoding issue :
        // when response type is BASE64, we should first try to encode the response data to UTF8 format
        // if it turns out not to be `nil` that means the response data contains valid UTF8 string,
        // in order to properly encode the UTF8 string, use URL encoding before BASE64 encoding.
        NSString * utf8 = [[NSString alloc] initWithData:respData encoding:NSUTF8StringEncoding];

        if (responseFormat == BASE64) {
            rnfbRespType = RESP_TYPE_BASE64;
            respStr = [respData base64EncodedStringWithOptions:0];
        } else if (responseFormat == UTF8) {
            rnfbRespType = RESP_TYPE_UTF8;
            respStr = utf8;
        } else {
            if (utf8) {
                rnfbRespType = RESP_TYPE_UTF8;
                respStr = utf8;
            } else {
                rnfbRespType = RESP_TYPE_BASE64;
                respStr = [respData base64EncodedStringWithOptions:0];
            }
        }
    }

    NSHTTPURLResponse *response = (NSHTTPURLResponse *) [task response];

    callback(@[
               errMsg ?: [NSNull null],
               rnfbRespType ?: @"",
               respStr ?: [NSNull null],
                 @{
                     @"status": [NSNumber numberWithInteger:[response statusCode]]
                 }
             ]);

    [[ReactNativeBlobUtilNetwork sharedInstance] removeRequestForTaskId:self.taskId];
    respData = nil;
    receivedBytes = 0;
    [session finishTasksAndInvalidate];

}

- (BOOL) ShouldTransformFile{
    return [[options valueForKey:CONFIG_TRANSFORM_FILE] boolValue];
}

// upload progress handler
- (void) URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didSendBodyData:(int64_t)bytesSent totalBytesSent:(int64_t)totalBytesWritten totalBytesExpectedToSend:(int64_t)totalBytesExpectedToWrite
{
    if (totalBytesExpectedToWrite == 0) {
        return;
    }

    NSNumber * now = [NSNumber numberWithFloat:((float)totalBytesWritten/(float)totalBytesExpectedToWrite)];

    if ([self.uploadProgressConfig shouldReport:now]) {
        [self.baseModule emitEventDict:EVENT_PROGRESS_UPLOAD
         body:@{
                @"taskId": taskId,
                @"written": [NSString stringWithFormat:@"%ld", (long) totalBytesWritten],
                @"total": [NSString stringWithFormat:@"%ld", (long) totalBytesExpectedToWrite]
                }
         ];
    }
}


- (void) URLSession:(NSURLSession *)session didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential * _Nullable credantial))completionHandler
{
    if ([[options valueForKey:CONFIG_TRUSTY] boolValue]) {
        completionHandler(NSURLSessionAuthChallengeUseCredential, [NSURLCredential credentialForTrust:challenge.protectionSpace.serverTrust]);
    } else {
        completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, [NSURLCredential credentialForTrust:challenge.protectionSpace.serverTrust]);
    }
}


- (void) URLSessionDidFinishEventsForBackgroundURLSession:(NSURLSession *)session
{
    NSLog(@"sess done in background");
}

- (void) URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest * _Nullable))completionHandler
{

    if (followRedirect) {
        if (request.URL) {
            [redirects addObject:[request.URL absoluteString]];
        }

        completionHandler(request);
    } else {
        completionHandler(nil);
    }
}

// NSURLSessionDownloadTask delegates

#pragma mark NSURLSessionDownloadTask delegate methods

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask didFinishDownloadingToURL:(NSURL *)location {

    NSFileManager *fm = [NSFileManager defaultManager];
    if (respFile && ![self ShouldTransformFile]) {
        if (writeStream) {
            [writeStream close];
            writeStream = nil;
        }

        NSString *folder = [destPath stringByDeletingLastPathComponent];
        if (![fm fileExistsAtPath:folder]) {
            [fm createDirectoryAtPath:folder withIntermediateDirectories:YES attributes:NULL error:nil];
        }

        BOOL overwrite = [options valueForKey:@"overwrite"] == nil ? YES : [[options valueForKey:@"overwrite"] boolValue];
        BOOL appendToExistingFile = [destPath containsString:@"?append=true"] || !overwrite;
        NSString *normalizedDestPath = [destPath stringByReplacingOccurrencesOfString:@"?append=true" withString:@""];
        destPath = normalizedDestPath;

        if (!appendToExistingFile && [fm fileExistsAtPath:destPath]) {
            [fm removeItemAtPath:destPath error:nil];
        }

        if (!appendToExistingFile) {
            NSError *moveError = nil;
            if ([fm moveItemAtURL:location toURL:[NSURL fileURLWithPath:destPath] error:&moveError]) {
                return;
            }
        }

        if ([self copyDownloadedFile:location toPath:destPath append:appendToExistingFile]) {
            return;
        }
    }

    NSData *data = [fm contentsAtPath:location.path];
    [self configureWriteStream];
    [self processData:data];

}

- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)downloadTask didWriteData:(int64_t)bytesWritten totalBytesWritten:(int64_t)totalBytesWritten totalBytesExpectedToWrite:(int64_t)totalBytesExpectedToWrite {
    if (totalBytesExpectedToWrite == 0) {
        return;
    }

    NSNumber * now =[NSNumber numberWithFloat:((float)totalBytesWritten/(float)totalBytesExpectedToWrite)];
    if ([self.progressConfig shouldReport:now]) {
        [self.baseModule emitEventDict:EVENT_PROGRESS
         body:@{
                @"taskId": taskId,
                @"written": [NSString stringWithFormat:@"%lld", (long long) totalBytesWritten],
                @"total": [NSString stringWithFormat:@"%lld", (long long) totalBytesExpectedToWrite]
                }
         ];
    }
}

@end
