import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import react_native_blob_util

@main
class AppDelegate: RCTAppDelegate {
  // react-native-blob-util: background downloads that end while the app is not
  // running. iOS relaunches the app to hand their events over, and they are
  // lost unless they are passed on here. The Expo config plugin writes the same
  // method into an Expo app's AppDelegate.
  override func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    if !ReactNativeBlobUtilBackground.handleEvents(forBackgroundURLSession: identifier, completionHandler: completionHandler) {
      super.application(application, handleEventsForBackgroundURLSession: identifier, completionHandler: completionHandler)
    }
  }

  override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey : Any]? = nil) -> Bool {
    self.moduleName = "ReactNativeBlobUtilE2E"
    self.dependencyProvider = RCTAppDependencyProvider()

    // You can add your custom initial props in the dictionary below.
    // They will be passed down to the ViewController used by React Native.
    self.initialProps = [:]

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
