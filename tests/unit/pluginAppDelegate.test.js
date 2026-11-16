/**
 * The Expo config plugin's AppDelegate change for iOS background downloads:
 * where it goes in a Swift and an Objective-C AppDelegate, and that running it
 * twice changes nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {addToSwiftAppDelegate, addToObjcAppDelegate, MARKER} = require('../../plugin/src/appDelegate.js');

// The shape of the AppDelegate.swift `expo prebuild` writes (SDK 53 and later).
const EXPO_SWIFT = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

const OBJC = `#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

@end
`;

test('a Swift AppDelegate gets the method inside the class and the import after the others', () => {
    const out = addToSwiftAppDelegate(EXPO_SWIFT);
    assert.ok(out.includes(MARKER));
    assert.match(out, /import ReactAppDependencyProvider\nimport react_native_blob_util\n/);
    const classAt = out.indexOf('public class AppDelegate: ExpoAppDelegate {');
    const methodAt = out.indexOf('handleEventsForBackgroundURLSession identifier: String');
    assert.ok(classAt >= 0 && methodAt > classAt, 'inside the class');
    assert.match(out, /ReactNativeBlobUtilBackground\.handleEvents\(forBackgroundURLSession: identifier, completionHandler: completionHandler\)/);
    assert.match(out, /super\.application\(application, handleEventsForBackgroundURLSession: identifier/);
    // The rest of the file is unchanged.
    assert.ok(out.includes(EXPO_SWIFT.slice(EXPO_SWIFT.indexOf('  var window'))));
});

test('an Objective-C AppDelegate gets the method before @end and the Swift header', () => {
    const out = addToObjcAppDelegate(OBJC);
    assert.ok(out.includes(MARKER));
    assert.ok(out.indexOf('handleEventsForBackgroundURLSession:(NSString *)identifier') < out.lastIndexOf('@end'));
    assert.match(out, /#import <React\/RCTBundleURLProvider.h>\n#if __has_include\(<react_native_blob_util\/react_native_blob_util-Swift.h>\)/);
    assert.match(out, /\[ReactNativeBlobUtilBackground handleEventsForBackgroundURLSession:identifier completionHandler:completionHandler\]/);
});

test('running the change twice, or on an AppDelegate that has the method, changes nothing', () => {
    const once = addToSwiftAppDelegate(EXPO_SWIFT);
    assert.equal(addToSwiftAppDelegate(once), once);
    assert.equal(addToObjcAppDelegate(addToObjcAppDelegate(OBJC)), addToObjcAppDelegate(OBJC));
    const own = EXPO_SWIFT.replace('  var window', '  func application(_ a: UIApplication, handleEventsForBackgroundURLSession i: String, completionHandler c: @escaping () -> Void) {}\n  var window');
    assert.equal(addToSwiftAppDelegate(own), own);
});

test('a file without an AppDelegate class is left as it is', () => {
    assert.equal(addToSwiftAppDelegate('import UIKit\n'), 'import UIKit\n');
    assert.equal(addToObjcAppDelegate('#import "X.h"\n'), '#import "X.h"\n');
});
