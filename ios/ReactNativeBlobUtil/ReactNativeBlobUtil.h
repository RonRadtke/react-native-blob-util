//
//  ReactNativeBlobUtil.h
//
//  Created by wkh237 on 2016/4/28.
//

//XXX: DO NO REMOVE THIS LINE IF YOU'RE USING IT ON RN > 0.40 PROJECT



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


@interface ReactNativeBlobUtil : RCTEventEmitter <RCTBridgeModule, UIDocumentInteractionControllerDelegate> {

    NSString * filePathPrefix;

}

@property (nonatomic) NSString * filePathPrefix;
@property (retain) UIDocumentInteractionController * documentController;

-(void) emitEvent:(NSString *)name body:(NSString *) body;
-(void) emitEventDict:(NSString *)name body:(NSDictionary *) body;

@end

@interface ReactNativeBlobUtil () <NativeBlobUtilsSpec>
@end

#endif /* ReactNativeBlobUtil_h */
