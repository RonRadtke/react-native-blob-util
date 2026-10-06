// swift-tools-version: 6.0
import PackageDescription

// Swift Package Manager support for React Native's SwiftPM autolinking
// (react-native >= 0.87). CocoaPods is untouched and stays the source of truth
// for the pod build; see react-native-blob-util.podspec.
//
// Three targets, because SwiftPM cannot compile Swift and C-family sources in
// one. The split is a DAG, not the cycle React Native's autolinker assumes for
// mixed libraries:
//
//   ReactNativeBlobUtilObjC   the leaf: the file transformer, the Objective-C
//                             exception boundary, and the two protocols the
//                             adapter and the core talk across. Imports neither
//                             React nor Swift.
//   ReactNativeBlobUtilCore   the Swift implementation. Consumes the leaf.
//   ReactNativeBlobUtil       the adapter: the only file that touches React and
//                             the codegen protocol. Consumes the leaf, and
//                             reaches the core through the leaf's protocol
//                             rather than through Swift's generated header,
//                             which a C-family target in a sibling SwiftPM
//                             target cannot see.
//
// The two React packages are resolved by the autolinker relative to
// build/generated/autolinking/libs/ReactNativeBlobUtil in the app - the symlink
// it creates for every autolinked library, self-managed ones included - so
// these relative paths are fixed, not specific to one app layout.
let package = Package(
    name: "ReactNativeBlobUtil",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "ReactNativeBlobUtil",
            targets: ["ReactNativeBlobUtil", "ReactNativeBlobUtilCore", "ReactNativeBlobUtilObjC"]
        ),
    ],
    dependencies: [
        .package(name: "ReactNative", path: "../../../../xcframeworks"),
        .package(name: "React-GeneratedCode", path: "../../../ios"),
    ],
    targets: [
        // Its own directory on purpose. With the whole of ios/ as the target
        // path, publicHeadersPath sweeps the adapter's header into this
        // module's umbrella, and that header imports React - which is not
        // modular from here, so the module fails to build with
        // "'RCTBridgeModule.h' file not found". `exclude:` does not prune the
        // umbrella scan; only a narrower directory does.
        .target(
            name: "ReactNativeBlobUtilObjC",
            path: "ios/ReactNativeBlobUtilObjC",
            publicHeadersPath: "."
        ),
        .target(
            name: "ReactNativeBlobUtilCore",
            dependencies: ["ReactNativeBlobUtilObjC"],
            path: "ios",
            sources: [
                "ReactNativeBlobUtilConst.swift",
                "ReactNativeBlobUtilFS.swift",
                "ReactNativeBlobUtilLog.swift",
                "ReactNativeBlobUtilModuleCore.swift",
                "ReactNativeBlobUtilNetwork.swift",
                "ReactNativeBlobUtilProgress.swift",
                "ReactNativeBlobUtilReqBuilder.swift",
                "ReactNativeBlobUtilRequest.swift",
            ],
            resources: [.copy("PrivacyInfo.xcprivacy")],
            // The podspec pins swift_version 5.0. swift-tools-version 6.0 would
            // otherwise put this target in Swift 6 language mode, where the
            // module's shared mutable statics (fileStreams, warningHandler,
            // Network.shared) are hard errors rather than warnings. Keeping the
            // two builds on one language mode keeps them honest about each other.
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .target(
            name: "ReactNativeBlobUtil",
            dependencies: [
                "ReactNativeBlobUtilObjC",
                "ReactNativeBlobUtilCore",
                .product(name: "ReactHeaders", package: "ReactNative"),
                .product(name: "ReactNativeHeaders", package: "ReactNative"),
                .product(name: "ReactNativeDependenciesHeaders", package: "ReactNative"),
                .product(name: "ReactAppHeaders", package: "React-GeneratedCode"),
            ],
            path: "ios/ReactNativeBlobUtil",
            publicHeadersPath: ".",
            linkerSettings: [
                .linkedFramework("UIKit"),
                .linkedFramework("Foundation"),
                .linkedFramework("Photos"),
            ]
        ),
    ],
    cxxLanguageStandard: .cxx20
)
