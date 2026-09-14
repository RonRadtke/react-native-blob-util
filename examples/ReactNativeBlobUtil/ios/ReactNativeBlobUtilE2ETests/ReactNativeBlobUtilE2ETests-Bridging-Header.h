//
//  Objective-C the tests reach before it is ported to Swift.
//
//  These headers are private to the pod - they import React, so they must not
//  go in the podspec's public_header_files, which is what the umbrella Swift
//  imports as the underlying module is built from. The test target reaches them
//  through its own header search path instead, which is why it can see them
//  while the umbrella stays React-free.
//
//  As each unit is ported, its import moves out of here and the test switches
//  to `@testable import react_native_blob_util`. ReactNativeBlobUtilFS has made
//  that move; the module core and the network stack follow in I2 and I3.
//

// The README's file-transformer snippet is compiled from Objective-C too.
#import "ReactNativeBlobUtilFileTransformer.h"
