//
//  ReactNativeBlobUtilNetwork.m
//  ReactNativeBlobUtil
//
//  Created by wkh237 on 2016/6/6.
//  Copyright © 2016 wkh237. All rights reserved.
//


#import <Foundation/Foundation.h>
#import "ReactNativeBlobUtilNetwork.h"

#import "ReactNativeBlobUtilConst.h"
#import "ReactNativeBlobUtilProgress.h"

#if __has_include(<React/RCTAssert.h>)
#import <React/RCTRootView.h>
#import <React/RCTLog.h>
#import <React/RCTBridge.h>
#else
#import "RCTRootView.h"
#import "RCTLog.h"
#import "RCTBridge.h"
#endif

////////////////////////////////////////
//
//  HTTP request handler
//
////////////////////////////////////////

NSMapTable * expirationTable;

__attribute__((constructor))
static void initialize_tables() {
    if (expirationTable == nil) {
        expirationTable = [[NSMapTable alloc] init];
    }
}


@implementation ReactNativeBlobUtilNetwork


- (id)init {
    self = [super init];
    if (self) {
        self.requestsTable = [NSMapTable mapTableWithKeyOptions:NSMapTableStrongMemory valueOptions:NSMapTableStrongMemory];

        self.taskQueue = [[NSOperationQueue alloc] init];
        self.taskQueue.qualityOfService = NSQualityOfServiceUtility;
        self.taskQueue.maxConcurrentOperationCount = 10;
        self.rebindProgressDict = [NSMutableDictionary dictionary];
        self.rebindUploadProgressDict = [NSMutableDictionary dictionary];
    }

    return self;
}

+ (ReactNativeBlobUtilNetwork* _Nullable)sharedInstance {
    static id _sharedInstance = nil;
    static dispatch_once_t onceToken;

    dispatch_once(&onceToken, ^{
        _sharedInstance = [[self alloc] init];
    });

    return _sharedInstance;
}

- (void) sendRequest:(__weak NSDictionary  * _Nullable )options
       contentLength:(long) contentLength
              baseModule:(ReactNativeBlobUtil * _Nullable)baseModule
              taskId:(NSString * _Nullable)taskId
         withRequest:(__weak NSURLRequest * _Nullable)req
            callback:(_Nullable RCTResponseSenderBlock) callback
{
    ReactNativeBlobUtilRequest *request = [[ReactNativeBlobUtilRequest alloc] init];
    [request sendRequest:options
           contentLength:contentLength
              baseModule:baseModule
                  taskId:taskId
             withRequest:req
      taskOperationQueue:self.taskQueue
                callback:callback];

    @synchronized([ReactNativeBlobUtilNetwork class]) {
        if (taskId != nil && request.task != nil) {
            [self.requestsTable setObject:request forKey:taskId];
            [self checkProgressConfigForTask:taskId];
        }
    }
}

- (void) checkProgressConfigForTask:(NSString *)taskId {
    //reconfig progress
    ReactNativeBlobUtilProgress *downloadConfig = self.rebindProgressDict[taskId];
    if (downloadConfig != nil) {
        [self enableProgressReport:taskId config:downloadConfig];
        [self.rebindProgressDict removeObjectForKey:taskId];
    }

    //reconfig uploadProgress
    ReactNativeBlobUtilProgress *uploadConfig = self.rebindUploadProgressDict[taskId];
    if (uploadConfig != nil) {
        [self enableUploadProgress:taskId config:uploadConfig];
        [self.rebindUploadProgressDict removeObjectForKey:taskId];
    }
}

- (void) enableProgressReport:(NSString *) taskId config:(ReactNativeBlobUtilProgress *)config
{
    if (config) {
        @synchronized ([ReactNativeBlobUtilNetwork class]) {
            if (![self.requestsTable objectForKey:taskId]) {
                [self.rebindProgressDict setValue:config forKey:taskId];
            } else {
                [self.requestsTable objectForKey:taskId].progressConfig = config;
            }
        }
    }
}

- (void) enableUploadProgress:(NSString *) taskId config:(ReactNativeBlobUtilProgress *)config
{
    if (config) {
        @synchronized ([ReactNativeBlobUtilNetwork class]) {
            if (![self.requestsTable objectForKey:taskId]) {
                [self.rebindUploadProgressDict setValue:config forKey:taskId];
            } else {
                [self.requestsTable objectForKey:taskId].uploadProgressConfig = config;
            }
        }
    }
}

- (void) cancelRequest:(NSString *)taskId
{
    NSURLSessionDataTask * task;

    @synchronized ([ReactNativeBlobUtilNetwork class]) {
        task = [self.requestsTable objectForKey:taskId].task;
        [self.requestsTable removeObjectForKey:taskId];
        [self.rebindProgressDict removeObjectForKey:taskId];
        [self.rebindUploadProgressDict removeObjectForKey:taskId];
    }

    if (task && task.state == NSURLSessionTaskStateRunning) {
        [task cancel];
    }
}

- (void) removeRequestForTaskId:(NSString *)taskId
{
    @synchronized ([ReactNativeBlobUtilNetwork class]) {
        [self.requestsTable removeObjectForKey:taskId];
        [self.rebindProgressDict removeObjectForKey:taskId];
        [self.rebindUploadProgressDict removeObjectForKey:taskId];
    }
}

// removing case from headers
+ (NSMutableDictionary *) normalizeHeaders:(NSDictionary *)headers
{
    NSMutableDictionary * mheaders = [[NSMutableDictionary alloc]init];
    for (NSString * key in headers) {
        [mheaders setValue:[headers valueForKey:key] forKey:[key lowercaseString]];
    }

    return mheaders;
}

@end
