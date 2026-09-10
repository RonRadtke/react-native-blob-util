package com.reactnativeblobutile2e

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import com.ReactNativeBlobUtil.ReactNativeBlobUtilUtils
import javax.net.ssl.X509TrustManager

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    SoLoader.init(this, OpenSourceMergedSoMapping)

    // `trusty: true` on Android requires the app to supply its own trust manager -
    // the library deliberately stopped shipping one (see the Self-Signed SSL section
    // of the README). The e2e app installs the documented trust-all manager so the
    // trusty regression test exercises the real, documented path.
    ReactNativeBlobUtilUtils.sharedTrustManager = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}

      override fun checkServerTrusted(chain: Array<java.security.cert.X509Certificate>, authType: String) {}

      override fun getAcceptedIssuers(): Array<java.security.cert.X509Certificate> = arrayOf()
    }
    if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
      // If you opted-in for the New Architecture, we load the native entry point for this app.
      load()
    }
  }
}
