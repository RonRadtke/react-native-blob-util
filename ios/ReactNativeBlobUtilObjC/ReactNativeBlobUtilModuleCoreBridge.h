//
//  ReactNativeBlobUtilModuleCoreBridge.h
//
//  The seam between the Objective-C++ adapter and the Swift core.
//
//  SwiftPM compiles the two in separate targets (Swift and C-family cannot
//  share one), and a C-family target cannot see a sibling Swift target's
//  generated -Swift.h - Xcode writes it inside DerivedData and no manifest can
//  put that on the include path. So the adapter must not name the Swift class
//  at all. It talks to this protocol instead, and gets its instance from
//  NSClassFromString, which needs no compile-time declaration.
//
//  ReactNativeBlobUtilModuleCore declares conformance on the Swift side, so a
//  signature that drifts from this file is a Swift compile error rather than a
//  runtime crash. That checking is the whole point of using a protocol here
//  instead of a hand-written @interface mirroring the class.
//
//  Deliberately React-free: the block types are spelled structurally rather
//  than as RCTPromiseResolveBlock and friends, so this header stays safe to
//  make public. The adapter converts React's typedefs to these, which it can
//  do because the typedefs ARE these types.
//
//  Only what the adapter uses is declared here. A narrower surface is less to
//  keep in step.
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import "ReactNativeBlobUtilEventSink.h"

// NS_SWIFT_NAME where it appears: Swift's importer splits an Objective-C
// selector at an embedded preposition, so pathForAppGroup:resolve:reject: would
// arrive as path(forAppGroup:resolve:reject:) and not satisfy the core's
// declaration. Pinning the Swift spelling here keeps the conformance - and so
// the drift check - intact.
@protocol ReactNativeBlobUtilModuleCoreBridge <NSObject>

@property (nonatomic, weak) id <ReactNativeBlobUtilEventSink> _Nullable eventSink;
@property (nonatomic, copy) UIViewController * _Nullable (^ _Nullable presentingViewController)(void);

/// Forwards to the warning handler the Swift core consults. Swift cannot
/// import React, so the adapter injects an RCTLogWarn shim through here.
- (void)setWarningHandler:(void (^ _Nullable)(NSString * _Nonnull))handler;

/// The instance spelling of what Swift also exposes as a class method. The
/// adapter holds an instance, not the class, so the class method is unreachable.
- (NSDictionary<NSString *, id> * _Nonnull)constantsToExport;

/// Where events go. The adapter conforms to this.
/// Supplies the controller the document menus present from. Only the
/// adapter can answer this, because the answer comes from React.
- (void)fetchBlobForm:(NSDictionary<NSString *, id> * _Nullable)options taskId:(NSString * _Nonnull)taskId method:(NSString * _Nonnull)method url:(NSString * _Nonnull)url headers:(NSDictionary<NSString *, id> * _Nullable)headers form:(NSArray<NSDictionary<NSString *, id> *> * _Nullable)form callback:(void (^ _Nonnull)(NSArray * _Nonnull))callback;
- (void)fetchBlob:(NSDictionary<NSString *, id> * _Nullable)options taskId:(NSString * _Nonnull)taskId method:(NSString * _Nonnull)method url:(NSString * _Nonnull)url headers:(NSDictionary<NSString *, id> * _Nullable)headers body:(NSString * _Nullable)body callback:(void (^ _Nonnull)(NSArray * _Nonnull))callback;
- (void)createFile:(NSString * _Nonnull)path data:(NSString * _Nonnull)data encoding:(NSString * _Nonnull)encoding resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)createFileASCII:(NSString * _Nonnull)path data:(NSArray<NSNumber *> * _Nonnull)data resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)pathForAppGroup:(NSString * _Nonnull)groupName resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(pathForAppGroup(_:resolve:reject:));
- (NSString * _Nonnull)syncPathAppGroup:(NSString * _Nonnull)groupName;
- (void)exists:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)writeFile:(NSString * _Nonnull)path encoding:(NSString * _Nonnull)encoding data:(NSString * _Nonnull)data transformFile:(BOOL)transformFile append:(BOOL)append resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)writeFileArray:(NSString * _Nonnull)path data:(NSArray<NSNumber *> * _Nonnull)data append:(BOOL)append resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)mkdir:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)hash:(NSString * _Nonnull)path algorithm:(NSString * _Nonnull)algorithm resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)slice:(NSString * _Nonnull)src dest:(NSString * _Nonnull)dest start:(double)start end:(double)end resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)df:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)cancelRequest:(NSString * _Nonnull)taskId resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)enableProgressReport:(NSString * _Nonnull)taskId interval:(double)interval count:(double)count;
/// interval and count are Double here, matching the spec. The Objective-C
/// declared them as NSNumber, which did not conform and only worked because
/// the runtime boxed them on the way in.
- (void)enableUploadProgressReport:(NSString * _Nonnull)taskId interval:(double)interval count:(double)count;
- (void)writeStream:(NSString * _Nonnull)path withEncoding:(NSString * _Nonnull)encoding appendData:(BOOL)append resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)writeArrayChunk:(NSString * _Nonnull)streamId withArray:(NSArray<NSNumber *> * _Nonnull)dataArray resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(writeArrayChunk(_:withArray:resolve:reject:));
- (void)writeChunk:(NSString * _Nonnull)streamId withData:(NSString * _Nonnull)data resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)closeStream:(NSString * _Nonnull)streamId resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)readStream:(NSString * _Nonnull)path encoding:(NSString * _Nonnull)encoding bufferSize:(double)bufferSize tick:(double)tick streamId:(NSString * _Nonnull)streamId;
- (void)unlink:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)removeSession:(NSArray<NSString *> * _Nonnull)paths resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)ls:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)stat:(NSString * _Nonnull)target resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)lstat:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)cp:(NSString * _Nonnull)src dest:(NSString * _Nonnull)dest resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)mv:(NSString * _Nonnull)path dest:(NSString * _Nonnull)dest resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)readFile:(NSString * _Nonnull)path encoding:(NSString * _Nonnull)encoding transformFile:(BOOL)transformFile resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)excludeFromBackupKey:(NSString * _Nonnull)url resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(excludeFromBackupKey(_:resolve:reject:));
- (void)presentOptionsMenu:(NSString * _Nonnull)uri scheme:(NSString * _Nullable)scheme resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)presentOpenInMenu:(NSString * _Nonnull)uri scheme:(NSString * _Nullable)scheme resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(presentOpenInMenu(_:scheme:resolve:reject:));
- (void)presentPreview:(NSString * _Nonnull)uri scheme:(NSString * _Nullable)scheme resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)actionViewIntent:(NSString * _Nonnull)path mime:(NSString * _Nonnull)mime chooserTitle:(NSString * _Nonnull)chooserTitle resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)addCompleteDownload:(NSDictionary<NSString *, id> * _Nonnull)config resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)copyToInternal:(NSString * _Nonnull)contentUri destpath:(NSString * _Nonnull)destpath resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(copyToInternal(_:destpath:resolve:reject:));
- (void)copyToMediaStore:(NSDictionary<NSString *, id> * _Nonnull)filedata mt:(NSString * _Nonnull)mt path:(NSString * _Nonnull)path resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(copyToMediaStore(_:mt:path:resolve:reject:));
- (void)createMediaFile:(NSDictionary<NSString *, id> * _Nonnull)filedata mt:(NSString * _Nonnull)mt resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)getBlob:(NSString * _Nonnull)contentUri encoding:(NSString * _Nonnull)encoding resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)getContentIntent:(NSString * _Nonnull)mime resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)getSDCardDir:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)getSDCardApplicationDir:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)scanFile:(NSArray * _Nonnull)pairs resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject;
- (void)writeToMediaFile:(NSString * _Nonnull)fileUri path:(NSString * _Nonnull)path transformFile:(BOOL)transformFile resolve:(void (^ _Nonnull)(id _Nullable))resolve reject:(void (^ _Nonnull)(NSString * _Nullable, NSString * _Nullable, NSError * _Nullable))reject
    NS_SWIFT_NAME(writeToMediaFile(_:path:transformFile:resolve:reject:));

@end
