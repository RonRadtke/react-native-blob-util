//
//  ReactNativeBlobUtil.mm
//
//  Created by wkh237 on 2016/4/28.
//
//  The adapter. The logic moved to ReactNativeBlobUtilModuleCore in Swift; what
//  is left is what needs React or C++: the module macro, the RCTEventEmitter
//  subclass, getTurboModule, and one forwarding method per spec method.
//
//  Every method here converts argument types and calls straight through. If a
//  forwarding method grows a branch, it belongs in the Swift instead.
//

#import "ReactNativeBlobUtil.h"

#if __has_include(<react_native_blob_util/react_native_blob_util-Swift.h>)
#import <react_native_blob_util/react_native_blob_util-Swift.h>
#else
#import "react_native_blob_util-Swift.h"
#endif

dispatch_queue_t commonTaskQueue;

@interface ReactNativeBlobUtil () <ReactNativeBlobUtilEventSink>
@property (nonatomic, strong) ReactNativeBlobUtilModuleCore *core;
@end

@implementation ReactNativeBlobUtil

static bool hasListeners = NO;

RCT_EXPORT_MODULE();

- (id) init {
    self = [super init];
    if (self) {
        _core = [[ReactNativeBlobUtilModuleCore alloc] init];
        _core.eventSink = self;
        // Plain UIKit rather than a React helper, but only the adapter is in a
        // position to reach for it, so the Swift takes it as a provider.
        _core.presentingViewController = ^UIViewController * _Nullable {
            return [[[[UIApplication sharedApplication] delegate] window] rootViewController];
        };
        if (commonTaskQueue == nil)
            commonTaskQueue = dispatch_queue_create("ReactNativeBlobUtil.queue", DISPATCH_QUEUE_SERIAL);
    }
    return self;
}

#pragma mark - module plumbing

- (NSArray<NSString*> *)supportedEvents {
    return @[@"ReactNativeBlobUtilState", @"ReactNativeBlobUtilServerPush", @"ReactNativeBlobUtilProgress", @"ReactNativeBlobUtilProgress-upload", @"ReactNativeBlobUtilExpire", @"ReactNativeBlobUtilMessage", @"ReactNativeBlobUtilFilesystem", @"log", @"warn", @"error", @"data", @"end", @"reportProgress", @"reportUploadProgress"];
}

- (void)startObserving { hasListeners = YES; }
- (void)stopObserving { hasListeners = NO; }

- (dispatch_queue_t) methodQueue {
    if (commonTaskQueue == nil)
        commonTaskQueue = dispatch_queue_create("ReactNativeBlobUtil.queue", DISPATCH_QUEUE_SERIAL);
    return commonTaskQueue;
}

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSDictionary *)getConstants { return [ReactNativeBlobUtilModuleCore constantsToExport]; }
- (NSDictionary *)constantsToExport { return [ReactNativeBlobUtilModuleCore constantsToExport]; }

#pragma mark - events

- (void)emitEvent:(NSString *)name body:(NSString *)body {
    if (hasListeners) {
        [self sendEventWithName:name body:body];
    }
}

/// Events reach JS as a JSON *string*, not an object. fs.js parses it.
- (void)emitEventDict:(NSString *)name body:(NSDictionary *)body {
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:body
                                                       options:NSJSONWritingPrettyPrinted
                                                         error:&error];
    if (error) {
        NSLog(@"Got an error: %@", error);
    } else {
        [self emitEvent:name body:[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding]];
    }
}

#pragma mark - fetch

RCT_EXPORT_METHOD(fetchBlobForm:(NSDictionary *)options taskId:(NSString *)taskId method:(NSString *)method url:(NSString *)url headers:(NSDictionary *)headers form:(NSArray *)form callback:(RCTResponseSenderBlock)callback) {
    [self.core fetchBlobForm:options taskId:taskId method:method url:url headers:headers form:form callback:callback];
}

RCT_EXPORT_METHOD(fetchBlob:(NSDictionary *)options taskId:(NSString *)taskId method:(NSString *)method url:(NSString *)url headers:(NSDictionary *)headers body:(NSString *)body callback:(RCTResponseSenderBlock)callback) {
    [self.core fetchBlob:options taskId:taskId method:method url:url headers:headers body:body callback:callback];
}

#pragma mark - file system

- (void)createFile:(NSString *)path data:(NSString *)data encoding:(NSString *)encoding resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core createFile:path data:data encoding:encoding resolve:resolve reject:reject];
}

- (void)createFileASCII:(NSString *)path data:(NSArray *)data resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core createFileASCII:path data:data resolve:resolve reject:reject];
}

- (void)pathForAppGroup:(NSString *)groupName resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core pathForAppGroup:groupName resolve:resolve reject:reject];
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(syncPathAppGroup:(NSString *)groupName) {
    return [self.core syncPathAppGroup:groupName];
}

RCT_EXPORT_METHOD(exists:(NSString *)path callback:(RCTResponseSenderBlock)callback) {
    [self.core exists:path callback:callback];
}

- (void)writeFile:(NSString *)path encoding:(NSString *)encoding data:(NSString *)data transformFile:(BOOL)transformFile append:(BOOL)append resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core writeFile:path encoding:encoding data:data transformFile:transformFile append:append resolve:resolve reject:reject];
}

- (void)writeFileArray:(NSString *)path data:(NSArray *)data append:(BOOL)append resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core writeFileArray:path data:data append:append resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(writeStream:(NSString *)path withEncoding:(NSString *)encoding appendData:(BOOL)append callback:(RCTResponseSenderBlock)callback) {
    [self.core writeStream:path withEncoding:encoding appendData:append callback:callback];
}

RCT_EXPORT_METHOD(writeArrayChunk:(NSString *)streamId withArray:(NSArray *)dataArray callback:(RCTResponseSenderBlock)callback) {
    [self.core writeArrayChunk:streamId withArray:dataArray callback:callback];
}

RCT_EXPORT_METHOD(writeChunk:(NSString *)streamId withData:(NSString *)data callback:(RCTResponseSenderBlock)callback) {
    [self.core writeChunk:streamId withData:data callback:callback];
}

RCT_EXPORT_METHOD(closeStream:(NSString *)streamId callback:(RCTResponseSenderBlock)callback) {
    [self.core closeStream:streamId callback:callback];
}

RCT_EXPORT_METHOD(unlink:(NSString *)path callback:(RCTResponseSenderBlock)callback) {
    [self.core unlink:path callback:callback];
}

RCT_EXPORT_METHOD(removeSession:(NSArray *)paths callback:(RCTResponseSenderBlock)callback) {
    [self.core removeSession:paths callback:callback];
}

- (void)ls:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core ls:path resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(stat:(NSString *)target callback:(RCTResponseSenderBlock)callback) {
    [self.core stat:target callback:callback];
}

RCT_EXPORT_METHOD(lstat:(NSString *)path callback:(RCTResponseSenderBlock)callback) {
    [self.core lstat:path callback:callback];
}

- (void)cp:(NSString *)src dest:(NSString *)dest callback:(RCTResponseSenderBlock)callback {
    [self.core cp:src dest:dest callback:callback];
}

- (void)mv:(NSString *)path dest:(NSString *)dest callback:(RCTResponseSenderBlock)callback {
    [self.core mv:path dest:dest callback:callback];
}

- (void)mkdir:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core mkdir:path resolve:resolve reject:reject];
}

- (void)readFile:(NSString *)path encoding:(NSString *)encoding transformFile:(BOOL)transformFile resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core readFile:path encoding:encoding transformFile:transformFile resolve:resolve reject:reject];
}

- (void)hash:(NSString *)path algorithm:(NSString *)algorithm resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core hash:path algorithm:algorithm resolve:resolve reject:reject];
}

- (void)slice:(NSString *)src dest:(NSString *)dest start:(double)start end:(double)end resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core slice:src dest:dest start:start end:end resolve:resolve reject:reject];
}

RCT_EXPORT_METHOD(readStream:(NSString *)path encoding:(NSString *)encoding bufferSize:(double)bufferSize tick:(double)tick streamId:(NSString *)streamId) {
    [self.core readStream:path encoding:encoding bufferSize:bufferSize tick:tick streamId:streamId];
}

RCT_EXPORT_METHOD(getEnvironmentDirs:(RCTResponseSenderBlock)callback) {
    [self.core getEnvironmentDirs:callback];
}

RCT_EXPORT_METHOD(df:(RCTResponseSenderBlock)callback) {
    [self.core df:callback];
}

- (void)excludeFromBackupKey:(NSString *)url resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core excludeFromBackupKey:url resolve:resolve reject:reject];
}

#pragma mark - network

RCT_EXPORT_METHOD(cancelRequest:(NSString *)taskId callback:(RCTResponseSenderBlock)callback) {
    [self.core cancelRequest:taskId callback:callback];
}

RCT_EXPORT_METHOD(enableProgressReport:(NSString *)taskId interval:(double)interval count:(double)count) {
    [self.core enableProgressReport:taskId interval:interval count:count];
}

RCT_EXPORT_METHOD(enableUploadProgressReport:(NSString *)taskId interval:(double)interval count:(double)count) {
    [self.core enableUploadProgressReport:taskId interval:interval count:count];
}

RCT_EXPORT_METHOD(emitExpiredEvent:(RCTResponseSenderBlock)callback) {
    [self.core emitExpiredEvent:callback];
}

#pragma mark - document menus

- (void)presentOptionsMenu:(NSString *)uri scheme:(NSString *)scheme resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core presentOptionsMenu:uri scheme:scheme resolve:resolve reject:reject];
}

- (void)presentOpenInMenu:(NSString *)uri scheme:(NSString *)scheme resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core presentOpenInMenu:uri scheme:scheme resolve:resolve reject:reject];
}

- (void)presentPreview:(NSString *)uri scheme:(NSString *)scheme resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core presentPreview:uri scheme:scheme resolve:resolve reject:reject];
}

#pragma mark - Android only

- (void)actionViewIntent:(NSString *)path mime:(NSString *)mime chooserTitle:(NSString *)chooserTitle resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core actionViewIntent:path mime:mime chooserTitle:chooserTitle resolve:resolve reject:reject];
}

- (void)addCompleteDownload:(NSDictionary *)config resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core addCompleteDownload:config resolve:resolve reject:reject];
}

- (void)copyToInternal:(NSString *)contentUri destpath:(NSString *)destpath resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core copyToInternal:contentUri destpath:destpath resolve:resolve reject:reject];
}

- (void)copyToMediaStore:(NSDictionary *)filedata mt:(NSString *)mt path:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core copyToMediaStore:filedata mt:mt path:path resolve:resolve reject:reject];
}

- (void)createMediaFile:(NSDictionary *)filedata mt:(NSString *)mt resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core createMediaFile:filedata mt:mt resolve:resolve reject:reject];
}

- (void)getBlob:(NSString *)contentUri encoding:(NSString *)encoding resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core getBlob:contentUri encoding:encoding resolve:resolve reject:reject];
}

- (void)getContentIntent:(NSString *)mime resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core getContentIntent:mime resolve:resolve reject:reject];
}

- (void)getSDCardDir:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core getSDCardDir:resolve reject:reject];
}

- (void)getSDCardApplicationDir:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core getSDCardApplicationDir:resolve reject:reject];
}

- (void)scanFile:(NSArray *)pairs callback:(RCTResponseSenderBlock)callback {
    [self.core scanFile:pairs callback:callback];
}

- (void)writeToMediaFile:(NSString *)fileUri path:(NSString *)path transformFile:(BOOL)transformFile resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
    [self.core writeToMediaFile:fileUri path:path transformFile:transformFile resolve:resolve reject:reject];
}

#pragma mark - New Architecture

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeBlobUtilsSpecJSI>(params);
}

@end
