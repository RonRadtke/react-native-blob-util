//
//  ReactNativeBlobUtilNetwork.h
//  ReactNativeBlobUtil
//
//  Created by wkh237 on 2016/6/6.
//  Copyright © 2016 wkh237. All rights reserved.
//

#ifndef ReactNativeBlobUtilNetwork_h
#define ReactNativeBlobUtilNetwork_h

#import <Foundation/Foundation.h>
#import "ReactNativeBlobUtilProgress.h"
#import "ReactNativeBlobUtilFS.h"
#import "ReactNativeBlobUtilRequest.h"

#if __has_include(<React/RCTAssert.h>)
#import <React/RCTBridgeModule.h>
#else
#import "RCTBridgeModule.h"
#endif


@interface ReactNativeBlobUtilNetwork : NSObject  <NSURLSessionDelegate, NSURLSessionTaskDelegate, NSURLSessionDataDelegate>

@property(nonnull, nonatomic) NSOperationQueue *taskQueue;
@property(nonnull, nonatomic) NSMapTable<NSString*, ReactNativeBlobUtilRequest*> * requestsTable;
@property(nonnull, nonatomic) NSMutableDictionary<NSString*, ReactNativeBlobUtilProgress*> *rebindProgressDict;
@property(nonnull, nonatomic) NSMutableDictionary<NSString*, ReactNativeBlobUtilProgress*> *rebindUploadProgressDict;

+ (ReactNativeBlobUtilNetwork* _Nullable)sharedInstance;
+ (NSMutableDictionary  * _Nullable ) normalizeHeaders:(NSDictionary * _Nullable)headers;

- (nullable id) init;
- (void) sendRequest:(NSDictionary  * _Nullable )options
       contentLength:(long)contentLength
              baseModule:(ReactNativeBlobUtil * _Nullable)baseModule
              taskId:(NSString * _Nullable)taskId
         withRequest:(NSURLRequest * _Nullable)req
            callback:(_Nullable RCTResponseSenderBlock) callback;
- (void) cancelRequest:(NSString * _Nonnull)taskId;
- (void) enableProgressReport:(NSString * _Nonnull) taskId config:(ReactNativeBlobUtilProgress * _Nullable)config;
- (void) enableUploadProgress:(NSString * _Nonnull) taskId config:(ReactNativeBlobUtilProgress * _Nullable)config;
- (void) removeRequestForTaskId:(NSString * _Nonnull)taskId;


@end


#endif /* ReactNativeBlobUtilNetwork_h */
