// The AppDelegate change that lets iOS hand the library the events of its
// background URLSession when the app was relaunched for them: background
// downloads (config({background})) that ended while the app was not running.
// Pure string transforms, so they are unit-tested without Expo.

const MARKER = "react-native-blob-util: background downloads";

const SWIFT_METHOD = `
  // ${MARKER} that end while the app is not running.
  public override func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    if !ReactNativeBlobUtilBackground.handleEvents(forBackgroundURLSession: identifier, completionHandler: completionHandler) {
      super.application(application, handleEventsForBackgroundURLSession: identifier, completionHandler: completionHandler)
    }
  }
`;

// The Swift class ReactNativeBlobUtilBackground, for Objective-C: the header Swift
// generates sits in the module's folder with frameworks, beside it without.
const SWIFT_HEADER = `#if __has_include(<react_native_blob_util/react_native_blob_util-Swift.h>)
#import <react_native_blob_util/react_native_blob_util-Swift.h>
#else
#import "react_native_blob_util-Swift.h"
#endif
`;

const OBJC_METHOD = `
// ${MARKER} that end while the app is not running.
- (void)application:(UIApplication *)application handleEventsForBackgroundURLSession:(NSString *)identifier completionHandler:(void (^)(void))completionHandler
{
  if (![ReactNativeBlobUtilBackground handleEventsForBackgroundURLSession:identifier completionHandler:completionHandler]
      && [super respondsToSelector:@selector(application:handleEventsForBackgroundURLSession:completionHandler:)]) {
    [super application:application handleEventsForBackgroundURLSession:identifier completionHandler:completionHandler];
  }
}
`;

/**
 * A Swift AppDelegate with the method added, or as it was when it has it, or
 * when it is not a class AppDelegate this knows where to put it in.
 * @param {string} contents
 * @returns {string}
 */
function addToSwiftAppDelegate(contents) {
    if (contents.includes(MARKER) || /handleEventsForBackgroundURLSession/.test(contents)) {
        return contents;
    }
    const declaration = /^[^\n]*\bclass\s+AppDelegate\b[^\n{]*\{[^\n]*\n/m.exec(contents);
    if (!declaration) {
        return contents;
    }
    const at = declaration.index + declaration[0].length;
    let out = contents.slice(0, at) + SWIFT_METHOD + contents.slice(at);
    if (!/^import\s+react_native_blob_util\b/m.test(out)) {
        const imports = [...out.matchAll(/^import\s+[^\n]+\n/gm)];
        const after = imports.length > 0 ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
        out = out.slice(0, after) + "import react_native_blob_util\n" + out.slice(after);
    }
    return out;
}

/**
 * An Objective-C AppDelegate with the method added before the @end of its
 * @implementation, and the library's header imported.
 * @param {string} contents
 * @returns {string}
 */
function addToObjcAppDelegate(contents) {
    if (contents.includes(MARKER) || /handleEventsForBackgroundURLSession/.test(contents)) {
        return contents;
    }
    const implementation = /@implementation\s+AppDelegate\b/.exec(contents);
    if (!implementation) {
        return contents;
    }
    const end = contents.indexOf("@end", implementation.index);
    if (end < 0) {
        return contents;
    }
    let out = contents.slice(0, end) + OBJC_METHOD.trimStart() + "\n" + contents.slice(end);
    if (!out.includes("react_native_blob_util-Swift.h")) {
        const imports = [...out.matchAll(/^#import\s+[^\n]+\n/gm)];
        const after = imports.length > 0 ? imports[imports.length - 1].index + imports[imports.length - 1][0].length : 0;
        out = out.slice(0, after) + SWIFT_HEADER + out.slice(after);
    }
    return out;
}

module.exports = {MARKER, addToSwiftAppDelegate, addToObjcAppDelegate};
