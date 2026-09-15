//
//  ReactNativeBlobUtil.h
//
//  Created by wkh237 on 2016/4/28.
//

#ifndef ReactNativeBlobUtil_h
#define ReactNativeBlobUtil_h

#if __has_include(<React/RCTAssert.h>)
#import <React/RCTLog.h>
#import <React/RCTRootView.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#else
#import "RCTBridgeModule.h"
#import "RCTLog.h"
#import "RCTRootView.h"
#import "RCTBridge.h"
#import "RCTEventEmitter.h"
#endif

#import <UIKit/UIKit.h>
#import <ReactNativeBlobUtilSpec/ReactNativeBlobUtilSpec.h>

/// The adapter. Everything this module does lives in Swift, in
/// ReactNativeBlobUtilModuleCore; what is here is what cannot: the module
/// macro, the RCTEventEmitter subclass, the TurboModule hook, and one
/// forwarding method per spec method that converts React's block types into
/// the closures the Swift takes.
@interface ReactNativeBlobUtil : RCTEventEmitter <RCTBridgeModule, NativeBlobUtilsSpec>

-(void) emitEventDict:(NSString *)name body:(NSDictionary *) body;

@end

#endif /* ReactNativeBlobUtil_h */
