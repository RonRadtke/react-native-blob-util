package com.ReactNativeBlobUtil;

import androidx.annotation.Nullable;

import com.facebook.react.TurboReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.HashMap;
import java.util.Map;

public class ReactNativeBlobUtilPackage extends TurboReactPackage {

    @Nullable
    @Override
    public NativeModule getModule(String name, ReactApplicationContext reactContext) {
        if (name.equals(ReactNativeBlobUtilImpl.NAME)) {
            return new ReactNativeBlobUtil(reactContext);
        } else {
            return null;
        }
    }

    @Override
    public ReactModuleInfoProvider getReactModuleInfoProvider() {
        return () -> {
            final Map<String, ReactModuleInfo> moduleInfos = new HashMap<>();
            boolean isTurboModule = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
            moduleInfos.put(
                    ReactNativeBlobUtilImpl.NAME,
                    new ReactModuleInfo(
                            ReactNativeBlobUtilImpl.NAME,
                            ReactNativeBlobUtilImpl.NAME,
                            false, // canOverrideExistingModule
                            false, // needsEagerInit
                            true,
                            false, // isCxxModule
                            isTurboModule // isTurboModule
                    ));
            return moduleInfos;
        };
    }

}
