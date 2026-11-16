# File transformer

A file transformer changes the bytes on their way to and from storage, for example to encrypt
the files the library writes. The app implements it in native code and registers it once at
startup; the library calls it only where a call asks for it with `transform: true`.

## Where it runs

- `fs.readFile(path, {transform: true})`
- `fs.writeFile(path, data, {transform: true})`
- `config({transform: true})`, for a response written to a file
- `media.write(uri, path, {transform: true})` (Android)

`transform: true` cannot be combined with the `ascii` encoding. A download with `resumable` or
`background` cannot use it, since those write the file in parts or outside the app.

## The interface

- Android: [`ReactNativeBlobUtilFileTransformer.java`](../android/src/main/java/com/ReactNativeBlobUtil/ReactNativeBlobUtilFileTransformer.java)
- iOS: [`ReactNativeBlobUtilFileTransformer.h`](../ios/ReactNativeBlobUtilObjC/ReactNativeBlobUtilFileTransformer.h)

Both stay in Java and Objective-C on purpose, so implementations in Kotlin, Java, Swift or
Objective-C all compile against them. Windows has no file transformer; `transform: true` has
no effect there.

## Android

```kotlin
class MyCustomEncryptor : ReactNativeBlobUtilFileTransformer.FileTransformer {
    override fun onWriteFile(data: ByteArray): ByteArray = data // encrypt here
    override fun onReadFile(data: ByteArray): ByteArray = data  // decrypt here
}

class MainApplication : Application(), ReactApplication {
    override fun onCreate() {
        super.onCreate()
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = MyCustomEncryptor()
    }
}
```

```java
public class MainApplication extends Application implements ReactApplication {
    @Override
    public void onCreate() {
        super.onCreate();
        ReactNativeBlobUtilFileTransformer.sharedFileTransformer = new MyCustomEncryptor();
    }
}
```

## iOS

The protocol imports into Swift as `FileTransformer`; the class must inherit from `NSObject`, and
the methods take and return non-optional `Data`.

```swift
import react_native_blob_util

final class MyCustomEncryptor: NSObject, FileTransformer {
    func onWriteFile(_ data: Data) -> Data { data } // encrypt here
    func onReadFile(_ data: Data) -> Data { data }  // decrypt here
}

// in application(_:didFinishLaunchingWithOptions:)
ReactNativeBlobUtilFileTransformer.setFileTransformer(MyCustomEncryptor())
```

```objc
- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    [ReactNativeBlobUtilFileTransformer setFileTransformer:MyCustomEncryptor.new];
    // ...
}
```
