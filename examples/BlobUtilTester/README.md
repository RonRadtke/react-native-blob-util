# React Native Blob Util Tester

This is a project you can use to test react-native-blob-util's functionality.

Make sure you're in the example project's directory:

```
cd examples/BlobUtilTester
```

Install dependencies:

```
npm install
cd ios && pod install
```

Then go to the root directory. We need to link the local project so that we can

```
npm link
```

Then go back to BlobUtilTester and install the local version of the library:

```
npm link react-native-blob-util
```

Now you can start the example app. Run this in one terminal:

```
npm start
```

And then build the app on a simulator. For iOS, use this:

```
npm run ios
```

And for Android, use this:

```
npm run android
```
