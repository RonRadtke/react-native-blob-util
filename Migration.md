# Migrating to 0.26

0.26.0 rewrites the native layers: Android moves from Java to Kotlin, and iOS from
Objective-C++ to Swift. Windows stays C++. The JavaScript API does not change. Before
the old Android and iOS code was removed, the new code was checked call by call against
recordings of how 0.25 behaved on the same device.

Most apps only need to meet the new requirements below.

## Requirements

| | 0.25 | 0.26 |
|---|---|---|
| React Native architecture | Old or New | **New Architecture only** |
| React Native | 0.76 and up | 0.84 and up (tested on 0.84 and the newest release) |
| Android `minSdk` | the app's (library fallback 16) | 24 |
| Android build | Java 8 bytecode | Java 17 bytecode, Kotlin compiled with the app's Kotlin setup |
| iOS deployment target | 11.0 | 15.1 |
| Xcode | | 16.1 or newer |
| iOS integration | CocoaPods or the bundled Xcode project | CocoaPods only |

If your app still runs on the Old Architecture, stay on 0.25 until it moves to the New
Architecture.

## Android

Apps that follow the README don't need to change anything.

- `ReactNativeBlobUtilUtils.sharedTrustManager` is still a static field. Java and
  Kotlin code that sets it compiles unchanged.
- `ReactNativeBlobUtilFileTransformer` stays a Java class, so existing
  `FileTransformer` implementations in Java or Kotlin keep compiling, whatever
  nullability a Kotlin implementation declared.
- `ReactNativeBlobUtilPackage` keeps its name and no-argument constructor, for apps
  that register it by hand.
- The library no longer applies `kotlin-android` when the app already provides Kotlin
  (AGP 9 with `android.builtInKotlin=true`).
- The library no longer depends on `commons-lang3`. If your app used it without
  declaring it, add it to your own dependencies.
- `ReactNativeBlobUtilReq.enableTls12OnPreLollipop` returns the builder unchanged.
  It only ever did something on Android 4.1 to 4.4, which `minSdk` 24 excludes.

Classes that were package-private in Java (`ReactNativeBlobUtilFS`,
`ReactNativeBlobUtilImpl`, `ReactNativeBlobUtilConfig`, `ReactNativeBlobUtilBody`) are
now `internal` Kotlin classes. Code outside the library couldn't use them before either.

## iOS

Apps that follow the README don't need to change anything.

- `ReactNativeBlobUtilFileTransformer.h` stays Objective-C. The `FileTransformer`
  protocol and `+setFileTransformer:` are unchanged and work from an Objective-C or a
  Swift `AppDelegate`.
- The pod now contains Swift (`swift_version` 5.0) and defines a module. CocoaPods
  handles this under static libraries, static frameworks and dynamic frameworks alike.
- The only public headers are `ReactNativeBlobUtilFileTransformer.h` and
  `ReactNativeBlobUtilExceptionCatch.h`. The other headers, including
  `ReactNativeBlobUtilConst.h`, are gone: those classes are Swift now. App code that
  imported them has to stop, and apps had no documented reason to.
- `ios/ReactNativeBlobUtil.xcodeproj` is deleted. It no longer matched the sources, so
  linking the library through that project stopped working long ago. Use CocoaPods.

## Windows

No changes.
