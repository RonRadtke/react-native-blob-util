package com.ReactNativeBlobUtil;

import androidx.annotation.Nullable;

import com.facebook.react.BaseReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.module.model.ReactModuleInfo;
import com.facebook.react.module.model.ReactModuleInfoProvider;

import java.util.HashMap;
import java.util.Map;

// trick autolinking till it is fixed on RN side
//public class ReactNativeBlobUtilPackage extends TurboReactPackage {
public class ReactNativeBlobUtilPackage extends BaseReactPackage {

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
            boolean isTurboModule = true; // New Architecture only
            moduleInfos.put(
                    ReactNativeBlobUtilImpl.NAME,
                    new ReactModuleInfo(
                            ReactNativeBlobUtilImpl.NAME,
                            ReactNativeBlobUtilImpl.NAME,
                            false, // canOverrideExistingModule
                            false, // needsEagerInit
                            false, // isCxxModule
                            isTurboModule // isTurboModule
                    ));
            return moduleInfos;
        };
    }

}
