package com.ReactNativeBlobUtil

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class ReactNativeBlobUtilPackage : BaseReactPackage() {

    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
        return if (name == ReactNativeBlobUtilImpl.NAME) {
            ReactNativeBlobUtil(reactContext)
        } else {
            null
        }
    }

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
        val moduleInfos: MutableMap<String, ReactModuleInfo> = HashMap()
        val isTurboModule = true // New Architecture only
        moduleInfos[ReactNativeBlobUtilImpl.NAME] = ReactModuleInfo(
            ReactNativeBlobUtilImpl.NAME,
            ReactNativeBlobUtilImpl.NAME,
            false, // canOverrideExistingModule
            false, // needsEagerInit
            false, // isCxxModule
            isTurboModule, // isTurboModule
        )
        moduleInfos
    }

}
