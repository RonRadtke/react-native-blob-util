//
//  ReactNativeBlobUtilRequest.h
//  ReactNativeBlobUtil
//
//  Created by Artur Chrusciel on 15.01.18.
//  Copyright © 2018 wkh237.github.io. All rights reserved.
//

#ifndef ReactNativeBlobUtilRequest_h
#define ReactNativeBlobUtilRequest_h

#import <Foundation/Foundation.h>

#import "ReactNativeBlobUtilProgress.h"
#import "ReactNativeBlobUtil.h"

#if __has_include(<React/RCTAssert.h>)
#import <React/RCTBridgeModule.h>
#else
#import "RCTBridgeModule.h"
#endif

@interface ReactNativeBlobUtilRequest : NSObject <NSURLSessionDelegate, NSURLSessionTaskDelegate, NSURLSessionDataDelegate, NSURLSessionDownloadDelegate>

@property (nullable, nonatomic) NSString * taskId;
@property (nonatomic) long long expectedBytes;
@property (nonatomic) long long receivedBytes;
@property (nonatomic) BOOL isServerPush;
@property (nullable, nonatomic) NSMutableData * respData;
@property (nullable, strong, nonatomic) RCTResponseSenderBlock callback;
@property (nullable, strong, nonatomic) ReactNativeBlobUtil * baseModule;
@property (nullable, nonatomic) NSDictionary * options;
@property (nullable, nonatomic) NSError * error;
@property (nullable, nonatomic) ReactNativeBlobUtilProgress *progressConfig;
@property (nullable, nonatomic) ReactNativeBlobUtilProgress *uploadProgressConfig;
@property (nullable, strong, nonatomic) NSURLSessionTask *task;

- (void) sendRequest:(NSDictionary  * _Nullable )options
       contentLength:(long)contentLength
              baseModule:(ReactNativeBlobUtil * _Nullable)baseModule
              taskId:(NSString * _Nullable)taskId
         withRequest:(NSURLRequest * _Nullable)req
  taskOperationQueue:(NSOperationQueue * _Nonnull)operationQueue
            callback:(_Nullable RCTResponseSenderBlock) callback;

@end

#endif /* ReactNativeBlobUtilRequest_h */
