// swift-tools-version: 6.0
// AUTO-SCAFFOLDED by react-native spm scaffold — safe to edit & commit via patch-package.
// AUTO-SCAFFOLDED-VERSION: 19
// Cache slot: 0.87.1/dual-flavor
// Edit the contents below if needed and re-run `npx patch-package <dep-name>`
// to persist across `npm install`. To regenerate from the podspec, remove
// this file (or just this marker) and re-run `npx react-native spm scaffold`.
//
// Package references are plain relative paths, computed when this file was
// scaffolded. They stay correct because the file is re-scaffolded per app
// and cache slot, and any node_modules relayout reinstalls this package
// (dropping the file) anyway.

import PackageDescription

let package = Package(
    name: "ReactNativeBlobUtil",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "ReactNativeBlobUtil", targets: ["ReactNativeBlobUtil"]),
    ],
    dependencies: [
        .package(name: "ReactNative", path: "../../../../xcframeworks"),
        .package(name: "React-GeneratedCode", path: "../../../ios"),
    ],
    targets: [
        .target(
            name: "ReactNativeBlobUtil",
            dependencies: [.product(name: "ReactHeaders", package: "ReactNative"), .product(name: "ReactNativeHeaders", package: "ReactNative"), .product(name: "ReactNativeDependenciesHeaders", package: "ReactNative"), .product(name: "ReactAppHeaders", package: "React-GeneratedCode")],
            path: ".",
            sources: [
                "ios/ReactNativeBlobUtil/ReactNativeBlobUtil.h",
                "ios/ReactNativeBlobUtil/ReactNativeBlobUtil.mm",
                "ios/ReactNativeBlobUtilConst.h",
                "ios/ReactNativeBlobUtilConst.mm",
                "ios/ReactNativeBlobUtilFS.h",
                "ios/ReactNativeBlobUtilFS.mm",
                "ios/ReactNativeBlobUtilFileTransformer.h",
                "ios/ReactNativeBlobUtilFileTransformer.mm",
                "ios/ReactNativeBlobUtilNetwork.h",
                "ios/ReactNativeBlobUtilNetwork.mm",
                "ios/ReactNativeBlobUtilProgress.h",
                "ios/ReactNativeBlobUtilProgress.mm",
                "ios/ReactNativeBlobUtilReqBuilder.h",
                "ios/ReactNativeBlobUtilReqBuilder.mm",
                "ios/ReactNativeBlobUtilRequest.h",
                "ios/ReactNativeBlobUtilRequest.mm",
            ],
            publicHeadersPath: "ios",
            cSettings: [.headerSearchPath("ios/ReactNativeBlobUtil"), .headerSearchPath("ios"), .headerSearchPath("."), .unsafeFlags(["-include", "react-native-spm-prefix.h"])],
            cxxSettings: [.headerSearchPath("ios/ReactNativeBlobUtil"), .headerSearchPath("ios"), .headerSearchPath("."), .unsafeFlags(["-include", "react-native-spm-prefix.h"]), .unsafeFlags(["-DFOLLY_NO_CONFIG", "-DFOLLY_MOBILE=1", "-DFOLLY_USE_LIBCPP=1", "-Wno-comma", "-Wno-shorten-64-to-32", "-DRCT_NEW_ARCH_ENABLED=1"]), .define("DEBUG", .when(configuration: .debug)), .define("NDEBUG", .when(configuration: .release))],
            linkerSettings: [.linkedFramework("UIKit"), .linkedFramework("Foundation"), .linkedFramework("CoreGraphics"), .linkedFramework("Photos")]
        ),
    ],
    cxxLanguageStandard: .cxx20
)
